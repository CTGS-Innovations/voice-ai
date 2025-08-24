#!/bin/bash

# Jambonz Development Environment Setup Script
# This script initializes the complete Jambonz stack with VoIP.ms integration

set -e

echo "================================================"
echo "🚀 Jambonz Development Environment Setup"
echo "================================================"
echo ""

# Check for Docker and Docker Compose
echo "📋 Checking prerequisites..."
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    echo "   Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    echo "   Visit: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✅ Docker and Docker Compose are installed"
echo ""

# Check for .env file
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    echo "   Please copy .env.example to .env and configure your settings"
    exit 1
fi

# Load environment variables
source .env

# Check for required VoIP.ms credentials
if [ -z "$VOIPMS_USERNAME" ] || [ "$VOIPMS_USERNAME" == "your_voipms_username" ]; then
    echo "⚠️  Warning: VoIP.ms credentials not configured in .env"
    echo "   The system will start but VoIP.ms integration won't work"
    echo "   Please update VOIPMS_USERNAME and VOIPMS_PASSWORD in .env"
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Step 1: Download database scripts
echo "1️⃣  Preparing database initialization scripts..."
cd database
if [ ! -f "01-jambones-sql.sql" ]; then
    ./init-db.sh
fi
cd ..
echo "   ✅ Database scripts ready"
echo ""

# Step 2: Build application container
echo "2️⃣  Building application container..."
cd app
if [ ! -d "node_modules" ]; then
    npm install
fi
cd ..
echo "   ✅ Application ready"
echo ""

# Step 3: Start Docker containers
echo "3️⃣  Starting Jambonz stack with Docker Compose..."
docker compose up -d

# Wait for services to be ready
echo ""
echo "⏳ Waiting for services to initialize..."
echo "   This may take a few minutes on first run..."

# Function to check if service is ready
check_service() {
    local service=$1
    local port=$2
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if nc -z localhost $port 2>/dev/null; then
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 2
    done
    return 1
}

# Check MySQL
echo -n "   Waiting for MySQL..."
if check_service "MySQL" 3306; then
    echo " ✅"
else
    echo " ❌ Timeout"
    echo "   Please check Docker logs: docker-compose logs mysql"
    exit 1
fi

# Check Redis
echo -n "   Waiting for Redis..."
if check_service "Redis" 6379; then
    echo " ✅"
else
    echo " ❌ Timeout"
fi

# Check API Server
echo -n "   Waiting for API Server..."
if check_service "API Server" 3000; then
    echo " ✅"
else
    echo " ❌ Timeout"
fi

# Check Feature Server
echo -n "   Waiting for Feature Server..."
if check_service "Feature Server" 3001; then
    echo " ✅"
else
    echo " ❌ Timeout"
fi

# Check WebApp
echo -n "   Waiting for Web Application..."
if check_service "WebApp" 3002; then
    echo " ✅"
else
    echo " ❌ Timeout"
fi

# Check Application
echo -n "   Waiting for Voice Application..."
if check_service "Voice App" 3003; then
    echo " ✅"
else
    echo " ❌ Timeout"
fi

echo ""
echo "================================================"
echo "✨ Jambonz stack is running!"
echo "================================================"
echo ""
echo "📚 Service URLs:"
echo "   • Web Portal:    http://localhost:3002"
echo "   • API Server:    http://localhost:3000"
echo "   • WebSocket App: ws://localhost:3003"
echo "   • MySQL:         localhost:3306"
echo "   • Redis:         localhost:6379"
echo ""
echo "🔐 Default Credentials:"
echo "   • Admin User:    admin"
echo "   • Admin Pass:    admin (change on first login)"
echo ""
echo "📋 Next Steps:"
echo "   1. Access the web portal at http://localhost:3002"
echo "   2. Log in and change the admin password"
echo "   3. Run ./scripts/setup-ngrok.sh to expose your app"
echo "   4. Configure your application with the ngrok URL"
echo "   5. Run ./scripts/configure-voipms.js to set up VoIP.ms"
echo ""
echo "🛑 To stop the stack: docker-compose down"
echo "📊 To view logs: docker-compose logs -f [service-name]"
echo "🔄 To restart: docker-compose restart"
echo ""
echo "================================================"