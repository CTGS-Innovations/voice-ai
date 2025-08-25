# ChatterBox TTS Setup Guide

This project now includes **two distinct ChatterBox TTS options** that you can choose from based on your needs:

## Option 1: Custom Build (Latest Features) 🔧

**Built from source code** - Uses the latest ChatterBox repository code

### Features:
- ✅ Latest ChatterBox features and improvements
- ✅ Full source code control and customization
- ✅ Direct API access with custom endpoints
- ✅ Voice cloning with uploaded reference audio
- ✅ Configurable generation parameters

### Usage:
```bash
# Enable the custom build service
docker-compose --profile chatterbox-custom up -d

# Available at: http://localhost:4124
```

### API Endpoints:
- `POST /tts` - Generate speech from text
- `POST /tts/upload-reference` - Upload reference audio for voice cloning  
- `GET /health` - Health check
- `GET /info` - Model information

### Example API Call:
```bash
curl -X POST http://localhost:4124/tts \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello, this is a test of ChatterBox TTS",
    "exaggeration": 0.5,
    "temperature": 0.8,
    "format": "wav"
  }'
```

## Option 2: Pre-built Image (Stable) 🏭

**Production-ready image** - Uses the optimized, tested pre-built container

### Features:
- ✅ Production-tested stability
- ✅ OpenAI-compatible API endpoints
- ✅ Optimized inference pipeline
- ✅ Enterprise-ready performance
- ✅ Streamlined configuration

### Usage:
```bash
# Enable the pre-built service by editing docker-compose.yml
# Uncomment the profiles line: # profiles: ["chatterbox-prebuilt"]
# Then run:
docker-compose up -d chatterbox-tts-prebuilt

# Available at: http://localhost:4123
```

## Switching Between Options

### Method 1: Docker Compose Profiles
```bash
# Use custom build
docker-compose --profile chatterbox-custom up -d

# Use pre-built (after enabling in docker-compose.yml)
docker-compose up -d chatterbox-tts-prebuilt
```

### Method 2: Environment Variables
Edit your `.env` file:

**For Custom Build:**
```env
TTS_PROVIDER=chatterbox-custom
CHATTERBOX_TTS_URL=http://chatterbox-tts-custom:8000
```

**For Pre-built:**
```env
TTS_PROVIDER=chatterbox-prebuilt  
CHATTERBOX_TTS_URL=http://chatterbox-tts-prebuilt:8000
```

## Resource Usage

| Service | Port | GPU Memory | Disk Space | Build Time |
|---------|------|------------|------------|------------|
| **Custom** | 4124 | ~2-4GB | ~3GB | 5-10 min |
| **Pre-built** | 4123 | ~2-4GB | ~1GB | 30 sec |

## Recommendations

### Use **Custom Build** when:
- 🔬 You want the latest ChatterBox features
- 🛠️ You need to customize the TTS pipeline
- 🧪 You're doing development/research work
- 📊 You want full control over the implementation

### Use **Pre-built** when:
- 🏭 You need production stability
- ⚡ You want fastest deployment
- 🎯 You need OpenAI-compatible APIs
- 📈 You're running in production environments

## Voice Cloning Setup

Both options support voice cloning. Place your reference audio files in the `./voices/` directory:

```
voices/
├── alloy.wav
├── batman.wav  
├── cloned.wav
├── dumbledore.wav
└── your-custom-voice.wav
```

## Troubleshooting

### Custom Build Issues:
```bash
# Check build logs
docker-compose --profile chatterbox-custom logs chatterbox-tts-custom

# Rebuild if needed
docker-compose build --no-cache chatterbox-tts-custom
```

### Pre-built Issues:
```bash
# Check service logs
docker-compose logs chatterbox-tts-prebuilt

# Restart service
docker-compose restart chatterbox-tts-prebuilt
```

### GPU Memory Issues:
```bash
# Check GPU usage
nvidia-smi

# Restart Docker daemon if needed
sudo systemctl restart docker
```

## Integration with Jambonz

Both services integrate seamlessly with your existing Jambonz webhook application. The voice-app service will automatically use whichever ChatterBox service you configure via the `CHATTERBOX_TTS_URL` environment variable.

Choose the option that best fits your use case and enjoy advanced neural text-to-speech with voice cloning capabilities!