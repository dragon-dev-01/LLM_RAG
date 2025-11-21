"""
Initialize base models in the database
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src import db, create_app
from src.models import BaseModel
from datetime import datetime, timezone

app = create_app()

BASE_MODELS = [
    # LLM Models
    {"name": "Qwen2.5-7B", "model_type": "llm", "hf_model_id": "unsloth/Qwen2.5-7B-Instruct"},
    {"name": "Meta-Llama-3.1-8B", "model_type": "llm", "hf_model_id": "unsloth/Meta-Llama-3.1-8B-Instruct"},
    {"name": "DeepSeek-R1-Qwen-7B", "model_type": "llm", "hf_model_id": "unsloth/DeepSeek-R1-Distill-Qwen-7B"},
    {"name": "Mistral-7B-Instruct-v0.3", "model_type": "llm", "hf_model_id": "unsloth/mistral-7b-instruct-v0.3"},
    {"name": "Phi-3.5-mini", "model_type": "llm", "hf_model_id": "unsloth/Phi-3.5-mini-instruct"},
    {"name": "Qwen2.5-3B", "model_type": "llm", "hf_model_id": "unsloth/Qwen2.5-3B-Instruct"},
    {"name": "Qwen2.5-1.5B", "model_type": "llm", "hf_model_id": "unsloth/Qwen2.5-1.5B-Instruct"},
    {"name": "SmolLM2-1.7B", "model_type": "llm", "hf_model_id": "unsloth/SmolLM2-1.7B-Instruct"},
    {"name": "Qwen2.5-Coder-7B-Instruct", "model_type": "llm", "hf_model_id": "unsloth/Qwen2.5-Coder-7B-Instruct"},
    {"name": "Qwen2.5-Math-7B-Instruct", "model_type": "llm", "hf_model_id": "unsloth/Qwen2.5-Math-7B-Instruct"},
    
    # VLM Models
    {"name": "Qwen2VL", "model_type": "vlm", "hf_model_id": "unsloth/Qwen2-VL-7B-Instruct"},
    {"name": "Qwen2VL-Mini", "model_type": "vlm", "hf_model_id": "unsloth/Qwen2-VL-2B-Instruct"},
    {"name": "Qwen2.5VL", "model_type": "vlm", "hf_model_id": "unsloth/Qwen2.5-VL-7B-Instruct"},
    {"name": "Phi3V", "model_type": "vlm", "hf_model_id": "microsoft/Phi-3-vision-128k-instruct"},
    {"name": "Phi3.5V", "model_type": "vlm", "hf_model_id": "microsoft/Phi-3.5-vision-instruct"},
    {"name": "Llama3.2V", "model_type": "vlm", "hf_model_id": "unsloth/Llama-3.2-11B-Vision-bnb-4bit"},
    {"name": "Llava1.5", "model_type": "vlm", "hf_model_id": "unsloth/llava-v1.6-mistral-7b-hf"},
    {"name": "Llava1.6-Mistral", "model_type": "vlm", "hf_model_id": "unsloth/llava-v1.6-mistral-7b-hf"},
]

def init_base_models():
    """Initialize base models"""
    with app.app_context():
        for model_data in BASE_MODELS:
            existing = BaseModel.query.filter_by(name=model_data["name"]).first()
            if not existing:
                base_model = BaseModel(
                    name=model_data["name"],
                    model_type=model_data["model_type"],
                    hf_model_id=model_data["hf_model_id"],
                    created_at=datetime.now(tz=timezone.utc)
                )
                db.session.add(base_model)
                print(f"Added base model: {model_data['name']}")
            else:
                print(f"Base model already exists: {model_data['name']}")
        
        db.session.commit()
        print("Base models initialized successfully!")

if __name__ == "__main__":
    init_base_models()

