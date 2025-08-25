#!/bin/bash
set -e

# =============================================================================
# SIMPLE OLLAMA MODEL INITIALIZATION ENTRYPOINT
# =============================================================================
# Uses only tools available in the Ollama container (no curl dependency)
# =============================================================================

# Configuration from environment
MODEL_NAME="${OLLAMA_MODEL:-llama3.1:8b}"
SERVER_HOST="${OLLAMA_HOST:-0.0.0.0}"
KEEP_ALIVE="${OLLAMA_KEEP_ALIVE:--1}"
MAX_RETRIES=30

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting Ollama Model Manager"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Model: ${MODEL_NAME}"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Host: ${SERVER_HOST}"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Keep Alive: ${KEEP_ALIVE}"

# Cleanup function
cleanup() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Shutting down Ollama server..."
    if [ -n "$OLLAMA_PID" ]; then
        kill "$OLLAMA_PID" 2>/dev/null || true
        wait "$OLLAMA_PID" 2>/dev/null || true
    fi
    exit 0
}

# Set up signal handlers
trap cleanup SIGTERM SIGINT

# Start Ollama server
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting Ollama server..."
OLLAMA_HOST="${SERVER_HOST}" /bin/ollama serve &
OLLAMA_PID=$!
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Ollama server started with PID: ${OLLAMA_PID}"

# Wait for server to be ready
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Waiting for Ollama server to be ready..."
for i in $(seq 1 $MAX_RETRIES); do
    if /bin/ollama list >/dev/null 2>&1; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Ollama server is ready"
        break
    fi
    
    if [ $i -eq $MAX_RETRIES ]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: Ollama server failed to start after ${MAX_RETRIES} attempts"
        cleanup
        exit 1
    fi
    
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Waiting for server... ($i/$MAX_RETRIES)"
    sleep 2
done

# Check if model exists, download if needed
if /bin/ollama list | grep -q "^${MODEL_NAME}"; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Model ${MODEL_NAME} found locally"
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Model ${MODEL_NAME} not found, downloading..."
    if /bin/ollama pull "${MODEL_NAME}"; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Successfully downloaded model ${MODEL_NAME}"
    else
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: Failed to download model ${MODEL_NAME}"
        cleanup
        exit 1
    fi
fi

# Activate model - use simple approach with ollama run
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Activating model ${MODEL_NAME}..."
if echo "ready" | /bin/ollama run "${MODEL_NAME}" >/dev/null 2>&1; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Model ${MODEL_NAME} activated successfully"
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARNING: Model activation might have failed, but continuing..."
fi

# Verify model status
sleep 2
if /bin/ollama ps | grep -q "^${MODEL_NAME}"; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] SUCCESS: Model ${MODEL_NAME} is loaded and ready"
    /bin/ollama ps | grep "^${MODEL_NAME}" | while read line; do
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Model status: $line"
    done
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARNING: Model not showing as loaded, but server is running"
fi

# Self-healing monitoring loop (simplified)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting monitoring loop..."
while true; do
    sleep 30
    
    # Check if server is still responding
    if ! /bin/ollama list >/dev/null 2>&1; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: Ollama server not responding!"
        continue
    fi
    
    # Check if model is still loaded
    if ! /bin/ollama ps | grep -q "^${MODEL_NAME}"; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARNING: Model not loaded, attempting to reactivate..."
        if echo "reactivate" | /bin/ollama run "${MODEL_NAME}" >/dev/null 2>&1; then
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] Model reactivated successfully"
        else
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARNING: Model reactivation failed"
        fi
    fi
    
    # Optional: Log status every few cycles for debugging
    static_counter=$((${static_counter:-0} + 1))
    if [ $((static_counter % 10)) -eq 0 ]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Status check #${static_counter}: Server OK"
    fi
done