#!/bin/bash
# Diagnostic script to check service status and network configuration

echo "=========================================="
echo "🔍 LLM_RAG Service Diagnostic"
echo "=========================================="
echo ""

# Check if services are running
echo "📊 Service Status:"
echo ""

# Check Frontend (port 3000)
echo "Frontend (port 3000):"
if netstat -tuln 2>/dev/null | grep -q ":3000" || ss -tuln 2>/dev/null | grep -q ":3000"; then
    echo "  ✓ Port 3000 is listening"
    netstat -tuln 2>/dev/null | grep ":3000" || ss -tuln 2>/dev/null | grep ":3000"
    if netstat -tuln 2>/dev/null | grep -q "0.0.0.0:3000" || ss -tuln 2>/dev/null | grep -q "0.0.0.0:3000"; then
        echo "  ✓ Bound to 0.0.0.0 (external access enabled)"
    else
        echo "  ⚠ Only bound to localhost (external access may not work)"
    fi
else
    echo "  ✗ Port 3000 is NOT listening"
fi

# Check Backend (port 5000)
echo ""
echo "Backend (port 5000):"
if netstat -tuln 2>/dev/null | grep -q ":5000" || ss -tuln 2>/dev/null | grep -q ":5000"; then
    echo "  ✓ Port 5000 is listening"
    netstat -tuln 2>/dev/null | grep ":5000" || ss -tuln 2>/dev/null | grep ":5000"
else
    echo "  ✗ Port 5000 is NOT listening"
fi

# Check Milvus (port 19530)
echo ""
echo "Milvus (port 19530):"
if netstat -tuln 2>/dev/null | grep -q ":19530" || ss -tuln 2>/dev/null | grep -q ":19530"; then
    echo "  ✓ Port 19530 is listening"
else
    echo "  ✗ Port 19530 is NOT listening"
fi

# Check process status
echo ""
echo "📋 Process Status:"
if [ -f "/root/frontend.pid" ]; then
    FRONTEND_PID=$(cat /root/frontend.pid)
    if ps -p $FRONTEND_PID > /dev/null 2>&1; then
        echo "  ✓ Frontend process running (PID: $FRONTEND_PID)"
    else
        echo "  ✗ Frontend process NOT running (PID file exists but process dead)"
    fi
else
    echo "  ⚠ Frontend PID file not found"
fi

if [ -f "/root/backend.pid" ]; then
    BACKEND_PID=$(cat /root/backend.pid)
    if ps -p $BACKEND_PID > /dev/null 2>&1; then
        echo "  ✓ Backend process running (PID: $BACKEND_PID)"
    else
        echo "  ✗ Backend process NOT running (PID file exists but process dead)"
    fi
else
    echo "  ⚠ Backend PID file not found"
fi

# Check Docker/Milvus
echo ""
echo "🐳 Docker Status:"
if command -v docker &> /dev/null; then
    if docker ps | grep -q "milvus"; then
        echo "  ✓ Milvus containers are running"
        docker ps | grep milvus
    else
        echo "  ✗ Milvus containers are NOT running"
    fi
else
    echo "  ✗ Docker not installed"
fi

# Test local connectivity
echo ""
echo "🌐 Local Connectivity Tests:"
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "  ✓ Frontend responds on localhost:3000"
else
    echo "  ✗ Frontend does NOT respond on localhost:3000"
fi

if curl -s http://localhost:5000 > /dev/null 2>&1; then
    echo "  ✓ Backend responds on localhost:5000"
else
    echo "  ✗ Backend does NOT respond on localhost:5000"
fi

# Get instance IP
echo ""
echo "🌍 Network Information:"
INSTANCE_IP=$(hostname -I | awk '{print $1}' || curl -s ifconfig.me || echo "Unable to determine")
echo "  Instance IP: $INSTANCE_IP"
echo "  Access URL: http://$INSTANCE_IP:3000"

# Check firewall (if iptables is available)
echo ""
echo "🔥 Firewall Status:"
if command -v iptables &> /dev/null; then
    if iptables -L -n | grep -q "3000"; then
        echo "  ⚠ iptables rules found for port 3000"
        iptables -L -n | grep "3000"
    else
        echo "  ✓ No iptables rules blocking port 3000"
    fi
fi

echo ""
echo "=========================================="
echo "📝 Recent Logs (last 5 lines):"
echo "=========================================="
echo ""
echo "Frontend log:"
tail -5 /root/frontend.log 2>/dev/null || echo "  No frontend log found"
echo ""
echo "Backend log:"
tail -5 /root/backend.log 2>/dev/null || echo "  No backend log found"
echo ""

