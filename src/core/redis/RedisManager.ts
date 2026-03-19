import Redis from 'ioredis';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import type { PubSubMessage } from '../types/index.js';

export class RedisManager {
  private client: Redis;
  private subscriber: Redis;
  private publisher: Redis;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private readonly eventHandlers: Map<string, Set<(message: PubSubMessage) => void>> = new Map();

  constructor() {
    const options: Record<string, unknown> = {
      host: config.redis.host,
      port: config.redis.port,
      db: config.redis.db,
      retryStrategy: (times: number) => {
        if (times > this.maxReconnectAttempts) {
          logger.error('Redis: Max reconnection attempts reached');
          return null;
        }
        const delay = Math.min(times * 100, 3000);
        logger.warn(`Redis: Reconnecting in ${delay}ms (attempt ${times})`);
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    };

    if (config.redis.password) {
      options.password = config.redis.password;
    }

    this.client = new Redis(options);
    this.subscriber = new Redis(options);
    this.publisher = new Redis(options);

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    const redisOptions = { connection: { strategy: 'recurring' as const } };
    
    this.client.on('connect', () => {
      logger.info('Redis Client: Connected');
      this.isConnected = true;
      this.reconnectAttempts = 0;
    });

    this.client.on('error', (error) => {
      logger.error('Redis Client Error:', error);
    });

    this.client.on('close', () => {
      logger.warn('Redis Client: Connection closed');
      this.isConnected = false;
    });

    this.subscriber.on('error', (error) => {
      logger.error('Redis Subscriber Error:', error);
    });

    this.publisher.on('error', (error) => {
      logger.error('Redis Publisher Error:', error);
    });
  }

  async connect(): Promise<void> {
    try {
      await Promise.all([
        this.client.connect(),
        this.subscriber.connect(),
        this.publisher.connect(),
      ]);
      logger.info('Redis: All connections established');
    } catch (error) {
      logger.error('Redis: Failed to connect', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await Promise.all([
      this.client.quit(),
      this.subscriber.quit(),
      this.publisher.quit(),
    ]);
    logger.info('Redis: All connections closed');
  }

  isHealthy(): boolean {
    return this.isConnected;
  }

  // Cache operations
  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await this.client.setex(key, ttlSeconds, serialized);
    } else {
      await this.client.set(key, serialized);
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    if (value) {
      return JSON.parse(value) as T;
    }
    return null;
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  async increment(key: string, amount: number = 1): Promise<number> {
    return this.client.incrby(key, amount);
  }

  async decrement(key: string, amount: number = 1): Promise<number> {
    return this.client.decrby(key, amount);
  }

  // Pub/Sub operations
  async publish(channel: string, message: unknown): Promise<number> {
    const serialized = JSON.stringify({
      channel,
      message,
      timestamp: new Date().toISOString(),
    });
    return this.publisher.publish(channel, serialized);
  }

  async subscribe(channel: string, handler: (message: PubSubMessage) => void): Promise<void> {
    if (!this.eventHandlers.has(channel)) {
      this.eventHandlers.set(channel, new Set());
      await this.subscriber.subscribe(channel);
    }
    this.eventHandlers.get(channel)?.add(handler);
  }

  async unsubscribe(channel: string, handler?: (message: PubSubMessage) => void): Promise<void> {
    if (handler) {
      this.eventHandlers.get(channel)?.delete(handler);
      if (this.eventHandlers.get(channel)?.size === 0) {
        this.eventHandlers.delete(channel);
        await this.subscriber.unsubscribe(channel);
      }
    } else {
      this.eventHandlers.delete(channel);
      await this.subscriber.unsubscribe(channel);
    }
  }

  // Presence management
  async addToSet(key: string, member: string): Promise<void> {
    await this.client.sadd(key, member);
  }

  async removeFromSet(key: string, member: string): Promise<void> {
    await this.client.srem(key, member);
  }

  async getSetMembers(key: string): Promise<string[]> {
    return this.client.smembers(key);
  }

  async isInSet(key: string, member: string): Promise<boolean> {
    return (await this.client.sismember(key, member)) === 1;
  }

  async getSetSize(key: string): Promise<number> {
    return this.client.scard(key);
  }

  // Connection pool tracking
  async trackConnection(socketId: string, userId?: string): Promise<void> {
    const key = `connections:${socketId}`;
    const data = {
      socketId,
      userId,
      connectedAt: Date.now(),
    };
    await this.client.hmset(key, data);
    await this.client.expire(key, 86400);
    
    if (userId) {
      await this.addToSet('users:online', userId);
      await this.client.hset(`user:${userId}:sockets`, socketId, '1');
    }
    
    await this.increment('stats:connections:total');
  }

  async untrackConnection(socketId: string): Promise<void> {
    const key = `connections:${socketId}`;
    const data = await this.client.hgetall(key);
    
    if (data.userId) {
      await this.removeFromSet('users:online', data.userId);
      await this.client.hdel(`user:${data.userId}:sockets`, socketId);
    }
    
    await this.client.del(key);
  }

  async getOnlineUsers(): Promise<string[]> {
    return this.getSetMembers('users:online');
  }

  async getOnlineCount(): Promise<number> {
    return this.getSetSize('users:online');
  }

  // Rate limiting
  async checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number; reset: number }> {
    const now = Date.now();
    const windowKey = `${key}:${Math.floor(now / (windowSeconds * 1000))}`;
    
    const current = await this.increment(windowKey);
    await this.client.expire(windowKey, windowSeconds);
    
    if (current === 1) {
      await this.client.expire(windowKey, windowSeconds);
    }
    
    return {
      allowed: current <= limit,
      remaining: Math.max(0, limit - current),
      reset: Math.ceil((Math.floor(now / (windowSeconds * 1000)) + 1) * (windowSeconds * 1000)),
    };
  }

  // Sorted sets for leaderboards/rankings
  async addToSortedSet(key: string, member: string, score: number): Promise<void> {
    await this.client.zadd(key, score, member);
  }

  async getRank(key: string, member: string): Promise<number | null> {
    const rank = await this.client.zrevrank(key, member);
    return rank !== null ? rank + 1 : null;
  }

  async getScore(key: string, member: string): Promise<number | null> {
    const score = await this.client.zscore(key, member);
    return score !== null ? parseFloat(score) : null;
  }

  async getTopN(key: string, n: number): Promise<{ member: string; score: number }[]> {
    const results = await this.client.zrevrange(key, 0, n - 1, 'WITHSCORES');
    const items: { member: string; score: number }[] = [];
    for (let i = 0; i < results.length; i += 2) {
      items.push({
        member: results[i],
        score: parseFloat(results[i + 1]),
      });
    }
    return items;
  }
}

export const redisManager = new RedisManager();
