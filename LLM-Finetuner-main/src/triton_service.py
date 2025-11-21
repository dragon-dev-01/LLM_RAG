"""
Triton Inference Server service for VLM model serving
"""
import os
import requests
import json
import base64
from typing import Optional, Dict, List
from PIL import Image
import io


class TritonService:
    """Service for managing Triton Inference Server for VLM models"""
    
    def __init__(self, base_url: str = None):
        self.base_url = base_url or os.getenv("TRITON_BASE_URL", "http://localhost:8001")
        self.loaded_models = {}
    
    def load_model(self, model_name: str, model_path: str) -> bool:
        """
        Load a VLM model in Triton
        
        Args:
            model_name: Model identifier
            model_path: Path to model files
        
        Returns:
            True if successful
        """
        try:
            # Triton model repository management
            # This would typically be done via Triton's model repository
            # For API-based loading, we use Triton's HTTP API
            response = requests.post(
                f"{self.base_url}/v2/repository/models/{model_name}/load",
                json={"parameters": {"model_path": model_path}},
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
    
    def inference(
        self,
        model_name: str,
        image: Image.Image,
        text_prompt: str,
        temperature: float = 0.7,
        max_tokens: int = 500
    ) -> str:
        """
        Run VLM inference
        
        Args:
            model_name: Model name
            image: PIL Image
            text_prompt: Text prompt
            temperature: Sampling temperature
            max_tokens: Max tokens to generate
        
        Returns:
            Generated text
        """
        try:
            # Convert image to base64
            buffered = io.BytesIO()
            image.save(buffered, format="PNG")
            img_base64 = base64.b64encode(buffered.getvalue()).decode()
            
            # Prepare Triton inference request
            payload = {
                "inputs": [
                    {
                        "name": "image",
                        "shape": [1],
                        "datatype": "BYTES",
                        "data": [img_base64]
                    },
                    {
                        "name": "text",
                        "shape": [1],
                        "datatype": "BYTES",
                        "data": [text_prompt]
                    },
                    {
                        "name": "temperature",
                        "shape": [1],
                        "datatype": "FP32",
                        "data": [temperature]
                    },
                    {
                        "name": "max_tokens",
                        "shape": [1],
                        "datatype": "INT32",
                        "data": [max_tokens]
                    }
                ],
                "outputs": [{"name": "output"}]
            }
            
            response = requests.post(
                f"{self.base_url}/v2/models/{model_name}/infer",
                json=payload,
                timeout=120
            )
            
            if response.status_code == 200:
                result = response.json()
                outputs = result.get("outputs", [])
                if outputs:
                    return outputs[0].get("data", [""])[0]
            else:
                raise Exception(f"Triton inference failed: {response.text}")
                
        except Exception as e:
            print(f"Error in Triton inference: {e}")
            raise
    
    def inference_b64(
        self,
        model_name: str,
        image_b64: str,
        text_prompt: str,
        temperature: float = 0.7,
        max_tokens: int = 500
    ) -> str:
        """Run inference with base64 image"""
        # Decode image
        image_data = base64.b64decode(image_b64)
        image = Image.open(io.BytesIO(image_data)).convert("RGB")
        return self.inference(model_name, image, text_prompt, temperature, max_tokens)
    
    def list_loaded_models(self) -> List[str]:
        """List loaded models"""
        try:
            response = requests.get(f"{self.base_url}/v2/models", timeout=10)
            if response.status_code == 200:
                data = response.json()
                return [m["name"] for m in data]
            return []
        except:
            return list(self.loaded_models.keys())

