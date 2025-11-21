"""
New multi-tenant API without Docker-per-tenant architecture
"""
import os
import asyncio
from flask import Flask, request, jsonify, Response, send_file
from flask_cors import CORS
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from src import db, create_app
from src.models import (
    Tenant, User, BaseModel, Model, LoRAAdapter,
    PromptTemplate, Document, Run
)
from src.milvus_service import MilvusService
from src.vllm_service import vLLMService
from src.triton_service import TritonService
from src.lora_manager import LoRAManager
from src.inference_service import InferenceService
from src.data_ingestion import DataIngestionService
import threading
from werkzeug.utils import secure_filename
import uuid

app = create_app()
CORS(app)

# Initialize services
milvus_service = MilvusService()
vllm_service = vLLMService()
triton_service = TritonService()
lora_manager = LoRAManager(vllm_service)
inference_service = InferenceService(
    milvus_service, vllm_service, triton_service, lora_manager
)
ingestion_service = DataIngestionService(milvus_service)

# Start ingestion background task
ingestion_thread = None
ingestion_loop = None
_ingestion_lock = threading.Lock()

def start_ingestion_service():
    """Start background ingestion service"""
    global ingestion_thread, ingestion_loop
    
    # Skip if already running or in debug reload
    if ingestion_thread is not None and ingestion_thread.is_alive():
        return
    
    with _ingestion_lock:
        # Double-check after acquiring lock
        if ingestion_thread is not None and ingestion_thread.is_alive():
            return
        
        try:
            # Create new event loop for this thread
            ingestion_loop = asyncio.new_event_loop()
            
            def run_loop():
                asyncio.set_event_loop(ingestion_loop)
                try:
                    ingestion_loop.run_until_complete(ingestion_service.start_processing())
                except Exception as e:
                    print(f"⚠ Ingestion service error: {e}")
                finally:
                    ingestion_loop.close()
            
            ingestion_thread = threading.Thread(target=run_loop, daemon=True)
            ingestion_thread.start()
        except Exception as e:
            print(f"⚠ Warning: Failed to start ingestion service: {e}")
            ingestion_loop = None

# Initialize on startup
with app.app_context():
    try:
        milvus_service.create_collection_if_not_exists()
        print("✓ Milvus collection initialized")
    except Exception as e:
        print(f"⚠ Warning: Milvus not available: {e}")
        print("  The app will start but RAG features may not work until Milvus is running.")
    
    try:
        # Only start ingestion service if not in Flask debug reload
        # Flask's reloader causes event loop conflicts
        if not app.debug or os.getenv('WERKZEUG_RUN_MAIN') == 'true':
            start_ingestion_service()
            print("✓ Data ingestion service started")
        else:
            print("⚠ Ingestion service skipped (Flask debug reload)")
    except Exception as e:
        print(f"⚠ Warning: Failed to start ingestion service: {e}")

GOOGLE_CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID')


# ==================== Authentication ====================

@app.route('/api/login/google', methods=['POST'])
def google_login():
    """Google OAuth login with tenant creation"""
    data = request.get_json()
    token = data.get('credential')
    
    # Development mode: Bypass Google OAuth
    if os.getenv('BYPASS_LOGIN', 'false').lower() == 'true':
        # Create or get test user
        test_email = 'test@example.com'
        tenant = Tenant.query.filter_by(email=test_email).first()
        if not tenant:
            tenant = Tenant(name='Test Tenant', email=test_email)
            db.session.add(tenant)
            db.session.commit()
        
        user = User.query.filter_by(email=test_email).first()
        if not user:
            user = User(
                email=test_email,
                name='Test User',
                picture='/static/images/avatars/default.png',
                tenant_id=tenant.id
            )
            db.session.add(user)
        else:
            user.tenant_id = tenant.id
        
        db.session.commit()
        
        return jsonify({
            "message": "Login successful (dev mode)",
            "user": {
                "id": user.id,
                "email": test_email,
                "name": "Test User",
                "picture": "/static/images/avatars/default.png",
                "tenant_id": tenant.id
            }
        }), 200
    
    # Production mode: Use Google OAuth
    if not token:
        return jsonify({"error": "No credential token provided"}), 400
    
    if not GOOGLE_CLIENT_ID:
        return jsonify({"error": "Google OAuth not configured. Set GOOGLE_CLIENT_ID or BYPASS_LOGIN=true"}), 500
    
    try:
        idinfo = id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            GOOGLE_CLIENT_ID
        )
        
        user_email = idinfo.get('email')
        user_name = idinfo.get('name')
        user_picture = idinfo.get('picture')
        
        # Find or create tenant (one tenant per email for now)
        tenant = Tenant.query.filter_by(email=user_email).first()
        if not tenant:
            tenant = Tenant(name=user_name or user_email, email=user_email)
            db.session.add(tenant)
            db.session.commit()
        
        # Find or create user
        user = User.query.filter_by(email=user_email).first()
        if not user:
            user = User(
                email=user_email,
                name=user_name,
                picture=user_picture,
                tenant_id=tenant.id
            )
            db.session.add(user)
        else:
            user.name = user_name
            user.picture = user_picture
            user.tenant_id = tenant.id
        
        db.session.commit()
        
        return jsonify({
            "message": "Login successful",
            "user": {
                "id": user.id,
                "email": user_email,
                "name": user_name,
                "picture": user_picture,
                "tenant_id": tenant.id
            }
        }), 200
    
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 401
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ==================== Base Models ====================

@app.route('/api/base-models', methods=['GET'])
def list_base_models():
    """List all base models"""
    models = BaseModel.query.all()
    return jsonify([{
        "id": m.id,
        "name": m.name,
        "model_type": m.model_type,
        "hf_model_id": m.hf_model_id,
        "is_loaded": m.is_loaded
    } for m in models]), 200


@app.route('/api/base-models/<int:model_id>/load', methods=['POST'])
def load_base_model(model_id):
    """Load a base model"""
    base_model = BaseModel.query.get(model_id)
    if not base_model:
        return jsonify({"error": "Base model not found"}), 404
    
    if base_model.model_type == "llm":
        success = vllm_service.load_base_model(
            model_name=base_model.name,
            model_path=base_model.hf_model_id
        )
    else:  # vlm
        success = triton_service.load_model(
            model_name=base_model.name,
            model_path=base_model.hf_model_id
        )
    
    if success:
        base_model.is_loaded = True
        db.session.commit()
        return jsonify({"message": "Model loaded successfully"}), 200
    else:
        return jsonify({"error": "Failed to load model"}), 500


# ==================== Models (Tenant-specific) ====================

@app.route('/api/models', methods=['GET'])
def list_models():
    """List models for a tenant"""
    tenant_id = request.args.get('tenant_id', type=int)
    if not tenant_id:
        return jsonify({"error": "tenant_id required"}), 400
    
    models = Model.query.filter_by(tenant_id=tenant_id).all()
    return jsonify([{
        "id": m.id,
        "name": m.name,
        "base_model_id": m.base_model_id,
        "description": m.description,
        "status": m.status,
        "adapters": [{"id": a.id, "name": a.name} for a in m.adapters]
    } for m in models]), 200


@app.route('/api/models', methods=['POST'])
def create_model():
    """Create a new model"""
    data = request.get_json()
    tenant_id = data.get('tenant_id')
    name = data.get('name')
    base_model_id = data.get('base_model_id')
    description = data.get('description')
    
    if not all([tenant_id, name, base_model_id]):
        return jsonify({"error": "tenant_id, name, and base_model_id required"}), 400
    
    model = Model(
        tenant_id=tenant_id,
        name=name,
        base_model_id=base_model_id,
        description=description,
        peft_r=data.get('peft_r', 16),
        peft_alpha=data.get('peft_alpha', 16),
        peft_dropout=data.get('peft_dropout', 0.0)
    )
    db.session.add(model)
    db.session.commit()
    
    return jsonify({
        "id": model.id,
        "name": model.name,
        "status": model.status
    }), 201


# ==================== LoRA Adapters ====================

@app.route('/api/models/<int:model_id>/adapters', methods=['POST'])
def create_adapter(model_id):
    """Create/register a LoRA adapter"""
    data = request.get_json()
    name = data.get('name')
    adapter_path = data.get('adapter_path')
    
    if not name or not adapter_path:
        return jsonify({"error": "name and adapter_path required"}), 400
    
    model = Model.query.get(model_id)
    if not model:
        return jsonify({"error": "Model not found"}), 404
    
    # Save adapter to managed location
    adapter = LoRAAdapter(
        model_id=model_id,
        name=name,
        adapter_path=lora_manager.save_adapter(
            adapter_id=0,  # Will be set after commit
            adapter_weights_path=adapter_path
        ),
        version=1
    )
    db.session.add(adapter)
    db.session.commit()
    
    # Update adapter path with actual ID
    adapter.adapter_path = lora_manager.save_adapter(adapter.id, adapter_path)
    db.session.commit()
    
    return jsonify({
        "id": adapter.id,
        "name": adapter.name,
        "version": adapter.version
    }), 201


# ==================== Prompt Templates ====================

@app.route('/api/tenants/<int:tenant_id>/prompt-templates', methods=['GET'])
def get_prompt_templates(tenant_id):
    """Get prompt templates for a tenant"""
    templates = PromptTemplate.query.filter_by(tenant_id=tenant_id).all()
    return jsonify([{
        "id": t.id,
        "name": t.name,
        "system_prompt": t.system_prompt,
        "agent_role": t.agent_role,
        "business_info": t.business_info,
        "specific_rules": t.specific_rules,
        "is_default": t.is_default
    } for t in templates]), 200


@app.route('/api/tenants/<int:tenant_id>/prompt-templates', methods=['POST'])
def create_prompt_template(tenant_id):
    """Create/update prompt template"""
    data = request.get_json()
    
    template = PromptTemplate(
        tenant_id=tenant_id,
        name=data.get('name', 'Default'),
        system_prompt=data.get('system_prompt'),
        agent_role=data.get('agent_role'),
        business_info=data.get('business_info'),
        specific_rules=data.get('specific_rules'),
        is_default=data.get('is_default', False)
    )
    
    # If this is default, unset others
    if template.is_default:
        PromptTemplate.query.filter_by(
            tenant_id=tenant_id,
            is_default=True
        ).update({"is_default": False})
    
    db.session.add(template)
    db.session.commit()
    
    return jsonify({"id": template.id}), 201


# ==================== Documents & RAG ====================

@app.route('/api/tenants/<int:tenant_id>/documents', methods=['POST'])
def upload_document(tenant_id):
    """Upload a document for RAG"""
    if 'file' in request.files:
        file = request.files['file']
        file_type = request.form.get('file_type', 'pdf')
        
        if file.filename:
            # Save file
            filename = secure_filename(file.filename)
            upload_dir = f"./uploads/tenant_{tenant_id}"
            os.makedirs(upload_dir, exist_ok=True)
            file_path = os.path.join(upload_dir, f"{uuid.uuid4()}_{filename}")
            file.save(file_path)
            
            # Create document record
            doc = Document(
                tenant_id=tenant_id,
                name=filename,
                file_type=file_type,
                file_path=file_path,
                status="pending"
            )
            db.session.add(doc)
            db.session.commit()
            
            # Queue for ingestion
            asyncio.run_coroutine_threadsafe(
                ingestion_service.queue_document(
                    tenant_id=tenant_id,
                    document_id=doc.id,
                    file_type=file_type,
                    file_path=file_path
                ),
                asyncio.get_event_loop()
            )
            
            return jsonify({
                "id": doc.id,
                "name": doc.name,
                "status": doc.status
            }), 201
    
    # Handle URL
    source_url = request.form.get('source_url')
    if source_url:
        doc = Document(
            tenant_id=tenant_id,
            name=source_url,
            file_type="url",
            source_url=source_url,
            status="pending"
        )
        db.session.add(doc)
        db.session.commit()
        
        asyncio.run_coroutine_threadsafe(
            ingestion_service.queue_document(
                tenant_id=tenant_id,
                document_id=doc.id,
                file_type="url",
                source_url=source_url
            ),
            asyncio.get_event_loop()
        )
        
        return jsonify({"id": doc.id, "status": doc.status}), 201
    
    return jsonify({"error": "No file or URL provided"}), 400


@app.route('/api/tenants/<int:tenant_id>/documents', methods=['GET'])
def list_documents(tenant_id):
    """List documents for a tenant"""
    docs = Document.query.filter_by(tenant_id=tenant_id).all()
    return jsonify([{
        "id": d.id,
        "name": d.name,
        "file_type": d.file_type,
        "status": d.status,
        "chunk_count": d.chunk_count,
        "version": d.version
    } for d in docs]), 200


# ==================== Inference ====================

@app.route('/api/inference/llm', methods=['POST'])
def inference_llm():
    """LLM inference with tenant filtering"""
    data = request.get_json()
    tenant_id = data.get('tenant_id')
    model_id = data.get('model_id')
    query = data.get('query')
    adapter_ids = data.get('adapter_ids', [])
    use_rag = data.get('use_rag', False)
    
    if not all([tenant_id, model_id, query]):
        return jsonify({"error": "tenant_id, model_id, and query required"}), 400
    
    try:
        result = inference_service.inference_llm(
            tenant_id=tenant_id,
            model_id=model_id,
            user_input=query,
            adapter_ids=adapter_ids if adapter_ids else None,
            use_rag=use_rag,
            temperature=data.get('temperature', 0.7),
            max_tokens=data.get('max_tokens', 1000)
        )
        return jsonify(result), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/inference/llm/stream', methods=['POST'])
def inference_llm_stream():
    """Stream LLM inference"""
    data = request.get_json()
    tenant_id = data.get('tenant_id')
    model_id = data.get('model_id')
    query = data.get('query')
    adapter_ids = data.get('adapter_ids', [])
    use_rag = data.get('use_rag', False)
    
    if not all([tenant_id, model_id, query]):
        return jsonify({"error": "tenant_id, model_id, and query required"}), 400
    
    def generate():
        try:
            for chunk in inference_service.inference_llm_stream(
                tenant_id=tenant_id,
                model_id=model_id,
                user_input=query,
                adapter_ids=adapter_ids if adapter_ids else None,
                use_rag=use_rag,
                temperature=data.get('temperature', 0.7),
                max_tokens=data.get('max_tokens', 1000)
            ):
                yield f"data: {chunk}\n\n"
        except Exception as e:
            yield f"data: [ERROR] {str(e)}\n\n"
    
    return Response(generate(), mimetype='text/event-stream')


@app.route('/api/inference/vlm', methods=['POST'])
def inference_vlm():
    """VLM inference"""
    tenant_id = request.form.get('tenant_id', type=int)
    model_id = request.form.get('model_id', type=int)
    text_prompt = request.form.get('text')
    image = request.files.get('image')
    
    if not all([tenant_id, model_id, text_prompt, image]):
        return jsonify({"error": "tenant_id, model_id, text, and image required"}), 400
    
    try:
        result = inference_service.inference_vlm(
            tenant_id=tenant_id,
            model_id=model_id,
            image_data=image.read(),
            text_prompt=text_prompt,
            temperature=float(request.form.get('temperature', 0.7)),
            max_tokens=int(request.form.get('max_tokens', 500))
        )
        return jsonify({"result": result}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ==================== Vector Search ====================

@app.route('/api/search', methods=['POST'])
def vector_search():
    """Vector search with tenant filtering"""
    data = request.get_json()
    tenant_id = data.get('tenant_id')
    query = data.get('query')
    top_k = data.get('top_k', 5)
    
    if not tenant_id or not query:
        return jsonify({"error": "tenant_id and query required"}), 400
    
    try:
        # Compute embedding
        embed_model = inference_service._get_embed_model()
        query_embedding = embed_model.get_text_embedding(query)
        
        # Search Milvus
        results = milvus_service.search(
            tenant_id=tenant_id,
            query_embedding=query_embedding,
            top_k=top_k,
            filters=data.get('filters')
        )
        
        return jsonify({"results": results}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    # Production mode: Use environment variable to control debug mode
    # For development: export FLASK_DEBUG=1
    # For production: export FLASK_DEBUG=0 or unset
    debug_mode = os.getenv('FLASK_DEBUG', '0').lower() in ('1', 'true', 'yes')
    port = int(os.getenv('PORT', '5000'))
    
    if debug_mode:
        print("⚠️  Running in DEBUG mode - not suitable for production!")
        print("   Set FLASK_DEBUG=0 for production or use Gunicorn")
    
    app.run(host='0.0.0.0', port=port, debug=debug_mode)

