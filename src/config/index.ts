import dotenv from 'dotenv';
dotenv.config();

export const config = {
  node: {
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
    instanceId: process.env.INSTANCE_ID || `${require('os').hostname()}-${process.pid}`,
  },
  
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'realtime:',
    cluster: process.env.REDIS_CLUSTER === 'true',
    sentinel: process.env.REDIS_SENTINEL === 'true',
  },
  
  websocket: {
    pingInterval: parseInt(process.env.WS_PING_INTERVAL || '25000', 10),
    pingTimeout: parseInt(process.env.WS_PING_TIMEOUT || '60000', 10),
    maxPayload: parseInt(process.env.WS_MAX_PAYLOAD || '1048576', 10), // 1MB
    maxConnections: parseInt(process.env.WS_MAX_CONNECTIONS || '100000', 10),
    perMessageDeflate: process.env.WS_PER_MESSAGE_DEFLATE === 'true',
  },
  
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    authRateLimit: parseInt(process.env.AUTH_RATE_LIMIT || '10', 10),
  },
  
  circuitBreaker: {
    timeout: parseInt(process.env.CB_TIMEOUT || '10000', 10),
    errorThresholdPercentage: parseInt(process.env.CB_ERROR_THRESHOLD || '50', 10),
    resetTimeout: parseInt(process.env.CB_RESET_TIMEOUT || '30000', 10),
  },
  
  clustering: {
    enabled: process.env.CLUSTER_ENABLED === 'true',
    workers: parseInt(process.env.CLUSTER_WORKERS || '4', 10),
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
  },
  
  metrics: {
    enabled: process.env.METRICS_ENABLED !== 'false',
    port: parseInt(process.env.METRICS_PORT || '9090', 10),
    path: process.env.METRICS_PATH || '/metrics',
  },
  
  healthCheck: {
    enabled: process.env.HEALTH_CHECK_ENABLED !== 'false',
    path: process.env.HEALTH_CHECK_PATH || '/health',
    interval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000', 10),
  },
};

export type Config = typeof config;
