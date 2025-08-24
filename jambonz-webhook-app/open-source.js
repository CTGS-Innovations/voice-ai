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
  currentMethod: 'gpu-local', // 'gpu-local', 'cloud-api', 'hybrid'
  alternatePerCall: false,
  models: {
    tts: 'coqui-tts', // 'coqui-tts', 'bark', 'tortoise'
    llm: 'llama-cpp', // 'llama-cpp', 'ollama', 'text-generation-webui'
    stt: 'faster-whisper' // 'faster-whisper', 'whisper-cpp', 'vosk'
  }
};

// GPU Service Endpoints (running on Unraid)
const GPU_SERVICES = {
  // Text-to-Speech Services
  COQUI_TTS_URL: process.env.COQUI_TTS_URL || 'http://gpu-services:5002',
  BARK_TTS_URL: process.env.BARK_TTS_URL || 'http://gpu-services:5003',
  TORTOISE_TTS_URL: process.env.TORTOISE_TTS_URL || 'http://gpu-services:5004',
  
  // Large Language Model Services  
  LLAMA_CPP_URL: process.env.LLAMA_CPP_URL || 'http://gpu-services:8080',
  OLLAMA_URL: process.env.OLLAMA_URL || 'http://gpu-services:11434',
  TEXT_GEN_WEBUI_URL: process.env.TEXT_GEN_WEBUI_URL || 'http://gpu-services:5000',
  
  // Speech-to-Text Services
  FASTER_WHISPER_URL: process.env.FASTER_WHISPER_URL || 'http://gpu-services:8081',
  WHISPER_CPP_URL: process.env.WHISPER_CPP_URL || 'http://gpu-services:8082',
  VOSK_URL: process.env.VOSK_URL || 'http://gpu-services:8083'
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

// GPU-Powered TTS Generation using Coqui TTS
async function generateCoquiTTS(text, callSid) {
  const generateStartTime = Date.now();
  const audioId = crypto.randomBytes(16).toString('hex');
  const audioPath = path.join(AUDIO_DIR, `${audioId}.wav`);
  
  console.log(`🎵 GPU COQUI TTS: ${callSid} - ${text.substring(0, 30)}...`);
  
  try {
    const response = await axios.post(`${GPU_SERVICES.COQUI_TTS_URL}/api/tts`, {
      text: text,
      speaker_id: process.env.COQUI_SPEAKER_ID || 'female_1',
      style_wav: null,
      language_id: 'en'
    }, {
      responseType: 'arraybuffer',
      timeout: 30000
    });
    
    await fs.writeFile(audioPath, Buffer.from(response.data));
    
    // Cache the audio file info
    audioCache.set(audioId, {
      path: audioPath,
      callSid: callSid,
      createdAt: Date.now(),
      method: 'coqui-tts'
    });
    
    console.log(`⏱️  GPU COQUI COMPLETE: +${Date.now() - generateStartTime}ms - ${audioId}`);
    return audioId;
  } catch (error) {
    console.error(`⏱️  GPU COQUI ERROR: +${Date.now() - generateStartTime}ms -`, error.message);
    throw error;
  }
}

// GPU-Powered TTS Generation using Bark
async function generateBarkTTS(text, callSid) {
  const generateStartTime = Date.now();
  const audioId = crypto.randomBytes(16).toString('hex');
  const audioPath = path.join(AUDIO_DIR, `${audioId}.wav`);
  
  console.log(`🎵 GPU BARK TTS: ${callSid} - ${text.substring(0, 30)}...`);
  
  try {
    const response = await axios.post(`${GPU_SERVICES.BARK_TTS_URL}/api/generate`, {
      text: text,
      voice_preset: process.env.BARK_VOICE || 'v2/en_speaker_6',
      temperature: 0.75,
      silence_duration: 0.25
    }, {
      responseType: 'arraybuffer',
      timeout: 45000
    });
    
    await fs.writeFile(audioPath, Buffer.from(response.data));
    
    audioCache.set(audioId, {
      path: audioPath,
      callSid: callSid,
      createdAt: Date.now(),
      method: 'bark-tts'
    });
    
    console.log(`⏱️  GPU BARK COMPLETE: +${Date.now() - generateStartTime}ms - ${audioId}`);
    return audioId;
  } catch (error) {
    console.error(`⏱️  GPU BARK ERROR: +${Date.now() - generateStartTime}ms -`, error.message);
    throw error;
  }
}

// GPU-Powered LLM using Llama.cpp
async function generateLlamaCppResponse(messages) {
  const generateStartTime = Date.now();
  console.log(`🧠 GPU LLAMA.CPP REQUEST`);
  
  try {
    const response = await axios.post(`${GPU_SERVICES.LLAMA_CPP_URL}/completion`, {
      prompt: messages.map(m => `${m.role}: ${m.content}`).join('\n') + '\nassistant:',
      n_predict: 100,
      temperature: 0.7,
      top_p: 0.9,
      repeat_penalty: 1.1,
      stop: ['user:', '\n\n']
    }, {
      timeout: 15000
    });
    
    const aiResponse = response.data.content.trim();
    console.log(`⏱️  GPU LLAMA.CPP COMPLETE: +${Date.now() - generateStartTime}ms`);
    return aiResponse;
  } catch (error) {
    console.error(`⏱️  GPU LLAMA.CPP ERROR: +${Date.now() - generateStartTime}ms -`, error.message);
    throw error;
  }
}

// GPU-Powered LLM using Ollama
async function generateOllamaResponse(messages) {
  const generateStartTime = Date.now();
  console.log(`🧠 GPU OLLAMA REQUEST`);
  
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
    console.log(`⏱️  GPU OLLAMA COMPLETE: +${Date.now() - generateStartTime}ms`);
    return aiResponse;
  } catch (error) {
    console.error(`⏱️  GPU OLLAMA ERROR: +${Date.now() - generateStartTime}ms -`, error.message);
    throw error;
  }
}

// GPU-Powered Speech Recognition using Faster-Whisper (FASTEST)
async function transcribeFasterWhisper(audioBuffer) {
  const transcribeStartTime = Date.now();
  console.log(`🎤 GPU FASTER-WHISPER TRANSCRIBE`);
  
  try {
    const formData = new FormData();
    formData.append('audio', new Blob([audioBuffer]), 'audio.wav');
    formData.append('model', process.env.FASTER_WHISPER_MODEL || 'base.en');
    formData.append('language', 'en');
    formData.append('beam_size', process.env.BEAM_SIZE || '5');
    formData.append('best_of', process.env.BEST_OF || '5');
    
    const response = await axios.post(`${GPU_SERVICES.FASTER_WHISPER_URL}/v1/transcribe`, formData, {
      headers: formData.getHeaders(),
      timeout: 8000 // Faster-whisper is much quicker
    });
    
    const transcript = response.data.text || response.data.transcription;
    console.log(`⏱️  GPU FASTER-WHISPER COMPLETE: +${Date.now() - transcribeStartTime}ms`);
    return transcript;
  } catch (error) {
    console.error(`⏱️  GPU FASTER-WHISPER ERROR: +${Date.now() - transcribeStartTime}ms -`, error.message);
    throw error;
  }
}

// GPU-Powered Speech Recognition using Whisper.cpp
async function transcribeWhisperCpp(audioBuffer) {
  const transcribeStartTime = Date.now();
  console.log(`🎤 GPU WHISPER.CPP TRANSCRIBE`);
  
  try {
    const formData = new FormData();
    formData.append('audio', new Blob([audioBuffer]), 'audio.wav');
    formData.append('model', process.env.WHISPER_MODEL || 'base.en');
    formData.append('language', 'en');
    
    const response = await axios.post(`${GPU_SERVICES.WHISPER_CPP_URL}/inference`, formData, {
      headers: formData.getHeaders(),
      timeout: 10000
    });
    
    const transcript = response.data.text || response.data.transcription;
    console.log(`⏱️  GPU WHISPER.CPP COMPLETE: +${Date.now() - transcribeStartTime}ms`);
    return transcript;
  } catch (error) {
    console.error(`⏱️  GPU WHISPER.CPP ERROR: +${Date.now() - transcribeStartTime}ms -`, error.message);
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
        console.log(`Cleaned up old GPU audio file: ${audioId}`);
      } catch (error) {
        console.error(`Error cleaning up GPU audio file ${audioId}:`, error);
      }
    }
  }
}

// Start cleanup interval
setInterval(cleanupOldAudio, 10 * 60 * 1000); // Every 10 minutes

// Performance testing utilities
function initializeCallPerformance(callSid) {
  const method = testMode.alternatePerCall 
    ? (testMode.currentMethod === 'gpu-local' ? 'cloud-api' : 'gpu-local')
    : testMode.currentMethod;
  
  if (testMode.alternatePerCall) {
    testMode.currentMethod = method;
  }
  
  performanceMetrics.set(callSid, {
    method: method,
    models: {...testMode.models},
    startTime: Date.now(),
    responses: [],
    totalAudioTime: 0,
    totalResponseTime: 0,
    gpuUtilization: []
  });
  
  console.log(`Call ${callSid} assigned method: ${method} with models: ${JSON.stringify(testMode.models)}`);
  return method;
}

function recordResponseTime(callSid, startTime, audioGenerationTime, textLength, method, modelUsed) {
  const metrics = performanceMetrics.get(callSid);
  if (!metrics) return;
  
  const totalTime = Date.now() - startTime;
  const responseData = {
    timestamp: new Date().toISOString(),
    totalTime: totalTime,
    audioGenerationTime: audioGenerationTime,
    textLength: textLength,
    method: method,
    modelUsed: modelUsed,
    wordsPerSecond: (textLength.split(' ').length / (totalTime / 1000)).toFixed(2)
  };
  
  metrics.responses.push(responseData);
  metrics.totalResponseTime += totalTime;
  performanceMetrics.set(callSid, metrics);
  
  console.log(`${method}/${modelUsed} response - Total: ${totalTime}ms, Audio: ${audioGenerationTime}ms, WPS: ${responseData.wordsPerSecond}`);
}

// Main call webhook - handles incoming calls for GPU testing
const handleGpuIncomingCall = async (req, res) => {
  console.log('=== NEW GPU TEST CALL ===');
  console.log('Call SID:', req.body.call_sid);
  console.log('From:', req.body.from);
  console.log('To:', req.body.to);
  
  // Initialize conversation history for this call
  const callSid = req.body.call_sid;
  const testMethod = initializeCallPerformance(callSid);
  
  conversations.set(callSid, [
    {
      role: "system",
      content: `You are a helpful AI assistant testing GPU-accelerated voice processing. Keep responses under 60 words and mention you're using ${testMethod} processing with ${testMode.models.tts} TTS and ${testMode.models.llm} language model for performance comparison.`
    }
  ]);
  
  const response = [
    {
      "verb": "say",
      "text": "Hello! This is a GPU-accelerated voice AI test. I'm ready to compare local GPU performance against cloud APIs. What would you like to discuss?",
      "synthesizer": {
        "vendor": "default"
      }
    },
    {
      "verb": "gather",
      "input": ["speech"],
      "actionHook": "https://talk.mvp-scale.com/gpu/conversation",
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

// GPU Conversation webhook - handles speech input and AI responses using GPU models
app.post('/gpu/conversation', async (req, res) => {
  const requestStartTime = Date.now();
  console.log('\n=== GPU CONVERSATION INPUT ===');
  console.log(`⏱️  GPU REQUEST START: ${new Date().toISOString()}`);
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
          "text": "I didn't catch that. Could you please repeat what you'd like to test with the GPU?",
          "synthesizer": {
            "vendor": "default"
          }
        },
        {
          "verb": "gather",
          "input": ["speech"],
          "actionHook": "https://talk.mvp-scale.com/gpu/conversation",
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
    
    // Check for goodbye phrases
    const goodbyePhrases = ['goodbye', 'bye', 'see you', 'talk to you later', 'gotta go', 'have to go', 'end call', 'hang up'];
    const isGoodbye = goodbyePhrases.some(phrase => userMessage.toLowerCase().includes(phrase));
    
    if (isGoodbye) {
      const response = [
        {
          "verb": "say",
          "text": "Thanks for testing the GPU voice AI system! The performance metrics have been recorded. Goodbye!",
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
    
    // Get conversation history
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
    
    // Get test method and models for this call
    const callMetrics = performanceMetrics.get(callSid);
    const testMethod = callMetrics?.method || 'gpu-local';
    const models = callMetrics?.models || testMode.models;
    
    console.log(`⏱️  USING METHOD: ${testMethod.toUpperCase()} with models: ${JSON.stringify(models)}`);
    
    let aiResponse;
    const llmStartTime = Date.now();
    
    // Generate AI response using selected GPU model
    if (testMethod === 'gpu-local') {
      if (models.llm === 'llama-cpp') {
        aiResponse = await generateLlamaCppResponse(conversationHistory);
      } else if (models.llm === 'ollama') {
        aiResponse = await generateOllamaResponse(conversationHistory);
      } else {
        // Fallback to cloud API
        const OpenAI = require('openai');
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: conversationHistory,
          max_tokens: 50,
          temperature: 0.7
        });
        aiResponse = completion.choices[0].message.content;
      }
    } else {
      // Cloud API fallback
      const OpenAI = require('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: conversationHistory,
        max_tokens: 50,
        temperature: 0.7
      });
      aiResponse = completion.choices[0].message.content;
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
    
    // Generate audio using selected TTS model
    let response;
    const audioStartTime = Date.now();
    
    if (testMethod === 'gpu-local') {
      try {
        let audioId;
        let modelUsed;
        
        if (models.tts === 'coqui-tts') {
          audioId = await generateCoquiTTS(aiResponse, callSid);
          modelUsed = 'coqui-tts';
        } else if (models.tts === 'bark') {
          audioId = await generateBarkTTS(aiResponse, callSid);
          modelUsed = 'bark';
        } else {
          // Fallback to ElevenLabs streaming
          audioId = crypto.randomBytes(16).toString('hex');
          const audioUrl = `https://talk.mvp-scale.com/audio/stream/${audioId}?text=${encodeURIComponent(aiResponse)}&callSid=${callSid}`;
          modelUsed = 'elevenlabs-stream';
          
          response = [
            {
              "verb": "play",
              "url": audioUrl
            },
            {
              "verb": "gather",
              "input": ["speech"],
              "actionHook": "https://talk.mvp-scale.com/gpu/conversation",
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
        
        if (audioId && !response) {
          const audioUrl = `https://talk.mvp-scale.com/gpu/audio/${audioId}`;
          
          response = [
            {
              "verb": "play",
              "url": audioUrl
            },
            {
              "verb": "gather",
              "input": ["speech"],
              "actionHook": "https://talk.mvp-scale.com/gpu/conversation",
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
        
        recordResponseTime(callSid, requestStartTime, Date.now() - audioStartTime, aiResponse, testMethod, modelUsed);
        
      } catch (error) {
        console.error('GPU TTS Error, falling back to streaming:', error);
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
            "actionHook": "https://talk.mvp-scale.com/gpu/conversation",
            "timeout": 15,
            "speechTimeout": 2,
            "recognizer": {
              "vendor": "openai",
              "model": "whisper-1",
              "language": "en"
            }
          }
        ];
        
        recordResponseTime(callSid, requestStartTime, Date.now() - audioStartTime, aiResponse, 'fallback-stream', 'elevenlabs');
      }
    }
    
    console.log(`⏱️  GPU RESPONSE SENT: +${Date.now() - requestStartTime}ms TOTAL`);
    res.json(response);
    
  } catch (error) {
    console.error('Error processing GPU conversation:', error);
    
    const errorResponse = [
      {
        "verb": "say",
        "text": "I'm having a technical issue with the GPU processing. Let me try again.",
        "synthesizer": {
          "vendor": "default"
        }
      },
      {
        "verb": "gather",
        "input": ["speech"],
        "actionHook": "https://talk.mvp-scale.com/gpu/conversation",
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

// Serve GPU-generated audio files
app.get('/gpu/audio/:audioId', (req, res) => {
  const audioId = req.params.audioId;
  const audioInfo = audioCache.get(audioId);
  
  if (!audioInfo) {
    console.error('GPU audio file not found:', audioId);
    return res.status(404).send('GPU audio not found');
  }
  
  console.log('Serving GPU audio:', audioInfo.path);
  res.sendFile(audioInfo.path);
});

// GPU Performance metrics endpoint
app.get('/gpu/metrics', (req, res) => {
  const allMetrics = Array.from(performanceMetrics.entries());
  const gpuMetrics = allMetrics.filter(([_, data]) => data.method === 'gpu-local');
  const cloudMetrics = allMetrics.filter(([_, data]) => data.method === 'cloud-api');
  
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
      maxTotalTime: Math.max(...totalTimes),
      modelsUsed: [...new Set(allResponses.map(r => r.modelUsed))]
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
      fasterMethod: gpuStats.avgTotalTime < cloudStats.avgTotalTime ? 'gpu-local' : 'cloud-api'
    };
  }
  
  res.json({
    testMode: testMode,
    gpuServices: GPU_SERVICES,
    timestamp: new Date().toISOString(),
    gpuLocal: gpuStats,
    cloudApi: cloudStats,
    comparison: comparison,
    activeCalls: performanceMetrics.size,
    rawData: allMetrics.map(([callSid, data]) => ({
      callSid: callSid.substring(0, 8) + '...',
      method: data.method,
      models: data.models,
      responses: data.responses.length,
      avgResponseTime: data.responses.length > 0 ? 
        Math.round(data.responses.reduce((sum, r) => sum + r.totalTime, 0) / data.responses.length) : 0
    }))
  });
});

// Control endpoint for GPU test mode
app.post('/gpu/test-mode', (req, res) => {
  const { enabled, method, alternatePerCall, models } = req.body;
  
  if (enabled !== undefined) testMode.enabled = enabled;
  if (method && ['gpu-local', 'cloud-api', 'hybrid'].includes(method)) testMode.currentMethod = method;
  if (alternatePerCall !== undefined) testMode.alternatePerCall = alternatePerCall;
  if (models) {
    if (models.tts && ['coqui-tts', 'bark', 'tortoise'].includes(models.tts)) testMode.models.tts = models.tts;
    if (models.llm && ['llama-cpp', 'ollama', 'text-generation-webui'].includes(models.llm)) testMode.models.llm = models.llm;
    if (models.stt && ['faster-whisper', 'whisper-cpp', 'vosk'].includes(models.stt)) testMode.models.stt = models.stt;
  }
  
  res.json({
    message: 'GPU test mode updated',
    testMode: testMode
  });
});

// Register GPU test webhook
app.post('/gpu/call', handleGpuIncomingCall);

// Health check endpoint with GPU service status
app.get('/gpu/health', async (req, res) => {
  const healthChecks = {};
  
  // Check GPU service availability
  for (const [service, url] of Object.entries(GPU_SERVICES)) {
    try {
      const response = await axios.get(`${url}/health`, { timeout: 5000 });
      healthChecks[service] = { status: 'healthy', url };
    } catch (error) {
      healthChecks[service] = { status: 'unhealthy', url, error: error.message };
    }
  }
  
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    activeConversations: conversations.size,
    testMode: testMode,
    gpuServices: healthChecks
  });
});

// Root endpoint
app.get('/gpu', (req, res) => {
  res.json({ 
    message: 'GPU-Accelerated Jambonz Webhook Server - Self-Hosted Open Source AI',
    testMode: testMode,
    gpuServices: GPU_SERVICES,
    endpoints: [
      'POST /gpu/call - GPU test call handler',
      'POST /gpu/conversation - GPU conversation handler', 
      'GET /gpu/health - Health check with GPU service status',
      'GET /gpu/metrics - Performance comparison metrics',
      'POST /gpu/test-mode - Configure GPU testing (body: {enabled, method, alternatePerCall, models})',
      'GET /gpu/audio/:audioId - Serve GPU-generated audio'
    ],
    supportedModels: {
      tts: ['coqui-tts', 'bark', 'tortoise'],
      llm: ['llama-cpp', 'ollama', 'text-generation-webui'],
      stt: ['faster-whisper', 'whisper-cpp', 'vosk']
    }
  });
});

const PORT = process.env.GPU_PORT || 3004;
app.listen(PORT, async () => {
  // Ensure audio directory exists
  await ensureAudioDir();
  
  console.log(`\n========================================`);
  console.log(`GPU-Accelerated Jambonz Server Started`);
  console.log(`========================================`);
  console.log(`Port: ${PORT}`);
  console.log(`URL: http://localhost:${PORT}/gpu`);
  console.log(`\nGPU Webhook endpoints:`);
  console.log(`  - Call webhook: http://localhost:${PORT}/gpu/call`);
  console.log(`  - Conversation: http://localhost:${PORT}/gpu/conversation`);
  console.log(`\nGPU Services Configuration:`);
  Object.entries(GPU_SERVICES).forEach(([service, url]) => {
    console.log(`  - ${service}: ${url}`);
  });
  console.log(`\nSupported Models:`);
  console.log(`  - TTS: coqui-tts, bark, tortoise`);
  console.log(`  - LLM: llama-cpp, ollama, text-generation-webui`);  
  console.log(`  - STT: faster-whisper, whisper-cpp, vosk`);
  console.log(`========================================\n`);
});