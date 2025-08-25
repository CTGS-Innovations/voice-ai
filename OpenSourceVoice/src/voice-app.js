require('dotenv').config();
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const logger = require('./lib/logger');

const app = express();
app.use(express.json());

// Store conversation history per call
const conversations = new Map();

// Store generated audio files
const audioCache = new Map();

// Performance testing data
const performanceMetrics = new Map();
let testMode = {
  enabled: true,
  currentMethod: 'gpu-local', // FORCE 100% open-source
  alternatePerCall: false // NO ALTERNATING - Always use GPU
};

// 100% Free Open-Source GPU Services
const GPU_SERVICES = {
  FASTER_WHISPER_URL: process.env.FASTER_WHISPER_URL || 'http://faster-whisper:9000',
  COQUI_TTS_URL: process.env.COQUI_TTS_URL || 'http://coqui-tts:5002',
  CHATTERBOX_TTS_URL: process.env.CHATTERBOX_TTS_URL || 'http://chatterbox-tts:4123',
  OLLAMA_URL: process.env.OLLAMA_URL || 'http://ollama:11434'
};

// Directory for audio files  
const AUDIO_DIR = '/app/audio-cache';

// Ensure audio directory exists
async function ensureAudioDir() {
  try {
    await fs.access(AUDIO_DIR);
  } catch {
    await fs.mkdir(AUDIO_DIR, { recursive: true });
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
        logger.debug(`Cleaned up old audio file: ${audioId}`);
      } catch (error) {
        logger.error(`Error cleaning up audio file ${audioId}`, { error: error.message });
      }
    }
  }
}

// Start cleanup interval
setInterval(cleanupOldAudio, 10 * 60 * 1000); // Every 10 minutes

// GPU-Powered TTS Generation using Coqui TTS (when available)
async function generateCoquiTTS(text, callSid) {
  const generateStartTime = Date.now();
  const audioId = crypto.randomBytes(16).toString('hex');
  const audioPath = path.join(AUDIO_DIR, `${audioId}.wav`);
  
  logger.audio('TTS_START', { provider: 'Coqui VITS', text: text.substring(0, 30) + '...', callSid });
  
  try {
    // Use VITS production-quality model with speaker selection
    const encodedText = encodeURIComponent(text);
    const speakerId = process.env.VITS_SPEAKER_ID || 'p225'; // Default to p225 (female voice)
    
    const response = await axios.get(`${GPU_SERVICES.COQUI_TTS_URL}/api/tts?text=${encodedText}&speaker_id=${speakerId}`, {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: {
        'Accept': 'audio/wav',
        'Cache-Control': 'no-cache'
      }
    });
    
    await fs.writeFile(audioPath, Buffer.from(response.data));
    
    audioCache.set(audioId, {
      path: audioPath,
      callSid: callSid,
      createdAt: Date.now(),
      method: 'vits-gpu'
    });
    
    const duration = Date.now() - generateStartTime;
    logger.performance('TTS Generation', duration, { callSid, audioId, provider: 'Coqui VITS' });
    return audioId;
  } catch (error) {
    const duration = Date.now() - generateStartTime;
    logger.error(`TTS generation failed after ${duration}ms`, { callSid, provider: 'Coqui VITS', error: error.message });
    throw error;
  }
}

// Advanced GPU-Powered TTS using Chatterbox TTS (Premium Quality)
async function generateChatterboxTTS(text, callSid) {
  const generateStartTime = Date.now();
  const audioId = crypto.randomBytes(16).toString('hex');
  const audioPath = path.join(AUDIO_DIR, `${audioId}.wav`);
  
  logger.audio('TTS_START', { provider: 'Chatterbox TTS', text: text.substring(0, 30) + '...', callSid });
  
  try {
    // Use OpenAI-compatible API endpoint for Chatterbox TTS
    const response = await axios.post(`${GPU_SERVICES.CHATTERBOX_TTS_URL}/v1/audio/speech`, {
      model: "chatterbox-tts",
      input: text,
      voice: process.env.CHATTERBOX_VOICE || "default",
      response_format: "wav",
      speed: 1.0
    }, {
      responseType: 'arraybuffer',
      timeout: parseInt(process.env.TTS_TIMEOUT_MS) || 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    // Save audio file
    await fs.writeFile(audioPath, response.data);
    
    // Store in cache for serving
    audioCache.set(audioId, {
      path: audioPath,
      callSid: callSid,
      createdAt: Date.now(),
      method: 'chatterbox-gpu'
    });
    
    const duration = Date.now() - generateStartTime;
    logger.performance('TTS Generation', duration, { callSid, audioId, provider: 'Chatterbox TTS' });
    return audioId;
  } catch (error) {
    const duration = Date.now() - generateStartTime;
    logger.error(`TTS generation failed after ${duration}ms`, { callSid, provider: 'Chatterbox TTS', error: error.message });
    throw error;
  }
}

// GPU-Powered LLM using Ollama (LOCAL ONLY)
async function generateOllamaResponse(messages) {
  const generateStartTime = Date.now();
  logger.info('LLM request started', { provider: 'Ollama Local', model: process.env.OLLAMA_MODEL || 'llama3.1:8b' });
  
  try {
    
    const response = await axios.post(`${GPU_SERVICES.OLLAMA_URL}/api/chat`, {
      model: process.env.OLLAMA_MODEL || 'llama3.1:8b',
      messages: messages,
      stream: false,
      options: {
        temperature: 0.7,
        top_p: 0.9,
        num_predict: 100
      }
    }, {
      timeout: 20000
    });
    
    const aiResponse = response.data.message.content;
    const duration = Date.now() - generateStartTime;
    logger.performance('LLM Generation', duration, { provider: 'Ollama Local', model: process.env.OLLAMA_MODEL || 'llama3.1:8b' });
    return aiResponse;
  } catch (error) {
    const duration = Date.now() - generateStartTime;
    logger.error(`LLM generation failed after ${duration}ms`, { provider: 'Ollama Local', error: error.message });
    throw error;
  }
}

// Fallback to ElevenLabs (mirroring server.js behavior)
async function generateElevenLabsAudio(text, callSid) {
  const generateStartTime = Date.now();
  const audioId = crypto.randomBytes(16).toString('hex');
  const audioPath = path.join(AUDIO_DIR, `${audioId}.mp3`);
  
  logger.debug('Using ElevenLabs fallback TTS', { callSid, text: text.substring(0, 30) + '...' });
  const elevenLabsStartTime = Date.now();
  
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'}`, {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
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
    
    logger.performance('ElevenLabs API', Date.now() - elevenLabsStartTime, { callSid });
    const bufferStartTime = Date.now();
    
    const audioBuffer = await response.arrayBuffer();
    logger.debug(`Audio buffer ready`, { duration: `${Date.now() - bufferStartTime}ms` });
    
    const writeStartTime = Date.now();
    await fs.writeFile(audioPath, Buffer.from(audioBuffer));
    logger.debug('Audio file written', { duration: `${Date.now() - writeStartTime}ms` });
    
    audioCache.set(audioId, {
      path: audioPath,
      callSid: callSid,
      createdAt: Date.now(),
      method: 'elevenlabs-fallback'
    });
    
    logger.performance('ElevenLabs Total', Date.now() - generateStartTime, { callSid, audioId });
    return audioId;
  } catch (error) {
    console.error(`⏱️  FALLBACK ERROR: +${Date.now() - generateStartTime}ms -`, error);
    throw error;
  }
}

// GPU-Powered Speech Recognition using faster-whisper (FREE)
async function transcribeFasterWhisper(audioBuffer) {
  const transcribeStartTime = Date.now();
  logger.debug('Starting Faster-Whisper transcription');
  
  try {
    const formData = new FormData();
    formData.append('audio_file', new Blob([audioBuffer], { type: 'audio/wav' }), 'audio.wav');
    formData.append('task', 'transcribe');
    formData.append('language', 'en');
    formData.append('temperature', '0');
    formData.append('best_of', '5');
    formData.append('beam_size', '5');
    
    const response = await axios.post(`${GPU_SERVICES.FASTER_WHISPER_URL}/asr`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 8000 // Faster-whisper is much quicker than OpenAI
    });
    
    const transcript = response.data.text;
    logger.performance('Speech Recognition', Date.now() - transcribeStartTime);
    return transcript;
  } catch (error) {
    console.error(`⏱️  GPU FASTER-WHISPER ERROR: +${Date.now() - transcribeStartTime}ms -`, error.message);
    throw error;
  }
}

// Fallback to OpenAI (mirroring server.js behavior)
async function generateOpenAIResponse(messages) {
  const generateStartTime = Date.now();
  logger.debug('Using OpenAI fallback LLM');
  
  try {
    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
      max_tokens: 100,
      temperature: 0.7
    });
    
    const aiResponse = completion.choices[0].message.content;
    logger.performance('OpenAI LLM', Date.now() - generateStartTime);
    return aiResponse;
  } catch (error) {
    console.error(`⏱️  OPENAI ERROR: +${Date.now() - generateStartTime}ms -`, error.message);
    throw error;
  }
}

// Performance tracking functions (mirroring server.js)
function initializeCallPerformance(callSid) {
  const method = testMode.alternatePerCall 
    ? (testMode.currentMethod === 'gpu-local' ? 'cloud-fallback' : 'gpu-local')
    : testMode.currentMethod;
  
  if (testMode.alternatePerCall) {
    testMode.currentMethod = method;
  }
  
  performanceMetrics.set(callSid, {
    method: method,
    startTime: Date.now(),
    responses: [],
    totalResponseTime: 0
  });
  
  logger.debug(`Call assigned processing method`, { callSid, method });
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
  
  logger.debug('Response metrics recorded', { 
    method: metrics.method, 
    totalTime: `${totalTime}ms`, 
    audioTime: `${audioGenerationTime}ms`,
    wordsPerSecond: responseData.wordsPerSecond
  });
}

// Main call webhook - handles incoming calls
const handleIncomingCall = async (req, res) => {
  const callSid = req.body.call_sid;
  const from = req.body.from;
  const to = req.body.to;
  
  logger.callStart(callSid, from, to);
  
  // Initialize conversation history for this call
  const testMethod = initializeCallPerformance(callSid);
  
  conversations.set(callSid, [
    {
      role: "system",
      content: `You are Bella, a friendly and professional customer service AI agent. You are warm, helpful, and enthusiastic about assisting customers with any request they may have. 

Your personality:
- Always introduce yourself as Bella in your first interaction
- Be conversational, natural, and personable
- Keep responses concise (under 60 words) but complete
- Show genuine interest in helping and solving problems
- Use a positive, upbeat tone while remaining professional
- Ask clarifying questions when needed to better assist

Remember: You're here to provide excellent customer service and make every interaction pleasant and productive.`
    }
  ]);
  
  const response = [
    {
      "verb": "say",
      "text": "Hello! This is Bella, your customer service assistant. I'm here to help you with anything you need today. How can I assist you?",
      "synthesizer": {
        "vendor": "default"
      }
    },
    {
      "verb": "gather",
      "input": ["speech"],
      "actionHook": `${process.env.WEBHOOK_BASE_URL}/webhook/conversation`,
      "timeout": 15,
      "speechTimeout": 3,
      "recognizer": {
        "vendor": "openai",
        "model": "whisper-1",
        "language": "en"
      }
    }
  ];
  
  logger.response(200, callSid, response);
  res.json(response);
};

// Register the webhook handler on both root and specific paths (EXACT MIRROR)
app.post('/', handleIncomingCall);
app.post('/webhook/call', handleIncomingCall);

// Conversation webhook - handles speech input and AI responses
app.post('/webhook/conversation', async (req, res) => {
  const requestStartTime = Date.now();
  const callSid = req.body.call_sid;
  
  logger.request('POST', '/webhook/conversation', callSid, req.body);
  
  try {
    let userMessage = '';
    
    // Extract user speech
    if (req.body.speech && req.body.speech.alternatives && req.body.speech.alternatives[0]) {
      userMessage = req.body.speech.alternatives[0].transcript;
      const sttDuration = Date.now() - requestStartTime;
      logger.performance('Speech-to-Text', sttDuration, { callSid });
      logger.conversation(callSid, 'USER', userMessage, { 
        confidence: req.body.speech.alternatives[0].confidence 
      });
    }
    
    // Handle timeout or no speech
    if (!userMessage || req.body.reason === 'timeout') {
      logger.warn('No speech detected or timeout', { callSid, reason: req.body.reason });
      const response = [
        {
          "verb": "say",
          "text": "I didn't catch that. Could you please repeat what you'd like to test?",
          "synthesizer": {
            "vendor": "default"
          }
        },
        {
          "verb": "gather",
          "input": ["speech"],
          "actionHook": `${process.env.WEBHOOK_BASE_URL}/webhook/conversation`,
          "timeout": 15,
          "speechTimeout": 2,
          "recognizer": {
            "vendor": "openai",
            "model": "whisper-1",
            "language": "en"
          }
        }
      ];
      return res.json(response);
    }
    
    // Check for goodbye phrases (EXACT MIRROR)
    const goodbyePhrases = ['goodbye', 'bye', 'see you', 'talk to you later', 'gotta go', 'have to go', 'end call', 'hang up'];
    const isGoodbye = goodbyePhrases.some(phrase => userMessage.toLowerCase().includes(phrase));
    
    if (isGoodbye) {
      const response = [
        {
          "verb": "say",
          "text": "Thanks for testing the GPU voice processing! The performance data has been recorded. Goodbye!",
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
    
    // Get conversation history (EXACT MIRROR)
    let conversationHistory = conversations.get(callSid) || [
      {
        role: "system",
        content: "You are a helpful AI assistant testing GPU-accelerated voice processing. Keep responses under 60 words."
      }
    ];
    
    // Add user message to history
    conversationHistory.push({
      role: "user",
      content: userMessage
    });
    
    // Get test method for this call
    const callMetrics = performanceMetrics.get(callSid);
    const testMethod = callMetrics?.method || 'gpu-local';
    
    logger.info(`Processing with ${testMethod.toUpperCase()} method`, { callSid });
    
    let aiResponse;
    const llmStartTime = Date.now();
    
    // Generate AI response using selected method
    try {
      if (testMethod === 'gpu-local') {
        // Use LOCAL GPU Ollama
        aiResponse = await generateOllamaResponse(conversationHistory);
      } else {
        // Use cloud fallback
        aiResponse = await generateOpenAIResponse(conversationHistory);
      }
    } catch (error) {
      logger.warn('Primary LLM method failed, handling gracefully', { callSid, method: testMethod });
      if (testMethod === 'gpu-local') {
        logger.error('Local GPU LLM failed - this should not happen in production', { callSid, error: error.message });
        // In 100% open-source mode, we should NOT fallback to OpenAI
        aiResponse = "I'm having trouble processing your request. Let me try again.";
      } else {
        aiResponse = await generateOpenAIResponse(conversationHistory);
      }
    }
    
    const llmDuration = Date.now() - llmStartTime;
    logger.performance('LLM Complete', llmDuration, { callSid });
    logger.conversation(callSid, 'AI', aiResponse);
    
    // Add AI response to history
    conversationHistory.push({
      role: "assistant",
      content: aiResponse
    });
    
    // Update stored conversation
    conversations.set(callSid, conversationHistory);
    
    // Generate audio using selected method
    let response;
    const audioStartTime = Date.now();
    
    try {
      let audioId;
      let audioGenerationTime;
      
      if (testMethod === 'gpu-local') {
        // Try TTS providers in preference order: Chatterbox -> Coqui -> System fallback
        const ttsProvider = process.env.TTS_PROVIDER || 'chatterbox';
        
        try {
          if (ttsProvider === 'chatterbox') {
            try {
              audioId = await generateChatterboxTTS(aiResponse, callSid);
              audioGenerationTime = Date.now() - audioStartTime;
            } catch (chatterboxError) {
              logger.warn('Chatterbox TTS failed, falling back to Coqui', { callSid, error: chatterboxError.message });
              audioId = await generateCoquiTTS(aiResponse, callSid);
              audioGenerationTime = Date.now() - audioStartTime;
            }
          } else {
            // Use Coqui TTS as primary
            audioId = await generateCoquiTTS(aiResponse, callSid);
            audioGenerationTime = Date.now() - audioStartTime;
          }
        } catch (error) {
          logger.error('All GPU TTS providers failed - using system fallback', { callSid, error: error.message });
          // In 100% open-source mode, we use default TTS instead of paid services
          throw new Error('TTS service unavailable - using system TTS');
        }
      } else {
        audioId = await generateElevenLabsAudio(aiResponse, callSid);
        audioGenerationTime = Date.now() - audioStartTime;
      }
      
      const audioUrl = `${process.env.WEBHOOK_BASE_URL}/audio/generated/${audioId}`;
      
      response = [
        {
          "verb": "play",
          "url": audioUrl
        },
        {
          "verb": "gather",
          "input": ["speech"],
          "actionHook": `${process.env.WEBHOOK_BASE_URL}/webhook/conversation`,
          "timeout": 15,
          "speechTimeout": 2,
          "recognizer": {
            "vendor": "openai",
            "model": "whisper-1",
            "language": "en"
          }
        }
      ];
      
      recordResponseTime(callSid, requestStartTime, audioGenerationTime, aiResponse);
      
    } catch (error) {
      console.error('All audio generation methods failed:', error);
      
      response = [
        {
          "verb": "say",
          "text": "I'm having technical difficulties with audio generation. Let me try again.",
          "synthesizer": {
            "vendor": "default"
          }
        },
        {
          "verb": "gather",
          "input": ["speech"],
          "actionHook": `${process.env.WEBHOOK_BASE_URL}/webhook/conversation`,
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
    
    const totalDuration = Date.now() - requestStartTime;
    logger.performance('Total Request', totalDuration, { callSid });
    logger.response(200, callSid, response);
    res.json(response);
    
  } catch (error) {
    logger.error('Error processing conversation', { callSid, error: error.message });
    
    const errorResponse = [
      {
        "verb": "say",
        "text": "I'm having a technical issue. Let me try again.",
        "synthesizer": {
          "vendor": "default"
        }
      },
      {
        "verb": "gather",
        "input": ["speech"],
        "actionHook": `${process.env.WEBHOOK_BASE_URL}/webhook/conversation`,
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

// Call status webhook
const handleCallStatus = (req, res) => {
  const callSid = req.body.call_sid;
  const callStatus = req.body.call_status;
  const direction = req.body.direction;
  
  logger.info('Call status update', { callSid, status: callStatus, direction });
  
  if (callStatus === 'completed' || callStatus === 'failed') {
    conversations.delete(callSid);
    performanceMetrics.delete(callSid);
    logger.debug(`Cleaned up session data`, { callSid });
  }
  
  res.status(200).send('OK');
};

app.post('/webhook/status', handleCallStatus);
app.post('/status', handleCallStatus);

// Serve audio files (EXACT MIRROR)
app.get('/audio/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(AUDIO_DIR, filename);
  
  logger.debug('Serving cached audio file', { filePath });
  res.sendFile(filePath);
});

app.get('/audio/generated/:filename', (req, res) => {
  const filename = req.params.filename;
  
  // Look up the audio file by ID
  const audioInfo = audioCache.get(filename);
  if (!audioInfo) {
    logger.warn('Generated audio file not found', { audioId: filename });
    return res.status(404).send('Audio not found');
  }
  
  logger.debug('Serving generated audio', { audioId: filename, path: audioInfo.path });
  res.sendFile(audioInfo.path);
});

// Metrics endpoint (EXACT MIRROR structure)
app.get('/metrics', (req, res) => {
  const allMetrics = Array.from(performanceMetrics.entries());
  const gpuMetrics = allMetrics.filter(([_, data]) => data.method === 'gpu-local');
  const cloudMetrics = allMetrics.filter(([_, data]) => data.method === 'cloud-fallback');
  
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
  
  const gpuStats = calculateStats(gpuMetrics);
  const cloudStats = calculateStats(cloudMetrics);
  
  let comparison = null;
  if (gpuStats && cloudStats) {
    comparison = {
      totalTimeDifference: gpuStats.avgTotalTime - cloudStats.avgTotalTime,
      audioTimeDifference: gpuStats.avgAudioTime - cloudStats.avgAudioTime,
      speedupFactor: (cloudStats.avgTotalTime / gpuStats.avgTotalTime).toFixed(2),
      fasterMethod: gpuStats.avgTotalTime < cloudStats.avgTotalTime ? 'gpu-local' : 'cloud-fallback'
    };
  }
  
  res.json({
    testMode: testMode,
    gpuServices: GPU_SERVICES,
    timestamp: new Date().toISOString(),
    gpuLocal: gpuStats,
    cloudFallback: cloudStats,
    comparison: comparison,
    activeCalls: performanceMetrics.size
  });
});

// Test mode control endpoint (EXACT MIRROR)
app.post('/test-mode', (req, res) => {
  const { enabled, method, alternatePerCall } = req.body;
  
  if (enabled !== undefined) testMode.enabled = enabled;
  if (method && ['gpu-local', 'cloud-fallback'].includes(method)) testMode.currentMethod = method;
  if (alternatePerCall !== undefined) testMode.alternatePerCall = alternatePerCall;
  
  res.json({
    message: 'Test mode updated',
    testMode: testMode
  });
});

// Health check endpoint (EXACT MIRROR)
app.get('/health', (req, res) => {
  const gpuServicesStatus = {};
  
  // Check GPU service availability
  for (const [service, url] of Object.entries(GPU_SERVICES)) {
    gpuServicesStatus[service] = {
      configured: !!url,
      url: url || 'not configured'
    };
  }
  
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    activeConversations: conversations.size,
    testMode: testMode,
    gpuServices: gpuServicesStatus
  });
});

// Root endpoint (EXACT MIRROR)
app.get('/', (req, res) => {
  res.json({ 
    message: 'GPU-Accelerated Jambonz Webhook Server - Drop-in Replacement for server.js',
    testMode: testMode,
    gpuServices: GPU_SERVICES,
    endpoints: [
      'POST / - Call webhook handler',
      'POST /webhook/call - Call webhook handler',
      'POST /webhook/conversation - Conversation handler', 
      'POST /webhook/status - Call status handler',
      'GET /health - Health check',
      'GET /metrics - Performance comparison',
      'POST /test-mode - Configure testing (body: {enabled, method, alternatePerCall})',
      'GET /audio/:filename - Serve audio files',
      'GET /audio/generated/:filename - Serve generated audio'
    ]
  });
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, async () => {
  // Ensure audio directory exists
  await ensureAudioDir();
  
  // Intelligent startup logging
  logger.startup({
    port: PORT,
    webhookBase: process.env.WEBHOOK_BASE_URL,
    services: {
      ollama: GPU_SERVICES.OLLAMA_URL,
      coquiTts: GPU_SERVICES.COQUI_TTS_URL,
      chatterboxTts: GPU_SERVICES.CHATTERBOX_TTS_URL,
      whisper: GPU_SERVICES.FASTER_WHISPER_URL
    },
    model: process.env.OLLAMA_MODEL || 'llama3.1:8b',
    ttsProvider: process.env.TTS_PROVIDER || 'chatterbox',
    speakers: {
      coqui: process.env.VITS_SPEAKER_ID || 'p225',
      chatterbox: process.env.CHATTERBOX_VOICE || 'default'
    }
  });
});