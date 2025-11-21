"""
Unified inference service with RAG, multi-tenant support, and dynamic LoRA
"""
import os
from typing import Optional, List, Dict
import numpy as np
from src.milvus_service import MilvusService
from src.vllm_service import vLLMService
from src.triton_service import TritonService
from src.lora_manager import LoRAManager
from src import db
from src.models import Model, BaseModel, PromptTemplate
try:
    from llama_index.embeddings.huggingface import HuggingFaceEmbedding
except ImportError:
    HuggingFaceEmbedding = None


class InferenceService:
    """Unified inference service with RAG and multi-tenant support"""
    
    def __init__(
        self,
        milvus: MilvusService,
        vllm: vLLMService,
        triton: TritonService,
        lora_manager: LoRAManager
    ):
        self.milvus = milvus
        self.vllm = vllm
        self.triton = triton
        self.lora_manager = lora_manager
        self.embed_model = None
    
    def _get_embed_model(self):
        """Lazy load embedding model"""
        if HuggingFaceEmbedding is None:
            raise ImportError("llama-index-embeddings-huggingface is required for RAG features")
        if self.embed_model is None:
            self.embed_model = HuggingFaceEmbedding(
                model_name="BAAI/bge-large-en-v1.5",
                device="cuda" if os.getenv("CUDA_AVAILABLE") == "true" else "cpu"
            )
        return self.embed_model
    
    def inference_llm(
        self,
        tenant_id: int,
        model_id: int,
        user_input: str,
        adapter_ids: Optional[List[int]] = None,
        use_rag: bool = False,
        temperature: float = 0.7,
        max_tokens: int = 1000,
        session_id: Optional[str] = None
    ) -> Dict:
        """
        Run LLM inference with optional RAG and LoRA adapters
        
        Args:
            tenant_id: Tenant ID
            model_id: Model ID
            user_input: User query
            adapter_ids: List of adapter IDs to use (can use multiple)
            use_rag: Whether to use RAG
            temperature: Sampling temperature
            max_tokens: Max tokens
            session_id: Session ID for conversation history
        
        Returns:
            Dict with result and optional context
        """
        # Get model
        model = Model.query.filter_by(id=model_id, tenant_id=tenant_id).first()
        if not model:
            raise ValueError(f"Model {model_id} not found for tenant {tenant_id}")
        
        base_model = BaseModel.query.get(model.base_model_id)
        if not base_model:
            raise ValueError("Base model not found")
        
        # Get prompt template
        prompt_template = PromptTemplate.query.filter_by(
            tenant_id=tenant_id,
            is_default=True
        ).first()
        
        system_prompt = ""
        if prompt_template:
            parts = []
            if prompt_template.agent_role:
                parts.append(prompt_template.agent_role)
            if prompt_template.specific_rules:
                parts.append(prompt_template.specific_rules)
            if prompt_template.business_info:
                parts.append(f"Business Information:\n{prompt_template.business_info}")
            system_prompt = "\n\n".join(parts)
        
        # RAG retrieval if enabled
        context = ""
        if use_rag:
            context = self._retrieve_context(tenant_id, user_input, top_k=3)
        
        # Build prompt
        if context:
            prompt = f"{system_prompt}\n\nContext:\n{context}\n\nUser: {user_input}\nAssistant:"
        else:
            prompt = f"{system_prompt}\n\nUser: {user_input}\nAssistant:" if system_prompt else user_input
        
        # Ensure base model is loaded
        model_name = self.lora_manager.ensure_base_model_loaded(model.base_model_id)
        
        # Load adapters if specified
        adapter_names = None
        if adapter_ids:
            adapter_names = self.lora_manager.load_adapters_for_inference(
                model_id=model_id,
                adapter_ids=adapter_ids
            )
        
        # Run inference
        result = self.vllm.inference(
            model_name=model_name,
            prompt=prompt,
            adapter_names=adapter_names,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=False
        )
        
        return {
            "result": result,
            "context": context if use_rag else None,
            "model_id": model_id,
            "adapters_used": adapter_names or []
        }
    
    def inference_llm_stream(
        self,
        tenant_id: int,
        model_id: int,
        user_input: str,
        adapter_ids: Optional[List[int]] = None,
        use_rag: bool = False,
        temperature: float = 0.7,
        max_tokens: int = 1000
    ):
        """Stream LLM inference"""
        # Similar to inference_llm but with streaming
        model = Model.query.filter_by(id=model_id, tenant_id=tenant_id).first()
        if not model:
            raise ValueError(f"Model {model_id} not found")
        
        base_model = BaseModel.query.get(model.base_model_id)
        if not base_model:
            raise ValueError("Base model not found")
        
        # Get prompt template
        prompt_template = PromptTemplate.query.filter_by(
            tenant_id=tenant_id,
            is_default=True
        ).first()
        
        system_prompt = ""
        if prompt_template:
            parts = []
            if prompt_template.agent_role:
                parts.append(prompt_template.agent_role)
            if prompt_template.specific_rules:
                parts.append(prompt_template.specific_rules)
            if prompt_template.business_info:
                parts.append(f"Business Information:\n{prompt_template.business_info}")
            system_prompt = "\n\n".join(parts)
        
        # RAG retrieval
        context = ""
        if use_rag:
            context = self._retrieve_context(tenant_id, user_input, top_k=3)
        
        # Build prompt
        if context:
            prompt = f"{system_prompt}\n\nContext:\n{context}\n\nUser: {user_input}\nAssistant:"
        else:
            prompt = f"{system_prompt}\n\nUser: {user_input}\nAssistant:" if system_prompt else user_input
        
        # Ensure base model loaded
        model_name = self.lora_manager.ensure_base_model_loaded(model.base_model_id)
        
        # Load adapters
        adapter_names = None
        if adapter_ids:
            adapter_names = self.lora_manager.load_adapters_for_inference(
                model_id=model_id,
                adapter_ids=adapter_ids
            )
        
        # Stream inference
        for chunk in self.vllm.inference(
            model_name=model_name,
            prompt=prompt,
            adapter_names=adapter_names,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=True
        ):
            yield chunk
    
    def inference_vlm(
        self,
        tenant_id: int,
        model_id: int,
        image_data: bytes,
        text_prompt: str,
        temperature: float = 0.7,
        max_tokens: int = 500
    ) -> str:
        """Run VLM inference using Triton"""
        model = Model.query.filter_by(id=model_id, tenant_id=tenant_id).first()
        if not model:
            raise ValueError(f"Model {model_id} not found")
        
        base_model = BaseModel.query.get(model.base_model_id)
        if not base_model:
            raise ValueError("Base model not found")
        
        # Use Triton for VLM
        from PIL import Image
        import io
        image = Image.open(io.BytesIO(image_data)).convert("RGB")
        
        result = self.triton.inference(
            model_name=base_model.name,
            image=image,
            text_prompt=text_prompt,
            temperature=temperature,
            max_tokens=max_tokens
        )
        
        return result
    
    def _retrieve_context(self, tenant_id: int, query: str, top_k: int = 3) -> str:
        """Retrieve context from Milvus"""
        # Compute query embedding
        embed_model = self._get_embed_model()
        query_embedding = np.array([embed_model.get_text_embedding(query)])
        
        # Search Milvus
        results = self.milvus.search(
            tenant_id=tenant_id,
            query_embedding=query_embedding[0],
            top_k=top_k
        )
        
        # Format context
        if results:
            context_parts = []
            for r in results:
                context_parts.append(r["text"])
            return "\n\n".join(context_parts)
        
        return ""

