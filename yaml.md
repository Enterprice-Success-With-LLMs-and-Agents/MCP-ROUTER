Okay, this is a substantial undertaking. A truly "production-ready" system of this complexity would require a team and significant time. What I can provide is a well-structured, advanced TypeScript skeleton with core logic implemented for many features, using Fastify as the server framework. It will highlight how these features could be built and integrated.

**You'll need to install the dependencies listed in `package.json` first (`npm install` or `yarn install`).**

Here's the directory structure and code:

---

**`package.json`**

```json
{
  "name": "mcp-access-point",
  "version": "1.0.0",
  "description": "Model Context Protocol Access Point",
  "main": "dist/main.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/main.js",
    "dev": "ts-node-dev --respawn --transpile-only src/main.ts",
    "test": "jest",
    "test:watch": "jest --watch",
    "lint": "eslint . --ext .ts",
    "format": "prettier --write \"src/**/*.ts\" \"test/**/*.ts\""
  },
  "dependencies": {
    "@fastify/sensible": "^5.5.0",
    "ajv": "^8.12.0",
    "ajv-formats": "^3.0.1",
    "fastify": "^4.26.2",
    "js-yaml": "^4.1.0",
    "pino": "^8.19.0",
    "swagger-parser": "^10.0.3",
    "undici": "^6.10.2",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/jest": "^29.5.12",
    "@types/js-yaml": "^4.0.9",
    "@types/node": "^20.11.24",
    "@typescript-eslint/eslint-plugin": "^7.1.1",
    "@typescript-eslint/parser": "^7.1.1",
    "eslint": "^8.57.0",
    "eslint-config-prettier": "^9.1.0",
    "eslint-plugin-prettier": "^5.1.3",
    "jest": "^29.7.0",
    "pino-pretty": "^10.3.1",
    "prettier": "^3.2.5",
    "ts-jest": "^29.1.2",
    "ts-node-dev": "^2.0.0",
    "typescript": "^5.3.3"
  },
  "jest": {
    "preset": "ts-jest",
    "testEnvironment": "node",
    "moduleNameMapper": {
      "^@/(.*)$": "<rootDir>/src/$1"
    }
  }
}
```

---

**`tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "rootDir": "./src",
    "outDir": "./dist",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "test"]
}
```

---

**`.eslintrc.js`** (Basic ESLint + Prettier setup)

```javascript
module.exports = {
  parser: '@typescript-eslint/parser',
  extends: [
    'plugin:@typescript-eslint/recommended',
    'prettier',
    'plugin:prettier/recommended',
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  rules: {
    // Add your own rules here
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
  },
};
```

---

**`config.example.yaml`** (Place this in the project root)

```yaml
# Example config.yaml for MCP Access Point
server:
  host: "0.0.0.0"
  port: 8080
  logger:
    level: "info" # trace, debug, info, warn, error, fatal

mcps:
  - id: petstore_service
    upstream_id: petstore_backend
    path: https://petstore.swagger.io/v2/swagger.json # Remote OpenAPI spec
    # path: ./fixtures/openapi/petstore.json # Example for local file
  
  - id: weather_service
    upstream_id: weather_api_backend
    routes:
      - id: "get_current_weather_route"
        operation_id: "getCurrentWeather"
        uri: "/data/2.5/weather" # Upstream URI template
        method: "GET"
        meta:
          name: "Get Current Weather by City"
          inputSchema: {
            "type": "object",
            "properties": {
              "q": {"type": "string", "description": "City name"},
              "appid": {"type": "string", "description": "API key"}
            },
            "required": ["q", "appid"]
          }
      - id: "get_forecast_route"
        operation_id: "getWeatherForecast"
        uri: "/data/2.5/forecast?lat={lat}&lon={lon}&appid={appid}"
        method: "GET"
        meta:
          name: "Get 5 day weather forecast"
          inputSchema: {
            "type": "object",
            "properties": {
                "lat": {"type": "number"},
                "lon": {"type": "number"},
                "appid": {"type": "string"}
            },
            "required": ["lat", "lon", "appid"]
          }

upstreams:
  - id: petstore_backend
    nodes:
      "petstore.swagger.io:443": 1 # Note: This is the host of the swagger.json, actual API might be different
                                   # For a real service, point to actual API servers
    scheme: https
    type: roundrobin
    pass_host: rewrite # 'pass' or 'rewrite'
    upstream_host: "petstore.swagger.io" # Used if pass_host is 'rewrite'
    headers:
      X-Forwarded-For-Client: "mcp-gateway"

  - id: weather_api_backend
    nodes:
      "api.openweathermap.org:443": 1
    scheme: https
    type: roundrobin
    pass_host: rewrite
    upstream_host: "api.openweathermap.org"
    headers:
      X-Custom-Weather-Header: "SetByGateway"
```

---

**`src/types/mcp.types.ts`**

```typescript
export interface McpOperation {
  id: string; // Unique identifier for the route or OpenAPI operation
  operationId: string; // Corresponds to MCP operation_id
  upstreamUriTemplate: string;
  upstreamMethod: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';
  inputSchema?: Record<string, any>; // JSON Schema for input validation
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
```

---

**`src/config/config.types.ts`**

```typescript
import { z } from 'zod';
import { configSchema } from './config.schema';

export type AppConfig = z.infer<typeof configSchema>;

export type McpConfig = AppConfig['mcps'][number];
export type RouteConfig = McpConfig['routes'][number];
export type UpstreamConfig = AppConfig['upstreams'][number];
export type NodeConfig = UpstreamConfig['nodes'];
```

---

**`src/config/config.schema.ts`**

```typescript
import { z } from 'zod';

const HttpMethodSchema = z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD']);

const RouteMetaSchema = z.object({
  name: z.string().optional(),
  inputSchema: z.record(z.any()).optional(), // JSON Schema object
});

const RouteConfigSchema = z.object({
  id: z.string(),
  operation_id: z.string(),
  uri: z.string(), // Upstream URI template
  method: HttpMethodSchema,
  meta: RouteMetaSchema.optional(),
});

const McpConfigSchema = z.object({
  id: z.string(),
  upstream_id: z.string(),
  path: z.string().optional(), // Path to OpenAPI spec
  routes: z.array(RouteConfigSchema).optional(),
});

const NodeConfigSchema = z.record(z.string().regex(/^[^:]+:\d+$/), z.number().int().positive()); // "host:port": weight

const UpstreamConfigSchema = z.object({
  id: z.string(),
  nodes: NodeConfigSchema,
  scheme: z.enum(['http', 'https']),
  type: z.enum(['roundrobin', 'random', 'ip_hash']).default('roundrobin'),
  pass_host: z.enum(['pass', 'rewrite']).default('rewrite'),
  upstream_host: z.string().optional(),
  headers: z.record(z.string()).optional(),
  // Add health check config, timeouts, retries etc. for production
});

export const configSchema = z.object({
  server: z.object({
    host: z.string().default('0.0.0.0'),
    port: z.number().int().positive().default(8080),
    logger: z.object({
      level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
    }).default({ level: 'info' }),
  }).default({ host: '0.0.0.0', port: 8080, logger: { level: 'info' } }),
  mcps: z.array(McpConfigSchema),
  upstreams: z.array(UpstreamConfigSchema),
});
```

---

**`src/config/ConfigManager.ts`**

```typescript
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { AppConfig } from './config.types';
import { configSchema } from './config.schema';
import { ZodError } from 'zod';
import { logger } from '@/core/logger';

export class ConfigManager {
  private static instance: ConfigManager;
  public readonly config: AppConfig;

  private constructor(configPath: string) {
    try {
      const absolutePath = path.resolve(configPath);
      logger.info(`Loading configuration from: ${absolutePath}`);
      if (!fs.existsSync(absolutePath)) {
        throw new Error(`Configuration file not found at ${absolutePath}`);
      }
      const fileContents = fs.readFileSync(absolutePath, 'utf8');
      const rawConfig = yaml.load(fileContents);
      this.config = configSchema.parse(rawConfig);
      logger.info('Configuration loaded and validated successfully.');
      // Production: Implement hot-reloading or watch mechanism if needed
    } catch (error) {
      if (error instanceof ZodError) {
        logger.error('Configuration validation error:', error.errors);
      } else if (error instanceof Error) {
        logger.error(`Error loading configuration: ${error.message}`);
      } else {
        logger.error('Unknown error loading configuration:', error);
      }
      process.exit(1); // Critical error, cannot proceed
    }
  }

  public static getInstance(configPath?: string): ConfigManager {
    if (!ConfigManager.instance) {
      const confPath = configPath || process.env.CONFIG_PATH || './config.yaml';
      ConfigManager.instance = new ConfigManager(confPath);
    }
    return ConfigManager.instance;
  }

  public getMcpService(serviceId: string) {
    return this.config.mcps.find(mcp => mcp.id === serviceId);
  }

  public getUpstream(upstreamId: string) {
    return this.config.upstreams.find(up => up.id === upstreamId);
  }
}

// Initialize and export a singleton instance
export const configManager = ConfigManager.getInstance();
```

---

**`src/core/logger.ts`**

```typescript
import pino from 'pino';
import { configManager } from '@/config/ConfigManager'; // Import after it's potentially initialized

let currentLogger: pino.Logger;

function initializeLogger() {
  const logLevel = configManager?.config?.server?.logger?.level || 'info';
  const prettyPrint = process.env.NODE_ENV !== 'production' ? {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  } : {};

  currentLogger = pino({
    level: logLevel,
    ...prettyPrint,
  });
}

// Initialize logger early, but it will use default level until config is fully loaded.
// ConfigManager constructor will re-log its messages with the correct level if it changes.
if (!currentLogger) {
  initializeLogger();
}

export const logger = new Proxy({} as pino.Logger, {
  get: (_, prop) => {
    if (!currentLogger) { // Should not happen if main.ts imports logger after config
        initializeLogger();
    }
    return Reflect.get(currentLogger, prop);
  }
});

// Function to update logger if config changes (e.g., hot reload)
export function updateLogger() {
    initializeLogger();
    logger.info('Logger configuration updated.');
}

```

---

**`src/core/errors.ts`**

```typescript
export class HttpError extends Error {
  constructor(public statusCode: number, message: string, public code?: string, public details?: any) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Resource not found', details?: any) {
    super(404, message, 'NOT_FOUND', details);
  }
}

export class BadRequestError extends HttpError {
  constructor(message = 'Bad request', details?: any) {
    super(400, message, 'BAD_REQUEST', details);
  }
}

export class ValidationError extends HttpError {
  constructor(message = 'Validation failed', details?: any) {
    super(422, message, 'VALIDATION_ERROR', details); // Or 400 depending on preference
  }
}

export class UpstreamServiceError extends HttpError {
  constructor(message = 'Upstream service error', statusCode = 502, details?: any) {
    super(statusCode, message, 'UPSTREAM_ERROR', details);
  }
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}
```

---
**`src/features/validation/InputValidator.ts`**
```typescript
import Ajv, { Schema } from 'ajv';
import addFormats from 'ajv-formats';
import { ValidationError } from '@/core/errors';
import { logger } from '@/core/logger';

export class InputValidator {
  private ajv: Ajv;

  constructor() {
    this.ajv = new Ajv({ allErrors: true });
    addFormats(this.ajv);
  }

  public validate(schema: Schema, data: any): { valid: boolean; errors?: Ajv.ErrorObject[] } {
    try {
      const validate = this.ajv.compile(schema);
      const valid = validate(data);
      if (!valid) {
        return { valid: false, errors: validate.errors || [] };
      }
      return { valid: true };
    } catch (error) {
      logger.error('Error compiling JSON schema or validating:', error);
      // This typically means the schema itself is invalid
      throw new ValidationError('Invalid schema definition for validation.', {
        internalError: (error as Error).message,
      });
    }
  }
}

export const inputValidator = new InputValidator();
```
---

**`src/features/endpoint-definition/OpenApiParser.ts`**

```typescript
import SwaggerParser from 'swagger-parser';
import { OpenAPI, OpenAPIV2, OpenAPIV3 } from 'openapi-types';
import { McpOperation } from '@/types/mcp.types';
import { logger } from '@/core/logger';
import { ConfigurationError } from '@/core/errors';

export class OpenApiParser {
  public async parse(specPathOrUrl: string): Promise<McpOperation[]> {
    try {
      // Dereference resolves $refs
      const api = (await SwaggerParser.dereference(specPathOrUrl)) as OpenAPIV2.Document | OpenAPIV3.Document;
      logger.info(`Successfully parsed and dereferenced OpenAPI spec: ${specPathOrUrl}`);
      return this.extractOperations(api);
    } catch (error) {
      logger.error(`Failed to parse or dereference OpenAPI spec from ${specPathOrUrl}:`, error);
      throw new ConfigurationError(
        `OpenAPI spec error for ${specPathOrUrl}: ${(error as Error).message}`,
      );
    }
  }

  private extractOperations(api: OpenAPIV2.Document | OpenAPIV3.Document): McpOperation[] {
    const operations: McpOperation[] = [];
    const paths = api.paths || {};

    for (const pathKey in paths) {
      const pathItem = paths[pathKey] as OpenAPIV2.PathItemObject | OpenAPIV3.PathItemObject;
      if (!pathItem) continue;

      (['get', 'put', 'post', 'delete', 'patch', 'options', 'head'] as const).forEach(method => {
        const operation = pathItem[method] as OpenAPIV2.OperationObject | OpenAPIV3.OperationObject;
        if (operation) {
          const operationId = operation.operationId;
          if (!operationId) {
            logger.warn(`Operation at ${method.toUpperCase()} ${pathKey} is missing operationId. Skipping.`);
            return;
          }

          // Basic input schema extraction (can be more sophisticated)
          let inputSchema: Record<string, any> | undefined;
          if ('requestBody' in operation && operation.requestBody) {
             // For V3
            const requestBody = operation.requestBody as OpenAPIV3.RequestBodyObject;
            if (requestBody.content && requestBody.content['application/json']?.schema) {
                inputSchema = requestBody.content['application/json'].schema as Record<string, any>;
            }
          } else if ('parameters' in operation && operation.parameters) {
            // For V2 body parameter or V3 parameters (query, path, header)
            const bodyParam = (operation.parameters as any[])?.find(p => p.in === 'body');
            if (bodyParam?.schema) {
                inputSchema = bodyParam.schema as Record<string, any>;
            }
            // Note: Query/Path parameters might also be part of a conceptual "inputSchema"
            // for MCP. This needs careful mapping based on MCP protocol design.
            // For simplicity, we're mainly looking at request bodies here.
          }

          operations.push({
            id: `${operationId}_${method}`, // Ensure unique ID
            operationId: operationId,
            upstreamUriTemplate: pathKey, // This is the path, not full URI. Base URI comes from upstream.
            upstreamMethod: method.toUpperCase() as McpOperation['upstreamMethod'],
            inputSchema,
            // More details like parameter definitions, response schemas can be extracted
          });
        }
      });
    }
    logger.info(`Extracted ${operations.length} operations from OpenAPI spec.`);
    return operations;
  }
}

export const openApiParser = new OpenApiParser();
```

---
**`src/features/endpoint-definition/CustomRouteManager.ts`**
```typescript
import { McpConfig, RouteConfig } from '@/config/config.types';
import { McpOperation } from '@/types/mcp.types';
import { logger } from '@/core/logger';

export class CustomRouteManager {
  public transform(mcpServiceConfig: McpConfig): McpOperation[] {
    if (!mcpServiceConfig.routes || mcpServiceConfig.routes.length === 0) {
      return [];
    }

    const operations: McpOperation[] = mcpServiceConfig.routes.map((route: RouteConfig) => {
      logger.debug(`Transforming custom route: ${route.id} for service ${mcpServiceConfig.id}`);
      return {
        id: route.id,
        operationId: route.operation_id,
        upstreamUriTemplate: route.uri,
        upstreamMethod: route.method,
        inputSchema: route.meta?.inputSchema,
      };
    });
    logger.info(`Transformed ${operations.length} custom routes for service ${mcpServiceConfig.id}.`);
    return operations;
  }
}

export const customRouteManager = new CustomRouteManager();
```

---
**`src/features/upstream-handler/httpClient.ts`**
```typescript
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
  headers: Dispatcher.Headers;
  body: Buffer; // Or stream if needed, but Buffer is simpler for now
}

export async function makeHttpRequest(options: HttpClientOptions): Promise<HttpClientResponse> {
  logger.debug(`Making upstream HTTP request: ${options.method} ${options.url}`);
  try {
    const { statusCode, headers, body: responseBodyStream } = await request(options.url, {
      method: options.method as Dispatcher.HttpMethod,
      headers: options.headers,
      body: options.body,
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
      headers,
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
```
---
**`src/features/upstream-handler/LoadBalancer.ts`**
```typescript
import { UpstreamConfig } from '@/config/config.types';
import { logger } from '@/core/logger';
import { McpRequestContext } from '@/types/mcp.types'; // For IP hash
import crypto from 'crypto';

export class LoadBalancer {
  private roundRobinCounters: Map<string, number> = new Map();

  public getNextNode(upstreamConfig: UpstreamConfig, context?: McpRequestContext): string {
    const nodesArray = Object.entries(upstreamConfig.nodes);
    if (nodesArray.length === 0) {
      logger.error(`No nodes configured for upstream: ${upstreamConfig.id}`);
      throw new Error(`No nodes for upstream ${upstreamConfig.id}`);
    }
    if (nodesArray.length === 1) {
      return nodesArray[0][0]; // host:port string
    }

    // Expand nodes by weight for weighted strategies
    const weightedNodes: string[] = [];
    nodesArray.forEach(([node, weight]) => {
      for (let i = 0; i < weight; i++) {
        weightedNodes.push(node);
      }
    });

    let selectedNode: string;

    switch (upstreamConfig.type) {
      case 'random':
        selectedNode = weightedNodes[Math.floor(Math.random() * weightedNodes.length)];
        break;
      case 'ip_hash':
        if (!context?.clientIp) {
          logger.warn(`IP Hash selected for upstream ${upstreamConfig.id} but no client IP in context. Falling back to round-robin on weighted nodes.`);
          // Fallback to round-robin on weighted nodes if IP is missing
          const rrIndex = (this.roundRobinCounters.get(upstreamConfig.id) || 0) % weightedNodes.length;
          selectedNode = weightedNodes[rrIndex];
          this.roundRobinCounters.set(upstreamConfig.id, rrIndex + 1);
        } else {
          const hash = crypto.createHash('md5').update(context.clientIp).digest('hex');
          const index = parseInt(hash.substring(0, 8), 16) % nodesArray.length; // Hash based on original nodes, not weighted
          selectedNode = nodesArray[index][0];
        }
        break;
      case 'roundrobin':
      default:
        const currentIndex = (this.roundRobinCounters.get(upstreamConfig.id) || 0) % weightedNodes.length;
        selectedNode = weightedNodes[currentIndex];
        this.roundRobinCounters.set(upstreamConfig.id, currentIndex + 1);
        break;
    }
    logger.debug(`Selected node for upstream ${upstreamConfig.id} using ${upstreamConfig.type}: ${selectedNode}`);
    return selectedNode;
  }
}

export const loadBalancer = new LoadBalancer();
```
---

**`src/features/upstream-handler/UpstreamRequestHandler.ts`**

```typescript
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
```

---
**`src/features/protocol-conversion/ProtocolConverter.ts`**
```typescript
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
```

---

**`src/services/McpService.ts`** (Manages operations for a single configured MCP service/tenant)

```typescript
import { McpConfig, UpstreamConfig } from '@/config/config.types';
import { McpOperation, McpRequestContext, ClientMcpResponse } from '@/types/mcp.types';
import { openApiParser } from '@/features/endpoint-definition/OpenApiParser';
import { customRouteManager } from '@/features/endpoint-definition/CustomRouteManager';
import { inputValidator } from '@/features/validation/InputValidator';
import { upstreamRequestHandler } from '@/features/upstream-handler/UpstreamRequestHandler';
import { protocolConverter } from '@/features/protocol-conversion/ProtocolConverter';
import { logger } from '@/core/logger';
import { NotFoundError, BadRequestError, ValidationError, ConfigurationError } from '@/core/errors';
import { configManagerInstance } from '@/config/ConfigManager'; // Use the actual instance

export class McpService {
  private operations: Map<string, McpOperation> = new Map(); // operation_id -> McpOperation
  private upstreamConfig: UpstreamConfig;

  constructor(public readonly serviceConfig: McpConfig) {
    const upstream = configManagerInstance.getUpstream(serviceConfig.upstream_id);
    if (!upstream) {
      throw new ConfigurationError(
        `Upstream_id "${serviceConfig.upstream_id}" not found for MCP service "${serviceConfig.id}"`,
      );
    }
    this.upstreamConfig = upstream;
  }

  public async initialize(): Promise<void> {
    logger.info(`Initializing MCP Service: ${this.serviceConfig.id}`);
    let parsedOperations: McpOperation[] = [];

    if (this.serviceConfig.path) {
      try {
        parsedOperations = await openApiParser.parse(this.serviceConfig.path);
      } catch (error) {
        logger.error(`Failed to initialize OpenAPI for service ${this.serviceConfig.id}: ${(error as Error).message}`);
        // Depending on policy, either throw or continue with custom routes only
        // For now, we throw if essential path parsing fails.
        throw error;
      }
    }

    const customOperations = customRouteManager.transform(this.serviceConfig);
    
    // Merge and register operations. Custom routes can override OpenAPI ones if operation_ids match.
    [...parsedOperations, ...customOperations].forEach(op => {
      if (this.operations.has(op.operationId)) {
          logger.warn(`Overriding operation "${op.operationId}" for service "${this.serviceConfig.id}" (likely custom route overriding OpenAPI)`);
      }
      this.operations.set(op.operationId, op);
      logger.debug(`Registered operation: ${op.operationId} (ID: ${op.id}) for service ${this.serviceConfig.id}`);
    });

    if (this.operations.size === 0) {
        logger.warn(`No operations loaded for MCP service: ${this.serviceConfig.id}. This service will not be able to process requests.`);
    } else {
        logger.info(`MCP Service ${this.serviceConfig.id} initialized with ${this.operations.size} operations.`);
    }
  }

  public getOperation(operationId: string): McpOperation | undefined {
    return this.operations.get(operationId);
  }

  public async processRequest(context: McpRequestContext): Promise<ClientMcpResponse> {
    logger.info(`[${context.requestId}] Processing request for service "${context.serviceId}", operation "${context.operationId}"`);

    const operation = this.getOperation(context.operationId);
    if (!operation) {
      logger.warn(`[${context.requestId}] Operation not found: ${context.operationId} for service ${context.serviceId}`);
      throw new NotFoundError(`Operation "${context.operationId}" not found in service "${context.serviceId}"`);
    }

    // 1. Input Validation (if schema exists)
    if (operation.inputSchema) {
      logger.debug(`[${context.requestId}] Validating input for operation ${operation.operationId}`);
      const validationResult = inputValidator.validate(operation.inputSchema, context.payload);
      if (!validationResult.valid) {
        logger.warn(`[${context.requestId}] Input validation failed for ${operation.operationId}:`, validationResult.errors);
        throw new ValidationError('Input validation failed', validationResult.errors);
      }
      logger.debug(`[${context.requestId}] Input validation successful for ${operation.operationId}`);
    }

    // 2. Forward to Upstream
    try {
      const upstreamResponse = await upstreamRequestHandler.handleRequest(
        context,
        operation,
        this.upstreamConfig,
      );
      
      // 3. Convert Upstream Response to MCP Response
      return protocolConverter.httpToMcpResponse(upstreamResponse);
    } catch (error) {
        // Errors like UpstreamServiceError, ConfigurationError might be thrown from upstreamRequestHandler
        // Re-throw them to be caught by the server's error handler
        logger.error(`[${context.requestId}] Error during upstream request or protocol conversion for ${operation.operationId}: ${(error as Error).message}`);
        throw error;
    }
  }
}
```

---

**`src/features/request-routing/RequestRouter.ts`**

```typescript
import { McpService } from '@/services/McpService';
import { configManager } from '@/config/ConfigManager';
import { logger } from '@/core/logger';
import { ConfigurationError, NotFoundError } from '@/core/errors';

export class RequestRouter {
  private services: Map<string, McpService> = new Map(); // service_id -> McpService instance

  public async initialize(): Promise<void> {
    logger.info('Initializing Request Router...');
    const mcpConfigs = configManager.config.mcps;

    if (!mcpConfigs || mcpConfigs.length === 0) {
      logger.warn('No MCP services (tenants) defined in configuration.');
      return;
    }

    for (const mcpConfig of mcpConfigs) {
      try {
        const service = new McpService(mcpConfig);
        await service.initialize(); // This loads OpenAPI/custom routes for the service
        this.services.set(mcpConfig.id, service);
        logger.info(`Request Router: Successfully initialized and registered service "${mcpConfig.id}"`);
      } catch (error) {
        logger.error(`Failed to initialize service "${mcpConfig.id}" for Request Router: ${(error as Error).message}`);
        // Depending on policy, you might want to stop the server or continue without this service.
        // For now, we'll log and continue, but this service will be unavailable.
        if (error instanceof ConfigurationError) {
            // If it's a config error specific to this service, we might let others load.
        } else {
            throw error; // Propagate if it's a more critical/unexpected error during init
        }
      }
    }
    logger.info('Request Router initialized.');
  }

  public getService(serviceId: string): McpService | undefined {
    const service = this.services.get(serviceId);
    if (!service) {
        logger.warn(`Attempted to route to unknown service: ${serviceId}`);
    }
    return service;
  }
}

export const requestRouter = new RequestRouter();
```

---
**`src/features/transport/SseHandler.ts`**
```typescript
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

  // Handle incoming messages if your MCP-SSE protocol defines client-to-server events
  // This example assumes SSE is mostly server-to-client.
  // If client sends data (e.g. via POST to this endpoint before upgrading or some other means):
  // `request.socket.on('data', (chunk) => { ... parse mcp_request ... });`
  // For a GET-based SSE, client requests are typically made via separate HTTP calls,
  // and this SSE channel is just for responses. The YAML snippets imply this model.
  //
  // The provided yaml.md doesn't specify how requests are sent *over* an established SSE connection.
  // It only describes the connection endpoint.
  // Let's assume for now that `operation_id` and `payload` come via a *separate* mechanism
  // (e.g. client makes a POST to a different endpoint, or MCP defines a message type for requests over SSE).
  //
  // To make this example interactive *without* a full bi-di SSE protocol:
  // We could have a mock "request" that triggers a flow when the SSE connects.
  // This is NOT how a real system would work but illustrates the response part.
  //
  // A more realistic pattern:
  // 1. Client establishes SSE connection.
  // 2. Client makes a standard HTTP POST to `/api/{service_id}/some_mcp_trigger_endpoint` with MCP request.
  // 3. That POST handler processes the request using `mcpService.processRequest`.
  // 4. The result is then somehow "published" to the relevant SSE connection(s). This requires a pub/sub mechanism or connection tracking.
  //
  // For this simplified example, we'll assume a hypothetical scenario where an "mcp_request" event is received.
  // This part is highly dependent on the actual MCP over SSE spec.

  request.raw.on('data', async (chunk) => {
    // This is a simplified way to handle incoming data on the same HTTP request.
    // It's not standard for GET SSE connections but illustrates a point.
    // A better way is a separate message queue or direct client request events.
    try {
      const messageStr = chunk.toString().trim();
      // Expecting: event: mcp_request\ndata: { "operation_id": "...", "payload": {...} }\n\n
      if (messageStr.includes('event: mcp_request')) {
        const dataLine = messageStr.split('\n').find(line => line.startsWith('data:'));
        if (dataLine) {
          const jsonData = dataLine.substring('data:'.length).trim();
          const clientMcpRequest: ClientMcpRequest = JSON.parse(jsonData);
          
          const internalRequestId = randomUUID(); // New ID for this specific operation
          logger.info(`[${internalRequestId}] SSE Data Received for service ${serviceId}: op=${clientMcpRequest.operation_id}`);

          const context: McpRequestContext = {
            serviceId,
            operationId: clientMcpRequest.operation_id,
            payload: clientMcpRequest.payload,
            clientIp: request.ip,
            requestId: internalRequestId,
          };

          try {
            const mcpResponse = await mcpService.processRequest(context);
            sendSseEvent(reply, mcpResponse.success ? 'mcp_response' : 'mcp_error', mcpResponse, internalRequestId);
          } catch (error) {
            let statusCode = 500;
            let errorMessage = 'Internal server error';
            let errorCode = 'INTERNAL_ERROR';
            let errorDetails: any = undefined;

            if (error instanceof HttpError) {
              statusCode = error.statusCode; // Not directly used in SSE event data, but for logging
              errorMessage = error.message;
              errorCode = error.code || `HTTP_${statusCode}`;
              errorDetails = error.details;
            } else if (error instanceof Error) {
              errorMessage = error.message;
            }
             logger.error(`[${internalRequestId}] Error processing SSE request for ${serviceId}/${clientMcpRequest.operation_id}: ${errorMessage}`, error);
            const errorResponse: ClientMcpResponse = {
              success: false,
              error: { code: errorCode, message: errorMessage, details: errorDetails },
            };
            sendSseEvent(reply, 'mcp_error', errorResponse, internalRequestId);
          }
        }
      }
    } catch (parseError) {
      logger.warn(`[${clientRequestId}] Failed to parse incoming data on SSE stream for ${serviceId}:`, parseError);
      sendSseEvent(reply, 'mcp_protocol_error', { error: 'Invalid message format' }, clientRequestId);
    }
  });


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
```
**Note on SSE Handler:** The SSE handler above is simplified. True bi-directional communication over SSE, where the client sends multiple requests *after* connection, is not standard for GET-based SSE. It typically involves the client making separate HTTP requests, and the server pushing responses/updates over the SSE channel. The `request.raw.on('data', ...)` part is an illustrative hack for this example; a real system would use a message bus or track client requests to their SSE connections.

---
**`src/features/transport/StreamableHttpHandler.ts`**
```typescript
import { FastifyReply, FastifyRequest } from 'fastify';
import { requestRouter } from '@/features/request-routing/RequestRouter';
import { McpRequestContext, ClientMcpRequest, ClientMcpResponse } from '@/types/mcp.types';
import { HttpError, NotFoundError, BadRequestError } from '@/core/errors';
import { logger } from '@/core/logger';
import { randomUUID } from 'crypto';

// This handler assumes MCP messages are sent as newline-delimited JSON (NDJSON)
// in both request and response bodies for streaming.
// Production systems might use a more robust framing protocol (e.g., length-prefixing).

export async function handleStreamableHttpRequest(request: FastifyRequest, reply: FastifyReply) {
  const serviceId = (request.params as { serviceId?: string }).serviceId;
  const clientRequestId = request.headers['x-request-id'] as string || randomUUID(); // For the overall stream

  if (request.method !== 'POST') {
    reply.code(405).send({ error: 'Method Not Allowed. Use POST for streamable HTTP.' });
    return;
  }
  
  if (!serviceId) {
    // Similar to SSE, generic /mcp/ would require in-band service routing.
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

  logger.info(`[${clientRequestId}] Streamable HTTP connection established for service: ${serviceId}, client: ${request.ip}`);

  // Set headers for streaming response
  reply.raw.writeHead(200, {
    'Content-Type': 'application/x-ndjson', // Or 'application/json-seq'
    'Transfer-Encoding': 'chunked',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*', // Adjust for production
  });

  let buffer = '';
  request.raw.on('data', async (chunk) => {
    buffer += chunk.toString('utf-8');
    let boundary = buffer.indexOf('\n');
    while (boundary !== -1) {
      const messageStr = buffer.substring(0, boundary).trim();
      buffer = buffer.substring(boundary + 1);
      boundary = buffer.indexOf('\n');

      if (messageStr.length === 0) continue;

      const operationRequestId = randomUUID(); // For this specific operation within the stream
      try {
        const clientMcpRequest: ClientMcpRequest = JSON.parse(messageStr);
        logger.info(`[${operationRequestId}] Streamable HTTP Message Received for ${serviceId}: op=${clientMcpRequest.operation_id}`);

        const context: McpRequestContext = {
          serviceId,
          operationId: clientMcpRequest.operation_id,
          payload: clientMcpRequest.payload,
          clientIp: request.ip,
          requestId: operationRequestId,
        };
        
        let mcpResponse: ClientMcpResponse;
        try {
          mcpResponse = await mcpService.processRequest(context);
        } catch (error) {
          let statusCode = 500;
          let errorMessage = 'Internal server error';
          let errorCode = 'INTERNAL_ERROR';
          let errorDetails: any = undefined;

          if (error instanceof HttpError) {
            statusCode = error.statusCode; // For logging
            errorMessage = error.message;
            errorCode = error.code || `HTTP_${statusCode}`;
            errorDetails = error.details;
          } else if (error instanceof Error) {
            errorMessage = error.message;
          }
          logger.error(`[${operationRequestId}] Error processing streamable HTTP request for ${serviceId}/${clientMcpRequest.operation_id}: ${errorMessage}`, error);
          mcpResponse = {
            success: false,
            error: { code: errorCode, message: errorMessage, details: errorDetails },
          };
        }
        
        if (!reply.raw.writableEnded) {
            reply.raw.write(JSON.stringify(mcpResponse) + '\n');
        } else {
            logger.warn(`[${operationRequestId}] Attempted to write to an already ended streamable HTTP response.`);
            request.raw.destroy(); // Stop further processing if client closed
            break; 
        }

      } catch (parseError) {
        logger.warn(`[${clientRequestId}] Failed to parse incoming JSON message on stream for ${serviceId}: "${messageStr}"`, parseError);
        const errorResponse: ClientMcpResponse = {
          success: false,
          error: { code: 'INVALID_JSON', message: 'Invalid JSON message received' },
        };
        if (!reply.raw.writableEnded) {
            reply.raw.write(JSON.stringify(errorResponse) + '\n');
        }
      }
    }
  });

  request.raw.on('end', () => {
    logger.info(`[${clientRequestId}] Streamable HTTP request body ended for service: ${serviceId}`);
    // If there's any remaining data in the buffer (no trailing newline)
    if (buffer.trim().length > 0) {
        // Process remaining buffer content (similar to loop above)
        // This is simplified here; robust parsing would handle this.
        logger.warn(`[${clientRequestId}] Unprocessed data at end of stream: "${buffer.trim()}"`);
    }
    if (!reply.raw.writableEnded) {
      reply.raw.end(); // End the response stream if client finished sending
    }
  });

  request.raw.on('error', (err) => {
    logger.error(`[${clientRequestId}] Streamable HTTP request error for service ${serviceId}:`, err);
    if (!reply.raw.writableEnded) {
      reply.raw.end(); // Ensure response stream is closed
    }
  });
  
  reply.raw.on('close', () => {
     logger.info(`[${clientRequestId}] Streamable HTTP response stream closed by client for service ${serviceId}.`);
     request.raw.destroy(); // Ensure request stream is also destroyed to free resources
  });
}
```

---
**`src/core/McpServer.ts`**

```typescript
import fastify, { FastifyInstance, FastifyServerOptions } from 'fastify';
import sensible from '@fastify/sensible'; // For error handling utilities
import { configManager } from '@/config/ConfigManager';
import { logger, updateLogger } from '@/core/logger';
import { requestRouter } from '@/features/request-routing/RequestRouter';
import { handleSseConnection } from '@/features/transport/SseHandler';
import { handleStreamableHttpRequest } from '@/features/transport/StreamableHttpHandler';
import { HttpError } from './errors';
import { ClientMcpResponse } from '@/types/mcp.types';


export class McpServer {
  public app: FastifyInstance;
  private readonly host: string;
  private readonly port: number;

  constructor() {
    this.host = configManager.config.server.host;
    this.port = configManager.config.server.port;

    const fastifyOptions: FastifyServerOptions = {
      logger: false, // We use our custom logger
      requestIdHeader: 'x-request-id',
      genReqId: (req) => req.headers['x-request-id'] || randomUUID(),
    };
    this.app = fastify(fastifyOptions);
    this.registerPlugins();
    this.registerRoutes();
    this.registerErrorHandlers();
  }

  private registerPlugins() {
    this.app.register(sensible); // Provides request.sensible, reply.sensible, httpErrors
    // Add other plugins like rate limiting, CORS, helmet for production
    // this.app.register(import('@fastify/cors'), { origin: '*' }); // Example
  }

  private registerRoutes() {
    this.app.get('/', async () => ({ status: 'MCP Access Point is running' }));
    this.app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

    // Service-specific SSE endpoint
    this.app.get('/api/:serviceId/sse', handleSseConnection);
    this.app.get('/api/:serviceId/sse/', handleSseConnection); // With trailing slash

    // Service-specific Streamable HTTP endpoint
    this.app.post('/api/:serviceId/mcp', handleStreamableHttpRequest);
    this.app.post('/api/:serviceId/mcp/', handleStreamableHttpRequest);

    // Generic endpoints (if ever needed, would require in-band service routing)
    // this.app.get('/sse', handleGenericSse);
    // this.app.post('/mcp', handleGenericStreamableHttp);

    // Potentially an endpoint to expose loaded OpenAPI specs for introspection
    // this.app.get('/api/:serviceId/openapi.json', async (request, reply) => { ... });
  }

  private registerErrorHandlers() {
    this.app.setErrorHandler((error, request, reply) => {
      const requestId = request.id;
      if (error instanceof HttpError) {
        logger.warn(`[${requestId}] HTTP Error ${error.statusCode} for ${request.method} ${request.url}: ${error.message}`, error.details || '');
        const mcpErrorResponse: ClientMcpResponse = {
          success: false,
          error: {
            code: error.code || `HTTP_${error.statusCode}`,
            message: error.message,
            details: error.details,
          },
        };
        // For SSE/Streamable HTTP, errors are handled within their handlers.
        // This global handler is more for standard HTTP error responses.
        // If the connection is already an event stream, this won't apply correctly.
        if (!reply.sent && !reply.raw.headersSent) {
             reply.status(error.statusCode).send(mcpErrorResponse);
        } else {
            logger.warn(`[${requestId}] Error handler invoked but reply already sent/headersSent for ${request.url}`);
        }
      } else {
        logger.error(`[${requestId}] Unhandled error for ${request.method} ${request.url}:`, error);
        const mcpErrorResponse: ClientMcpResponse = {
          success: false,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'An unexpected internal server error occurred.',
          },
        };
         if (!reply.sent && !reply.raw.headersSent) {
            reply.status(500).send(mcpErrorResponse);
        } else {
             logger.warn(`[${requestId}] Unhandled error, but reply already sent/headersSent for ${request.url}`);
        }
      }
    });

    this.app.setNotFoundHandler((request, reply) => {
        const requestId = request.id;
        logger.warn(`[${requestId}] Route not found: ${request.method} ${request.url}`);
        const mcpErrorResponse: ClientMcpResponse = {
            success: false,
            error: { code: 'ROUTE_NOT_FOUND', message: `Route ${request.method} ${request.url} not found.`}
        };
        reply.status(404).send(mcpErrorResponse);
    });
  }

  public async start(): Promise<void> {
    try {
      // Initialize router (which initializes services and parsers)
      await requestRouter.initialize();
      
      // Update logger in case config changed its level
      updateLogger(); 

      await this.app.listen({ port: this.port, host: this.host });
      logger.info(`MCP Access Point server listening on http://${this.host}:${this.port}`);
    } catch (err) {
      logger.fatal('Failed to start server:', err);
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    logger.info('Stopping MCP Access Point server...');
    await this.app.close();
    logger.info('Server stopped.');
  }
}
```

---

**`src/main.ts`**

```typescript
// Ensure config is loaded first, as logger might depend on it
import { configManager } from './config/ConfigManager'; // This initializes config
import { logger } from './core/logger'; // Now logger can use configured level
import { McpServer } from './core/McpServer';

async function bootstrap() {
  logger.info(`Starting MCP Access Point in ${process.env.NODE_ENV || 'development'} mode...`);
  logger.info(`Using configuration: ${JSON.stringify(configManager.config, null, 2)}`);


  const server = new McpServer();
  await server.start();

  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  signals.forEach((signal) => {
    process.on(signal, async () => {
      logger.info(`Received ${signal}. Shutting down gracefully...`);
      await server.stop();
      process.exit(0);
    });
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.fatal('Unhandled Rejection at:', promise, 'reason:', reason);
    // Optionally, trigger a graceful shutdown
    // server.stop().finally(() => process.exit(1));
  });

  process.on('uncaughtException', (error) => {
    logger.fatal('Uncaught Exception:', error);
    // Optionally, trigger a graceful shutdown
    // server.stop().finally(() => process.exit(1));
  });
}

bootstrap().catch((error) => {
  logger.fatal('Failed to bootstrap application:', error);
  process.exit(1);
});
```

---

**`test/test-e2e.sh`** (Very basic example test script)

```bash
#!/bin/bash

# Make sure the server is running: npm run dev or npm run start

BASE_URL="http://localhost:8080"
SERVICE_ID_WEATHER="weather_service"
SERVICE_ID_PETSTORE="petstore_service"
REQUEST_ID=$(uuidgen)

echo "MCP Access Point E2E Test Script"
echo "================================="
echo "Using Request ID: $REQUEST_ID"
echo ""

# --- Health Check ---
echo "[TEST] Health Check"
curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health"
echo " Expected: 200, Got: $?"
echo ""

# --- Test Weather Service (Custom Route with GET, expecting query params in payload) ---
# For SSE/Streamable HTTP, true E2E testing is more complex.
# This example will simulate an MCP request that might be processed by the McpService.
# Actual client interaction for SSE/Streamable HTTP would use a client library.

echo "[TEST] Weather Service - getCurrentWeather (simulated)"
# This would typically be sent over an established SSE/Streamable connection.
# For a simple test, we can't easily do that with curl for the full flow.
# So, this part is more conceptual.
# A real test would use an SSE client or a streamable HTTP client.

# If we had a simple HTTP endpoint that internally calls McpService.processRequest:
# (This endpoint doesn't exist in the current McpServer.ts for simplicity)
# PAYLOAD_WEATHER='{"operation_id": "getCurrentWeather", "payload": {"q": "London", "appid": "YOUR_OPENWEATHER_API_KEY"}}'
# curl -X POST -H "Content-Type: application/json" -H "X-Request-ID: $REQUEST_ID" -d "$PAYLOAD_WEATHER" "$BASE_URL/api/$SERVICE_ID_WEATHER/mcp_process_debug"
# echo ""

echo "NOTE: Full E2E for SSE/Streamable HTTP requires a dedicated client."
echo "The current server routes primarily handle establishing these stream connections."
echo ""


# --- Test Petstore Service (OpenAPI based) ---
echo "[TEST] Petstore Service (conceptual - requires client)"
# Example operation: GET /v2/pet/findByStatus?status=available
# MCP Payload for this: { "operation_id": "findPetsByStatus", "payload": { "status": ["available"] } } (assuming param mapping)

# To test the OpenAPI parsing and routing logic, you would need to:
# 1. Start the server.
# 2. Use an SSE or Streamable HTTP client to connect to /api/petstore_service/sse or /api/petstore_service/mcp
# 3. Send the MCP request { "operation_id": "findPetsByStatus", "payload": { "status": "available" } }
#    (Note: OpenAPI spec defines 'status' as a query param, array of strings for findByStatus.
#     The payload mapping needs to be precise or the UpstreamRequestHandler needs to be smart.)
# 4. Observe the server logs for upstream request and the client for the MCP response.

echo "To test Petstore (e.g., findPetsByStatus):"
echo "1. Connect an SSE client to $BASE_URL/api/$SERVICE_ID_PETSTORE/sse/"
echo "2. Send an event from the client (if SSE handler supports bi-di this way):"
echo "   event: mcp_request"
echo "   data: {\"operation_id\": \"findPetsByStatus\", \"payload\": {\"status\": [\"available\"]}}"
echo "   (Requires findPetsByStatus to be a valid operationId from the Petstore OpenAPI spec)"
echo ""


# --- Test Non-Existent Service ---
echo "[TEST] Non-Existent Service"
# For SSE/Streamable, the connection attempt itself would fail with 404 if service doesn't exist.
# Example for SSE connection attempt:
TEMP_SSE_OUTPUT_NONEXISTENT=$(mktemp)
curl -N -s -o $TEMP_SSE_OUTPUT_NONEXISTENT -w "%{http_code}" "$BASE_URL/api/non_existent_service/sse/" &
CURL_PID_NONEXISTENT=$!
sleep 0.5 # Give curl a moment to connect or fail
kill $CURL_PID_NONEXISTENT > /dev/null 2>&1
wait $CURL_PID_NONEXISTENT > /dev/null 2>&1
HTTP_CODE_NONEXISTENT=$(cat $TEMP_SSE_OUTPUT_NONEXISTENT | head -n 1) # This is tricky, curl output might not be HTTP code here.
                                                                  # Better to check server logs or a proper client.
echo "Attempting SSE to non_existent_service (check server logs for 404)"
# A proper SSE client would show the 404 from the initial HTTP handshake.
# If using `curl -i`, you'd see the 404.
# curl -i -N "$BASE_URL/api/non_existent_service/sse/"
echo ""


echo "E2E Test Script Finished."
echo "Remember to replace YOUR_OPENWEATHER_API_KEY in config.example.yaml if testing weather."
```

**To run this:**

1.  Save all files in the specified directory structure.
2.  `npm install` (or `yarn`)
3.  `npm run build`
4.  `cp config.example.yaml config.yaml` (and edit `config.yaml` if needed, e.g., API keys).
5.  `npm run start` (or `npm run dev` for development).
6.  Open another terminal and run `bash test/test-e2e.sh`.

**Important Considerations for Production:**

*   **Error Handling:** Make it more robust. The current error handling is basic.
*   **Security:** Add Helmet, CORS (configured properly), rate limiting, input sanitization beyond JSON schema (if applicable). Potentially authentication/authorization layers (not specified in `yaml.md`).
*   **Real SSE/Streamable Client Handling:** The provided `SseHandler` and `StreamableHttpHandler` make assumptions about how clients send requests over the established stream. This needs to align with your actual MCP client implementation. For SSE, it's more common for the client to make separate HTTP requests to trigger actions, and the SSE connection is for server-pushed updates. The `request.raw.on('data', ...)` in `SseHandler` is a simplification.
*   **Resource Management:** Ensure proper cleanup of connections, intervals, etc., especially on errors or client disconnects.
*   **Upstream Complexity:** The `UpstreamRequestHandler`'s URI templating and payload-to-body/query logic is simplified. Real-world scenarios might need more sophisticated mapping, especially from OpenAPI parameter definitions.
*   **Metrics and Monitoring:** Integrate with Prometheus, Grafana, or similar.
*   **Clustering/Scaling:** For Node.js, use `cluster` module or a PM2-like process manager for multi-core utilization.
*   **Testing:** The provided test script is very basic. Comprehensive unit, integration, and true E2E tests (with actual SSE/Streamable clients) are crucial.
*   **OpenAPI Parameter Mapping:** The current `OpenApiParser` and `UpstreamRequestHandler` have basic logic for request body schemas. Mapping OpenAPI `parameters` (query, path, header) from an MCP payload to the upstream request needs careful design.
*   **Configuration Hot-Reloading:** For production, you might want to reload configuration without restarting the server.

This comprehensive skeleton should give you a very strong starting point for building the MCP Access Point in TypeScript. You can incrementally build out and refine each feature module.
