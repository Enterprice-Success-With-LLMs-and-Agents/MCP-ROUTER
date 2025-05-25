import { FastifyReply, FastifyRequest } from 'fastify';
import { requestRouter } from '@/features/request-routing/RequestRouter';
import { McpRequestContext, ClientMcpRequest, ClientMcpResponse } from '@/types/mcp.types';
import { HttpError, NotFoundError, BadRequestError } from '@/core/errors';
import { logger } from '@/core/logger';
import { randomUUID } from 'crypto';

// This handler assumes MCP messages are sent as newline-delimited JSON (NDJSON)
// in both request and response bodies for streaming.
// Production systems might use a more robust framing protocol (e.g., length-prefixing).

export async function handleStreamableHttpRequest(request: FastifyRequest, reply: FastifyReply) {
  const serviceId = (request.params as { serviceId?: string }).serviceId;
  const clientRequestId = request.headers['x-request-id'] as string || randomUUID(); // For the overall stream

  if (request.method !== 'POST') {
    reply.code(405).send({ error: 'Method Not Allowed. Use POST for streamable HTTP.' });
    return;
  }
  
  if (!serviceId) {
    // Similar to SSE, generic /mcp/ would require in-band service routing.
    logger.error(`[${clientRequestId}] Streamable HTTP request to generic /mcp/ endpoint. Service ID must be in path.`);
    reply.code(400).send({ error: 'Service ID must be specified in the path (/api/{serviceId}/mcp/).' });
    return;
  }

  const mcpService = requestRouter.getService(serviceId);
  if (!mcpService) {
    logger.warn(`[${clientRequestId}] Streamable HTTP attempt for unknown service: ${serviceId}`);
    reply.code(404).send({ error: `Service ${serviceId} not found.` });
    return;
  }

  // Handle single-message JSON request
  const contentType = ((request.headers['content-type'] as string) || '').split(';')[0].trim();
  if (contentType === 'application/json') {
    // Parse incoming request
    let clientMcpRequest: ClientMcpRequest;
    try {
      clientMcpRequest = request.body as ClientMcpRequest;
    } catch (parseErr) {
      reply.code(400).send({ success: false, error: { code: 'INVALID_JSON', message: 'Invalid JSON message received' } });
      return;
    }
    const { operation_id, payload } = clientMcpRequest;
    if (!operation_id) {
      reply.code(400).send({ success: false, error: { code: 'BAD_REQUEST', message: 'Missing operation_id' } });
      return;
    }
    // Process request
    const context: McpRequestContext = { serviceId, operationId: operation_id, payload, clientIp: request.ip, requestId: clientRequestId };
    try {
      const mcpResp = await mcpService.processRequest(context);
      reply.send(mcpResp);
    } catch (err) {
      if (err instanceof HttpError) {
        reply.code(err.statusCode).send({ success: false, error: { code: err.code || `HTTP_${err.statusCode}`, message: err.message, details: err.details } });
      } else {
        reply.code(500).send({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: err instanceof Error ? err.message : 'Internal server error' } });
      }
    }
    return;
  }

  // Handle NDJSON streaming requests
  if (contentType === 'application/x-ndjson') {
    logger.info(`[${clientRequestId}] Streamable HTTP connection established for service: ${serviceId}, client: ${request.ip}`);
    const stream = request.body as NodeJS.ReadableStream;
    // Set headers for streaming response
    reply.raw.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Transfer-Encoding': 'chunked',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    let buffer = '';
    stream.on('data', async (chunk: Buffer) => {
      buffer += chunk.toString('utf-8');
      let boundary: number;
      while ((boundary = buffer.indexOf('\n')) !== -1) {
        const messageStr = buffer.substring(0, boundary).trim();
        buffer = buffer.substring(boundary + 1);
        if (!messageStr) continue;
        const operationRequestId = randomUUID();
        let clientMcpRequest: ClientMcpRequest;
        try {
          clientMcpRequest = JSON.parse(messageStr);
        } catch (parseErr) {
          logger.warn(`[${clientRequestId}] Failed to parse JSON on stream for ${serviceId}: "${messageStr}"`, parseErr);
          const errorResp: ClientMcpResponse = { success: false, error: { code: 'INVALID_JSON', message: 'Invalid JSON message received' } };
          if (!reply.raw.writableEnded) reply.raw.write(JSON.stringify(errorResp) + '\n');
          continue;
        }
        const { operation_id, payload } = clientMcpRequest;
        if (!operation_id) {
          const errorResp: ClientMcpResponse = { success: false, error: { code: 'BAD_REQUEST', message: 'Missing operation_id' } };
          if (!reply.raw.writableEnded) reply.raw.write(JSON.stringify(errorResp) + '\n');
          continue;
        }
        const context: McpRequestContext = { serviceId, operationId: operation_id, payload, clientIp: request.ip, requestId: operationRequestId };
        try {
          const mcpResp = await mcpService.processRequest(context);
          if (!reply.raw.writableEnded) reply.raw.write(JSON.stringify(mcpResp) + '\n');
        } catch (err) {
          let errorCode = 'INTERNAL_SERVER_ERROR';
          let errorMessage = err instanceof Error ? err.message : 'Internal server error';
          let statusCode: number;
          let errorDetails: any;
          if (err instanceof HttpError) {
            statusCode = err.statusCode;
            errorCode = err.code || `HTTP_${statusCode}`;
            errorMessage = err.message;
            errorDetails = err.details;
          }
          logger.error(`[${operationRequestId}] Error processing streamable HTTP request for ${serviceId}/${operation_id}: ${errorMessage}`, err);
          const errorResp: ClientMcpResponse = { success: false, error: { code: errorCode, message: errorMessage, details: errorDetails } };
          if (!reply.raw.writableEnded) reply.raw.write(JSON.stringify(errorResp) + '\n');
        }
      }
    });
    stream.on('end', async () => {
      logger.info(`[${clientRequestId}] Streamable HTTP request body ended for service: ${serviceId}`);
      if (buffer.trim()) {
        try {
          const finalReq: ClientMcpRequest = JSON.parse(buffer.trim());
          logger.info(`[${clientRequestId}] Processing final message for ${serviceId}: op=${finalReq.operation_id}`);
          const finalCtx: McpRequestContext = { serviceId, operationId: finalReq.operation_id, payload: finalReq.payload, clientIp: request.ip, requestId: randomUUID() };
          const finalResp = await mcpService.processRequest(finalCtx);
          if (!reply.raw.writableEnded) reply.raw.write(JSON.stringify(finalResp) + '\n');
        } catch (err) {
          logger.warn(`[${clientRequestId}] Failed to parse final message: "${buffer.trim()}"`, err);
        }
      }
      reply.raw.end();
    });
    stream.on('error', (err: Error) => {
      logger.error(`[${clientRequestId}] Streamable HTTP request error for service ${serviceId}:`, err);
      if (!reply.raw.writableEnded) reply.raw.end();
    });
    reply.raw.on('close', () => {
      logger.info(`[${clientRequestId}] Streamable HTTP response stream closed by client for service ${serviceId}.`);
      // Destroy the response socket to free resources
      const respSocket = reply.raw.socket;
      if (respSocket && typeof (respSocket as any).destroy === 'function') {
        (respSocket as any).destroy();
      }
    });
    return;
  }
  // Unsupported media type
  reply.code(415).send({ success: false, error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: `Unsupported media type: ${contentType}` } });
}