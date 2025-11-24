#!/bin/bash
# Comprehensive check and fix script for LLM_RAG deployment

echo "=========================================="
echo "🔍 LLM_RAG Status Check & Fix"
echo "=========================================="
echo ""

WORK_DIR="/root/LLM_RAG"
cd $WORK_DIR || exit 1

# Check if installation is still running
echo "1. Checking if installation is still running..."
if pgrep -f "vast_ai_onstart.sh" > /dev/null; then
    echo "   ⏳ Installation script is still running. Please wait..."
    echo "   Check progress: tail -f /root/frontend.log"
    exit 0
fi

# Check frontend process
echo ""
echo "2. Checking frontend process..."
if [ -f "/root/frontend.pid" ]; then
    FRONTEND_PID=$(cat /root/frontend.pid)
    if ps -p $FRONTEND_PID > /dev/null 2>&1; then
        echo "   ✓ Frontend process running (PID: $FRONTEND_PID)"
    else
        echo "   ✗ Frontend process NOT running (PID file exists but process dead)"
        echo "   → Restarting frontend..."
        cd $WORK_DIR/LLM-Finetuner-FE-main
        pkill -f "react-scripts" 2>/dev/null || true
        sleep 2
        
        # Update .env
        cat > .env << EOF
REACT_APP_API_HOST=http://localhost:5000
REACT_APP_BYPASS_LOGIN=true
REACT_APP_GOOGLE_CLIENT_ID=
PORT=3000
HOST=0.0.0.0
DANGEROUSLY_DISABLE_HOST_CHECK=true
EOF
        
        # Update package.json
        sed -i 's/"start": "react-scripts start"/"start": "HOST=0.0.0.0 DANGEROUSLY_DISABLE_HOST_CHECK=true PORT=3000 react-scripts start"/' package.json 2>/dev/null || true
        
        # Start frontend
        export PORT=3000
        export HOST=0.0.0.0
        export HOSTNAME=0.0.0.0
        export DANGEROUSLY_DISABLE_HOST_CHECK=true
        export BROWSER=none
        
        nohup env HOST=0.0.0.0 HOSTNAME=0.0.0.0 DANGEROUSLY_DISABLE_HOST_CHECK=true PORT=3000 BROWSER=none npm start > /root/frontend.log 2>&1 &
        echo $! > /root/frontend.pid
        echo "   ✓ Frontend restarted. Waiting 15 seconds..."
        sleep 15
    fi
else
    echo "   ✗ Frontend PID file not found"
    echo "   → Starting frontend..."
    cd $WORK_DIR/LLM-Finetuner-FE-main || exit 1
    
    # Ensure .env exists
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
    
    # Update package.json
    sed -i 's/"start": "react-scripts start"/"start": "HOST=0.0.0.0 DANGEROUSLY_DISABLE_HOST_CHECK=true PORT=3000 react-scripts start"/' package.json 2>/dev/null || true
    
    # Start frontend
    export PORT=3000
    export HOST=0.0.0.0
    export HOSTNAME=0.0.0.0
    export DANGEROUSLY_DISABLE_HOST_CHECK=true
    export BROWSER=none
    
    nohup env HOST=0.0.0.0 HOSTNAME=0.0.0.0 DANGEROUSLY_DISABLE_HOST_CHECK=true PORT=3000 BROWSER=none npm start > /root/frontend.log 2>&1 &
    echo $! > /root/frontend.pid
    echo "   ✓ Frontend started. Waiting 15 seconds..."
    sleep 15
fi

# Check port binding
echo ""
echo "3. Checking port 3000 binding..."
if netstat -tuln 2>/dev/null | grep -q "0.0.0.0:3000" || ss -tuln 2>/dev/null | grep -q "0.0.0.0:3000"; then
    echo "   ✓ Port 3000 is bound to 0.0.0.0 (external access enabled)"
    netstat -tuln 2>/dev/null | grep ":3000" || ss -tuln 2>/dev/null | grep ":3000"
elif netstat -tuln 2>/dev/null | grep -q ":3000" || ss -tuln 2>/dev/null | grep -q ":3000"; then
    echo "   ⚠ Port 3000 is listening but may not be bound to 0.0.0.0"
    netstat -tuln 2>/dev/null | grep ":3000" || ss -tuln 2>/dev/null | grep ":3000"
    echo "   → This may prevent external access. Restarting with correct binding..."
    cd $WORK_DIR/LLM-Finetuner-FE-main
    pkill -f "react-scripts" 2>/dev/null || true
    sleep 2
    
    export PORT=3000
    export HOST=0.0.0.0
    export HOSTNAME=0.0.0.0
    export DANGEROUSLY_DISABLE_HOST_CHECK=true
    export BROWSER=none
    
    nohup env HOST=0.0.0.0 HOSTNAME=0.0.0.0 DANGEROUSLY_DISABLE_HOST_CHECK=true PORT=3000 BROWSER=none npm start > /root/frontend.log 2>&1 &
    echo $! > /root/frontend.pid
    sleep 15
else
    echo "   ✗ Port 3000 is NOT listening"
    echo "   → Check frontend logs: tail -50 /root/frontend.log"
fi

# Check backend
echo ""
echo "4. Checking backend (port 5000)..."
if netstat -tuln 2>/dev/null | grep -q ":5000" || ss -tuln 2>/dev/null | grep -q ":5000"; then
    echo "   ✓ Backend is running on port 5000"
else
    echo "   ✗ Backend is NOT running"
    echo "   → Starting backend..."
    cd $WORK_DIR/LLM-Finetuner-main
    export DATABASE_URL=sqlite:///./llm_rag.db
    export MILVUS_HOST=localhost
    export MILVUS_PORT=19530
    export BYPASS_LOGIN=true
    export FLASK_DEBUG=0
    export PORT=5000
    
    nohup python3 app_new.py > /root/backend.log 2>&1 &
    echo $! > /root/backend.pid
    echo "   ✓ Backend started"
fi

# Check Milvus
echo ""
echo "5. Checking Milvus..."
if docker ps 2>/dev/null | grep -q "milvus"; then
    echo "   ✓ Milvus containers are running"
else
    echo "   ✗ Milvus containers are NOT running"
    echo "   → Starting Milvus..."
    cd $WORK_DIR/LLM-Finetuner-main
    docker-compose up -d
    echo "   ✓ Milvus starting (may take 30 seconds)"
fi

# Get instance IP
echo ""
echo "6. Network Information:"
INSTANCE_IP=$(hostname -I | awk '{print $1}' || curl -s ifconfig.me || echo "Unable to determine")
echo "   Instance IP: $INSTANCE_IP"
echo "   Access URL: http://$INSTANCE_IP:3000"

# Show recent logs
echo ""
echo "7. Recent Frontend Logs (last 20 lines):"
echo "=========================================="
tail -20 /root/frontend.log 2>/dev/null || echo "   No frontend log found"

echo ""
echo "=========================================="
echo "✅ Status Check Complete"
echo "=========================================="
echo ""
echo "If frontend is still not accessible:"
echo "  1. Check logs: tail -f /root/frontend.log"
echo "  2. Verify port: netstat -tuln | grep 3000"
echo "  3. Test locally: curl http://localhost:3000"
echo "  4. Check firewall: iptables -L -n | grep 3000"
echo ""

