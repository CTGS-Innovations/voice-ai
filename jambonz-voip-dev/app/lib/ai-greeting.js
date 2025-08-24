module.exports = ({logger, makeService}) => {
  const svc = makeService({path: '/ai-greeting'});
  
  svc.on('session:new', async (session) => {
    const sessionLogger = logger.child({call_sid: session.call_sid});
    session.locals = {logger: sessionLogger};
    
    sessionLogger.info({
      from: session.from,
      to: session.to,
      direction: session.direction
    }, `New incoming call: ${session.call_sid}`);
    
    try {
      // Set up event handlers
      session
        .on('close', onClose.bind(null, session))
        .on('error', onError.bind(null, session))
        .on('/menu', onMenuSelection.bind(null, session));
      
      // Get TTS configuration
      const ttsConfig = getTTSConfig();
      
      // Initial greeting with AI voice
      session
        .pause({length: 0.5})
        .say({
          text: getGreetingText(),
          ...ttsConfig
        })
        .pause({length: 0.5})
        .gather({
          say: {
            text: getMenuText(),
            ...ttsConfig
          },
          input: ['speech', 'dtmf'],
          actionHook: '/menu',
          timeout: 10,
          numDigits: 1,
          speechTimeout: 3
        })
        .send();
        
    } catch (err) {
      sessionLogger.error({err}, `Error handling incoming call: ${session.call_sid}`);
      session.close();
    }
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
    default:
      config.synthesizer.language = 'en-US';
      config.synthesizer.voice = 'en-US-Standard-C';
  }
  
  return config;
}

// Get greeting text
function getGreetingText() {
  const hour = new Date().getHours();
  let greeting = 'Good day';
  
  if (hour < 12) greeting = 'Good morning';
  else if (hour < 17) greeting = 'Good afternoon';
  else greeting = 'Good evening';
  
  return `<speak>
    <prosody rate="medium" pitch="medium">
      ${greeting}, and thank you for calling our AI-powered voice system.
      <break time="300ms"/>
      This is a demonstration of Jambonz integrated with advanced text-to-speech technology.
      <break time="500ms"/>
      I'm an AI assistant ready to help you explore the capabilities of this platform.
    </prosody>
  </speak>`;
}

// Get menu text
function getMenuText() {
  return `<speak>
    <prosody rate="medium">
      To explore our features, you can say or press:
      <break time="300ms"/>
      <emphasis level="moderate">One</emphasis> for information about our services,
      <break time="200ms"/>
      <emphasis level="moderate">Two</emphasis> to speak with an AI agent,
      <break time="200ms"/>
      <emphasis level="moderate">Three</emphasis> to leave a message,
      <break time="200ms"/>
      or <emphasis level="moderate">Zero</emphasis> to repeat these options.
    </prosody>
  </speak>`;
}

// Handle menu selection
async function onMenuSelection(session, evt) {
  const {logger} = session.locals;
  const ttsConfig = getTTSConfig();
  
  logger.info({evt}, 'Menu selection received');
  
  let selection = null;
  
  // Handle DTMF input
  if (evt.dtmf) {
    selection = evt.dtmf;
  }
  // Handle speech input
  else if (evt.speech && evt.speech.alternatives && evt.speech.alternatives[0]) {
    const transcript = evt.speech.alternatives[0].transcript.toLowerCase();
    logger.info(`Speech transcript: ${transcript}`);
    
    // Map speech to menu options
    if (transcript.includes('one') || transcript.includes('information') || transcript.includes('services')) {
      selection = '1';
    } else if (transcript.includes('two') || transcript.includes('agent') || transcript.includes('speak')) {
      selection = '2';
    } else if (transcript.includes('three') || transcript.includes('message') || transcript.includes('leave')) {
      selection = '3';
    } else if (transcript.includes('zero') || transcript.includes('repeat') || transcript.includes('options')) {
      selection = '0';
    }
  }
  
  // Handle timeout
  if (evt.reason === 'timeout') {
    session
      .say({
        text: `<speak>
          I didn't hear a selection. 
          <break time="300ms"/>
          Let me repeat the options for you.
        </speak>`,
        ...ttsConfig
      })
      .gather({
        say: {
          text: getMenuText(),
          ...ttsConfig
        },
        input: ['speech', 'dtmf'],
        actionHook: '/menu',
        timeout: 10,
        numDigits: 1
      })
      .reply();
    return;
  }
  
  // Process selection
  switch (selection) {
    case '1':
      handleInformation(session, ttsConfig);
      break;
    case '2':
      handleAIAgent(session, ttsConfig);
      break;
    case '3':
      handleVoicemail(session, ttsConfig);
      break;
    case '0':
      handleRepeat(session, ttsConfig);
      break;
    default:
      handleInvalid(session, ttsConfig);
  }
}

// Handle information request
function handleInformation(session, ttsConfig) {
  session
    .say({
      text: `<speak>
        <prosody rate="medium">
          Our AI-powered voice system offers several advanced features:
          <break time="500ms"/>
          <emphasis level="moderate">Natural language processing</emphasis> 
          for understanding caller intent,
          <break time="300ms"/>
          <emphasis level="moderate">Multi-language support</emphasis> 
          with over 40 languages and dialects,
          <break time="300ms"/>
          <emphasis level="moderate">Real-time transcription</emphasis> 
          and sentiment analysis,
          <break time="300ms"/>
          and <emphasis level="moderate">seamless integration</emphasis> 
          with your existing telephony infrastructure.
          <break time="500ms"/>
          This system is powered by Jambonz, the open-source voice gateway for conversational AI.
          <break time="1s"/>
          Thank you for exploring our capabilities. Have a wonderful day!
        </prosody>
      </speak>`,
      ...ttsConfig
    })
    .pause({length: 1})
    .hangup()
    .send();
}

// Handle AI agent request
function handleAIAgent(session, ttsConfig) {
  const {logger} = session.locals;
  logger.info('Transferring to AI conversation handler');
  
  session
    .say({
      text: `<speak>
        <prosody rate="medium">
          Excellent choice! 
          <break time="300ms"/>
          I'm connecting you with our advanced conversational AI agent.
          <break time="300ms"/>
          You can have a natural conversation about any topic.
          <break time="500ms"/>
          Connecting now...
        </prosody>
      </speak>`,
      ...ttsConfig
    })
    .pause({length: 0.5})
    .redirect({
      actionHook: '/conversation'
    })
    .send();
}

// Handle voicemail request
function handleVoicemail(session, ttsConfig) {
  session
    .say({
      text: `<speak>
        <prosody rate="medium">
          Please leave your message after the tone.
          <break time="300ms"/>
          When you're finished, you can hang up or press pound.
        </prosody>
      </speak>`,
      ...ttsConfig
    })
    .play({url: 'https://cdn.freesound.org/previews/316/316934_5123451-lq.mp3'})
    .startRecording({
      recordingStatusCallback: '/recording-status',
      timeout: 60,
      finishOnKey: '#'
    })
    .send();
}

// Handle repeat request
function handleRepeat(session, ttsConfig) {
  session
    .say({
      text: `<speak>
        <prosody rate="medium">
          Of course! Let me repeat the menu options for you.
        </prosody>
      </speak>`,
      ...ttsConfig
    })
    .gather({
      say: {
        text: getMenuText(),
        ...ttsConfig
      },
      input: ['speech', 'dtmf'],
      actionHook: '/menu',
      timeout: 10,
      numDigits: 1
    })
    .reply();
}

// Handle invalid selection
function handleInvalid(session, ttsConfig) {
  session
    .say({
      text: `<speak>
        <prosody rate="medium">
          I'm sorry, I didn't understand that selection.
          <break time="300ms"/>
          Let me repeat the available options.
        </prosody>
      </speak>`,
      ...ttsConfig
    })
    .gather({
      say: {
        text: getMenuText(),
        ...ttsConfig
      },
      input: ['speech', 'dtmf'],
      actionHook: '/menu',
      timeout: 10,
      numDigits: 1
    })
    .reply();
}

// Handle session close
function onClose(session, code, reason) {
  const {logger} = session.locals;
  logger.info({code, reason}, `Session ${session.call_sid} closed`);
}

// Handle session error
function onError(session, err) {
  const {logger} = session.locals;
  logger.error({err}, `Session ${session.call_sid} error`);
}