import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from '../../config/index';
import { logger } from '../../utils/logger';
import { redisManager } from '../redis/RedisManager';
import { sseServer } from '../sse/SSEServer';
import { RateLimiterMemory } from 'rate-limiter-flexible';

interface RequestLog {
  method: string;
  path: string;
  ip: string;
  timestamp: Date;
  duration: number;
  status?: number;
}

export class APIGateway {
  private app: Express;
  private requestLogs: RequestLog[] = [];
  private rateLimiter: RateLimiterMemory;
  private authRateLimiter: RateLimiterMemory;

  constructor() {
    this.app = express();
    this.rateLimiter = new RateLimiterMemory({
      points: config.rateLimit.maxRequests,
      duration: config.rateLimit.windowMs / 1000,
    });
    
    this.authRateLimiter = new RateLimiterMemory({
      points: config.rateLimit.authRateLimit,
      duration: 60,
    });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    this.app.use(helmet({
      contentSecurityPolicy: false,
    }));

    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || '*',
      credentials: true,
    }));

    this.app.use(compression());

    this.app.use(express.json({ limit: '1mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '1mb' }));

    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        this.logRequest({
          method: req.method,
          path: req.path,
          ip: req.ip || 'unknown',
          timestamp: new Date(),
          duration,
          status: res.statusCode,
        });
      });

      next();
    });

    this.app.use(async (req: Request, res: Response, next: NextFunction) => {
      const identifier = req.ip || 'unknown';
      
      try {
        const result = await this.rateLimiter.consume(identifier);
        res.setHeader('X-RateLimit-Remaining', String(result.remainingPoints));
        const msBeforeNext = result.msBeforeNext ?? 0;
        res.setHeader('X-RateLimit-Reset', new Date(Date.now() + msBeforeNext).toISOString());
        next();
      } catch {
        const penaltyResult = await this.rateLimiter.penalty(identifier);
        res.status(429).json({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: Math.ceil(penaltyResult.msBeforeNext / 1000),
        });
      }
    });
  }

  private setupRoutes(): void {
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      });
    });

    this.app.get('/health/detailed', async (_req: Request, res: Response) => {
      const memory = process.memoryUsage();
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: {
          heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memory.heapTotal / 1024 / 1024),
          rss: Math.round(memory.rss / 1024 / 1024),
        },
        services: {
          redis: redisManager.isHealthy(),
        },
      });
    });

    this.app.get('/stats', (_req: Request, res: Response) => {
      res.json({
        connections: sseServer.getClientCount(),
        timestamp: new Date().toISOString(),
      });
    });

    this.app.get('/api/stream', (req: Request, res: Response) => {
      const userId = req.query.userId as string | undefined;
      sseServer.handleConnection(req, res, userId);
    });

    this.app.post('/api/broadcast', async (req: Request, res: Response) => {
      const { event, data, category } = req.body;
      
      if (!event || !data) {
        res.status(400).json({ error: 'Missing event or data' });
        return;
      }

      const count = sseServer.broadcast(event, data, category);
      await sseServer.broadcastToAllNodes(event, data, category);
      
      res.json({ success: true, clientsNotified: count });
    });

    this.app.post('/api/notify/:userId', async (req: Request, res: Response) => {
      const { userId } = req.params;
      const { event, data } = req.body;
      
      const count = sseServer.sendToUser(userId, event || 'notification', data);
      res.json({ success: true, clientsNotified: count });
    });

    this.app.post('/api/auth/login', async (req: Request, res: Response) => {
      const { username, password } = req.body;
      
      const identifier = req.ip || 'unknown';
      try {
        await this.authRateLimiter.consume(identifier);
      } catch {
        res.status(429).json({ error: 'Too many login attempts' });
        return;
      }

      if (username && password) {
        res.json({
          success: true,
          token: `token_${Date.now()}`,
          user: { id: 'user_123', username },
        });
      } else {
        res.status(401).json({ error: 'Invalid credentials' });
      }
    });

    this.app.get('/api/online/users', async (_req: Request, res: Response) => {
      try {
        const users = await redisManager.getOnlineUsers();
        const count = await redisManager.getOnlineCount();
        res.json({ users, count });
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch online users' });
      }
    });

    this.app.get('/metrics', (_req: Request, res: Response) => {
      const memory = process.memoryUsage();
      const cpu = process.cpuUsage();
      
      res.json({
        requests: {
          total: this.requestLogs.length,
          byMethod: this.getRequestStatsByMethod(),
          byPath: this.getRequestStatsByPath(),
        },
        memory: {
          heapUsed: memory.heapUsed,
          heapTotal: memory.heapTotal,
          external: memory.external,
          rss: memory.rss,
        },
        cpu: {
          user: cpu.user,
          system: cpu.system,
        },
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      });
    });

    this.app.get('/', (_req: Request, res: Response) => {
      res.json({
        name: 'Real-Time Distributed System',
        version: '1.0.0',
        status: 'running',
        endpoints: [
          'GET /health',
          'GET /health/detailed',
          'GET /stats',
          'GET /metrics',
          'GET /api/stream',
          'POST /api/broadcast',
          'POST /api/notify/:userId',
          'POST /api/auth/login',
          'GET /api/online/users',
        ],
      });
    });
  }

  private setupErrorHandling(): void {
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({
        error: 'Not Found',
        path: req.path,
      });
    });

    this.app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
      logger.error('Unhandled error', {
        error: err.message,
        stack: err.stack,
        path: req.path,
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
      });
    });
  }

  private logRequest(log: RequestLog): void {
    this.requestLogs.push(log);
    if (this.requestLogs.length > 10000) {
      this.requestLogs.shift();
    }

    if (log.status && log.status >= 400) {
      logger.warn('Request completed', {
        method: log.method,
        path: log.path,
        status: log.status,
        duration: log.duration,
      });
    }
  }

  private getRequestStatsByMethod(): Record<string, number> {
    return this.requestLogs.reduce((acc, log) => {
      acc[log.method] = (acc[log.method] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private getRequestStatsByPath(): Record<string, number> {
    return this.requestLogs.reduce((acc, log) => {
      acc[log.path] = (acc[log.path] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  getApp(): Express {
    return this.app;
  }

  async shutdown(): Promise<void> {
    logger.info('API Gateway shutting down');
  }
}

export const apiGateway = new APIGateway();
