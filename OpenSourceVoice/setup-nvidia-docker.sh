#!/bin/bash
# =============================================================================
# NVIDIA Container Toolkit Installation Script
# =============================================================================
# This script installs the NVIDIA Container Toolkit to enable GPU access
# in Docker containers for Ubuntu systems.
#
# Requirements:
# - NVIDIA GPU with drivers installed
# - Docker installed
# - Ubuntu (tested on 22.04/24.04)
#
# Usage:
#   chmod +x setup-nvidia-docker.sh
#   ./setup-nvidia-docker.sh
# =============================================================================

set -e  # Exit on any error

echo "=========================================="
echo "NVIDIA Container Toolkit Installation"
echo "=========================================="
echo ""

# Check if running with sudo
if [ "$EUID" -ne 0 ]; then
    echo "This script requires sudo privileges."
    echo "Please run with: sudo ./setup-nvidia-docker.sh"
    exit 1
fi

echo "Step 1: Cleaning up previous installation attempts..."
rm -f /etc/apt/sources.list.d/nvidia-container-toolkit.list
rm -f /etc/apt/sources.list.d/nvidia-docker.list
rm -f /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
echo "✓ Cleanup complete"
echo ""

echo "Step 2: Adding NVIDIA GPG key..."
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
echo "✓ GPG key added"
echo ""

echo "Step 3: Adding NVIDIA Container Toolkit repository..."
echo "deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://nvidia.github.io/libnvidia-container/stable/deb/amd64 /" > /etc/apt/sources.list.d/nvidia-container-toolkit.list
echo "✓ Repository added"
echo ""

echo "Step 4: Updating package list..."
apt-get update
echo "✓ Package list updated"
echo ""

echo "Step 5: Installing nvidia-container-toolkit..."
apt-get install -y nvidia-container-toolkit
echo "✓ NVIDIA Container Toolkit installed"
echo ""

echo "Step 6: Configuring Docker runtime..."
nvidia-ctk runtime configure --runtime=docker
echo "✓ Docker runtime configured"
echo ""

echo "Step 7: Restarting Docker daemon..."
systemctl restart docker
echo "✓ Docker restarted"
echo ""

echo "=========================================="
echo "Installation Complete!"
echo "=========================================="
echo ""
echo "Testing GPU access in Docker..."
echo ""

# Test GPU access
if docker run --rm --gpus all nvidia/cuda:12.0.0-base-ubuntu22.04 nvidia-smi; then
    echo ""
    echo "✓ SUCCESS! Docker can access your GPU."
    echo ""
    echo "You can now run: docker compose up -d"
else
    echo ""
    echo "✗ WARNING: GPU test failed. Please check your NVIDIA drivers."
    exit 1
fi
