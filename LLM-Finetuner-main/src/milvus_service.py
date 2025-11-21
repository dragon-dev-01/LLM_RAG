"""
MilvusDB service for vector storage and retrieval
"""
from pymilvus import (
    connections,
    Collection,
    FieldSchema,
    CollectionSchema,
    DataType,
    utility,
    MilvusException
)
from typing import List, Dict, Optional
import numpy as np
import hashlib
import os


class MilvusService:
    """Service for managing MilvusDB collections and operations"""
    
    def __init__(self, host: str = None, port: int = None):
        self.host = host or os.getenv("MILVUS_HOST", "localhost")
        self.port = port or int(os.getenv("MILVUS_PORT", "19530"))
        self.collection_name = "rag_vectors"
        self.dimension = 1024  # BAAI/bge-large-en-v1.5 embedding dimension
        self._connected = False
        
    def connect(self):
        """Connect to Milvus"""
        if not self._connected:
            try:
                connections.connect(
                    alias="default",
                    host=self.host,
                    port=self.port
                )
                self._connected = True
            except Exception as e:
                raise Exception(f"Failed to connect to Milvus: {e}")
    
    def disconnect(self):
        """Disconnect from Milvus"""
        if self._connected:
            try:
                connections.disconnect("default")
                self._connected = False
            except:
                pass
    
    def create_collection_if_not_exists(self):
        """Create collection with schema if it doesn't exist"""
        self.connect()
        
        if utility.has_collection(self.collection_name):
            return
        
        # Define schema
        fields = [
            FieldSchema(name="id", dtype=DataType.INT64, is_primary=True, auto_id=True),
            FieldSchema(name="tenant_id", dtype=DataType.INT64),
            FieldSchema(name="document_id", dtype=DataType.INT64),
            FieldSchema(name="chunk_index", dtype=DataType.INT64),
            FieldSchema(name="chunk_version", dtype=DataType.INT64),
            FieldSchema(name="content_hash", dtype=DataType.VARCHAR, max_length=64),
            FieldSchema(name="text", dtype=DataType.VARCHAR, max_length=65535),
            FieldSchema(name="source", dtype=DataType.VARCHAR, max_length=512),
            FieldSchema(name="metadata", dtype=DataType.JSON),
            FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=self.dimension),
        ]
        
        schema = CollectionSchema(
            fields=fields,
            description="RAG vector store with tenant isolation"
        )
        
        collection = Collection(
            name=self.collection_name,
            schema=schema,
            using="default"
        )
        
        # Create index on embedding field
        index_params = {
            "metric_type": "L2",
            "index_type": "IVF_FLAT",
            "params": {"nlist": 1024}
        }
        collection.create_index(
            field_name="embedding",
            index_params=index_params
        )
        
        # Create index on tenant_id for filtering
        collection.create_index(
            field_name="tenant_id",
            index_params={"index_type": "STL_SORT"}
        )
        
        print(f"Created collection: {self.collection_name}")
    
    def get_collection(self) -> Collection:
        """Get collection instance"""
        self.connect()
        if not utility.has_collection(self.collection_name):
            self.create_collection_if_not_exists()
        return Collection(self.collection_name)
    
    def compute_content_hash(self, text: str) -> str:
        """Compute hash of content for change detection"""
        return hashlib.sha256(text.encode('utf-8')).hexdigest()
    
    def insert_chunks(
        self,
        tenant_id: int,
        document_id: int,
        chunks: List[Dict],
        chunk_version: int = 1,
        embeddings: Optional[np.ndarray] = None
    ) -> List[int]:
        """
        Insert chunks into Milvus
        
        Args:
            tenant_id: Tenant ID
            document_id: Document ID
            chunks: List of chunk dicts with 'text', 'source', 'metadata', 'chunk_index'
            chunk_version: Version number for this batch
            embeddings: Pre-computed embeddings (optional)
        
        Returns:
            List of inserted IDs
        """
        collection = self.get_collection()
        collection.load()
        
        # Prepare data
        data = []
        for i, chunk in enumerate(chunks):
            content_hash = self.compute_content_hash(chunk['text'])
            
            # Check if chunk already exists with same hash
            # (We'll handle updates by inserting new version)
            
            data.append({
                "tenant_id": tenant_id,
                "document_id": document_id,
                "chunk_index": chunk.get('chunk_index', i),
                "chunk_version": chunk_version,
                "content_hash": content_hash,
                "text": chunk['text'][:65535],  # Truncate if too long
                "source": chunk.get('source', '')[:512],
                "metadata": chunk.get('metadata', {}),
                "embedding": embeddings[i].tolist() if embeddings is not None else None
            })
        
        # Insert in batches
        batch_size = 1000
        inserted_ids = []
        
        for i in range(0, len(data), batch_size):
            batch = data[i:i + batch_size]
            batch_embeddings = None
            if embeddings is not None:
                batch_embeddings = embeddings[i:i + batch_size]
            
            # Prepare data for insertion
            insert_data = []
            for item in batch:
                if batch_embeddings is not None:
                    item['embedding'] = batch_embeddings[item['chunk_index'] - batch[0]['chunk_index']].tolist()
                insert_data.append(item)
            
            result = collection.insert(insert_data)
            inserted_ids.extend(result.primary_keys)
        
        collection.flush()
        return inserted_ids
    
    def search(
        self,
        tenant_id: int,
        query_embedding: np.ndarray,
        top_k: int = 5,
        filters: Optional[Dict] = None
    ) -> List[Dict]:
        """
        Search for similar chunks
        
        Args:
            tenant_id: Tenant ID for filtering
            query_embedding: Query embedding vector
            top_k: Number of results
            filters: Additional filters (e.g., {"document_id": 123})
        
        Returns:
            List of search results with text, source, metadata, score
        """
        collection = self.get_collection()
        collection.load()
        
        # Build filter expression
        expr = f"tenant_id == {tenant_id}"
        if filters:
            for key, value in filters.items():
                if isinstance(value, list):
                    expr += f" && {key} in {value}"
                else:
                    expr += f" && {key} == {value}"
        
        # Search
        search_params = {
            "metric_type": "L2",
            "params": {"nprobe": 10}
        }
        
        results = collection.search(
            data=[query_embedding.tolist()],
            anns_field="embedding",
            param=search_params,
            limit=top_k,
            expr=expr,
            output_fields=["text", "source", "metadata", "chunk_version", "document_id"]
        )
        
        # Format results
        formatted_results = []
        for hits in results:
            for hit in hits:
                formatted_results.append({
                    "text": hit.entity.get("text"),
                    "source": hit.entity.get("source"),
                    "metadata": hit.entity.get("metadata", {}),
                    "score": hit.distance,
                    "document_id": hit.entity.get("document_id"),
                    "chunk_version": hit.entity.get("chunk_version")
                })
        
        return formatted_results
    
    def delete_document_chunks(self, tenant_id: int, document_id: int):
        """Delete all chunks for a document"""
        collection = self.get_collection()
        collection.load()
        
        expr = f"tenant_id == {tenant_id} && document_id == {document_id}"
        collection.delete(expr)
        collection.flush()
    
    def get_document_stats(self, tenant_id: int, document_id: int) -> Dict:
        """Get statistics for a document"""
        collection = self.get_collection()
        collection.load()
        
        expr = f"tenant_id == {tenant_id} && document_id == {document_id}"
        results = collection.query(
            expr=expr,
            output_fields=["chunk_index", "chunk_version"]
        )
        
        if not results:
            return {"chunk_count": 0, "latest_version": 0}
        
        versions = [r.get("chunk_version", 1) for r in results]
        return {
            "chunk_count": len(results),
            "latest_version": max(versions) if versions else 0
        }

