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

# Install Node.js 18+ (handle conflicts with old versions and libnode-dev)
echo -e "${YELLOW}Installing/Upgrading Node.js 18...${NC}"

# Check current Node.js version
CURRENT_NODE_VERSION=$(node -v 2>/dev/null | cut -d'v' -f2 | cut -d'.' -f1 || echo "0")

if [ "$CURRENT_NODE_VERSION" -lt 18 ] 2>/dev/null || [ "$CURRENT_NODE_VERSION" = "0" ]; then
    echo -e "${YELLOW}Removing old Node.js and conflicting packages...${NC}"
    # Remove old nodejs, npm, and libnode-dev to avoid conflicts
    apt-get remove -y nodejs npm libnode-dev libnode72 2>/dev/null || true
    apt-get purge -y nodejs npm libnode-dev libnode72 2>/dev/null || true
    
    # Force remove libnode-dev if it exists (this is the main conflict)
    dpkg --remove --force-remove-reinstreq libnode-dev 2>/dev/null || true
    dpkg --remove --force-remove-reinstreq libnode72 2>/dev/null || true
    
    # Fix any broken packages
    apt-get install -f -y 2>/dev/null || true
    apt-get autoremove -y 2>/dev/null || true
    
    echo -e "${YELLOW}Installing Node.js 18 from NodeSource...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - || true
    
    # Try to install nodejs, handling any remaining conflicts
    if ! apt-get install -y nodejs 2>&1; then
        echo -e "${YELLOW}NodeSource installation had conflicts, force removing libnode-dev...${NC}"
        # Force remove libnode-dev if it's still causing issues
        dpkg --remove --force-remove-reinstreq libnode-dev 2>/dev/null || true
        dpkg --remove --force-remove-reinstreq libnode72 2>/dev/null || true
        apt-get install -f -y 2>/dev/null || true
        # Try installing nodejs again with --force-yes
        apt-get install -y --allow-downgrades --allow-remove-essential nodejs || {
            echo -e "${YELLOW}NodeSource failed, trying Ubuntu repository...${NC}"
            apt-get install -y nodejs npm || true
        }
    fi
fi

# Verify Node.js and npm are available
if command -v node &> /dev/null; then
    NODE_VER=$(node -v)
    echo -e "${GREEN}✓ Node.js installed: $NODE_VER${NC}"
    
    # Check if npm is available (Node.js 18+ includes npm)
    if ! command -v npm &> /dev/null; then
        echo -e "${YELLOW}npm not found, Node.js 18 should include npm...${NC}"
        # Try installing npm separately
        apt-get install -y npm 2>/dev/null || {
            echo -e "${YELLOW}npm installation failed, but Node.js is available${NC}"
        }
    fi
    
    if command -v npm &> /dev/null; then
        echo -e "${GREEN}✓ npm installed: $(npm -v)${NC}"
    else
        echo -e "${YELLOW}⚠ npm not found, but Node.js is installed${NC}"
        echo -e "${YELLOW}  Frontend may not work without npm${NC}"
    fi
else
    echo -e "${RED}✗ Node.js installation failed!${NC}"
    echo -e "${YELLOW}Trying alternative: installing from Ubuntu repository...${NC}"
    apt-get install -y nodejs npm || true
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
# Ensure instance directory has proper permissions and exists
chmod 755 instance || true
touch instance/.gitkeep || true
# Verify directory was created
if [ ! -d "instance" ]; then
    echo -e "${RED}ERROR: Failed to create instance directory!${NC}"
    mkdir -p instance
    chmod 755 instance
fi

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
export MILVUS_HOST=localhost
export MILVUS_PORT=19530
export BYPASS_LOGIN=true
export FLASK_APP=app_new.py
export PORT=5000
export CUDA_AVAILABLE=true

# Ensure instance directory exists and is writable
mkdir -p instance
chmod 755 instance
touch instance/.gitkeep || true

# Verify we can write to the instance directory
if [ ! -w "instance" ]; then
    echo -e "${RED}ERROR: instance directory is not writable!${NC}"
    chmod 755 instance
fi

# Try flask db upgrade first
echo -e "${YELLOW}Attempting Flask database migration...${NC}"
$VENV_PYTHON -m flask db upgrade 2>&1 | head -20 || {
    echo -e "${YELLOW}Flask migration failed, trying direct database creation...${NC}"
    $VENV_PYTHON -c "
import os
os.chdir('$BACKEND_DIR')
from src import db, create_app
app = create_app()
with app.app_context():
    try:
        db.create_all()
        print('Database created successfully')
    except Exception as e:
        print(f'Database creation error: {e}')
        import traceback
        traceback.print_exc()
" 2>&1 || {
        echo -e "${YELLOW}Database initialization had issues, but continuing...${NC}"
        true
    }
}

# Verify database file was created
if [ -f "instance/llm_rag.db" ]; then
    echo -e "${GREEN}✓ Database file created: instance/llm_rag.db${NC}"
    chmod 644 instance/llm_rag.db || true
else
    echo -e "${YELLOW}⚠ Database file not found, but continuing...${NC}"
fi

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
HOST=0.0.0.0
DANGEROUSLY_DISABLE_HOST_CHECK=true
EOF

# Step 9: Start backend in screen session
echo -e "${GREEN}[9/10]${NC} Starting backend server..."
cd "$BACKEND_DIR"

# Kill any existing gunicorn processes
pkill -f gunicorn || true
sleep 2

# Ensure database exists before starting
cd "$BACKEND_DIR"
if [ ! -f "instance/llm_rag.db" ]; then
    echo -e "${YELLOW}Database not found, creating it now...${NC}"
    export DATABASE_URL=sqlite:///./instance/llm_rag.db
    export MILVUS_HOST=localhost
    export MILVUS_PORT=19530
    export BYPASS_LOGIN=true
    export FLASK_APP=app_new.py
    $VENV_PYTHON -c "from src import db, create_app; app = create_app(); app.app_context().push(); db.create_all()" 2>&1 || {
        echo -e "${YELLOW}Database creation had issues, but continuing...${NC}"
        true
    }
fi

# Verify database file exists
if [ ! -f "instance/llm_rag.db" ]; then
    echo -e "${RED}ERROR: Database file still not found after creation attempt!${NC}"
    echo -e "${YELLOW}Creating database with direct SQLite command...${NC}"
    mkdir -p instance
    touch instance/llm_rag.db
    chmod 644 instance/llm_rag.db
fi

# Start backend - ensure it binds to 0.0.0.0 for external access
echo -e "${YELLOW}Starting Gunicorn on 0.0.0.0:5000...${NC}"
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
    $BACKEND_DIR/venv/bin/gunicorn -w 4 -b 0.0.0.0:5000 --timeout 300 --access-logfile - --error-logfile - app_new:app 2>&1 | tee /tmp/backend.log
"
sleep 3

# Verify backend started
if pgrep -f "gunicorn.*app_new:app" > /dev/null; then
    echo -e "${GREEN}✓ Backend started successfully${NC}"
else
    echo -e "${RED}⚠ Backend may not have started, check logs: screen -r llm-rag-backend${NC}"
fi

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
    echo -e "${YELLOW}Starting frontend with npm...${NC}"
    # Ensure .env file exists
    cd "$FRONTEND_DIR"
    if [ ! -f .env ]; then
        echo "REACT_APP_API_HOST=http://localhost:5000" > .env
        echo "REACT_APP_BYPASS_LOGIN=true" >> .env
        echo "PORT=3000" >> .env
    fi
    
    # Kill any existing node processes on port 3000
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
    sleep 1
    
    screen -dmS llm-rag-frontend bash -c "
        cd $FRONTEND_DIR
        export REACT_APP_API_HOST=http://localhost:5000
        export REACT_APP_BYPASS_LOGIN=true
        export PORT=3000
        export HOST=0.0.0.0
        export DANGEROUSLY_DISABLE_HOST_CHECK=true
        BROWSER=none HOST=0.0.0.0 PORT=3000 npm start 2>&1 | tee /tmp/frontend.log
    "
    echo -e "${GREEN}Frontend started in screen session${NC}"
    echo -e "${YELLOW}Note: Frontend may take 1-2 minutes to compile${NC}"
    sleep 5
    
    # Verify frontend started
    if pgrep -f "node.*react-scripts" > /dev/null || pgrep -f "npm start" > /dev/null; then
        echo -e "${GREEN}✓ Frontend process started${NC}"
    else
        echo -e "${YELLOW}⚠ Frontend process may not have started yet, check logs: screen -r llm-rag-frontend${NC}"
    fi
else
    echo -e "${RED}ERROR: npm not found! Frontend cannot start.${NC}"
    echo -e "${YELLOW}Attempting to fix Node.js/npm installation...${NC}"
    
    # Try to fix by removing libnode-dev and reinstalling
    apt-get remove -y libnode-dev libnode72 2>/dev/null || true
    dpkg --remove --force-remove-reinstreq libnode-dev 2>/dev/null || true
    apt-get install -f -y 2>/dev/null || true
    
    # Try installing npm again
    if apt-get install -y npm 2>/dev/null; then
        echo -e "${GREEN}npm installed, starting frontend...${NC}"
        cd "$FRONTEND_DIR"
        screen -dmS llm-rag-frontend bash -c "
            cd $FRONTEND_DIR
            export REACT_APP_API_HOST=http://localhost:5000
            export REACT_APP_BYPASS_LOGIN=true
            export PORT=3000
            export HOST=0.0.0.0
            export DANGEROUSLY_DISABLE_HOST_CHECK=true
            BROWSER=none HOST=0.0.0.0 PORT=3000 DANGEROUSLY_DISABLE_HOST_CHECK=true npm start 2>&1 | tee /tmp/frontend.log
        "
    else
        echo -e "${YELLOW}npm installation failed. Frontend will not start.${NC}"
        echo -e "${YELLOW}You can start it manually later with:${NC}"
        echo -e "${YELLOW}  cd $FRONTEND_DIR && npm start${NC}"
    fi
fi

# Wait for frontend to start
sleep 10

# Verify services are running
echo ""
echo "=========================================="
echo -e "${GREEN}Verifying services...${NC}"
echo "=========================================="

# Check backend
echo -e "${YELLOW}Checking backend service...${NC}"
sleep 2
if curl -f http://localhost:5000/api/base-models &>/dev/null; then
    echo -e "${GREEN}✓ Backend is running and responding on port 5000${NC}"
elif pgrep -f "gunicorn.*app_new:app" > /dev/null; then
    echo -e "${YELLOW}⚠ Backend process is running but not responding yet. It may need more time to start.${NC}"
    echo -e "${YELLOW}  Check logs: screen -r llm-rag-backend${NC}"
else
    echo -e "${RED}✗ Backend is not running!${NC}"
    echo -e "${YELLOW}  Attempting to restart...${NC}"
    cd "$BACKEND_DIR"
    screen -dmS llm-rag-backend bash -c "
        cd $BACKEND_DIR
        export DATABASE_URL=sqlite:///./instance/llm_rag.db
        export MILVUS_HOST=localhost
        export MILVUS_PORT=19530
        export BYPASS_LOGIN=true
        export PORT=5000
        export FLASK_APP=app_new.py
        $BACKEND_DIR/venv/bin/gunicorn -w 4 -b 0.0.0.0:5000 --timeout 300 app_new:app
    "
    sleep 3
fi

# Check frontend
echo -e "${YELLOW}Checking frontend service...${NC}"
sleep 2
if curl -f http://localhost:3000 &>/dev/null; then
    echo -e "${GREEN}✓ Frontend is running and responding on port 3000${NC}"
elif pgrep -f "node.*react-scripts\|npm start" > /dev/null; then
    echo -e "${YELLOW}⚠ Frontend process is running but not responding yet. It may still be compiling.${NC}"
    echo -e "${YELLOW}  Check logs: screen -r llm-rag-frontend${NC}"
    echo -e "${YELLOW}  Frontend compilation can take 2-5 minutes on first start${NC}"
else
    echo -e "${YELLOW}⚠ Frontend is not running${NC}"
    if command -v npm &> /dev/null; then
        echo -e "${YELLOW}  npm is available, you can start frontend manually:${NC}"
        echo -e "${YELLOW}    screen -dmS llm-rag-frontend bash -c 'cd $FRONTEND_DIR && BROWSER=none HOST=0.0.0.0 npm start'${NC}"
    else
        echo -e "${RED}  npm is not available, frontend cannot start${NC}"
    fi
fi

# Check Milvus
if curl -f http://localhost:9091/healthz &>/dev/null; then
    echo -e "${GREEN}✓ MilvusDB is running${NC}"
else
    echo -e "${YELLOW}⚠ MilvusDB may not be running${NC}"
fi

# Verify ports are listening
echo -e "${YELLOW}Checking if ports are listening...${NC}"
if command -v netstat &> /dev/null; then
    if netstat -tlnp 2>/dev/null | grep -q ":5000 "; then
        echo -e "${GREEN}✓ Port 5000 is listening${NC}"
    else
        echo -e "${RED}✗ Port 5000 is NOT listening${NC}"
    fi
    
    if netstat -tlnp 2>/dev/null | grep -q ":3000 "; then
        echo -e "${GREEN}✓ Port 3000 is listening${NC}"
    else
        echo -e "${YELLOW}⚠ Port 3000 is NOT listening (frontend may still be compiling)${NC}"
    fi
elif command -v ss &> /dev/null; then
    if ss -tlnp 2>/dev/null | grep -q ":5000 "; then
        echo -e "${GREEN}✓ Port 5000 is listening${NC}"
    else
        echo -e "${RED}✗ Port 5000 is NOT listening${NC}"
    fi
    
    if ss -tlnp 2>/dev/null | grep -q ":3000 "; then
        echo -e "${GREEN}✓ Port 3000 is listening${NC}"
    else
        echo -e "${YELLOW}⚠ Port 3000 is NOT listening (frontend may still be compiling)${NC}"
    fi
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
echo "  1. Check vast.ai port forwarding is enabled in template"
echo "  2. Verify services are running:"
echo "     • screen -r llm-rag-backend"
echo "     • screen -r llm-rag-frontend"
echo "  3. Check if ports are listening:"
echo "     • netstat -tlnp | grep -E ':(5000|3000)'"
echo "  4. Verify services bind to 0.0.0.0 (not localhost)"
echo "  5. Check firewall: ufw status"
echo ""
echo "🔧 Troubleshooting Commands:"
echo "  # Check backend logs"
echo "  screen -r llm-rag-backend"
echo ""
echo "  # Check frontend logs"
echo "  screen -r llm-rag-frontend"
echo ""
echo "  # Restart backend manually"
echo "  cd /root/LLM_RAG/LLM-Finetuner-main"
echo "  source venv/bin/activate"
echo "  screen -dmS llm-rag-backend bash -c 'gunicorn -w 4 -b 0.0.0.0:5000 --timeout 300 app_new:app'"
echo ""
echo "  # Restart frontend manually (if npm is available)"
echo "  cd /root/LLM_RAG/LLM-Finetuner-FE-main"
echo "  screen -dmS llm-rag-frontend bash -c 'HOST=0.0.0.0 PORT=3000 BROWSER=none npm start'"
echo ""
echo "=========================================="
echo ""

# Keep script running (vast.ai requirement)
# Use exec to replace shell process and ensure container stays alive
exec tail -f /dev/null

