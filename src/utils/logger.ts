export const createLogger = (module: string) => {
  const log = (level: string, message: string, meta?: Record<string, unknown>): void => {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      module,
      message,
      ...meta,
      pid: process.pid,
      nodeVersion: process.version,
    };

    if (process.env.NODE_ENV === 'production') {
      console.log(JSON.stringify(logEntry));
    } else {
      const color = level === 'error' ? '\x1b[31m' : 
                    level === 'warn' ? '\x1b[33m' : 
                    level === 'debug' ? '\x1b[36m' : '\x1b[0m';
      console.log(`${color}[${timestamp}] ${level.toUpperCase()}: ${message}\x1b[0m`, 
                  meta ? JSON.stringify(meta, null, 2) : '');
    }
  };

  return {
    info: (message: string, meta?: Record<string, unknown>) => log('info', message, meta),
    warn: (message: string, meta?: Record<string, unknown>) => log('warn', message, meta),
    error: (message: string, meta?: Record<string, unknown>) => log('error', message, meta),
    debug: (message: string, meta?: Record<string, unknown>) => log('debug', message, meta),
  };
};

export const logger = createLogger('app');

export class PerformanceTimer {
  private startTime: number;
  private labels: Map<string, number>;

  constructor() {
    this.startTime = Date.now();
    this.labels = new Map();
  }

  mark(label: string): void {
    this.labels.set(label, Date.now());
  }

  getDuration(label?: string): number {
    if (label) {
      const start = this.labels.get(label) || this.startTime;
      return Date.now() - start;
    }
    return Date.now() - this.startTime;
  }

  reset(): void {
    this.startTime = Date.now();
    this.labels.clear();
  }
}
