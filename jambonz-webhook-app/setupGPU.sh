#!/bin/bash

# GPU Docker Setup Script - Run as sudo
echo "=========================================="
echo "Installing NVIDIA Container Toolkit"
echo "=========================================="

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo "❌ This script must be run as root (sudo ./setupGPU.sh)" 
   exit 1
fi

# Check for NVIDIA GPU
if ! command -v nvidia-smi &> /dev/null; then
    echo "❌ NVIDIA GPU not detected. Please install NVIDIA drivers first."
    exit 1
fi

echo "✅ NVIDIA GPU detected:"
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader

# Detect Ubuntu version
source /etc/os-release
if [[ "$ID" != "ubuntu" ]]; then
    echo "❌ This script is for Ubuntu only"
    exit 1
fi

echo "✅ Ubuntu $VERSION_ID detected"

# Add NVIDIA Container Toolkit repository
echo "📦 Adding NVIDIA Container Toolkit repository..."

curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg

curl -s -L https://nvidia.github.io/libnvidia-container/$ID$VERSION_ID/libnvidia-container.list | \
    sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
    tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

# Update package list
echo "🔄 Updating package list..."
apt-get update

# Install nvidia-container-toolkit
echo "📦 Installing NVIDIA Container Toolkit..."
apt-get install -y nvidia-container-toolkit

# Configure Docker to use NVIDIA runtime
echo "⚙️  Configuring Docker for GPU support..."
nvidia-ctk runtime configure --runtime=docker

# Restart Docker service
echo "🔄 Restarting Docker..."
systemctl restart docker

# Wait for Docker to start
sleep 3

# Test GPU Docker support
echo "🧪 Testing GPU Docker support..."
if docker run --rm --gpus all nvidia/cuda:12.0-base-ubuntu20.04 nvidia-smi &> /dev/null; then
    echo "✅ Docker GPU support working!"
else
    echo "⚠️  Testing with different CUDA image..."
    if docker run --rm --gpus all nvidia/cuda:11.8-base-ubuntu20.04 nvidia-smi &> /dev/null; then
        echo "✅ Docker GPU support working!"
    else
        echo "❌ Docker GPU support test failed"
        echo "Trying to pull and test basic CUDA image..."
        docker pull nvidia/cuda:latest
        if docker run --rm --gpus all nvidia/cuda:latest nvidia-smi &> /dev/null; then
            echo "✅ Docker GPU support working with latest image!"
        else
            echo "❌ Docker GPU support still not working"
            echo "Please check Docker installation and try again"
            exit 1
        fi
    fi
fi

# Install additional dependencies
echo "📦 Installing additional dependencies..."
apt-get install -y curl wget git build-essential

# Install Node.js 18 if not present
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js 18..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
fi

# Create necessary directories (as the original user)
echo "📁 Creating directories..."
ORIGINAL_USER=$(logname)
ORIGINAL_HOME=$(getent passwd "$ORIGINAL_USER" | cut -d: -f6)
cd "$ORIGINAL_HOME/voice-ai/jambonz-webhook-app"

# Create directories as the original user
sudo -u "$ORIGINAL_USER" mkdir -p models/{faster-whisper,coqui,llama,ollama,bark}
sudo -u "$ORIGINAL_USER" mkdir -p audio-gpu
sudo -u "$ORIGINAL_USER" mkdir -p grafana/provisioning/{dashboards,datasources}

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
EOF

chown "$ORIGINAL_USER:$ORIGINAL_USER" prometheus.yml

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

chown -R "$ORIGINAL_USER:$ORIGINAL_USER" grafana/

echo ""
echo "=========================================="
echo "🚀 NVIDIA Container Toolkit Setup Complete!"
echo "=========================================="
echo ""
echo "✅ GPU Docker support enabled"
echo "✅ All dependencies installed"
echo "✅ Directories created"
echo ""
echo "🧪 Test the installation:"
echo "  docker run --rm --gpus all nvidia/cuda:latest nvidia-smi"
echo ""
echo "🚀 Next steps (as regular user):"
echo "  cd ~/voice-ai/jambonz-webhook-app"
echo "  docker-compose -f docker-compose.gpu.yml up -d"
echo ""
echo "📊 Monitor GPU usage:"
echo "  nvidia-smi -l 1"
echo ""
echo "🔧 If you need to start fresh:"
echo "  docker-compose -f docker-compose.gpu.yml down"
echo "  docker system prune -f"
echo ""