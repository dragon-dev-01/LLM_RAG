"""
Dynamic LoRA adapter management and hot-swapping
"""
import os
import shutil
from typing import List, Optional, Dict
from pathlib import Path
import threading
from src import db
from src.models import LoRAAdapter, Model, BaseModel
from src.vllm_service import vLLMService


class LoRAManager:
    """Manages LoRA adapters with hot-swapping capability"""
    
    def __init__(self, vllm_service: vLLMService):
        self.vllm = vllm_service
        self.adapter_cache = {}  # Cache for loaded adapters
        self.lock = threading.Lock()
        self.adapter_base_path = os.getenv("ADAPTER_BASE_PATH", "./adapters")
        Path(self.adapter_base_path).mkdir(parents=True, exist_ok=True)
    
    def get_adapter_path(self, adapter_id: int) -> str:
        """Get filesystem path for adapter"""
        return os.path.join(self.adapter_base_path, f"adapter_{adapter_id}")
    
    def save_adapter(
        self,
        adapter_id: int,
        adapter_weights_path: str
    ) -> str:
        """
        Save adapter weights to managed location
        
        Args:
            adapter_id: Adapter ID
            adapter_weights_path: Source path to adapter weights
        
        Returns:
            Managed adapter path
        """
        target_path = self.get_adapter_path(adapter_id)
        
        # Copy adapter weights
        if os.path.exists(adapter_weights_path):
            if os.path.exists(target_path):
                shutil.rmtree(target_path)
            shutil.copytree(adapter_weights_path, target_path)
        
        return target_path
    
    def load_adapters_for_inference(
        self,
        model_id: int,
        adapter_ids: List[int]
    ) -> List[str]:
        """
        Load adapters for a model (hot-swap)
        
        Args:
            model_id: Model ID
            adapter_ids: List of adapter IDs to load
        
        Returns:
            List of adapter names ready for inference
        """
        with self.lock:
            # Get model info
            model = Model.query.get(model_id)
            if not model:
                raise ValueError(f"Model {model_id} not found")
            
            base_model = BaseModel.query.get(model.base_model_id)
            if not base_model:
                raise ValueError(f"Base model {model.base_model_id} not found")
            
            # Get adapters
            adapters = LoRAAdapter.query.filter(
                LoRAAdapter.id.in_(adapter_ids),
                LoRAAdapter.model_id == model_id
            ).all()
            
            if len(adapters) != len(adapter_ids):
                raise ValueError("Some adapters not found")
            
            adapter_names = []
            for adapter in adapters:
                adapter_path = self.get_adapter_path(adapter.id)
                
                # Check if adapter is already loaded
                cache_key = f"{base_model.name}_{adapter.id}"
                if cache_key not in self.adapter_cache:
                    # Load adapter into vLLM
                    adapter_name = f"adapter_{adapter.id}"
                    success = self.vllm.load_lora_adapter(
                        model_name=base_model.name,
                        adapter_name=adapter_name,
                        adapter_path=adapter_path
                    )
                    
                    if success:
                        self.adapter_cache[cache_key] = adapter_name
                        adapter_names.append(adapter_name)
                    else:
                        raise Exception(f"Failed to load adapter {adapter.id}")
                else:
                    adapter_names.append(self.adapter_cache[cache_key])
            
            return adapter_names
    
    def unload_adapter(self, model_id: int, adapter_id: int):
        """Unload an adapter"""
        with self.lock:
            model = Model.query.get(model_id)
            if not model:
                return
            
            base_model = BaseModel.query.get(model.base_model_id)
            if not base_model:
                return
            
            cache_key = f"{base_model.name}_{adapter_id}"
            if cache_key in self.adapter_cache:
                adapter_name = self.adapter_cache[cache_key]
                self.vllm.unload_lora_adapter(base_model.name, adapter_name)
                del self.adapter_cache[cache_key]
    
    def ensure_base_model_loaded(self, base_model_id: int) -> str:
        """
        Ensure base model is loaded in vLLM
        
        Args:
            base_model_id: Base model ID
        
        Returns:
            Model name
        """
        base_model = BaseModel.query.get(base_model_id)
        if not base_model:
            raise ValueError(f"Base model {base_model_id} not found")
        
        if base_model.name not in self.vllm.loaded_models:
            # Load base model
            success = self.vllm.load_base_model(
                model_name=base_model.name,
                model_path=base_model.hf_model_id
            )
            
            if not success:
                raise Exception(f"Failed to load base model {base_model.name}")
            
            base_model.is_loaded = True
            db.session.commit()
        
        return base_model.name

