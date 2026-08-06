export class ConcurrencyLimiter {
  private active = 0;
  private queue: Array<() => void> = [];

  constructor(
    private readonly maxConcurrent: number,
    private readonly queueTimeoutMs: number,
  ) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  get stats() {
    return { active: this.active, queued: this.queue.length };
  }

  private acquire(): Promise<void> {
    if (this.active < this.maxConcurrent) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.queue.indexOf(grant);
        if (idx !== -1) this.queue.splice(idx, 1);
        reject(new Error(`Sandbox queue timeout after ${this.queueTimeoutMs}ms`));
      }, this.queueTimeoutMs);
      const grant = () => {
        clearTimeout(timer);
        this.active++;
        resolve();
      };
      this.queue.push(grant);
    });
  }

  private release(): void {
    this.active--;
    this.queue.shift()?.();
  }
}
