#!/bin/bash
# Vast.ai On-Start Script for LLM RAG Platform
# This script automatically installs and starts the entire application

set -e  # Exit on error

echo "=========================================="
echo "🚀 LLM RAG Platform - Auto Deployment"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
REPO_URL="https://github.com/dragon-dev-01/LLM_RAG.git"
PROJECT_DIR="/root/LLM_RAG"
BACKEND_DIR="$PROJECT_DIR/LLM-Finetuner-main"
FRONTEND_DIR="$PROJECT_DIR/LLM-Finetuner-FE-main"

# Step 1: Update system and install base dependencies
echo -e "${GREEN}[1/10]${NC} Updating system and installing dependencies..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    git \
    curl \
    wget \
    build-essential \
    docker.io \
    docker-compose \
    nodejs \
    npm \
    screen \
    sqlite3 \
    libpq-dev \
    poppler-utils \
    tesseract-ocr \
    libtesseract-dev \
    libgl1-mesa-glx \
    libglib2.0-0

# Install Node.js 18+ if not available
if ! command -v node &> /dev/null || [ "$(node -v | cut -d'v' -f2 | cut -d'.' -f1)" -lt 18 ]; then
    echo -e "${YELLOW}Installing Node.js 18...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
fi

# Step 2: Clone repository
echo -e "${GREEN}[2/10]${NC} Cloning repository..."
cd /root
if [ -d "$PROJECT_DIR" ]; then
    echo -e "${YELLOW}Project directory exists, pulling latest changes...${NC}"
    cd "$PROJECT_DIR"
    git pull || echo "Git pull failed, continuing with existing code..."
else
    git clone "$REPO_URL" "$PROJECT_DIR"
fi

# Step 3: Start MilvusDB
echo -e "${GREEN}[3/10]${NC} Starting MilvusDB..."
cd "$BACKEND_DIR"
if [ ! -f docker-compose.yml ]; then
    echo -e "${RED}ERROR: docker-compose.yml not found!${NC}"
    exit 1
fi

# Start Milvus in background
docker-compose up -d
echo -e "${YELLOW}Waiting for MilvusDB to be ready...${NC}"
sleep 30

# Check Milvus health (non-fatal - won't exit script on failure)
for i in {1..30}; do
    if curl -f http://localhost:9091/healthz &>/dev/null; then
        echo -e "${GREEN}✓ MilvusDB is ready!${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${YELLOW}⚠ MilvusDB health check failed, but continuing...${NC}"
    fi
    sleep 2
done || true

# Step 4: Setup Python backend environment
echo -e "${GREEN}[4/10]${NC} Setting up Python backend..."
cd "$BACKEND_DIR"

# Create virtual environment
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

# Use full path to Python binary instead of source activate
VENV_PYTHON="$BACKEND_DIR/venv/bin/python3"
VENV_PIP="$BACKEND_DIR/venv/bin/pip"

# Upgrade pip and install dependencies
$VENV_PIP install --upgrade pip setuptools wheel
$VENV_PIP install -r requirements.txt
$VENV_PIP install gunicorn  # Ensure Gunicorn is installed

# Step 5: Create necessary directories
echo -e "${GREEN}[5/10]${NC} Creating directories..."
mkdir -p uploads adapters logs instance

# Step 6: Initialize database
echo -e "${GREEN}[6/10]${NC} Initializing database..."
export DATABASE_URL=sqlite:///./instance/llm_rag.db
export MILVUS_HOST=localhost
export MILVUS_PORT=19530
export VLLM_BASE_URL=http://localhost:8000
export TRITON_BASE_URL=http://localhost:8001
export ADAPTER_BASE_PATH=./adapters
export BYPASS_LOGIN=true
export FLASK_APP=app_new.py
export PORT=5000
export CUDA_AVAILABLE=true

# Run migrations (using full path to Python)
cd "$BACKEND_DIR"
$VENV_PYTHON -m flask db upgrade || $VENV_PYTHON -c "from src import db, create_app; app = create_app(); app.app_context().push(); db.create_all()"

# Initialize base models
if [ ! -f .base_models_initialized ]; then
    echo -e "${YELLOW}Initializing base models...${NC}"
    $VENV_PYTHON scripts/init_base_models.py || echo "Base models initialization skipped"
    touch .base_models_initialized
fi

# Step 7: Setup Node.js frontend
echo -e "${GREEN}[7/10]${NC} Setting up Node.js frontend..."
cd "$FRONTEND_DIR"

# Install Node dependencies
npm install --legacy-peer-deps

# Install and build speech-polyfill vendor package
if [ -d "src/vendor/speech-polyfill" ]; then
    echo -e "${YELLOW}Building speech-polyfill vendor package...${NC}"
    cd src/vendor/speech-polyfill
    npm install --legacy-peer-deps || echo "Speech polyfill install failed, continuing..."
    npm run build || echo "Speech polyfill build failed, continuing..."
    cd "$FRONTEND_DIR"
fi

# Step 8: Create environment file for frontend
echo -e "${GREEN}[8/10]${NC} Creating frontend environment file..."
cd "$FRONTEND_DIR"
cat > .env << EOF
REACT_APP_API_HOST=http://localhost:5000
REACT_APP_BYPASS_LOGIN=true
REACT_APP_GOOGLE_CLIENT_ID=
PORT=3000
EOF

# Step 9: Start backend in screen session
echo -e "${GREEN}[9/10]${NC} Starting backend server..."
cd "$BACKEND_DIR"

# Kill any existing gunicorn processes
pkill -f gunicorn || true
sleep 2

# Start backend in screen (using full path to gunicorn)
screen -dmS llm-rag-backend bash -c "
    cd $BACKEND_DIR
    export DATABASE_URL=sqlite:///./instance/llm_rag.db
    export MILVUS_HOST=localhost
    export MILVUS_PORT=19530
    export VLLM_BASE_URL=http://localhost:8000
    export TRITON_BASE_URL=http://localhost:8001
    export ADAPTER_BASE_PATH=./adapters
    export BYPASS_LOGIN=true
    export PORT=5000
    export CUDA_AVAILABLE=true
    export FLASK_APP=app_new.py
    $BACKEND_DIR/venv/bin/gunicorn -w 4 -b 0.0.0.0:5000 --timeout 300 --access-logfile - --error-logfile - app_new:app
"

# Wait for backend to start
sleep 5

# Step 10: Start frontend in screen session
echo -e "${GREEN}[10/10]${NC} Starting frontend server..."
cd "$FRONTEND_DIR"

# Kill any existing node processes on port 3000
lsof -ti:3000 | xargs kill -9 || true
sleep 2

# Start frontend in screen
screen -dmS llm-rag-frontend bash -c "
    cd $FRONTEND_DIR
    export REACT_APP_API_HOST=http://localhost:5000
    export REACT_APP_BYPASS_LOGIN=true
    export PORT=3000
    BROWSER=none npm start
"

# Wait for frontend to start
sleep 10

# Final status check
echo ""
echo "=========================================="
echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo "=========================================="
echo ""
echo "📋 Service Status:"
echo "  • MilvusDB:     http://localhost:9091/healthz"
echo "  • Backend API:  http://localhost:5000"
echo "  • Frontend UI:  http://localhost:3000"
echo ""
echo "📊 Screen Sessions:"
echo "  • Backend:  screen -r llm-rag-backend"
echo "  • Frontend: screen -r llm-rag-frontend"
echo ""
echo "🔍 Check logs:"
echo "  • Backend:  screen -r llm-rag-backend"
echo "  • Frontend: screen -r llm-rag-frontend"
echo ""
echo "🧪 Test API:"
echo "  curl http://localhost:5000/api/base-models"
echo ""
echo "=========================================="
echo ""

# Keep script running (vast.ai requirement)
# Use exec to replace shell process and ensure container stays alive
exec tail -f /dev/null

