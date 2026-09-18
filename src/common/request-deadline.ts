export class RequestDeadline {
  private readonly startedAt = Date.now();
  private readonly controller = new AbortController();
  private readonly timer: NodeJS.Timeout;

  constructor(private readonly totalMs: number) {
    this.timer = setTimeout(() => this.cancel(), totalMs);
    this.timer.unref?.();
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  get expired(): boolean {
    return this.controller.signal.aborted || this.remainingMs() <= 0;
  }

  remainingMs(): number {
    return Math.max(0, this.totalMs - (Date.now() - this.startedAt));
  }

  attemptTimeoutMs(preferredMs: number): number {
    return Math.max(0, Math.min(preferredMs, this.remainingMs()));
  }

  cancel(): void {
    clearTimeout(this.timer);
    if (!this.controller.signal.aborted) {
      this.controller.abort();
    }
  }
}
