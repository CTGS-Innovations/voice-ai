/**
 * Production-Grade Logging System
 * Provides structured, intelligent logging with multiple levels
 */

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4
};

const LOG_COLORS = {
  ERROR: '\x1b[31m', // Red
  WARN: '\x1b[33m',  // Yellow
  INFO: '\x1b[36m',  // Cyan
  DEBUG: '\x1b[37m', // White
  TRACE: '\x1b[90m', // Gray
  RESET: '\x1b[0m'
};

const LOG_ICONS = {
  ERROR: '❌',
  WARN: '⚠️',
  INFO: '🔵',
  DEBUG: '🔧',
  TRACE: '📝',
  SUCCESS: '✅',
  CONVERSATION: '💬',
  PERFORMANCE: '⏱️',
  SYSTEM: '🤖',
  AUDIO: '🔊'
};

class Logger {
  constructor() {
    this.level = this.parseLogLevel(process.env.LOG_LEVEL || 'INFO');
    this.enableColors = process.env.NODE_ENV !== 'production';
    this.enableTimestamp = true;
  }

  parseLogLevel(level) {
    const upperLevel = level.toUpperCase();
    return LOG_LEVELS[upperLevel] !== undefined ? LOG_LEVELS[upperLevel] : LOG_LEVELS.INFO;
  }

  formatMessage(level, category, message, meta = {}) {
    const timestamp = this.enableTimestamp 
      ? `[${new Date().toISOString()}]`
      : '';
    
    const icon = LOG_ICONS[category] || LOG_ICONS[level];
    const color = this.enableColors ? LOG_COLORS[level] : '';
    const reset = this.enableColors ? LOG_COLORS.RESET : '';
    
    let formatted = `${color}${timestamp} ${icon} [${level}]${reset} ${message}`;
    
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      formatted += ` ${JSON.stringify(meta)}`;
    }
    
    return formatted;
  }

  shouldLog(level) {
    return LOG_LEVELS[level] <= this.level;
  }

  log(level, category, message, meta = {}) {
    if (!this.shouldLog(level)) return;
    
    const formatted = this.formatMessage(level, category, message, meta);
    
    if (level === 'ERROR') {
      console.error(formatted);
    } else if (level === 'WARN') {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }
  }

  // Core logging methods
  error(message, meta = {}) {
    this.log('ERROR', 'ERROR', message, meta);
  }

  warn(message, meta = {}) {
    this.log('WARN', 'WARN', message, meta);
  }

  info(message, meta = {}) {
    this.log('INFO', 'INFO', message, meta);
  }

  debug(message, meta = {}) {
    this.log('DEBUG', 'DEBUG', message, meta);
  }

  trace(message, meta = {}) {
    this.log('TRACE', 'TRACE', message, meta);
  }

  // Specialized logging methods
  success(message, meta = {}) {
    this.log('INFO', 'SUCCESS', message, meta);
  }

  system(message, meta = {}) {
    this.log('INFO', 'SYSTEM', message, meta);
  }

  conversation(callSid, direction, content, meta = {}) {
    const conversationMeta = { callSid, direction, ...meta };
    this.log('INFO', 'CONVERSATION', content, conversationMeta);
  }

  performance(operation, duration, meta = {}) {
    const perfMeta = { operation, duration: `${duration}ms`, ...meta };
    this.log('INFO', 'PERFORMANCE', `${operation} completed in ${duration}ms`, perfMeta);
  }

  audio(operation, details, meta = {}) {
    const audioMeta = { operation, ...details, ...meta };
    this.log('INFO', 'AUDIO', `Audio ${operation}: ${JSON.stringify(details)}`, audioMeta);
  }

  // Startup banner
  startup(config) {
    console.log('');
    console.log('🤖 ========================================');
    console.log('🤖  OPEN SOURCE VOICE AI SYSTEM v1.0');
    console.log('🤖 ========================================');
    
    this.success('Voice AI webhook server initializing...');
    this.system(`Environment: ${process.env.NODE_ENV || 'development'}`);
    this.system(`Port: ${config.port}`);
    this.system(`Webhook Base: ${config.webhookBase}`);
    
    console.log('');
    console.log('🔧 GPU Service Endpoints:');
    this.system(`Ollama LLM: ${config.services.ollama}`);
    this.system(`Coqui TTS: ${config.services.coquiTts}`);
    this.system(`Chatterbox TTS: ${config.services.chatterboxTts}`);
    this.system(`Faster Whisper: ${config.services.whisper}`);
    
    console.log('');
    console.log('⚙️  Configuration:');
    this.system(`Model: ${config.model}`);
    this.system(`TTS Provider: ${config.ttsProvider}`);
    if (config.speakers) {
      this.system(`TTS Voices: Coqui(${config.speakers.coqui}) | Chatterbox(${config.speakers.chatterbox})`);
    }
    this.system(`Log Level: ${process.env.LOG_LEVEL || 'INFO'}`);
    
    console.log('');
    this.success('All systems initialized - ready for calls');
    console.log('🤖 ========================================');
    console.log('');
  }

  // Call session logging
  callStart(callSid, from, to) {
    this.conversation(callSid, 'INCOMING', `Call started: ${from} → ${to}`, { from, to });
  }

  callEnd(callSid, duration) {
    this.conversation(callSid, 'END', `Call completed`, { duration: `${duration}ms` });
  }

  // Request/Response logging
  request(method, path, callSid, body) {
    this.debug(`${method} ${path}`, { callSid, body: this.shouldLog('TRACE') ? body : '[hidden]' });
  }

  response(status, callSid, responseData) {
    this.debug(`Response ${status}`, { callSid, data: this.shouldLog('TRACE') ? responseData : '[hidden]' });
  }
}

// Export singleton instance
module.exports = new Logger();