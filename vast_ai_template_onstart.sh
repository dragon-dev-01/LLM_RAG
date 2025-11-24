#!/bin/bash
# VAST.AI Template On-Start Script
# This script clones the repository and runs the installation script

set +e

echo "=========================================="
echo "🚀 Starting LLM_RAG Deployment"
echo "=========================================="
echo ""

# Set working directory
WORK_DIR="/root/LLM_RAG"
mkdir -p $WORK_DIR
cd $WORK_DIR

# Clone repository
echo "📥 Cloning LLM_RAG repository..."
if [ -d ".git" ]; then
    echo "Repository already exists, pulling latest changes..."
    git pull origin main || git clone https://github.com/dragon-dev-01/LLM_RAG.git . --depth 1
else
    git clone https://github.com/dragon-dev-01/LLM_RAG.git . --depth 1 || {
        echo "❌ Failed to clone repository"
        exit 1
    }
fi

# Make installation script executable
if [ -f "vast_ai_onstart.sh" ]; then
    chmod +x vast_ai_onstart.sh
    echo "✅ Running installation script..."
    echo ""
    # Execute the installation script
    bash vast_ai_onstart.sh
else
    echo "❌ Installation script not found: vast_ai_onstart.sh"
    exit 1
fi

