export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  name: string;
  timeout?: number;
  errorThresholdPercentage?: number;
  resetTimeout?: number;
  onStateChange?: (state: CircuitState) => void;
  onError?: (error: Error) => void;
}

export interface CircuitMetrics {
  failures: number;
  successes: number;
  state: CircuitState;
  lastFailure?: Date;
  nextAttempt?: Date;
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures: number = 0;
  private successes: number = 0;
  private nextAttempt?: Date;
  private readonly options: Required<CircuitBreakerOptions>;

  constructor(options: CircuitBreakerOptions) {
    this.options = {
      name: options.name,
      timeout: options.timeout ?? 10000,
      errorThresholdPercentage: options.errorThresholdPercentage ?? 50,
      resetTimeout: options.resetTimeout ?? 30000,
      onStateChange: options.onStateChange ?? (() => {}),
      onError: options.onError ?? (() => {}),
    };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (this.nextAttempt && new Date() >= this.nextAttempt) {
        this.transitionTo('HALF_OPEN');
      } else {
        throw new Error(`Circuit breaker [${this.options.name}] is OPEN`);
      }
    }

    try {
      const result = await this.executeWithTimeout(fn);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      throw error;
    }
  }

  private async executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Circuit breaker [${this.options.name}] timeout`)),
          this.options.timeout
        )
      ),
    ]);
  }

  private onSuccess(): void {
    this.successes++;
    this.failures = 0;

    if (this.state === 'HALF_OPEN') {
      this.transitionTo('CLOSED');
    }
  }

  private onFailure(error: Error): void {
    this.failures++;
    this.options.onError(error);

    if (this.state === 'HALF_OPEN') {
      this.transitionTo('OPEN');
      return;
    }

    const failureRate = (this.failures / (this.failures + this.successes)) * 100;

    if (failureRate >= this.options.errorThresholdPercentage) {
      this.transitionTo('OPEN');
    }
  }

  private transitionTo(state: CircuitState): void {
    this.state = state;
    this.options.onStateChange(state);

    if (state === 'OPEN') {
      this.nextAttempt = new Date(Date.now() + this.options.resetTimeout);
    } else if (state === 'CLOSED') {
      this.failures = 0;
      this.successes = 0;
      this.nextAttempt = undefined;
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getMetrics(): CircuitMetrics {
    return {
      failures: this.failures,
      successes: this.successes,
      state: this.state,
      lastFailure: this.failures > 0 ? new Date() : undefined,
      nextAttempt: this.nextAttempt,
    };
  }

  reset(): void {
    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
    this.nextAttempt = undefined;
    this.options.onStateChange('CLOSED');
  }
}

export const createCircuitBreaker = (options: CircuitBreakerOptions): CircuitBreaker => {
  return new CircuitBreaker(options);
};
