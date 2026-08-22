export class Pacer {
  private last = 0;

  constructor(private readonly minIntervalMs: number) {}

  async wait(): Promise<void> {
    const now = Date.now();
    const earliest = this.last + this.minIntervalMs;
    this.last = Math.max(now, earliest);
    if (earliest > now) {
      await new Promise((resolve) => setTimeout(resolve, earliest - now));
    }
  }
}
