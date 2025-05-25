import { McpConfig, UpstreamConfig } from '@/config/config.types';
import { McpOperation, McpRequestContext, ClientMcpResponse, StreamOptions } from '@/types/mcp.types'; // Added StreamOptions
import { openApiParser } from '@/features/endpoint-definition/OpenApiParser';
import { customRouteManager } from '@/features/endpoint-definition/CustomRouteManager';
import { inputValidator } from '@/features/validation/InputValidator';
import { upstreamRequestHandler } from '@/features/upstream-handler/UpstreamRequestHandler';
import { protocolConverter } from '@/features/protocol-conversion/ProtocolConverter';
import { logger } from '@/core/logger';
import { NotFoundError, BadRequestError, ValidationError, ConfigurationError, HttpError } from '@/core/errors'; // Added HttpError
import { configManager } from '@/config/ConfigManager';
import { sseConnectionManager } from '@/core/SseConnectionManager'; // For sending errors if piping fails early

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

  // New method for SSE streaming
  public async processRequestAndPipeToSse(context: McpRequestContext, sseCorrelationId: string): Promise<void> {
    const { requestId, serviceId, operationId, payload } = context;
    logger.info(`[${requestId}] Initiating SSE piping for service "${serviceId}", operation "${operationId}", correlationId "${sseCorrelationId}"`);

    const operation = this.getOperation(operationId);
    if (!operation) {
      const msg = `Operation "${operationId}" not found in service "${serviceId}" for SSE piping.`;
      logger.warn(`[${requestId}] ${msg}`);
      sseConnectionManager.sendToConnection(sseCorrelationId, 'mcp_error', { error: { code: 'OPERATION_NOT_FOUND', message: msg } });
      sseConnectionManager.closeConnection(sseCorrelationId); // Close SSE as operation is invalid
      throw new NotFoundError(msg); // This error is for the POST handler's catch block
    }

    // Input Validation
    if (operation.inputSchema) {
      logger.debug(`[${requestId}] Validating input for SSE operation ${operation.operationId}`);
      const validationResult = inputValidator.validate(operation.inputSchema, payload);
      if (!validationResult.valid) {
        const msg = 'Input validation failed for SSE streaming request.';
        logger.warn(`[${requestId}] ${msg}`, validationResult.errors);
        sseConnectionManager.sendToConnection(sseCorrelationId, 'mcp_error', { error: { code: 'VALIDATION_ERROR', message: msg, details: validationResult.errors } });
        sseConnectionManager.closeConnection(sseCorrelationId);
        throw new ValidationError(msg, validationResult.errors);
      }
      logger.debug(`[${requestId}] Input validation successful for SSE operation ${operation.operationId}`);
    }

    // Ensure payload indicates streaming if the upstream API requires it (e.g. OpenAI)
    // This logic might be better placed in the UpstreamRequestHandler or be more generic.
    // For now, assuming the payload is already correctly formatted for streaming by the client.
    // Example: if (operationId === "generateText" && payload.model === "gpt-...") payload.stream = true;


    try {
      // This new method in upstreamRequestHandler will handle the actual streaming to SSE
      await upstreamRequestHandler.handleRequestAndPipeToSse(
        context,
        operation,
        this.upstreamConfig,
        sseCorrelationId,
      );
      // If successful, handleRequestAndPipeToSse would have sent all data and potentially an 'end' event.
      // It might also close the SSE connection via sseConnectionManager, or leave it to the client.
      logger.info(`[${requestId}] Upstream request and SSE piping initiated successfully for ${operationId}, correlationId ${sseCorrelationId}.`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      let errorCode = 'UPSTREAM_REQUEST_FAILED';
      let errorMessage = `Error during upstream request or SSE piping for ${operationId}: ${err.message}`;
      
      if (error instanceof HttpError) {
          errorCode = error.code || `HTTP_${error.statusCode}`;
          errorMessage = err.message;
      } else if (error instanceof ConfigurationError || error instanceof ValidationError) {
          errorCode = error.name; // e.g. 'ConfigurationError'
      }

      logger.error(`[${requestId}] ${errorMessage}`, err);
      
      // Send error over SSE
      sseConnectionManager.sendToConnection(sseCorrelationId, 'mcp_error', { 
        error: { 
          code: errorCode, 
          message: errorMessage,
          details: (error instanceof HttpError && error.details) ? error.details : undefined
        } 
      });
      // Close the SSE connection on error because the stream cannot proceed.
      sseConnectionManager.closeConnection(sseCorrelationId);
      
      // Re-throw the error so the calling handler (StreamableHttpHandler) knows initiation failed.
      throw error; 
    }
  }
}