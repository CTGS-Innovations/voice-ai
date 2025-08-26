#!/usr/bin/env node

/**
 * Digit Pattern Test Script
 * 
 * Tests various phone number formats to see which ones are accepted
 * by the VoIP.ms digit pattern and which ones get rejected.
 * 
 * This helps identify if the issue is with the digit pattern matching
 * or with actual call routing.
 */

require('dotenv').config();
const OutboundCallHandler = require('../src/lib/outbound-handler');

// Test numbers - mix of valid and invalid formats
const testNumbers = [
  // Valid USA numbers
  { number: '+15087374849', description: 'Your mobile (508 area code)' },
  { number: '+14137524849', description: 'Your VoIP (413 area code)' },
  { number: '+12125551234', description: 'NYC (212 area code)' },
  { number: '+13105551234', description: 'LA (310 area code)' },
  { number: '+17185551234', description: 'Brooklyn (718 area code)' },
  { number: '+15551234567', description: 'Generic 555 number' },
  
  // Edge cases that should work with proper NANP pattern
  { number: '+12025551234', description: 'DC (202 area code)' },
  { number: '+19175551234', description: 'NYC mobile (917)' },
  
  // Numbers that should be BLOCKED by proper USA pattern
  { number: '+15015551234', description: 'Invalid exchange (501 starts with 0)' },
  { number: '+11125551234', description: 'Invalid area code (112 starts with 1)' },
  { number: '+10125551234', description: 'Invalid area code (012 starts with 0)' },
];

async function testDigitPatterns() {
  console.log('🔍 Digit Pattern Test');
  console.log('====================\n');
  
  console.log('Testing which numbers are accepted by your VoIP.ms digit pattern...\n');
  
  const handler = new OutboundCallHandler();
  const results = [];
  
  for (const testCase of testNumbers) {
    console.log(`Testing: ${testCase.number} (${testCase.description})`);
    
    try {
      // Create call but don't actually wait for it to complete
      const result = await handler.createCall({
        to: testCase.number,
        from: '+14137524849',
        timeout: 10  // Short timeout since we just want to see if it's accepted
      });
      
      console.log(`  ✅ ACCEPTED - Call SID: ${result.callSid}`);
      
      // Immediately cancel the call to avoid ringing random numbers
      try {
        await handler.endCall(result.callSid);
        console.log(`  🛑 Cancelled immediately`);
      } catch (e) {
        // Ignore cancellation errors
      }
      
      results.push({
        number: testCase.number,
        description: testCase.description,
        accepted: true,
        callSid: result.callSid
      });
      
    } catch (error) {
      if (error.message.includes('Bad request')) {
        console.log(`  ❌ REJECTED - ${error.message}`);
        results.push({
          number: testCase.number,
          description: testCase.description,
          accepted: false,
          error: error.message
        });
      } else {
        console.log(`  ⚠️  ERROR - ${error.message}`);
        results.push({
          number: testCase.number,
          description: testCase.description,
          accepted: 'error',
          error: error.message
        });
      }
    }
    
    console.log(''); // Empty line between tests
    
    // Wait 1 second between tests to be nice to the API
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('SUMMARY RESULTS:');
  console.log('='.repeat(50));
  
  const accepted = results.filter(r => r.accepted === true);
  const rejected = results.filter(r => r.accepted === false);
  const errors = results.filter(r => r.accepted === 'error');
  
  console.log(`\n✅ ACCEPTED (${accepted.length}):`);
  accepted.forEach(r => console.log(`  ${r.number} - ${r.description}`));
  
  console.log(`\n❌ REJECTED (${rejected.length}):`);
  rejected.forEach(r => console.log(`  ${r.number} - ${r.description}`));
  
  console.log(`\n⚠️  ERRORS (${errors.length}):`);
  errors.forEach(r => console.log(`  ${r.number} - ${r.description}`));
  
  // Analysis
  console.log('\n' + '='.repeat(50));
  console.log('ANALYSIS:');
  console.log('='.repeat(50));
  
  if (accepted.length > 0 && rejected.length > 0) {
    console.log('✅ Your digit pattern is working and filtering numbers correctly!');
    console.log('   The call routing issue is likely carrier-specific, not pattern-related.');
  } else if (accepted.length === 0) {
    console.log('❌ No numbers were accepted - check your VoIP.ms digit pattern configuration.');
  } else if (rejected.length === 0) {
    console.log('⚠️  All numbers were accepted - your pattern might be too permissive.');
  }
  
  console.log('\nNext steps:');
  console.log('- If your mobile number was ACCEPTED, the issue is call routing, not patterns');
  console.log('- If your mobile number was REJECTED, check your digit pattern syntax');
  console.log('- Check VoIP.ms Call Detail Records to see what happens to accepted calls');
}

if (require.main === module) {
  testDigitPatterns().catch(error => {
    console.error('Test failed:', error.message);
    process.exit(1);
  });
}