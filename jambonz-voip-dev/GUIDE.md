# Jambonz VoIP Development Guide

## Quick Testing Guide

### How to Test a Call
1. Call your number: **+1-413-200-4849**
2. Watch the logs: `docker compose logs -f`

### What to Look For in Logs

#### ✅ SUCCESS INDICATORS

**1. Call Received (drachtio)**
```
recv 1006 bytes from udp/[208.100.60.68]:5060
INVITE sip:14132004849@192.168.1.169:5060 SIP/2.0
```
- **Good**: Shows VoIP.ms is sending calls to your server

**2. Call Processing (sbc-inbound)**  
```
{"level":30,"msg":"incoming call from 4133984849 to 14132004849"}
{"level":30,"msg":"routing call to feature server"}
```
- **Good**: SBC is processing the call and routing it

**3. App Response (app container)**
```
Hello world call received!
session.say({text: 'Hello! This is working!'})
```
- **Good**: Your application is handling the call

**4. Audio Playing (feature-server)**
```
{"level":30,"msg":"playing tts audio"}
{"level":30,"msg":"call completed successfully"}
```
- **Good**: TTS is working and call completed

#### ❌ FAILURE INDICATORS

**1. Connection Issues**
```
503 Service Unavailable
No connected clients found to handle incoming invite request
```
- **Problem**: Feature-server not connected to drachtio

**2. Authentication Issues**  
```
403 Forbidden
X-Reason: missing X-Account-Sid
```
- **Problem**: Carrier not associated with account in database

**3. Application Issues**
```
480 Temporarily Unavailable
webhook returned non-200 response
```
- **Problem**: Your webhook/app not responding properly

**4. Media Issues**
```
failed to allocate RTP ports
rtpengine error
```
- **Problem**: RTP/media proxy issues

### Current Status Check

#### Essential Service Connections
Run: `docker compose ps`

All should show "healthy" or "running":
- ✅ mysql (healthy)
- ✅ redis (healthy) 
- ✅ drachtio (running)
- ✅ freeswitch (running)
- ✅ feature-server (running)
- ✅ sbc-inbound (running)
- ✅ app (running)

#### Service Connection Health
Look for these in logs:

**drachtio**: `Added client, count of connected clients is now: 3`
**feature-server**: `connected to freeswitch at freeswitch, media ready`
**sbc-inbound**: `connected to drachtio`
**app**: `WebSocket server listening on port 3003`

### Test Your Number Now

Call **+1-413-200-4849** and look for:

1. **INVITE** message in drachtio logs (call coming in)
2. **Processing** messages in sbc-inbound logs  
3. **Hello world call received!** in app logs
4. **TTS audio** playing confirmation

If you see all 4, your system is working! 🎉

### Troubleshooting Quick Fixes

**If you get busy signal:**
1. Check if all services are running: `docker compose ps`
2. Look for "503 Service Unavailable" or "480" in drachtio logs
3. Restart if needed: `docker compose restart feature-server sbc-inbound`

**If no logs appear:**
1. Check VoIP.ms is routing to your IP: `76.28.51.233:5060`
2. Check port forwarding is active on your router
3. Verify public IP hasn't changed

**For detailed debugging:**
1. Single service logs: `docker compose logs -f app`
2. Recent logs only: `docker compose logs --since=2m`
3. Search logs: `docker compose logs | grep ERROR`

## Architecture Overview

```
VoIP.ms → Your Router:5060 → Drachtio → SBC-Inbound → Feature-Server → Your App
                                   ↓
                               FreeSWITCH (TTS/Media)
```

**Call Flow:**
1. VoIP.ms sends INVITE to your public IP
2. Router forwards to drachtio container (172.20.0.3:5060)
3. Drachtio routes to sbc-inbound (if carrier configured)
4. SBC-inbound routes to feature-server (if account found)
5. Feature-server calls your webhook app (172.20.0.10:3003)
6. App responds with instructions (e.g., say "Hello")
7. Feature-server executes via FreeSWITCH (TTS, media)

## Key Configuration

### Network
- **Public IP**: 76.28.51.233
- **SIP Port**: 5060 (forwarded to drachtio)
- **RTP Ports**: 30000-30100 (forwarded for media)

### VoIP.ms Settings
- **DID**: +1-413-200-4849
- **SIP URI**: `sip:1{DID}@76.28.51.233:5060`
- **Server IP**: 208.100.60.67/20 (configured in database)

### Test Endpoints
- **WebApp**: http://192.168.1.169:3002 (admin interface)
- **API**: http://192.168.1.169:3000 (Jambonz REST API)
- **App**: http://192.168.1.169:3003 (your custom app)

### Database
- **Default Account**: `9351f46a-678c-43f5-b8a6-d4eb58d131af`
- **VoIP.ms Carrier**: Associated with default account
- **SIP Gateway**: 208.100.60.67/20 → VoIP.ms carrier

## Environment Files

### Main Config (.env)
- VoIP.ms credentials
- TTS/STT API keys (ElevenLabs, OpenAI)
- Database passwords
- Network settings

### App Config (app/.env)
- Webhook URLs for Jambonz
- TTS provider settings
- WebSocket configuration

## Common Commands

```bash
# Start everything
./setup.sh

# Interactive management  
./run.sh

# View all logs
docker compose logs -f

# View specific service
docker compose logs -f app

# Restart services
docker compose restart app

# Check status
docker compose ps

# Access database
docker compose exec mysql mysql -u root -p'jambonzR0ckS' jambones

# Test call now
# Call: +1-413-200-4849
```

---

**Next Steps After Success:**
1. Customize your app response in `app/lib/routes.js`
2. Add speech recognition features  
3. Build conversational AI flows
4. Configure additional TTS providers
5. Set up call recording and analytics