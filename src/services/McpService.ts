import { McpConfig, UpstreamConfig } from '@/config/config.types';
import { McpOperation, McpRequestContext, ClientMcpResponse } from '@/types/mcp.types';
import { openApiParser } from '@/features/endpoint-definition/OpenApiParser';
import { customRouteManager } from '@/features/endpoint-definition/CustomRouteManager';
import { inputValidator } from '@/features/validation/InputValidator';
import { upstreamRequestHandler } from '@/features/upstream-handler/UpstreamRequestHandler';
import { protocolConverter } from '@/features/protocol-conversion/ProtocolConverter';
import { logger } from '@/core/logger';
import { NotFoundError, BadRequestError, ValidationError, ConfigurationError } from '@/core/errors';
import { configManager } from '@/config/ConfigManager';

export class McpService {
  private operations: Map<string, McpOperation> = new Map(); // operation_id -> McpOperation
  private upstreamConfig: UpstreamConfig;

  constructor(public readonly serviceConfig: McpConfig) {
    const upstream = configManager.getUpstream(serviceConfig.upstream_id);
    if (!upstream) {
      throw new ConfigurationError(
        `Upstream_id "${serviceConfig.upstream_id}" not found for MCP service "${serviceConfig.id}"`,
      );
    }
    this.upstreamConfig = upstream;
  }

  public async initialize(): Promise<void> {
    logger.info(`Initializing MCP Service: ${this.serviceConfig.id}`);
    let parsedOperations: McpOperation[] = [];

    if (this.serviceConfig.path) {
      try {
        parsedOperations = await openApiParser.parse(this.serviceConfig.path);
      } catch (error) {
        logger.error(`Failed to initialize OpenAPI for service ${this.serviceConfig.id}: ${(error as Error).message}`);
        // Depending on policy, either throw or continue with custom routes only
        // For now, we throw if essential path parsing fails.
        throw error;
      }
    }

    const customOperations = customRouteManager.transform(this.serviceConfig);
    
    // Merge and register operations. Custom routes can override OpenAPI ones if operation_ids match.
    [...parsedOperations, ...customOperations].forEach(op => {
      if (this.operations.has(op.operationId)) {
          logger.warn(`Overriding operation "${op.operationId}" for service "${this.serviceConfig.id}" (likely custom route overriding OpenAPI)`);
      }
      this.operations.set(op.operationId, op);
      logger.debug(`Registered operation: ${op.operationId} (ID: ${op.id}) for service ${this.serviceConfig.id}`);
    });

    if (this.operations.size === 0) {
        logger.warn(`No operations loaded for MCP service: ${this.serviceConfig.id}. This service will not be able to process requests.`);
    } else {
        logger.info(`MCP Service ${this.serviceConfig.id} initialized with ${this.operations.size} operations.`);
    }
  }

  public getOperation(operationId: string): McpOperation | undefined {
    return this.operations.get(operationId);
  }

  public async processRequest(context: McpRequestContext): Promise<ClientMcpResponse> {
    logger.info(`[${context.requestId}] Processing request for service "${context.serviceId}", operation "${context.operationId}"`);

    const operation = this.getOperation(context.operationId);
    if (!operation) {
      logger.warn(`[${context.requestId}] Operation not found: ${context.operationId} for service ${context.serviceId}`);
      throw new NotFoundError(`Operation "${context.operationId}" not found in service "${context.serviceId}"`);
    }

    // 1. Input Validation (if schema exists)
    if (operation.inputSchema) {
      logger.debug(`[${context.requestId}] Validating input for operation ${operation.operationId}`);
      const validationResult = inputValidator.validate(operation.inputSchema, context.payload);
      if (!validationResult.valid) {
        logger.warn(`[${context.requestId}] Input validation failed for ${operation.operationId}:`, validationResult.errors);
        throw new ValidationError('Input validation failed', validationResult.errors);
      }
      logger.debug(`[${context.requestId}] Input validation successful for ${operation.operationId}`);
    }

    // 2. Forward to Upstream
    try {
      const upstreamResponse = await upstreamRequestHandler.handleRequest(
        context,
        operation,
        this.upstreamConfig,
      );
      
      // 3. Convert Upstream Response to MCP Response
      return protocolConverter.httpToMcpResponse(upstreamResponse);
    } catch (error) {
        // Errors like UpstreamServiceError, ConfigurationError might be thrown from upstreamRequestHandler
        // Re-throw them to be caught by the server's error handler
        logger.error(`[${context.requestId}] Error during upstream request or protocol conversion for ${operation.operationId}: ${(error as Error).message}`);
        throw error;
    }
  }
} 