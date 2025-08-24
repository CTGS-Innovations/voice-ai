#!/bin/bash

# Setup ngrok for Jambonz WebSocket application
# This script helps expose your local WebSocket app to the internet

echo "================================================"
echo "Jambonz ngrok Setup Script"
echo "================================================"

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
    echo "❌ ngrok is not installed!"
    echo ""
    echo "Please install ngrok first:"
    echo "  - macOS: brew install ngrok"
    echo "  - Linux: snap install ngrok"
    echo "  - Or download from: https://ngrok.com/download"
    echo ""
    exit 1
fi

# Check for ngrok auth token
if [ -z "$1" ]; then
    echo "ℹ️  No ngrok auth token provided as argument"
    echo "   If you have an ngrok account, run: ./setup-ngrok.sh YOUR_AUTH_TOKEN"
    echo "   Using free tier (limited to 2 hour sessions)"
    echo ""
else
    echo "✅ Setting ngrok auth token..."
    ngrok config add-authtoken $1
fi

# Start ngrok for WebSocket port
echo "🚀 Starting ngrok tunnel for WebSocket application (port 3003)..."
echo ""
echo "IMPORTANT: Once ngrok starts:"
echo "1. Copy the 'Forwarding' URL (e.g., https://abc123.ngrok.io)"
echo "2. Update the .env file with:"
echo "   APP_WEBSOCKET_URL=wss://abc123.ngrok.io/ws"
echo "3. Use this URL when configuring your Jambonz application"
echo ""
echo "Press Ctrl+C to stop ngrok when done"
echo "================================================"

# Start ngrok
ngrok http 3003