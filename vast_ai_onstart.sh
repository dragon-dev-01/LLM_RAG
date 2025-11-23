#!/bin/bash
# Vast.ai On-Start Script for LLM RAG Platform
# This script automatically installs and starts the entire application

# Don't use set -e - we want to handle errors gracefully
set +e  # Don't exit on error - we'll handle failures manually

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

# Install basic dependencies first (skip docker for now)
apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    git \
    curl \
    wget \
    build-essential \
    screen \
    sqlite3 \
    libpq-dev \
    poppler-utils \
    tesseract-ocr \
    libtesseract-dev \
    libgl1-mesa-glx \
    libglib2.0-0 || true

# Install Docker (handle conflicts with existing containerd)
echo -e "${YELLOW}Checking Docker installation...${NC}"
if command -v docker &> /dev/null; then
    echo -e "${GREEN}Docker already installed${NC}"
    # Ensure docker-compose is available
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null 2>&1; then
        echo -e "${YELLOW}Installing docker-compose...${NC}"
        apt-get install -y docker-compose-plugin || apt-get install -y docker-compose || true
    fi
else
    echo -e "${YELLOW}Installing Docker...${NC}"
    # Try to install docker.io, but handle conflicts gracefully
    if apt-get install -y docker.io 2>&1 | grep -q "Conflicts: containerd"; then
        echo -e "${YELLOW}Docker conflict detected, trying to resolve...${NC}"
        # Try removing old containerd first
        apt-get remove -y containerd 2>/dev/null || true
        # Try installing docker.io again
        apt-get install -y docker.io || {
            echo -e "${YELLOW}Docker.io installation failed, but Docker might already be available${NC}"
            true
        }
    else
        apt-get install -y docker.io || true
    fi
    
    # Install docker-compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null 2>&1; then
        apt-get install -y docker-compose-plugin || apt-get install -y docker-compose || true
    fi
fi

# Verify Docker is working
if ! command -v docker &> /dev/null && ! docker --version &> /dev/null; then
    echo -e "${RED}WARNING: Docker may not be properly installed, but continuing...${NC}"
    echo -e "${YELLOW}You may need to install Docker manually if MilvusDB fails to start${NC}"
fi

# Install Node.js 18+ (ensure it's properly installed)
echo -e "${YELLOW}Installing/Upgrading Node.js 18...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}Node.js not found, installing...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - || true
    apt-get install -y nodejs npm || true
elif [ "$(node -v | cut -d'v' -f2 | cut -d'.' -f1)" -lt 18 ] 2>/dev/null; then
    echo -e "${YELLOW}Upgrading Node.js to version 18...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - || true
    apt-get install -y nodejs || true
fi

# Verify Node.js and npm are available
if command -v node &> /dev/null; then
    echo -e "${GREEN}✓ Node.js installed: $(node -v)${NC}"
else
    echo -e "${RED}✗ Node.js installation failed!${NC}"
    echo -e "${YELLOW}Trying alternative installation method...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - || true
    apt-get install -y nodejs npm || true
fi

if command -v npm &> /dev/null; then
    echo -e "${GREEN}✓ npm installed: $(npm -v)${NC}"
else
    echo -e "${RED}✗ npm not found! Installing...${NC}"
    apt-get install -y npm || true
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

# Start Milvus in background (try docker-compose or docker compose)
echo -e "${YELLOW}Starting MilvusDB containers...${NC}"
if command -v docker-compose &> /dev/null; then
    docker-compose up -d || {
        echo -e "${YELLOW}docker-compose failed, trying docker compose...${NC}"
        docker compose up -d || true
    }
elif docker compose version &> /dev/null 2>&1; then
    docker compose up -d || true
else
    echo -e "${RED}ERROR: docker-compose not available!${NC}"
    echo -e "${YELLOW}MilvusDB will not start. Please install Docker manually.${NC}"
    echo -e "${YELLOW}Continuing with other services...${NC}"
fi
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
$VENV_PIP install --upgrade pip setuptools wheel || true
$VENV_PIP install -r requirements.txt || {
    echo -e "${YELLOW}Some packages failed to install, continuing...${NC}"
    true
}
$VENV_PIP install gunicorn || true  # Ensure Gunicorn is installed

# Step 5: Create necessary directories
echo -e "${GREEN}[5/10]${NC} Creating directories..."
cd "$BACKEND_DIR"
mkdir -p uploads adapters logs instance
# Ensure instance directory has proper permissions
chmod 755 instance || true

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
echo -e "${YELLOW}Running database migrations...${NC}"
# Ensure we're in the right directory and instance folder exists
export DATABASE_URL=sqlite:///./instance/llm_rag.db
mkdir -p instance
chmod 755 instance
# Try flask db upgrade first
$VENV_PYTHON -m flask db upgrade 2>/dev/null || {
    echo -e "${YELLOW}Flask migration failed, trying direct database creation...${NC}"
    $VENV_PYTHON -c "from src import db, create_app; app = create_app(); app.app_context().push(); db.create_all()" || {
        echo -e "${YELLOW}Database initialization had issues, but continuing...${NC}"
        true
    }
}

# Initialize base models
if [ ! -f .base_models_initialized ]; then
    echo -e "${YELLOW}Initializing base models...${NC}"
    $VENV_PYTHON scripts/init_base_models.py 2>/dev/null || echo "Base models initialization skipped"
    touch .base_models_initialized
fi

# Step 7: Setup Node.js frontend
echo -e "${GREEN}[7/10]${NC} Setting up Node.js frontend..."
cd "$FRONTEND_DIR"

# Install Node dependencies
echo -e "${YELLOW}Installing Node.js dependencies (this may take a few minutes)...${NC}"
npm install --legacy-peer-deps || {
    echo -e "${YELLOW}Some npm packages failed, but continuing...${NC}"
    true
}

# Install and build speech-polyfill vendor package (optional)
if [ -d "src/vendor/speech-polyfill" ]; then
    echo -e "${YELLOW}Building speech-polyfill vendor package (optional)...${NC}"
    cd src/vendor/speech-polyfill
    npm install --legacy-peer-deps 2>/dev/null || echo "Speech polyfill install skipped"
    npm run build 2>/dev/null || echo "Speech polyfill build skipped"
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

# Start frontend in screen (verify npm is available first)
if command -v npm &> /dev/null; then
    screen -dmS llm-rag-frontend bash -c "
        cd $FRONTEND_DIR
        export REACT_APP_API_HOST=http://localhost:5000
        export REACT_APP_BYPASS_LOGIN=true
        export PORT=3000
        BROWSER=none npm start
    "
    echo -e "${GREEN}Frontend started in screen session${NC}"
else
    echo -e "${RED}ERROR: npm not found! Frontend cannot start.${NC}"
    echo -e "${YELLOW}Please install Node.js manually:${NC}"
    echo -e "${YELLOW}  curl -fsSL https://deb.nodesource.com/setup_18.x | bash -${NC}"
    echo -e "${YELLOW}  apt-get install -y nodejs${NC}"
fi

# Wait for frontend to start
sleep 10

# Verify services are running
echo ""
echo "=========================================="
echo -e "${GREEN}Verifying services...${NC}"
echo "=========================================="

# Check backend
if curl -f http://localhost:5000/api/base-models &>/dev/null; then
    echo -e "${GREEN}✓ Backend is running on port 5000${NC}"
else
    echo -e "${YELLOW}⚠ Backend may not be running. Check: screen -r llm-rag-backend${NC}"
fi

# Check frontend
if curl -f http://localhost:3000 &>/dev/null; then
    echo -e "${GREEN}✓ Frontend is running on port 3000${NC}"
else
    echo -e "${YELLOW}⚠ Frontend may not be running. Check: screen -r llm-rag-frontend${NC}"
fi

# Check Milvus
if curl -f http://localhost:9091/healthz &>/dev/null; then
    echo -e "${GREEN}✓ MilvusDB is running${NC}"
else
    echo -e "${YELLOW}⚠ MilvusDB may not be running${NC}"
fi

# Get external IP
EXTERNAL_IP=$(curl -s ifconfig.me || curl -s ipinfo.io/ip || echo "YOUR_INSTANCE_IP")

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
echo "🌐 External Access (from your browser):"
echo "  • Backend API:  http://${EXTERNAL_IP}:5000"
echo "  • Frontend UI:  http://${EXTERNAL_IP}:3000"
echo ""
echo "📊 Screen Sessions:"
echo "  • Backend:  screen -r llm-rag-backend"
echo "  • Frontend: screen -r llm-rag-frontend"
echo ""
echo "🔍 Check logs:"
echo "  • Backend:  screen -r llm-rag-backend"
echo "  • Frontend: screen -r llm-rag-frontend"
echo ""
echo "🧪 Test API (from instance):"
echo "  curl http://localhost:5000/api/base-models"
echo ""
echo "🧪 Test API (from your local machine):"
echo "  curl http://${EXTERNAL_IP}:5000/api/base-models"
echo ""
echo "⚠️  IMPORTANT: If services are not accessible:"
echo "  1. Check vast.ai port forwarding is enabled"
echo "  2. Verify services are running: screen -r llm-rag-backend"
echo "  3. Check firewall: ufw status"
echo ""
echo "=========================================="
echo ""

# Keep script running (vast.ai requirement)
# Use exec to replace shell process and ensure container stays alive
exec tail -f /dev/null

