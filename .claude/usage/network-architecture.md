# Network Architecture

## Docker Network
All services run on `172.20.0.0/16`

## Exposed Ports
| Port | Service |
|------|---------|
| 3000 | API Server |
| 3001 | Feature Server |
| 3002 | Web Portal |
| 3003 | Custom WebSocket App |
| 3306 | MySQL |
| 5060 | SIP traffic |
| 30000-30100 | RTP media |

## Integration Points
- **VoIP.ms**: SIP trunk to public IP:5060
- **Webhooks**: `/ai-greeting`, `/conversation`, `/menu`
- **TTS**: SSML formatting support
- **STT**: Real-time transcription with confidence scoring
