module.exports = ({logger, makeService}) => {
  const svc = makeService({path: '/conversation'});
  
  svc.on('session:new', async (session) => {
    const sessionLogger = logger.child({call_sid: session.call_sid});
    session.locals = {
      logger: sessionLogger,
      conversationHistory: []
    };
    
    sessionLogger.info('Starting AI conversation');
    
    try {
      // Set up event handlers
      session
        .on('close', onClose.bind(null, session))
        .on('error', onError.bind(null, session))
        .on('/conversation-response', onConversationResponse.bind(null, session));
      
      const ttsConfig = getTTSConfig();
      
      // Start conversation
      session
        .say({
          text: `<speak>
            Hello! I'm ready to chat with you. 
            <break time="300ms"/>
            Feel free to ask me anything or tell me what's on your mind.
            <break time="300ms"/>
            When you want to end our conversation, just say goodbye.
          </speak>`,
          ...ttsConfig
        })
        .gather({
          say: {
            text: 'What would you like to talk about?',
            ...ttsConfig
          },
          input: ['speech'],
          actionHook: '/conversation-response',
          timeout: 10,
          speechTimeout: 2,
          partialResultHook: '/interim-transcript'
        })
        .send();
        
    } catch (err) {
      sessionLogger.error({err}, 'Error starting conversation');
      session.close();
    }
  });
  
  // Handle interim transcripts for real-time feedback
  svc.on('/interim-transcript', (session, evt) => {
    const {logger} = session.locals;
    if (evt.speech && evt.speech.alternatives && evt.speech.alternatives[0]) {
      const transcript = evt.speech.alternatives[0].transcript;
      logger.debug(`Interim transcript: ${transcript}`);
    }
    session.reply();
  });
};

// Get TTS provider configuration
function getTTSConfig() {
  const provider = process.env.TTS_PROVIDER || 'google';
  const config = {
    synthesizer: {
      vendor: provider
    }
  };
  
  switch (provider) {
    case 'google':
      config.synthesizer.language = 'en-US';
      config.synthesizer.voice = process.env.TTS_VOICE || 'en-US-Journey-F';
      break;
    case 'aws':
      config.synthesizer.language = 'en-US';
      config.synthesizer.voice = process.env.TTS_VOICE || 'Joanna';
      break;
    case 'elevenlabs':
      config.synthesizer.voice_id = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
      config.synthesizer.model_id = 'eleven_monolingual_v1';
      break;
  }
  
  return config;
}

// Handle conversation responses
async function onConversationResponse(session, evt) {
  const {logger, conversationHistory} = session.locals;
  const ttsConfig = getTTSConfig();
  
  logger.info({evt}, 'Conversation response received');
  
  // Handle timeout
  if (evt.reason === 'timeout') {
    session
      .say({
        text: `<speak>
          Are you still there? 
          <break time="300ms"/>
          I'm here whenever you're ready to continue our conversation.
        </speak>`,
        ...ttsConfig
      })
      .gather({
        input: ['speech'],
        actionHook: '/conversation-response',
        timeout: 10,
        speechTimeout: 2
      })
      .reply();
    return;
  }
  
  // Get user input
  if (evt.speech && evt.speech.alternatives && evt.speech.alternatives[0]) {
    const userInput = evt.speech.alternatives[0].transcript;
    const confidence = evt.speech.alternatives[0].confidence || 0;
    
    logger.info(`User said: "${userInput}" (confidence: ${confidence})`);
    
    // Add to conversation history
    conversationHistory.push({
      role: 'user',
      content: userInput,
      timestamp: new Date().toISOString()
    });
    
    // Check for goodbye
    if (userInput.toLowerCase().includes('goodbye') || 
        userInput.toLowerCase().includes('bye') ||
        userInput.toLowerCase().includes('end')) {
      handleGoodbye(session, ttsConfig);
      return;
    }
    
    // Generate AI response (simplified for demo)
    const aiResponse = generateAIResponse(userInput, conversationHistory);
    
    // Add AI response to history
    conversationHistory.push({
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date().toISOString()
    });
    
    // Continue conversation
    session
      .say({
        text: `<speak>${aiResponse}</speak>`,
        ...ttsConfig
      })
      .gather({
        input: ['speech'],
        actionHook: '/conversation-response',
        timeout: 10,
        speechTimeout: 2,
        partialResultHook: '/interim-transcript'
      })
      .reply();
  }
}

// Generate AI response (simplified version)
function generateAIResponse(userInput, history) {
  const input = userInput.toLowerCase();
  
  // Simple response logic (replace with actual AI integration)
  if (input.includes('weather')) {
    return `The weather today is quite pleasant. 
            <break time="300ms"/>
            It's a great day for a phone conversation!
            <break time="300ms"/>
            Is there anything specific about the weather you'd like to know?`;
  } else if (input.includes('how are you')) {
    return `I'm doing wonderfully, thank you for asking! 
            <break time="300ms"/>
            As an AI, I'm always ready to help and chat.
            <break time="300ms"/>
            How are you doing today?`;
  } else if (input.includes('tell me about')) {
    const topic = input.replace('tell me about', '').trim();
    return `${topic} is a fascinating subject! 
            <break time="300ms"/>
            While I'd love to share more details, 
            this is a demonstration of conversational AI capabilities.
            <break time="300ms"/>
            What aspect of ${topic} interests you most?`;
  } else if (input.includes('joke')) {
    return `Here's a tech joke for you: 
            <break time="300ms"/>
            Why do programmers prefer dark mode?
            <break time="500ms"/>
            Because light attracts bugs!
            <break time="300ms"/>
            <prosody rate="slow">
              <emphasis level="moderate">Ba dum tss!</emphasis>
            </prosody>`;
  } else {
    // Default conversational response
    return `That's interesting! 
            <break time="300ms"/>
            ${getContextualResponse(input)}
            <break time="300ms"/>
            What else would you like to discuss?`;
  }
}

// Get contextual response based on input
function getContextualResponse(input) {
  const responses = [
    'I appreciate you sharing that with me.',
    'That's a thoughtful perspective.',
    'I understand what you mean.',
    'That's something worth exploring further.',
    'Your point is well taken.'
  ];
  
  // Simple hash to select response based on input
  const index = input.length % responses.length;
  return responses[index];
}

// Handle goodbye
function handleGoodbye(session, ttsConfig) {
  const {conversationHistory} = session.locals;
  const conversationLength = conversationHistory.length;
  
  session
    .say({
      text: `<speak>
        <prosody rate="medium">
          It was wonderful talking with you today!
          <break time="300ms"/>
          We exchanged ${Math.floor(conversationLength / 2)} messages in our conversation.
          <break time="500ms"/>
          Thank you for trying out our AI conversation system.
          <break time="300ms"/>
          Have a fantastic day, and goodbye!
        </prosody>
      </speak>`,
      ...ttsConfig
    })
    .pause({length: 1})
    .hangup()
    .send();
}

// Handle session close
function onClose(session, code, reason) {
  const {logger, conversationHistory} = session.locals;
  logger.info({
    code, 
    reason,
    conversationLength: conversationHistory.length
  }, `Conversation session ${session.call_sid} closed`);
}

// Handle session error
function onError(session, err) {
  const {logger} = session.locals;
  logger.error({err}, `Conversation session ${session.call_sid} error`);
}