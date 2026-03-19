import { createServer, Server as HTTPServer } from 'http';
import { APIGateway } from './core/api/APIGateway';
import { WebSocketServer } from './core/websocket/WebSocketServer';
import { redisManager } from './core/redis/RedisManager';
import { logger } from './utils/logger';
import { config } from './config/index';

class Application {
  private httpServer: HTTPServer;
  private apiGateway: APIGateway;
  private wsServer: WebSocketServer | null = null;
  private isShuttingDown: boolean = false;

  constructor() {
    this.httpServer = createServer();
    this.apiGateway = new APIGateway();
  }

  async start(): Promise<void> {
    try {
      try {
        await redisManager.connect();
        logger.info('Redis connected');
      } catch (error) {
        logger.warn('Redis connection failed - running in standalone mode', { error: String(error) });
      }

      this.httpServer.on('request', this.apiGateway.getApp());

      this.wsServer = new WebSocketServer(this.httpServer);
      logger.info('WebSocket server initialized');

      this.httpServer.listen(config.node.port, () => {
        logger.info(`Server started on port ${config.node.port}`, {
          nodeEnv: config.node.env,
          instanceId: config.node.instanceId,
          pid: process.pid,
        });
      });

      this.setupGracefulShutdown();
      this.setupHealthCheck();

    } catch (error) {
      logger.error('Failed to start application', { error });
      process.exit(1);
    }
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) {
        logger.warn('Shutdown already in progress');
        return;
      }

      this.isShuttingDown = true;
      logger.info(`Received ${signal}, starting graceful shutdown...`);

      const shutdownTimeout = setTimeout(() => {
        logger.error('Shutdown timeout, forcing exit');
        process.exit(1);
      }, 30000);

      try {
        if (this.wsServer) {
          await this.wsServer.shutdown();
          logger.info('WebSocket server shut down');
        }

        await redisManager.disconnect();
        logger.info('Redis disconnected');

        this.httpServer.close(() => {
          logger.info('HTTP server closed');
          clearTimeout(shutdownTimeout);
          process.exit(0);
        });

      } catch (error) {
        logger.error('Error during shutdown', { error });
        clearTimeout(shutdownTimeout);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', { error: error.message, stack: error.stack });
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled rejection', { reason });
    });
  }

  private setupHealthCheck(): void {
    setInterval(() => {
      const health = {
        status: 'healthy',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        connections: this.wsServer?.getConnectionCount() || 0,
        redis: redisManager.isHealthy(),
        timestamp: new Date().toISOString(),
      };

      if (!redisManager.isHealthy()) {
        logger.warn('Redis health check failed', health);
      }
    }, config.healthCheck.interval);
  }
}

const app = new Application();
app.start().catch((error) => {
  logger.error('Application failed to start', { error });
  process.exit(1);
});
