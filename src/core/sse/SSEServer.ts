import { Request, Response } from 'express';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { redisManager } from '../redis/RedisManager.js';
import { EventEmitter } from 'events';

interface SSEClient {
  id: string;
  userId?: string;
  response: Response;
  lastEventId?: string;
  categories: Set<string>;
  connectedAt: Date;
}

export class SSEServer extends EventEmitter {
  private clients: Map<string, SSEClient> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private reconnectWindow: number = 30000;

  constructor() {
    super();
    this.setupRedisSubscription();
    this.startHeartbeat();
    this.startCleanup();
    
    logger.info('SSE Server initialized');
  }

  private async setupRedisSubscription(): Promise<void> {
    try {
      await redisManager.subscribe('sse:broadcast', (message) => {
        this.broadcastToMatching(message);
      });

      await redisManager.subscribe('sse:notification', (message) => {
        if (message.message.targetUserId) {
          this.sendToUser(message.message.targetUserId, 'notification', message.message);
        }
      });

      logger.info('SSE Redis subscriptions established');
    } catch (error) {
      logger.error('Failed to setup SSE Redis subscriptions', { error });
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, 30000);
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveClients();
    }, 60000);
  }

  private sendHeartbeat(): void {
    const heartbeat = `data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`;
    
    for (const [id, client] of this.clients) {
      try {
        client.response.write(heartbeat);
      } catch (error) {
        logger.warn('Failed to send heartbeat', { clientId: id });
        this.clients.delete(id);
      }
    }
  }

  private cleanupInactiveClients(): void {
    const now = Date.now();
    const timeout = 60000;

    for (const [id, client] of this.clients) {
      if (now - client.connectedAt.getTime() > timeout) {
        try {
          client.response.end();
        } catch {}
        this.clients.delete(id);
        logger.debug('Cleaned up inactive SSE client', { clientId: id });
      }
    }
  }

  async handleConnection(
    request: Request, 
    response: Response, 
    userId?: string
  ): Promise<string> {
    const clientId = `sse_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const categories = new Set<string>();
    
    const queryCategories = request.query.categories as string;
    if (queryCategories) {
      queryCategories.split(',').forEach(cat => categories.add(cat.trim()));
    }

    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    });

    const client: SSEClient = {
      id: clientId,
      userId,
      response,
      categories,
      connectedAt: new Date(),
    };

    this.clients.set(clientId, client);
    await redisManager.trackConnection(clientId, userId);

    logger.info('SSE client connected', { clientId, userId, categories: Array.from(categories) });

    response.on('close', () => {
      this.handleDisconnection(clientId);
    });

    response.write(`data: ${JSON.stringify({ 
      type: 'connected', 
      clientId,
      timestamp: Date.now() 
    })}\n\n`);

    this.emit('connection', { clientId, userId, categories: Array.from(categories) });

    return clientId;
  }

  private handleDisconnection(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      this.clients.delete(clientId);
      redisManager.untrackConnection(clientId).catch(() => {});
      logger.info('SSE client disconnected', { clientId, userId: client.userId });
      this.emit('disconnection', { clientId, userId: client.userId });
    }
  }

  send(clientId: string, event: string, data: unknown): boolean {
    const client = this.clients.get(clientId);
    if (!client) {
      return false;
    }

    try {
      const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      client.response.write(message);
      return true;
    } catch (error) {
      logger.error('Failed to send SSE message', { clientId, error });
      this.clients.delete(clientId);
      return false;
    }
  }

  sendToUser(userId: string, event: string, data: unknown): number {
    let sent = 0;
    for (const [clientId, client] of this.clients) {
      if (client.userId === userId) {
        if (this.send(clientId, event, data)) {
          sent++;
        }
      }
    }
    return sent;
  }

  broadcast(event: string, data: unknown, category?: string): number {
    let sent = 0;
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

    for (const [clientId, client] of this.clients) {
      if (!category || client.categories.has(category)) {
        try {
          client.response.write(message);
          sent++;
        } catch (error) {
          this.clients.delete(clientId);
        }
      }
    }

    return sent;
  }

  private broadcastToMatching(message: { message: { event?: string; data?: unknown; category?: string } }): void {
    if (message.message.event && message.message.data) {
      this.broadcast(message.message.event, message.message.data, message.message.category);
    }
  }

  async broadcastToAllNodes(event: string, data: unknown, category?: string): Promise<void> {
    await redisManager.publish('sse:broadcast', {
      event,
      data,
      category,
      source: config.node.instanceId,
    });
  }

  subscribeToCategory(clientId: string, category: string): boolean {
    const client = this.clients.get(clientId);
    if (client) {
      client.categories.add(category);
      return true;
    }
    return false;
  }

  unsubscribeFromCategory(clientId: string, category: string): boolean {
    const client = this.clients.get(clientId);
    if (client) {
      client.categories.delete(category);
      return true;
    }
    return false;
  }

  getClientCount(): number {
    return this.clients.size;
  }

  getClientInfo(clientId: string): SSEClient | undefined {
    return this.clients.get(clientId);
  }

  async shutdown(): Promise<void> {
    logger.info('SSE Server shutting down');

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    for (const client of this.clients.values()) {
      try {
        client.response.end();
      } catch {}
    }

    this.clients.clear();
  }
}

export const sseServer = new SSEServer();
