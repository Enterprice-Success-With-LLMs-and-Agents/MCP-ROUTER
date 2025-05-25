import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { AppConfig } from './config.types';
import { configSchema } from './config.schema';
import { ZodError } from 'zod';
import { logger } from '@/core/logger';

export class ConfigManager {
  private static instance: ConfigManager;
  public readonly config: AppConfig;

  private constructor(configPath: string) {
    try {
      const absolutePath = path.resolve(configPath);
      logger.info(`Loading configuration from: ${absolutePath}`);
      if (!fs.existsSync(absolutePath)) {
        throw new Error(`Configuration file not found at ${absolutePath}`);
      }
      // Load and interpolate environment variable placeholders in config
      let fileContents = fs.readFileSync(absolutePath, 'utf8');
      fileContents = fileContents.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] || '');
      const rawConfig = yaml.load(fileContents);
      this.config = configSchema.parse(rawConfig);
      logger.info('Configuration loaded and validated successfully.');
      // Production: Implement hot-reloading or watch mechanism if needed
    } catch (error) {
      if (error instanceof ZodError) {
        logger.error('Configuration validation error:', error.errors);
      } else if (error instanceof Error) {
        logger.error(`Error loading configuration: ${error.message}`);
      } else {
        logger.error('Unknown error loading configuration:', error);
      }
      process.exit(1); // Critical error, cannot proceed
    }
  }

  public static getInstance(configPath?: string): ConfigManager {
    if (!ConfigManager.instance) {
      const confPath = configPath || process.env.CONFIG_PATH || './config.yaml';
      ConfigManager.instance = new ConfigManager(confPath);
    }
    return ConfigManager.instance;
  }

  public getMcpService(serviceId: string) {
    return this.config.mcps.find(mcp => mcp.id === serviceId);
  }

  public getUpstream(upstreamId: string) {
    return this.config.upstreams.find(up => up.id === upstreamId);
  }
}

// Initialize and export a singleton instance
export const configManager = ConfigManager.getInstance(); 