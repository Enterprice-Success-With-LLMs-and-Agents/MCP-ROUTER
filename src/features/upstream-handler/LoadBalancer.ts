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