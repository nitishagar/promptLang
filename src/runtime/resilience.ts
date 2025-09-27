export class CircuitBreaker {
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private threshold: number = 5,
    private timeout: number = 60000
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === 'half-open') {
      this.state = 'closed';
    }
    this.failures = 0;
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.threshold) {
      this.state = 'open';
      console.warn(`Circuit breaker opened after ${this.failures} failures`);
    }
  }

  getState(): string {
    return this.state;
  }
}

export class RateLimiter {
  private tokens: number;
  private lastRefill: number = Date.now();

  constructor(
    private maxTokens: number = 10,
    private refillRate: number = 1, // tokens per second
    private maxBurst: number = 20
  ) {
    this.tokens = maxTokens;
  }

  // Getter to access maxTokens (to prevent unused property error)
  getMaxTokens(): number {
    return this.maxTokens;
  }

  async acquire(tokens: number = 1): Promise<void> {
    this.refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return;
    }

    // Calculate wait time
    const tokensNeeded = tokens - this.tokens;
    const waitTime = (tokensNeeded / this.refillRate) * 1000;

    await this.sleep(waitTime);
    this.tokens = 0;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const tokensToAdd = elapsed * this.refillRate;

    this.tokens = Math.min(this.tokens + tokensToAdd, this.maxBurst);
    this.lastRefill = now;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}