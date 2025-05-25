const pino = require('pino');
const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Log file path
const logFilePath = path.join(logsDir, `ai-playground-client-${new Date().toISOString().split('T')[0]}.log`);

// Create file transport
const transport = pino.transport({
  targets: [
    // Console output with pretty printing in development
    process.env.NODE_ENV !== 'production' 
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
          level: 'info'
        }
      : {
          target: 'pino/file',
          options: { destination: 1 }, // stdout
          level: 'info'
        },
    // File output (always)
    {
      target: 'pino/file',
      options: { destination: logFilePath },
      level: 'info'
    }
  ]
});

// Create logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
}, transport);

logger.info(`AI Playground Client logger initialized. Log file: ${logFilePath}`);

module.exports = logger; 