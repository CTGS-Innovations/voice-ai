/**
 * Outbound Call Handler for Jambonz
 * Provides a clean interface for initiating outbound calls through the Jambonz API
 */

require('dotenv').config();
const axios = require('axios');
const logger = require('./logger');

class OutboundCallHandler {
  constructor(config = {}) {
    // Use environment variables with fallback to config
    this.accountSid = config.accountSid || process.env.JAMBONZ_ACCOUNT_SID;
    this.apiKey = config.apiKey || process.env.JAMBONZ_API_KEY;
    this.apiUrl = config.apiUrl || process.env.JAMBONZ_API_URL || 'https://api.jambonz.cloud';
    this.webhookBaseUrl = config.webhookBaseUrl || process.env.WEBHOOK_BASE_URL;
    
    // Validate required configuration
    if (!this.accountSid || !this.apiKey) {
      throw new Error('Missing required Jambonz configuration: JAMBONZ_ACCOUNT_SID and JAMBONZ_API_KEY must be set');
    }
    
    if (!this.webhookBaseUrl) {
      throw new Error('Missing WEBHOOK_BASE_URL configuration');
    }
    
    // Setup axios client with authentication
    this.client = axios.create({
      baseURL: this.apiUrl,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    logger.info('Outbound call handler initialized', {
      apiUrl: this.apiUrl,
      accountSid: this.accountSid,
      webhookBaseUrl: this.webhookBaseUrl
    });
  }
  
  /**
   * Initiate an outbound call using official Jambonz client
   * @param {Object} options - Call configuration options
   * @param {string} options.to - The destination phone number (E.164 format)
   * @param {string} options.from - The caller ID to display (E.164 format)
   * @param {string} [options.applicationSid] - Optional application SID to use
   * @param {string} [options.callHook] - Optional webhook URL for call events
   * @param {number} [options.timeout] - Ring timeout in seconds (default: 60)
   * @param {number} [options.timeLimit] - Maximum call duration in seconds
   * @param {Object} [options.tag] - Optional metadata to associate with the call
   * @param {boolean} [options.useOfficialClient] - Use official Jambonz client instead of axios
   * @returns {Promise<Object>} - Call creation response with call SID
   */
  async createCall(options) {
    const startTime = Date.now();
    
    // Validate required parameters
    if (!options.to) {
      throw new Error('Destination phone number (to) is required');
    }
    
    if (!options.from) {
      throw new Error('Caller ID (from) is required');
    }
    
    // Ensure phone numbers are in E.164 format
    const to = this.formatPhoneNumber(options.to);
    const from = this.formatPhoneNumber(options.from);
    
    // Build the call request payload (matching Jambonz documentation format)
    const payload = {
      from: from,
      to: {
        type: 'phone',
        number: to
      },
      // Webhook URLs (string format)
      call_hook: `${this.webhookBaseUrl}/webhook/call`,
      call_status_hook: `${this.webhookBaseUrl}/webhook/status`,
      timeout: options.timeout || 60,
      tag: {
        ...options.tag,
        direction: 'outbound',
        testCall: true,
        initiatedAt: new Date().toISOString(),
        sipTrunk: process.env.SIP_USERNAME
      }
    };
    
    // Add optional parameters
    if (options.applicationSid) {
      payload.application_sid = options.applicationSid;
    }
    
    if (options.timeLimit) {
      payload.timeLimit = options.timeLimit;
    }
    
    // Add speech synthesis configuration to match inbound calls
    if (!options.applicationSid) {
      payload.speech_synthesis_vendor = 'default';
      payload.speech_synthesis_language = 'en-US';
      payload.speech_synthesis_voice = 'default';
      payload.speech_recognizer_vendor = 'openai';
      payload.speech_recognizer_language = 'en';
    }
    
    logger.info('Creating outbound call', {
      from: from,
      to: to,
      callHook: payload.call_hook,
      statusHook: payload.call_status_hook
    });
    
    try {
      const response = await this.client.post(
        `/v1/Accounts/${this.accountSid}/Calls`,
        payload
      );
      
      const duration = Date.now() - startTime;
      logger.info('Outbound call created successfully', {
        callSid: response.data.sid,
        duration: `${duration}ms`,
        status: response.status
      });
      
      return {
        success: true,
        callSid: response.data.sid,
        data: response.data,
        duration: duration
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Failed to create outbound call', {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
        duration: `${duration}ms`
      });
      
      // Provide helpful error messages
      if (error.response?.status === 401) {
        throw new Error('Authentication failed. Please check your JAMBONZ_API_KEY');
      } else if (error.response?.status === 404) {
        throw new Error('Account not found. Please check your JAMBONZ_ACCOUNT_SID');
      } else if (error.response?.status === 400) {
        const message = error.response?.data?.msg || error.response?.data?.message || 'Invalid request parameters';
        throw new Error(`Bad request: ${message}`);
      } else {
        throw new Error(`Failed to create call: ${error.message}`);
      }
    }
  }
  
  /**
   * Get the status of a call
   * @param {string} callSid - The call SID to check
   * @returns {Promise<Object>} - Call status information
   */
  async getCallStatus(callSid) {
    if (!callSid) {
      throw new Error('Call SID is required');
    }
    
    try {
      const response = await this.client.get(
        `/v1/Accounts/${this.accountSid}/Calls/${callSid}`
      );
      
      logger.info('Retrieved call status', {
        callSid: callSid,
        status: response.data.call_status,
        sipStatus: response.data.sip_status,
        direction: response.data.direction,
        from: response.data.from,
        to: response.data.to,
        duration: response.data.duration
      });
      
      return response.data;
    } catch (error) {
      logger.error('Failed to get call status', {
        callSid: callSid,
        error: error.message
      });
      
      if (error.response?.status === 404) {
        throw new Error(`Call not found: ${callSid}`);
      }
      
      throw error;
    }
  }
  
  /**
   * End an active call
   * @param {string} callSid - The call SID to terminate
   * @returns {Promise<Object>} - Termination result
   */
  async endCall(callSid) {
    if (!callSid) {
      throw new Error('Call SID is required');
    }
    
    try {
      await this.client.put(
        `/v1/Accounts/${this.accountSid}/Calls/${callSid}`,
        {
          call_status: 'completed'
        }
      );
      
      logger.info('Call terminated', {
        callSid: callSid
      });
      
      return {
        success: true,
        callSid: callSid
      };
    } catch (error) {
      logger.error('Failed to end call', {
        callSid: callSid,
        error: error.message
      });
      
      throw error;
    }
  }
  
  /**
   * Format phone number to E.164 format
   * @param {string} phoneNumber - The phone number to format
   * @returns {string} - Formatted phone number
   */
  formatPhoneNumber(phoneNumber) {
    // Remove all non-digit characters
    let cleaned = phoneNumber.replace(/\D/g, '');
    
    // Add + prefix if not present
    if (!phoneNumber.startsWith('+')) {
      // Assume US number if 10 digits
      if (cleaned.length === 10) {
        cleaned = '1' + cleaned;
      }
      return '+' + cleaned;
    }
    
    return phoneNumber;
  }
  
  /**
   * Validate configuration
   * @returns {Object} - Validation result
   */
  validateConfiguration() {
    const issues = [];
    
    if (!this.accountSid) {
      issues.push('JAMBONZ_ACCOUNT_SID is not configured');
    }
    
    if (!this.apiKey) {
      issues.push('JAMBONZ_API_KEY is not configured');
    }
    
    if (!this.webhookBaseUrl) {
      issues.push('WEBHOOK_BASE_URL is not configured');
    }
    
    // Test API connectivity
    return {
      valid: issues.length === 0,
      issues: issues,
      config: {
        apiUrl: this.apiUrl,
        accountSid: this.accountSid ? `${this.accountSid.substr(0, 8)}...` : 'not set',
        webhookBaseUrl: this.webhookBaseUrl
      }
    };
  }
}

module.exports = OutboundCallHandler;