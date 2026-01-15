
**ALWAYS use MCP services** to research Jambonz, Drachtio, or any framework before making changes. Never guess.

## Project Identity

Jambonz VoIP platform with AI voice capabilities. Microservices in Docker: Drachtio (SIP), FreeSWITCH (media), MySQL, Redis, plus custom WebSocket voice app.

## Key Locations

```
app/                    # Custom voice application
  index.js              # WebSocket server entry
  lib/ai-greeting.js    # Call handler + AI greeting
  lib/conversation.js   # Conversational AI
  config/               # TTS credentials
OpenSourceVoice/        # Main voice app (voice-app.js)
jambonz-source/         # Jambonz component sources
.env                    # Credentials (never commit secrets)
docker-compose.yml      # Service definitions
```

## Principles

- **YAGNI**: Don't build until needed. No premature features.
- **MCP First**: Research before assuming. Use MCP servers for docs.
- **Minimal Changes**: Only modify what's requested. No drive-by refactoring.

## References

Detailed docs in `.claude/usage/`:
- `docker-commands.md` - Container management
- `network-architecture.md` - Ports, IPs, topology
- `tts-providers.md` - TTS setup (Google, AWS, ElevenLabs, Coqui)
- `troubleshooting.md` - Common issues + ngrok setup
