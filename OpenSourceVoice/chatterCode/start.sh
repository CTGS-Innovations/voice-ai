#!/bin/bash

echo "Starting ChatterBox TTS API Server..."

# Check CUDA availability
if command -v nvidia-smi &> /dev/null; then
    echo "NVIDIA GPU detected:"
    nvidia-smi --query-gpu=name,memory.total,memory.used --format=csv,noheader,nounits
else
    echo "No NVIDIA GPU detected, running on CPU"
fi

# Check PyTorch CUDA availability
python3 -c "import torch; print(f'PyTorch CUDA available: {torch.cuda.is_available()}')"

# Install additional dependency
pip install flask

# Start the API server
echo "Starting API server on port 8000..."
exec python3 api_server.py