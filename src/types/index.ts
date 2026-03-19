import type { Socket } from 'socket.io';

export interface User {
  id: string;
  username: string;
  email: string;
  connected: boolean;
  lastSeen: Date;
}

export interface Connection {
  id: string;
  userId?: string;
  socketId: string;
  type: 'websocket' | 'sse';
  ip: string;
  connectedAt: Date;
  lastActivity: Date;
  metadata?: Record<string, unknown>;
}

export interface Message {
  id: string;
  type: string;
  payload: unknown;
  timestamp: Date;
  sender?: string;
  recipient?: string;
  channel?: string;
}

export interface Room {
  id: string;
  name: string;
  members: Set<string>;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

export interface EventPayload {
  event: string;
  data: unknown;
  timestamp: Date;
  source?: string;
}

export interface PubSubMessage {
  channel: string;
  message: unknown;
  timestamp: Date;
  source?: string;
}

export interface RateLimitInfo {
  remaining: number;
  limit: number;
  reset: Date;
}

export interface CircuitBreakerState {
  name: string;
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  lastFailure?: Date;
  nextAttempt?: Date;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  connections: {
    active: number;
    total: number;
  };
  services: {
    redis: boolean;
    database?: boolean;
  };
  timestamp: Date;
}

export interface MetricsSnapshot {
  requests: {
    total: number;
    success: number;
    errors: number;
    latency: {
      min: number;
      max: number;
      avg: number;
      p50: number;
      p95: number;
      p99: number;
    };
  };
  websocket: {
    connections: number;
    messagesPerSecond: number;
    bytesTransferred: number;
  };
  redis: {
    hits: number;
    misses: number;
    commandsPerSecond: number;
  };
}

export interface AuthToken {
  userId: string;
  username: string;
  roles: string[];
  issuedAt: Date;
  expiresAt: Date;
}

export interface WebSocketClient extends Socket {
  userId?: string;
  roomId?: string;
  connectedAt?: Date;
}

export type EventHandler = (payload: EventPayload) => Promise<void> | void;

export interface ServiceMessage {
  type: 'message' | 'broadcast' | 'notification' | 'presence';
  target?: string;
  payload: unknown;
  metadata?: Record<string, unknown>;
}

export interface RetryOptions {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors?: (string | RegExp)[];
}

export interface FailoverConfig {
  enabled: boolean;
  healthCheckInterval: number;
  failoverThreshold: number;
  recoveryTimeout: number;
}

export {
  // Re-export common types
  Socket,
};
