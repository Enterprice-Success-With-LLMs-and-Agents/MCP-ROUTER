import { z } from 'zod';
import { configSchema } from './config.schema';

export type AppConfig = z.infer<typeof configSchema>;
export type McpConfig = AppConfig['mcps'][number];
export type RouteConfig = NonNullable<McpConfig['routes']>[number];
export type UpstreamConfig = AppConfig['upstreams'][number];
export type NodeConfig = UpstreamConfig['nodes'];