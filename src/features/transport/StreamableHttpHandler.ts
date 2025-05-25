import { FastifyReply, FastifyRequest } from 'fastify';
import { requestRouter } from '@/features/request-routing/RequestRouter';
import { McpRequestContext, ClientMcpRequest, ClientMcpResponse, StreamOptions } from '@/types/mcp.types'; // Added StreamOptions
import { HttpError, NotFoundError, BadRequestError } from '@/core/errors';
import { logger } from '@/core/logger';
import { randomUUID } from 'crypto';
import { sseConnectionManager } from '@/core/SseConnectionManager'; // Required for checking if SSE connection exists

// Extended ClientMcpRequest to include optional stream_options
interface ClientMcpRequestWithStreaming extends ClientMcpRequest {
  stream_options?: StreamOptions;
}

export async function handleStreamableHttpRequest(request: FastifyRequest, reply: FastifyReply) {
  const serviceId = (request.params as { serviceId?: string }).serviceId;
  const clientRequestId = request.id; // Fastify's request ID

  if (request.method !== 'POST') {
    reply.code(405).send({ error: 'Method Not Allowed. Use POST for streamable HTTP.' });
    return;
  }
  
  if (!serviceId) {
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

  const contentType = ((request.headers['content-type'] as string) || '').split(';')[0].trim();

  // Handle single-message JSON request (potentially for SSE initiation)
  if (contentType === 'application/json') {
    let clientMcpRequest: ClientMcpRequestWithStreaming;
    try {
      clientMcpRequest = request.body as ClientMcpRequestWithStreaming;
    } catch (parseErr) {
      logger.warn(`[${clientRequestId}] Invalid JSON received for service ${serviceId}:`, parseErr);
      reply.code(400).send({ success: false, error: { code: 'INVALID_JSON', message: 'Invalid JSON message received' } });
      return;
    }

    const { operation_id, payload, stream_options } = clientMcpRequest;

    if (!operation_id) {
      logger.warn(`[${clientRequestId}] Missing operation_id in JSON request for service ${serviceId}`);
      reply.code(400).send({ success: false, error: { code: 'BAD_REQUEST', message: 'Missing operation_id' } });
      return;
    }

    // Check for SSE streaming initiation
    if (stream_options && stream_options.stream_to_sse && stream_options.correlation_id) {
      const { correlation_id } = stream_options;
      logger.info(`[${clientRequestId}] SSE streaming initiation request for service ${serviceId}, operation ${operation_id}, correlationId: ${correlation_id}`);

      // Verify that the SSE connection actually exists
      if (!sseConnectionManager.getConnection(correlation_id)) {
        logger.warn(`[${clientRequestId}] SSE streaming initiation for non-existent SSE connection. CorrelationId: ${correlation_id}`);
        reply.code(400).send({
          success: false,
          error: {
            code: 'SSE_CONNECTION_NOT_FOUND',
            message: `SSE connection with correlationId ${correlation_id} not found or not active. Ensure SSE connection is established first.`,
          },
        });
        return;
      }
      
      const context: McpRequestContext = { serviceId, operationId: operation_id, payload, clientIp: request.ip, requestId: clientRequestId };
      
      // Asynchronously process and pipe to SSE. Do not await this.
      mcpService.processRequestAndPipeToSse(context, correlation_id)
        .then(() => {
          logger.info(`[${clientRequestId}] SSE streaming processing completed for ${correlation_id}`);
          // This is when the McpService has finished its part of piping.
          // The actual SSE stream might still be ongoing if the upstream is slow to produce all data.
          // SseConnectionManager will handle actual end of stream via events from McpService/UpstreamHandler
        })
        .catch(err => {
          // This catch is for errors in *initiating* the piping or synchronous errors in processRequestAndPipeToSse.
          // Errors during the actual streaming by upstream should be sent over SSE by McpService/UpstreamHandler.
          logger.error(`[${clientRequestId}] Error initiating SSE streaming for ${correlation_id}: ${(err as Error).message}`, err);
          // Attempt to send an error over SSE if the connection still exists
          sseConnectionManager.sendToConnection(correlation_id, 'mcp_error', {
            error: {
              code: 'STREAM_INITIATION_FAILED',
              message: `Failed to initiate stream: ${(err instanceof Error ? err.message : 'Unknown error')}`,
            },
          });
          // Optionally, close the SSE connection if initiation fails catastrophically
          // sseConnectionManager.closeConnection(correlation_id); // Or removeConnection
        });

      // Send immediate acknowledgement for the POST request
      reply.send({
        success: true,
        message: `Streaming initiated. Listening for events on SSE connection with correlation ID: ${correlation_id}`,
        correlation_id: correlation_id,
        service_id: serviceId,
        operation_id: operation_id
      });
      return;
    }

    // Standard JSON request (non-SSE streaming)
    const context: McpRequestContext = { serviceId, operationId: operation_id, payload, clientIp: request.ip, requestId: clientRequestId };
    try {
      const mcpResp = await mcpService.processRequest(context);
      reply.send(mcpResp);
    } catch (err) {
      const httpError = err instanceof HttpError ? err : new HttpError(500, 'Internal server error', 'INTERNAL_SERVER_ERROR', err instanceof Error ? err.message : undefined);
      logger.error(`[${clientRequestId}] Error processing standard JSON request for ${serviceId}/${operation_id}: ${httpError.message}`, err);
      reply.code(httpError.statusCode).send({ success: false, error: { code: httpError.code || `HTTP_${httpError.statusCode}`, message: httpError.message, details: httpError.details } });
    }
    return;
  }

  // Handle NDJSON streaming requests (remains unchanged for direct NDJSON-to-NDJSON streaming)
  if (contentType === 'application/x-ndjson') {
    logger.info(`[${clientRequestId}] NDJSON stream request for service: ${serviceId}, client: ${request.ip}`);
    const stream = request.body as NodeJS.ReadableStream; // request.raw can also be used if body parsing is disabled for this CT
    
    reply.raw.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Transfer-Encoding': 'chunked', // Necessary for streaming unknown length
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*', // Adjust as needed
    });

    let buffer = '';
    stream.on('data', async (chunk: Buffer) => {
      buffer += chunk.toString('utf-8');
      let boundary: number;
      while ((boundary = buffer.indexOf('\n')) !== -1) {
        const messageStr = buffer.substring(0, boundary).trim();
        buffer = buffer.substring(boundary + 1);
        if (!messageStr) continue;

        const operationRequestId = randomUUID(); // Unique ID for this specific operation within the stream
        let clientMcpRequest: ClientMcpRequestWithStreaming; // Using the extended type just in case, though stream_options unlikely here
        try {
          clientMcpRequest = JSON.parse(messageStr);
        } catch (parseErr) {
          logger.warn(`[${clientRequestId}] Failed to parse NDJSON message for ${serviceId}: "${messageStr}"`, parseErr);
          const errorResp: ClientMcpResponse = { success: false, error: { code: 'INVALID_JSON', message: 'Invalid JSON message received from client stream' } };
          if (!reply.raw.writableEnded) reply.raw.write(JSON.stringify(errorResp) + '\n');
          continue;
        }

        // Note: NDJSON streaming typically doesn't use the stream_options.stream_to_sse pattern.
        // If it did, the logic would be more complex here, potentially forking behavior.
        // For now, assume NDJSON requests are self-contained streams.

        const { operation_id, payload } = clientMcpRequest;
        if (!operation_id) {
          const errorResp: ClientMcpResponse = { success: false, error: { code: 'BAD_REQUEST', message: 'Missing operation_id in NDJSON message' } };
          if (!reply.raw.writableEnded) reply.raw.write(JSON.stringify(errorResp) + '\n');
          continue;
        }

        const context: McpRequestContext = { serviceId, operationId: operation_id, payload, clientIp: request.ip, requestId: operationRequestId };
        try {
          // McpService.processRequest is expected to return a full response.
          // If McpService could return a stream here, piping would be different.
          const mcpResp = await mcpService.processRequest(context);
          if (!reply.raw.writableEnded) reply.raw.write(JSON.stringify(mcpResp) + '\n');
        } catch (err) {
          const httpError = err instanceof HttpError ? err : new HttpError(500, 'Internal server error', 'INTERNAL_SERVER_ERROR', err instanceof Error ? err.message : undefined);
          logger.error(`[${operationRequestId}] Error processing NDJSON item for ${serviceId}/${operation_id}: ${httpError.message}`, err);
          const errorResp: ClientMcpResponse = { success: false, error: { code: httpError.code || `HTTP_${httpError.statusCode}`, message: httpError.message, details: httpError.details } };
          if (!reply.raw.writableEnded) reply.raw.write(JSON.stringify(errorResp) + '\n');
        }
      }
    });

    stream.on('end', async () => {
      logger.info(`[${clientRequestId}] NDJSON request body stream ended for service: ${serviceId}`);
      if (buffer.trim()) {
        // Process any final buffered message
        // This logic is similar to the loop above, refactor for DRY if needed
        const operationRequestId = randomUUID();
        try {
          const finalReq: ClientMcpRequest = JSON.parse(buffer.trim());
          if (!finalReq.operation_id) {
             const errorResp: ClientMcpResponse = { success: false, error: { code: 'BAD_REQUEST', message: 'Missing operation_id in final NDJSON message' } };
             if (!reply.raw.writableEnded) reply.raw.write(JSON.stringify(errorResp) + '\n');
          } else {
            logger.info(`[${clientRequestId}] Processing final NDJSON message for ${serviceId}: op=${finalReq.operation_id}`);
            const finalCtx: McpRequestContext = { serviceId, operationId: finalReq.operation_id, payload: finalReq.payload, clientIp: request.ip, requestId: operationRequestId };
            const finalResp = await mcpService.processRequest(finalCtx);
            if (!reply.raw.writableEnded) reply.raw.write(JSON.stringify(finalResp) + '\n');
          }
        } catch (err) {
          logger.warn(`[${clientRequestId}] Failed to parse final NDJSON message for ${serviceId}: "${buffer.trim()}"`, err);
          const errorResp: ClientMcpResponse = { success: false, error: { code: 'INVALID_JSON', message: 'Invalid final JSON message received from client stream' } };
          if (!reply.raw.writableEnded) reply.raw.write(JSON.stringify(errorResp) + '\n');
        }
      }
      if (!reply.raw.writableEnded) {
        reply.raw.end(); // End the response stream
      }
    });

    stream.on('error', (err: Error) => {
      logger.error(`[${clientRequestId}] NDJSON request stream error for service ${serviceId}:`, err);
      if (!reply.raw.writableEnded) {
        // Try to send a final error message if possible, though stream might be broken
        const errorResp: ClientMcpResponse = { success: false, error: { code: 'STREAM_ERROR', message: 'Error reading client request stream' } };
        reply.raw.write(JSON.stringify(errorResp) + '\n');
        reply.raw.end();
      }
    });
    
    // It's important that reply.sent is not true before Fastify takes over the stream
    // For manual stream handling, ensure you don't call reply.send() if you've written to reply.raw
    return; 
  }

  // Unsupported media type
  logger.warn(`[${clientRequestId}] Unsupported media type for service ${serviceId}: ${contentType}`);
  reply.code(415).send({ success: false, error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: `Unsupported media type: ${contentType}` } });
}