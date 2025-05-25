import fastify, { FastifyInstance, FastifyServerOptions, FastifyRequest, FastifyReply } from 'fastify';
import sensible from '@fastify/sensible'; // For error handling utilities
import { configManager } from '@/config/ConfigManager';
import { logger, updateLogger } from '@/core/logger';
import { requestRouter } from '@/features/request-routing/RequestRouter';
import { handleSseConnection } from '@/features/transport/SseHandler';
import { handleStreamableHttpRequest } from '@/features/transport/StreamableHttpHandler';
import { HttpError } from './errors';
import { ClientMcpResponse } from '@/types/mcp.types';
import { randomUUID } from 'crypto';

export class McpServer {
  public app: FastifyInstance;
  private readonly host: string;
  private readonly port: number;

  constructor() {
    this.host = configManager.config.server.host;
    this.port = configManager.config.server.port;

    const fastifyOptions: FastifyServerOptions = {
      logger: false, // We use our custom logger
      requestIdHeader: 'x-request-id',
      genReqId: (req) => {
        const reqId = req.headers['x-request-id'];
        return Array.isArray(reqId) ? reqId[0] : (reqId || randomUUID());
      },
    };
    this.app = fastify(fastifyOptions);
    this.registerPlugins();
    this.registerMiddleware();
    this.registerRoutes();
    this.registerErrorHandlers();
  }

  private registerPlugins() {
    this.app.register(sensible); // Provides request.sensible, reply.sensible, httpErrors
    // Override NDJSON parser to provide raw HTTP stream for streaming
    this.app.addContentTypeParser('application/x-ndjson', { parseAs: 'buffer' }, (req, payload, done) => done(null, req.raw));
    // Add other plugins like rate limiting, CORS, helmet for production
    // this.app.register(import('@fastify/cors'), { origin: '*' }); // Example
  }

  private registerMiddleware() {
    // Add request logging middleware
    this.app.addHook('onRequest', (request, reply, done) => {
      const start = Date.now();
      const requestId = request.id;
      const { method, url, ip } = request;
      
      logger.info({
        requestId,
        event: 'request_start',
        method,
        url,
        ip,
        timestamp: new Date().toISOString()
      }, `[${requestId}] ${method} ${url} - Request received from ${ip}`);
      
      // Using the correct hook method for Fastify
      request.raw.on('end', () => {
        const duration = Date.now() - start;
        const statusCode = reply.statusCode;
        
        logger.info({
          requestId,
          event: 'request_complete',
          method,
          url,
          statusCode,
          duration,
          timestamp: new Date().toISOString()
        }, `[${requestId}] ${method} ${url} - Response ${statusCode} sent in ${duration}ms`);
      });
      
      done();
    });
  }

  private registerRoutes() {
    this.app.get('/', async () => ({ status: 'MCP Access Point is running' }));
    this.app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

    // Service-specific SSE endpoint
    this.app.get('/api/:serviceId/sse', handleSseConnection);
    this.app.get('/api/:serviceId/sse/', handleSseConnection); // With trailing slash

    // Service-specific Streamable HTTP endpoint
    this.app.post('/api/:serviceId/mcp', handleStreamableHttpRequest);
    this.app.post('/api/:serviceId/mcp/', handleStreamableHttpRequest);

    // Generic endpoints (if ever needed, would require in-band service routing)
    // this.app.get('/sse', handleGenericSse);
    // this.app.post('/mcp', handleGenericStreamableHttp);

    // Potentially an endpoint to expose loaded OpenAPI specs for introspection
    // this.app.get('/api/:serviceId/openapi.json', async (request, reply) => { ... });
  }

  private registerErrorHandlers() {
    this.app.setErrorHandler((error, request, reply) => {
      const requestId = request.id;
      if (error instanceof HttpError) {
        logger.warn({
          requestId,
          event: 'http_error',
          statusCode: error.statusCode,
          method: request.method,
          url: request.url,
          errorCode: error.code || `HTTP_${error.statusCode}`,
          errorMessage: error.message,
          errorDetails: error.details || '',
          timestamp: new Date().toISOString()
        }, `[${requestId}] HTTP Error ${error.statusCode} for ${request.method} ${request.url}: ${error.message}`);
        
        const mcpErrorResponse: ClientMcpResponse = {
          success: false,
          error: {
            code: error.code || `HTTP_${error.statusCode}`,
            message: error.message,
            details: error.details,
          },
        };
        // For SSE/Streamable HTTP, errors are handled within their handlers.
        // This global handler is more for standard HTTP error responses.
        // If the connection is already an event stream, this won't apply correctly.
        if (!reply.sent && !reply.raw.headersSent) {
             reply.status(error.statusCode).send(mcpErrorResponse);
        } else {
            logger.warn(`[${requestId}] Error handler invoked but reply already sent/headersSent for ${request.url}`);
        }
      } else {
        logger.error({
          requestId,
          event: 'server_error',
          method: request.method,
          url: request.url,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          timestamp: new Date().toISOString()
        }, `[${requestId}] Unhandled error for ${request.method} ${request.url}:`);
        
        const mcpErrorResponse: ClientMcpResponse = {
          success: false,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'An unexpected internal server error occurred.',
          },
        };
         if (!reply.sent && !reply.raw.headersSent) {
            reply.status(500).send(mcpErrorResponse);
        } else {
             logger.warn(`[${requestId}] Unhandled error, but reply already sent/headersSent for ${request.url}`);
        }
      }
    });

    this.app.setNotFoundHandler((request, reply) => {
        const requestId = request.id;
        logger.warn({
          requestId,
          event: 'route_not_found',
          method: request.method,
          url: request.url,
          timestamp: new Date().toISOString()
        }, `[${requestId}] Route not found: ${request.method} ${request.url}`);
        
        const mcpErrorResponse: ClientMcpResponse = {
            success: false,
            error: { code: 'ROUTE_NOT_FOUND', message: `Route ${request.method} ${request.url} not found.`}
        };
        reply.status(404).send(mcpErrorResponse);
    });
  }

  public async start(): Promise<void> {
    try {
      // Initialize router (which initializes services and parsers)
      await requestRouter.initialize();
      
      // Update logger in case config changed its level
      updateLogger(); 

      await this.app.listen({ port: this.port, host: this.host });
      logger.info(`MCP Access Point server listening on http://${this.host}:${this.port}`);
    } catch (err) {
      logger.fatal('Failed to start server:', err);
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    logger.info('Stopping MCP Access Point server...');
    await this.app.close();
    logger.info('Server stopped.');
  }
} 