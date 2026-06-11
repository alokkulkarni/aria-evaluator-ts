// src/lib/circuit-breaker.ts
// Circuit breaker pattern for external API calls (Bedrock, etc.)


export class CircuitBreakerOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  failureThreshold?: number;
  successThreshold?: number;
  timeout?: number;
  monitoringEnabled?: boolean;
  metricNamespace?: string;
}

interface CircuitBreakerMetrics {
  failureCount: number;
  successCount: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime?: Date;
  private lastStateChangeTime?: Date;
  private readonly config: Required<CircuitBreakerConfig>;
  private readonly name: string;

  constructor(name: string, config: CircuitBreakerConfig = {}) {
    this.name = name;
    this.config = {
      failureThreshold: config.failureThreshold ?? 5,
      successThreshold: config.successThreshold ?? 2,
      timeout: config.timeout ?? 60000,
      monitoringEnabled: config.monitoringEnabled ?? true,
      metricNamespace: config.metricNamespace ?? 'ARIA/CircuitBreaker',
    };

    this.lastStateChangeTime = new Date();
  }

  async execute<T>(fn: () => Promise<T>, fallback?: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (this.shouldAttemptReset()) {
        this.state = 'half-open';
        this.successCount = 0;
        this.failureCount = 0;
      } else {
        await this.recordMetric('CircuitOpen', 1);
        if (fallback) {
          console.warn(`[CircuitBreaker] ${this.name} is OPEN. Using fallback.`);
          return fallback();
        }
        throw new CircuitBreakerOpenError(`Circuit breaker ${this.name} is OPEN`);
      }
    }

    try {
      const result = await fn();
      await this.onSuccess();
      return result;
    } catch (error) {
      await this.onFailure();
      throw error;
    }
  }

  private async onSuccess(): Promise<void> {
    this.successCount++;
    this.failureCount = 0;

    if (this.state === 'half-open') {
      if (this.successCount >= this.config.successThreshold) {
        this.state = 'closed';
        this.lastStateChangeTime = new Date();
        await this.recordMetric('CircuitClosed', 1);
      }
    } else if (this.state === 'closed') {
      await this.recordMetric('CallSuccess', 1);
    }
  }

  private async onFailure(): Promise<void> {
    this.failureCount++;
    this.lastFailureTime = new Date();

    if (this.state === 'half-open') {
      this.state = 'open';
      this.lastStateChangeTime = new Date();
      await this.recordMetric('CircuitOpen', 1);
    } else if (this.state === 'closed') {
      await this.recordMetric('CallFailure', 1);

      if (this.failureCount >= this.config.failureThreshold) {
        this.state = 'open';
        this.lastStateChangeTime = new Date();
        await this.recordMetric('CircuitOpen', 1);
      }
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastStateChangeTime) return true;
    const timeSinceOpen = Date.now() - this.lastStateChangeTime.getTime();
    return timeSinceOpen >= this.config.timeout;
  }

  private async recordMetric(metricName: string, value: number): Promise<void> {
    if (!this.config.monitoringEnabled) return;
    console.debug(`[CircuitBreaker] ${this.name}_${metricName}=${value}`);
  }

  getState(): CircuitState {
    return this.state;
  }

  getMetrics(): CircuitBreakerMetrics {
    return {
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastStateChangeTime,
    };
  }

  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = undefined;
    this.lastStateChangeTime = new Date();
  }
}

export function createFallbackTranscript(runId: string, reason: string) {
  return {
    id: `fallback-${runId}-${Date.now()}`,
    runId,
    turns: [{ role: 'system', content: `Evaluation skipped: ${reason}` }],
    summary: `Fallback due to: ${reason}`,
    escalations: [],
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };
}
