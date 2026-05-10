#!/bin/bash

set -e

echo "=== OlcPanel Update Script ==="
echo ""

# Pull latest changes
echo "Pulling latest changes from git..."
git pull origin main

# Rebuild images
echo ""
echo "Rebuilding Docker images..."
docker compose build --no-cache

# Restart services
echo ""
echo "Restarting services..."
docker compose restart backend frontend

echo ""
echo "=== Update complete ==="
echo ""
echo "IMPORTANT: Stop and restart all running instances through the panel"
echo "to apply the new OlcRTC image with traffic monitoring support."
