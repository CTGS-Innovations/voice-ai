#!/bin/bash
set -e

# =============================================================================
# OLLAMA MODEL INITIALIZATION AND ACTIVATION ENTRYPOINT
# =============================================================================
# 
# This script provides self-healing model management for Ollama:
# 1. Starts Ollama server
# 2. Checks if model exists, downloads if missing
# 3. Activates model and keeps it in memory permanently
# 4. Provides health monitoring and auto-recovery
#
# Environment Variables:
# - OLLAMA_MODEL: Model to load (default: llama3.1:8b)
# - OLLAMA_HOST: Server host (default: 0.0.0.0)
# - OLLAMA_KEEP_ALIVE: Keep alive setting (default: -1 for infinite)
# - OLLAMA_PORT: Server port (default: 11434)
#
# =============================================================================

# Configuration from environment
MODEL_NAME="${OLLAMA_MODEL:-llama3.1:8b}"
SERVER_HOST="${OLLAMA_HOST:-0.0.0.0}"
SERVER_PORT="${OLLAMA_PORT:-11434}"
KEEP_ALIVE="${OLLAMA_KEEP_ALIVE:--1}"
MAX_RETRIES=60
RETRY_DELAY=2

# Logging functions
log_info() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] INFO: $1"
}

log_warn() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARN: $1"
}

log_error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1"
}

# Function to check if Ollama server is ready
check_server_ready() {
    curl -sf "http://127.0.0.1:${SERVER_PORT}/api/tags" >/dev/null 2>&1
}

# Function to check if model exists locally
check_model_exists() {
    /bin/ollama list 2>/dev/null | grep -q "^${MODEL_NAME}"
}

# Function to check if model is loaded in memory
check_model_loaded() {
    /bin/ollama ps 2>/dev/null | grep -q "^${MODEL_NAME}"
}

# Function to download model if missing
download_model() {
    log_info "Model ${MODEL_NAME} not found locally, downloading..."
    if /bin/ollama pull "${MODEL_NAME}"; then
        log_info "Successfully downloaded model ${MODEL_NAME}"
        return 0
    else
        log_error "Failed to download model ${MODEL_NAME}"
        return 1
    fi
}

# Function to activate model and keep it in memory
activate_model() {
    log_info "Activating model ${MODEL_NAME} with keep_alive=${KEEP_ALIVE}..."
    
    # Use API call to load model with keep_alive setting
    if curl -sf "http://127.0.0.1:${SERVER_PORT}/api/generate" \
        -H "Content-Type: application/json" \
        -d "{\"model\":\"${MODEL_NAME}\",\"prompt\":\"ready\",\"keep_alive\":${KEEP_ALIVE},\"stream\":false}" \
        >/dev/null 2>&1; then
        log_info "Model ${MODEL_NAME} activated and loaded in memory"
        return 0
    else
        log_warn "Failed to activate model via API, trying ollama run..."
        # Fallback to ollama run command
        if echo "ready" | /bin/ollama run "${MODEL_NAME}" --keepalive "${KEEP_ALIVE}" >/dev/null 2>&1; then
            log_info "Model ${MODEL_NAME} activated via ollama run"
            return 0
        else
            log_error "Failed to activate model ${MODEL_NAME}"
            return 1
        fi
    fi
}

# Function to verify model status
verify_model_status() {
    if check_model_loaded; then
        local model_info=$(/bin/ollama ps | grep "^${MODEL_NAME}")
        log_info "Model status: ${model_info}"
        return 0
    else
        log_warn "Model ${MODEL_NAME} not loaded in memory"
        return 1
    fi
}

# Function to perform self-healing check
self_healing_check() {
    log_info "Performing self-healing check..."
    
    # Check if server is still responding
    if ! check_server_ready; then
        log_error "Ollama server not responding!"
        return 1
    fi
    
    # Check if model is still loaded
    if ! check_model_loaded; then
        log_warn "Model not loaded, attempting to reactivate..."
        if activate_model; then
            log_info "Model reactivated successfully"
        else
            log_error "Failed to reactivate model"
            return 1
        fi
    fi
    
    log_info "Self-healing check passed"
    return 0
}

# Cleanup function
cleanup() {
    log_info "Shutting down Ollama server..."
    if [ -n "$OLLAMA_PID" ]; then
        kill "$OLLAMA_PID" 2>/dev/null || true
        wait "$OLLAMA_PID" 2>/dev/null || true
    fi
    exit 0
}

# Set up signal handlers
trap cleanup SIGTERM SIGINT

# Main execution
main() {
    log_info "Starting Ollama Model Manager"
    log_info "Model: ${MODEL_NAME}"
    log_info "Host: ${SERVER_HOST}:${SERVER_PORT}"
    log_info "Keep Alive: ${KEEP_ALIVE}"
    
    # Start Ollama server
    log_info "Starting Ollama server..."
    OLLAMA_HOST="${SERVER_HOST}" /bin/ollama serve &
    OLLAMA_PID=$!
    log_info "Ollama server started with PID: ${OLLAMA_PID}"
    
    # Wait for server to be ready
    log_info "Waiting for Ollama server to be ready..."
    for i in $(seq 1 $MAX_RETRIES); do
        if check_server_ready; then
            log_info "Ollama server is ready"
            break
        fi
        
        if [ $i -eq $MAX_RETRIES ]; then
            log_error "Ollama server failed to start after ${MAX_RETRIES} attempts"
            cleanup
            exit 1
        fi
        
        log_info "Waiting for server... ($i/$MAX_RETRIES)"
        sleep $RETRY_DELAY
    done
    
    # Check and download model if needed
    if check_model_exists; then
        log_info "Model ${MODEL_NAME} found locally"
    else
        if ! download_model; then
            log_error "Failed to download model, exiting"
            cleanup
            exit 1
        fi
    fi
    
    # Activate model
    if ! activate_model; then
        log_error "Failed to activate model, exiting"
        cleanup
        exit 1
    fi
    
    # Verify model status
    sleep 2
    if verify_model_status; then
        log_info "Model initialization completed successfully"
    else
        log_warn "Model verification failed, but continuing..."
    fi
    
    # Self-healing monitoring loop
    log_info "Starting monitoring loop with 30-second intervals..."
    while true; do
        sleep 30
        if ! self_healing_check; then
            log_error "Self-healing check failed"
            # Don't exit, just log the error and try again
        fi
    done
}

# Start main execution
main "$@"