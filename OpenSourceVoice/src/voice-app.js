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

// Store call start times for conversation management
const callStartTimes = new Map();

// Helper function to log Jambonz action verbs with clear flow indication
function logJambonzAction(callSid, actor, verbs, context = '') {
  const verbActions = Array.isArray(verbs) ? verbs : [verbs];
  
  verbActions.forEach((verb, index) => {
    const action = verb.verb?.toUpperCase() || 'UNKNOWN';
    const details = [];
    
    // Add relevant details based on verb type
    switch (verb.verb) {
      case 'play':
        details.push(`url: ${verb.url?.split('/').pop() || 'unknown'}`);
        break;
      case 'say':
        const text = verb.text || '';
        details.push(`text: "${text.length > 50 ? text.substring(0, 50) + '...' : text}"`);
        break;
      case 'gather':
        details.push(`input: [${verb.input?.join(',') || 'unknown'}]`);
        if (verb.recognizer?.voiceMs) details.push(`vad: ${verb.recognizer.voiceMs}ms`);
        if (verb.timeout) details.push(`jambonz_timeout: ${verb.timeout}s`);
        break;
      case 'hangup':
        details.push('call termination');
        break;
      case 'pause':
        details.push(`duration: ${verb.length || 'default'}s`);
        break;
    }
    
    const detailStr = details.length > 0 ? ` (${details.join(', ')})` : '';
    const contextStr = context ? ` ${context}` : '';
    
    logger.info(`[${actor}] [ACTION:${action}]${detailStr}${contextStr}`, { callSid });
  });
}

// Helper function to log user input and system responses clearly
function logUserInput(callSid, speech, confidence = null, context = '') {
  const confidenceStr = confidence !== null ? ` (confidence: ${confidence})` : '';
  const contextStr = context ? ` ${context}` : '';
  logger.info(`[USER] [INPUT:SPEECH] "${speech}"${confidenceStr}${contextStr}`, { callSid });
}

function logSystemResponse(callSid, text, context = '') {
  const contextStr = context ? ` ${context}` : '';
  logger.info(`[AGENT] [OUTPUT:TEXT] "${text.length > 100 ? text.substring(0, 100) + '...' : text}"${contextStr}`, { callSid });
}

// Store generated audio files
const audioCache = new Map();

// Cache for voice prompts (loaded once at startup)
const voicePromptCache = new Map();
let currentVoicePrompt = null;

// Cache for common responses (instant responses)
const responseCache = new Map([
  ['hello', "Hey there! Need help with your account, an order, or scheduling? What brings you in today?"],
  ['hi', "Hello! What brings you in today? Account issue, order status, or something else?"],
  ['how are you', "Doing well, thanks! What can be done for you today?"],
  ['what can you do', "Account verification, order status checks, and appointment scheduling are available. Which do you need?"],
  ['thank you', "You're very welcome! Anything else needed?"],
  ['thanks', "Happy to help! Need anything else while we're here?"],
  ['bye', "Great talking with you! Have a wonderful day!"],
  ['goodbye', "Take care! Thanks for calling in today!"]
]);

// Performance testing data
const performanceMetrics = new Map();

// Set AI provider based on environment variable
const aiProvider = process.env.AI_PROVIDER || 'ollama';
let testMode = {
  enabled: true,
  currentMethod: aiProvider === 'openai' ? 'cloud-fallback' : 'gpu-local',
  alternatePerCall: false
};

// Jambonz timeout configuration - keep session alive while Whisper VAD controls speech timing
const JAMBONZ_GATHER_TIMEOUT = parseInt(process.env.JAMBONZ_GATHER_TIMEOUT_S) || 45;

logger.info(`🤖 AI Provider: ${aiProvider.toUpperCase()}`);
logger.info(`📝 TTS Provider: ${process.env.TTS_PROVIDER || 'chatterbox'}`);
logger.info(`🔄 Test Mode: ${testMode.currentMethod}`);
logger.info(`⏱️ Aligned Timeouts: ${JAMBONZ_GATHER_TIMEOUT}s (Jambonz Record = STT = Response Generation | 60s max recording)`);
logger.info(`🔧 PROCESSING CHAIN: Jambonz[Gather] → Faster-Whisper[VAD-ENABLED] → Local[${aiProvider.toUpperCase()}] → Local[${process.env.TTS_PROVIDER || 'chatterbox'}]`);

// 100% Free Open-Source GPU Services
const GPU_SERVICES = {
  FASTER_WHISPER_URL: process.env.FASTER_WHISPER_URL || 'http://faster-whisper:9000',
  COQUI_TTS_URL: process.env.COQUI_TTS_URL || 'http://coqui-tts:5002',
  CHATTERBOX_TTS_URL: process.env.CHATTERBOX_TTS_URL || 'http://chatterbox-tts-prebuilt:8000',
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

// Preload voice samples into memory for faster access
async function preloadVoicePrompts() {
  const startTime = Date.now();
  const voiceSample = process.env.CHATTERBOX_VOICE_SAMPLE;
  
  if (!voiceSample || voiceSample === 'default') {
    logger.info('Using default synthetic voice (no voice cloning)');
    currentVoicePrompt = null;
    return;
  }
  
  try {
    if (voiceSample.endsWith('.wav') || voiceSample.endsWith('.mp3')) {
      const voicePath = path.join('/app/voices', voiceSample);
      
      // Check if already cached
      if (voicePromptCache.has(voiceSample)) {
        currentVoicePrompt = voicePromptCache.get(voiceSample);
        logger.info(`Voice prompt loaded from cache: ${voiceSample}`);
        return;
      }
      
      // Load and cache the voice file
      const audioBuffer = await fs.readFile(voicePath);
      const base64Audio = audioBuffer.toString('base64');
      
      voicePromptCache.set(voiceSample, base64Audio);
      currentVoicePrompt = base64Audio;
      
      const loadTime = Date.now() - startTime;
      logger.info(`Voice sample preloaded: ${voiceSample} (${(audioBuffer.length / 1024 / 1024).toFixed(2)}MB) in ${loadTime}ms`);
    } else if (voiceSample.startsWith('http')) {
      // For URLs, we'll fetch on demand
      currentVoicePrompt = voiceSample;
      logger.info(`Using voice sample URL: ${voiceSample}`);
    }
  } catch (error) {
    logger.error(`Failed to preload voice sample: ${error.message}`);
    currentVoicePrompt = null;
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
    // Prepare simple request payload that matches the working API format
    const payload = {
      text: text
    };
    
    // The pre-built container may not support voice cloning parameters
    // Keep this simple for maximum compatibility
    logger.debug(`Generating speech with Chatterbox TTS`, { callSid, textLength: text.length });
    
    // Use Chatterbox TTS /tts endpoint (custom build)
    const response = await axios.post(`${GPU_SERVICES.CHATTERBOX_TTS_URL}/tts`, payload, {
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

// Enhanced Chatterbox TTS with test configuration support
async function generateChatterboxTTSWithConfig(text, voiceSample = 'default', speed = 1.0, timeout = 30000) {
  const generateStartTime = Date.now();
  const audioId = crypto.randomBytes(16).toString('hex');
  const audioPath = path.join(AUDIO_DIR, `${audioId}.wav`);
  const testCallSid = `test-${audioId.substring(0, 8)}`;
  
  logger.audio('TTS_TEST_START', { 
    provider: 'Chatterbox TTS Test', 
    text: text.substring(0, 30) + '...', 
    voiceSample, 
    speed, 
    timeout,
    testCallSid 
  });
  
  try {
    // Enhanced payload with proper Chatterbox TTS API format
    const payload = {
      text: text,
      speed_factor: speed
    };
    
    // Voice cloning support - your container DOES support this via audio_prompt_path!
    if (voiceSample && voiceSample !== 'default' && voiceSample !== 'custom') {
      try {
        const voicePath = path.join(__dirname, '../voices', voiceSample);
        await fs.access(voicePath);
        
        // Your API expects audio_prompt_path for voice cloning
        payload.audio_prompt_path = `/app/voices/${voiceSample}`;
        
        logger.info(`🎭 [VOICE-CLONE] Using voice cloning with: ${voiceSample} → ${payload.audio_prompt_path}`, { testCallSid });
      } catch (error) {
        logger.warn(`Voice file not found: ${voiceSample}, using default voice`, { testCallSid });
      }
    } else {
      logger.info(`🎭 [VOICE-DEFAULT] Using default voice (no voice cloning)`, { testCallSid });
    }
    
    logger.debug(`Generating test speech with Chatterbox TTS`, { 
      testCallSid, 
      textLength: text.length,
      voiceSample: voiceSample || 'default',
      speed,
      timeout,
      payload: JSON.stringify(payload, null, 2)
    });
    
    // Use Chatterbox TTS with simple JSON format
    const response = await axios.post(`${GPU_SERVICES.CHATTERBOX_TTS_URL}/tts`, payload, {
      responseType: 'arraybuffer',
      timeout: timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    // Save audio file
    await fs.writeFile(audioPath, response.data);
    
    // Store in cache for serving with test metadata
    audioCache.set(audioId, {
      path: audioPath,
      callSid: testCallSid,
      createdAt: Date.now(),
      method: 'chatterbox-test',
      testConfig: {
        voiceSample: voiceSample || 'default',
        speed,
        timeout
      }
    });
    
    const duration = Date.now() - generateStartTime;
    logger.performance('TTS Test Generation', duration, { 
      testCallSid, 
      audioId, 
      provider: 'Chatterbox TTS Test',
      voiceSample: voiceSample || 'default',
      speed 
    });
    return audioId;
  } catch (error) {
    const duration = Date.now() - generateStartTime;
    logger.error(`TTS test generation failed after ${duration}ms`, { 
      testCallSid, 
      provider: 'Chatterbox TTS Test', 
      voiceSample,
      speed,
      error: error.message 
    });
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
        temperature: parseFloat(process.env.LLM_TEMPERATURE) || 0.5,
        top_p: parseFloat(process.env.LLM_TOP_P) || 0.7,
        num_predict: parseInt(process.env.LLM_MAX_TOKENS) || 40,
        num_ctx: 2048,  // Smaller context for speed
        num_batch: 512, // Larger batch for throughput
        num_thread: 8   // Use more threads
      }
    }, {
      timeout: parseInt(process.env.LLM_TIMEOUT_MS) || 20000
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
  logger.info('🎤 [LOCAL-FASTER-WHISPER] Starting transcription with VAD', { 
    service: 'Faster-Whisper Local GPU', 
    audioSize: `${(audioBuffer.byteLength / 1024).toFixed(1)}KB`,
    vad: 'enabled'
  });
  
  try {
    const formData = new FormData();
    formData.append('audio_file', new Blob([audioBuffer], { type: 'audio/wav' }), 'audio.wav');
    formData.append('task', 'transcribe');
    formData.append('language', 'en');
    formData.append('temperature', '0');
    formData.append('best_of', '5');
    formData.append('beam_size', '5');
    
    // Enable VAD filtering for better speech detection
    formData.append('vad_filter', 'true');
    
    // VAD parameters for optimal phone conversation processing
    const vadParams = {
      min_silence_duration_ms: parseInt(process.env.VAD_MIN_SILENCE_MS || '500'),  // Min silence to split segments
      speech_pad_ms: parseInt(process.env.VAD_SPEECH_PAD_MS || '400'),            // Padding around speech
      threshold: parseFloat(process.env.VAD_THRESHOLD || '0.5'),                  // Speech detection threshold
      min_speech_duration_ms: parseInt(process.env.VAD_MIN_SPEECH_MS || '250'),   // Min speech duration to keep
      max_speech_duration_s: parseInt(process.env.VAD_MAX_SPEECH_S || '30')       // Max continuous speech duration
    };
    formData.append('vad_parameters', JSON.stringify(vadParams));
    
    logger.debug('VAD Parameters:', vadParams);
    
    const response = await axios.post(`${GPU_SERVICES.FASTER_WHISPER_URL}/asr`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: (JAMBONZ_GATHER_TIMEOUT * 1000) // Align STT timeout with Jambonz gather timeout
    });
    
    // Log raw response for debugging
    logger.debug('Whisper raw response:', { 
      status: response.status,
      dataType: typeof response.data,
      dataKeys: response.data ? Object.keys(response.data) : []
    });
    
    const transcript = response.data.text || response.data || '';
    const segments = response.data.segments;
    const duration = Date.now() - transcribeStartTime;
    logger.info('✅ [LOCAL-FASTER-WHISPER] Transcription completed with VAD', { 
      service: 'Faster-Whisper Local GPU',
      duration: `${duration}ms`,
      transcript: transcript ? (transcript.substring(0, 100) + (transcript.length > 100 ? '...' : '')) : '[Empty]',
      segments: segments ? segments.length : 0,
      vad: 'active',
      success: true
    });
    logger.performance('Speech Recognition', duration);
    return transcript;
  } catch (error) {
    const duration = Date.now() - transcribeStartTime;
    logger.error('❌ [LOCAL-FASTER-WHISPER] Transcription failed', { 
      service: 'Faster-Whisper Local GPU',
      duration: `${duration}ms`,
      error: error.message,
      success: false
    });
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
  
  // Track call start time for conversation management
  callStartTimes.set(callSid, Date.now());
  
  conversations.set(callSid, [
    {
      role: "system",
      content: `You are Scout, a customer service agent demonstrating AI-powered customer support capabilities. Your goal is to collect customer information, repeat it back to them for confirmation, and simulate how you could assist with their needs.

Your personality and approach:
- Always introduce yourself as Scout in your FIRST interaction only
- After introduction, avoid using "I" or referring to yourself - just ask questions directly
- Be professional, friendly, and helpful
- For account verification, collect: first name, last name, and phone number (avoid email as it's hard to validate via speech)
- Always repeat back the information collected for confirmation (spell out names if unclear)
- When someone gives you a phone number, acknowledge it clearly: "Got it, your number is [repeat the number]"
- When you have all three pieces of info, simulate sending an SMS verification code:
  * Say "A verification code has been sent to your phone ending in [last 4 digits]"
  * Ask "What's the 4-digit code you received?"
  * When they provide any 4 digits, simulate successful verification
  * Say something like "Perfect! Your identity has been verified."
- For requests like setting up meetings, employment inquiries, or checking order status, continue after verification
- Keep responses conversational but under 40 words
- Ask one question at a time: "What's your first name?" instead of "Can I have your first name?"
- Be mindful of conversation time - aim to collect key information within the first minute

Remember: You're demonstrating SMS-based two-factor authentication for customer service. After collecting name and phone, simulate the SMS code verification process to show secure authentication. When wrapping up, suggest concrete next steps.`
    }
  ]);
  
  // Generate greeting audio using our configured TTS
  const greetingText = "Hi! I'm Scout, an AI assistant demonstrating customer service capabilities. This is a simulation only. I can show you account verification, order status checks, or scheduling. What would you like to try?";
  
  // Generate the greeting audio and wait for it (we need to play something)
  let audioUrl = null;
  try {
    const audioId = await generateChatterboxTTS(greetingText, callSid);
    audioUrl = `${process.env.WEBHOOK_BASE_URL}/audio/generated/${audioId}`;
    logger.info('Greeting audio generated successfully', { audioId, callSid, audioUrl });
  } catch (error) {
    logger.error('Failed to generate greeting audio', { callSid, error: error.message });
  }
  
  // Build response - use audio if available, otherwise fall back to say verb
  const response = audioUrl ? [
    {
      "verb": "play",
      "url": audioUrl
    },
    {
      "verb": "gather",
      "input": ["speech"],
      "timeout": JAMBONZ_GATHER_TIMEOUT,
      "actionHook": `${process.env.WEBHOOK_BASE_URL}/webhook/conversation`,
      "recognizer": {
        "vendor": "openai",
        "model": "whisper-1",
        "language": "en",
        "vad": {
          "enable": false
        }
      }
    }
  ] : [
    {
      "verb": "say",
      "text": greetingText,
      "synthesizer": { 
        "vendor": "aws",
        "voice": "Joanna"
      }
    },
    {
      "verb": "gather",
      "input": ["speech"],
      "timeout": JAMBONZ_GATHER_TIMEOUT,
      "actionHook": `${process.env.WEBHOOK_BASE_URL}/webhook/conversation`,
      "recognizer": {
        "vendor": "openai",
        "model": "whisper-1",
        "language": "en",
        "vad": {
          "enable": false
        }
      }
    }
  ];
  
  // Log the greeting and actions being sent to Jambonz
  logSystemResponse(callSid, greetingText, '- INITIAL GREETING');
  logJambonzAction(callSid, 'AGENT', response, '- GREETING FLOW');
  
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
    
    // Extract user speech from OpenAI Whisper (back to working version)
    if (req.body.speech && req.body.speech.alternatives && req.body.speech.alternatives[0]) {
      userMessage = req.body.speech.alternatives[0].transcript;
      const sttDuration = Date.now() - requestStartTime;
      logger.performance('Speech-to-Text', sttDuration, { callSid });
      
      // Enhanced user input logging
      const confidence = req.body.speech.alternatives[0].confidence;
      logUserInput(callSid, userMessage, confidence, '- [LOCAL-CUSTOM-WHISPER] SPEECH RECOGNIZED');
      
      logger.conversation(callSid, 'USER', userMessage, { 
        confidence: confidence,
        provider: 'Local Custom Faster-Whisper'
      });
    }
    
    // Handle timeout or no speech
    if (!userMessage || req.body.reason === 'timeout') {
      logger.warn('[USER] [INPUT:TIMEOUT] No speech detected or timeout', { callSid, reason: req.body.reason });
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
          "timeout": Math.min(JAMBONZ_GATHER_TIMEOUT, 30),
          "actionHook": `${process.env.WEBHOOK_BASE_URL}/webhook/conversation`,
          "recognizer": {
            "vendor": "openai",
            "model": "whisper-1",
            "language": "en",
            "vad": {
              "enable": false
            }
          }
        }
      ];
      
      // Log timeout response
      logSystemResponse(callSid, "I didn't catch that. Could you please repeat what you'd like to test?", '- TIMEOUT RECOVERY');
      logJambonzAction(callSid, 'AGENT', response, '- RETRY FLOW');
      
      return res.json(response);
    }
    
    // Check for clear goodbye phrases only - no single word "bye" to avoid false positives
    const userMessageLower = userMessage.toLowerCase().trim();
    
    // Only explicit goodbye phrases (no ambiguous single words)
    const explicitGoodbyes = ['goodbye', 'good bye', 'bye bye', 'see you later', 'talk to you later', 
                             'gotta go', 'have to go', 'need to go', 'end call', 'hang up', 'end the call'];
    
    // Check for confirmation responses to "anything else" question (be very specific to avoid false positives)
    const confirmationResponses = [
      'no thanks', 'no thank you', 'that\'s all', 'that\'s it', 
      'nothing else', 'no more questions', 'we\'re all done', 'all done',
      'end the call', 'end call', 'hang up the call'
    ];
    
    // Handle standalone "no" only if it's very short and clear
    const isStandaloneNo = (userMessageLower === 'no' || userMessageLower === 'no.' || 
                           userMessageLower === 'nope' || userMessageLower === 'nope.');
    
    const isExplicitGoodbye = explicitGoodbyes.some(phrase => userMessageLower.includes(phrase));
    const isConfirmingEnd = confirmationResponses.some(phrase => userMessageLower.includes(phrase)) || isStandaloneNo;
    
    // Enhanced logging for goodbye detection debugging  
    if (isExplicitGoodbye) {
      logger.info(`[SYSTEM] [EXPLICIT_GOODBYE] "${userMessage}" - ending call immediately`, { callSid });
    }
    if (isConfirmingEnd) {
      if (isStandaloneNo) {
        logger.info(`[SYSTEM] [CONFIRMED_END_STANDALONE_NO] "${userMessage}" - standalone no detected`, { callSid });
      } else {
        const matchedPhrase = confirmationResponses.find(phrase => userMessageLower.includes(phrase));
        logger.info(`[SYSTEM] [CONFIRMED_END_PHRASE] "${userMessage}" - matched phrase: "${matchedPhrase}"`, { callSid });
      }
    }
    
    if (isExplicitGoodbye || isConfirmingEnd) {
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
      callStartTimes.delete(callSid);
      
      // Log goodbye response
      logSystemResponse(callSid, "Thanks for testing the GPU voice processing! The performance data has been recorded. Goodbye!", '- GOODBYE');
      logJambonzAction(callSid, 'AGENT', response, '- CALL TERMINATION');
      
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
    
    // Check for conversation completion indicators (user seems done)
    const completionIndicators = [
      'thank you', 'thanks', 'that\'s all', 'that\'s it', 'i\'m done', 'we\'re done', 
      'all set', 'perfect', 'great thanks', 'sounds good', 'got it thanks',
      'that helps', 'that\'s helpful', 'appreciate it'
    ];
    
    const seemsComplete = completionIndicators.some(indicator => 
      userMessageLower.includes(indicator)
    );
    
    // If conversation seems complete, ask for confirmation instead of ending
    if (seemsComplete) {
      logger.info(`[SYSTEM] [COMPLETION_DETECTED] "${userMessage}" - asking for confirmation`, { callSid });
      
      const confirmationResponse = [
        {
          "verb": "say",
          "text": "It sounds like we've covered what you needed. Is there anything else I can help you with, or would you like to end the call?",
          "synthesizer": {
            "vendor": "default"
          }
        },
        {
          "verb": "gather",
          "input": ["speech"],
          "timeout": JAMBONZ_GATHER_TIMEOUT,
          "actionHook": `${process.env.WEBHOOK_BASE_URL}/webhook/conversation`,
          "recognizer": {
            "vendor": "openai",
            "model": "whisper-1",
            "language": "en",
            "vad": {
              "enable": false
            }
          }
        }
      ];
      
      // Log confirmation response
      logSystemResponse(callSid, "It sounds like we've covered what you needed. Is there anything else I can help you with, or would you like to end the call?", '- COMPLETION CONFIRMATION');
      logJambonzAction(callSid, 'AGENT', confirmationResponse, '- ASKING FOR CONFIRMATION');
      
      return res.json(confirmationResponse);
    }
    
    // Check if conversation has exceeded 60 seconds (only add wrap-up message once)
    const callStartTime = callStartTimes.get(callSid);
    const conversationDuration = callStartTime ? (Date.now() - callStartTime) / 1000 : 0;
    const shouldWrapUp = conversationDuration > 60;
    
    // Only add wrap-up message if we haven't already
    const hasWrapUpMessage = conversationHistory.some(msg => 
      msg.role === "system" && msg.content.includes("conversation has reached 60 seconds")
    );
    
    if (shouldWrapUp && !hasWrapUpMessage) {
      // Add wrap-up instruction to the system context (only once)
      conversationHistory.push({
        role: "system",
        content: "The conversation has reached 60 seconds. Please wrap up by summarizing what was discussed and suggesting a follow-up action. Be concise and professional."
      });
    }
    
    // Get test method for this call
    const callMetrics = performanceMetrics.get(callSid);
    const testMethod = callMetrics?.method || 'gpu-local';
    
    logger.info(`Processing with ${testMethod.toUpperCase()} method`, { callSid });
    
    let aiResponse;
    const llmStartTime = Date.now();
    
    // Check cache for instant responses to common phrases
    const lowerMessage = userMessage.toLowerCase().trim();
    if (responseCache.has(lowerMessage)) {
      aiResponse = responseCache.get(lowerMessage);
      logger.info(`Using cached response for: "${lowerMessage}"`, { callSid });
    } else {
      // Generate AI response using selected method
      try {
        if (testMethod === 'gpu-local') {
          // Use LOCAL GPU Ollama
          logger.info(`🤖 Using LOCAL GPU Ollama for AI response`, { callSid });
          aiResponse = await generateOllamaResponse(conversationHistory);
        } else {
          // Use cloud fallback
          logger.info(`☁️ Using OpenAI API for AI response`, { callSid });
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
    }
    
    const llmDuration = Date.now() - llmStartTime;
    logger.performance('LLM Complete', llmDuration, { callSid });
    
    // Check for empty or problematic responses
    if (!aiResponse || aiResponse.trim() === '' || aiResponse.trim() === '...') {
      logger.warn('Empty or invalid AI response detected, using fallback', { callSid, response: aiResponse });
      aiResponse = "Could you repeat that please? Let me make sure I have your information correct.";
    }
    
    // Enhanced AI response logging
    logSystemResponse(callSid, aiResponse, '- AI GENERATED');
    logger.conversation(callSid, 'AI', aiResponse);
    
    // Add AI response to history
    conversationHistory.push({
      role: "assistant",
      content: aiResponse
    });
    
    // Update stored conversation
    conversations.set(callSid, conversationHistory);
    
    // Generate audio using selected method with timeout protection
    let response;
    const audioStartTime = Date.now();
    
    // Create a timeout promise aligned with Jambonz gather timeout
    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => {
        logger.warn('[SYSTEM] [TIMEOUT] Response generation timeout - using fallback', { callSid });
        resolve({
          audioId: null,
          audioGenerationTime: JAMBONZ_GATHER_TIMEOUT * 1000,
          timedOut: true
        });
      }, (JAMBONZ_GATHER_TIMEOUT * 1000)); // Align with 45-second Jambonz gather timeout
    });
    
    // Create the actual generation promise
    const generationPromise = (async () => {
      let audioId;
      let audioGenerationTime;
      
      if (testMethod === 'gpu-local') {
        // Try TTS providers based on TTS_PROVIDER setting
        const ttsProvider = process.env.TTS_PROVIDER || 'chatterbox';
        
        try {
          if (ttsProvider === 'elevenlabs' && process.env.ELEVENLABS_API_KEY) {
            try {
              audioId = await generateElevenLabsTTS(aiResponse, callSid);
              audioGenerationTime = Date.now() - audioStartTime;
            } catch (elevenLabsError) {
              logger.warn('ElevenLabs TTS failed, falling back to Chatterbox', { callSid, error: elevenLabsError.message });
              audioId = await generateChatterboxTTS(aiResponse, callSid);
              audioGenerationTime = Date.now() - audioStartTime;
            }
          } else if (ttsProvider === 'chatterbox') {
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
        // Use TTS_PROVIDER setting even with cloud AI provider
        const ttsProvider = process.env.TTS_PROVIDER || 'chatterbox';
        
        if (ttsProvider === 'elevenlabs' && process.env.ELEVENLABS_API_KEY) {
          audioId = await generateElevenLabsAudio(aiResponse, callSid);
          audioGenerationTime = Date.now() - audioStartTime;
        } else if (ttsProvider === 'chatterbox') {
          audioId = await generateChatterboxTTS(aiResponse, callSid);
          audioGenerationTime = Date.now() - audioStartTime;
        } else {
          // Default to Coqui TTS
          audioId = await generateCoquiTTS(aiResponse, callSid);
          audioGenerationTime = Date.now() - audioStartTime;
        }
      }
      
      return { audioId, audioGenerationTime };
    })();
    
    // Race between generation and timeout
    const result = await Promise.race([generationPromise, timeoutPromise]);
    
    try {
      if (result.timedOut || !result.audioId) {
        // Use fallback say verb if generation timed out
        response = [
          {
            "verb": "say",
            "text": aiResponse,
            "synthesizer": {
              "vendor": "default"
            }
          },
          {
            "verb": "gather",
            "input": ["speech"],
            "timeout": JAMBONZ_GATHER_TIMEOUT,
            "actionHook": `${process.env.WEBHOOK_BASE_URL}/webhook/conversation`,
            "recognizer": {
              "vendor": "openai",
              "model": "whisper-1",
              "language": "en",
              "vad": {
                "enable": false
              }
            }
          }
        ];
      } else {
        const audioUrl = `${process.env.WEBHOOK_BASE_URL}/audio/generated/${result.audioId}`;
        
        response = [
        {
          "verb": "play",
          "url": audioUrl
        },
        {
          "verb": "gather",
          "input": ["speech"],
          "timeout": JAMBONZ_GATHER_TIMEOUT,
          "actionHook": `${process.env.WEBHOOK_BASE_URL}/webhook/conversation`,
          "recognizer": {
            "vendor": "openai",
            "model": "whisper-1",
            "language": "en",
            "vad": {
              "enable": false
            }
          }
        }
      ];
      }
      
      if (result.audioGenerationTime) {
        recordResponseTime(callSid, requestStartTime, result.audioGenerationTime, aiResponse);
      }
      
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
          "timeout": JAMBONZ_GATHER_TIMEOUT,
          "actionHook": `${process.env.WEBHOOK_BASE_URL}/webhook/conversation`,
          "recognizer": {
            "vendor": "openai",
            "model": "whisper-1",
            "language": "en",
            "vad": {
              "enable": false
            }
          }
        }
      ];
    }
    
    const totalDuration = Date.now() - requestStartTime;
    logger.performance('Total Request', totalDuration, { callSid });
    
    // Log the action verbs being sent to Jambonz
    const isPlayResponse = response.some(verb => verb.verb === 'play');
    const context = isPlayResponse ? '- AUDIO PLAYBACK' : '- FALLBACK TTS';
    logJambonzAction(callSid, 'AGENT', response, context);
    
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
        "timeout": JAMBONZ_GATHER_TIMEOUT,
        "actionHook": `${process.env.WEBHOOK_BASE_URL}/webhook/conversation`,
        "recognizer": {
          "vendor": "openai",
          "model": "whisper-1",
          "language": "en",
          "vad": {
            "enable": true,
            "mode": 1,
            "voiceMs": 30000
          }
        }
      }
    ];
    
    // Log error response
    logSystemResponse(callSid, "I'm having a technical issue. Let me try again.", '- ERROR RECOVERY');
    logJambonzAction(callSid, 'AGENT', errorResponse, '- ERROR HANDLING');
    
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
    callStartTimes.delete(callSid);
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

// Whisper VAD Test Dashboard
app.get('/vad-test', (req, res) => {
  res.sendFile(path.join(__dirname, 'whisper-vad-test.html'));
});

// Chatterbox TTS Test Dashboard
app.get('/tts-test', (req, res) => {
  res.sendFile(path.join(__dirname, 'chatterbox-tts-test.html'));
});

// API endpoint to get available voice samples
app.get('/api/voice-samples', async (req, res) => {
  try {
    const voicesDir = path.join(__dirname, '../voices');
    
    // Check if voices directory exists
    try {
      await fs.access(voicesDir);
    } catch {
      return res.json({
        success: true,
        voices: [],
        message: 'No voices directory found'
      });
    }
    
    // Read voice files from directory
    const files = await fs.readdir(voicesDir);
    const voiceFiles = files
      .filter(file => file.endsWith('.wav') || file.endsWith('.mp3'))
      .map(file => {
        const stats = require('fs').statSync(path.join(voicesDir, file));
        return {
          filename: file,
          name: file.replace(/\.(wav|mp3)$/i, ''),
          size: `${(stats.size / 1024 / 1024).toFixed(1)}MB`,
          type: file.toLowerCase().endsWith('.wav') ? 'wav' : 'mp3'
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    
    logger.debug(`Found ${voiceFiles.length} voice samples in ${voicesDir}`);
    
    res.json({
      success: true,
      voices: voiceFiles,
      count: voiceFiles.length
    });
  } catch (error) {
    logger.error('Error reading voice samples', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Middleware to handle raw body for audio upload
app.use('/api/whisper-test', express.raw({ type: 'application/octet-stream', limit: '10mb' }));

// API endpoint for direct Whisper testing
app.post('/api/whisper-test', async (req, res) => {
  try {
    const audioBuffer = req.body;
    
    if (!audioBuffer || audioBuffer.length === 0) {
      throw new Error('No audio data received');
    }
    
    logger.info('🧪 [VAD-TEST] Processing test audio', {
      size: `${(audioBuffer.length / 1024).toFixed(1)}KB`,
      type: typeof audioBuffer
    });
    
    const startTime = Date.now();
    const transcript = await transcribeFasterWhisper(audioBuffer);
    const processingTime = Date.now() - startTime;
    
    res.json({
      success: true,
      text: transcript,
      processingTime,
      vadEnabled: true,
      service: 'faster-whisper',
      segments: [] // TODO: Parse segments from response
    });
  } catch (error) {
    logger.error('❌ [VAD-TEST] Test transcription failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API endpoint for Chatterbox TTS testing
app.post('/api/chatterbox-test', async (req, res) => {
  try {
    const { text, voiceSample, speed, timeout } = req.body;
    
    if (!text || text.trim() === '') {
      throw new Error('No text provided for TTS generation');
    }
    
    logger.info('🧪 [TTS-TEST] Processing TTS request', {
      textLength: text.length,
      voiceSample: voiceSample || 'default',
      speed: speed || 1.0,
      timeout: timeout || 30000
    });
    
    const startTime = Date.now();
    
    // Generate audio using Chatterbox TTS with test configuration
    const audioId = await generateChatterboxTTSWithConfig(text, voiceSample, speed, timeout);
    const processingTime = Date.now() - startTime;
    
    const audioUrl = `${process.env.WEBHOOK_BASE_URL}/audio/generated/${audioId}`;
    
    res.json({
      success: true,
      text: text,
      audioId: audioId,
      audioUrl: audioUrl,
      processingTime,
      voiceSample: voiceSample || 'default',
      speed: speed || 1.0,
      service: 'chatterbox-tts'
    });
  } catch (error) {
    logger.error('❌ [TTS-TEST] Test TTS generation failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
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
      'GET /audio/generated/:filename - Serve generated audio',
      'GET /vad-test - Whisper VAD Testing Dashboard',
      'POST /api/whisper-test - Direct Whisper API testing',
      'GET /tts-test - Chatterbox TTS Testing Dashboard',
      'POST /api/chatterbox-test - Direct Chatterbox TTS API testing'
    ]
  });
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, async () => {
  // Ensure audio directory exists
  await ensureAudioDir();
  
  // Preload voice samples for instant access
  await preloadVoicePrompts();
  
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
    aiProvider: process.env.AI_PROVIDER || 'ollama',
    ttsProvider: process.env.TTS_PROVIDER || 'chatterbox',
    speakers: {
      coqui: process.env.VITS_SPEAKER_ID || 'p225',
      chatterbox: process.env.CHATTERBOX_VOICE_SAMPLE || 'default',
      elevenlabs: process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'
    }
  });
});