#!/bin/bash

# 100% Open-Source GPU Voice AI Stack
echo "=========================================="
echo "Starting 100% Open-Source GPU Voice Stack"
echo "=========================================="

# Check GPU
if ! nvidia-smi &> /dev/null; then
    echo "❌ NVIDIA GPU not detected"
    exit 1
fi

echo "✅ GPU detected:"
nvidia-smi --query-gpu=name,memory.free --format=csv,noheader

# Start Ollama service
echo "🚀 Starting Ollama..."
sudo systemctl start ollama
sleep 3

# Test Ollama
if curl -s http://localhost:11434/api/version > /dev/null; then
    echo "✅ Ollama running"
else
    echo "❌ Ollama failed to start"
    exit 1
fi

# Start Coqui TTS Server
echo "🎵 Starting Coqui TTS server..."
source ~/tts-env/bin/activate
nohup python3 -m TTS.server.server --host 0.0.0.0 --port 5002 --use_cuda > tts.log 2>&1 &
TTS_PID=$!
echo $TTS_PID > tts.pid

# Wait for TTS to start
sleep 10

# Test TTS
if curl -s http://localhost:5002 > /dev/null; then
    echo "✅ Coqui TTS running (PID: $TTS_PID)"
else
    echo "⚠️  Coqui TTS may still be starting..."
fi

# Start faster-whisper server
echo "🎤 Starting faster-whisper server..."
cat > whisper_server.py << 'EOF'
from faster_whisper import WhisperModel
from flask import Flask, request, jsonify
import tempfile
import os

app = Flask(__name__)

# Load model with GPU
model = WhisperModel("base.en", device="cuda", compute_type="float16")

@app.route('/transcribe', methods=['POST'])
def transcribe():
    try:
        audio_file = request.files['audio']
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as tmp:
            audio_file.save(tmp.name)
            
            segments, info = model.transcribe(tmp.name, beam_size=5)
            text = ' '.join([segment.text for segment in segments])
            
            os.unlink(tmp.name)
            return jsonify({'text': text.strip()})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/health')
def health():
    return jsonify({'status': 'healthy', 'model': 'base.en', 'device': 'cuda'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8001)
EOF

source ~/whisper-env/bin/activate
nohup python3 whisper_server.py > whisper.log 2>&1 &
WHISPER_PID=$!
echo $WHISPER_PID > whisper.pid

# Wait for whisper to start
sleep 5

# Test whisper
if curl -s http://localhost:8001/health > /dev/null; then
    echo "✅ faster-whisper running (PID: $WHISPER_PID)"
else
    echo "⚠️  faster-whisper may still be starting..."
fi

# Update environment
cp .env.opensource .env

echo ""
echo "🚀 Open-Source GPU Stack Status:"
echo "  • Ollama (LLM):        http://localhost:11434"
echo "  • Coqui TTS:           http://localhost:5002" 
echo "  • faster-whisper:      http://localhost:8001"
echo ""
echo "📊 Test services:"
echo "  curl http://localhost:11434/api/version"
echo "  curl http://localhost:5002"
echo "  curl http://localhost:8001/health"
echo ""
echo "🎯 Ready for 100% open-source voice calls!"
echo "Your next phone call will use:"
echo "  • GPU-accelerated Llama 3.1 8B for conversation"
echo "  • GPU-accelerated Coqui TTS for voice synthesis"  
echo "  • GPU-accelerated faster-whisper for speech recognition"
echo ""
echo "🛑 To stop services:"
echo "  ./stop-opensource.sh"
echo ""