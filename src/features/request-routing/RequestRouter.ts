import { McpService } from '@/services/McpService';
import { configManager } from '@/config/ConfigManager';
import { logger } from '@/core/logger';
import { ConfigurationError, NotFoundError } from '@/core/errors';

export class RequestRouter {
  private services: Map<string, McpService> = new Map(); // service_id -> McpService instance

  public async initialize(): Promise<void> {
    logger.info('Initializing Request Router...');
    const mcpConfigs = configManager.config.mcps;

    if (!mcpConfigs || mcpConfigs.length === 0) {
      logger.warn('No MCP services (tenants) defined in configuration.');
      return;
    }

    for (const mcpConfig of mcpConfigs) {
      try {
        const service = new McpService(mcpConfig);
        await service.initialize(); // This loads OpenAPI/custom routes for the service
        this.services.set(mcpConfig.id, service);
        logger.info(`Request Router: Successfully initialized and registered service "${mcpConfig.id}"`);
      } catch (error) {
        logger.error(`Failed to initialize service "${mcpConfig.id}" for Request Router: ${(error as Error).message}`);
        // Depending on policy, you might want to stop the server or continue without this service.
        // For now, we'll log and continue, but this service will be unavailable.
        if (error instanceof ConfigurationError) {
            // If it's a config error specific to this service, we might let others load.
        } else {
            throw error; // Propagate if it's a more critical/unexpected error during init
        }
      }
    }
    logger.info('Request Router initialized.');
  }

  public getService(serviceId: string): McpService | undefined {
    const service = this.services.get(serviceId);
    if (!service) {
        logger.warn(`Attempted to route to unknown service: ${serviceId}`);
    }
    return service;
  }
}

export const requestRouter = new RequestRouter(); 