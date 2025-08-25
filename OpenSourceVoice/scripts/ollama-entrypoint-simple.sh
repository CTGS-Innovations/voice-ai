#!/bin/bash
set -e

# =============================================================================
# OLLAMA PRODUCTION MODEL MANAGER
# =============================================================================
# Self-healing model initialization with intelligent logging
# =============================================================================

# Configuration from environment
MODEL_NAME="${OLLAMA_MODEL:-llama3.1:8b}"
SERVER_HOST="${OLLAMA_HOST:-0.0.0.0}"
SERVER_PORT="${OLLAMA_PORT:-11434}"
KEEP_ALIVE="${OLLAMA_KEEP_ALIVE:--1}"
MAX_RETRIES=30

# Logging functions
log_info() {
    echo "🔵 [INFO] $1"
}

log_success() {
    echo "✅ [SUCCESS] $1"
}

log_warn() {
    echo "⚠️ [WARN] $1"
}

log_error() {
    echo "❌ [ERROR] $1"
}

log_status() {
    echo "📊 [STATUS] $1"
}

# Startup banner
echo ""
echo "🤖 =================================="
echo "🤖  OLLAMA MODEL MANAGER v1.0"
echo "🤖 =================================="
log_info "Initializing LLM service..."
log_status "Model: ${MODEL_NAME}"
log_status "Host: ${SERVER_HOST}:${SERVER_PORT}"
log_status "Keep Alive: ${KEEP_ALIVE} (Forever)"
echo ""

# Cleanup function
cleanup() {
    log_warn "Graceful shutdown initiated"
    if [ -n "$OLLAMA_PID" ]; then
        kill "$OLLAMA_PID" 2>/dev/null || true
        wait "$OLLAMA_PID" 2>/dev/null || true
    fi
    exit 0
}

# Set up signal handlers
trap cleanup SIGTERM SIGINT

# Start Ollama server
log_info "Starting Ollama server..."
OLLAMA_HOST="${SERVER_HOST}" /bin/ollama serve &
OLLAMA_PID=$!
log_status "Server PID: ${OLLAMA_PID}"

# Wait for server to be ready
log_info "Waiting for server readiness..."
for i in $(seq 1 $MAX_RETRIES); do
    if /bin/ollama list >/dev/null 2>&1; then
        log_success "Ollama server is ready"
        break
    fi
    
    if [ $i -eq $MAX_RETRIES ]; then
        log_error "Server failed to start after ${MAX_RETRIES} attempts"
        cleanup
        exit 1
    fi
    
    if [ $((i % 5)) -eq 0 ]; then
        log_info "Still waiting for server... ($i/$MAX_RETRIES)"
    fi
    sleep 2
done

# Check if model exists, download if needed
log_info "Checking model availability..."
if /bin/ollama list | grep -q "^${MODEL_NAME}"; then
    log_success "Model ${MODEL_NAME} found locally"
else
    log_warn "Model ${MODEL_NAME} not found - downloading..."
    if /bin/ollama pull "${MODEL_NAME}"; then
        log_success "Model ${MODEL_NAME} downloaded"
    else
        log_error "Failed to download model ${MODEL_NAME}"
        cleanup
        exit 1
    fi
fi

# Activate model and load into GPU memory
log_info "Activating model ${MODEL_NAME}..."
if echo "ready" | /bin/ollama run "${MODEL_NAME}" >/dev/null 2>&1; then
    log_success "Model activated and loaded in GPU memory"
else
    log_warn "Model activation response unclear - verifying..."
fi

# Verify model status
sleep 2
if /bin/ollama ps | grep -q "^${MODEL_NAME}"; then
    MODEL_STATUS=$(/bin/ollama ps | grep "^${MODEL_NAME}")
    log_success "Model ready and loaded in memory"
    log_status "Details: ${MODEL_STATUS}"
    
    echo ""
    echo "🚀 =================================="
    echo "🚀  LLM SERVICE READY"
    echo "🚀 =================================="
    log_success "Ollama server operational"
    log_success "Model ${MODEL_NAME} active in GPU"
    log_success "Endpoint: http://${SERVER_HOST}:${SERVER_PORT}"
    echo ""
else
    log_warn "Model not visible in memory, but server is running"
fi

# Self-healing monitoring loop
log_info "Starting self-healing monitor..."
monitor_cycle=0
while true; do
    sleep 30
    monitor_cycle=$((monitor_cycle + 1))
    
    # Check server health
    if ! /bin/ollama list >/dev/null 2>&1; then
        log_error "Server not responding!"
        continue
    fi
    
    # Check model health
    if ! /bin/ollama ps | grep -q "^${MODEL_NAME}"; then
        log_warn "Model not loaded - reactivating..."
        if echo "reactivate" | /bin/ollama run "${MODEL_NAME}" >/dev/null 2>&1; then
            log_success "Model reactivated"
        else
            log_error "Reactivation failed"
        fi
    fi
    
    # Status update every 10 minutes (20 cycles * 30s)
    if [ $((monitor_cycle % 20)) -eq 0 ]; then
        log_info "Health check #${monitor_cycle}: All systems operational"
    fi
done