import { UpstreamConfig } from '@/config/config.types';
import { McpOperation, McpRequestContext } from '@/types/mcp.types';
import { makeHttpRequest } from './httpClient';
import { loadBalancer } from './LoadBalancer';
import { logger } from '@/core/logger';
import { UpstreamServiceError, ConfigurationError } from '@/core/errors';

export interface UpstreamRequest {
  method: McpOperation['upstreamMethod'];
  url: string;
  headers: Record<string, string>;
  body?: any; // Will be stringified if object
}

export interface UpstreamResponse {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

export class UpstreamRequestHandler {
  public async handleRequest(
    context: McpRequestContext,
    operation: McpOperation,
    upstreamConfig: UpstreamConfig,
  ): Promise<UpstreamResponse> {
    const selectedNode = loadBalancer.getNextNode(upstreamConfig, context);
    const [host, port] = selectedNode.split(':');

    // 1. Construct Upstream URI
    // Replace placeholders in upstreamUriTemplate with context.payload
    // Example: /data/2.5/forecast?lat={lat}&lon={lon}&appid={appid}
    // payload: { lat: 10, lon: 20, appid: 'key' }
    let upstreamPath = operation.upstreamUriTemplate;
    const queryParams: Record<string, string> = {};

    // Simple placeholder replacement for path and query params
    // A more robust solution would involve proper URI template parsing (e.g., RFC 6570)
    for (const key in context.payload) {
      const placeholderPath = `{${key}}`;
      if (upstreamPath.includes(placeholderPath)) {
        upstreamPath = upstreamPath.replace(new RegExp(placeholderPath, 'g'), String(context.payload[key]));
      } else {
        // Assume anything not in path is a query param if GET/HEAD/DELETE/OPTIONS
         if (['GET', 'HEAD', 'DELETE', 'OPTIONS'].includes(operation.upstreamMethod)) {
            queryParams[key] = String(context.payload[key]);
        }
      }
    }
    
    const queryString = new URLSearchParams(queryParams).toString();
    const fullPath = queryString ? `${upstreamPath}?${queryString}` : upstreamPath;
    const upstreamUrl = `${upstreamConfig.scheme}://${host}:${port}${fullPath}`;

    // 2. Construct Headers
    const headers: Record<string, string> = {};

    // Add static headers from config
    if (upstreamConfig.headers) {
      for (const key in upstreamConfig.headers) {
        headers[key] = upstreamConfig.headers[key];
      }
    }

    // Handle Host header
    if (upstreamConfig.pass_host === 'rewrite') {
      headers['Host'] = upstreamConfig.upstream_host || selectedNode;
    } else if (upstreamConfig.pass_host === 'pass') {
      // In a typical gateway, you'd pass the original Host header from the client.
      // For MCP, there isn't a direct HTTP client host.
      // So 'pass' might mean using the selectedNode or a configured default.
      // For simplicity, let's use selectedNode if upstream_host is not set.
      headers['Host'] = upstreamConfig.upstream_host || selectedNode;
    }
    
    // Add other common headers, potentially pass through some from original if applicable
    headers['X-Request-ID'] = context.requestId;
    if(context.clientIp) headers['X-Forwarded-For'] = context.clientIp;


    // 3. Prepare Body
    let requestBody: string | Buffer | undefined;
    if (operation.upstreamMethod !== 'GET' && operation.upstreamMethod !== 'HEAD' && context.payload) {
        // If GET, payload was used for query/path params. For POST etc, remaining payload is body.
        // This logic needs refinement based on how payload is structured for GET vs POST in MCP.
        // For now, assume if not GET/HEAD, and there's a payload that wasn't fully consumed by URI templating, it's the body.
        // A better approach: separate `pathParams`, `queryParams`, `body` in McpRequestContext or derived from inputSchema.
        let bodyPayload = context.payload;
        if (['GET', 'HEAD', 'DELETE', 'OPTIONS'].includes(operation.upstreamMethod)) {
            // For these methods, payload should have been entirely used for path/query params
            // If there's "leftover" payload, it's ambiguous. For now, we send no body.
             requestBody = undefined;
        } else if (typeof context.payload === 'object') {
            headers['Content-Type'] = 'application/json'; // Common default
            requestBody = JSON.stringify(context.payload);
        } else if (typeof context.payload === 'string') {
            headers['Content-Type'] = 'text/plain'; // Or allow override from config
            requestBody = context.payload;
        } else if (Buffer.isBuffer(context.payload)) {
            headers['Content-Type'] = 'application/octet-stream';
            requestBody = context.payload;
        }
    }


    logger.info(`Forwarding to upstream: ${operation.upstreamMethod} ${upstreamUrl}`);
    logger.debug(`Upstream headers: ${JSON.stringify(headers)}`);
    if (requestBody) logger.debug(`Upstream body type: ${typeof requestBody}, length: ${requestBody.length}`);


    try {
      const response = await makeHttpRequest({
        method: operation.upstreamMethod,
        url: upstreamUrl,
        headers,
        body: requestBody,
      });
      return {
        statusCode: response.statusCode,
        headers: response.headers as Record<string, string | string[] | undefined>, // undici headers are iterable
        body: response.body,
      };
    } catch (error) {
        if (error instanceof UpstreamServiceError) throw error;
        logger.error(`Unexpected error during upstream request to ${upstreamUrl}:`, error);
        throw new UpstreamServiceError(
            `Unhandled error calling upstream ${upstreamConfig.id}`, 500,
            { originalError: (error as Error).message }
        );
    }
  }
}

export const upstreamRequestHandler = new UpstreamRequestHandler(); 