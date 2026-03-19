export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  retryableErrors?: (string | RegExp)[];
  onRetry?: (attempt: number, error: Error) => void;
}

const defaultOptions: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  retryableErrors: [],
  onRetry: () => {},
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...defaultOptions, ...options };
  let lastError: Error;
  let delay = opts.initialDelay;

  for (let attempt = 1; attempt <= opts.maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt > opts.maxRetries) {
        break;
      }

      if (!isRetryableError(lastError, opts.retryableErrors)) {
        throw lastError;
      }

      opts.onRetry(attempt, lastError);
      await sleep(delay);
      delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelay);
    }
  }

  throw lastError!;
}

function isRetryableError(error: Error, retryableErrors: (string | RegExp)[]): boolean {
  if (retryableErrors.length === 0) {
    return true;
  }

  return retryableErrors.some((pattern) => {
    if (typeof pattern === 'string') {
      return error.message.includes(pattern);
    }
    return pattern.test(error.message);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class RetryableError extends Error {
  constructor(
    message: string,
    public readonly attempt: number,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'RetryableError';
  }
}

export const createRetryableFunction = <T extends (...args: Parameters<T>) => Promise<ReturnType<T>>>(
  fn: T,
  options: RetryOptions = {}
): ((...args: Parameters<T>) => Promise<ReturnType<T>>) => {
  return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    return withRetry(() => fn(...args), options);
  };
};
