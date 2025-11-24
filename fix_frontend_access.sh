#!/bin/bash
# Quick fix script to restart frontend with proper external access configuration

echo "🔧 Fixing frontend external access..."

cd /root/LLM_RAG/LLM-Finetuner-FE-main || {
    echo "❌ Directory not found. Make sure installation completed."
    exit 1
}

# Kill existing frontend processes
echo "Stopping existing frontend processes..."
pkill -f "react-scripts" 2>/dev/null || true
pkill -f "node.*3000" 2>/dev/null || true
sleep 2

# Update .env file
echo "Updating .env file..."
cat > .env << EOF
REACT_APP_API_HOST=http://localhost:5000
REACT_APP_BYPASS_LOGIN=true
REACT_APP_GOOGLE_CLIENT_ID=
PORT=3000
HOST=0.0.0.0
DANGEROUSLY_DISABLE_HOST_CHECK=true
EOF

# Update package.json start script
echo "Updating package.json..."
sed -i 's/"start": "react-scripts start"/"start": "HOST=0.0.0.0 DANGEROUSLY_DISABLE_HOST_CHECK=true PORT=3000 react-scripts start"/' package.json 2>/dev/null || true

# Start frontend with proper environment
echo "Starting frontend on 0.0.0.0:3000..."
export PORT=3000
export HOST=0.0.0.0
export HOSTNAME=0.0.0.0
export DANGEROUSLY_DISABLE_HOST_CHECK=true
export BROWSER=none

nohup env HOST=0.0.0.0 HOSTNAME=0.0.0.0 DANGEROUSLY_DISABLE_HOST_CHECK=true PORT=3000 BROWSER=none npm start > /root/frontend.log 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > /root/frontend.pid

echo "✓ Frontend started with PID: $FRONTEND_PID"
echo "Waiting for frontend to initialize..."
sleep 10

# Check if it's bound correctly
if netstat -tuln 2>/dev/null | grep -q "0.0.0.0:3000" || ss -tuln 2>/dev/null | grep -q "0.0.0.0:3000"; then
    echo "✅ Frontend is now bound to 0.0.0.0:3000"
    echo "🌐 Access at: http://<INSTANCE_IP>:3000"
else
    echo "⚠ Frontend may still be starting. Check logs: tail -f /root/frontend.log"
    echo "Check binding: netstat -tuln | grep 3000"
fi

