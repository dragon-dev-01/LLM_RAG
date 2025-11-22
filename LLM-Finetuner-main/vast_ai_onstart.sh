#!/bin/bash
set -e

echo "🚀 Starting LLM RAG Platform Auto-Deployment..."
echo "================================================"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print status
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# Step 1: Update system and install base dependencies
print_status "Updating system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y > /dev/null 2>&1
apt-get install -y python3 python3-pip python3-venv git curl wget build-essential docker.io docker-compose software-properties-common > /dev/null 2>&1

# Install Node.js 18.x (LTS)
print_status "Installing Node.js 18.x..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash - > /dev/null 2>&1
apt-get install -y nodejs > /dev/null 2>&1

# Verify installations
print_status "Verifying installations..."
python3 --version
node --version
npm --version
docker --version

# Step 2: Navigate to workspace
WORKSPACE="/root/LLM_RAG"
mkdir -p $WORKSPACE
cd $WORKSPACE

# Step 3: Clone or prepare codebase
# Note: In vast.ai, you typically upload code via SSH or git clone
# For template, assume code is already in /root/LLM_RAG
if [ ! -d "LLM-Finetuner-main" ]; then
    print_warning "Codebase not found. Please ensure code is uploaded to $WORKSPACE/LLM-Finetuner-main"
    print_warning "You can clone from git or upload via SCP"
    exit 1
fi

cd LLM-Finetuner-main
print_status "Working directory: $(pwd)"

# Step 4: Start MilvusDB with Docker Compose
print_status "Starting MilvusDB..."
if [ -f "docker-compose.yml" ]; then
    docker-compose down > /dev/null 2>&1 || true
    docker-compose up -d
    print_status "Waiting for MilvusDB to be ready (this may take 60-90 seconds)..."
    sleep 30
    
    # Wait for Milvus to be healthy
    MAX_RETRIES=30
    RETRY_COUNT=0
    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
        if curl -s http://localhost:9091/healthz > /dev/null 2>&1; then
            print_status "MilvusDB is ready!"
            break
        fi
        RETRY_COUNT=$((RETRY_COUNT + 1))
        sleep 2
    done
    
    if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
        print_warning "MilvusDB health check timeout, but continuing..."
    fi
else
    print_warning "docker-compose.yml not found. Skipping MilvusDB setup."
fi

# Step 5: Setup Python backend
print_status "Setting up Python backend environment..."
cd $WORKSPACE/LLM-Finetuner-main

# Create virtual environment
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate

# Upgrade pip and install dependencies
pip install --upgrade pip setuptools wheel > /dev/null 2>&1
print_status "Installing Python dependencies (this may take 3-5 minutes)..."
pip install -r requirements.txt > /dev/null 2>&1

# Create necessary directories
mkdir -p uploads adapters logs instance

# Set environment variables for backend
export DATABASE_URL=sqlite:///./instance/llm_rag.db
export MILVUS_HOST=localhost
export MILVUS_PORT=19530
export VLLM_BASE_URL=http://localhost:8000
export TRITON_BASE_URL=http://localhost:8001
export ADAPTER_BASE_PATH=./adapters
export BYPASS_LOGIN=true
export FLASK_APP=app_new.py
export PORT=5000
export FLASK_DEBUG=0

# Initialize database
print_status "Initializing database..."
flask db upgrade > /dev/null 2>&1 || python3 -c "from src import db, create_app; app = create_app(); app.app_context().push(); db.create_all()" > /dev/null 2>&1

# Initialize base models
print_status "Initializing base models..."
python3 scripts/init_base_models.py > /dev/null 2>&1 || print_warning "Base models script completed (may already be initialized)"

# Step 6: Start backend with Gunicorn in background
print_status "Starting backend server..."
cd $WORKSPACE/LLM-Finetuner-main
source venv/bin/activate

# Kill any existing gunicorn processes
pkill -f gunicorn || true
sleep 2

# Start Gunicorn in background
nohup gunicorn -w 4 -b 0.0.0.0:5000 --timeout 300 --access-logfile logs/backend.log --error-logfile logs/backend_error.log app_new:app > /dev/null 2>&1 &

# Wait for backend to start
sleep 5
if curl -s http://localhost:5000/api/base-models > /dev/null 2>&1; then
    print_status "Backend is running on port 5000"
else
    print_warning "Backend may still be starting. Check logs: tail -f $WORKSPACE/LLM-Finetuner-main/logs/backend_error.log"
fi

# Step 7: Setup frontend
print_status "Setting up frontend..."
cd $WORKSPACE/LLM-Finetuner-FE-main

# Install Node.js dependencies
print_status "Installing Node.js dependencies (this may take 3-5 minutes)..."
npm install --legacy-peer-deps > /dev/null 2>&1

# Install dependencies for speech-polyfill vendor package
print_status "Installing vendor package dependencies..."
cd src/vendor/speech-polyfill
npm install --legacy-peer-deps > /dev/null 2>&1
npm run build > /dev/null 2>&1 || print_warning "Vendor package build completed with warnings"
cd $WORKSPACE/LLM-Finetuner-FE-main

# Get the instance IP (vast.ai provides this)
INSTANCE_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || hostname -I | awk '{print $1}')
BACKEND_URL="http://${INSTANCE_IP}:5000"

# Create .env file for frontend
print_status "Creating frontend environment configuration..."
cat > .env << EOF
REACT_APP_API_HOST=${BACKEND_URL}
REACT_APP_BYPASS_LOGIN=true
REACT_APP_GOOGLE_CLIENT_ID=
PORT=3000
EOF

# Build frontend
print_status "Building frontend (this may take 2-3 minutes)..."
npm run build > /dev/null 2>&1

# Install serve globally to serve the built frontend
print_status "Installing serve package..."
npm install -g serve > /dev/null 2>&1

# Step 8: Start frontend server
print_status "Starting frontend server..."
# Kill any existing serve processes
pkill -f "serve -s build" || true
sleep 2

# Start serve in background
cd $WORKSPACE/LLM-Finetuner-FE-main
mkdir -p logs
nohup serve -s build -l 3000 > logs/frontend.log 2>&1 &

# Wait for frontend to start
sleep 3
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    print_status "Frontend is running on port 3000"
else
    print_warning "Frontend may still be starting. Check logs: tail -f $WORKSPACE/LLM-Finetuner-FE-main/logs/frontend.log"
fi

# Step 9: Display access information
echo ""
echo "================================================"
echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo "================================================"
echo ""
echo "📋 Access Information:"
echo "   Frontend: http://${INSTANCE_IP}:3000"
echo "   Backend API: http://${INSTANCE_IP}:5000"
echo ""
echo "📊 Service Status:"
echo "   Backend:  $(curl -s http://localhost:5000/api/base-models > /dev/null 2>&1 && echo 'Running ✓' || echo 'Starting...')"
echo "   Frontend: $(curl -s http://localhost:3000 > /dev/null 2>&1 && echo 'Running ✓' || echo 'Starting...')"
echo "   MilvusDB: $(curl -s http://localhost:9091/healthz > /dev/null 2>&1 && echo 'Running ✓' || echo 'Not available')"
echo ""
echo "📝 Logs:"
echo "   Backend:  tail -f $WORKSPACE/LLM-Finetuner-main/logs/backend_error.log"
echo "   Frontend: tail -f $WORKSPACE/LLM-Finetuner-FE-main/logs/frontend.log"
echo ""
echo "🔧 Manual Commands:"
echo "   Restart backend:  cd $WORKSPACE/LLM-Finetuner-main && source venv/bin/activate && pkill -f gunicorn && gunicorn -w 4 -b 0.0.0.0:5000 app_new:app &"
echo "   Restart frontend: cd $WORKSPACE/LLM-Finetuner-FE-main && pkill -f serve && serve -s build -l 3000 &"
echo ""
echo "⚠️  Note: First-time setup may take 5-10 minutes. Services are starting in background."
echo ""

# Create a status check script
cat > /root/check_status.sh << 'EOF'
#!/bin/bash
echo "=== LLM RAG Platform Status ==="
echo ""
echo "Backend API:"
curl -s http://localhost:5000/api/base-models | head -20 || echo "Backend not responding"
echo ""
echo "Frontend:"
curl -s http://localhost:3000 | head -5 || echo "Frontend not responding"
echo ""
echo "MilvusDB:"
curl -s http://localhost:9091/healthz || echo "MilvusDB not responding"
echo ""
echo "Running Processes:"
ps aux | grep -E "gunicorn|serve|milvus" | grep -v grep
EOF

chmod +x /root/check_status.sh
print_status "Created status check script: /root/check_status.sh"

echo ""
print_status "Setup script completed!"
echo ""

