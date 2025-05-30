export interface McpOperation {
  id: string; // Unique identifier for the route or OpenAPI operation
  operationId: string; // Corresponds to MCP operation_id
  upstreamUriTemplate: string;
  upstreamMethod: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';
  inputSchema?: Record<string, any>; // JSON Schema for input validation
  isStreaming?: boolean; // Indicates if the operation is expected to stream responses
  // Potentially more fields like parameter mappings, etc.
}

export interface McpRequestContext {
  serviceId: string;
  operationId: string;
  payload: any;
  clientIp?: string; // For IP Hashing or logging
  requestId: string; // Unique request ID for tracing
}

// Simplified MCP request from client (actual structure TBD by protocol)
export interface ClientMcpRequest {
  operation_id: string;
  payload: Record<string, any>;
  stream_options?: StreamOptions; // Added to allow client to specify streaming preferences
  // request_id, etc.
}

// Simplified MCP response to client (actual structure TBD by protocol)
export interface ClientMcpResponse {
  success: boolean;
  data?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  // stream_id, sequence_id, etc.
}

export interface StreamOptions {
  correlation_id: string;
  stream_to_sse: boolean;
  // Potentially other options like preferred_event_name etc.
}