#!/bin/bash
cd /home/dev/LLM_RAG/LLM-Finetuner-main
export DATABASE_URL=sqlite:///./llm_rag.db
export MILVUS_HOST=localhost
export MILVUS_PORT=19530
export BYPASS_LOGIN=true
echo "🚀 Starting backend server..."
echo "📍 Backend will run on: http://localhost:5000"
echo ""
python3 app_new.py
