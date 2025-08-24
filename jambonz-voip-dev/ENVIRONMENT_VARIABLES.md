🔍 Jambonz Environment Variable Discovery
Generated: Sat Aug 23 03:48:57 AM UTC 2025

## 🎯 **Analysis Summary**

This document contains all environment variables discovered in the Jambonz source code repositories.

**Purpose:** Stop guessing environment variables and understand exactly what configuration options are available.

---

## 📦 API Server

### Environment Variables Found:

### Configuration Files:

- `package.json`
- `package-lock.json`
- `lib/swagger/swagger.yaml`
- `lib/utils/appenv_schemaSchema.json`
- `lib/utils/free_plans.json`

### Docker Environment Variables:

```dockerfile
ARG NODE_ENV
ENV NODE_ENV $NODE_ENV
```

### Docker Compose References:

**File:** `test/docker-compose-testbed.yaml`
```yaml
    ports:
      - "3360:3306"
    environment: 
      MYSQL_ALLOW_EMPTY_PASSWORD: "yes"
    healthcheck:
      test: ["CMD", "mysqladmin" ,"ping", "-h", "127.0.0.1", "--protocol", "tcp"]
      timeout: 5s
      retries: 10
    networks:
      jambonz-api:
        ipv4_address: 172.58.0.2
  
  redis:
--
  db:
    image: postgres:11-alpine
    environment:
      POSTGRES_PASSWORD: homerSeven
      POSTGRES_USER: root
    expose:
```

### Account-Related Variables:

```javascript
    const rejectUnauthorized = process.env.JAMBONES_MYSQL_REJECT_UNAUTHORIZED;
      const header = `Basic ${toBase64(process.env.STRIPE_API_KEY)}`;
      assert.ok(process.env.GOOGLE_OAUTH_CLIENT_SECRET, 'env var GOOGLE_OAUTH_CLIENT_SECRET is required');
            client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      if (process.env.APPLY_JAMBONZ_DB_LIMITS && req.user.hasScope('account')) {
```


## 📦 Feature Server

### Environment Variables Found:

### Configuration Files:

- `package.json`
- `package-lock.json`
- `lib/utils/constants.json`
- `.github/workflows/docker-publish.yml`
- `.github/workflows/build.yml`

### Docker Environment Variables:

```dockerfile
ARG NODE_ENV
ENV NODE_ENV $NODE_ENV
```

### Docker Compose References:

**File:** `test/docker-compose-testbed.yaml`
```yaml
    ports:
      - "3360:3306"
    environment:
      MYSQL_ALLOW_EMPTY_PASSWORD: "yes"
    healthcheck:
      test: ["CMD", "mysqladmin" ,"ping", "-h", "127.0.0.1", "--protocol", "tcp"]
      timeout: 5s
      retries: 10
    networks:
      fs:
        ipv4_address: 172.38.0.5

  redis:
--
    restart: always
    command: freeswitch --rtp-range-start 20000 --rtp-range-end 20100
    environment:
      GOOGLE_APPLICATION_CREDENTIALS: /opt/credentials/gcp.json
    ports:
      - "8022:8021/tcp"
```

### Account-Related Variables:

```javascript
    const HTTP_USER_AGENT_HEADER = process.env.JAMBONES_HTTP_USER_AGENT_HEADER || 'jambonz';
    const JAMBONZ_DIAL_PAI_HEADER = process.env.JAMBONZ_DIAL_PAI_HEADER || false;
```


## 📦 Web Application

❌ **No environment variables found**
### Configuration Files:

- `package.json`
- `package-lock.json`
- `cypress/fixtures/userLogin.json`
- `cypress/fixtures/accounts.json`
- `cypress/fixtures/applications.json`

### Account-Related Variables:

❌ No account-related environment variables found


## 📦 SBC Inbound

### Environment Variables Found:

### Configuration Files:

- `package.json`
- `package-lock.json`
- `lib/constants.json`
- `.github/workflows/docker-publish.yml`
- `.github/workflows/npm-ci.yml`

### Docker Environment Variables:

```dockerfile
ARG NODE_ENV
ENV NODE_ENV $NODE_ENV
```

### Docker Compose References:

**File:** `test/docker-compose-testbed.yaml`
```yaml
    ports:
      - "3306:3306"
    environment: 
      MYSQL_ALLOW_EMPTY_PASSWORD: "yes"
    healthcheck:
      test: ["CMD", "mysqladmin" ,"ping", "-h", "localhost", "--protocol", "tcp"]
      timeout: 5s
      retries: 15    
    networks:
      sbc-inbound:
        ipv4_address: 172.38.0.2
  sbc:
    image: drachtio/drachtio-server:0.8.26
```

### Account-Related Variables:

```javascript
            const trackingOn = process.env.JAMBONES_TRACK_ACCOUNT_CALLS ||
      if (process.env.JAMBONES_TRACK_ACCOUNT_CALLS || process.env.JAMBONES_HOSTING) {
      if (process.env.JAMBONES_TRACK_APP_CALLS && application_sid) {
        if (process.env.JAMBONES_TRACK_ACCOUNT_CALLS || process.env.JAMBONES_HOSTING) {
        if (process.env.JAMBONES_TRACK_APP_CALLS && application_sid) {
```


## 📦 SBC Outbound

### Environment Variables Found:

### Configuration Files:

- `package.json`
- `package-lock.json`
- `lib/constants.json`
- `.github/workflows/docker-publish.yml`
- `.github/workflows/build.yml`

### Docker Environment Variables:

```dockerfile
ARG NODE_ENV
ENV NODE_ENV $NODE_ENV
```

### Docker Compose References:

**File:** `test/docker-compose-testbed.yaml`
```yaml
    ports:
      - "3306:3306"
    environment: 
      MYSQL_ALLOW_EMPTY_PASSWORD: "yes"
    healthcheck:
      test: ["CMD", "mysqladmin" ,"ping", "-h", "localhost", "--protocol", "tcp"]
      timeout: 5s
      retries: 10    
    networks:
      sbc-outbound:
        ipv4_address: 172.39.0.2

  sbc:
```

### Account-Related Variables:

```javascript
            const trackingOn = process.env.JAMBONES_TRACK_ACCOUNT_CALLS ||
      if (process.env.JAMBONES_TRACK_ACCOUNT_CALLS || process.env.JAMBONES_HOSTING) {
      if (process.env.JAMBONES_TRACK_APP_CALLS && application_sid) {
        if (process.env.JAMBONES_TRACK_ACCOUNT_CALLS || process.env.JAMBONES_HOSTING) {
        if (process.env.JAMBONES_TRACK_APP_CALLS && application_sid) {
```


---

## 📊 **Discovery Complete**

**Generated:** Sat Aug 23 03:48:58 AM UTC 2025
**Source Directory:** `/home/corey/voice-ai/jambonz-source`
**Total Services Analyzed:** 5

### 🔍 **Search Patterns Used:**
- `process.env.*` - JavaScript environment variable access
- `ENV` and `ARG` statements in Dockerfiles
- `environment:` sections in docker-compose files
- Account/header/auth related patterns

### 🎯 **Usage:**
Use this reference to:
1. Find legitimate environment variables for configuration
2. Understand what configuration options exist
3. Stop guessing and use documented variables only
