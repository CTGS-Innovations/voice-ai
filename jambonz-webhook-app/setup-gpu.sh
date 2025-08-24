#!/bin/bash

# GPU-Accelerated Jambonz Setup Script for Unraid
echo "=========================================="
echo "Setting up GPU-Accelerated Jambonz System"
echo "=========================================="

# Check for NVIDIA GPU
if ! command -v nvidia-smi &> /dev/null; then
    echo "❌ NVIDIA GPU not detected. Please install NVIDIA drivers first."
    exit 1
fi

echo "✅ NVIDIA GPU detected:"
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader

# Check for Docker with GPU support
if ! docker run --rm --gpus all nvidia/cuda:12.1-base-ubuntu22.04 nvidia-smi &> /dev/null; then
    echo "❌ Docker GPU support not working. Please install nvidia-docker2."
    exit 1
fi

echo "✅ Docker GPU support confirmed"

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p models/{faster-whisper,coqui,llama,ollama,bark}
mkdir -p audio-gpu
mkdir -p grafana/provisioning/{dashboards,datasources}
mkdir -p bark-service

# Download model files (this will take some time)
echo "📥 Setting up model directories (models will be downloaded on first run)..."

# Create Prometheus config
cat > prometheus.yml << EOF
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'gpu-webhook'
    static_configs:
      - targets: ['gpu-webhook-app:3004']
  
  - job_name: 'gpu-metrics'
    static_configs:
      - targets: ['gpu-monitor:9400']
  
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['localhost:9100']
EOF

# Create Grafana datasource config
cat > grafana/provisioning/datasources/prometheus.yml << EOF
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: true
EOF

# Create Grafana dashboard config
cat > grafana/provisioning/dashboards/dashboard.yml << EOF
apiVersion: 1

providers:
  - name: 'default'
    orgId: 1
    folder: ''
    type: file
    disableDeletion: false
    updateIntervalSeconds: 10
    allowUiUpdates: true
    options:
      path: /etc/grafana/provisioning/dashboards
EOF

# Install Node.js dependencies if not already installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing Node.js dependencies..."
    npm install
    npm install axios form-data
fi

# Copy environment file
cp .env.gpu .env

echo "🐳 Building and starting GPU containers..."
docker-compose -f docker-compose.gpu.yml build
docker-compose -f docker-compose.gpu.yml up -d

echo "⏳ Waiting for services to start..."
sleep 30

# Check service health
echo "🔍 Checking service health..."
services=(
    "http://localhost:3004/gpu/health:GPU Webhook App"
    "http://localhost:8081/health:Faster-Whisper"
    "http://localhost:5002/health:Coqui TTS"
    "http://localhost:8080/health:Llama.cpp"
    "http://localhost:11434:Ollama"
    "http://localhost:3005:Grafana"
    "http://localhost:9090:Prometheus"
)

for service in "${services[@]}"; do
    url=$(echo $service | cut -d: -f1)
    name=$(echo $service | cut -d: -f2)
    if curl -s "$url" > /dev/null; then
        echo "✅ $name is running"
    else
        echo "⚠️  $name may still be starting..."
    fi
done

# Pull Ollama models
echo "📥 Downloading Ollama models..."
docker exec ollama-gpu ollama pull llama3.1:8b

echo ""
echo "=========================================="
echo "🚀 GPU-Accelerated Jambonz Setup Complete!"
echo "=========================================="
echo ""
echo "📊 Services Available:"
echo "  • GPU Webhook App: http://localhost:3004/gpu"
echo "  • Faster-Whisper:  http://localhost:8081"
echo "  • Coqui TTS:       http://localhost:5002"
echo "  • Llama.cpp:       http://localhost:8080"
echo "  • Ollama:          http://localhost:11434"
echo "  • Grafana:         http://localhost:3005 (admin/admin)"
echo "  • Prometheus:      http://localhost:9090"
echo ""
echo "🧪 Test the system:"
echo "  curl -X POST http://localhost:3004/gpu/test-mode \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"enabled\": true, \"method\": \"gpu-local\", \"models\": {\"tts\": \"coqui-tts\", \"llm\": \"ollama\", \"stt\": \"faster-whisper\"}}'"
echo ""
echo "📈 Performance Metrics:"
echo "  http://localhost:3004/gpu/metrics"
echo ""
echo "🔧 To integrate with Jambonz, update your webhook URL to:"
echo "  https://your-domain.com/gpu/call"
echo ""
echo "💡 Pro Tips:"
echo "  • Monitor GPU usage: nvidia-smi -l 1"
echo "  • View logs: docker-compose -f docker-compose.gpu.yml logs -f"
echo "  • Stop services: docker-compose -f docker-compose.gpu.yml down"
echo ""