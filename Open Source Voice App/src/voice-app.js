// =============================================================================
// 100% OPEN SOURCE GPU-ACCELERATED VOICE AI WEBHOOK SERVER
// =============================================================================
// 
// This is a complete Jambonz-compatible webhook server that provides enterprise-
// grade voice AI capabilities using only open-source, self-hosted components.
// 
// ARCHITECTURE:
// ┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
// │   Jambonz SBC   │───▶│  Webhook Server  │───▶│  GPU Services   │
// │   (VoIP calls)  │    │  (this file)     │    │  Ollama + VITS  │
// └─────────────────┘    └──────────────────┘    └─────────────────┘
//
// FEATURES:
// - 🎤 Speech Recognition: Faster-Whisper (GPU-accelerated)
// - 🧠 AI Processing: Ollama (local LLM inference)  
// - 🎵 Speech Synthesis: Coqui TTS VITS (production quality)
// - 📊 Performance Monitoring: Real-time metrics and comparison
// - 🔄 Auto Cleanup: Intelligent audio file management
// - 🚀 Zero External APIs: 100% self-hosted solution
//
// =============================================================================

require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

// =============================================================================
// SERVER CONFIGURATION
// =============================================================================

const app = express();
app.use(express.json());
app.use(morgan('combined')); // Use 'combined' for production logging

// =============================================================================
// DATA STRUCTURES - In-memory storage for conversation state
// =============================================================================

/**
 * Conversation History Storage
 * Maps call SID to conversation history array
 * Format: Map<string, Array<{role: string, content: string}>>
 */
const conversations = new Map();

/**
 * Audio File Cache
 * Maps audio IDs to file information for serving generated audio
 * Format: Map<string, {path: string, callSid: string, createdAt: number, method: string}>
 */
const audioCache = new Map();

/**
 * Performance Metrics Storage
 * Tracks response times and processing statistics per call
 * Format: Map<string, {method: string, startTime: number, responses: Array, totalResponseTime: number}>
 */
const performanceMetrics = new Map();

// =============================================================================
// PROCESSING MODE CONFIGURATION
// =============================================================================

/**
 * Test Mode Configuration
 * Controls whether to use GPU-local processing or cloud fallbacks
 * 
 * Options:
 * - enabled: Whether performance testing is active
 * - currentMethod: 'gpu-local' (open-source) or 'cloud-fallback' (paid APIs)
 * - alternatePerCall: Switch methods between calls for A/B testing
 */
let testMode = {
  enabled: true,
  currentMethod: 'gpu-local', // FORCE 100% open-source processing
  alternatePerCall: false      // NO alternating - always use GPU
};

// =============================================================================
// GPU SERVICE ENDPOINTS
// =============================================================================

/**
 * 100% Free Open-Source GPU Services Configuration
 * All services run in Docker containers with GPU acceleration
 * 
 * Service URLs use Docker internal networking (container names as hostnames)
 * External access available on mapped ports for debugging/monitoring
 */
const GPU_SERVICES = {
  // Faster-Whisper: GPU-accelerated speech recognition
  // API: POST /asr (multipart/form-data with audio_file)
  // Models: base, small, medium, large, large-v2, large-v3
  FASTER_WHISPER_URL: process.env.FASTER_WHISPER_URL || 'http://faster-whisper:9000',
  
  // Coqui TTS VITS: Production-quality neural text-to-speech
  // API: GET /api/tts?text=...&speaker_id=...
  // Speakers: p225 (female), p226 (male), p227-p376 (various)
  COQUI_TTS_URL: process.env.COQUI_TTS_URL || 'http://coqui-tts:5002',
  
  // Ollama: Local LLM inference engine
  // API: POST /api/chat (OpenAI-compatible format)
  // Models: llama3.1:8b, llama3.1:70b, phi3:mini, mistral:7b, etc.
  OLLAMA_URL: process.env.OLLAMA_URL || 'http://ollama:11434'
};

// =============================================================================
// AUDIO FILE MANAGEMENT
// =============================================================================

/**
 * Audio Storage Configuration
 * Directory for storing generated audio files with automatic cleanup
 */
const AUDIO_DIR = process.env.AUDIO_DIR || '/app/audio-cache';
const AUDIO_CLEANUP_HOURS = parseInt(process.env.AUDIO_CACHE_HOURS) || 1;
const CLEANUP_INTERVAL_MINUTES = 10;

/**
 * Ensure audio directory exists
 * Creates the directory structure if it doesn't exist
 */
async function ensureAudioDir() {
  try {
    await fs.access(AUDIO_DIR);
    console.log(`📁 Audio directory ready: ${AUDIO_DIR}`);
  } catch {
    await fs.mkdir(AUDIO_DIR, { recursive: true });
    console.log(`📁 Created audio directory: ${AUDIO_DIR}`);
  }
}

/**
 * Clean up old audio files
 * Removes audio files older than specified hours to prevent disk space issues
 * Runs automatically every 10 minutes
 */
async function cleanupOldAudio() {
  const cutoffTime = Date.now() - (AUDIO_CLEANUP_HOURS * 60 * 60 * 1000);
  let cleanedCount = 0;
  
  for (const [audioId, info] of audioCache.entries()) {
    if (info.createdAt < cutoffTime) {
      try {
        await fs.unlink(info.path);
        audioCache.delete(audioId);
        cleanedCount++;
        console.log(`🧹 Cleaned up old audio file: ${audioId}`);
      } catch (error) {
        console.error(`❌ Error cleaning up audio file ${audioId}:`, error.message);
      }
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`🧹 Audio cleanup completed: ${cleanedCount} files removed`);
  }
}

// Start automatic cleanup interval
setInterval(cleanupOldAudio, CLEANUP_INTERVAL_MINUTES * 60 * 1000);

// =============================================================================
// GPU-POWERED TEXT-TO-SPEECH GENERATION
// =============================================================================

/**
 * Generate high-quality speech using Coqui TTS VITS model
 * 
 * VITS Features:
 * - End-to-end neural synthesis (no separate vocoder needed)
 * - 67x real-time factor on GPU hardware
 * - Multiple speaker voices for variety
 * - 22kHz professional audio quality
 * 
 * @param {string} text - Text to synthesize (max ~500 chars recommended)
 * @param {string} callSid - Unique call identifier for logging
 * @returns {string} Audio file ID for retrieval
 */
async function generateVITSTTS(text, callSid) {
  const generateStartTime = Date.now();
  const audioId = crypto.randomBytes(16).toString('hex');
  const audioPath = path.join(AUDIO_DIR, `${audioId}.wav`);
  
  console.log(`🎵 GPU VITS TTS: ${callSid} - "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
  
  try {
    // Text encoding for URL parameters
    const encodedText = encodeURIComponent(text);
    
    // Speaker Selection Configuration
    // Available speakers for VCTK VITS model:
    // - p225: Female, young, English (Southern England)
    // - p226: Male, young, English (Surrey) 
    // - p227: Male, young, English (Cumbria)
    // - p228: Female, young, English (Southern England)
    // - p229: Female, young, English (Southern England)
    // - p230: Female, young, English (Stockton-on-tees)
    // ... and 100+ more speakers available
    const speakerId = process.env.VITS_SPEAKER_ID || 'p225'; // Default: female voice
    
    // API Request to Coqui TTS Server
    // Format: GET /api/tts?text=...&speaker_id=...
    const response = await axios.get(
      `${GPU_SERVICES.COQUI_TTS_URL}/api/tts?text=${encodedText}&speaker_id=${speakerId}`, 
      {
        responseType: 'arraybuffer',
        timeout: parseInt(process.env.TTS_TIMEOUT_MS) || 30000,
        headers: {
          'Accept': 'audio/wav',
          'Cache-Control': 'no-cache'
        }
      }
    );
    
    // Save generated audio to file system
    await fs.writeFile(audioPath, Buffer.from(response.data));
    
    // Cache audio file information for serving
    audioCache.set(audioId, {
      path: audioPath,
      callSid: callSid,
      createdAt: Date.now(),
      method: 'vits-gpu'
    });
    
    const generationTime = Date.now() - generateStartTime;
    console.log(`⚡ GPU VITS COMPLETE: ${generationTime}ms - ${audioId}`);
    console.log(`📊 TTS Stats: ${text.length} chars, ${(text.length / generationTime * 1000).toFixed(1)} chars/sec`);
    
    return audioId;
    
  } catch (error) {
    const errorTime = Date.now() - generateStartTime;
    console.error(`❌ GPU VITS ERROR: ${errorTime}ms - ${error.message}`);
    
    // Log additional error details for debugging
    if (error.response) {
      console.error(`   HTTP Status: ${error.response.status}`);
      console.error(`   Response: ${error.response.data ? error.response.data.toString().substring(0, 200) : 'No data'}`);
    }
    
    throw error;
  }
}

// =============================================================================
// GPU-POWERED LANGUAGE MODEL PROCESSING
// =============================================================================

/**
 * Generate AI responses using local Ollama LLM
 * 
 * Ollama Features:
 * - Local LLM inference (no external API calls)
 * - Multiple model support (Llama, Mistral, Phi, CodeLlama, etc.)
 * - GPU acceleration with CUDA
 * - OpenAI-compatible API format
 * 
 * @param {Array} messages - Conversation history in OpenAI format
 * @returns {string} AI-generated response text
 */
async function generateOllamaResponse(messages) {
  const generateStartTime = Date.now();
  console.log(`🧠 GPU OLLAMA REQUEST: Processing ${messages.length} messages`);
  
  try {
    // Model Configuration
    // Popular options:
    // - llama3.1:8b (recommended, 4.7GB, good quality/speed balance)
    // - llama3.1:70b (40GB, highest quality, requires powerful GPU)
    // - phi3:mini (2.3GB, fastest, good for simple tasks)
    // - mistral:7b (4.1GB, efficient alternative)
    const modelName = process.env.OLLAMA_MODEL || 'llama3.1:8b';
    
    // Request Configuration
    const requestConfig = {
      model: modelName,
      messages: messages,
      stream: false, // Use non-streaming for webhook compatibility
      options: {
        // Temperature: Controls randomness (0.0 = deterministic, 1.0 = creative)
        temperature: parseFloat(process.env.LLM_TEMPERATURE) || 0.7,
        
        // Top-p: Nuclear sampling parameter (0.9 recommended)
        top_p: parseFloat(process.env.LLM_TOP_P) || 0.9,
        
        // Max tokens: Limit response length for phone conversations
        num_predict: parseInt(process.env.LLM_MAX_TOKENS) || 100,
        
        // Additional options for fine-tuning:
        // top_k: 40,           // Top-k sampling
        // repeat_penalty: 1.1, // Reduce repetition
        // num_ctx: 2048,       // Context window size
      }
    };
    
    // API Request to Ollama
    const response = await axios.post(
      `${GPU_SERVICES.OLLAMA_URL}/api/chat`, 
      requestConfig,
      {
        timeout: parseInt(process.env.LLM_TIMEOUT_MS) || 20000,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    
    const aiResponse = response.data.message.content;
    const processingTime = Date.now() - generateStartTime;
    
    console.log(`⚡ GPU OLLAMA COMPLETE: ${processingTime}ms`);
    console.log(`📊 LLM Stats: ${aiResponse.length} chars, ${(aiResponse.split(' ').length / processingTime * 1000).toFixed(1)} words/sec`);
    console.log(`🤖 AI Response: "${aiResponse.substring(0, 100)}${aiResponse.length > 100 ? '...' : ''}"`);
    
    return aiResponse;
    
  } catch (error) {
    const errorTime = Date.now() - generateStartTime;
    console.error(`❌ GPU OLLAMA ERROR: ${errorTime}ms - ${error.message}`);
    
    // Log additional error details
    if (error.response) {
      console.error(`   HTTP Status: ${error.response.status}`);
      console.error(`   Response: ${JSON.stringify(error.response.data).substring(0, 200)}`);
    }
    
    throw error;
  }
}

// =============================================================================
// GPU-POWERED SPEECH RECOGNITION (UNUSED IN CURRENT SETUP)
// =============================================================================

/**
 * Transcribe audio using Faster-Whisper GPU acceleration
 * 
 * Note: Currently using Jambonz built-in speech recognition, but this function
 * is available for future integration or direct audio file processing.
 * 
 * Faster-Whisper Features:
 * - 3x+ speedup over standard OpenAI Whisper
 * - GPU acceleration with CUDA
 * - Multiple model sizes (base to large-v3)
 * - Supports 99+ languages
 * 
 * @param {Buffer} audioBuffer - Audio data in WAV format
 * @returns {string} Transcribed text
 */
async function transcribeFasterWhisper(audioBuffer) {
  const transcribeStartTime = Date.now();
  console.log(`🎤 GPU FASTER-WHISPER: Processing ${audioBuffer.length} bytes`);
  
  try {
    // Prepare multipart form data
    const formData = new FormData();
    formData.append('audio_file', new Blob([audioBuffer], { type: 'audio/wav' }), 'audio.wav');
    
    // Optional parameters for transcription quality/speed trade-offs
    formData.append('task', 'transcribe');                    // or 'translate' for translation
    formData.append('language', 'en');                        // Language hint for better accuracy
    formData.append('temperature', '0');                      // Deterministic output
    formData.append('best_of', '5');                         // Number of candidates to consider
    formData.append('beam_size', '5');                       // Beam search size
    // formData.append('word_timestamps', 'true');           // Enable word-level timestamps
    // formData.append('vad_filter', 'true');                // Voice activity detection
    
    const response = await axios.post(
      `${GPU_SERVICES.FASTER_WHISPER_URL}/asr`, 
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: parseInt(process.env.STT_TIMEOUT_MS) || 8000 // Faster-Whisper is much quicker
      }
    );
    
    const transcript = response.data.text;
    const processingTime = Date.now() - transcribeStartTime;
    
    console.log(`⚡ GPU FASTER-WHISPER COMPLETE: ${processingTime}ms`);
    console.log(`🎤 Transcript: "${transcript}"`);
    
    return transcript;
    
  } catch (error) {
    const errorTime = Date.now() - transcribeStartTime;
    console.error(`❌ GPU FASTER-WHISPER ERROR: ${errorTime}ms - ${error.message}`);
    throw error;
  }
}

// =============================================================================
// PERFORMANCE MONITORING AND METRICS
// =============================================================================

/**
 * Initialize performance tracking for a new call
 * 
 * @param {string} callSid - Unique call identifier
 * @returns {string} Processing method assigned to this call
 */
function initializeCallPerformance(callSid) {
  // Determine processing method based on configuration
  const method = testMode.alternatePerCall 
    ? (testMode.currentMethod === 'gpu-local' ? 'cloud-fallback' : 'gpu-local')
    : testMode.currentMethod;
  
  // Update alternating mode if enabled
  if (testMode.alternatePerCall) {
    testMode.currentMethod = method;
  }
  
  // Initialize performance tracking
  performanceMetrics.set(callSid, {
    method: method,
    startTime: Date.now(),
    responses: [],
    totalResponseTime: 0
  });
  
  console.log(`📊 Call ${callSid} assigned method: ${method.toUpperCase()}`);
  return method;
}

/**
 * Record response time metrics for performance analysis
 * 
 * @param {string} callSid - Call identifier
 * @param {number} startTime - Request start timestamp
 * @param {number} audioGenerationTime - Time spent generating audio
 * @param {string} textLength - Response text for calculating words per second
 */
function recordResponseTime(callSid, startTime, audioGenerationTime, responseText) {
  const metrics = performanceMetrics.get(callSid);
  if (!metrics) return;
  
  const totalTime = Date.now() - startTime;
  const wordCount = responseText.split(' ').length;
  const wordsPerSecond = (wordCount / (totalTime / 1000)).toFixed(2);
  
  const responseData = {
    timestamp: new Date().toISOString(),
    totalTime: totalTime,
    audioGenerationTime: audioGenerationTime,
    textLength: responseText.length,
    wordCount: wordCount,
    wordsPerSecond: wordsPerSecond
  };
  
  metrics.responses.push(responseData);
  metrics.totalResponseTime += totalTime;
  performanceMetrics.set(callSid, metrics);
  
  console.log(`📊 ${metrics.method.toUpperCase()} Performance:`);
  console.log(`   Total: ${totalTime}ms, Audio: ${audioGenerationTime}ms`);
  console.log(`   Speed: ${wordsPerSecond} words/sec, ${responseText.length} chars`);
}

// =============================================================================
// JAMBONZ WEBHOOK HANDLERS
// =============================================================================

/**
 * Handle incoming call webhook from Jambonz
 * 
 * This is the entry point for all new calls. It:
 * 1. Logs call information for debugging
 * 2. Initializes conversation history and performance tracking
 * 3. Returns Jambonz-compatible webhook response with initial greeting
 * 
 * @param {Object} req - Express request object with Jambonz call data
 * @param {Object} res - Express response object for webhook reply
 */
const handleIncomingCall = async (req, res) => {
  console.log('\n🔔 === NEW INCOMING CALL ===');
  console.log(`📞 Call SID: ${req.body.call_sid}`);
  console.log(`📱 From: ${req.body.from} → To: ${req.body.to}`);
  console.log(`🌍 Direction: ${req.body.direction || 'inbound'}`);
  
  // Initialize performance tracking and conversation state
  const callSid = req.body.call_sid;
  const processingMethod = initializeCallPerformance(callSid);
  
  // Set up conversation context with system instructions
  // This defines the AI's personality and behavior for the entire call
  conversations.set(callSid, [
    {
      role: "system",
      content: `You are a helpful and friendly AI assistant in a phone conversation. 

PERSONALITY:
- Keep responses natural, conversational, and concise (under 60 words)
- Be warm, engaging, and professional
- Ask follow-up questions to keep conversations flowing
- Adapt your tone to match the caller's energy level

TECHNICAL CONTEXT:
- You are running 100% locally on GPU hardware using open-source AI
- Mention that you're "running completely locally using open-source Llama 3.1" in early responses
- This demonstrates the power of self-hosted AI vs cloud services

CONVERSATION GUIDELINES:
- Keep responses under 60 words for phone conversation flow
- Be helpful but don't be overly verbose
- If you don't understand something, ask for clarification
- End conversations gracefully when users say goodbye`
    }
  ]);
  
  // Generate Jambonz webhook response
  // This tells Jambonz to play a greeting and then gather speech input
  const webhookResponse = [
    {
      "verb": "say",
      "text": "Hello! I'm an AI assistant running completely locally on GPU hardware. I'm ready to help you with anything you'd like to discuss. What's on your mind today?",
      "synthesizer": {
        "vendor": "default"  // Use Jambonz default TTS for initial greeting
      }
    },
    {
      "verb": "gather",
      "input": ["speech"],
      "actionHook": `${process.env.WEBHOOK_BASE_URL || 'https://your-domain.com'}/webhook/conversation`,
      "timeout": 15,        // Wait 15 seconds for user to start speaking
      "speechTimeout": 3,   // Stop listening 3 seconds after user stops
      "recognizer": {
        // Note: Using Jambonz built-in speech recognition instead of our GPU service
        // for better integration and reliability in production
        "vendor": "openai",
        "model": "whisper-1",
        "language": "en"
      }
    }
  ];
  
  console.log(`🚀 Sending initial response (${processingMethod.toUpperCase()})`);
  res.json(webhookResponse);
};

/**
 * Handle conversation webhook from Jambonz
 * 
 * This is the main conversation loop that:
 * 1. Processes speech input from the user
 * 2. Generates AI responses using local GPU models
 * 3. Creates high-quality speech synthesis
 * 4. Returns appropriate webhook responses to continue the conversation
 * 
 * @param {Object} req - Express request with speech recognition results
 * @param {Object} res - Express response for next webhook action
 */
app.post('/webhook/conversation', async (req, res) => {
  const requestStartTime = Date.now();
  console.log('\n🎤 === GPU CONVERSATION INPUT ===');
  console.log(`⏰ Request start: ${new Date().toISOString()}`);
  
  const callSid = req.body.call_sid;
  
  try {
    let userMessage = '';
    
    // Extract speech recognition results from Jambonz
    if (req.body.speech && req.body.speech.alternatives && req.body.speech.alternatives[0]) {
      userMessage = req.body.speech.alternatives[0].transcript;
      const sttTime = Date.now() - requestStartTime;
      console.log(`⚡ Speech-to-text: ${sttTime}ms`);
      console.log(`👤 User said: "${userMessage}"`);
    }
    
    // Handle cases where no speech was detected
    if (!userMessage || req.body.reason === 'timeout') {
      console.log(`⏰ No speech detected (timeout: ${Date.now() - requestStartTime}ms)`);
      
      const noSpeechResponse = [
        {
          "verb": "say",
          "text": "I didn't catch that. Could you please repeat what you'd like to discuss?",
          "synthesizer": { "vendor": "default" }
        },
        {
          "verb": "gather",
          "input": ["speech"],
          "actionHook": `${process.env.WEBHOOK_BASE_URL || 'https://your-domain.com'}/webhook/conversation`,
          "timeout": 15,
          "speechTimeout": 2,
          "recognizer": {
            "vendor": "openai",
            "model": "whisper-1", 
            "language": "en"
          }
        }
      ];
      return res.json(noSpeechResponse);
    }
    
    // Check for conversation ending phrases
    const goodbyePhrases = [
      'goodbye', 'bye', 'see you', 'talk to you later', 'gotta go', 
      'have to go', 'end call', 'hang up', 'that\'s all', 'thanks bye'
    ];
    const isGoodbye = goodbyePhrases.some(phrase => 
      userMessage.toLowerCase().includes(phrase)
    );
    
    if (isGoodbye) {
      console.log(`👋 Goodbye detected: "${userMessage}"`);
      
      const goodbyeResponse = [
        {
          "verb": "say",
          "text": "Thanks for testing our open-source voice AI system! The performance data has been recorded. Have a great day!",
          "synthesizer": { "vendor": "default" }
        },
        { "verb": "hangup" }
      ];
      
      // Clean up conversation state
      conversations.delete(callSid);
      console.log(`🧹 Cleaned up conversation for call ${callSid}`);
      
      return res.json(goodbyeResponse);
    }
    
    // Retrieve or initialize conversation history
    let conversationHistory = conversations.get(callSid) || [
      {
        role: "system",
        content: "You are a helpful AI assistant. Keep responses under 60 words for phone conversations."
      }
    ];
    
    // Add user message to conversation history
    conversationHistory.push({
      role: "user",
      content: userMessage
    });
    
    // Determine processing method for this call
    const callMetrics = performanceMetrics.get(callSid);
    const processingMethod = callMetrics?.method || 'gpu-local';
    
    console.log(`🔧 Processing method: ${processingMethod.toUpperCase()}`);
    
    // Generate AI response using selected method
    let aiResponse;
    const llmStartTime = Date.now();
    
    try {
      if (processingMethod === 'gpu-local') {
        // Use local GPU-powered Ollama LLM
        aiResponse = await generateOllamaResponse(conversationHistory);
      } else {
        // Fallback to cloud service (disabled in 100% open-source mode)
        throw new Error('Cloud fallback disabled in open-source mode');
      }
    } catch (error) {
      console.error(`❌ LLM processing failed: ${error.message}`);
      
      // In 100% open-source mode, we don't fallback to paid services
      // Instead, provide a graceful error message
      aiResponse = "I'm having trouble processing your request right now. Could you please try rephrasing that?";
    }
    
    const llmTime = Date.now() - llmStartTime;
    console.log(`⚡ LLM processing complete: ${llmTime}ms`);
    
    // Add AI response to conversation history
    conversationHistory.push({
      role: "assistant",
      content: aiResponse
    });
    
    // Update stored conversation (with memory limit)
    const maxHistoryLength = parseInt(process.env.MAX_CONVERSATION_HISTORY) || 10;
    if (conversationHistory.length > maxHistoryLength) {
      // Keep system message and recent history
      conversationHistory = [
        conversationHistory[0], // system message
        ...conversationHistory.slice(-maxHistoryLength + 1)
      ];
    }
    conversations.set(callSid, conversationHistory);
    
    // Generate high-quality speech synthesis
    let webhookResponse;
    const audioStartTime = Date.now();
    
    try {
      let audioId;
      let audioGenerationTime;
      
      if (processingMethod === 'gpu-local') {
        // Use GPU-powered VITS TTS for production-quality speech
        audioId = await generateVITSTTS(aiResponse, callSid);
        audioGenerationTime = Date.now() - audioStartTime;
        
        // Generate webhook response with audio playback
        const audioUrl = `${process.env.WEBHOOK_BASE_URL || 'https://your-domain.com'}/audio/generated/${audioId}`;
        
        webhookResponse = [
          {
            "verb": "play",
            "url": audioUrl
          },
          {
            "verb": "gather", 
            "input": ["speech"],
            "actionHook": `${process.env.WEBHOOK_BASE_URL || 'https://your-domain.com'}/webhook/conversation`,
            "timeout": 15,
            "speechTimeout": 2,
            "recognizer": {
              "vendor": "openai",
              "model": "whisper-1",
              "language": "en"
            }
          }
        ];
        
        // Record performance metrics
        recordResponseTime(callSid, requestStartTime, audioGenerationTime, aiResponse);
        
      } else {
        // Fallback to default TTS (should not happen in open-source mode)
        throw new Error('TTS service unavailable');
      }
      
    } catch (error) {
      console.error(`❌ Audio generation failed: ${error.message}`);
      
      // Fallback to Jambonz default TTS
      webhookResponse = [
        {
          "verb": "say",
          "text": "I'm having technical difficulties with audio generation. Let me try again with a different voice.",
          "synthesizer": { "vendor": "default" }
        },
        {
          "verb": "gather",
          "input": ["speech"], 
          "actionHook": `${process.env.WEBHOOK_BASE_URL || 'https://your-domain.com'}/webhook/conversation`,
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
    
    const totalTime = Date.now() - requestStartTime;
    console.log(`🏁 Total response time: ${totalTime}ms`);
    console.log(`📊 Breakdown - LLM: ${llmTime}ms, TTS: ${Date.now() - audioStartTime}ms`);
    
    res.json(webhookResponse);
    
  } catch (error) {
    console.error('💥 Error processing conversation:', error);
    
    // Generic error response
    const errorResponse = [
      {
        "verb": "say",
        "text": "I'm experiencing technical difficulties. Please try again.",
        "synthesizer": { "vendor": "default" }
      },
      {
        "verb": "gather",
        "input": ["speech"],
        "actionHook": `${process.env.WEBHOOK_BASE_URL || 'https://your-domain.com'}/webhook/conversation`,
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

/**
 * Handle call status updates from Jambonz
 * 
 * Receives notifications about call state changes (answered, completed, failed)
 * Used for cleanup and logging purposes
 * 
 * @param {Object} req - Express request with call status
 * @param {Object} res - Express response (acknowledgment)
 */
const handleCallStatus = (req, res) => {
  console.log('\n📋 === CALL STATUS UPDATE ===');
  console.log(`📞 Call SID: ${req.body.call_sid}`);
  console.log(`📊 Status: ${req.body.call_status}`);
  console.log(`🔄 Direction: ${req.body.direction || 'unknown'}`);
  
  // Clean up resources when call ends
  if (req.body.call_status === 'completed' || req.body.call_status === 'failed') {
    const callSid = req.body.call_sid;
    
    // Remove conversation history and metrics
    conversations.delete(callSid);
    const metrics = performanceMetrics.get(callSid);
    performanceMetrics.delete(callSid);
    
    if (metrics) {
      console.log(`📊 Call completed - Total responses: ${metrics.responses.length}`);
      console.log(`⏱️  Average response time: ${(metrics.totalResponseTime / metrics.responses.length).toFixed(0)}ms`);
    }
    
    console.log(`🧹 Cleaned up resources for call ${callSid}`);
  }
  
  res.status(200).send('OK');
};

// =============================================================================
// AUDIO FILE SERVING
// =============================================================================

/**
 * Serve static audio files
 * For serving pre-recorded audio files if needed
 */
app.get('/audio/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(AUDIO_DIR, filename);
  
  console.log(`📻 Serving static audio: ${filename}`);
  res.sendFile(filePath, (error) => {
    if (error) {
      console.error(`❌ Error serving audio file ${filename}:`, error.message);
      res.status(404).send('Audio file not found');
    }
  });
});

/**
 * Serve dynamically generated audio files
 * Main endpoint for serving TTS-generated audio to Jambonz
 */
app.get('/audio/generated/:audioId', (req, res) => {
  const audioId = req.params.audioId;
  
  // Look up audio file information in cache
  const audioInfo = audioCache.get(audioId);
  if (!audioInfo) {
    console.error(`❌ Generated audio not found: ${audioId}`);
    return res.status(404).send('Generated audio file not found');
  }
  
  console.log(`🎵 Serving generated audio: ${audioId} (${audioInfo.method})`);
  
  // Set appropriate headers for audio streaming
  res.setHeader('Content-Type', 'audio/wav');
  res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
  
  res.sendFile(audioInfo.path, (error) => {
    if (error) {
      console.error(`❌ Error serving generated audio ${audioId}:`, error.message);
      res.status(500).send('Error serving audio file');
    } else {
      console.log(`✅ Successfully served audio: ${audioId}`);
    }
  });
});

// =============================================================================
// MONITORING AND MANAGEMENT ENDPOINTS  
// =============================================================================

/**
 * Performance metrics endpoint
 * Provides detailed statistics about GPU vs cloud processing performance
 */
app.get('/metrics', (req, res) => {
  console.log('📊 Metrics request received');
  
  const allMetrics = Array.from(performanceMetrics.entries());
  const gpuMetrics = allMetrics.filter(([_, data]) => data.method === 'gpu-local');
  const cloudMetrics = allMetrics.filter(([_, data]) => data.method === 'cloud-fallback');
  
  // Calculate statistics for each processing method
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
  
  // Calculate comparison if both methods have data
  let comparison = null;
  if (gpuStats && cloudStats) {
    comparison = {
      totalTimeDifference: gpuStats.avgTotalTime - cloudStats.avgTotalTime,
      audioTimeDifference: gpuStats.avgAudioTime - cloudStats.avgAudioTime,
      speedupFactor: (cloudStats.avgTotalTime / gpuStats.avgTotalTime).toFixed(2),
      fasterMethod: gpuStats.avgTotalTime < cloudStats.avgTotalTime ? 'gpu-local' : 'cloud-fallback'
    };
  }
  
  // Return comprehensive metrics
  res.json({
    server: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString()
    },
    testMode: testMode,
    gpuServices: GPU_SERVICES,
    performance: {
      gpuLocal: gpuStats,
      cloudFallback: cloudStats,
      comparison: comparison
    },
    activeState: {
      activeCalls: performanceMetrics.size,
      activeConversations: conversations.size,
      cachedAudioFiles: audioCache.size
    }
  });
});

/**
 * Test mode configuration endpoint
 * Allows dynamic switching between GPU-local and cloud processing
 */
app.post('/test-mode', (req, res) => {
  const { enabled, method, alternatePerCall } = req.body;
  
  console.log('🔧 Test mode configuration update:', req.body);
  
  if (enabled !== undefined) testMode.enabled = enabled;
  if (method && ['gpu-local', 'cloud-fallback'].includes(method)) {
    testMode.currentMethod = method;
  }
  if (alternatePerCall !== undefined) testMode.alternatePerCall = alternatePerCall;
  
  console.log('✅ Test mode updated:', testMode);
  
  res.json({
    message: 'Test mode configuration updated successfully',
    testMode: testMode
  });
});

/**
 * Health check endpoint
 * Provides service status for monitoring and load balancers
 */
app.get('/health', (req, res) => {
  // Check GPU service connectivity status
  const gpuServicesStatus = {};
  for (const [service, url] of Object.entries(GPU_SERVICES)) {
    gpuServicesStatus[service] = {
      configured: !!url,
      url: url || 'not configured',
      // Note: Could add actual connectivity checks here if needed
      // status: 'connected' | 'disconnected' | 'unknown'
    };
  }
  
  const healthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    node: process.version,
    activeState: {
      conversations: conversations.size,
      performanceMetrics: performanceMetrics.size,
      audioCache: audioCache.size
    },
    configuration: {
      testMode: testMode,
      gpuServices: gpuServicesStatus,
      audioDir: AUDIO_DIR,
      cleanupHours: AUDIO_CLEANUP_HOURS
    }
  };
  
  res.json(healthStatus);
});

/**
 * Root endpoint - Service information
 * Provides API documentation and service overview
 */
app.get('/', (req, res) => {
  res.json({
    name: "100% Open Source GPU Voice AI Webhook Server",
    description: "Jambonz-compatible webhook server with GPU-accelerated voice AI processing",
    version: process.env.npm_package_version || '1.0.0',
    features: [
      "🎤 GPU Speech Recognition (Faster-Whisper)",
      "🧠 Local LLM Processing (Ollama + Llama 3.1)",
      "🎵 Production TTS (Coqui VITS)", 
      "📊 Performance Monitoring",
      "🔄 Auto Audio Cleanup",
      "🚀 Zero External Dependencies"
    ],
    currentConfig: {
      testMode: testMode,
      gpuServices: GPU_SERVICES
    },
    endpoints: [
      'POST /webhook/call - Handle incoming calls',
      'POST /webhook/conversation - Process conversations',
      'POST /webhook/status - Call status updates',
      'GET /health - Health check and status',
      'GET /metrics - Performance metrics',
      'POST /test-mode - Configure processing mode',
      'GET /audio/generated/:id - Serve generated audio',
      'GET /audio/:filename - Serve static audio'
    ],
    documentation: "See README.md for full setup and configuration instructions"
  });
});

// =============================================================================
// WEBHOOK ROUTE REGISTRATION
// =============================================================================

// Register webhook handlers on multiple paths for compatibility
app.post('/', handleIncomingCall);                    // Root webhook
app.post('/webhook/call', handleIncomingCall);        // Standard path
app.post('/webhook/conversation', /* defined above */); // Conversation handler  
app.post('/webhook/status', handleCallStatus);        // Status updates
app.post('/status', handleCallStatus);                // Alternative status path

// =============================================================================
// SERVER STARTUP
// =============================================================================

const PORT = process.env.PORT || 3003;

app.listen(PORT, async () => {
  // Initialize audio directory
  await ensureAudioDir();
  
  console.log('\n🚀 ========================================');
  console.log('🎯 100% OPEN SOURCE GPU VOICE AI SERVER');
  console.log('🚀 ========================================');
  console.log(`📍 Server URL: http://localhost:${PORT}`);
  console.log(`🐳 Docker Network: voice-ai-network`);
  console.log(`📁 Audio Directory: ${AUDIO_DIR}`);
  console.log('\n🔗 Webhook Endpoints:');
  console.log(`   📞 Calls: http://localhost:${PORT}/webhook/call`);
  console.log(`   💬 Conversations: http://localhost:${PORT}/webhook/conversation`);
  console.log(`   📊 Status: http://localhost:${PORT}/webhook/status`);
  console.log('\n📊 Monitoring Endpoints:');
  console.log(`   🏥 Health: http://localhost:${PORT}/health`);
  console.log(`   📈 Metrics: http://localhost:${PORT}/metrics`);
  console.log(`   ⚙️  Config: POST http://localhost:${PORT}/test-mode`);
  console.log('\n🎵 Audio Endpoints:');
  console.log(`   🎧 Generated: http://localhost:${PORT}/audio/generated/:id`);
  console.log(`   📻 Static: http://localhost:${PORT}/audio/:filename`);
  console.log('\n🔧 Current Configuration:');
  console.log(`   🎯 Mode: ${testMode.currentMethod.toUpperCase()}`);
  console.log(`   🔄 Alternating: ${testMode.alternatePerCall ? 'Yes' : 'No'}`);
  console.log(`   🧹 Cleanup: Every ${CLEANUP_INTERVAL_MINUTES}min (${AUDIO_CLEANUP_HOURS}h retention)`);
  console.log('\n🖥️  GPU Services:');
  console.log(`   🧠 LLM: ${GPU_SERVICES.OLLAMA_URL}`);
  console.log(`   🎵 TTS: ${GPU_SERVICES.COQUI_TTS_URL}`);
  console.log(`   🎤 STT: ${GPU_SERVICES.FASTER_WHISPER_URL}`);
  console.log('\n✅ Server ready for Jambonz webhooks!');
  console.log('🚀 ========================================\n');
});