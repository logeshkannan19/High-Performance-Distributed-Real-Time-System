import { CircuitBreaker } from '../../src/core/faulttolerance/CircuitBreaker';
import { withRetry } from '../../src/core/faulttolerance/Retry';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker({
      name: 'test-circuit',
      timeout: 1000,
      errorThresholdPercentage: 50,
      resetTimeout: 5000,
    });
  });

  describe('execute', () => {
    it('should execute function successfully', async () => {
      const result = await circuitBreaker.execute(async () => 'success');
      expect(result).toBe('success');
    });

    it('should record success', async () => {
      await circuitBreaker.execute(async () => 'success');
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.successes).toBe(1);
      expect(metrics.failures).toBe(0);
    });

    it('should record failure', async () => {
      try {
        await circuitBreaker.execute(async () => {
          throw new Error('test error');
        });
      } catch {}
      
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.failures).toBe(1);
    });

    it('should open circuit after threshold', async () => {
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('test error');
          });
        } catch {}
      }

      expect(circuitBreaker.getState()).toBe('OPEN');
    });
  });

  describe('reset', () => {
    it('should reset circuit breaker state', async () => {
      try {
        await circuitBreaker.execute(async () => {
          throw new Error('test error');
        });
      } catch {}

      circuitBreaker.reset();
      
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.state).toBe('CLOSED');
      expect(metrics.failures).toBe(0);
      expect(metrics.successes).toBe(0);
    });
  });
});

describe('withRetry', () => {
  it('should return result on first attempt', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    const result = await withRetry(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('success');

    const result = await withRetry(fn, { maxRetries: 3, initialDelay: 10 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should throw after max retries', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('always fails'));

    await expect(
      withRetry(fn, { maxRetries: 2, initialDelay: 10 })
    ).rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should call onRetry callback', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('success');
    const onRetry = jest.fn();

    await withRetry(fn, { maxRetries: 3, initialDelay: 10, onRetry });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
