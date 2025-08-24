# Jambonz Source Code Audit

## Overview
This audit examines the jambonz source code structure to create a development docker-compose solution that builds from source instead of using pre-built images.

## Source Code Structure

### Repository Organization
The jambonz-source directory contains 5 main components:

```
jambonz-source/
├── jambonz-api-server/     # REST API server for management
├── jambonz-feature-server/ # Core call processing engine
├── jambonz-webapp/         # React-based web interface
├── sbc-inbound/           # Inbound session border controller
└── sbc-outbound/          # Outbound session border controller
```

## Component Analysis

### 1. jambonz-api-server
- **Version**: 0.9.5
- **Runtime**: Node.js 18.15 (Alpine)
- **Entry Point**: `app.js`
- **Port**: 3000 (HTTP API)
- **Key Dependencies**: Express, MySQL2, Redis, AWS SDK, JWT
- **Database**: MySQL for persistent storage, Redis for caching
- **Purpose**: Provides REST API for account management, provisioning, and configuration

### 2. jambonz-feature-server
- **Version**: 0.9.5
- **Runtime**: Node.js 20 (Alpine)
- **Entry Point**: `app.js`
- **Port**: 3001 (HTTP)
- **Key Dependencies**: Drachtio SRF, Express, SIP processing libraries
- **Purpose**: Core SIP call processing engine that executes voice applications
- **Integrations**: Connects to Drachtio SIP server, FreeSWITCH media server

### 3. jambonz-webapp
- **Version**: 0.9.5
- **Runtime**: Node.js 18.15 (Alpine)
- **Technology**: React + TypeScript + Vite
- **Build Process**: `npm run build` creates static dist
- **Serving**: Uses `serve` package on port 3001
- **Purpose**: Web-based management interface for jambonz platform
- **Special**: Uses entrypoint.sh to inject runtime configuration

### 4. sbc-inbound
- **Version**: 0.9.5
- **Runtime**: Node.js 20.13 (Alpine)
- **Entry Point**: `app.js`
- **Purpose**: Handles incoming SIP calls and routing
- **Dependencies**: Drachtio SRF, RTPEngine utils, database helpers
- **Health Check**: liveness.sh script available

### 5. sbc-outbound
- **Version**: 0.9.5
- **Runtime**: Node.js 18.15 (Alpine)
- **Entry Point**: `app.js`
- **Purpose**: Handles outgoing SIP calls and carrier connections
- **Dependencies**: Similar to sbc-inbound but focused on outbound routing

## Build Requirements

### Common Patterns
- All Node.js services use multi-stage Docker builds
- Alpine Linux base images for smaller footprint
- Build dependencies include: build-base, python3
- Production images exclude build tools

### Database Dependencies
- **MySQL 8.0**: Primary database for configuration and CDRs
- **Redis 7**: Caching and real-time data
- **InfluxDB 1.8**: Time-series metrics (required by jambonz)

### External Dependencies
- **Drachtio SIP Server**: SIP proxy/registrar
- **RTPEngine**: Media proxy for RTP streams
- **FreeSWITCH**: Media server for IVR, TTS, ASR functions

## Environment Configuration

### Shared Environment Variables
- `NODE_ENV`: development/production
- `JAMBONES_MYSQL_*`: Database connection settings
- `JAMBONES_REDIS_*`: Redis connection settings
- `DRACHTIO_*`: SIP server connection settings
- `JAMBONES_LOGLEVEL`: Logging verbosity
- `ENCRYPTION_SECRET`: Data encryption key
- `JWT_SECRET`: Authentication token signing

### Component-Specific Settings
- **API Server**: HTTP_PORT=3000, various cloud provider keys
- **Feature Server**: JAMBONES_FREESWITCH, JAMBONES_SBCS configuration
- **WebApp**: REACT_APP_API_BASE_URL for frontend-backend communication
- **SBC Components**: JAMBONES_RTPENGINES, JAMBONES_NETWORK_CIDR

## Security Considerations
- Services use internal Docker network (172.20.0.0/16)
- Database credentials should be externalized via environment variables
- TLS/HTTPS not configured in development setup
- External IP exposure for SIP signaling on port 5060

## Development vs Production
This audit reveals the source is designed for containerized deployment with:
- Development: Direct source mounting and hot reload capabilities
- Production: Multi-stage builds creating optimized images
- Health checks implemented for service orchestration
- Metrics collection via InfluxDB integration

## Recommendations for Source-Based Deployment
1. Build all services from source using local Dockerfiles
2. Maintain the same network topology (172.20.0.0/16)
3. Use volume mounts for development to enable hot reload
4. Preserve all environment variables for proper service communication
5. Consider adding development-specific overrides (e.g., file watching)

## Docker-Compose Comparison Analysis

### Original vs Cursor Implementation

#### Container Naming Strategy
| Service | Original | Cursor Version |
|---------|----------|----------------|
| MySQL | `jambonz-mysql` | `cursor-jambonz-mysql` |
| API Server | `jambonz-api-server` | `cursor-jambonz-api-server` |
| Feature Server | `jambonz-feature-server` | `cursor-jambonz-feature-server` |
| SBC Inbound | `jambonz-sbc-inbound` | `cursor-jambonz-sbc-inbound` |
| SBC Outbound | `jambonz-sbc-outbound` | `cursor-jambonz-sbc-outbound` |
| WebApp | `jambonz-webapp` | `cursor-jambonz-webapp` |
| App | `jambonz-app` | `cursor-jambonz-app` |
| InfluxDB | `jambonz-influxdb` | `cursor-jambonz-influxdb` |

**Infrastructure services unchanged**: Redis, Drachtio, RTPEngine, FreeSWITCH maintain original naming.

#### Image Sources: Pre-built vs Source-built

**Original (Pre-built Images)**:
```yaml
api-server:
  image: jambonz/jambonz-api-server:latest

feature-server:
  image: jambonz/jambonz-feature-server:latest

sbc-inbound:
  image: jambonz/sbc-inbound:latest

sbc-outbound:
  image: jambonz/sbc-outbound:latest

webapp:
  image: jambonz/jambonz-webapp:latest
```

**Cursor (Source-built)**:
```yaml
api-server:
  build:
    context: ./jambonz-source/jambonz-api-server
    dockerfile: Dockerfile
    args:
      NODE_ENV: development

feature-server:
  build:
    context: ./jambonz-source/jambonz-feature-server
    dockerfile: Dockerfile
    args:
      NODE_ENV: development

# Similar pattern for sbc-inbound, sbc-outbound, webapp
```

#### Development Enhancements

**Volume Mounts for Hot Reload**:
The cursor version adds development-friendly volume mounts:

```yaml
volumes:
  # Development: Mount source for hot reload
  - ./jambonz-source/jambonz-api-server:/opt/app
  - /opt/app/node_modules
```

**Enhanced WebApp Configuration**:
Cursor version adds comprehensive webapp environment variables:

```yaml
environment:
  REACT_APP_API_BASE_URL: http://localhost:3000/v1
  API_BASE_URL: http://localhost:3000/v1
  # WebApp configuration flags
  DISABLE_LCR: "false"
  DISABLE_JAEGER_TRACING: "false" 
  DISABLE_CUSTOM_SPEECH: "false"
  ENABLE_FORGOT_PASSWORD: "false"
  DISABLE_CALL_RECORDING: "false"
```

#### Preserved Infrastructure
Both implementations maintain identical configurations for:
- **Network topology**: `172.20.0.0/16` subnet
- **External dependencies**: MySQL, Redis, InfluxDB using same images
- **SIP infrastructure**: Drachtio, RTPEngine, FreeSWITCH unchanged
- **Port mappings**: All services expose same ports
- **Environment variables**: Core jambonz configuration preserved
- **Health checks**: API server health check maintained
- **Service dependencies**: Startup order and dependencies preserved

#### Development vs Production Trade-offs

**Cursor Implementation Benefits**:
- ✅ **Source control**: Changes to source code immediately reflected
- ✅ **Debugging**: Direct access to source code for troubleshooting
- ✅ **Customization**: Easy modification of jambonz components
- ✅ **Version control**: Explicit source code versioning
- ✅ **Hot reload**: Development productivity improvements

**Original Implementation Benefits**:
- ✅ **Faster startup**: Pre-built images eliminate build time
- ✅ **Production ready**: Optimized, tested container images
- ✅ **Smaller surface area**: Fewer dependencies and build requirements
- ✅ **Consistent deployment**: Same images across environments

#### Migration Path
To switch between implementations:

1. **Pre-built → Source**: Use `cursor_docker-compose.yml`
2. **Source → Pre-built**: Use original `docker-compose.yml`
3. **Hybrid approach**: Mix pre-built infrastructure with source-built application services

The cursor implementation successfully transforms a production-ready container orchestration into a development-friendly source-building environment while preserving all critical service communications and dependencies.
