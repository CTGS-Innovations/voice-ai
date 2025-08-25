#!/bin/bash
set -e

echo "🚀 Initializing Ollama with required models..."

# Configuration
MODEL_NAME="${OLLAMA_MODEL:-llama3.1:8b}"
OLLAMA_HOST="${OLLAMA_HOST:-0.0.0.0}"
OLLAMA_PORT="${OLLAMA_PORT:-11434}"
MAX_RETRIES=60
RETRY_DELAY=2

# Function to check if Ollama is ready
check_ollama_ready() {
    curl -sf "http://127.0.0.1:${OLLAMA_PORT}/api/tags" >/dev/null 2>&1
}

# Function to check if model exists
check_model_exists() {
    curl -sf "http://127.0.0.1:${OLLAMA_PORT}/api/tags" | grep -q "\"name\":\"${MODEL_NAME}\""
}

# Function to check if model is loaded in memory
check_model_loaded() {
    curl -sf "http://127.0.0.1:${OLLAMA_PORT}/api/show" \
        -d "{\"name\":\"${MODEL_NAME}\"}" \
        -H "Content-Type: application/json" >/dev/null 2>&1
}

# Function to preload model into memory
preload_model() {
    echo "📝 Preloading model ${MODEL_NAME} into memory..."
    curl -sf "http://127.0.0.1:${OLLAMA_PORT}/api/generate" \
        -d "{\"model\":\"${MODEL_NAME}\",\"prompt\":\"Hello\",\"stream\":false}" \
        -H "Content-Type: application/json" \
        --max-time 120 >/dev/null 2>&1
}

# Start Ollama server in background
echo "🚀 Starting Ollama server on ${OLLAMA_HOST}:${OLLAMA_PORT}..."
OLLAMA_HOST="${OLLAMA_HOST}" /bin/ollama serve &
OLLAMA_PID=$!

# Wait for Ollama server to be ready
echo "⏳ Waiting for Ollama server to be ready..."
for i in $(seq 1 $MAX_RETRIES); do
    if check_ollama_ready; then
        echo "✅ Ollama server is ready"
        break
    fi
    
    if [ $i -eq $MAX_RETRIES ]; then
        echo "❌ Ollama server failed to start after ${MAX_RETRIES} attempts"
        kill $OLLAMA_PID 2>/dev/null || true
        exit 1
    fi
    
    echo "  Waiting for Ollama server... ($i/$MAX_RETRIES)"
    sleep $RETRY_DELAY
done

# Check if the model is already downloaded
if check_model_exists; then
    echo "✅ Model ${MODEL_NAME} is already downloaded"
else
    echo "📥 Pulling ${MODEL_NAME} model (this may take 5-10 minutes)..."
    if ! /bin/ollama pull "${MODEL_NAME}"; then
        echo "❌ Failed to pull model ${MODEL_NAME}"
        kill $OLLAMA_PID 2>/dev/null || true
        exit 1
    fi
    echo "✅ Model ${MODEL_NAME} downloaded successfully"
fi

# Preload model into memory for faster first response
if check_model_loaded; then
    echo "✅ Model ${MODEL_NAME} is already loaded in memory"
else
    echo "🔄 Loading model into memory for faster responses..."
    if preload_model; then
        echo "✅ Model ${MODEL_NAME} preloaded successfully"
    else
        echo "⚠️  Model preload failed, but will load on first request"
    fi
fi

# Verify final state
echo "🔍 Verifying Ollama setup..."
if check_ollama_ready && check_model_exists; then
    echo "✅ Ollama initialization complete!"
    echo "   - Server: http://${OLLAMA_HOST}:${OLLAMA_PORT}"
    echo "   - Model: ${MODEL_NAME}"
    echo "   - Status: Ready for requests"
else
    echo "❌ Ollama verification failed"
    kill $OLLAMA_PID 2>/dev/null || true
    exit 1
fi

# Keep the server running
echo "🚀 Ollama server running with model ${MODEL_NAME}..."
wait $OLLAMA_PID