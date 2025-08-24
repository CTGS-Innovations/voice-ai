require('dotenv').config();
const express = require('express');
const morgan = require('morgan');

const app = express();
app.use(express.json());
app.use(morgan('dev'));

// Simple test webhook - just plays a message and hangs up
app.post('/webhook/call', async (req, res) => {
  console.log('\n=== INCOMING CALL ===');
  console.log('Call SID:', req.body.call_sid);
  console.log('From:', req.body.from);
  console.log('To:', req.body.to);
  console.log('Full request body:', JSON.stringify(req.body, null, 2));
  
  // Simple response - just say something and hang up
  const response = [
    {
      "verb": "say",
      "text": "Hello! This is a test message from your webhook server. The connection is working successfully. Goodbye!"
    },
    {
      "verb": "pause",
      "length": 1
    },
    {
      "verb": "hangup"
    }
  ];
  
  console.log('\nSending response:', JSON.stringify(response, null, 2));
  res.json(response);
});

// Call status webhook
app.post('/webhook/status', (req, res) => {
  console.log('\n=== CALL STATUS UPDATE ===');
  console.log('Status:', req.body.call_status);
  console.log('Full body:', JSON.stringify(req.body, null, 2));
  res.status(200).send('OK');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    message: 'Test webhook server running'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Jambonz Test Webhook Server',
    status: 'running',
    endpoints: [
      'POST /webhook/call - Plays test message',
      'POST /webhook/status - Logs call status',
      'GET /health - Health check'
    ]
  });
});

// Catch all for debugging
app.all('*', (req, res) => {
  console.log('\n=== UNEXPECTED REQUEST ===');
  console.log('Method:', req.method);
  console.log('Path:', req.path);
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  res.status(404).json({ error: 'Not found', path: req.path, method: req.method });
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`Jambonz TEST Webhook Server Started`);
  console.log(`========================================`);
  console.log(`Port: ${PORT}`);
  console.log(`URL: http://localhost:${PORT}`);
  console.log(`\nTest with:`);
  console.log(`  curl -X POST http://localhost:${PORT}/webhook/call \\`);
  console.log(`    -H "Content-Type: application/json" \\`);
  console.log(`    -d '{"call_sid":"test","from":"+1234567890","to":"+0987654321"}'`);
  console.log(`========================================\n`);
});