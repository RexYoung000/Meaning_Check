type Waiting = { signal: AbortSignal; position(n: number): void; grant(release: () => void): void; reject(reason: unknown): void; abort(): void };

/** A slot covers context collection and inference, never time spent waiting for the user. */
export class AnalysisQueue {
  private active = 0;
  private waiting: Waiting[] = [];
  constructor(private limit = 2) {
    if (!Number.isInteger(limit) || limit < 1) throw new RangeError('Invalid concurrency limit');
  }
  acquire(signal: AbortSignal, position: (n: number) => void): Promise<() => void> {
    if (signal.aborted) return Promise.reject(signal.reason);
    if (this.active < this.limit) {
      this.active++;
      return Promise.resolve(this.release());
    }
    return new Promise((grant, reject) => {
      const entry: Waiting = { signal, position, grant, reject, abort: () => {
        this.waiting = this.waiting.filter(item => item !== entry);
        reject(signal.reason);
        this.positions();
      } };
      this.waiting.push(entry);
      signal.addEventListener('abort', entry.abort, { once: true });
      this.positions();
    });
  }
  private positions(): void { this.waiting.forEach((entry, i) => entry.position(i + 1)); }
  private release(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      const next = this.waiting.shift();
      if (next) {
        next.signal.removeEventListener('abort', next.abort);
        this.active++;
        next.grant(this.release());
      }
      this.positions();
    };
  }
}
