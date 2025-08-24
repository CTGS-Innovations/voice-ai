const express = require('express');
const app = express();
app.use(express.json());

// Log all incoming requests for debugging
app.use((req, res, next) => {
  console.log(`\n[${new Date().toISOString()}] ${req.method} ${req.path}`);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// Main webhook endpoint
app.post('/webhook/call', (req, res) => {
  console.log('\n=== INCOMING CALL WEBHOOK ===');
  console.log('Call SID:', req.body.call_sid);
  console.log('From:', req.body.from);
  console.log('To:', req.body.to);
  console.log('Direction:', req.body.direction);
  
  // Simple test response - just basic TTS
  const response = [
    {
      "verb": "say",
      "text": "Hello! This is a direct connection test. Your webhook is working correctly on port 3003. The time is " + new Date().toLocaleTimeString() + ". Goodbye!"
    },
    {
      "verb": "pause",
      "length": 1
    },
    {
      "verb": "hangup"
    }
  ];
  
  console.log('Sending response:', JSON.stringify(response, null, 2));
  res.json(response);
});

// Status webhook
app.post('/webhook/status', (req, res) => {
  console.log('\n=== STATUS UPDATE ===');
  console.log('Call Status:', req.body.call_status);
  console.log('Call SID:', req.body.call_sid);
  res.sendStatus(200);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    server: 'direct-connection',
    port: PORT,
    time: new Date().toISOString()
  });
});

// Root endpoint for testing
app.get('/', (req, res) => {
  res.json({ 
    message: 'Jambonz Direct Webhook Server (No Ngrok)',
    status: 'running',
    port: PORT,
    test_command: `curl -X POST http://${req.hostname}:${PORT}/webhook/call -H "Content-Type: application/json" -d '{"call_sid":"test","from":"+1234567890","to":"+0987654321"}'`
  });
});

// Catch all other requests for debugging
app.all('*', (req, res) => {
  console.log(`\n!!! Unhandled route: ${req.method} ${req.path}`);
  res.status(404).json({ 
    error: 'Route not found',
    method: req.method,
    path: req.path,
    available_routes: [
      'POST /webhook/call',
      'POST /webhook/status',
      'GET /health',
      'GET /'
    ]
  });
});

const PORT = 3003; // Change to 3000 if you prefer
app.listen(PORT, '0.0.0.0', () => {
  console.log('\n========================================');
  console.log('Jambonz DIRECT Webhook Server (No Ngrok)');
  console.log('========================================');
  console.log(`Listening on: 0.0.0.0:${PORT}`);
  console.log(`\nYour webhook URLs for Jambonz:`);
  console.log(`  Call webhook: http://YOUR_PUBLIC_IP:${PORT}/webhook/call`);
  console.log(`  Status webhook: http://YOUR_PUBLIC_IP:${PORT}/webhook/status`);
  console.log('\nReplace YOUR_PUBLIC_IP with your actual public IP address');
  console.log('Make sure port forwarding is set up for port', PORT);
  console.log('========================================\n');
});