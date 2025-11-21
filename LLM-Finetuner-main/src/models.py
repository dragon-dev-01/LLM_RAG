"""
Database models for multi-tenant LLM platform
"""
from sqlalchemy import Column, Integer, String, Text, Boolean, Float, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from src import db


class Tenant(db.Model):
    """Tenant/Organization model"""
    __tablename__ = 'tenants'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(tz=timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(tz=timezone.utc), onupdate=lambda: datetime.now(tz=timezone.utc))
    
    # Relationships
    users = relationship("User", back_populates="tenant")
    models = relationship("Model", back_populates="tenant")
    prompt_templates = relationship("PromptTemplate", back_populates="tenant")
    documents = relationship("Document", back_populates="tenant")


class User(db.Model):
    """User model with tenant association"""
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False)
    name = db.Column(db.String(255))
    picture = db.Column(db.String(255))
    tenant_id = db.Column(db.Integer, ForeignKey('tenants.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(tz=timezone.utc))
    
    # Relationships
    tenant = relationship("Tenant", back_populates="users")
    runs = relationship("Run", back_populates="user")


class BaseModel(db.Model):
    """Base model registry (shared across tenants)"""
    __tablename__ = 'base_models'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), unique=True, nullable=False)  # e.g., "Qwen2.5-7B"
    model_type = db.Column(db.String(50), nullable=False)  # "llm" or "vlm"
    hf_model_id = db.Column(db.String(255), nullable=False)  # HuggingFace model ID
    is_loaded = db.Column(db.Boolean, default=False)
    loaded_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(tz=timezone.utc))


class Model(db.Model):
    """Fine-tuned model instance (tenant-specific)"""
    __tablename__ = 'models'
    
    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, ForeignKey('tenants.id'), nullable=False)
    name = db.Column(db.String(255), nullable=False)
    base_model_id = db.Column(db.Integer, ForeignKey('base_models.id'), nullable=False)
    description = db.Column(db.Text)
    status = db.Column(db.String(50), default="pending")  # pending, training, ready, failed
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(tz=timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(tz=timezone.utc), onupdate=lambda: datetime.now(tz=timezone.utc))
    
    # Training parameters
    peft_r = db.Column(db.Integer, default=16)
    peft_alpha = db.Column(db.Integer, default=16)
    peft_dropout = db.Column(db.Float, default=0.0)
    
    # Relationships
    tenant = relationship("Tenant", back_populates="models")
    base_model = relationship("BaseModel")
    adapters = relationship("LoRAAdapter", back_populates="model")


class LoRAAdapter(db.Model):
    """LoRA adapter weights for a model"""
    __tablename__ = 'lora_adapters'
    
    id = db.Column(db.Integer, primary_key=True)
    model_id = db.Column(db.Integer, ForeignKey('models.id'), nullable=False)
    name = db.Column(db.String(255), nullable=False)
    adapter_path = db.Column(db.String(512), nullable=False)  # Path to adapter weights
    version = db.Column(db.Integer, default=1)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(tz=timezone.utc))
    
    # Relationships
    model = relationship("Model", back_populates="adapters")


class PromptTemplate(db.Model):
    """Prompt templates per tenant"""
    __tablename__ = 'prompt_templates'
    
    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, ForeignKey('tenants.id'), nullable=False)
    name = db.Column(db.String(255), nullable=False)
    system_prompt = db.Column(db.Text)
    agent_role = db.Column(db.Text)
    business_info = db.Column(db.Text)
    specific_rules = db.Column(db.Text)
    is_default = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(tz=timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(tz=timezone.utc), onupdate=lambda: datetime.now(tz=timezone.utc))
    
    # Relationships
    tenant = relationship("Tenant", back_populates="prompt_templates")


class Document(db.Model):
    """Document metadata for RAG"""
    __tablename__ = 'documents'
    
    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, ForeignKey('tenants.id'), nullable=False)
    name = db.Column(db.String(255), nullable=False)
    file_type = db.Column(db.String(50), nullable=False)  # pdf, csv, txt, image, url, pptx
    file_path = db.Column(db.String(512))
    source_url = db.Column(db.String(512))  # For website URLs
    status = db.Column(db.String(50), default="pending")  # pending, processing, ready, failed
    chunk_count = db.Column(db.Integer, default=0)
    version = db.Column(db.Integer, default=1)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(tz=timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(tz=timezone.utc), onupdate=lambda: datetime.now(tz=timezone.utc))
    
    # Relationships
    tenant = relationship("Tenant", back_populates="documents")


class Run(db.Model):
    """Training run tracking"""
    __tablename__ = 'runs'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, ForeignKey('users.id'), nullable=False)
    model_id = db.Column(db.Integer, ForeignKey('models.id'), nullable=True)
    status = db.Column(db.String(50), default="pending")  # pending, running, finished, failed
    description = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(tz=timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(tz=timezone.utc), onupdate=lambda: datetime.now(tz=timezone.utc))
    
    # Training parameters
    epochs = db.Column(db.Integer)
    learning_rate = db.Column(db.Float)
    warmup_ratio = db.Column(db.Float)
    optimizer = db.Column(db.String(100))
    gradient_accumulation_steps = db.Column(db.Integer)
    
    # Relationships
    user = relationship("User", back_populates="runs")
    model = relationship("Model")

