#!/bin/bash
# Quick fix script for the current installation issues

echo "🔧 Fixing installation issues..."

cd /root/LLM_RAG || exit 1

# Fix Python dependencies
echo "1. Fixing Python dependencies..."
cd LLM-Finetuner-main

# Install Flask and core dependencies first
pip3 install --ignore-installed blinker flask flask-sqlalchemy flask-migrate flask-cors -q 2>/dev/null || \
pip3 install --break-system-packages blinker flask flask-sqlalchemy flask-migrate flask-cors -q 2>/dev/null || true

# Install all requirements
pip3 install -r requirements.txt --ignore-installed blinker -q 2>&1 | grep -v "WARNING" || \
pip3 install -r requirements.txt --break-system-packages -q 2>&1 | grep -v "WARNING" || true

# Verify Flask is installed
if python3 -c "import flask" 2>/dev/null; then
    echo "   ✓ Flask installed successfully"
else
    echo "   ✗ Flask still not installed. Trying manual install..."
    pip3 install flask --break-system-packages || pip3 install flask --user
fi

# Fix speech-polyfill build
echo ""
echo "2. Fixing speech-polyfill build..."
cd ../LLM-Finetuner-FE-main/src/vendor/speech-polyfill

# Set OpenSSL legacy provider
export NODE_OPTIONS="--openssl-legacy-provider"
NODE_OPTIONS="--openssl-legacy-provider" npm run build 2>&1 | grep -v "WARNING" || {
    echo "   ⚠ Speech-polyfill build failed (non-critical)"
}

cd /root/LLM_RAG/LLM-Finetuner-main

# Start backend if Flask is available
echo ""
echo "3. Starting backend..."
if python3 -c "import flask" 2>/dev/null; then
    pkill -f "app_new.py" 2>/dev/null || true
    sleep 2
    
    export DATABASE_URL=sqlite:///./llm_rag.db
    export MILVUS_HOST=localhost
    export MILVUS_PORT=19530
    export BYPASS_LOGIN=true
    export FLASK_DEBUG=0
    export PORT=5000
    
    nohup python3 app_new.py > /root/backend.log 2>&1 &
    echo $! > /root/backend.pid
    echo "   ✓ Backend started (PID: $(cat /root/backend.pid))"
    sleep 5
    
    # Check if backend is running
    if netstat -tuln 2>/dev/null | grep -q ":5000" || ss -tuln 2>/dev/null | grep -q ":5000"; then
        echo "   ✓ Backend is listening on port 5000"
    else
        echo "   ⚠ Backend may still be starting. Check: tail -f /root/backend.log"
    fi
else
    echo "   ✗ Cannot start backend - Flask not installed"
    echo "   Try: pip3 install flask --break-system-packages"
fi

# Check frontend
echo ""
echo "4. Checking frontend..."
if netstat -tuln 2>/dev/null | grep -q "0.0.0.0:3000" || ss -tuln 2>/dev/null | grep -q "0.0.0.0:3000"; then
    echo "   ✓ Frontend is running on 0.0.0.0:3000"
else
    echo "   ⚠ Frontend may not be running. Check: tail -f /root/frontend.log"
fi

echo ""
echo "✅ Fix complete!"
echo ""
echo "Check status:"
echo "  - Backend: netstat -tuln | grep 5000"
echo "  - Frontend: netstat -tuln | grep 3000"
echo "  - Logs: tail -f /root/backend.log"

