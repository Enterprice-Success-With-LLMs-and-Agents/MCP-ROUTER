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