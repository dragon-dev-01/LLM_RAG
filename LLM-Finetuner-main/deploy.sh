#!/bin/bash
# Production deployment script for LLM RAG Backend

set -e  # Exit on error

echo "🚀 Starting LLM RAG Backend Deployment..."

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
   echo "⚠️  Please do not run as root"
   exit 1
fi

# Load environment variables
if [ -f .env.production ]; then
    echo "📋 Loading .env.production..."
    export $(cat .env.production | grep -v '^#' | xargs)
elif [ -f .env ]; then
    echo "📋 Loading .env..."
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "⚠️  No .env file found. Using system environment variables."
fi

# Check required environment variables
REQUIRED_VARS=("DATABASE_URL")
MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        MISSING_VARS+=("$var")
    fi
done

if [ ${#MISSING_VARS[@]} -ne 0 ]; then
    echo "❌ Missing required environment variables:"
    printf '   %s\n' "${MISSING_VARS[@]}"
    exit 1
fi

# Check Python version
PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
echo "🐍 Python version: $PYTHON_VERSION"

# Install/upgrade dependencies
echo "📦 Installing dependencies..."
pip install -r requirements.txt
pip install gunicorn  # Ensure Gunicorn is installed

# Run database migrations
echo "🗄️  Running database migrations..."
export FLASK_APP=app_new.py
flask db upgrade

# Initialize base models if needed
if [ ! -f .base_models_initialized ]; then
    echo "🔧 Initializing base models..."
    python3 scripts/init_base_models.py
    touch .base_models_initialized
fi

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p adapters
mkdir -p logs

# Check if Gunicorn config exists
if [ -f gunicorn_config.py ]; then
    echo "✅ Using gunicorn_config.py"
    GUNICORN_CMD="gunicorn -c gunicorn_config.py app_new:app"
else
    echo "⚠️  Using default Gunicorn configuration"
    WORKERS=${GUNICORN_WORKERS:-4}
    GUNICORN_CMD="gunicorn -w $WORKERS -b 0.0.0.0:5000 --timeout 300 app_new:app"
fi

# Start the application
echo "🎯 Starting application with Gunicorn..."
echo "   Command: $GUNICORN_CMD"
echo ""

exec $GUNICORN_CMD

