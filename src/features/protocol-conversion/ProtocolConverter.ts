import { ClientMcpResponse } from '@/types/mcp.types';
import { UpstreamResponse } from '@/features/upstream-handler/UpstreamRequestHandler';
import { logger } from '@/core/logger';

export class ProtocolConverter {
  public httpToMcpResponse(upstreamResponse: UpstreamResponse): ClientMcpResponse {
    logger.debug(`Converting HTTP response (status: ${upstreamResponse.statusCode}) to MCP response.`);
    const isSuccess = upstreamResponse.statusCode >= 200 && upstreamResponse.statusCode < 300;

    let responseData: any;
    const contentType = typeof upstreamResponse.headers['content-type'] === 'string' ? upstreamResponse.headers['content-type'].toLowerCase() : '';

    try {
      if (upstreamResponse.body && upstreamResponse.body.length > 0) {
        if (contentType.includes('application/json')) {
          responseData = JSON.parse(upstreamResponse.body.toString('utf-8'));
        } else if (contentType.includes('text/')) {
          responseData = upstreamResponse.body.toString('utf-8');
        } else {
          // For binary data, might send as base64 or a specific MCP type
          responseData = {
            _rawBodyBase64: upstreamResponse.body.toString('base64'),
            _contentType: contentType || 'application/octet-stream'
          };
          logger.debug('Responding with base64 encoded binary data.');
        }
      }
    } catch (jsonError) {
      logger.warn(`Failed to parse JSON response body from upstream, sending as text. Status: ${upstreamResponse.statusCode}`, jsonError);
      responseData = upstreamResponse.body.toString('utf-8'); // Fallback to text
    }

    if (isSuccess) {
      return {
        success: true,
        data: responseData,
        // Potentially include subset of headers, status_code etc.
      };
    } else {
      return {
        success: false,
        error: {
          code: `UPSTREAM_HTTP_${upstreamResponse.statusCode}`,
          message: `Upstream service responded with status ${upstreamResponse.statusCode}`,
          details: responseData, // Include upstream error body if available
        },
      };
    }
  }

  // MCP Request to Upstream Request parts are mostly handled in UpstreamRequestHandler
  // This class could be expanded if more complex MCP-specific request transformations are needed
  // before they hit UpstreamRequestHandler.
}

export const protocolConverter = new ProtocolConverter(); 