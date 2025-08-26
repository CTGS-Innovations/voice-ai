# Outbound Call Testing

This directory contains test scripts for making outbound calls using the Jambonz API. These tests allow you to verify your voice AI system works correctly for both inbound and outbound scenarios.

## Overview

The outbound call testing system allows you to:
- Make test calls to your own phone number
- Use the same AI conversation flow as inbound calls
- Monitor call progress in real-time
- Test different configurations and scenarios

## Setup

### 1. Prerequisites

- Working Jambonz account (cloud or self-hosted)
- Configured phone number with outbound calling enabled
- Running voice AI application (`docker-compose up`)
- Public webhook URL (via ngrok or similar for local testing)

### 2. Configuration

Copy the example environment file and add your credentials:

```bash
cp .env.example .env
```

Edit `.env` and configure these required variables:

```env
# Jambonz API Credentials (required)
JAMBONZ_ACCOUNT_SID=your-account-sid-here
JAMBONZ_API_KEY=your-api-key-here
JAMBONZ_API_URL=https://api.jambonz.cloud

# Webhook Configuration (required)
WEBHOOK_BASE_URL=https://your-domain.com  # Or ngrok URL for local testing

# Test Configuration (optional - can be passed as command line arguments)
TEST_PHONE_NUMBER=+15551234567     # Your cell phone for testing
OUTBOUND_CALLER_ID=+15559876543    # Number to display as caller ID
```

### 3. Getting Your Jambonz Credentials

#### For Jambonz Cloud:
1. Log in to [jambonz.cloud](https://jambonz.cloud)
2. Navigate to Account Settings
3. Copy your Account SID
4. Generate an API key under API Keys section

#### For Self-Hosted:
1. Access your Jambonz admin panel
2. Find your Account SID in the accounts section
3. Create an API key with appropriate permissions

## Usage

### Quick Start

The simplest way to test an outbound call:

```bash
# Check your configuration
npm run test:outbound:check

# Make a test call using defaults from .env
npm run test:outbound
```

### Command Line Options

```bash
# Specify a different phone number
npm run test:outbound -- --to +15087374849

# Set custom caller ID
npm run test:outbound -- --from +15559876543

# Limit call duration to 60 seconds
npm run test:outbound -- --duration 60

# Full example
npm run test:outbound -- --to +15551234567 --from +15559876543 --duration 60
```

### Using the Test Script Directly

```bash
# Run directly with Node.js
node test/test-outbound-call.js --to +15551234567

# Using the bash runner
./test/run-test.sh --to +15551234567

# Check configuration only
./test/run-test.sh --check

# Skip pre-flight checks
./test/run-test.sh --skip-checks --to +15551234567
```

## How It Works

1. **Configuration Validation**: The script checks that all required environment variables are set
2. **Service Verification**: Ensures the webhook server is running and accessible
3. **Call Creation**: Makes a POST request to the Jambonz API to initiate the call
4. **Webhook Handling**: When answered, Jambonz calls your webhook URL
5. **AI Conversation**: Your voice app handles the conversation using the same flow as inbound calls
6. **Status Monitoring**: The script polls the call status and displays updates
7. **Graceful Termination**: Press Ctrl+C to end the call at any time

## Call Flow

```
Test Script                 Jambonz API              Your Phone           Voice App
     |                           |                        |                  |
     |-- Create Call Request --> |                        |                  |
     |                           |-- SIP INVITE --------> |                  |
     |<-- Call SID Response ---- |                        |                  |
     |                           |                        |-- Ringing        |
     |-- Poll Status ----------> |                        |                  |
     |<-- Status: ringing ------ |                        |                  |
     |                           |                        |-- Answer         |
     |                           |<-- SIP 200 OK -------- |                  |
     |                           |-- Webhook Request -----|----------------> |
     |                           |                        |<-- AI Greeting --|
     |-- Poll Status ----------> |                        |                  |
     |<-- Status: in-progress -- |                        |-- Conversation   |
     |                           |                        |<--------------->|
     |                           |                        |-- Hang up        |
     |                           |<-- SIP BYE ----------- |                  |
     |-- Poll Status ----------> |                        |                  |
     |<-- Status: completed ---- |                        |                  |
```

## Test Scenarios

### Basic Connectivity Test
```bash
# Quick test to verify everything works
npm run test:outbound -- --duration 30
```

### Load Testing
```bash
# Make multiple calls in sequence
for i in {1..5}; do
  npm run test:outbound -- --duration 60
  sleep 10
done
```

### Different Voice Configurations
```bash
# Test with different TTS providers (configure in .env first)
TTS_PROVIDER=chatterbox npm run test:outbound
TTS_PROVIDER=coqui npm run test:outbound
TTS_PROVIDER=elevenlabs npm run test:outbound
```

## Troubleshooting

### Common Issues

#### "Authentication failed"
- Verify your `JAMBONZ_API_KEY` is correct
- Check that the API key has appropriate permissions
- Ensure you're using the correct API URL

#### "Account not found"
- Double-check your `JAMBONZ_ACCOUNT_SID`
- Verify the account is active and has outbound calling enabled

#### "Webhook server is not responding"
- Ensure the voice app is running: `docker-compose ps`
- Check logs: `docker-compose logs -f app`
- Verify the webhook URL is publicly accessible

#### "Call failed with SIP status XXX"
- 404: The destination number is unreachable
- 486: The line is busy
- 480: Temporary failure (try again)
- 503: Service unavailable (check carrier configuration)

#### **Note on SIP 486 "Busy Here" Errors**

If you encounter persistent "SIP 486 Busy Here" errors, this typically indicates:
- The destination number is actually busy
- The number is unreachable or invalid
- Your Jambonz account may have carrier routing restrictions
- Check your Jambonz portal for SIP trunk configuration issues

The outbound call system requires only basic Jambonz API credentials - no additional SIP authentication is needed in your `.env` file.

### Debug Mode

For detailed logging, set the log level:

```bash
LOG_LEVEL=debug npm run test:outbound
```

### View Application Logs

Monitor the voice application logs during testing:

```bash
# In another terminal
docker-compose logs -f app
```

## API Details

The test uses the Jambonz REST API to create calls:

**Endpoint**: `POST /v1/Accounts/{AccountSid}/Calls`

**Request Body**:
```json
{
  "from": "+15559876543",
  "to": {
    "type": "phone",
    "number": "+15551234567"
  },
  "call_hook": "https://your-domain.com/webhook/call",
  "timeout": 60,
  "timeLimit": 120
}
```

**Response**:
```json
{
  "sid": "call-sid-here"
}
```

## Advanced Usage

### Custom Webhook Handler

To use a different webhook handler for outbound calls:

```javascript
// In test-outbound-call.js
const callOptions = {
  to: options.to,
  from: options.from,
  callHook: `${process.env.WEBHOOK_BASE_URL}/webhook/outbound-special`,
  timeLimit: options.duration
};
```

### Programmatic Usage

You can also use the outbound handler in your own scripts:

```javascript
const OutboundCallHandler = require('./src/lib/outbound-handler');

async function makeCall() {
  const handler = new OutboundCallHandler({
    accountSid: 'your-account-sid',
    apiKey: 'your-api-key',
    webhookBaseUrl: 'https://your-domain.com'
  });
  
  const result = await handler.createCall({
    to: '+15551234567',
    from: '+15559876543',
    timeout: 60
  });
  
  console.log('Call created:', result.callSid);
  
  // Monitor status
  const status = await handler.getCallStatus(result.callSid);
  console.log('Call status:', status.call_status);
}
```

## Security Considerations

- Never commit your `.env` file with real credentials
- Use environment-specific configurations for production
- Rotate API keys regularly
- Restrict API key permissions to minimum required
- Use webhook authentication tokens in production
- Monitor for unusual calling patterns

## Contributing

To improve the testing framework:

1. Add new test scenarios in `test/scenarios/`
2. Enhance error handling and reporting
3. Add performance benchmarking
4. Create automated test suites
5. Improve documentation and examples

## Resources

- [Jambonz Documentation](https://docs.jambonz.org)
- [Jambonz REST API Reference](https://docs.jambonz.org/reference/rest-call-control)
- [Voice AI Project README](../README.md)
- [Environment Configuration](./.env.example)