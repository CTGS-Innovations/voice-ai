require('dotenv').config();
const express = require('express');
const OpenAI = require('openai');
const morgan = require('morgan');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(morgan('dev'));

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ElevenLabs Configuration
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';

// Store conversation history per call
const conversations = new Map();

// Store generated audio files
const audioCache = new Map();

// Directory for audio files
const AUDIO_DIR = '/home/corey/voice-ai/audio';

// Ensure audio directory exists
async function ensureAudioDir() {
  try {
    await fs.access(AUDIO_DIR);
  } catch {
    await fs.mkdir(AUDIO_DIR, { recursive: true });
  }
}

// Generate audio using ElevenLabs
async function generateElevenLabsAudio(text, callSid) {
  const audioId = crypto.randomBytes(16).toString('hex');
  const audioPath = path.join(AUDIO_DIR, `${audioId}.mp3`);
  
  console.log(`Generating ElevenLabs audio for call ${callSid}: ${text.substring(0, 50)}...`);
  
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${response.status} ${response.statusText}`);
    }
    
    const audioBuffer = await response.arrayBuffer();
    await fs.writeFile(audioPath, Buffer.from(audioBuffer));
    
    // Cache the audio file info
    audioCache.set(audioId, {
      path: audioPath,
      callSid: callSid,
      createdAt: Date.now()
    });
    
    console.log(`Audio generated successfully: ${audioId}`);
    return audioId;
  } catch (error) {
    console.error('Error generating ElevenLabs audio:', error);
    throw error;
  }
}

// Clean up old audio files (older than 1 hour)
async function cleanupOldAudio() {
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  
  for (const [audioId, info] of audioCache.entries()) {
    if (info.createdAt < oneHourAgo) {
      try {
        await fs.unlink(info.path);
        audioCache.delete(audioId);
        console.log(`Cleaned up old audio file: ${audioId}`);
      } catch (error) {
        console.error(`Error cleaning up audio file ${audioId}:`, error);
      }
    }
  }
}

// Start cleanup interval
setInterval(cleanupOldAudio, 10 * 60 * 1000); // Every 10 minutes

// Main call webhook - handles incoming calls (root and specific path)
const handleIncomingCall = async (req, res) => {
  console.log('=== NEW INCOMING CALL ===');
  console.log('Call SID:', req.body.call_sid);
  console.log('From:', req.body.from);
  console.log('To:', req.body.to);
  
  // Initialize conversation history for this call
  const callSid = req.body.call_sid;
  conversations.set(callSid, [
    {
      role: "system",
      content: "You are a helpful and friendly AI assistant in a phone conversation. Keep responses natural, conversational, and concise (under 60 words). Be warm and engaging. Ask follow-up questions to keep the conversation flowing naturally."
    }
  ]);
  
  const response = [
    {
      "verb": "say",
      "text": "Hello! This is a test using default TTS. Can you hear this message?"
    },
    {
      "verb": "gather",
      "input": ["speech"],
      "actionHook": "https://talk.mvp-scale.com/webhook/conversation",
      "timeout": 15,
      "speechTimeout": 3,
      "recognizer": {
        "vendor": "openai",
        "model": "whisper-1",
        "language": "en"
      }
    }
  ];
  
  console.log('Sending initial TTS test:', JSON.stringify(response, null, 2));
  res.json(response);
};

// Register the webhook handler on both root and specific paths
app.post('/', handleIncomingCall);
app.post('/webhook/call', handleIncomingCall);

// Conversation webhook - handles speech input and AI responses
app.post('/webhook/conversation', async (req, res) => {
  console.log('\n=== CONVERSATION INPUT ===');
  const callSid = req.body.call_sid;
  
  try {
    let userMessage = '';
    
    // Extract user speech
    if (req.body.speech && req.body.speech.alternatives && req.body.speech.alternatives[0]) {
      userMessage = req.body.speech.alternatives[0].transcript;
      console.log('User said:', userMessage);
    }
    
    // Handle timeout or no speech
    if (!userMessage || req.body.reason === 'timeout') {
      console.log('No speech detected or timeout');
      const response = [
        {
          "verb": "say",
          "text": "<speak><prosody rate='medium'>I didn't catch that. Could you please repeat what you'd like to talk about?</prosody></speak>",
          "synthesizer": {
            "vendor": "default"
          }
        },
        {
          "verb": "gather",
          "input": ["speech"],
          "actionHook": "https://talk.mvp-scale.com/webhook/conversation",
          "timeout": 15,
          "speechTimeout": 2,
          "recognizer": {
            "vendor": "google",
            "language": "en-US"
          }
        }
      ];
      return res.json(response);
    }
    
    // Check for goodbye phrases
    const goodbyePhrases = ['goodbye', 'bye', 'see you', 'talk to you later', 'gotta go', 'have to go', 'end call', 'hang up'];
    const isGoodbye = goodbyePhrases.some(phrase => userMessage.toLowerCase().includes(phrase));
    
    if (isGoodbye) {
      console.log('User said goodbye');
      const response = [
        {
          "verb": "say",
          "text": "<speak><prosody rate='medium'>It was wonderful talking with you! Have a great day, and feel free to call back anytime. Goodbye!</prosody></speak>",
          "synthesizer": {
            "vendor": "default"
          }
        },
        {
          "verb": "hangup"
        }
      ];
      
      // Clean up conversation history
      conversations.delete(callSid);
      return res.json(response);
    }
    
    // Get or initialize conversation history
    let conversationHistory = conversations.get(callSid) || [
      {
        role: "system",
        content: "You are a helpful and friendly AI assistant in a phone conversation. Keep responses natural, conversational, and concise (under 60 words). Be warm and engaging. Ask follow-up questions to keep the conversation flowing naturally."
      }
    ];
    
    // Add user message to history
    conversationHistory.push({
      role: "user",
      content: userMessage
    });
    
    console.log('Generating AI response...');
    
    // Generate AI response using OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: conversationHistory,
      max_tokens: 100,
      temperature: 0.8
    });
    
    const aiResponse = completion.choices[0].message.content;
    console.log('AI response:', aiResponse);
    
    // Add AI response to history
    conversationHistory.push({
      role: "assistant",
      content: aiResponse
    });
    
    // Update stored conversation
    conversations.set(callSid, conversationHistory);
    
    // Keep only last 10 messages to prevent context from getting too long
    if (conversationHistory.length > 11) {
      conversationHistory = [
        conversationHistory[0], // Keep system message
        ...conversationHistory.slice(-10) // Keep last 10 messages
      ];
      conversations.set(callSid, conversationHistory);
    }
    
    // Generate ElevenLabs audio URL for streaming
    const audioId = crypto.randomBytes(16).toString('hex');
    const audioUrl = `https://talk.mvp-scale.com/audio/stream/${audioId}?text=${encodeURIComponent(aiResponse)}&callSid=${callSid}`;
    console.log('Using ElevenLabs streaming audio:', audioUrl);
    
    const response = [
      {
        "verb": "play",
        "url": audioUrl
      },
      {
        "verb": "gather",
        "input": ["speech"],
        "actionHook": "https://talk.mvp-scale.com/webhook/conversation",
        "timeout": 15,
        "speechTimeout": 2,
        "recognizer": {
          "vendor": "openai",
          "model": "whisper-1",
          "language": "en"
        }
      }
    ];
    
    console.log('Sending TTS test response:', JSON.stringify(response, null, 2));
    res.json(response);
    
  } catch (error) {
    console.error('Error processing conversation:', error);
    
    const errorResponse = [
      {
        "verb": "say",
        "text": "<speak><prosody rate='medium'>I apologize, but I'm having a technical issue right now. Let me try again. What would you like to talk about?</prosody></speak>",
        "synthesizer": {
          "vendor": "default"
        }
      },
      {
        "verb": "gather",
        "input": ["speech"],
        "actionHook": "https://talk.mvp-scale.com/webhook/conversation",
        "timeout": 15,
        "speechTimeout": 2,
        "recognizer": {
          "vendor": "openai",
          "model": "whisper-1",
          "language": "en"
        }
      }
    ];
    
    res.json(errorResponse);
  }
});

// Status webhook handler
const handleCallStatus = (req, res) => {
  console.log('\n=== CALL STATUS UPDATE ===');
  console.log('Call SID:', req.body.call_sid);
  console.log('Status:', req.body.call_status);
  res.status(200).send('OK');
};

// Register status webhook on both paths
app.post('/webhook/status', handleCallStatus);
app.post('/status', handleCallStatus);

// Call status webhook (optional) - old version
app.post('/webhook/status-old', (req, res) => {
  console.log('\n=== CALL STATUS UPDATE ===');
  console.log('Call SID:', req.body.call_sid);
  console.log('Status:', req.body.call_status);
  
  // Clean up conversation history when call ends
  if (req.body.call_status === 'completed' || req.body.call_status === 'failed') {
    const callSid = req.body.call_sid;
    if (conversations.has(callSid)) {
      console.log('Cleaning up conversation history for call:', callSid);
      conversations.delete(callSid);
    }
  }
  
  res.status(200).send('OK');
});

// Serve audio files
app.get('/audio/:filename', (req, res) => {
  const filePath = `/home/corey/voice-ai/${req.params.filename}`;
  console.log('Serving audio file:', filePath);
  res.sendFile(filePath);
});

// Serve generated audio files
app.get('/audio/generated/:filename', (req, res) => {
  const audioId = req.params.filename.replace('.mp3', '');
  const audioInfo = audioCache.get(audioId);
  
  if (!audioInfo) {
    console.error('Audio file not found:', audioId);
    return res.status(404).send('Audio not found');
  }
  
  console.log('Serving generated audio:', audioInfo.path);
  res.sendFile(audioInfo.path);
});

// Stream ElevenLabs audio directly
app.get('/audio/stream/:audioId', async (req, res) => {
  const { audioId } = req.params;
  const { text, callSid } = req.query;
  
  if (!text) {
    return res.status(400).send('Text parameter required');
  }
  
  console.log(`Streaming ElevenLabs audio for call ${callSid}: ${text.substring(0, 50)}...`);
  
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream`, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${response.status} ${response.statusText}`);
    }
    
    // Set appropriate headers for audio streaming
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'no-cache');
    
    // Pipe the audio stream directly to the response
    const reader = response.body.getReader();
    
    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(Buffer.from(value));
        }
        res.end();
      } catch (error) {
        console.error('Error streaming audio:', error);
        res.status(500).end();
      }
    };
    
    await pump();
    console.log(`Completed streaming audio for: ${audioId}`);
    
  } catch (error) {
    console.error('Error streaming ElevenLabs audio:', error);
    res.status(500).send('Error generating audio');
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    activeConversations: conversations.size
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Jambonz Webhook Server with OpenAI and ElevenLabs',
    endpoints: [
      'POST /webhook/call - Initial call handler',
      'POST /webhook/conversation - Conversation handler',
      'POST /webhook/status - Call status updates',
      'GET /health - Health check'
    ]
  });
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, async () => {
  // Ensure audio directory exists
  await ensureAudioDir();
  
  console.log(`\n========================================`);
  console.log(`Jambonz Webhook Server Started`);
  console.log(`========================================`);
  console.log(`Port: ${PORT}`);
  console.log(`URL: http://localhost:${PORT}`);
  console.log(`\nWebhook endpoints:`);
  console.log(`  - Call webhook: http://localhost:${PORT}/webhook/call`);
  console.log(`  - Status webhook: http://localhost:${PORT}/webhook/status`);
  console.log(`\nIntegrations:`);
  console.log(`  - OpenAI: ${process.env.OPENAI_API_KEY ? 'Configured ✓' : 'Not configured ✗'}`);
  console.log(`  - ElevenLabs: ${process.env.ELEVENLABS_API_KEY ? 'Configured ✓' : 'Not configured ✗'}`);
  console.log(`========================================\n`);
});