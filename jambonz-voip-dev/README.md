# Jambonz VoIP Development Environment with AI Voice

A complete development environment for Jambonz integrated with VoIP.ms and AI-powered voice capabilities. This setup provides a full telephony stack with text-to-speech, speech recognition, and conversational AI features.

## Features

- 🎯 **Complete Jambonz Stack**: All core components running in Docker
- 📞 **VoIP.ms Integration**: Ready-to-use SIP trunk configuration
- 🤖 **AI Voice Greeting**: Advanced TTS with multiple provider support
- 🎙️ **Speech Recognition**: Voice input processing and menu navigation
- 💬 **Conversational AI**: Expandable conversation handler
- 🌐 **ngrok Support**: Easy public URL exposure for development
- 🔧 **Easy Management**: Interactive CLI for stack control

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│   VoIP.ms       │────▶│   Jambonz    │────▶│  WebSocket App  │
│   SIP Trunk     │     │   SBC/Core   │     │   (AI Voice)    │
└─────────────────┘     └──────────────┘     └─────────────────┘
                              │
                    ┌─────────┴──────────┐
                    │                    │
              ┌─────▼─────┐       ┌─────▼─────┐
              │   MySQL   │       │   Redis   │
              └───────────┘       └───────────┘
```

## Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local development)
- ngrok account (free tier works)
- VoIP.ms account with:
  - Active account with credit
  - At least one DID (phone number)
  - API credentials enabled

## Quick Start

### 1. Clone and Setup

```bash
# Navigate to the project
cd jambonz-voip-dev

# Configure environment
cp .env .env.local  # Create a backup
nano .env           # Edit with your credentials
```

### 2. Configure Environment Variables

Edit `.env` with your actual credentials:

```env
# VoIP.ms Configuration
VOIPMS_USERNAME=your_actual_username
VOIPMS_PASSWORD=your_actual_password
VOIPMS_SERVER=chicago.voip.ms  # or your preferred server
VOIPMS_DID=+12125551234        # Your VoIP.ms phone number

# TTS Provider (choose one)
TTS_PROVIDER=google  # Options: google, aws, elevenlabs
# Add appropriate credentials based on provider
```

### 3. Start the Stack

```bash
# Initial setup and start
./setup.sh

# Or use the interactive manager
./run.sh
```

### 4. Access Services

- **Web Portal**: http://localhost:3002
  - Default: admin/admin (change on first login)
- **API Server**: http://localhost:3000
- **WebSocket App**: ws://localhost:3003

### 5. Expose Application with ngrok

```bash
# In a new terminal
./scripts/setup-ngrok.sh [your-ngrok-token]

# Copy the HTTPS URL provided (e.g., https://abc123.ngrok.io)
```

### 6. Configure VoIP.ms Integration

```bash
# After getting admin credentials from the web portal
node scripts/configure-voipms.js
```

### 7. Configure VoIP.ms Portal

1. Log into VoIP.ms account
2. Go to "DID Numbers" → "Manage DIDs"
3. Edit your DID:
   - **Routing**: SIP/IAX
   - **SIP URI**: `your_username@YOUR_PUBLIC_IP:5060`
4. Save changes

## TTS Provider Configuration

### Google Cloud TTS

1. Create a service account in Google Cloud Console
2. Download the JSON key file
3. Place in `app/config/google-service-account.json`
4. Update `.env`:
   ```env
   TTS_PROVIDER=google
   GOOGLE_APPLICATION_CREDENTIALS=/app/config/google-service-account.json
   ```

### AWS Polly

1. Get AWS access credentials
2. Update `.env`:
   ```env
   TTS_PROVIDER=aws
   AWS_ACCESS_KEY_ID=your_key
   AWS_SECRET_ACCESS_KEY=your_secret
   AWS_REGION=us-east-1
   ```

### ElevenLabs

1. Get API key from ElevenLabs
2. Update `.env`:
   ```env
   TTS_PROVIDER=elevenlabs
   ELEVENLABS_API_KEY=your_api_key
   ELEVENLABS_VOICE_ID=voice_id  # Optional
   ```

## Application Features

### AI Voice Greeting

The application includes a sophisticated greeting system that:
- Detects time of day for appropriate greeting
- Uses SSML for natural speech patterns
- Supports multiple TTS providers

### Interactive Menu

Voice and DTMF input support for:
1. **Information** - Learn about system capabilities
2. **AI Agent** - Connect to conversational AI
3. **Voicemail** - Leave a message
0. **Repeat** - Hear options again

### Conversation Handler

Expandable conversation system with:
- Context awareness
- Conversation history tracking
- Natural language understanding
- Graceful timeout handling

## Development

### Modify the Application

Edit files in `app/lib/`:
- `ai-greeting.js` - Main call handler
- `conversation.js` - AI conversation logic
- `routes.js` - Route definitions

### Add New Features

1. Create new handler in `app/lib/`
2. Register in `routes.js`
3. Restart the app container:
   ```bash
   docker-compose restart app
   ```

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f app

# Or use the manager
./run.sh  # Select option 4 or 5
```

## Testing

### Make a Test Call

1. Ensure all services are running
2. ngrok tunnel is active
3. VoIP.ms is configured
4. Call your VoIP.ms DID
5. You should hear the AI greeting

### Troubleshooting

#### Services not starting
```bash
# Check service status
./run.sh  # Select option 6

# View specific logs
docker-compose logs [service-name]
```

#### Database issues
```bash
# Reset database
./run.sh  # Select option 10
```

#### Network issues
- Ensure ports 3000-3003, 5060 are not in use
- Check firewall settings
- Verify Docker network: `docker network ls`

## Management Commands

### Using run.sh

The interactive manager provides:
- Start/stop/restart services
- View logs
- Check status
- Configure VoIP.ms
- Database management
- Container shell access

### Docker Commands

```bash
# Stop all services
docker-compose down

# Remove everything (including data)
docker-compose down -v

# Rebuild containers
docker-compose build --no-cache

# View running containers
docker ps

# Execute command in container
docker exec -it jambonz-app bash
```

## Architecture Details

### Components

- **MySQL**: Database for Jambonz configuration
- **Redis**: Cache and session storage
- **Drachtio**: SIP server
- **FreeSWITCH**: Media server
- **RTPengine**: Media proxy
- **SBC Inbound/Outbound**: Session border controllers
- **Feature Server**: Core Jambonz logic
- **API Server**: REST API interface
- **WebApp**: Management portal
- **App**: Custom WebSocket application

### Network

All services communicate on a custom Docker network (`172.20.0.0/16`).

### Ports

| Service | Internal | External | Purpose |
|---------|----------|----------|---------|
| MySQL | 3306 | 3306 | Database |
| Redis | 6379 | 6379 | Cache |
| API | 3000 | 3000 | REST API |
| Feature | 3001 | 3001 | Core server |
| WebApp | 3001 | 3002 | Web portal |
| App | 3003 | 3003 | WebSocket |
| SIP | 5060 | 5060 | SIP traffic |
| RTP | 30000-30100 | 30000-30100 | Media |

## Security Notes

⚠️ **For Development Only**: This setup is configured for development. For production:
- Use strong passwords
- Enable TLS/SRTP
- Configure proper firewall rules
- Use environment-specific secrets
- Enable authentication on all services
- Use proper SSL certificates

## Extending the System

### Add LLM Integration

1. Install LLM client library in `app/package.json`
2. Create LLM handler in `app/lib/llm-handler.js`
3. Update conversation logic
4. Configure API keys in `.env`

### Add SMS Support

1. Configure SMPP in VoIP carrier settings
2. Add SMS handling in application
3. Update routing logic

### Add Call Recording

1. Configure recording webhook
2. Add storage backend
3. Implement recording controls

## Support and Documentation

- [Jambonz Documentation](https://www.jambonz.org/docs/)
- [VoIP.ms Wiki](https://wiki.voip.ms/)
- [Docker Documentation](https://docs.docker.com/)
- [ngrok Documentation](https://ngrok.com/docs)

## License

This development environment is provided as-is for educational and development purposes.

## Troubleshooting Checklist

- [ ] All Docker containers running?
- [ ] ngrok tunnel active and URL updated?
- [ ] VoIP.ms credentials correct in `.env`?
- [ ] VoIP.ms DID configured with correct SIP URI?
- [ ] Firewall allowing SIP (5060) and RTP (30000-30100)?
- [ ] TTS provider credentials configured?
- [ ] Database initialized properly?
- [ ] Application webhook URL configured in Jambonz?

---

Created for seamless Jambonz development with VoIP.ms integration and AI voice capabilities.