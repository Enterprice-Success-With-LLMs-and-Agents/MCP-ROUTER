import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { configManager } from '@/config/ConfigManager'; // Import after it's potentially initialized

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Log file path
const logFilePath = path.join(logsDir, `mcp-access-point-${new Date().toISOString().split('T')[0]}.log`);

// Initialize with default logger first
let currentLogger: pino.Logger = pino({
  level: 'info',
  transport: process.env.NODE_ENV !== 'production' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  } : undefined
});

function initializeLogger() {
  const logLevel = configManager?.config?.server?.logger?.level || 'info';
  
  // Create file transport
  const fileTransport = pino.transport({
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
            level: logLevel
          }
        : {
            target: 'pino/file',
            options: { destination: 1 }, // stdout
            level: logLevel
          },
      // File output (always)
      {
        target: 'pino/file',
        options: { destination: logFilePath },
        level: logLevel
      }
    ]
  });

  currentLogger = pino({
    level: logLevel,
  }, fileTransport);
  
  currentLogger.info(`Logger initialized. Log file: ${logFilePath}`);
}

// Initialize logger early, but it will use default level until config is fully loaded.
// ConfigManager constructor will re-log its messages with the correct level if it changes.
if (configManager?.config) {
  initializeLogger();
}

export const logger = new Proxy({} as pino.Logger, {
  get: (_, prop) => {
    return Reflect.get(currentLogger, prop);
  }
});

// Function to update logger if config changes (e.g., hot reload)
export function updateLogger() {
    initializeLogger();
    logger.info('Logger configuration updated.');
}

// Export the log file path for reference
export const logFile = logFilePath; 