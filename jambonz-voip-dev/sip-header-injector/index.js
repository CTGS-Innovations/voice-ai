const Srf = require('drachtio-srf');
const srf = new Srf();

srf.connect({
  host: '127.0.0.1',
  port: 9022,
  secret: 'cymru'
});

srf.invite((req, res) => {
  console.log(`Intercepted INVITE: ${req.get('Call-ID')}`);
  
  // Extract account_sid from some source (would need to implement lookup)
  const accountSid = '9351f46a-678c-43f5-b8a6-d4eb58d131af'; // Default for now
  
  // Inject X-Account-Sid header
  const headers = {
    'X-Account-Sid': accountSid,
    ...req.headers
  };
  
  // Forward to real feature server
  srf.createB2BUA(req, res, `sip:${req.calledNumber}@172.20.0.7:3001`, {
    headers,
    proxyRequestHeaders: ['all']
  }).then(({uas, uac}) => {
    console.log('Call successfully forwarded with X-Account-Sid header');
  }).catch(err => {
    console.error('Error forwarding call:', err);
    res.send(503);
  });
});

srf.on('connect', (err, hp) => {
  if (err) return console.error(`Error connecting: ${err}`);
  console.log(`SIP header injector connected to drachtio at ${hp}`);
});

console.log('SIP Header Injector starting on port 5070...');