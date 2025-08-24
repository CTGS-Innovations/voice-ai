# GPU-Accelerated Jambonz Voice AI System

This is a complete self-hosted, open-source alternative to cloud-based voice AI services, optimized for NVIDIA GPU acceleration on Unraid systems.

## 🚀 Key Features

- **Self-Hosted**: 100% local processing, no cloud dependencies
- **GPU-Accelerated**: Leverages NVIDIA RTX 3090 Ti for maximum performance
- **Open Source Models**: Uses Faster-Whisper, Coqui TTS, Llama.cpp, Ollama
- **Performance Testing**: Built-in A/B testing against cloud APIs
- **Production Ready**: Docker Compose with monitoring and metrics
- **Zero Vendor Lock-in**: Switch between different open-source models easily

## 🏗️ Architecture

### Core Services

1. **Faster-Whisper**: Ultra-fast speech-to-text (2-5x faster than OpenAI Whisper)
2. **Coqui TTS**: High-quality text-to-speech synthesis
3. **Bark TTS**: Natural speech with emotions and sound effects
4. **Llama.cpp**: Optimized LLM inference with GPU acceleration
5. **Ollama**: Easy model management for various LLMs

### Performance Monitoring

- **Grafana**: Real-time performance dashboards
- **Prometheus**: Metrics collection and alerting
- **GPU Monitoring**: NVIDIA DCGM integration

## 📋 Prerequisites

### Hardware Requirements
- NVIDIA GPU (RTX 3090 Ti recommended)
- 16GB+ RAM
- 100GB+ free disk space (for models)
- Unraid 6.10+ with Community Applications

### Software Requirements
- Docker with GPU support
- NVIDIA Container Toolkit
- Node.js 18+ (for development)

## 🛠️ Installation

### 1. Quick Setup (Recommended)

```bash
# Clone and setup
git clone <repository>
cd jambonz-webhook-app
./setup-gpu.sh
```

### 2. Manual Setup

```bash
# Install dependencies
npm install axios form-data

# Create environment file
cp .env.gpu .env

# Edit configuration
nano .env

# Start services
docker-compose -f docker-compose.gpu.yml up -d

# Download models
docker exec ollama-gpu ollama pull llama3.1:8b
```

## 🧪 Testing & Performance

### Basic Health Check
```bash
curl http://localhost:3004/gpu/health
```

### Configure Test Mode
```bash
curl -X POST http://localhost:3004/gpu/test-mode \
  -H 'Content-Type: application/json' \
  -d '{
    "enabled": true,
    "method": "gpu-local",
    "models": {
      "tts": "coqui-tts",
      "llm": "ollama", 
      "stt": "faster-whisper"
    }
  }'
```

### View Performance Metrics
```bash
curl http://localhost:3004/gpu/metrics | jq
```

### Test Call Simulation
```bash
# Point your Jambonz webhook to:
# https://your-domain.com/gpu/call
```

## 🔧 Configuration

### Model Selection

#### Text-to-Speech (TTS)
- `coqui-tts`: High quality, fast
- `bark`: Natural with emotions
- `tortoise`: Highest quality, slower

#### Large Language Models (LLM)  
- `llama-cpp`: Fastest inference
- `ollama`: Easy model switching
- `text-generation-webui`: Advanced features

#### Speech-to-Text (STT)
- `faster-whisper`: Fastest (recommended)
- `whisper-cpp`: Good balance
- `vosk`: Lightweight

### Environment Variables

```bash
# GPU Service URLs
FASTER_WHISPER_URL=http://faster-whisper:8000
COQUI_TTS_URL=http://coqui-tts:5002
LLAMA_CPP_URL=http://llama-cpp:8080

# Model Settings
FASTER_WHISPER_MODEL=base.en
OLLAMA_MODEL=llama3.1:8b
BEAM_SIZE=5
```

## 📊 Performance Benchmarks

### Expected Performance (RTX 3090 Ti)

| Component | GPU Time | Cloud API Time | Speedup |
|-----------|----------|---------------|---------|
| STT (Faster-Whisper) | ~200ms | ~800ms | 4x faster |
| TTS (Coqui) | ~500ms | ~1200ms | 2.4x faster |
| LLM (Llama.cpp) | ~300ms | ~1000ms | 3.3x faster |
| **Total Pipeline** | **~1s** | **~3s** | **3x faster** |

### Memory Usage
- Faster-Whisper: ~2GB VRAM
- Coqui TTS: ~3GB VRAM  
- Llama 8B: ~6GB VRAM
- **Total**: ~11GB VRAM (RTX 3090 Ti has 24GB)

## 🔍 Monitoring

### Grafana Dashboards
- GPU utilization and memory
- Response times per model
- Request throughput
- Error rates

Access: http://localhost:3005 (admin/admin)

### Prometheus Metrics
Raw metrics available at: http://localhost:9090

### Real-time GPU Monitoring
```bash
nvidia-smi -l 1
```

## 🐳 Docker Commands

```bash
# Start all services
docker-compose -f docker-compose.gpu.yml up -d

# View logs
docker-compose -f docker-compose.gpu.yml logs -f

# Stop services
docker-compose -f docker-compose.gpu.yml down

# Rebuild specific service
docker-compose -f docker-compose.gpu.yml build coqui-tts
docker-compose -f docker-compose.gpu.yml up -d coqui-tts

# Check GPU usage in containers
docker exec -it faster-whisper-gpu nvidia-smi
```

## 🚨 Troubleshooting

### GPU Not Detected
```bash
# Check NVIDIA drivers
nvidia-smi

# Check Docker GPU support  
docker run --rm --gpus all nvidia/cuda:12.1-base nvidia-smi

# Install nvidia-container-toolkit if needed
```

### Service Not Starting
```bash
# Check individual service logs
docker logs faster-whisper-gpu
docker logs coqui-tts-gpu

# Check resource usage
docker stats
```

### Performance Issues
```bash
# Monitor GPU usage
nvidia-smi -l 1

# Check container resource limits
docker inspect faster-whisper-gpu | grep -i memory

# View detailed metrics
curl http://localhost:3004/gpu/metrics | jq '.comparison'
```

## 🔧 Integration with Jambonz

### Webhook Configuration

1. Update your Jambonz application webhook URLs:
   ```json
   {
     "call_hook": "https://your-domain.com/gpu/call",
     "call_status_hook": "https://your-domain.com/gpu/status"
   }
   ```

2. Configure your SIP trunk to point to this application

3. Test with a phone call to verify end-to-end functionality

### Scaling for Production

- Use multiple GPU containers with load balancing
- Implement Redis for conversation state persistence
- Add rate limiting and authentication
- Set up monitoring alerts

## 📈 Cost Analysis

### Cloud API Costs (per 1000 calls)
- OpenAI Whisper: ~$6
- ElevenLabs TTS: ~$15  
- GPT-4 Mini: ~$3
- **Total**: ~$24/1000 calls

### Self-Hosted Costs
- Initial hardware: ~$1500 (RTX 3090 Ti)
- Electricity: ~$0.50/1000 calls
- **ROI**: Break-even at ~60,000 calls

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Add tests for new models
4. Submit pull request

## 📄 License

Open source under MIT License. Free for commercial use.

## 🆘 Support

- GitHub Issues: [Link to issues]
- Discord: [Community link]
- Documentation: [Wiki link]