# Jambonz Docker Compose Architecture Audit

## Executive Summary

After analyzing your Docker Compose setup against the Jambonz source code, **your current architecture is fundamentally correct** but has one critical issue: **your application is using WebSocket API instead of HTTP webhooks**. The Feature Server expects HTTP webhook endpoints, not WebSocket connections.

## Architecture Validation

### ✅ Core Services - CORRECT
Your Docker Compose correctly implements all required Jambonz services:

| Service | Your Config | Source Validation | Status |
|---------|------------|-------------------|---------|
| MySQL 8.0 | Port 3306, jambones DB | Source uses MySQL 5.7/8.0 | ✅ Compatible |
| Redis 7 | Port 6379 | Source uses Redis 5+ | ✅ Compatible |
| Drachtio | Port 5060/9022 | Required for SIP | ✅ Correct |
| FreeSWITCH | Port 8021 | Media server required | ✅ Correct |
| RTPengine | Port 22222, UDP 30000-30100 | Media proxy required | ✅ Correct |
| API Server | Port 3000 | REST API required | ✅ Correct |
| Feature Server | Port 3001 | Call logic handler | ✅ Correct |
| SBC Inbound | Internal network | Handles inbound calls | ✅ Correct |
| SBC Outbound | Internal network | Handles outbound calls | ✅ Correct |
| WebApp | Port 3002 | Web portal | ✅ Correct |
| InfluxDB | Port 8086 | Metrics storage | ✅ Correct |

### ✅ Network Configuration - CORRECT
- Custom bridge network: `172.20.0.0/16` ✅
- RTPengine static IP: `172.20.0.15` ✅
- Service discovery via container names ✅

### ✅ Environment Variables - CORRECT
All critical environment variables are properly configured:
- `JAMBONES_NETWORK_CIDR: 172.20.0.0/16` ✅
- `JAMBONES_SBCS: sbc-inbound,sbc-outbound` ✅
- `JAMBONES_FREESWITCH: freeswitch:8021:ClueCon` ✅
- `JAMBONES_RTPENGINES: 172.20.0.15:22222` ✅

## Critical Issue Found

### ❌ Application Communication Protocol - INCORRECT

**Problem**: Your custom application (`app/`) is using WebSocket API (`@jambonz/node-client-ws`) but Jambonz Feature Server expects HTTP webhooks.

**Evidence from your code**:
```javascript
// app/index.js - Line 16
const makeService = createEndpoint({server}); // WebSocket endpoint
```

**What Jambonz expects**: HTTP POST endpoints that return JSON arrays of verbs.

## How Jambonz Actually Works

Based on the source code and documentation:

1. **Call Flow**:
   - Inbound call → SBC Inbound → Feature Server
   - Feature Server queries database for application webhook URL
   - Feature Server makes HTTP POST to webhook URL
   - Webhook returns JSON array of verbs (say, gather, dial, etc.)
   - Feature Server executes verbs sequentially

2. **Webhook Protocol**:
   - HTTP POST with call details
   - Response: JSON array of verb objects
   - Asynchronous events sent as additional HTTP POSTs

3. **Database Configuration Required**:
   - Applications table needs webhook URLs
   - Phone numbers linked to applications
   - Accounts and SIP trunks configured

## Solution Options

### Option 1: Convert to HTTP Webhooks (RECOMMENDED)
Convert your WebSocket application to HTTP endpoints:

```javascript
// app/index.js - HTTP version
const express = require('express');
const app = express();
app.use(express.json());

app.post('/hello-world', (req, res) => {
  res.json([
    {
      verb: 'say',
      text: 'Hello! This is working!',
      synthesizer: {
        vendor: 'elevenlabs',
        voice: process.env.ELEVENLABS_VOICE_ID
      }
    },
    { verb: 'hangup' }
  ]);
});

app.listen(3003);
```

### Option 2: Use Jambonz WebSocket Support
Jambonz DOES support WebSocket, but you need to:
1. Configure the application in the database with `ws://` URL
2. Ensure Feature Server can reach your WebSocket server
3. Use the correct WebSocket protocol implementation

### Option 3: Use Existing Demo
The source includes test scaffolds you could adapt:
- `jambonz-source/jambonz-feature-server/test/webhook/app.js`
- Provides working HTTP webhook examples

## Database Configuration Missing

Your setup is missing database initialization. You need:

1. **Schema creation**:
```sql
-- From jambonz-source/jambonz-api-server/db/jambones-sql.sql
-- Creates all required tables
```

2. **Initial data**:
```sql
-- From seed-production-database-open-source.sql
-- Creates default account, application, etc.
```

3. **Application registration**:
```sql
INSERT INTO applications (name, account_sid, call_hook_url, call_status_hook_url)
VALUES ('AI Voice App', 'account-sid', 'http://app:3003/hello-world', 'http://app:3003/call-status');
```

## Immediate Actions Required

1. **Initialize Database**:
```bash
docker exec -i jambonz-mysql mysql -uroot -p'jambonzR0ck$' jambones < jambonz-source/jambonz-api-server/db/jambones-sql.sql
docker exec -i jambonz-mysql mysql -uroot -p'jambonzR0ck$' jambones < jambonz-source/jambonz-api-server/db/seed-production-database-open-source.sql
```

2. **Configure Application**:
   - Use Jambonz WebApp at http://localhost:3002
   - Create account
   - Create application with webhook URL
   - Configure phone number routing

3. **Fix Application Protocol**:
   - Either convert to HTTP webhooks (recommended)
   - Or properly configure WebSocket URLs in database

## Validation Tests

To verify the setup works:

1. **Check Service Health**:
```bash
docker-compose ps  # All services should be "Up"
```

2. **Test Database**:
```bash
docker exec jambonz-mysql mysql -ujambonz -pjambonzP@ss -e "SELECT * FROM applications;" jambones
```

3. **Test Feature Server Connection**:
```bash
docker logs jambonz-feature-server | grep "connected to drachtio"
```

4. **Test Call Routing**:
```bash
# Make test call to your DID
# Check logs: docker-compose logs -f feature-server
```

## Conclusion

Your Docker Compose architecture is **95% correct**. The issues are:
1. **Protocol mismatch**: WebSocket app vs HTTP webhook expectation
2. **Missing database initialization**: No applications/accounts configured
3. **No phone number routing**: DIDs not linked to applications

These are configuration issues, not architectural flaws. The solution is straightforward: either convert to HTTP webhooks or properly configure WebSocket URLs in the database.

## Demo Solutions in Source

The Jambonz source includes complete test environments that could be adapted:
- `jambonz-feature-server/test/docker-compose-testbed.yaml` - Full test stack
- `jambonz-feature-server/test/webhook/` - Sample webhook application
- Database schemas and seed data in `jambonz-api-server/db/`

All components for a working demo exist and can be launched via Docker Compose with proper configuration.