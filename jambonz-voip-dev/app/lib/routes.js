module.exports = ({logger, makeService}) => {
  // Load AI greeting handler
  // require('./ai-greeting')({logger, makeService});
  
  // Load conversation handler (for future expansion)
  // require('./conversation')({logger, makeService});
  
  // Hello world endpoint for testing
  const helloWorldService = makeService({path: '/hello-world'});
  helloWorldService.on('session:new', (session) => {
    logger.info('Hello world call received!');
    session.say({
      text: 'Hello! This is working! Your Jambonz system is successfully routing calls.',
      synthesizer: {
        vendor: 'elevenlabs',
        voice: process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'
      }
    }).hangup().send();
  });

  // Dial time endpoint
  const dialTimeService = makeService({path: '/dial-time'});
  dialTimeService.on('session:new', (session) => {
    logger.info('Dial time call received!');
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { 
      timeZone: 'America/New_York',
      hour12: true 
    });
    session.say({
      text: `The current time is ${timeString}`,
      synthesizer: {
        vendor: 'google',
        voice: 'en-US-Standard-C'
      }
    }).hangup().send();
  });

  // Call status endpoint (for status webhooks)
  const callStatusService = makeService({path: '/call-status'});
  callStatusService.on('session:new', (session) => {
    logger.info('Call status webhook received');
    session.say({text: 'Status received'}).hangup().send();
  });

  // Health check endpoint
  const healthService = makeService({path: '/health'});
  healthService.on('session:new', (session) => {
    logger.debug('Health check received');
    session.say({text: 'System is healthy'}).hangup().send();
  });
};