#!/usr/bin/env node

/**
 * Configure VoIP.ms as a carrier in Jambonz
 * This script uses the Jambonz API to set up VoIP.ms integration
 */

require('dotenv').config({path: '../.env'});
const https = require('https');
const http = require('http');

const config = {
  jambonzApiUrl: process.env.JAMBONZ_API_URL || 'http://localhost:3000',
  jambonzApiKey: process.env.JAMBONZ_API_KEY,
  jambonzAccountSid: process.env.JAMBONZ_ACCOUNT_SID,
  voipms: {
    username: process.env.VOIPMS_USERNAME,
    password: process.env.VOIPMS_PASSWORD,
    server: process.env.VOIPMS_SERVER || 'chicago.voip.ms',
    did: process.env.VOIPMS_DID,
    callerID: process.env.VOIPMS_OUTBOUND_CALLERID
  }
};

// VoIP.ms server endpoints by region
const voipmsServers = {
  'chicago.voip.ms': ['chicago.voip.ms', 'chicago2.voip.ms'],
  'dallas.voip.ms': ['dallas.voip.ms', 'dallas2.voip.ms'],
  'newyork.voip.ms': ['newyork.voip.ms', 'newyork2.voip.ms'],
  'seattle.voip.ms': ['seattle.voip.ms', 'seattle2.voip.ms'],
  'atlanta.voip.ms': ['atlanta.voip.ms', 'atlanta2.voip.ms'],
  'losangeles.voip.ms': ['losangeles.voip.ms', 'losangeles2.voip.ms']
};

// API request helper
function apiRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(config.jambonzApiUrl + path);
    const isHttps = url.protocol === 'https:';
    const httpModule = isHttps ? https : http;
    
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: method,
      headers: {
        'Authorization': `Bearer ${config.jambonzApiKey}`,
        'Content-Type': 'application/json'
      }
    };
    
    const req = httpModule.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(body ? JSON.parse(body) : {});
          } catch (e) {
            resolve(body);
          }
        } else {
          reject(new Error(`API request failed: ${res.statusCode} - ${body}`));
        }
      });
    });
    
    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function createVoipMsCarrier() {
  console.log('🔧 Configuring VoIP.ms carrier in Jambonz...\n');
  
  // Validate configuration
  if (!config.voipms.username || !config.voipms.password) {
    console.error('❌ Error: VoIP.ms credentials not found in .env file');
    console.log('   Please update VOIPMS_USERNAME and VOIPMS_PASSWORD in .env');
    process.exit(1);
  }
  
  if (!config.jambonzApiKey || !config.jambonzAccountSid) {
    console.error('❌ Error: Jambonz API credentials not configured');
    console.log('   Please run the setup script first to initialize Jambonz');
    process.exit(1);
  }
  
  try {
    // Step 1: Create the VoIP carrier
    console.log('1️⃣  Creating VoIP carrier...');
    const carrierData = {
      name: 'VoIP.ms',
      description: 'VoIP.ms SIP Trunk',
      account_sid: config.jambonzAccountSid,
      e164_leading_plus: true,
      requires_register: true,
      register_username: config.voipms.username,
      register_password: config.voipms.password,
      register_sip_realm: config.voipms.server,
      tech_prefix: ''
    };
    
    const carrier = await apiRequest('POST', '/v1/VoipCarriers', carrierData);
    console.log(`   ✅ Carrier created with SID: ${carrier.sid}`);
    
    // Step 2: Add outbound gateways
    console.log('\n2️⃣  Adding outbound gateways...');
    const servers = voipmsServers[config.voipms.server] || [config.voipms.server];
    
    for (let i = 0; i < servers.length; i++) {
      const gatewayData = {
        voip_carrier_sid: carrier.sid,
        ipv4: servers[i],
        port: 5060,
        netmask: 32,
        inbound: false,
        outbound: true,
        priority: i + 1
      };
      
      await apiRequest('POST', '/v1/SipGateways', gatewayData);
      console.log(`   ✅ Added outbound gateway: ${servers[i]}`);
    }
    
    // Step 3: Add inbound gateways (VoIP.ms IP ranges)
    console.log('\n3️⃣  Adding inbound gateways...');
    const inboundIPs = [
      '216.245.221.0/27',  // VoIP.ms network range
      '159.203.0.0/16'     // Additional VoIP.ms range
    ];
    
    for (const ip of inboundIPs) {
      const [ipv4, netmask] = ip.split('/');
      const gatewayData = {
        voip_carrier_sid: carrier.sid,
        ipv4: ipv4,
        port: 5060,
        netmask: parseInt(netmask),
        inbound: true,
        outbound: false
      };
      
      await apiRequest('POST', '/v1/SipGateways', gatewayData);
      console.log(`   ✅ Added inbound gateway: ${ip}`);
    }
    
    // Step 4: Create phone number
    if (config.voipms.did) {
      console.log('\n4️⃣  Creating phone number...');
      const phoneData = {
        number: config.voipms.did,
        voip_carrier_sid: carrier.sid,
        account_sid: config.jambonzAccountSid
      };
      
      const phone = await apiRequest('POST', '/v1/PhoneNumbers', phoneData);
      console.log(`   ✅ Phone number created: ${config.voipms.did}`);
      console.log(`   📞 Phone SID: ${phone.sid}`);
    }
    
    console.log('\n✨ VoIP.ms carrier configuration complete!');
    console.log('\n📋 Next steps:');
    console.log('   1. Log into your VoIP.ms account');
    console.log('   2. Go to "DID Numbers" → "Manage DIDs"');
    console.log('   3. Edit your DID and set:');
    console.log(`      - Routing: "SIP/IAX"`)
    console.log(`      - SIP URI: ${config.voipms.username}@YOUR_PUBLIC_IP:5060`);
    console.log('   4. Save the changes');
    console.log('\n   Your Jambonz server will register with VoIP.ms automatically.');
    
    // Save carrier SID to env file
    console.log('\n💾 Saving carrier configuration...');
    const fs = require('fs');
    const envPath = require('path').join(__dirname, '..', '.env');
    let envContent = fs.readFileSync(envPath, 'utf8');
    
    if (!envContent.includes('JAMBONZ_CARRIER_SID')) {
      envContent += `\n# VoIP.ms Carrier Configuration\nJAMBONZ_CARRIER_SID=${carrier.sid}\n`;
      if (phone) {
        envContent += `JAMBONZ_PHONE_NUMBER_SID=${phone.sid}\n`;
      }
      fs.writeFileSync(envPath, envContent);
      console.log('   ✅ Configuration saved to .env file');
    }
    
  } catch (error) {
    console.error('\n❌ Error configuring VoIP.ms:', error.message);
    process.exit(1);
  }
}

// Run the configuration
if (require.main === module) {
  createVoipMsCarrier();
}

module.exports = { createVoipMsCarrier };