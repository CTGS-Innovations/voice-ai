require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(morgan('dev'));

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
  OLLAMA_URL: process.env.OLLAMA_URL || 'http://ollama:11434'
};

// Directory for audio files  
const AUDIO_DIR = '/home/corey/voice-ai/audio-gpu';

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
        console.log(`Cleaned up old GPU audio file: ${audioId}`);
      } catch (error) {
        console.error(`Error cleaning up GPU audio file ${audioId}:`, error);
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
  
  console.log(`🎵 GPU VITS TTS: ${callSid} - ${text.substring(0, 30)}...`);
  
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
    
    console.log(`⏱️  GPU VITS COMPLETE: +${Date.now() - generateStartTime}ms - ${audioId}`);
    return audioId;
  } catch (error) {
    console.error(`⏱️  GPU VITS ERROR: +${Date.now() - generateStartTime}ms -`, error.message);
    throw error;
  }
}

// GPU-Powered LLM using Ollama (LOCAL ONLY)
async function generateOllamaResponse(messages) {
  const generateStartTime = Date.now();
  console.log(`🧠 GPU OLLAMA REQUEST (LOCAL)`);
  
  try {
    const ollamaUrl = process.env.OLLAMA_URL || 'http://ollama:11434';
    
    const response = await axios.post(`${ollamaUrl}/api/chat`, {
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
    console.log(`⏱️  GPU OLLAMA COMPLETE: +${Date.now() - generateStartTime}ms`);
    return aiResponse;
  } catch (error) {
    console.error(`⏱️  GPU OLLAMA ERROR: +${Date.now() - generateStartTime}ms -`, error.message);
    throw error;
  }
}

// Fallback to ElevenLabs (mirroring server.js behavior)
async function generateElevenLabsAudio(text, callSid) {
  const generateStartTime = Date.now();
  const audioId = crypto.randomBytes(16).toString('hex');
  const audioPath = path.join(AUDIO_DIR, `${audioId}.mp3`);
  
  console.log(`🎵 FALLBACK ELEVENLABS: ${callSid} - ${text.substring(0, 30)}...`);
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
    
    console.log(`⏱️  ELEVENLABS RESPONDED: +${Date.now() - elevenLabsStartTime}ms`);
    const bufferStartTime = Date.now();
    
    const audioBuffer = await response.arrayBuffer();
    console.log(`⏱️  AUDIO BUFFER READY: +${Date.now() - bufferStartTime}ms`);
    
    const writeStartTime = Date.now();
    await fs.writeFile(audioPath, Buffer.from(audioBuffer));
    console.log(`⏱️  FILE WRITTEN: +${Date.now() - writeStartTime}ms`);
    
    audioCache.set(audioId, {
      path: audioPath,
      callSid: callSid,
      createdAt: Date.now(),
      method: 'elevenlabs-fallback'
    });
    
    console.log(`⏱️  FALLBACK TOTAL: +${Date.now() - generateStartTime}ms - ${audioId}`);
    return audioId;
  } catch (error) {
    console.error(`⏱️  FALLBACK ERROR: +${Date.now() - generateStartTime}ms -`, error);
    throw error;
  }
}

// GPU-Powered Speech Recognition using faster-whisper (FREE)
async function transcribeFasterWhisper(audioBuffer) {
  const transcribeStartTime = Date.now();
  console.log(`🎤 GPU FASTER-WHISPER TRANSCRIBE (FREE)`);
  
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
    console.log(`⏱️  GPU FASTER-WHISPER COMPLETE: +${Date.now() - transcribeStartTime}ms`);
    return transcript;
  } catch (error) {
    console.error(`⏱️  GPU FASTER-WHISPER ERROR: +${Date.now() - transcribeStartTime}ms -`, error.message);
    throw error;
  }
}

// Fallback to OpenAI (mirroring server.js behavior)
async function generateOpenAIResponse(messages) {
  const generateStartTime = Date.now();
  console.log(`🧠 FALLBACK OPENAI REQUEST`);
  
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
    console.log(`⏱️  OPENAI COMPLETE: +${Date.now() - generateStartTime}ms`);
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

// Main call webhook - handles incoming calls (EXACT MIRROR of server.js)
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
  
  console.log('Sending GPU test initial response:', JSON.stringify(response, null, 2));
  res.json(response);
};

// Register the webhook handler on both root and specific paths (EXACT MIRROR)
app.post('/', handleIncomingCall);
app.post('/webhook/call', handleIncomingCall);

// Conversation webhook - handles speech input and AI responses (EXACT MIRROR structure)
app.post('/webhook/conversation', async (req, res) => {
  const requestStartTime = Date.now();
  console.log('\n=== GPU CONVERSATION INPUT ===');
  console.log(`⏱️  GPU REQUEST START: ${new Date().toISOString()}`);
  const callSid = req.body.call_sid;
  
  try {
    let userMessage = '';
    
    // Extract user speech (EXACT MIRROR)
    if (req.body.speech && req.body.speech.alternatives && req.body.speech.alternatives[0]) {
      userMessage = req.body.speech.alternatives[0].transcript;
      console.log(`⏱️  SPEECH-TO-TEXT COMPLETE: +${Date.now() - requestStartTime}ms`);
      console.log('👤 USER SAID:', userMessage);
    }
    
    // Handle timeout or no speech (EXACT MIRROR)
    if (!userMessage || req.body.reason === 'timeout') {
      console.log(`⏱️  NO SPEECH/TIMEOUT: +${Date.now() - requestStartTime}ms`);
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
    
    console.log(`⏱️  USING METHOD: ${testMethod.toUpperCase()}`);
    
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
      console.log('Primary method failed, trying fallback...');
      if (testMethod === 'gpu-local') {
        console.log('🚨 GPU LOCAL FAILED - This should not happen in 100% open-source mode!');
        // In 100% open-source mode, we should NOT fallback to OpenAI
        // Instead, retry Ollama or return an error message
        aiResponse = "I'm having trouble with my local AI processing. Let me try again.";
      } else {
        aiResponse = await generateOpenAIResponse(conversationHistory);
      }
    }
    
    console.log(`⏱️  LLM COMPLETE: +${Date.now() - llmStartTime}ms`);
    console.log('🤖 AI RESPONSE:', aiResponse);
    
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
        try {
          audioId = await generateCoquiTTS(aiResponse, callSid);
          audioGenerationTime = Date.now() - audioStartTime;
        } catch (error) {
          console.log('🚨 GPU TTS FAILED - Retrying with fallback voice...');
          // In 100% open-source mode, we use default TTS instead of paid services
          throw new Error('TTS service unavailable - using system TTS');
        }
      } else {
        audioId = await generateElevenLabsAudio(aiResponse, callSid);
        audioGenerationTime = Date.now() - audioStartTime;
      }
      
      const audioUrl = `https://talk.mvp-scale.com/audio/generated/${audioId}`;
      
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
    
    console.log(`⏱️  GPU RESPONSE SENT: +${Date.now() - requestStartTime}ms TOTAL`);
    res.json(response);
    
  } catch (error) {
    console.error('Error processing GPU conversation:', error);
    
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

// Call status webhook (EXACT MIRROR)
const handleCallStatus = (req, res) => {
  console.log('\n=== CALL STATUS ===');
  console.log('Call SID:', req.body.call_sid);
  console.log('Call Status:', req.body.call_status);
  console.log('Direction:', req.body.direction);
  
  if (req.body.call_status === 'completed' || req.body.call_status === 'failed') {
    const callSid = req.body.call_sid;
    conversations.delete(callSid);
    performanceMetrics.delete(callSid);
    console.log(`Cleaned up data for call ${callSid}`);
  }
  
  res.status(200).send('OK');
};

app.post('/webhook/status', handleCallStatus);
app.post('/status', handleCallStatus);

// Serve audio files (EXACT MIRROR)
app.get('/audio/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(AUDIO_DIR, filename);
  
  console.log('Serving audio file:', filePath);
  res.sendFile(filePath);
});

app.get('/audio/generated/:filename', (req, res) => {
  const filename = req.params.filename;
  
  // Look up the audio file by ID
  const audioInfo = audioCache.get(filename);
  if (!audioInfo) {
    console.error('Audio file not found:', filename);
    return res.status(404).send('Audio not found');
  }
  
  console.log('Serving generated audio:', audioInfo.path);
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
  
  console.log(`\n========================================`);
  console.log(`GPU-Accelerated Jambonz Server Started`);
  console.log(`(Drop-in replacement for server.js)`);
  console.log(`========================================`);
  console.log(`Port: ${PORT}`);
  console.log(`URL: http://localhost:${PORT}`);
  console.log(`\nWebhook endpoints (same as server.js):`);
  console.log(`  - Call webhook: http://localhost:${PORT}/webhook/call`);
  console.log(`  - Conversation: http://localhost:${PORT}/webhook/conversation`);
  console.log(`  - Status: http://localhost:${PORT}/webhook/status`);
  console.log(`\nGPU Processing Mode:`);
  console.log(`  - Current: ${testMode.currentMethod}`);
  console.log(`  - Alternating: ${testMode.alternatePerCall}`);
  console.log(`  - Fallbacks: Available for all services`);
  console.log(`========================================\n`);
});