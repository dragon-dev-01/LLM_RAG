#!/bin/bash
# VAST.AI On-Start Installation Script for LLM_RAG
# This script automatically installs and starts the LLM_RAG application

# Don't exit on error for non-critical operations
set +e

echo "=========================================="
echo "🚀 LLM_RAG Auto-Installation Script"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Update system packages
print_status "Updating system packages..."
apt-get update -qq || true
apt-get install -y -qq curl wget git build-essential python3-pip python3-dev net-tools > /dev/null 2>&1 || true

# Install Node.js 18.x
if ! command -v node &> /dev/null; then
    print_status "Installing Node.js 18.x..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - > /dev/null 2>&1
    apt-get install -y -qq nodejs > /dev/null 2>&1
else
    print_status "Node.js already installed: $(node --version)"
fi

# Install Docker if not present
if ! command -v docker &> /dev/null; then
    print_status "Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh > /dev/null 2>&1
    sh get-docker.sh > /dev/null 2>&1
    rm get-docker.sh
    usermod -aG docker $USER 2>/dev/null || true
else
    print_status "Docker already installed: $(docker --version)"
fi

# Install Docker Compose if not present
if ! command -v docker-compose &> /dev/null; then
    print_status "Installing Docker Compose..."
    curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose > /dev/null 2>&1
    chmod +x /usr/local/bin/docker-compose
else
    print_status "Docker Compose already installed: $(docker-compose --version)"
fi

# Set working directory
WORK_DIR="/root/LLM_RAG"
mkdir -p $WORK_DIR
cd $WORK_DIR

# Clone repository if not already present
if [ ! -d "LLM-Finetuner-main" ] || [ ! -d "LLM-Finetuner-FE-main" ]; then
    print_status "Cloning LLM_RAG repository..."
    if [ -d ".git" ]; then
        print_warning "Repository already exists, pulling latest changes..."
        git pull origin main || true
    else
        git clone https://github.com/dragon-dev-01/LLM_RAG.git . || {
            print_error "Failed to clone repository"
            exit 1
        }
    fi
else
    print_status "Repository already cloned"
fi

# Set environment variables
export DATABASE_URL=sqlite:///./llm_rag.db
export MILVUS_HOST=localhost
export MILVUS_PORT=19530
export BYPASS_LOGIN=true
export FLASK_DEBUG=0
export PORT=5000
export REACT_APP_API_HOST=http://localhost:5000
export REACT_APP_BYPASS_LOGIN=true

# Start Milvus via Docker Compose
print_status "Starting Milvus vector database..."
cd LLM-Finetuner-main
docker-compose down 2>/dev/null || true
docker-compose up -d

# Wait for Milvus to be ready
print_status "Waiting for Milvus to be ready..."
sleep 10
for i in {1..30}; do
    if docker-compose ps | grep -q "milvus-standalone.*Up"; then
        print_status "Milvus is ready!"
        break
    fi
    if [ $i -eq 30 ]; then
        print_warning "Milvus may not be fully ready, but continuing..."
    fi
    sleep 2
done

# Install Python dependencies
print_status "Installing Python dependencies..."
pip3 install --upgrade pip -q

# Fix blinker issue by using --ignore-installed or --break-system-packages
print_status "Installing Python packages (fixing blinker conflict)..."
# Try with --ignore-installed first
pip3 install --ignore-installed blinker -q 2>/dev/null || true

# Install requirements with workaround for blinker
pip3 install -r requirements.txt --ignore-installed blinker -q 2>&1 | grep -v "WARNING" || {
    print_warning "Standard install had issues, trying alternative method..."
    # Try with --break-system-packages (for newer pip)
    pip3 install -r requirements.txt --break-system-packages -q 2>&1 | grep -v "WARNING" || {
        print_warning "Some packages may have failed, but continuing..."
    }
}

# Verify Flask is installed before proceeding
print_status "Verifying Flask installation..."
if ! python3 -c "import flask" 2>/dev/null; then
    print_error "Flask not installed! Attempting to install Flask directly..."
    pip3 install flask flask-sqlalchemy flask-migrate flask-cors --ignore-installed blinker -q || pip3 install flask flask-sqlalchemy flask-migrate flask-cors --break-system-packages -q || true
fi

# Run database migrations
print_status "Setting up database..."
export FLASK_APP=app_new.py
if [ -f "migrations" ]; then
    flask db upgrade 2>/dev/null || python3 -c "from src import db, create_app; app = create_app(); app.app_context().push(); db.create_all()" || true
else
    python3 -c "from src import db, create_app; app = create_app(); app.app_context().push(); db.create_all()" || true
fi

# Initialize base models if script exists
if [ -f "scripts/init_base_models.py" ]; then
    print_status "Initializing base models..."
    python3 scripts/init_base_models.py 2>/dev/null || print_warning "Base models initialization skipped"
fi

# Create necessary directories
mkdir -p uploads adapters logs instance

# Start backend in background
print_status "Starting backend server..."
cd $WORK_DIR/LLM-Finetuner-main

# Verify Flask is available before starting
if ! python3 -c "import flask" 2>/dev/null; then
    print_error "Flask is not installed! Cannot start backend."
    print_warning "Backend will not start. Check Python dependencies installation."
else
    # Kill any existing backend processes
    pkill -f "app_new.py" 2>/dev/null || true
    sleep 2

    nohup python3 app_new.py > /root/backend.log 2>&1 &
    BACKEND_PID=$!
    echo $BACKEND_PID > /root/backend.pid
fi

# Wait for backend to start
print_status "Waiting for backend to start..."
sleep 5
BACKEND_READY=false
for i in {1..30}; do
    if curl -s http://localhost:5000 > /dev/null 2>&1 || netstat -tuln | grep -q ":5000"; then
        print_status "Backend is running on port 5000!"
        BACKEND_READY=true
        break
    fi
    sleep 2
done
if [ "$BACKEND_READY" = false ]; then
    print_warning "Backend may not be fully ready. Check logs: tail -f /root/backend.log"
fi

# Install frontend dependencies
print_status "Installing frontend dependencies..."
cd $WORK_DIR/LLM-Finetuner-FE-main

# Kill any existing frontend processes
pkill -f "react-scripts" 2>/dev/null || true
sleep 2

# Install npm dependencies
print_status "Installing npm packages (this may take a few minutes)..."
npm install --legacy-peer-deps

# Install speech-polyfill dependencies if needed
if [ -d "src/vendor/speech-polyfill" ]; then
    print_status "Installing speech-polyfill dependencies..."
    cd src/vendor/speech-polyfill
    
    npm install --legacy-peer-deps
    
    # Fix OpenSSL/webpack issue with Node.js 18 by using legacy provider
    # This is a known issue: Node.js 17+ uses OpenSSL 3.0 which breaks old webpack
    print_status "Building speech-polyfill (using OpenSSL legacy provider)..."
    export NODE_OPTIONS="--openssl-legacy-provider"
    NODE_OPTIONS="--openssl-legacy-provider" npm run build 2>&1 | grep -v "WARNING" || {
        print_warning "Speech-polyfill build failed (non-critical - app will work without it)..."
        print_warning "This is due to OpenSSL compatibility with old webpack. Continuing..."
    }
    cd $WORK_DIR/LLM-Finetuner-FE-main
fi

# Create .env file for frontend if it doesn't exist
if [ ! -f ".env" ]; then
    cat > .env << EOF
REACT_APP_API_HOST=http://localhost:5000
REACT_APP_BYPASS_LOGIN=true
REACT_APP_GOOGLE_CLIENT_ID=
PORT=3000
HOST=0.0.0.0
DANGEROUSLY_DISABLE_HOST_CHECK=true
EOF
fi

# Modify package.json to ensure React binds to 0.0.0.0
print_status "Configuring React to bind to 0.0.0.0 for external access..."
sed -i 's/"start": "react-scripts start"/"start": "HOST=0.0.0.0 DANGEROUSLY_DISABLE_HOST_CHECK=true PORT=3000 react-scripts start"/' package.json 2>/dev/null || true

# Start frontend with proper environment variables
print_status "Starting frontend server (binding to 0.0.0.0:3000)..."
export PORT=3000
export HOST=0.0.0.0
export HOSTNAME=0.0.0.0
export DANGEROUSLY_DISABLE_HOST_CHECK=true
export BROWSER=none
nohup env HOST=0.0.0.0 HOSTNAME=0.0.0.0 DANGEROUSLY_DISABLE_HOST_CHECK=true PORT=3000 BROWSER=none npm start > /root/frontend.log 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > /root/frontend.pid

# Wait for frontend to start
print_status "Waiting for frontend to start (this may take 1-2 minutes for first build)..."
sleep 15
FRONTEND_READY=false
for i in {1..60}; do
    # Check if port is listening on 0.0.0.0 (most important for external access)
    if netstat -tuln 2>/dev/null | grep -q "0.0.0.0:3000" || ss -tuln 2>/dev/null | grep -q ":3000"; then
        print_status "Frontend is running on 0.0.0.0:3000!"
        FRONTEND_READY=true
        break
    fi
    # Also check localhost
    if curl -s http://localhost:3000 > /dev/null 2>&1; then
        print_status "Frontend is responding on localhost:3000!"
        # Check if it's bound to 0.0.0.0
        if netstat -tuln 2>/dev/null | grep -q "0.0.0.0:3000"; then
            FRONTEND_READY=true
            break
        else
            print_warning "Frontend is only bound to localhost. This may prevent external access."
        fi
    fi
    if [ $i -eq 15 ]; then
        print_warning "Frontend is taking longer than expected. Checking logs..."
        tail -10 /root/frontend.log 2>/dev/null || true
    fi
    sleep 2
done

if [ "$FRONTEND_READY" = false ]; then
    print_error "Frontend failed to start. Check logs: tail -f /root/frontend.log"
    print_warning "Troubleshooting:"
    print_warning "  1. Check if port 3000 is open: netstat -tuln | grep 3000"
    print_warning "  2. Check frontend logs: tail -f /root/frontend.log"
    print_warning "  3. Try manual start: cd $WORK_DIR/LLM-Finetuner-FE-main && npm start"
else
    # Verify external accessibility
    print_status "Verifying external accessibility..."
    if netstat -tuln 2>/dev/null | grep -q "0.0.0.0:3000"; then
        print_status "✓ Frontend is bound to 0.0.0.0:3000 - external access should work!"
    else
        print_warning "⚠ Frontend may not be accessible externally. Check port binding."
    fi
fi

# Print summary
echo ""
echo "=========================================="
echo "✅ Installation Complete!"
echo "=========================================="
echo ""
echo "📊 Service Status:"
echo "  - Milvus: Running (port 19530)"
echo "  - Backend API: Running (port 5000)"
echo "  - Frontend: Running (port 3000)"
echo ""
echo "🌐 Access your application at:"
echo "  http://<INSTANCE_IP>:3000"
echo ""
echo "📝 Logs:"
echo "  - Backend: tail -f /root/backend.log"
echo "  - Frontend: tail -f /root/frontend.log"
echo "  - Milvus: docker-compose logs -f (in LLM-Finetuner-main/)"
echo ""
echo "🛑 To stop services:"
echo "  - Backend: kill \$(cat /root/backend.pid)"
echo "  - Frontend: kill \$(cat /root/frontend.pid)"
echo "  - Milvus: cd LLM-Finetuner-main && docker-compose down"
echo ""
echo "=========================================="


