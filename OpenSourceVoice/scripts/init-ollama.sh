#!/bin/bash
set -e

echo "🚀 Initializing Ollama with required models..."

# Start Ollama server in background
echo "🚀 Starting Ollama server..."
/bin/ollama serve &
OLLAMA_PID=$!

# Wait for Ollama server to be ready
echo "⏳ Waiting for Ollama server to be ready..."
sleep 15
for i in {1..30}; do
    if curl -f http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
        echo "✅ Ollama server is ready"
        break
    fi
    echo "Waiting for Ollama server... ($i/30)"
    sleep 2
done

# Check if the model is already loaded
if curl -s http://127.0.0.1:11434/api/tags | grep -q "llama3.1:8b"; then
    echo "✅ Model llama3.1:8b is already loaded"
else
    echo "📥 Pulling llama3.1:8b model (this may take a while)..."
    ollama pull llama3.1:8b
    echo "✅ Model llama3.1:8b loaded successfully"
fi

echo "✅ Ollama initialization complete"

# Wait for the background process to finish
wait $OLLAMA_PID