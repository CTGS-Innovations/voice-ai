# Settings to Preserve During Rebuild

## Working VoIP.ms Integration
- **Phone Number:** +1-413-200-4849
- **VoIP.ms Account:** 317100_jam
- **External IP:** 76.28.51.233
- **SIP URI:** `sip:1{DID}@76.28.51.233:5060`

## Database Settings (WORKING)
```sql
-- VoIP.ms carrier configuration
UPDATE voip_carriers SET account_sid = '9351f46a-678c-43f5-b8a6-d4eb58d131af' WHERE name = 'VoIP.ms';

-- Account ID that works
account_sid: "9351f46a-678c-43f5-b8a6-d4eb58d131af"
carrier_id: "d4a4b99a-a443-4954-926d-8bd3a414ff21"

-- VoIP.ms SIP Gateways (Primary Servers)
208.100.60.68 (New York 3)
208.100.60.17 (Atlanta 1) 
208.100.60.8 (Chicago 1)
208.100.60.29 (Dallas 1)
208.100.60.35 (Los Angeles 1)
208.100.60.42 (Seattle 1)
```

## Docker Network (WORKING)
- Network CIDR: `172.20.0.0/16`
- Container IPs:
  - Drachtio: 172.20.0.3
  - Feature-server: 172.20.0.8
  - SBC-inbound: 172.20.0.9
  - SBC-outbound: 172.20.0.7
  - RTPengine: 172.20.0.15

## FreeSWITCH Configuration (WORKING)
```yaml
command: ["freeswitch", "--event-socket-port", "8021", "--password", "ClueCon", "--sip-port", "5080", "--rtp-range-start", "30000", "--rtp-range-end", "30100"]
```

## Environment Variables (WORKING)
```yaml
DRACHTIO_SECRET: cymru
FREESWITCH_SECRET: ClueCon
JAMBONES_FREESWITCH: freeswitch:8021:ClueCon
MYSQL_PASSWORD: jambonzP@ss
MYSQL_ROOT_PASSWORD: jambonzR0ck$
```

## Port Mappings (WORKING)
- 5060: SIP traffic (UDP/TCP)
- 30000-30100: RTP media range
- 3000: API Server
- 3001: Feature Server  
- 3002: Web Portal
- 3003: Custom App

## Custom App (WORKING)
- Location: `app/` directory
- Port: 3003
- WebSocket endpoints working

## WHAT WAS BROKEN
1. Feature-server automatic Redis registration 
2. SBC routing to feature-server (port confusion)
3. X-Account-Sid header passing in some flows

## REBUILD STRATEGY
1. Complete `docker-compose down -v` (clean slate)
2. Fresh container pulls
3. Reapply ONLY the working settings above
4. Test incrementally