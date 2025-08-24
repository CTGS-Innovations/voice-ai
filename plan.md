# Jambonz VoIP System Deployment Plan

## Executive Summary

This plan outlines the step-by-step process to deploy a fully functional Jambonz VoIP system with AI voice capabilities. The goal is to achieve a minimum viable product (MVP) where you can call a phone number and have the system answer with an AI-powered voice response.

**Environment**: Ubuntu server VM running inside Unraid system  
**Public IP**: 76.28.51.233  
**Target**: Receive calls via VoIP.ms and respond with AI voice greeting  

## Prerequisites Status ✅

- **Docker**: Installed (`/usr/bin/docker`)
- **Docker Compose v2**: Installed (v2.39.1)  
- **Node.js**: Installed (`/usr/bin/node`)
- **Public IP**: Identified (76.28.51.233)
- **Codebase**: Complete with all required scripts

## Phase 1: System Foundation (Critical Path)

### Step 1: Environment Configuration
**Estimated Time**: 15 minutes  
**Priority**: CRITICAL

1. **Configure Environment Variables**
   ```bash
   cd /home/corey/voice-ai/jambonz-voip-dev
   cp .env.example .env
   ```

2. **Edit `.env` with VoIP.ms credentials**:
   - `PUBLIC_IP=76.28.51.233`
   - `VOIPMS_USERNAME=` (your VoIP.ms username)
   - `VOIPMS_PASSWORD=` (your VoIP.ms password)
   - `VOIPMS_SERVER=` (closest server: chicago.voip.ms, newyork.voip.ms, etc.)
   - `VOIPMS_DID=` (your VoIP.ms phone number in +1XXXXXXXXXX format)
   - `TTS_PROVIDER=google` (or aws/elevenlabs)

**Verification**: Confirm `.env` file contains correct credentials

### Step 2: TTS Provider Setup
**Estimated Time**: 10-30 minutes (varies by provider)  
**Priority**: HIGH

**Option A: Google Cloud TTS (Recommended)**
1. Create Google Cloud project
2. Enable Cloud Text-to-Speech API
3. Create service account and download JSON key
4. Place key file at `app/config/google-service-account.json`
5. Set `GOOGLE_APPLICATION_CREDENTIALS=/app/config/google-service-account.json` in `.env`

**Option B: AWS Polly**
1. Configure AWS credentials in `.env`

**Option C: ElevenLabs**
1. Get API key and configure in `.env`

**Verification**: TTS credentials are properly configured

### Step 3: Docker Infrastructure
**Estimated Time**: 5-10 minutes  
**Priority**: CRITICAL

1. **Initialize Database Scripts**
   ```bash
   cd database
   ./init-db.sh
   cd ..
   ```

2. **Install Application Dependencies**
   ```bash
   cd app
   npm install
   cd ..
   ```

**Verification**: Database scripts downloaded, npm dependencies installed

## Phase 2: Core Services Deployment

### Step 4: Launch Jambonz Stack
**Estimated Time**: 10-15 minutes  
**Priority**: CRITICAL

1. **Start All Services**
   ```bash
   ./setup.sh
   ```
   OR
   ```bash
   docker compose up -d
   ```

2. **Monitor Service Health**
   ```bash
   ./run.sh
   # Select option 6 (Check service status)
   ```

**Expected Services**:
- ✅ mysql (port 3306)
- ✅ redis (port 6379)  
- ✅ drachtio (port 5060)
- ✅ rtpengine (ports 22222, 30000-30100)
- ✅ freeswitch (port 8021)
- ✅ api-server (port 3000)
- ✅ feature-server (port 3001)
- ✅ sbc-inbound
- ✅ sbc-outbound
- ✅ webapp (port 3002)
- ✅ app (port 3003)

**Verification**: All 11 services show as "running" in status check

### Step 5: Initial Configuration
**Estimated Time**: 10 minutes  
**Priority**: CRITICAL

1. **Access Web Portal**
   - Open: http://76.28.51.233:3002
   - OR: http://localhost:3002 (if accessing from VM)
   - Login: admin/admin
   - **IMMEDIATELY** change admin password

2. **Verify API Connectivity**
   ```bash
   curl http://localhost:3000/health
   ```

**Verification**: Web portal accessible, admin password changed, API responding

## Phase 3: External Connectivity

### Step 6: ngrok Tunnel Setup
**Estimated Time**: 5 minutes  
**Priority**: CRITICAL

1. **Install ngrok** (if not already installed)
   ```bash
   # Ubuntu/Debian
   curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null
   echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | sudo tee /etc/apt/sources.list.d/ngrok.list
   sudo apt update && sudo apt install ngrok
   ```

2. **Start ngrok Tunnel**
   ```bash
   ./scripts/setup-ngrok.sh [your-ngrok-auth-token]
   ```

3. **Copy ngrok URL**
   - Note the HTTPS URL (e.g., https://abc123.ngrok.io)
   - Update `.env` with `APP_WEBHOOK_URL=https://abc123.ngrok.io`

**Verification**: ngrok tunnel active, HTTPS URL captured

### Step 7: Firewall Configuration
**Estimated Time**: 5 minutes  
**Priority**: HIGH

**Unraid Host Configuration**:
1. Port forwarding: 5060 (SIP) → VM IP:5060
2. Port forwarding: 30000-30100 (RTP) → VM IP:30000-30100

**VM Ubuntu Firewall**:
```bash
sudo ufw allow 5060/udp
sudo ufw allow 5060/tcp  
sudo ufw allow 30000:30100/udp
sudo ufw status
```

**Verification**: Ports accessible from external networks

## Phase 4: VoIP Integration

### Step 8: Jambonz Application Configuration
**Estimated Time**: 15 minutes  
**Priority**: CRITICAL

1. **Create Jambonz Application via Web Portal**
   - Access: http://localhost:3002
   - Navigate to Applications → Create New
   - Set webhook URL: `https://your-ngrok-url.ngrok.io/ai-greeting`
   - Save application and note Application SID

2. **OR Use API Method**
   - Get admin credentials from web portal
   - Update script with credentials
   - Run configuration script (may need modification)

**Verification**: Application created in Jambonz with correct webhook URL

### Step 9: VoIP.ms Carrier Configuration
**Estimated Time**: 10 minutes  
**Priority**: CRITICAL

1. **Configure VoIP.ms in Jambonz**
   ```bash
   # First get API credentials from web portal
   node scripts/configure-voipms.js
   ```

2. **Configure VoIP.ms Portal**
   - Login to VoIP.ms account
   - Go to "DID Numbers" → "Manage DIDs"
   - Edit your DID:
     - **Routing**: SIP/IAX
     - **SIP URI**: `[username]@76.28.51.233:5060`
   - Save changes

**Verification**: VoIP.ms carrier configured in Jambonz, DID routing updated

## Phase 5: Testing & Validation

### Step 10: System Testing
**Estimated Time**: 15 minutes  
**Priority**: CRITICAL

1. **Local Component Tests**
   ```bash
   # Test TTS service
   curl -X POST http://localhost:3003/test-tts
   
   # Test WebSocket connectivity
   curl http://localhost:3003/health
   
   # Check logs
   docker compose logs -f app
   ```

2. **End-to-End Call Test**
   - Call your VoIP.ms DID
   - Expected flow:
     1. Call connects
     2. AI greeting plays
     3. Menu options presented
     4. DTMF/voice input accepted
   
3. **Troubleshooting Commands**
   ```bash
   # Check all services
   ./run.sh → option 6
   
   # View specific service logs
   docker compose logs -f feature-server
   docker compose logs -f app
   
   # Test SIP registration
   docker compose logs -f sbc-inbound | grep -i register
   ```

**Verification**: Successful inbound call with AI voice response

## Phase 6: Optimization & Monitoring

### Step 11: Performance Validation
**Estimated Time**: 10 minutes  
**Priority**: MEDIUM

1. **Audio Quality Test**
   - Test TTS clarity and speed
   - Verify no audio dropouts
   - Check latency between input and response

2. **System Resource Monitoring**
   ```bash
   docker stats
   free -h
   df -h
   ```

**Verification**: System performing within acceptable parameters

## Critical Dependencies & Blockers

### Hard Dependencies (Must be resolved)
1. **VoIP.ms Account**: Active account with DID and SIP credentials
2. **TTS Provider**: Configured and working credentials
3. **Public IP Access**: Ports 5060 and 30000-30100 accessible
4. **ngrok Tunnel**: Active HTTPS tunnel for webhooks

### Soft Dependencies (Can be deferred)
1. **SSL Certificates**: Can use ngrok for initial testing
2. **Professional TTS Voices**: Can start with default voices
3. **Advanced Call Features**: Can be added post-MVP

## Risk Mitigation

### High-Risk Areas
1. **Network Configuration**: Double-check port forwarding
2. **VoIP.ms Settings**: Incorrect SIP URI will prevent calls
3. **TTS Credentials**: Invalid credentials will cause silent failures
4. **ngrok Stability**: Free tier has session limits

### Troubleshooting Strategy
1. **Service by Service**: Test each component independently
2. **Log Analysis**: Use centralized logging for diagnosis
3. **Network Testing**: Use tools like `netcat` to verify connectivity
4. **Incremental Testing**: Start with local tests, then external

## Success Metrics

### MVP Success Criteria
- [ ] All 11 Docker services running healthy
- [ ] Web portal accessible and configured  
- [ ] ngrok tunnel active and stable
- [ ] VoIP.ms carrier registered
- [ ] Inbound calls connect successfully
- [ ] AI greeting plays clearly
- [ ] Menu navigation works (DTMF + voice)
- [ ] Call completes without errors

### Post-MVP Enhancements
- Custom TTS voices and languages
- Advanced conversation AI integration
- Call recording and analytics
- Multi-language support
- SMS integration
- Call transfer capabilities

## Estimated Total Deployment Time

**Optimistic**: 2-3 hours (everything works first try)  
**Realistic**: 4-6 hours (normal troubleshooting required)  
**Pessimistic**: 8+ hours (complex networking or provider issues)

## Next Steps After MVP

1. **Production Hardening**: SSL certificates, security configuration
2. **Monitoring Setup**: Metrics collection and alerting  
3. **Backup Strategy**: Database and configuration backups
4. **Scaling Planning**: Load balancing and high availability
5. **Feature Enhancement**: Advanced AI capabilities

---

*This plan is designed to get your Jambonz VoIP system operational as quickly as possible while maintaining quality and reliability. Each step builds upon the previous one, so it's important to verify completion before proceeding.*