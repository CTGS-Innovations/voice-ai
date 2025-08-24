const express = require('express');
const app = express();

app.use(express.json());

// Handle CORS preflight requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Account-Sid');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

// Log all incoming requests for debugging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Body:', JSON.stringify(req.body, null, 2));
  next();
});

app.post('/hello-world', (req, res) => {
  console.log('Processing hello-world webhook call');
  
  res.json([
    {
      verb: 'say',
      text: 'Hello! This is working! Your Jambonz system is successfully routing calls.',
      synthesizer: { 
        vendor: 'elevenlabs', 
        voice: process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'
      }
    },
    { verb: 'hangup' }
  ]);
});

app.post('/dial-time', (req, res) => {
  const now = new Date();
  const timeString = now.toLocaleTimeString('en-US', { 
    timeZone: 'America/New_York',
    hour12: true 
  });
  
  res.json([
    {
      verb: 'say',
      text: `The current time is ${timeString}`,
      synthesizer: {
        vendor: 'google',
        voice: 'en-US-Standard-C'
      }
    },
    { verb: 'hangup' }
  ]);
});

app.post('/call-status', (req, res) => {
  console.log('Call status webhook received');
  res.status(200).end();
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

const port = process.env.HTTP_PORT || 3003;
app.listen(port, () => {
  console.log(`Clean HTTP webhook app listening on port ${port}`);
  console.log('Available endpoints:');
  console.log('  POST /hello-world');
  console.log('  POST /dial-time');  
  console.log('  POST /call-status');
  console.log('  GET  /health');
});