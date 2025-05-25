// Ensure config is loaded first, as logger might depend on it
import { configManager } from './config/ConfigManager'; // This initializes config
import { logger, logFile } from './core/logger'; // Now logger can use configured level
import { McpServer } from './core/McpServer';
import fs from 'fs';
import path from 'path';

async function bootstrap() {
  try {
    logger.info(`Starting MCP Access Point in ${process.env.NODE_ENV || 'development'} mode...`);
    logger.info(`Using configuration file: ${process.env.CONFIG_FILE || 'config.yaml'}`);
    logger.info(`Log file: ${logFile}`);
    logger.info(`Using configuration: ${JSON.stringify(configManager.config, null, 2)}`);

    const server = new McpServer();
    await server.start();

    // Log successful startup
    logger.info(`MCP Access Point successfully started and listening at http://${configManager.config.server.host}:${configManager.config.server.port}`);
    logger.info(`Available services: ${Object.keys(configManager.config.mcps.map(mcp => mcp.id)).join(', ')}`);

    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
    signals.forEach((signal) => {
      process.on(signal, async () => {
        logger.info(`Received ${signal}. Shutting down gracefully...`);
        await server.stop();
        process.exit(0);
      });
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.fatal('Unhandled Rejection at:', promise, 'reason:', reason);
      // Log to a separate error file as well
      logErrorToFile('unhandledRejection', reason);
      // Optionally, trigger a graceful shutdown
      // server.stop().finally(() => process.exit(1));
    });

    process.on('uncaughtException', (error) => {
      logger.fatal('Uncaught Exception:', error);
      // Log to a separate error file as well
      logErrorToFile('uncaughtException', error);
      // Optionally, trigger a graceful shutdown
      // server.stop().finally(() => process.exit(1));
    });
  } catch (error) {
    logger.fatal('Failed to start MCP Access Point:', error);
    logErrorToFile('bootstrap', error);
    throw error;
  }
}

/**
 * Log detailed error information to a separate error log file
 */
function logErrorToFile(type: string, error: any) {
  try {
    const logsDir = path.join(process.cwd(), 'logs');
    const errorLogPath = path.join(logsDir, `mcp-error-${new Date().toISOString().split('T')[0]}.log`);
    
    const timestamp = new Date().toISOString();
    const errorMessage = error instanceof Error 
      ? `${error.message}\n${error.stack}` 
      : JSON.stringify(error, null, 2);
    
    const logEntry = `[${timestamp}] ${type}: ${errorMessage}\n\n`;
    
    fs.appendFileSync(errorLogPath, logEntry);
    console.error(`Error logged to ${errorLogPath}`);
  } catch (logError) {
    console.error('Failed to write error to log file:', logError);
  }
}

bootstrap().catch((error) => {
  logger.fatal('Failed to bootstrap application:', error);
  logErrorToFile('bootstrap', error);
  process.exit(1);
}); 