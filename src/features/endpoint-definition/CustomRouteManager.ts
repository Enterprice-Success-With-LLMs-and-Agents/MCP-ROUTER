import { McpConfig, RouteConfig } from '@/config/config.types';
import { McpOperation } from '@/types/mcp.types';
import { logger } from '@/core/logger';

export class CustomRouteManager {
  public transform(mcpServiceConfig: McpConfig): McpOperation[] {
    if (!mcpServiceConfig.routes || mcpServiceConfig.routes.length === 0) {
      return [];
    }

    const operations: McpOperation[] = mcpServiceConfig.routes.map((route: RouteConfig) => {
      logger.debug(`Transforming custom route: ${route.id} for service ${mcpServiceConfig.id}`);
      return {
        id: route.id,
        operationId: route.operation_id,
        upstreamUriTemplate: route.uri,
        upstreamMethod: route.method,
        inputSchema: route.meta?.inputSchema,
      };
    });
    logger.info(`Transformed ${operations.length} custom routes for service ${mcpServiceConfig.id}.`);
    return operations;
  }
}

export const customRouteManager = new CustomRouteManager(); 