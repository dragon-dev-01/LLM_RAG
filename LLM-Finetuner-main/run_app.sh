#!/bin/bash
# Startup script for the multi-tenant LLM RAG application

cd "$(dirname "$0")"

# Set environment variables
export DATABASE_URL=${DATABASE_URL:-"sqlite:///./llm_rag.db"}
export MILVUS_HOST=${MILVUS_HOST:-"localhost"}
export MILVUS_PORT=${MILVUS_PORT:-"19530"}
export VLLM_BASE_URL=${VLLM_BASE_URL:-"http://localhost:8000"}
export TRITON_BASE_URL=${TRITON_BASE_URL:-"http://localhost:8001"}
export ADAPTER_BASE_PATH=${ADAPTER_BASE_PATH:-"./adapters"}
export CUDA_AVAILABLE=${CUDA_AVAILABLE:-"false"}

# Create directories
mkdir -p uploads adapters

echo "Starting LLM RAG Multi-Tenant API..."
echo "Database: $DATABASE_URL"
echo "Milvus: $MILVUS_HOST:$MILVUS_PORT"
echo "vLLM: $VLLM_BASE_URL"
echo "Triton: $TRITON_BASE_URL"
echo ""
echo "Note: Milvus, vLLM, and Triton servers should be running separately"
echo "The app will start but inference may not work until those services are available."
echo ""

# Run the application
python3 app_new.py

