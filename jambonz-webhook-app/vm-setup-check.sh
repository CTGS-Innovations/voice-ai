#!/bin/bash

# VM GPU Setup Verification Script
echo "=========================================="
echo "VM GPU Passthrough Setup Verification"
echo "=========================================="

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check functions
check_nvidia_driver() {
    echo "🔍 Checking NVIDIA Driver..."
    if command -v nvidia-smi &> /dev/null; then
        echo -e "${GREEN}✅ NVIDIA driver installed${NC}"
        nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader
    else
        echo -e "${RED}❌ NVIDIA driver not found${NC}"
        echo "Run: sudo apt install nvidia-driver-525"
        return 1
    fi
}

check_docker() {
    echo "🔍 Checking Docker installation..."
    if command -v docker &> /dev/null; then
        echo -e "${GREEN}✅ Docker installed${NC}"
        docker --version
    else
        echo -e "${RED}❌ Docker not found${NC}"
        echo "Run: curl -fsSL https://get.docker.com -o get-docker.sh && sudo sh get-docker.sh"
        return 1
    fi
}

check_docker_gpu() {
    echo "🔍 Checking Docker GPU support..."
    if docker run --rm --gpus all nvidia/cuda:12.1-base nvidia-smi &> /dev/null; then
        echo -e "${GREEN}✅ Docker GPU support working${NC}"
    else
        echo -e "${RED}❌ Docker GPU support not working${NC}"
        echo "Install nvidia-container-toolkit:"
        echo "distribution=\$(. /etc/os-release;echo \$ID\$VERSION_ID)"
        echo "curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -"
        echo "curl -s -L https://nvidia.github.io/nvidia-docker/\$distribution/nvidia-docker.list | sudo tee /etc/apt/sources.list.d/nvidia-docker.list"
        echo "sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit"
        echo "sudo systemctl restart docker"
        return 1
    fi
}

check_nodejs() {
    echo "🔍 Checking Node.js installation..."
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        if [[ $NODE_VERSION =~ v1[8-9] ]] || [[ $NODE_VERSION =~ v[2-9][0-9] ]]; then
            echo -e "${GREEN}✅ Node.js ${NODE_VERSION} installed${NC}"
        else
            echo -e "${YELLOW}⚠️  Node.js version ${NODE_VERSION} may be too old${NC}"
            echo "Recommended: Node.js 18+"
        fi
    else
        echo -e "${RED}❌ Node.js not found${NC}"
        echo "Install: curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt-get install -y nodejs"
        return 1
    fi
}

check_gpu_memory() {
    echo "🔍 Checking GPU memory availability..."
    if command -v nvidia-smi &> /dev/null; then
        TOTAL_MEM=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits)
        USED_MEM=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits)
        FREE_MEM=$((TOTAL_MEM - USED_MEM))
        
        echo "GPU Memory: ${USED_MEM}MB used / ${TOTAL_MEM}MB total (${FREE_MEM}MB free)"
        
        if [ $FREE_MEM -gt 12000 ]; then
            echo -e "${GREEN}✅ Sufficient GPU memory available${NC}"
        elif [ $FREE_MEM -gt 8000 ]; then
            echo -e "${YELLOW}⚠️  Limited GPU memory - may need optimization${NC}"
        else
            echo -e "${RED}❌ Low GPU memory - may cause issues${NC}"
        fi
    fi
}

check_disk_space() {
    echo "🔍 Checking disk space..."
    AVAILABLE=$(df -h . | awk 'NR==2 {print $4}' | sed 's/G//')
    if [ "$AVAILABLE" -gt 50 ]; then
        echo -e "${GREEN}✅ Sufficient disk space: ${AVAILABLE}GB available${NC}"
    else
        echo -e "${YELLOW}⚠️  Limited disk space: ${AVAILABLE}GB available${NC}"
        echo "Recommend 100GB+ for AI models"
    fi
}

check_vm_optimization() {
    echo "🔍 Checking VM optimizations..."
    
    # Check CPU cores
    CPU_CORES=$(nproc)
    if [ $CPU_CORES -ge 8 ]; then
        echo -e "${GREEN}✅ CPU cores: $CPU_CORES${NC}"
    else
        echo -e "${YELLOW}⚠️  Limited CPU cores: $CPU_CORES (recommend 8+)${NC}"
    fi
    
    # Check memory
    TOTAL_MEM=$(free -g | awk 'NR==2{print $2}')
    if [ $TOTAL_MEM -ge 24 ]; then
        echo -e "${GREEN}✅ System memory: ${TOTAL_MEM}GB${NC}"
    elif [ $TOTAL_MEM -ge 16 ]; then
        echo -e "${YELLOW}⚠️  System memory: ${TOTAL_MEM}GB (recommend 32GB+)${NC}"
    else
        echo -e "${RED}❌ Low system memory: ${TOTAL_MEM}GB${NC}"
    fi
    
    # Check if running in VM
    if systemd-detect-virt -q; then
        VM_TYPE=$(systemd-detect-virt)
        echo -e "${GREEN}✅ Running in VM: $VM_TYPE${NC}"
    else
        echo -e "${YELLOW}⚠️  Not detected as VM${NC}"
    fi
}

test_gpu_performance() {
    echo "🔍 Testing GPU performance..."
    
    if command -v nvidia-smi &> /dev/null; then
        echo "Running GPU benchmark..."
        # Simple CUDA test
        docker run --rm --gpus all nvidia/cuda:12.1-base nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits > /tmp/gpu_test.txt
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ GPU accessible via Docker${NC}"
        else
            echo -e "${RED}❌ GPU test failed${NC}"
        fi
    fi
}

generate_config() {
    echo "📝 Generating optimized configuration..."
    
    # Create VM-optimized environment file
    cat > .env.vm-gpu << EOF
# VM-Optimized GPU Configuration
GPU_PORT=3004
NODE_ENV=production

# GPU Settings (optimized for VM)
CUDA_VISIBLE_DEVICES=0
NVIDIA_VISIBLE_DEVICES=all
CUDA_MEMORY_FRACTION=0.8
TORCH_CUDNN_V8_API_ENABLED=1

# Model Settings (conservative for VM)
FASTER_WHISPER_MODEL=base.en
OLLAMA_MODEL=llama3.1:8b
BEAM_SIZE=3
BEST_OF=3

# Performance Limits
MAX_CONCURRENT_REQUESTS=2
BATCH_SIZE=1
WORKER_PROCESSES=4

# VM Resource Optimization
MALLOC_CONF="background_thread:true,metadata_thp:auto,dirty_decay_ms:30000,muzzy_decay_ms:30000"
OMP_NUM_THREADS=$(nproc)
MKL_NUM_THREADS=$(nproc)
EOF

    echo -e "${GREEN}✅ Created .env.vm-gpu configuration${NC}"
}

# Main execution
echo "Starting VM GPU setup verification..."
echo ""

ERRORS=0

check_nvidia_driver || ((ERRORS++))
echo ""

check_docker || ((ERRORS++))
echo ""

check_docker_gpu || ((ERRORS++))
echo ""

check_nodejs || ((ERRORS++))
echo ""

check_gpu_memory
echo ""

check_disk_space
echo ""

check_vm_optimization
echo ""

test_gpu_performance
echo ""

# Summary
echo "=========================================="
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}🎉 All checks passed! Ready for GPU setup.${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Run: ./setup-gpu.sh"
    echo "2. Test with: curl http://localhost:3004/gpu/health"
    echo "3. Configure models: curl -X POST http://localhost:3004/gpu/test-mode"
    
    generate_config
else
    echo -e "${RED}❌ Found $ERRORS issue(s). Please resolve before continuing.${NC}"
fi

echo "=========================================="