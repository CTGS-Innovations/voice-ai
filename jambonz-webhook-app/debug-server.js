const express = require('express');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Log EVERYTHING
app.use((req, res, next) => {
  console.log('\n' + '='.repeat(50));
  console.log(`[${new Date().toISOString()}]`);
  console.log(`${req.method} ${req.originalUrl}`);
  console.log('From IP:', req.ip);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Body:', JSON.stringify(req.body, null, 2));
  }
  console.log('='.repeat(50));
  next();
});

// Try multiple possible webhook paths that Jambonz might use
const webhookHandler = (req, res) => {
  console.log('\n🎉 WEBHOOK HIT! 🎉');
  console.log('Path:', req.path);
  console.log('Call info:', {
    sid: req.body.call_sid,
    from: req.body.from,
    to: req.body.to,
    direction: req.body.direction
  });
  
  // Very simple response
  const response = [
    {
      "verb": "say",
      "text": "Success! Your webhook is working. This message confirms Jambonz reached your server."
    },
    {
      "verb": "hangup"
    }
  ];
  
  console.log('Responding with:', JSON.stringify(response, null, 2));
  res.json(response);
};

// Register multiple possible paths
app.post('/webhook/call', webhookHandler);
app.post('/webhook', webhookHandler);
app.post('/call', webhookHandler);
app.post('/', webhookHandler);

// Status webhook
app.post('/webhook/status', (req, res) => {
  console.log('\n📊 STATUS UPDATE:', req.body.call_status);
  res.sendStatus(200);
});

app.post('/status', (req, res) => {
  console.log('\n📊 STATUS UPDATE:', req.body.call_status);
  res.sendStatus(200);
});

// GET endpoints for browser testing
app.get('/', (req, res) => {
  res.json({ 
    status: 'Webhook server running',
    message: 'Waiting for POST webhooks from Jambonz',
    possible_endpoints: [
      'POST /webhook/call',
      'POST /webhook',
      'POST /call',
      'POST /',
      'POST /webhook/status',
      'POST /status'
    ],
    your_ip: req.ip,
    server_time: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Catch everything else
app.all('*', (req, res) => {
  console.log(`\n⚠️ Unhandled: ${req.method} ${req.path}`);
  res.status(404).json({ 
    error: 'Not found',
    method: req.method,
    path: req.path,
    message: 'This path is not configured'
  });
});

const PORT = 3003;
app.listen(PORT, '0.0.0.0', () => {
  console.log('\n' + '🚀'.repeat(20));
  console.log('DEBUG Webhook Server Started');
  console.log('=' + '='.repeat(40));
  console.log(`Listening on all interfaces: 0.0.0.0:${PORT}`);
  console.log(`\nPossible webhook URLs:`);
  console.log(`  http://76.28.51.233:${PORT}/webhook/call`);
  console.log(`  http://76.28.51.233:${PORT}/webhook`);
  console.log(`  http://76.28.51.233:${PORT}/call`);
  console.log(`  http://76.28.51.233:${PORT}/`);
  console.log('\nThis server will log EVERYTHING it receives');
  console.log('=' + '='.repeat(40));
});