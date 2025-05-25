import { FastifyReply, FastifyRequest } from 'fastify';
import { requestRouter } from '@/features/request-routing/RequestRouter';
import { logger } from '@/core/logger';
import { sseConnectionManager } from '@/core/SseConnectionManager'; // Import the manager
import { randomUUID } from 'crypto';

// Interface for query parameters
interface SseRequestQuery {
  correlationId?: string;
}

export async function handleSseConnection(request: FastifyRequest, reply: FastifyReply) {
  const serviceId = (request.params as { serviceId?: string }).serviceId;
  const queryParams = request.query as SseRequestQuery;
  
  // Use client-provided correlationId or generate a new one if not provided (though client should provide it)
  const correlationId = queryParams.correlationId || randomUUID(); 
  const clientRequestId = request.id; // Fastify's request ID for logging this specific HTTP connection event

  if (!serviceId) {
    logger.error(`[${clientRequestId}] SSE connection attempt without serviceId in path.`);
    reply.code(400).send({ error: 'Service ID must be specified in the path for SSE connections (/api/{serviceId}/sse).' });
    return;
  }

  if (!queryParams.correlationId) {
    logger.warn(`[${clientRequestId}] SSE connection for service ${serviceId} established without a client-provided correlationId. Generated one: ${correlationId}. Client should ideally provide this.`);
    // Depending on strictness, you might reject if correlationId is missing.
    // For now, we generate one to allow connection, but it makes client-server correlation harder if client doesn't know it.
  }

  const mcpService = requestRouter.getService(serviceId);
  if (!mcpService) {
    logger.warn(`[${clientRequestId}] SSE connection attempt for unknown service: ${serviceId} (correlationId: ${correlationId})`);
    reply.code(404).send({ error: `Service ${serviceId} not found.` });
    return;
  }

  logger.info(`[${clientRequestId}] SSE connection request for service: ${serviceId}, correlationId: ${correlationId}, client: ${request.ip}`);

  // Set SSE headers
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*', // Adjust for production
    // Consider 'X-Accel-Buffering': 'no' if behind Nginx
  });

  // Add to connection manager
  sseConnectionManager.addConnection(correlationId, reply);

  // Send a connection established event (optional, but good for client feedback)
  // Use the manager to send this, ensuring the connection is valid
  const connectedEventSent = sseConnectionManager.sendToConnection(
    correlationId,
    'mcp_connected',
    { serviceId, correlationId, message: 'SSE connection established and registered.' },
    clientRequestId // Use Fastify's req ID as the SSE event ID for this initial message
  );

  if (!connectedEventSent) {
    // If sending the initial event failed, the connection might already be dead or invalid.
    // addConnection would have logged. No further action here as removeConnection would have been called by sendToConnection.
    logger.error(`[${clientRequestId}] Failed to send mcp_connected event for ${correlationId}. Connection likely already closed.`);
    // No need to `reply.raw.end()` here as `sseConnectionManager.sendToConnection` or `addConnection` would handle it.
    return; 
  }
  
  logger.info(`[${clientRequestId}] SSE connection fully established and registered for service: ${serviceId}, correlationId: ${correlationId}. Manager now has ${sseConnectionManager.getActiveConnectionCount()} connections.`);

  // Keep-alive mechanism
  const keepAliveInterval = setInterval(() => {
    const connection = sseConnectionManager.getConnection(correlationId);
    if (connection && !connection.raw.writableEnded) {
      // Send a comment as a keep-alive ping
      connection.raw.write(':keep-alive\n\n');
    } else {
      clearInterval(keepAliveInterval);
      // If connection is gone or ended, no need to do more.
      // It should have been removed from manager by 'close' or 'error' event.
    }
  }, 20000); // Every 20 seconds

  // Handle client closing the connection
  reply.raw.on('close', () => {
    clearInterval(keepAliveInterval);
    logger.info(`[${clientRequestId}] SSE stream closed by client for service: ${serviceId}, correlationId: ${correlationId}`);
    sseConnectionManager.removeConnection(correlationId); // Ensure removal from manager
  });

  // Handle errors on the raw stream
  reply.raw.on('error', (err) => {
    clearInterval(keepAliveInterval);
    logger.error(`[${clientRequestId}] SSE stream error for service ${serviceId}, correlationId: ${correlationId}:`, err);
    sseConnectionManager.removeConnection(correlationId); // Ensure removal from manager
  });
}