#!/bin/bash

# Telegram Local Bot API - Quick Setup Script
# This script sets up Local Bot API server using Docker
# Supports files up to 2GB (vs standard 20MB limit)

set -e

echo "🚀 Telegram Local Bot API Setup"
echo "================================"
echo ""

# Configuration
API_ID="39393207"
API_HASH="3c4a53eb3ab8d184bfdbd12acb519b98"
CONTAINER_NAME="telegram-bot-api"
PORT="8081"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found!"
    echo "Please install Docker first:"
    echo "  curl -fsSL https://get.docker.com -o get-docker.sh"
    echo "  sudo sh get-docker.sh"
    exit 1
fi

echo "✅ Docker found"

# Check if container already exists
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "⚠️  Container '${CONTAINER_NAME}' already exists"
    read -p "Remove and recreate? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🗑️  Removing old container..."
        docker stop ${CONTAINER_NAME} 2>/dev/null || true
        docker rm ${CONTAINER_NAME} 2>/dev/null || true
    else
        echo "Aborted."
        exit 0
    fi
fi

echo ""
echo "📦 Pulling Docker image..."
docker pull aiogram/telegram-bot-api:latest

echo ""
echo "🔧 Creating container..."
docker run -d \
  --name ${CONTAINER_NAME} \
  --restart=always \
  -p ${PORT}:8081 \
  -e TELEGRAM_API_ID=${API_ID} \
  -e TELEGRAM_API_HASH=${API_HASH} \
  -v telegram-bot-api-data:/var/lib/telegram-bot-api \
  aiogram/telegram-bot-api:latest

echo ""
echo "⏳ Waiting for server to start..."
sleep 3

# Check if container is running
if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "✅ Container running successfully!"
    echo ""
    echo "📊 Container status:"
    docker ps | grep ${CONTAINER_NAME}
    echo ""
    echo "📝 Logs:"
    docker logs ${CONTAINER_NAME} --tail 10
    echo ""
    echo "✅ Setup complete!"
    echo ""
    echo "📌 Next steps:"
    echo "1. Add to your .env file:"
    echo "   TELEGRAM_USE_LOCAL_API=true"
    echo "   TELEGRAM_LOCAL_API_URL=http://localhost:${PORT}"
    echo ""
    echo "2. Restart your backend:"
    echo "   pm2 restart zexgram-backend"
    echo "   # or: npm start"
    echo ""
    echo "3. Test with a file > 20MB"
    echo ""
    echo "📚 View logs: docker logs ${CONTAINER_NAME} -f"
    echo "🔄 Restart: docker restart ${CONTAINER_NAME}"
    echo "🛑 Stop: docker stop ${CONTAINER_NAME}"
    echo ""
else
    echo "❌ Failed to start container"
    echo "Check logs with: docker logs ${CONTAINER_NAME}"
    exit 1
fi
