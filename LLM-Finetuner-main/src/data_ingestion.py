"""
Async data ingestion service with batch processing and versioning
"""
import asyncio
import os
import glob
import json
import hashlib
from typing import List, Dict, Optional
from datetime import datetime
from pathlib import Path
import aiofiles
from concurrent.futures import ThreadPoolExecutor
import numpy as np

try:
    from llama_index.core import Document, SimpleDirectoryReader
    from llama_index.core.node_parser import TokenTextSplitter
    from llama_index.embeddings.huggingface import HuggingFaceEmbedding
    from llama_index.readers.file.slides import PptxReader
    from llama_index.readers.file.tabular import CSVReader
    LLAMA_INDEX_AVAILABLE = True
except ImportError:
    LLAMA_INDEX_AVAILABLE = False
    Document = None
    SimpleDirectoryReader = None
    TokenTextSplitter = None
    HuggingFaceEmbedding = None
    PptxReader = None
    CSVReader = None
try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from webdriver_manager.chrome import ChromeDriverManager
    SELENIUM_AVAILABLE = True
except ImportError:
    SELENIUM_AVAILABLE = False
    webdriver = None
    Options = None
    Service = None
    By = None
    WebDriverWait = None
    ChromeDriverManager = None

try:
    from PIL import Image
    from pdf2image import convert_from_path
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False
    Image = None
    convert_from_path = None

import base64
try:
    from openai import OpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False
    OpenAI = None

import requests
try:
    from bs4 import BeautifulSoup
    BS4_AVAILABLE = True
except ImportError:
    BS4_AVAILABLE = False
    BeautifulSoup = None

from src.milvus_service import MilvusService
from src import db
from src.models import Document as DocModel


class DataIngestionService:
    """Async data ingestion service with batch processing"""
    
    def __init__(self, milvus_service: MilvusService):
        self.milvus = milvus_service
        self.embed_model = None
        self.executor = ThreadPoolExecutor(max_workers=4)
        self.ingestion_queue = asyncio.Queue()
        self.processing = False
        
    def _get_embed_model(self):
        """Lazy load embedding model"""
        if not LLAMA_INDEX_AVAILABLE:
            raise ImportError("llama-index packages are required for data ingestion")
        if self.embed_model is None:
            self.embed_model = HuggingFaceEmbedding(
                model_name="BAAI/bge-large-en-v1.5",
                device="cuda" if os.getenv("CUDA_AVAILABLE") == "true" else "cpu"
            )
        return self.embed_model
    
    async def queue_document(
        self,
        tenant_id: int,
        document_id: int,
        file_type: str,
        file_path: Optional[str] = None,
        source_url: Optional[str] = None
    ):
        """Queue a document for ingestion"""
        await self.ingestion_queue.put({
            "tenant_id": tenant_id,
            "document_id": document_id,
            "file_type": file_type,
            "file_path": file_path,
            "source_url": source_url,
            "timestamp": datetime.utcnow()
        })
    
    async def start_processing(self):
        """Start background processing loop"""
        if self.processing:
            return
        
        # Ensure we're using the correct event loop
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        
        self.processing = True
        
        while self.processing:
            try:
                # Get batch of documents
                batch = []
                while len(batch) < 10:  # Batch size
                    try:
                        item = await asyncio.wait_for(
                            self.ingestion_queue.get(),
                            timeout=1.0
                        )
                        batch.append(item)
                    except asyncio.TimeoutError:
                        break
                    except RuntimeError as e:
                        # Event loop closed or changed
                        if "attached to a different loop" in str(e):
                            print("⚠ Ingestion service: Event loop changed, restarting...")
                            self.processing = False
                            return
                        raise
                
                if batch:
                    await self._process_batch(batch)
                
                await asyncio.sleep(0.1)
            except RuntimeError as e:
                # Handle event loop issues gracefully
                if "attached to a different loop" in str(e) or "no running event loop" in str(e):
                    print("⚠ Ingestion service: Event loop issue, stopping...")
                    self.processing = False
                    break
                print(f"Error in ingestion loop: {e}")
                await asyncio.sleep(1)
            except Exception as e:
                print(f"Error in ingestion loop: {e}")
                await asyncio.sleep(1)
    
    async def _process_batch(self, batch: List[Dict]):
        """Process a batch of documents"""
        tasks = [self._process_document(item) for item in batch]
        await asyncio.gather(*tasks, return_exceptions=True)
    
    async def _process_document(self, doc_info: Dict):
        """Process a single document"""
        tenant_id = doc_info["tenant_id"]
        document_id = doc_info["document_id"]
        file_type = doc_info["file_type"]
        file_path = doc_info.get("file_path")
        source_url = doc_info.get("source_url")
        
        try:
            # Load document
            docs = await self._load_document(file_type, file_path, source_url)
            
            # Get existing chunks to detect changes
            existing_stats = self.milvus.get_document_stats(tenant_id, document_id)
            
            # Chunk documents
            chunks = await self._chunk_documents(docs, tenant_id, document_id)
            
            # Compute hashes for change detection
            chunk_hashes = [self.milvus.compute_content_hash(chunk['text']) for chunk in chunks]
            
            # Get existing chunk hashes for this document
            existing_hashes = set()
            if existing_stats["chunk_count"] > 0:
                # Query existing chunks to get their hashes
                collection = self.milvus.get_collection()
                collection.load()
                existing_chunks = collection.query(
                    expr=f"tenant_id == {tenant_id} && document_id == {document_id}",
                    output_fields=["content_hash", "chunk_index"]
                )
                existing_hashes = {c.get("content_hash") for c in existing_chunks}
            
            # Filter to only new/changed chunks
            new_chunks = []
            new_indices = []
            for i, (chunk, chunk_hash) in enumerate(zip(chunks, chunk_hashes)):
                if chunk_hash not in existing_hashes:
                    new_chunks.append(chunk)
                    new_indices.append(i)
            
            # Only process if there are new/changed chunks
            if new_chunks:
                new_version = existing_stats["latest_version"] + 1
                
                # Compute embeddings only for new chunks
                embeddings = await self._compute_embeddings(new_chunks)
                
                # Insert only new/changed chunks
                inserted_ids = self.milvus.insert_chunks(
                    tenant_id=tenant_id,
                    document_id=document_id,
                    chunks=new_chunks,
                    chunk_version=new_version,
                    embeddings=embeddings
                )
                
                # Update document status
                doc = DocModel.query.get(document_id)
                if doc:
                    doc.status = "ready"
                    doc.chunk_count = existing_stats["chunk_count"] + len(new_chunks)
                    doc.version = new_version
                    db.session.commit()
                
                print(f"Processed document {document_id}: {len(new_chunks)} new/changed chunks out of {len(chunks)} total, version {new_version}")
            else:
                # No changes detected
                doc = DocModel.query.get(document_id)
                if doc:
                    doc.status = "ready"
                    db.session.commit()
                print(f"Document {document_id}: No changes detected, skipping processing")
            
        except Exception as e:
            print(f"Error processing document {document_id}: {e}")
            doc = DocModel.query.get(document_id)
            if doc:
                doc.status = "failed"
                db.session.commit()
    
    async def _load_document(
        self,
        file_type: str,
        file_path: Optional[str],
        source_url: Optional[str]
    ) -> List[Document]:
        """Load document based on type"""
        loop = asyncio.get_event_loop()
        
        if file_type == "pdf":
            return await loop.run_in_executor(
                self.executor,
                self._load_pdf,
                file_path
            )
        elif file_type == "csv":
            return await loop.run_in_executor(
                self.executor,
                self._load_csv,
                file_path
            )
        elif file_type == "txt":
            return await loop.run_in_executor(
                self.executor,
                self._load_txt,
                file_path
            )
        elif file_type == "pptx":
            return await loop.run_in_executor(
                self.executor,
                self._load_pptx,
                file_path
            )
        elif file_type == "url":
            return await loop.run_in_executor(
                self.executor,
                self._load_url,
                source_url
            )
        elif file_type in ["image", "image_ocr", "image_desc", "image_tabular"]:
            return await loop.run_in_executor(
                self.executor,
                self._load_image,
                file_path,
                file_type
            )
        else:
            return []
    
    def _load_pdf(self, file_path: str) -> List[Document]:
        """Load PDF document"""
        if not LLAMA_INDEX_AVAILABLE or SimpleDirectoryReader is None:
            return []
        try:
            return SimpleDirectoryReader(input_files=[file_path]).load_data()
        except:
            return []
    
    def _load_csv(self, file_path: str) -> List[Document]:
        """Load CSV document"""
        if not LLAMA_INDEX_AVAILABLE or CSVReader is None:
            return []
        try:
            reader = CSVReader()
            return reader.load_data(file_path)
        except:
            return []
    
    def _load_txt(self, file_path: str) -> List[Document]:
        """Load text document"""
        if not LLAMA_INDEX_AVAILABLE or SimpleDirectoryReader is None:
            return []
        try:
            return SimpleDirectoryReader(input_files=[file_path]).load_data()
        except:
            return []
    
    def _load_pptx(self, file_path: str) -> List[Document]:
        """Load PPTX document"""
        if not LLAMA_INDEX_AVAILABLE or PptxReader is None:
            return []
        try:
            reader = PptxReader()
            return reader.load_data(file_path)
        except:
            return []
    
    def _load_url(self, url: str) -> List[Document]:
        """Load content from URL"""
        docs = []
        if not LLAMA_INDEX_AVAILABLE or Document is None:
            return docs
            
        try:
            # Try Selenium first if available
            if SELENIUM_AVAILABLE and webdriver and Options and Service:
                try:
                    chrome_options = Options()
                    chrome_options.binary_location = "/usr/bin/google-chrome"
                    chrome_options.add_argument("--headless=new")
                    chrome_options.add_argument("--no-sandbox")
                    chrome_options.add_argument("--disable-dev-shm-usage")
                    
                    driver = webdriver.Chrome(
                        service=Service(ChromeDriverManager().install()),
                        options=chrome_options
                    )
                    
                    try:
                        driver.get(url)
                        WebDriverWait(driver, 10).until(
                            lambda d: d.execute_script("return document.readyState") == "complete"
                        )
                        body_text = driver.find_element(By.TAG_NAME, "body").text.strip()
                        docs.append(Document(text=body_text, metadata={"source": url}))
                    finally:
                        driver.quit()
                except Exception as e:
                    print(f"Selenium failed for {url}: {e}, trying requests fallback")
        except Exception as e:
            print(f"Selenium not available or failed: {e}")
        
        # Fallback to requests/BeautifulSoup
        if not docs:
            try:
                headers = {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                }
                r = requests.get(url, headers=headers, timeout=15)
                if r.status_code == 200:
                    if BS4_AVAILABLE and BeautifulSoup:
                        soup = BeautifulSoup(r.text, "html.parser")
                        text = soup.get_text("\n", strip=True)
                    else:
                        # Basic text extraction without BeautifulSoup
                        import re
                        text = re.sub(r'<[^>]+>', '', r.text)
                        text = re.sub(r'\s+', ' ', text).strip()
                    docs.append(Document(text=text, metadata={"source": url}))
            except Exception as e:
                print(f"Failed to load URL {url}: {e}")
        
        return docs
    
    def _load_image(self, file_path: str, image_type: str) -> List[Document]:
        """Load and process image"""
        if not LLAMA_INDEX_AVAILABLE or Document is None:
            return []
        # This would use OCR or vision models
        # Simplified for now
        return [Document(text=f"Image content from {file_path}", metadata={"source": file_path})]
    
    async def _chunk_documents(
        self,
        docs: List[Document],
        tenant_id: int,
        document_id: int
    ) -> List[Dict]:
        """Chunk documents with tenant-specific settings"""
        if not LLAMA_INDEX_AVAILABLE or TokenTextSplitter is None:
            # Fallback: simple chunking without llama-index
            chunks = []
            for doc_idx, doc in enumerate(docs):
                # Simple text splitting
                text = doc.text if hasattr(doc, 'text') else str(doc)
                chunk_size = 4096
                for chunk_idx in range(0, len(text), chunk_size):
                    chunk_text = text[chunk_idx:chunk_idx + chunk_size]
                    chunks.append({
                        "text": chunk_text,
                        "source": doc.metadata.get("source", "") if hasattr(doc, 'metadata') else "",
                        "metadata": doc.metadata if hasattr(doc, 'metadata') else {},
                        "chunk_index": len(chunks)
                    })
            return chunks
        
        # Get chunking settings from tenant config (simplified for now)
        separator = " "
        chunk_size = 4096
        chunk_overlap = 50
        
        text_splitter = TokenTextSplitter(
            separator=separator,
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            backup_separators=["\n", "."]
        )
        
        chunks = []
        for doc_idx, doc in enumerate(docs):
            chunked_texts = text_splitter.split_text(doc.text)
            for chunk_idx, chunk_text in enumerate(chunked_texts):
                chunks.append({
                    "text": chunk_text,
                    "source": doc.metadata.get("source", ""),
                    "metadata": {
                        **doc.metadata,
                        "doc_index": doc_idx,
                        "chunk_index": chunk_idx
                    },
                    "chunk_index": len(chunks)
                })
        
        return chunks
    
    async def _compute_embeddings(self, chunks: List[Dict]) -> np.ndarray:
        """Compute embeddings for chunks"""
        loop = asyncio.get_event_loop()
        embed_model = self._get_embed_model()
        
        texts = [chunk["text"] for chunk in chunks]
        embeddings = await loop.run_in_executor(
            self.executor,
            lambda: embed_model.get_text_embedding_batch(texts)
        )
        
        return np.array(embeddings)
    
    def stop(self):
        """Stop processing"""
        self.processing = False

