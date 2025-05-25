import { FastifyReply, FastifyRequest } from 'fastify';
import { requestRouter } from '@/features/request-routing/RequestRouter';
import { McpRequestContext, ClientMcpRequest, ClientMcpResponse } from '@/types/mcp.types';
import { HttpError, NotFoundError, BadRequestError } from '@/core/errors';
import { logger } from '@/core/logger';
import { randomUUID } from 'crypto';

// Simplified: assumes client sends JSON strings as 'data' for 'mcp_request' event
// and server sends structured events back.
// A real SSE implementation for bi-di might involve request IDs to correlate.

function sendSseEvent(reply: FastifyReply, event: string, data: any, eventId?: string) {
  let message = '';
  if (eventId) {
    message += `id: ${eventId}\n`;
  }
  message += `event: ${event}\n`;
  message += `data: ${JSON.stringify(data)}\n\n`;
  
  if (!reply.raw.writableEnded) {
    reply.raw.write(message);
  } else {
    logger.warn(`[${eventId || 'SSE'}] Attempted to write to an already ended SSE stream.`);
  }
}

export async function handleSseConnection(request: FastifyRequest, reply: FastifyReply) {
  const serviceId = (request.params as { serviceId?: string }).serviceId;
  const clientRequestId = request.headers['x-request-id'] as string || randomUUID();

  if (!serviceId) {
    // This case is for generic /sse endpoint, not currently detailed in yaml.md for specific service routing.
    // For multi-tenancy, /api/{service_id}/sse is preferred.
    // If supporting generic /sse, a mechanism to specify target service in MCP message is needed.
    logger.error(`[${clientRequestId}] SSE request to generic /sse endpoint. Service ID must be in path for this implementation.`);
    reply.code(400).send({ error: 'Service ID must be specified in the path for SSE connections (/api/{serviceId}/sse).' });
    return;
  }

  const mcpService = requestRouter.getService(serviceId);
  if (!mcpService) {
    logger.warn(`[${clientRequestId}] SSE connection attempt for unknown service: ${serviceId}`);
    reply.code(404).send({ error: `Service ${serviceId} not found.` });
    return;
  }

  logger.info(`[${clientRequestId}] SSE connection established for service: ${serviceId}, client: ${request.ip}`);

  // Set SSE headers
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*', // Adjust for production
  });
  
  // Send a connection established event (optional)
  sendSseEvent(reply, 'mcp_connected', { serviceId, message: 'Connection established' }, clientRequestId);

  // Keep-alive mechanism
  const keepAliveInterval = setInterval(() => {
    if (reply.raw.writableEnded) {
      clearInterval(keepAliveInterval);
      return;
    }
    // Send a comment as a keep-alive ping
    reply.raw.write(':keep-alive\n\n');
  }, 20000); // Every 20 seconds

  request.raw.on('close', () => {
    clearInterval(keepAliveInterval);
    logger.info(`[${clientRequestId}] SSE connection closed for service: ${serviceId}, client: ${request.ip}`);
    // Clean up any resources associated with this connection
  });

  request.raw.on('error', (err) => {
    clearInterval(keepAliveInterval);
    logger.error(`[${clientRequestId}] SSE connection error for service ${serviceId}:`, err);
    // Clean up any resources associated with this connection
  });
} 