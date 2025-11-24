#!/bin/bash
# Alternative: Production build version (more reliable for external access)
# This builds the React app and serves it with a simple HTTP server

# After the main installation, add this to start frontend in production mode:

cd /root/LLM_RAG/LLM-Finetuner-FE-main

print_status "Building React app for production..."
npm run build

print_status "Installing serve package..."
npm install -g serve

print_status "Starting production server on 0.0.0.0:3000..."
pkill -f "react-scripts" 2>/dev/null || true
pkill -f "serve" 2>/dev/null || true
sleep 2

nohup serve -s build -l 3000 --host 0.0.0.0 > /root/frontend.log 2>&1 &
echo $! > /root/frontend.pid

print_status "Production frontend server started on port 3000"

