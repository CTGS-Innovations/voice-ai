# =============================================================================
# 100% OPEN SOURCE GPU VOICE AI - DOCKERFILE
# =============================================================================
# 
# Multi-stage Docker build for production-ready Node.js voice AI application
# Optimized for size, security, and performance
#
# Build command:
#   docker build -t open-source-voice-ai .
#
# Run command:
#   docker run --gpus all -p 3003:3003 open-source-voice-ai
#
# =============================================================================

# -----------------------------------------------------------------------------
# STAGE 1: Dependencies and Build
# -----------------------------------------------------------------------------
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./

# Install all dependencies (including devDependencies for potential build steps)
RUN npm ci --only=production --no-audit --no-optional

# -----------------------------------------------------------------------------
# STAGE 2: Production Runtime
# -----------------------------------------------------------------------------
FROM node:18-alpine AS production

# Add metadata labels for container identification
LABEL maintainer="Open Source Voice AI Community"
LABEL description="100% Open Source GPU-Accelerated Voice AI Webhook Server"
LABEL version="1.0.0"

# Create non-root user for security
RUN addgroup -g 1001 -S voiceai && \
    adduser -S voiceai -u 1001 -G voiceai

# Install system dependencies for audio processing and utilities
RUN apk add --no-cache \
    curl \
    ca-certificates \
    tzdata \
    && rm -rf /var/cache/apk/*

# Set working directory
WORKDIR /app

# Copy dependencies from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy application source code
COPY --chown=voiceai:voiceai src/ ./src/
COPY --chown=voiceai:voiceai package*.json ./

# Create required directories with proper permissions
RUN mkdir -p /app/audio-cache /app/logs && \
    chown -R voiceai:voiceai /app

# Switch to non-root user
USER voiceai

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3003
ENV AUDIO_DIR=/app/audio-cache

# Expose port
EXPOSE 3003

# Health check for container orchestration
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3003/health || exit 1

# Start the application
CMD ["node", "src/voice-app.js"]

# =============================================================================
# DOCKER USAGE EXAMPLES
# =============================================================================
#
# Build the image:
#   docker build -t open-source-voice-ai .
#
# Run standalone (for testing):
#   docker run --rm -p 3003:3003 \
#     -e OLLAMA_URL=http://host.docker.internal:11434 \
#     -e COQUI_TTS_URL=http://host.docker.internal:5002 \
#     -e FASTER_WHISPER_URL=http://host.docker.internal:9000 \
#     open-source-voice-ai
#
# Run with Docker Compose (recommended):
#   docker-compose up -d
#
# View logs:
#   docker logs -f <container-name>
#
# Execute commands inside container:
#   docker exec -it <container-name> /bin/sh
#
# =============================================================================