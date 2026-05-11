
export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

/**
 * CircuitBreaker: Protege o sistema contra falhas em cascata de serviços externos (OpenRouter, Gemini).
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private readonly failureThreshold: number = 5;
  private readonly cooldownPeriod: number = 60000; // 1 minute

  constructor(
    private serviceName: string,
    options?: { threshold?: number, cooldown?: number }
  ) {
    if (options?.threshold) this.failureThreshold = options.threshold;
    if (options?.cooldown) this.cooldownPeriod = options.cooldown;
  }

  public async execute<T>(action: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime > this.cooldownPeriod) {
        this.state = CircuitState.HALF_OPEN;
        console.log(`[CircuitBreaker:${this.serviceName}] State -> HALF_OPEN`);
      } else {
        throw new Error(`CircuitBreaker[${this.serviceName}] is OPEN. Service unavailable.`);
      }
    }

    try {
      const result = await action();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failureCount = 0;
    this.state = CircuitState.CLOSED;
  }

  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.failureThreshold) {
      this.state = CircuitState.OPEN;
      console.warn(`[CircuitBreaker:${this.serviceName}] State -> OPEN. Threshold exceeded.`);
    }
  }

  public getState() {
    return this.state;
  }
}

// Singletons para serviços comuns
export const aiCircuitBreaker = new CircuitBreaker('AI_SERVICE', { threshold: 3, cooldown: 30000 });
export const ocrCircuitBreaker = new CircuitBreaker('OCR_SERVICE', { threshold: 5, cooldown: 60000 });
