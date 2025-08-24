require('dotenv').config();
const {createServer} = require('http');
const {createEndpoint} = require('@jambonz/node-client-ws');
const pino = require('pino');

// Initialize logger
const logger = pino({
  level: process.env.LOGLEVEL || 'info'
});

// Create HTTP server
const server = createServer();
const port = process.env.WS_PORT || 3003;

// Create Jambonz WebSocket endpoint
const makeService = createEndpoint({server});

// Load route handlers
require('./lib/routes')({logger, makeService});

// Start server
server.listen(port, () => {
  logger.info(`Jambonz AI Voice WebSocket server listening on port ${port}`);
  logger.info(`TTS Provider: ${process.env.TTS_PROVIDER || 'google'}`);
});