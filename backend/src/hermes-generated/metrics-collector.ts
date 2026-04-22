/**
 * Metrics collector — Prometheus text-format output.
 *
 * Phase-8 / observability / step-2. Tracks counters + histograms in
 * memory, scraped by operators at /metrics. No external deps.
 */

export class Counter {
  private value = 0;
  constructor(public readonly name: string, public readonly help: string) {}

  inc(delta: number = 1): void {
    if (delta < 0) throw new Error(`counter: inc must be non-negative (${this.name})`);
    this.value += delta;
  }

  get(): number {
    return this.value;
  }
}

export class Histogram {
  private readonly buckets: number[];
  private readonly counts: number[];
  private sum = 0;
  private count = 0;

  constructor(
    public readonly name: string,
    public readonly help: string,
    buckets: number[] = [1, 10, 100, 1000, 10_000],
  ) {
    const sorted = [...buckets].sort((a, b) => a - b);
    if (sorted.some((b, i) => i > 0 && b === sorted[i - 1])) {
      throw new Error(`hist: duplicate bucket in ${name}`);
    }
    this.buckets = sorted;
    this.counts = new Array(sorted.length + 1).fill(0); // +1 for +Inf
  }

  observe(value: number): void {
    this.sum += value;
    this.count += 1;
    let placed = false;
    for (let i = 0; i < this.buckets.length; i += 1) {
      if (value <= this.buckets[i]) {
        this.counts[i] += 1;
        placed = true;
        break;
      }
    }
    if (!placed) this.counts[this.counts.length - 1] += 1;
  }

  format(): string {
    const lines: string[] = [];
    lines.push(`# HELP ${this.name} ${this.help}`);
    lines.push(`# TYPE ${this.name} histogram`);
    let cumulative = 0;
    for (let i = 0; i < this.buckets.length; i += 1) {
      cumulative += this.counts[i];
      lines.push(`${this.name}_bucket{le="${this.buckets[i]}"} ${cumulative}`);
    }
    cumulative += this.counts[this.counts.length - 1];
    lines.push(`${this.name}_bucket{le="+Inf"} ${cumulative}`);
    lines.push(`${this.name}_sum ${this.sum}`);
    lines.push(`${this.name}_count ${this.count}`);
    return lines.join('\n');
  }
}

export class Registry {
  private readonly counters = new Map<string, Counter>();
  private readonly histograms = new Map<string, Histogram>();

  counter(name: string, help: string): Counter {
    let c = this.counters.get(name);
    if (!c) {
      c = new Counter(name, help);
      this.counters.set(name, c);
    }
    return c;
  }

  histogram(name: string, help: string, buckets?: number[]): Histogram {
    let h = this.histograms.get(name);
    if (!h) {
      h = new Histogram(name, help, buckets);
      this.histograms.set(name, h);
    }
    return h;
  }

  format(): string {
    const parts: string[] = [];
    for (const c of this.counters.values()) {
      parts.push(`# HELP ${c.name} ${c.help}`);
      parts.push(`# TYPE ${c.name} counter`);
      parts.push(`${c.name} ${c.get()}`);
    }
    for (const h of this.histograms.values()) {
      parts.push(h.format());
    }
    return parts.join('\n') + '\n';
  }
}
