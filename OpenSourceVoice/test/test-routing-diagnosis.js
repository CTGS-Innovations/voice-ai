#!/usr/bin/env node

/**
 * VoIP.ms Routing Diagnosis Script
 * 
 * Tests various scenarios to understand what outbound calling works
 * and what fails, helping identify the specific VoIP.ms configuration issue.
 */

require('dotenv').config();
const OutboundCallHandler = require('../src/lib/outbound-handler');

// Test scenarios - strategic numbers to identify the issue
const testScenarios = [
  {
    number: '+14137524849',
    description: 'Same number (413→413)',
    expectation: 'Should work (confirmed working)',
    category: 'self-call'
  },
  {
    number: '+14135551234', 
    description: 'Different 413 number',
    expectation: 'Should work if same area code routing works',
    category: 'same-area'
  },
  {
    number: '+15081234567',
    description: 'Different 508 number (business)',
    expectation: 'Test if issue is your specific mobile or all 508',
    category: 'target-area'
  },
  {
    number: '+16175551234',
    description: 'Boston area (617)',
    expectation: 'Test Massachusetts routing',
    category: 'ma-routing'
  },
  {
    number: '+12125551234',
    description: 'NYC (212)',
    expectation: 'Test major city routing',
    category: 'major-city'
  },
  {
    number: '+18005551234',
    description: 'Toll-free (800)',
    expectation: 'Test if toll-free works',
    category: 'toll-free'
  }
];

async function diagnoseRouting() {
  console.log('🔍 VoIP.ms Routing Diagnosis');
  console.log('============================\n');
  
  const handler = new OutboundCallHandler();
  const results = [];
  
  console.log('Testing different routing scenarios (5-second tests)...\n');
  
  for (const scenario of testScenarios) {
    console.log(`Testing: ${scenario.number}`);
    console.log(`Category: ${scenario.category}`);
    console.log(`Expected: ${scenario.expectation}`);
    
    try {
      const result = await handler.createCall({
        to: scenario.number,
        from: '+14137524849',
        timeout: 5  // Very short timeout, just to see initial response
      });
      
      console.log(`✅ Call accepted - SID: ${result.callSid}`);
      
      // Monitor for 10 seconds to see the outcome
      let finalStatus = 'unknown';
      let sipStatus = null;
      
      for (let i = 0; i < 5; i++) { // Check 5 times over 10 seconds
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        try {
          const status = await handler.getCallStatus(result.callSid);
          finalStatus = status.call_status;
          sipStatus = status.sip_status;
          
          console.log(`  [${(i+1)*2}s] Status: ${finalStatus} (SIP: ${sipStatus})`);
          
          // Stop monitoring if call reaches final state
          if (['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(finalStatus)) {
            break;
          }
        } catch (e) {
          console.log(`  [${(i+1)*2}s] Status check failed: ${e.message}`);
          break;
        }
      }
      
      // Cancel the call if still in progress
      if (['trying', 'ringing', 'in-progress'].includes(finalStatus)) {
        try {
          await handler.endCall(result.callSid);
          console.log(`  🛑 Call cancelled`);
        } catch (e) {
          // Ignore cancellation errors
        }
      }
      
      results.push({
        ...scenario,
        accepted: true,
        finalStatus: finalStatus,
        sipStatus: sipStatus,
        callSid: result.callSid
      });
      
    } catch (error) {
      console.log(`❌ Call rejected: ${error.message}`);
      results.push({
        ...scenario,
        accepted: false,
        error: error.message
      });
    }
    
    console.log(''); // Empty line between tests
  }
  
  // Analysis
  console.log('\n' + '='.repeat(60));
  console.log('DIAGNOSIS RESULTS:');
  console.log('='.repeat(60));
  
  const categories = {};
  results.forEach(result => {
    if (!categories[result.category]) {
      categories[result.category] = [];
    }
    categories[result.category].push(result);
  });
  
  Object.keys(categories).forEach(category => {
    console.log(`\n📊 ${category.toUpperCase()}:`);
    categories[category].forEach(result => {
      const status = result.accepted ? 
        `✅ ${result.finalStatus} (SIP: ${result.sipStatus})` : 
        `❌ ${result.error}`;
      console.log(`  ${result.number}: ${status}`);
    });
  });
  
  // Pattern analysis
  console.log('\n' + '='.repeat(60));
  console.log('PATTERN ANALYSIS:');
  console.log('='.repeat(60));
  
  const working = results.filter(r => r.accepted && r.finalStatus === 'in-progress');
  const busy = results.filter(r => r.accepted && r.finalStatus === 'busy');
  const rejected = results.filter(r => !r.accepted);
  
  console.log(`\n✅ Working calls (${working.length}):`);
  working.forEach(r => console.log(`  ${r.number} - ${r.description}`));
  
  console.log(`\n🚫 Busy/Failed calls (${busy.length}):`);
  busy.forEach(r => console.log(`  ${r.number} - ${r.description} (SIP: ${r.sipStatus})`));
  
  console.log(`\n❌ Rejected calls (${rejected.length}):`);
  rejected.forEach(r => console.log(`  ${r.number} - ${r.description}`));
  
  // Recommendations
  console.log('\n' + '='.repeat(60));
  console.log('RECOMMENDATIONS:');
  console.log('='.repeat(60));
  
  if (working.length === 0 && busy.length > 0) {
    console.log('🔍 All calls reach "busy" status - likely VoIP.ms routing restrictions');
    console.log('   Check: Account settings, outbound calling features, geographic restrictions');
  }
  
  if (working.some(r => r.category === 'same-area') && busy.some(r => r.category === 'target-area')) {
    console.log('🔍 Same area code works, different area codes fail');
    console.log('   Check: VoIP.ms rate plans, long-distance calling settings');
  }
  
  if (working.some(r => r.category === 'toll-free')) {
    console.log('✅ Toll-free works - basic outbound calling is enabled');
  }
  
  console.log('\nNext steps: Check VoIP.ms Call Detail Records for these test calls');
}

if (require.main === module) {
  diagnoseRouting().catch(error => {
    console.error('Diagnosis failed:', error.message);
    process.exit(1);
  });
}