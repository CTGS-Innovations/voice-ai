# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Jambonz VoIP development environment with AI voice capabilities, integrating with VoIP.ms for telephony services. The system provides a complete telephony stack with text-to-speech, speech recognition, and conversational AI features.

## Architecture

The project uses a microservices architecture running in Docker containers:

- **Core Jambonz Stack**: MySQL, Redis, Drachtio (SIP server), FreeSWITCH (media server), RTPengine (media proxy)
- **Jambonz Services**: API Server, Feature Server, SBC Inbound/Outbound, WebApp
- **Custom Application**: WebSocket-based AI voice application (`app/` directory)

The custom application in `app/` handles:
- AI-powered voice greetings with SSML support
- Interactive voice menus (DTMF + speech recognition)
- Conversational AI capabilities
- Multiple TTS provider support (Google, AWS, ElevenLabs)

## Key Commands

### Development
```bash
# Start the entire stack
./setup.sh

# Interactive management
./run.sh

# Start development mode for the app
cd app && npm run dev

# Start production mode
cd app && npm start
```

### Docker Management
```bash
# View all services status
docker-compose ps

# View logs for all services
docker-compose logs -f

# View logs for specific service
docker-compose logs -f app

# Restart the custom application
docker-compose restart app

# Rebuild and restart
docker-compose build --no-cache app && docker-compose up -d app

# Stop all services
docker-compose down

# Reset everything including data
docker-compose down -v
```

### ngrok Setup
```bash
# Setup ngrok tunnel (required for VoIP.ms integration)
./scripts/setup-ngrok.sh [your-ngrok-token]

# Configure VoIP.ms integration
node scripts/configure-voipms.js
```

## Application Structure

### Core Files
- `app/index.js` - Main WebSocket server entry point
- `app/lib/routes.js` - Route handler registration
- `app/lib/ai-greeting.js` - Main call handler with AI greeting and menu system
- `app/lib/conversation.js` - Conversational AI handler (expandable)

### Configuration
- `.env` - Environment variables (VoIP.ms credentials, TTS provider settings)
- `docker-compose.yml` - Service definitions and network configuration
- `app/config/` - TTS provider credential files (Google service account JSON)

## Development Workflow

1. **Modifying Voice Logic**: Edit files in `app/lib/`
2. **Testing Changes**: Restart the app container with `docker-compose restart app`
3. **Viewing Logs**: Use `docker-compose logs -f app` to monitor application logs
4. **Testing Calls**: Ensure ngrok tunnel is active and call your VoIP.ms DID

## TTS Provider Configuration

The application supports multiple TTS providers configured via environment variables:
- **Google Cloud TTS**: Requires service account JSON in `app/config/`
- **AWS Polly**: Requires AWS credentials in `.env`
- **ElevenLabs**: Requires API key in `.env`

## Network Architecture

All services run on a custom Docker network (`172.20.0.0/16`) with these exposed ports:
- 3000: API Server
- 3001: Feature Server
- 3002: Web Portal
- 3003: Custom WebSocket App
- 3306: MySQL
- 5060: SIP traffic
- 30000-30100: RTP media

## Key Integration Points

- **VoIP.ms Integration**: SIP trunk configuration points to your public IP:5060
- **Jambonz Webhooks**: Custom app endpoints (`/ai-greeting`, `/conversation`, `/menu`)
- **TTS Integration**: Configurable provider support with SSML formatting
- **Speech Recognition**: Real-time transcription with confidence scoring

## Testing

Make test calls to your VoIP.ms DID to verify:
1. AI greeting plays with appropriate TTS voice
2. Menu navigation works via voice and DTMF
3. Conversation flow handles various inputs
4. Session logging appears in container logs

## Development Principles

### YAGNI (You Aren't Gonna Need It)
We don't build functionality until it's truly needed. Premature features lead to wasted effort and harder maintenance.

### MCP Services First
ALWAYS use MCP services to research any technology, framework, or component before making changes or assumptions. The project has comprehensive MCP servers configured for accurate documentation and code analysis. Never guess about configurations, API endpoints, implementation details, or technical concepts when MCP services are available. Always consult MCP first before taking action.

## Common Issues

- **Services not starting**: Check `docker-compose logs` for dependency issues
- **No audio on calls**: Verify RTP port range (30000-30100) is open
- **VoIP.ms not connecting**: Ensure ngrok tunnel URL is configured correctly
- **TTS not working**: Verify provider credentials in `.env` and config files