#!/bin/bash
# Diagnostic script for frontend accessibility issues

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "=========================================="
echo "🔍 Frontend Diagnostic Script"
echo "=========================================="
echo ""

# 1. Check if frontend process is running
echo -e "${YELLOW}[1] Checking if frontend process is running...${NC}"
if pgrep -f "node.*react-scripts" > /dev/null || pgrep -f "npm start" > /dev/null; then
    echo -e "${GREEN}✓ Frontend process is running${NC}"
    ps aux | grep -E "node.*react-scripts|npm start" | grep -v grep | head -3
else
    echo -e "${RED}✗ Frontend process is NOT running${NC}"
fi
echo ""

# 2. Check if port 3000 is listening
echo -e "${YELLOW}[2] Checking if port 3000 is listening...${NC}"
if command -v netstat &> /dev/null; then
    if netstat -tlnp 2>/dev/null | grep -q ":3000 "; then
        echo -e "${GREEN}✓ Port 3000 is listening${NC}"
        netstat -tlnp 2>/dev/null | grep ":3000 "
        
        # Check if it's bound to 0.0.0.0 or 127.0.0.1
        if netstat -tlnp 2>/dev/null | grep ":3000 " | grep -q "0.0.0.0"; then
            echo -e "${GREEN}✓ Port is bound to 0.0.0.0 (accessible externally)${NC}"
        elif netstat -tlnp 2>/dev/null | grep ":3000 " | grep -q "127.0.0.1"; then
            echo -e "${RED}✗ Port is bound to 127.0.0.1 (NOT accessible externally!)${NC}"
            echo -e "${YELLOW}  Fix: Restart frontend with HOST=0.0.0.0${NC}"
        fi
    else
        echo -e "${RED}✗ Port 3000 is NOT listening${NC}"
    fi
elif command -v ss &> /dev/null; then
    if ss -tlnp 2>/dev/null | grep -q ":3000 "; then
        echo -e "${GREEN}✓ Port 3000 is listening${NC}"
        ss -tlnp 2>/dev/null | grep ":3000 "
        
        if ss -tlnp 2>/dev/null | grep ":3000 " | grep -q "0.0.0.0"; then
            echo -e "${GREEN}✓ Port is bound to 0.0.0.0 (accessible externally)${NC}"
        elif ss -tlnp 2>/dev/null | grep ":3000 " | grep -q "127.0.0.1"; then
            echo -e "${RED}✗ Port is bound to 127.0.0.1 (NOT accessible externally!)${NC}"
            echo -e "${YELLOW}  Fix: Restart frontend with HOST=0.0.0.0${NC}"
        fi
    else
        echo -e "${RED}✗ Port 3000 is NOT listening${NC}"
    fi
else
    echo -e "${YELLOW}⚠ netstat and ss not available${NC}"
fi
echo ""

# 3. Check frontend logs
echo -e "${YELLOW}[3] Checking frontend logs...${NC}"
if [ -f /tmp/frontend.log ]; then
    echo -e "${GREEN}Frontend log file found${NC}"
    echo -e "${YELLOW}Last 30 lines:${NC}"
    tail -30 /tmp/frontend.log
    
    # Check for compilation errors
    if grep -i "error\|failed\|compiled successfully" /tmp/frontend.log | tail -5; then
        echo ""
        if grep -i "compiled successfully" /tmp/frontend.log | tail -1; then
            echo -e "${GREEN}✓ Frontend compiled successfully${NC}"
        fi
        if grep -i "error" /tmp/frontend.log | tail -3; then
            echo -e "${RED}✗ Errors found in logs${NC}"
        fi
    fi
else
    echo -e "${YELLOW}⚠ Frontend log file not found${NC}"
fi
echo ""

# 4. Test localhost access
echo -e "${YELLOW}[4] Testing localhost:3000 access...${NC}"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "304" ]; then
    echo -e "${GREEN}✓ Frontend responds with HTTP $HTTP_CODE${NC}"
    # Try to get a snippet of the page
    PAGE_CONTENT=$(curl -s http://localhost:3000 2>/dev/null | head -5)
    if echo "$PAGE_CONTENT" | grep -q "LLM Finetuner\|VAISICO\|root\|<!DOCTYPE html"; then
        echo -e "${GREEN}✓ Frontend is serving the correct application${NC}"
    else
        echo -e "${YELLOW}⚠ Frontend responds but may not be serving the correct app${NC}"
    fi
else
    echo -e "${RED}✗ Frontend does not respond (HTTP $HTTP_CODE)${NC}"
fi
echo ""

# 5. Check .env file
echo -e "${YELLOW}[5] Checking frontend .env file...${NC}"
FRONTEND_DIR="/root/LLM_RAG/LLM-Finetuner-FE-main"
if [ -f "$FRONTEND_DIR/.env" ]; then
    echo -e "${GREEN}.env file exists:${NC}"
    cat "$FRONTEND_DIR/.env"
    
    if grep -q "HOST=0.0.0.0" "$FRONTEND_DIR/.env"; then
        echo -e "${GREEN}✓ HOST=0.0.0.0 is set${NC}"
    else
        echo -e "${RED}✗ HOST=0.0.0.0 is NOT set!${NC}"
    fi
else
    echo -e "${RED}✗ .env file not found!${NC}"
fi
echo ""

# 6. Check npm/node
echo -e "${YELLOW}[6] Checking npm/node installation...${NC}"
if command -v node &> /dev/null; then
    echo -e "${GREEN}✓ Node.js: $(node -v)${NC}"
else
    echo -e "${RED}✗ Node.js not found!${NC}"
fi

if command -v npm &> /dev/null; then
    echo -e "${GREEN}✓ npm: $(npm -v)${NC}"
else
    echo -e "${RED}✗ npm not found!${NC}"
fi
echo ""

# 7. Check screen session
echo -e "${YELLOW}[7] Checking screen sessions...${NC}"
if screen -list | grep -q "llm-rag-frontend"; then
    echo -e "${GREEN}✓ Frontend screen session exists${NC}"
    screen -list | grep "llm-rag-frontend"
    echo -e "${YELLOW}  To view: screen -r llm-rag-frontend${NC}"
else
    echo -e "${RED}✗ Frontend screen session not found${NC}"
fi
echo ""

# 8. Get external IP
echo -e "${YELLOW}[8] External IP information...${NC}"
EXTERNAL_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s ipinfo.io/ip 2>/dev/null || echo "Unable to determine")
echo "External IP: $EXTERNAL_IP"
echo "Frontend URL: http://${EXTERNAL_IP}:3000"
echo ""

# 9. Recommendations
echo "=========================================="
echo -e "${YELLOW}💡 Recommendations:${NC}"
echo "=========================================="

if ! pgrep -f "node.*react-scripts\|npm start" > /dev/null; then
    echo "1. Frontend is not running. Restart it:"
    echo "   cd /root/LLM_RAG/LLM-Finetuner-FE-main"
    echo "   screen -dmS llm-rag-frontend bash -c '"
    echo "     export REACT_APP_API_HOST=http://localhost:5000"
    echo "     export REACT_APP_BYPASS_LOGIN=true"
    echo "     export PORT=3000"
    echo "     export HOST=0.0.0.0"
    echo "     export DANGEROUSLY_DISABLE_HOST_CHECK=true"
    echo "     BROWSER=none npm start 2>&1 | tee /tmp/frontend.log"
    echo "   '"
    echo ""
fi

if netstat -tlnp 2>/dev/null | grep ":3000 " | grep -q "127.0.0.1" || ss -tlnp 2>/dev/null | grep ":3000 " | grep -q "127.0.0.1"; then
    echo "2. Port is bound to localhost. Kill and restart with HOST=0.0.0.0:"
    echo "   pkill -f 'node.*react-scripts\|npm start'"
    echo "   # Then restart as shown above"
    echo ""
fi

if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "304" ]; then
    echo "3. Frontend is not responding. Check compilation status:"
    echo "   screen -r llm-rag-frontend"
    echo "   # Look for 'Compiled successfully!' message"
    echo ""
fi

echo "4. If port forwarding is not working, check vast.ai template:"
echo "   - Ports 3000, 5000, 19530 should be configured"
echo "   - Port forwarding should be enabled"
echo ""

echo "=========================================="

