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

// Performance testing data
const performanceMetrics = new Map();
let testMode = {
  enabled: true,
  currentMethod: 'streaming', // 'streaming' or 'non-streaming'
  alternatePerCall: true
};

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
  const generateStartTime = Date.now();
  const audioId = crypto.randomBytes(16).toString('hex');
  const audioPath = path.join(AUDIO_DIR, `${audioId}.mp3`);
  
  console.log(`🎵 NON-STREAM GENERATION: ${callSid} - ${text.substring(0, 30)}...`);
  const elevenLabsStartTime = Date.now();
  
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_turbo_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${response.status} ${response.statusText}`);
    }
    
    console.log(`⏱️  ELEVENLABS RESPONDED: +${Date.now() - elevenLabsStartTime}ms`);
    const bufferStartTime = Date.now();
    
    const audioBuffer = await response.arrayBuffer();
    console.log(`⏱️  AUDIO BUFFER READY: +${Date.now() - bufferStartTime}ms`);
    
    const writeStartTime = Date.now();
    await fs.writeFile(audioPath, Buffer.from(audioBuffer));
    console.log(`⏱️  FILE WRITTEN: +${Date.now() - writeStartTime}ms`);
    
    // Cache the audio file info
    audioCache.set(audioId, {
      path: audioPath,
      callSid: callSid,
      createdAt: Date.now()
    });
    
    console.log(`⏱️  NON-STREAM TOTAL: +${Date.now() - generateStartTime}ms - ${audioId}`);
    return audioId;
  } catch (error) {
    console.error(`⏱️  NON-STREAM ERROR: +${Date.now() - generateStartTime}ms -`, error);
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

// Performance testing utilities
function initializeCallPerformance(callSid) {
  const method = testMode.alternatePerCall 
    ? (testMode.currentMethod === 'streaming' ? 'non-streaming' : 'streaming')
    : testMode.currentMethod;
  
  if (testMode.alternatePerCall) {
    testMode.currentMethod = method;
  }
  
  performanceMetrics.set(callSid, {
    method: method,
    startTime: Date.now(),
    responses: [],
    totalAudioTime: 0,
    totalResponseTime: 0
  });
  
  console.log(`Call ${callSid} assigned method: ${method}`);
  return method;
}

function recordResponseTime(callSid, startTime, audioGenerationTime, textLength) {
  const metrics = performanceMetrics.get(callSid);
  if (!metrics) return;
  
  const totalTime = Date.now() - startTime;
  const responseData = {
    timestamp: new Date().toISOString(),
    totalTime: totalTime,
    audioGenerationTime: audioGenerationTime,
    textLength: textLength,
    wordsPerSecond: (textLength.split(' ').length / (totalTime / 1000)).toFixed(2)
  };
  
  metrics.responses.push(responseData);
  metrics.totalResponseTime += totalTime;
  performanceMetrics.set(callSid, metrics);
  
  console.log(`${metrics.method} response - Total: ${totalTime}ms, Audio: ${audioGenerationTime}ms, WPS: ${responseData.wordsPerSecond}`);
}

// Main call webhook - handles incoming calls (root and specific path)
const handleIncomingCall = async (req, res) => {
  console.log('=== NEW INCOMING CALL ===');
  console.log('Call SID:', req.body.call_sid);
  console.log('From:', req.body.from);
  console.log('To:', req.body.to);
  
  // Initialize conversation history for this call
  const callSid = req.body.call_sid;
  const testMethod = initializeCallPerformance(callSid);
  
  conversations.set(callSid, [
    {
      role: "system",
      content: `You are a helpful and friendly AI assistant in a phone conversation. Keep responses natural, conversational, and concise (under 60 words). Be warm and engaging. Ask follow-up questions to keep the conversation flowing naturally. 

IMPORTANT: You are currently being tested using ${testMethod} audio delivery. In your first response, casually mention "I'm using ${testMethod} audio processing for this conversation" so we can track the difference in user experience.`
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
  const requestStartTime = Date.now();
  console.log('\n=== CONVERSATION INPUT ===');
  console.log(`⏱️  REQUEST START: ${new Date().toISOString()}`);
  const callSid = req.body.call_sid;
  
  try {
    let userMessage = '';
    
    // Extract user speech
    if (req.body.speech && req.body.speech.alternatives && req.body.speech.alternatives[0]) {
      userMessage = req.body.speech.alternatives[0].transcript;
      console.log(`⏱️  SPEECH-TO-TEXT COMPLETE: +${Date.now() - requestStartTime}ms`);
      console.log('👤 USER SAID:', userMessage);
    }
    
    // Handle timeout or no speech
    if (!userMessage || req.body.reason === 'timeout') {
      console.log(`⏱️  NO SPEECH/TIMEOUT: +${Date.now() - requestStartTime}ms`);
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
      console.log(`⏱️  RESPONSE SENT: +${Date.now() - requestStartTime}ms TOTAL`);
      return res.json(response);
    }
    
    // Check for goodbye phrases
    const goodbyePhrases = ['goodbye', 'bye', 'see you', 'talk to you later', 'gotta go', 'have to go', 'end call', 'hang up'];
    const isGoodbye = goodbyePhrases.some(phrase => userMessage.toLowerCase().includes(phrase));
    
    if (isGoodbye) {
      console.log(`⏱️  GOODBYE DETECTED: +${Date.now() - requestStartTime}ms`);
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
      console.log(`⏱️  RESPONSE SENT: +${Date.now() - requestStartTime}ms TOTAL`);
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
    
    console.log(`⏱️  CONVERSATION SETUP: +${Date.now() - requestStartTime}ms`);
    const openaiStartTime = Date.now();
    
    // Generate AI response using OpenAI (FASTEST AVAILABLE MODEL)
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: conversationHistory,
      max_tokens: 50,
      temperature: 0.7
    });
    
    const aiResponse = completion.choices[0].message.content;
    console.log(`⏱️  OPENAI COMPLETE: +${Date.now() - openaiStartTime}ms`);
    console.log('🤖 AI RESPONSE:', aiResponse);
    
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
    
    // Get test method for this call
    const callMetrics = performanceMetrics.get(callSid);
    const testMethod = callMetrics?.method || 'streaming';
    console.log(`⏱️  USING METHOD: ${testMethod.toUpperCase()}`);
    
    let response;
    const audioStartTime = Date.now();
    
    if (testMethod === 'streaming') {
      // Streaming method - existing implementation
      const audioId = crypto.randomBytes(16).toString('hex');
      const audioUrl = `https://talk.mvp-scale.com/audio/stream/${audioId}?text=${encodeURIComponent(aiResponse)}&callSid=${callSid}`;
      console.log(`⏱️  STREAMING AUDIO SETUP: +${Date.now() - audioStartTime}ms`);
      
      response = [
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
      
      recordResponseTime(callSid, requestStartTime, Date.now() - audioStartTime, aiResponse);
      
    } else {
      // Non-streaming method - generate audio first, then serve
      console.log('⏱️  STARTING NON-STREAMING AUDIO GENERATION...');
      
      try {
        const audioId = await generateElevenLabsAudio(aiResponse, callSid);
        console.log(`⏱️  NON-STREAMING AUDIO COMPLETE: +${Date.now() - audioStartTime}ms`);
        const audioUrl = `https://talk.mvp-scale.com/audio/generated/${audioId}.mp3`;
        
        response = [
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
        
        recordResponseTime(callSid, requestStartTime, Date.now() - audioStartTime, aiResponse);
        
      } catch (error) {
        console.error(`⏱️  NON-STREAMING ERROR: +${Date.now() - audioStartTime}ms - Falling back to streaming:`, error);
        // Fallback to streaming
        const audioId = crypto.randomBytes(16).toString('hex');
        const audioUrl = `https://talk.mvp-scale.com/audio/stream/${audioId}?text=${encodeURIComponent(aiResponse)}&callSid=${callSid}`;
        
        response = [
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
      }
    }
    
    console.log(`⏱️  RESPONSE SENT: +${Date.now() - requestStartTime}ms TOTAL`);
    console.log(`📊 BREAKDOWN: Request→OpenAI: +${Date.now() - requestStartTime - (Date.now() - audioStartTime)}ms | Audio: +${Date.now() - audioStartTime}ms`);
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
  
  // Clean up conversation history and performance metrics when call ends
  if (req.body.call_status === 'completed' || req.body.call_status === 'failed') {
    const callSid = req.body.call_sid;
    if (conversations.has(callSid)) {
      console.log('Cleaning up conversation history for call:', callSid);
      conversations.delete(callSid);
    }
    
    // Keep performance metrics for analysis but mark as completed
    if (performanceMetrics.has(callSid)) {
      const metrics = performanceMetrics.get(callSid);
      metrics.completedAt = new Date().toISOString();
      metrics.callStatus = req.body.call_status;
      console.log(`Call ${callSid} completed with ${metrics.responses.length} responses using ${metrics.method} method`);
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
  const streamStartTime = Date.now();
  const { audioId } = req.params;
  const { text, callSid } = req.query;
  
  if (!text) {
    return res.status(400).send('Text parameter required');
  }
  
  console.log(`🎵 STREAM REQUEST: ${callSid} - ${text.substring(0, 30)}...`);
  const elevenLabsStartTime = Date.now();
  
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
        model_id: 'eleven_turbo_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${response.status} ${response.statusText}`);
    }
    
    console.log(`⏱️  ELEVENLABS RESPONDED: +${Date.now() - elevenLabsStartTime}ms`);
    
    // Set appropriate headers for audio streaming
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'no-cache');
    
    // Pipe the audio stream directly to the response
    const reader = response.body.getReader();
    let firstChunkTime = null;
    
    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          if (!firstChunkTime) {
            firstChunkTime = Date.now();
            console.log(`⏱️  FIRST AUDIO CHUNK: +${firstChunkTime - elevenLabsStartTime}ms`);
          }
          
          res.write(Buffer.from(value));
        }
        res.end();
      } catch (error) {
        console.error('⏱️  STREAMING ERROR:', error);
        res.status(500).end();
      }
    };
    
    await pump();
    console.log(`⏱️  STREAM COMPLETE: +${Date.now() - streamStartTime}ms TOTAL`);
    
  } catch (error) {
    console.error(`⏱️  STREAM ERROR: +${Date.now() - streamStartTime}ms -`, error);
    res.status(500).send('Error generating audio');
  }
});

// Performance metrics endpoint
app.get('/metrics', (req, res) => {
  const allMetrics = Array.from(performanceMetrics.entries());
  const streamingMetrics = allMetrics.filter(([_, data]) => data.method === 'streaming');
  const nonStreamingMetrics = allMetrics.filter(([_, data]) => data.method === 'non-streaming');
  
  const calculateStats = (metrics) => {
    if (metrics.length === 0) return null;
    
    const allResponses = metrics.flatMap(([_, data]) => data.responses);
    if (allResponses.length === 0) return null;
    
    const totalTimes = allResponses.map(r => r.totalTime);
    const audioTimes = allResponses.map(r => r.audioGenerationTime);
    const wpsValues = allResponses.map(r => parseFloat(r.wordsPerSecond));
    
    return {
      callCount: metrics.length,
      responseCount: allResponses.length,
      avgTotalTime: Math.round(totalTimes.reduce((a, b) => a + b, 0) / totalTimes.length),
      avgAudioTime: Math.round(audioTimes.reduce((a, b) => a + b, 0) / audioTimes.length),
      avgWordsPerSecond: parseFloat((wpsValues.reduce((a, b) => a + b, 0) / wpsValues.length).toFixed(2)),
      minTotalTime: Math.min(...totalTimes),
      maxTotalTime: Math.max(...totalTimes)
    };
  };
  
  const streamingStats = calculateStats(streamingMetrics);
  const nonStreamingStats = calculateStats(nonStreamingMetrics);
  
  let comparison = null;
  if (streamingStats && nonStreamingStats) {
    comparison = {
      totalTimeDifference: streamingStats.avgTotalTime - nonStreamingStats.avgTotalTime,
      audioTimeDifference: streamingStats.avgAudioTime - nonStreamingStats.avgAudioTime,
      wpsImprovement: ((streamingStats.avgWordsPerSecond - nonStreamingStats.avgWordsPerSecond) / nonStreamingStats.avgWordsPerSecond * 100).toFixed(1),
      fasterMethod: streamingStats.avgTotalTime < nonStreamingStats.avgTotalTime ? 'streaming' : 'non-streaming'
    };
  }
  
  res.json({
    testMode: testMode,
    timestamp: new Date().toISOString(),
    streaming: streamingStats,
    nonStreaming: nonStreamingStats,
    comparison: comparison,
    activeCalls: performanceMetrics.size,
    rawData: allMetrics.map(([callSid, data]) => ({
      callSid: callSid.substring(0, 8) + '...',
      method: data.method,
      responses: data.responses.length,
      avgResponseTime: data.responses.length > 0 ? 
        Math.round(data.responses.reduce((sum, r) => sum + r.totalTime, 0) / data.responses.length) : 0
    }))
  });
});

// Control endpoint for test mode
app.post('/test-mode', (req, res) => {
  const { enabled, method, alternatePerCall } = req.body;
  
  if (enabled !== undefined) testMode.enabled = enabled;
  if (method && ['streaming', 'non-streaming'].includes(method)) testMode.currentMethod = method;
  if (alternatePerCall !== undefined) testMode.alternatePerCall = alternatePerCall;
  
  res.json({
    message: 'Test mode updated',
    testMode: testMode
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    activeConversations: conversations.size,
    testMode: testMode.enabled
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Jambonz Webhook Server with OpenAI and ElevenLabs - A/B Testing Enabled',
    testMode: testMode,
    endpoints: [
      'POST /webhook/call - Initial call handler',
      'POST /webhook/conversation - Conversation handler',
      'POST /webhook/status - Call status updates',
      'GET /health - Health check',
      'GET /metrics - Performance comparison metrics',
      'POST /test-mode - Configure A/B testing (body: {enabled, method, alternatePerCall})'
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