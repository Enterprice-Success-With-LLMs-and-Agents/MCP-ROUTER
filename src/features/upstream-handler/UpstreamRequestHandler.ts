import { UpstreamConfig } from '@/config/config.types';
import { McpOperation, McpRequestContext } from '@/types/mcp.types';
import { makeHttpRequest, makeHttpRequestAndGetStream, HttpClientStreamResponse } from './httpClient'; // Updated imports
import { loadBalancer } from './LoadBalancer';
import { logger } from '@/core/logger';
import { UpstreamServiceError, ConfigurationError, HttpError } from '@/core/errors'; // Added HttpError
import { sseConnectionManager } from '@/core/SseConnectionManager'; // Added SSE manager
import { pipeline } from 'stream/promises'; // For graceful stream handling
import { Transform } from 'stream'; // For potential transformations

export interface UpstreamRequest {
  method: McpOperation['upstreamMethod'];
  url: string;
  headers: Record<string, string>;
  body?: any; 
}

export interface UpstreamResponse {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

export class UpstreamRequestHandler {
  // Existing handleRequest method (remains unchanged)
  public async handleRequest(
    context: McpRequestContext,
    operation: McpOperation,
    upstreamConfig: UpstreamConfig,
  ): Promise<UpstreamResponse> {
    const selectedNode = loadBalancer.getNextNode(upstreamConfig, context);
    const [host, port] = selectedNode.split(':');
    let upstreamPath = operation.upstreamUriTemplate;
    const queryParams: Record<string, string> = {};

    for (const key in context.payload) {
      const placeholderPath = `{${key}}`;
      if (upstreamPath.includes(placeholderPath)) {
        upstreamPath = upstreamPath.replace(new RegExp(placeholderPath, 'g'), String(context.payload[key]));
      } else {
         if (['GET', 'HEAD', 'DELETE', 'OPTIONS'].includes(operation.upstreamMethod)) {
            queryParams[key] = String(context.payload[key]);
        }
      }
    }
    
    const queryString = new URLSearchParams(queryParams).toString();
    const fullPath = queryString ? `${upstreamPath}?${queryString}` : upstreamPath;
    const upstreamUrl = `${upstreamConfig.scheme}://${host}:${port}${fullPath}`;

    const headers: Record<string, string> = {};
    if (upstreamConfig.headers) {
      for (const key in upstreamConfig.headers) {
        headers[key] = upstreamConfig.headers[key];
      }
    }
    if (upstreamConfig.pass_host === 'rewrite') {
      headers['Host'] = upstreamConfig.upstream_host || selectedNode;
    } else if (upstreamConfig.pass_host === 'pass') {
      headers['Host'] = upstreamConfig.upstream_host || selectedNode;
    }
    headers['X-Request-ID'] = context.requestId;
    if(context.clientIp) headers['X-Forwarded-For'] = context.clientIp;

    let requestBody: string | Buffer | undefined;
    let bodyPayload = context.payload;
    
    // Ensure payload is structured for upstream, especially for stream=true cases
    // This might need more sophisticated handling based on operation schemas
    if ((operation as any).isStreaming && typeof bodyPayload === 'object' && bodyPayload !== null) { // Cast operation to any to check isStreaming
        (bodyPayload as any).stream = true; // Example: Ensure OpenAI stream flag
    }


    if (operation.upstreamMethod !== 'GET' && operation.upstreamMethod !== 'HEAD') {
        if (typeof bodyPayload === 'object') {
            headers['Content-Type'] = 'application/json';
            requestBody = JSON.stringify(bodyPayload);
        } else if (typeof bodyPayload === 'string') {
            headers['Content-Type'] = 'text/plain';
            requestBody = bodyPayload;
        } else if (Buffer.isBuffer(bodyPayload)) {
            headers['Content-Type'] = 'application/octet-stream';
            requestBody = bodyPayload;
        }
    }

    logger.info(`[${context.requestId}] Forwarding (non-SSE) to upstream: ${operation.upstreamMethod} ${upstreamUrl}`);
    try {
      const response = await makeHttpRequest({
        method: operation.upstreamMethod,
        url: upstreamUrl,
        headers,
        body: requestBody,
      });
      return {
        statusCode: response.statusCode,
        headers: response.headers as Record<string, string | string[] | undefined>,
        body: response.body,
      };
    } catch (error) {
        if (error instanceof UpstreamServiceError) throw error;
        logger.error(`[${context.requestId}] Unexpected error during (non-SSE) upstream request to ${upstreamUrl}:`, error);
        throw new UpstreamServiceError(
            `Unhandled error calling upstream ${upstreamConfig.id}`, 500,
            { originalError: (error as Error).message }
        );
    }
  }

  // New method for handling requests and piping to SSE
  public async handleRequestAndPipeToSse(
    context: McpRequestContext,
    operation: McpOperation, // McpOperation should ideally indicate if it's a streaming operation
    upstreamConfig: UpstreamConfig,
    sseCorrelationId: string,
  ): Promise<void> {
    const { requestId } = context;
    const selectedNode = loadBalancer.getNextNode(upstreamConfig, context);
    const [host, port] = selectedNode.split(':');
    
    let upstreamPath = operation.upstreamUriTemplate;
    const queryParams: Record<string, string> = {};

    // Ensure payload is mutable for modification (e.g., adding stream: true)
    let mutablePayload = typeof context.payload === 'object' && context.payload !== null 
        ? { ...context.payload } 
        : context.payload;

    // Placeholder replacement and query param construction (similar to handleRequest)
    if (typeof mutablePayload === 'object' && mutablePayload !== null) {
        for (const key in mutablePayload) {
            const placeholderPath = `{${key}}`;
            if (upstreamPath.includes(placeholderPath)) {
                upstreamPath = upstreamPath.replace(new RegExp(placeholderPath, 'g'), String(mutablePayload[key as keyof typeof mutablePayload]));
                // Remove used keys from payload if they shouldn't be in body for GET etc.
                // delete mutablePayload[key as keyof typeof mutablePayload]; 
            } else {
                if (['GET', 'HEAD', 'DELETE', 'OPTIONS'].includes(operation.upstreamMethod)) {
                    queryParams[key] = String(mutablePayload[key as keyof typeof mutablePayload]);
                }
            }
        }
        // For streaming operations (like OpenAI chat completions), ensure 'stream: true' is in the payload if not already.
        // This is a common convention. This might need to be more configurable per-operation.
        if ((operation as any).isStreaming) { // Assuming McpOperation has an isStreaming flag // Cast to any
             (mutablePayload as any).stream = true;
        }

    } else if (typeof mutablePayload === 'string' && ['GET', 'HEAD', 'DELETE', 'OPTIONS'].includes(operation.upstreamMethod)) {
        // If payload is a string and method is GET etc., it's unlikely to be used for query params directly.
        // This part of logic might need refinement based on how string payloads are meant for GETs.
    }


    const queryString = new URLSearchParams(queryParams).toString();
    const fullPath = queryString ? `${upstreamPath}?${queryString}` : upstreamPath;
    const upstreamUrl = `${upstreamConfig.scheme}://${host}:${port}${fullPath}`;

    const headers: Record<string, string> = {};
    if (upstreamConfig.headers) {
      for (const key in upstreamConfig.headers) {
        headers[key] = upstreamConfig.headers[key];
      }
    }
    if (upstreamConfig.pass_host === 'rewrite') {
      headers['Host'] = upstreamConfig.upstream_host || selectedNode;
    } else { // 'pass' or unspecified
      headers['Host'] = upstreamConfig.upstream_host || selectedNode;
    }
    headers['X-Request-ID'] = requestId;
    if (context.clientIp) headers['X-Forwarded-For'] = context.clientIp;
    headers['Accept'] = 'text/event-stream'; // Important for some SSE-supporting upstreams

    let requestBody: string | Buffer | undefined;
    if (operation.upstreamMethod !== 'GET' && operation.upstreamMethod !== 'HEAD') {
        if (typeof mutablePayload === 'object' && mutablePayload !== null) {
            headers['Content-Type'] = 'application/json';
            requestBody = JSON.stringify(mutablePayload);
        } else if (typeof mutablePayload === 'string') {
            // Content-Type might need to be configurable or inferred
            headers['Content-Type'] = 'text/plain'; 
            requestBody = mutablePayload;
        } else if (Buffer.isBuffer(mutablePayload)) {
            headers['Content-Type'] = 'application/octet-stream';
            requestBody = mutablePayload;
        }
    }
    
    logger.info(`[${requestId}] Initiating SSE pipe to upstream: ${operation.upstreamMethod} ${upstreamUrl} for correlationId ${sseCorrelationId}`);

    try {
      const { statusCode, headers: responseHeaders, bodyStream } = await makeHttpRequestAndGetStream({
        method: operation.upstreamMethod,
        url: upstreamUrl,
        headers,
        body: requestBody,
      });

      if (statusCode >= 400) {
        // Attempt to read error body from stream
        let errorBody = '';
        try {
            for await (const chunk of bodyStream) { errorBody += chunk.toString(); if (errorBody.length > 1024) break; } // Limit error body size
        } catch (streamReadError) {
            logger.warn(`[${requestId}] Failed to read error stream from upstream for ${upstreamUrl}: ${streamReadError}`);
        }
        const errorMessage = `Upstream error ${statusCode}: ${errorBody.substring(0,500)}`;
        logger.error(`[${requestId}] ${errorMessage}`);
        sseConnectionManager.sendToConnection(sseCorrelationId, 'mcp_error', { error: { code: `UPSTREAM_ERROR_${statusCode}`, message: errorMessage, details: { upstream_status: statusCode, upstream_headers: responseHeaders} } });
        sseConnectionManager.closeConnection(sseCorrelationId);
        // No throw here as error is communicated via SSE
        return;
      }

      // Process the stream
      bodyStream.on('data', (chunk: Buffer) => {
        // Here, you might need to parse/transform the chunk if it's not directly what the client expects.
        // E.g., OpenAI streams send 'data: {json}\n\n'. We need to extract the {json}.
        // For now, assume raw chunk is okay or client handles OpenAI's format.
        // A more robust solution would parse based on operation's expected stream format.
        
        // Example for OpenAI-like SSE chunks:
        const chunkStr = chunk.toString('utf-8');
        const lines = chunkStr.split('\n');
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const jsonData = line.substring('data: '.length).trim();
                if (jsonData === '[DONE]') {
                    // This is specific to OpenAI, handle it as end of stream
                    logger.info(`[${requestId}] OpenAI stream [DONE] received for ${sseCorrelationId}`);
                    sseConnectionManager.sendToConnection(sseCorrelationId, 'mcp_stream_end', { message: 'Stream finished by [DONE] marker' });
                    // sseConnectionManager.closeConnection(sseCorrelationId); // Or let client close
                    return; // Stop processing this chunk further if [DONE]
                }
                try {
                    const parsedData = JSON.parse(jsonData);
                    // Send the parsed data. Client expects { content: "..." } or similar.
                    // This transformation depends on what your client's McpClient.js expects for 'mcp_response'
                    sseConnectionManager.sendToConnection(sseCorrelationId, 'mcp_response', { content: parsedData });
                } catch (e) {
                    logger.warn(`[${requestId}] Failed to parse JSON from upstream SSE line: "${jsonData}" for ${sseCorrelationId}. Sending raw line.`);
                    // Fallback: send raw data if parsing fails, or handle error differently
                    sseConnectionManager.sendToConnection(sseCorrelationId, 'mcp_response', { raw_content: line });
                }
            } else if (line.trim()) {
                // Non-empty, non-data line, could be a comment or other protocol detail
                logger.debug(`[${requestId}] Upstream SSE non-data line for ${sseCorrelationId}: "${line}"`);
            }
        }
      });

      bodyStream.on('end', () => {
        logger.info(`[${requestId}] Upstream response stream ended for ${sseCorrelationId}`);
        sseConnectionManager.sendToConnection(sseCorrelationId, 'mcp_stream_end', { message: 'Stream finished' });
        // Optional: sseConnectionManager.closeConnection(sseCorrelationId); // Or let client close
      });

      bodyStream.on('error', (err: Error) => {
        logger.error(`[${requestId}] Error reading from upstream response stream for ${sseCorrelationId}:`, err);
        sseConnectionManager.sendToConnection(sseCorrelationId, 'mcp_error', { error: { code: 'UPSTREAM_STREAM_READ_ERROR', message: err.message } });
        sseConnectionManager.closeConnection(sseCorrelationId);
      });

    } catch (error) {
      // This catches errors from makeHttpRequestAndGetStream (e.g., connection refused)
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`[${requestId}] Failed to make upstream stream request or initial processing for ${sseCorrelationId}: ${err.message}`, err);
      sseConnectionManager.sendToConnection(sseCorrelationId, 'mcp_error', { error: { code: 'STREAM_REQUEST_SETUP_FAILED', message: err.message } });
      sseConnectionManager.closeConnection(sseCorrelationId);
      // No re-throw here, error is handled by sending message over SSE & closing.
    }
  }
}

export const upstreamRequestHandler = new UpstreamRequestHandler();