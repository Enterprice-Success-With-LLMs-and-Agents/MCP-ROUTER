import SwaggerParser from '@apidevtools/swagger-parser';
import { OpenAPI, OpenAPIV2, OpenAPIV3 } from 'openapi-types';
import { McpOperation } from '@/types/mcp.types';
import { logger } from '@/core/logger';
import { ConfigurationError } from '@/core/errors';

export class OpenApiParser {
  public async parse(specPathOrUrl: string): Promise<McpOperation[]> {
    try {
      // Dereference resolves $refs
      const api = await SwaggerParser.bundle(specPathOrUrl) as OpenAPIV2.Document | OpenAPIV3.Document;
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