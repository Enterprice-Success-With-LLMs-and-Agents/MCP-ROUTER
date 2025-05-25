import { request, Dispatcher } from 'undici';
import { logger } from '@/core/logger';
import { UpstreamServiceError } from '@/core/errors';

interface HttpClientOptions {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string | Buffer | NodeJS.ReadableStream; // undici supports various body types
  timeout?: number; // in milliseconds
}

interface HttpClientResponse {
  statusCode: number;
  headers: Record<string, string | string[]>;
  body: Buffer; // Or stream if needed, but Buffer is simpler for now
}

export async function makeHttpRequest(options: HttpClientOptions): Promise<HttpClientResponse> {
  logger.debug(`Making upstream HTTP request: ${options.method} ${options.url}`);
  try {
    const { statusCode, headers, body: responseBodyStream } = await request(options.url, {
      method: options.method as Dispatcher.HttpMethod,
      headers: options.headers,
      body: options.body as any, // Cast to any to avoid type incompatibility
      bodyTimeout: options.timeout || 30000, // Default 30s
      headersTimeout: options.timeout || 30000,
    });

    // Consume the stream and collect into a buffer
    const chunks: Buffer[] = [];
    for await (const chunk of responseBodyStream) {
      chunks.push(chunk);
    }
    const bodyBuffer = Buffer.concat(chunks);

    logger.debug(`Upstream response: ${statusCode} from ${options.url}`);
    if (statusCode >= 400) {
      // Log more details for server errors
      logger.warn(`Upstream error ${statusCode} for ${options.method} ${options.url}: ${bodyBuffer.toString('utf-8').substring(0, 500)}`);
    }

    return {
      statusCode,
      headers: headers as Record<string, string | string[]>,
      body: bodyBuffer,
    };
  } catch (error) {
    logger.error(`HTTP client error for ${options.method} ${options.url}:`, error);
    throw new UpstreamServiceError(
      `Failed to connect to upstream: ${(error as Error).message}`,
      503, // Service Unavailable or Bad Gateway (502)
      { originalError: (error as Error).stack }
    );
  }
} 