#!/usr/bin/env node

/**
 * Test Script for Outbound Calls
 * 
 * This script demonstrates how to initiate an outbound call using the Jambonz API
 * and connect it to your AI voice conversation system.
 * 
 * Usage:
 *   node test/test-outbound-call.js [options]
 *   
 * Options:
 *   --to <number>        Destination phone number (defaults to TEST_PHONE_NUMBER env var)
 *   --from <number>      Caller ID to display (defaults to OUTBOUND_CALLER_ID env var)
 *   --duration <seconds> Maximum call duration (defaults to 120 seconds)
 *   --message <text>     Custom greeting message (optional)
 *   --help              Show this help message
 * 
 * Examples:
 *   node test/test-outbound-call.js --to +15551234567
 *   node test/test-outbound-call.js --to +15551234567 --duration 60
 *   npm run test:outbound
 */

require('dotenv').config();
const OutboundCallHandler = require('../src/lib/outbound-handler');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    to: process.env.TEST_PHONE_NUMBER,
    from: process.env.OUTBOUND_CALLER_ID || process.env.TEST_PHONE_NUMBER,
    duration: 120,
    message: null,
    help: false
  };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--to':
        options.to = args[++i];
        break;
      case '--from':
        options.from = args[++i];
        break;
      case '--duration':
        options.duration = parseInt(args[++i]);
        break;
      case '--message':
        options.message = args[++i];
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
    }
  }
  
  return options;
}

// Show help message
function showHelp() {
  console.log(`
Outbound Call Test Script
=========================

This script initiates a test call to verify your outbound calling setup.

Usage:
  node test/test-outbound-call.js [options]

Options:
  --to <number>        Destination phone number (E.164 format)
  --from <number>      Caller ID to display (E.164 format)
  --duration <seconds> Maximum call duration in seconds (default: 120)
  --message <text>     Custom greeting message (optional)
  --help, -h          Show this help message

Environment Variables:
  JAMBONZ_ACCOUNT_SID  Your Jambonz account SID (required)
  JAMBONZ_API_KEY      Your Jambonz API key (required)
  JAMBONZ_API_URL      Jambonz API URL (default: https://api.jambonz.cloud)
  WEBHOOK_BASE_URL     Your webhook server URL (required)
  TEST_PHONE_NUMBER    Default destination number
  OUTBOUND_CALLER_ID   Default caller ID

Examples:
  # Use environment defaults
  node test/test-outbound-call.js

  # Specify phone number
  node test/test-outbound-call.js --to +15551234567

  # Set custom duration
  node test/test-outbound-call.js --to +15551234567 --duration 60

  # Using npm script
  npm run test:outbound -- --to +15551234567
`);
}

// Validate phone number format
function validatePhoneNumber(number, field) {
  if (!number) {
    return `${field} phone number is required`;
  }
  
  // Basic validation - should start with + or be 10+ digits
  const cleaned = number.replace(/\D/g, '');
  if (cleaned.length < 10) {
    return `${field} phone number appears invalid: ${number}`;
  }
  
  return null;
}

// Monitor call status
async function monitorCallStatus(handler, callSid, maxDuration) {
  console.log('\n📞 Monitoring call status...');
  console.log('Press Ctrl+C to end the call and exit\n');
  
  const startTime = Date.now();
  let lastStatus = null;
  let checkCount = 0;
  
  const interval = setInterval(async () => {
    checkCount++;
    
    try {
      const status = await handler.getCallStatus(callSid);
      
      // Only log if status changed
      if (status.call_status !== lastStatus) {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        console.log(`[${elapsed}s] Call status: ${status.call_status}`);
        
        // Log additional details for certain statuses
        switch (status.call_status) {
          case 'ringing':
            console.log('  🔔 Phone is ringing...');
            break;
          case 'in-progress':
            console.log('  📞 Call connected! AI conversation active.');
            break;
          case 'completed':
            console.log('  ✅ Call completed successfully.');
            clearInterval(interval);
            process.exit(0);
            break;
          case 'failed':
            console.log('  ❌ Call failed.');
            if (status.sip_status) {
              console.log(`  SIP Status: ${status.sip_status}`);
            }
            clearInterval(interval);
            process.exit(1);
            break;
          case 'busy':
            console.log('  🚫 Line is busy.');
            if (status.sip_status) {
              console.log(`  SIP Status: ${status.sip_status}`);
            }
            clearInterval(interval);
            process.exit(1);
            break;
          case 'no-answer':
            console.log('  ⏰ No answer (timeout).');
            clearInterval(interval);
            process.exit(1);
            break;
        }
        
        lastStatus = status.call_status;
      }
      
      // Check for max duration
      const elapsed = (Date.now() - startTime) / 1000;
      if (elapsed > maxDuration) {
        console.log(`\n⏱️  Maximum duration (${maxDuration}s) reached. Ending call...`);
        await handler.endCall(callSid);
        clearInterval(interval);
        process.exit(0);
      }
    } catch (error) {
      // Only log error once after a few retries
      if (checkCount > 3) {
        console.error('\n❌ Error checking call status:', error.message);
        clearInterval(interval);
        process.exit(1);
      }
    }
  }, 2000); // Check every 2 seconds
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Interrupt received. Ending call...');
    clearInterval(interval);
    
    try {
      await handler.endCall(callSid);
      console.log('✅ Call ended successfully.');
    } catch (error) {
      console.error('❌ Error ending call:', error.message);
    }
    
    process.exit(0);
  });
}

// Main test function
async function testOutboundCall() {
  const options = parseArgs();
  
  // Show help if requested
  if (options.help) {
    showHelp();
    process.exit(0);
  }
  
  console.log('🚀 Outbound Call Test Script');
  console.log('============================\n');
  
  // Validate configuration
  try {
    const handler = new OutboundCallHandler();
    const validation = handler.validateConfiguration();
    
    if (!validation.valid) {
      console.error('❌ Configuration issues found:');
      validation.issues.forEach(issue => console.error(`  - ${issue}`));
      console.error('\nPlease check your .env file and ensure all required variables are set.');
      console.error('Run with --help for more information.');
      process.exit(1);
    }
    
    console.log('✅ Configuration validated:');
    console.log(`  API URL: ${validation.config.apiUrl}`);
    console.log(`  Account: ${validation.config.accountSid}`);
    console.log(`  Webhook: ${validation.config.webhookBaseUrl}\n`);
    
    // Validate phone numbers
    const toError = validatePhoneNumber(options.to, 'Destination');
    if (toError) {
      console.error(`❌ ${toError}`);
      console.error('Please specify with --to <number> or set TEST_PHONE_NUMBER in .env');
      process.exit(1);
    }
    
    const fromError = validatePhoneNumber(options.from, 'Caller ID');
    if (fromError) {
      console.error(`❌ ${fromError}`);
      console.error('Please specify with --from <number> or set OUTBOUND_CALLER_ID in .env');
      process.exit(1);
    }
    
    // Display call parameters
    console.log('📞 Call Parameters:');
    console.log(`  To: ${options.to}`);
    console.log(`  From: ${options.from}`);
    console.log(`  Max Duration: ${options.duration} seconds`);
    if (options.message) {
      console.log(`  Custom Message: ${options.message}`);
    }
    console.log('');
    
    // Confirm before making the call
    console.log('⚠️  This will make a real phone call to the specified number.');
    console.log('Press Enter to continue or Ctrl+C to cancel...');
    
    await new Promise(resolve => {
      process.stdin.once('data', resolve);
    });
    
    // Create the call
    console.log('📞 Initiating outbound call...\n');
    
    const callOptions = {
      to: options.to,
      from: options.from,
      timeLimit: options.duration,
      useOfficialClient: false  // Use axios version with SIP trunk info
    };
    
    // Add custom message as tag if provided
    if (options.message) {
      callOptions.tag = {
        customMessage: options.message
      };
    }
    
    const result = await handler.createCall(callOptions);
    
    console.log('✅ Call created successfully!');
    console.log(`  Call SID: ${result.callSid}`);
    console.log(`  API Response Time: ${result.duration}ms`);
    
    // Monitor the call status
    await monitorCallStatus(handler, result.callSid, options.duration);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    
    if (error.message.includes('JAMBONZ_ACCOUNT_SID') || error.message.includes('JAMBONZ_API_KEY')) {
      console.error('\n📝 Setup Instructions:');
      console.error('1. Copy .env.example to .env');
      console.error('2. Add your Jambonz credentials:');
      console.error('   JAMBONZ_ACCOUNT_SID=your-account-sid');
      console.error('   JAMBONZ_API_KEY=your-api-key');
      console.error('   TEST_PHONE_NUMBER=+15551234567');
      console.error('3. Ensure your webhook server is accessible from the internet');
    }
    
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testOutboundCall().catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}

module.exports = { testOutboundCall };