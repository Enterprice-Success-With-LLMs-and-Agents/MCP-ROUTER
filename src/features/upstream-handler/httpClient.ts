import { request, Dispatcher, stream } from 'undici'; // Added stream
import { logger } from '@/core/logger';
import { UpstreamServiceError } from '@/core/errors';

interface HttpClientOptions {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string | Buffer | NodeJS.ReadableStream;
  timeout?: number; // in milliseconds
}

interface HttpClientResponse {
  statusCode: number;
  headers: Record<string, string | string[]>;
  body: Buffer;
}

// New interface for streaming responses
export interface HttpClientStreamResponse {
  statusCode: number;
  headers: Record<string, string | string[]>;
  bodyStream: NodeJS.ReadableStream;
}

export async function makeHttpRequest(options: HttpClientOptions): Promise<HttpClientResponse> {
  logger.debug(`Making upstream HTTP request (non-streaming): ${options.method} ${options.url}`);
  try {
    const { statusCode, headers, body: responseBodyStream } = await request(options.url, {
      method: options.method as Dispatcher.HttpMethod,
      headers: options.headers,
      body: options.body as any,
      bodyTimeout: options.timeout || 30000,
      headersTimeout: options.timeout || 30000,
    });

    const chunks: Buffer[] = [];
    for await (const chunk of responseBodyStream) {
      chunks.push(chunk);
    }
    const bodyBuffer = Buffer.concat(chunks);

    logger.debug(`Upstream response (non-streaming): ${statusCode} from ${options.url}. Body length: ${bodyBuffer.length}`);
    if (statusCode >= 400) {
      logger.warn(`Upstream error ${statusCode} for ${options.method} ${options.url}: ${bodyBuffer.toString('utf-8').substring(0, 500)}`);
    }

    return {
      statusCode,
      headers: headers as Record<string, string | string[]>,
      body: bodyBuffer,
    };
  } catch (error) {
    logger.error(`HTTP client error (non-streaming) for ${options.method} ${options.url}:`, error);
    throw new UpstreamServiceError(
      `Failed to connect to upstream (non-streaming): ${(error as Error).message}`,
      error instanceof UpstreamServiceError ? error.statusCode : 503,
      { originalError: (error as Error).stack, type: 'NON_STREAMING_REQUEST_FAILED' }
    );
  }
}

// New function for streaming
export async function makeHttpRequestAndGetStream(options: HttpClientOptions): Promise<HttpClientStreamResponse> {
  logger.debug(`Making upstream HTTP request (streaming): ${options.method} ${options.url}`);
  try {
    const response = await request(options.url, {
      method: options.method as Dispatcher.HttpMethod,
      headers: options.headers,
      body: options.body as any, // undici's types can be tricky with ReadableStream bodies
      bodyTimeout: options.timeout || 120000, // Longer timeout for streaming
      headersTimeout: options.timeout || 30000,
    });

    logger.debug(`Upstream response (streaming): ${response.statusCode} from ${options.url}`);

    // For non-2xx responses, we should still try to provide the body stream
    // as it might contain error details. The caller will be responsible for handling it.
    // Alternatively, could consume it here and throw, but that prevents caller from custom error parsing.
    if (response.statusCode >= 400) {
       logger.warn(`Upstream error (streaming) ${response.statusCode} for ${options.method} ${options.url}. The bodyStream might contain details.`);
       // The stream will be passed along. The consumer (UpstreamRequestHandler)
       // will need to read from it and handle accordingly (e.g., parse error, send via SSE).
    }
    
    return {
      statusCode: response.statusCode,
      headers: response.headers as Record<string, string | string[]>,
      bodyStream: response.body, // This is NodeJS.ReadableStream
    };

  } catch (error) {
    logger.error(`HTTP client error (streaming) for ${options.method} ${options.url}:`, error);
    // For connection errors etc., there's no stream to return.
    throw new UpstreamServiceError(
      `Failed to connect to upstream (streaming): ${(error as Error).message}`,
      error instanceof UpstreamServiceError ? error.statusCode : 503, 
      { originalError: (error as Error).stack, type: 'STREAMING_CONNECTION_FAILED' }
    );
  }
}