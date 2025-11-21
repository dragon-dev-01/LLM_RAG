"""
vLLM service for dynamic LLM model serving with LoRA adapter support
"""
import os
import requests
import json
from typing import List, Optional, Dict
try:
    from openai import OpenAI
except ImportError:
    # Fallback for older openai versions
    OpenAI = None


class vLLMService:
    """Service for managing vLLM inference with dynamic LoRA loading"""
    
    def __init__(self, base_url: str = None):
        self.base_url = base_url or os.getenv("VLLM_BASE_URL", "http://localhost:8000")
        if OpenAI:
            self.client = OpenAI(
                base_url=f"{self.base_url}/v1",
                api_key="dummy"  # vLLM doesn't require auth by default
            )
        else:
            self.client = None
        self.loaded_models = {}  # Track loaded base models
        self.loaded_adapters = {}  # Track loaded adapters per model
    
    def load_base_model(self, model_name: str, model_path: str) -> bool:
        """
        Load a base model in vLLM
        
        Args:
            model_name: Name identifier for the model
            model_path: HuggingFace model path or local path
        
        Returns:
            True if successful
        """
        try:
            # vLLM API endpoint for loading models
            response = requests.post(
                f"{self.base_url}/v1/models/load",
                json={
                    "model": model_name,
                    "model_path": model_path,
                    "enable_lora": True,  # Enable LoRA support
                    "max_lora_rank": 64
                },
                timeout=300
            )
            
            if response.status_code == 200:
                self.loaded_models[model_name] = model_path
                return True
            else:
                print(f"Failed to load model: {response.text}")
                return False
        except Exception as e:
            print(f"Error loading model {model_name}: {e}")
            return False
    
    def load_lora_adapter(
        self,
        model_name: str,
        adapter_name: str,
        adapter_path: str
    ) -> bool:
        """
        Load a LoRA adapter for a model
        
        Args:
            model_name: Base model name
            adapter_name: Adapter identifier
            adapter_path: Path to adapter weights
        
        Returns:
            True if successful
        """
        try:
            response = requests.post(
                f"{self.base_url}/v1/adapters/load",
                json={
                    "model": model_name,
                    "adapter_name": adapter_name,
                    "adapter_path": adapter_path
                },
                timeout=60
            )
            
            if response.status_code == 200:
                if model_name not in self.loaded_adapters:
                    self.loaded_adapters[model_name] = {}
                self.loaded_adapters[model_name][adapter_name] = adapter_path
                return True
            else:
                print(f"Failed to load adapter: {response.text}")
                return False
        except Exception as e:
            print(f"Error loading adapter {adapter_name}: {e}")
            return False
    
    def unload_lora_adapter(self, model_name: str, adapter_name: str) -> bool:
        """Unload a LoRA adapter"""
        try:
            response = requests.post(
                f"{self.base_url}/v1/adapters/unload",
                json={
                    "model": model_name,
                    "adapter_name": adapter_name
                },
                timeout=30
            )
            return response.status_code == 200
        except Exception as e:
            print(f"Error unloading adapter: {e}")
            return False
    
    def inference(
        self,
        model_name: str,
        prompt: str,
        adapter_names: Optional[List[str]] = None,
        temperature: float = 0.7,
        max_tokens: int = 1000,
        stream: bool = False
    ):
        """
        Run inference with optional LoRA adapters
        
        Args:
            model_name: Base model name
            prompt: Input prompt
            adapter_names: List of adapter names to use (can use multiple)
            temperature: Sampling temperature
            max_tokens: Max tokens to generate
            stream: Whether to stream response
        
        Returns:
            Generated text or stream
        """
        # Build adapter header if needed
        headers = {}
        if adapter_names:
            headers["X-LoRA-Adapters"] = ",".join(adapter_names)
        
        try:
            if stream:
                return self._stream_inference(
                    model_name, prompt, adapter_names, temperature, max_tokens
                )
            else:
                response = self.client.chat.completions.create(
                    model=model_name,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=temperature,
                    max_tokens=max_tokens,
                    extra_headers=headers
                )
                return response.choices[0].message.content
        except Exception as e:
            print(f"Error in inference: {e}")
            raise
    
    def _stream_inference(
        self,
        model_name: str,
        prompt: str,
        adapter_names: Optional[List[str]],
        temperature: float,
        max_tokens: int
    ):
        """Stream inference"""
        headers = {}
        if adapter_names:
            headers["X-LoRA-Adapters"] = ",".join(adapter_names)
        
        stream = self.client.chat.completions.create(
            model=model_name,
            messages=[{"role": "user", "content": prompt}],
            temperature=temperature,
            max_tokens=max_tokens,
            stream=True,
            extra_headers=headers
        )
        
        for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
    
    def list_loaded_models(self) -> List[str]:
        """List currently loaded models"""
        try:
            response = requests.get(f"{self.base_url}/v1/models", timeout=10)
            if response.status_code == 200:
                data = response.json()
                return [m["id"] for m in data.get("data", [])]
            return []
        except:
            return list(self.loaded_models.keys())

