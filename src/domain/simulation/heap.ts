/**
 * Binary min-heap event queue ordered by (time, priority, sequence).
 * The insertion sequence number makes ordering of simultaneous events
 * deterministic, which is required for reproducible simulations.
 */
export interface Scheduled<T> {
  time: number;
  priority: number;
  seq: number;
  payload: T;
  cancelled: boolean;
}

export class EventQueue<T> {
  private heap: Scheduled<T>[] = [];
  private counter = 0;

  get size(): number {
    return this.heap.length;
  }

  push(time: number, payload: T, priority = 0): Scheduled<T> {
    const item: Scheduled<T> = { time, priority, seq: this.counter++, payload, cancelled: false };
    this.heap.push(item);
    this.up(this.heap.length - 1);
    return item;
  }

  pop(): Scheduled<T> | undefined {
    const h = this.heap;
    if (h.length === 0) return undefined;
    const top = h[0];
    const last = h.pop()!;
    if (h.length > 0) {
      h[0] = last;
      this.down(0);
    }
    return top;
  }

  peek(): Scheduled<T> | undefined {
    return this.heap[0];
  }

  private less(a: Scheduled<T>, b: Scheduled<T>): boolean {
    if (a.time !== b.time) return a.time < b.time;
    if (a.priority !== b.priority) return a.priority < b.priority;
    return a.seq < b.seq;
  }

  private up(i: number) {
    const h = this.heap;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(h[i], h[p])) break;
      [h[i], h[p]] = [h[p], h[i]];
      i = p;
    }
  }

  private down(i: number) {
    const h = this.heap;
    const n = h.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < n && this.less(h[l], h[m])) m = l;
      if (r < n && this.less(h[r], h[m])) m = r;
      if (m === i) break;
      [h[i], h[m]] = [h[m], h[i]];
      i = m;
    }
  }
}
