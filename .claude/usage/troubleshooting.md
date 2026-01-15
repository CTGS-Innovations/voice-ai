# Troubleshooting

## Services not starting
Check `docker-compose logs` for dependency issues

## No audio on calls
Verify RTP port range (30000-30100) is open

## VoIP.ms not connecting
Ensure ngrok tunnel URL is configured correctly

## TTS not working
Verify provider credentials in `.env` and config files

## ngrok Setup
```bash
./scripts/setup-ngrok.sh [your-ngrok-token]
node scripts/configure-voipms.js
```
