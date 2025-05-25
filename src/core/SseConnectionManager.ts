import { FastifyReply } from 'fastify';
import { logger } from '@/core/logger';

interface SseConnection {
  reply: FastifyReply;
  // Could add other metadata here if needed, e.g., serviceId, timestamp
}

class SseConnectionManager {
  private connections: Map<string, SseConnection> = new Map();

  public addConnection(correlationId: string, reply: FastifyReply): void {
    if (this.connections.has(correlationId)) {
      logger.warn(`[SseConnectionManager] Connection with correlationId ${correlationId} already exists. Overwriting.`);
      // Potentially close the old connection first
      const oldConnection = this.connections.get(correlationId);
      oldConnection?.reply.raw.end();
    }
    this.connections.set(correlationId, { reply });
    logger.info(`[SseConnectionManager] SSE connection added: ${correlationId}. Total connections: ${this.connections.size}`);
  }

  public removeConnection(correlationId: string): void {
    if (this.connections.has(correlationId)) {
      const connection = this.connections.get(correlationId);
      if (connection && !connection.reply.raw.writableEnded) {
        try {
          connection.reply.raw.end(); // Ensure connection is closed before removing
        } catch (e) {
          logger.warn(`[SseConnectionManager] Error ending reply stream for ${correlationId} during removal: ${(e as Error).message}`);
        }
      }
      this.connections.delete(correlationId);
      logger.info(`[SseConnectionManager] SSE connection removed: ${correlationId}. Total connections: ${this.connections.size}`);
    } else {
      logger.warn(`[SseConnectionManager] Attempted to remove non-existent connection: ${correlationId}`);
    }
  }

  public getConnection(correlationId: string): FastifyReply | undefined {
    return this.connections.get(correlationId)?.reply;
  }

  public sendToConnection(correlationId: string, event: string, data: unknown, eventId?: string): boolean {
    const connection = this.connections.get(correlationId);
    if (connection && !connection.reply.raw.writableEnded) {
      let message = '';
      if (eventId) {
        message += `id: ${eventId}\n`;
      }
      message += `event: ${event}\n`;
      message += `data: ${JSON.stringify(data)}\n\n`;
      
      try {
        connection.reply.raw.write(message);
        logger.debug(`[SseConnectionManager] Sent event "${event}" to ${correlationId}`);
        return true;
      } catch (error) {
        logger.error(`[SseConnectionManager] Error writing to SSE stream for ${correlationId}: ${(error as Error).message}. Removing connection.`);
        this.removeConnection(correlationId); // Remove problematic connection
        return false;
      }
    } else {
      if (!connection) {
        logger.warn(`[SseConnectionManager] Attempted to send event "${event}" to non-existent connection: ${correlationId}`);
      } else {
        logger.warn(`[SseConnectionManager] Attempted to send event "${event}" to an already ended stream: ${correlationId}. Auto-removing.`);
        this.removeConnection(correlationId); // Clean up if stream ended unexpectedly
      }
      return false;
    }
  }

  public closeConnection(correlationId: string): void {
    const connection = this.connections.get(correlationId);
    if (connection) {
      if (!connection.reply.raw.writableEnded) {
        try {
          connection.reply.raw.end();
        } catch (e) {
            logger.warn(`[SseConnectionManager] Error ending reply stream for ${correlationId} during explicit close: ${(e as Error).message}`);
        }
      }
      // It might be better to let the 'close' event on the reply stream handle removal
      // this.connections.delete(correlationId); 
      // logger.info(`[SseConnectionManager] SSE connection explicitly closed and removed: ${correlationId}`);
      logger.info(`[SseConnectionManager] SSE connection explicitly closed: ${correlationId}. Removal will be handled by stream 'close' event.`);

    } else {
      logger.warn(`[SseConnectionManager] Attempted to close non-existent connection: ${correlationId}`);
    }
  }

  public getActiveConnectionCount(): number {
    return this.connections.size;
  }
}

// Export a singleton instance
export const sseConnectionManager = new SseConnectionManager();
