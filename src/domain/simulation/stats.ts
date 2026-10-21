/** Statistical helpers for simulation output analysis. */

export interface Summary {
  n: number;
  mean: number;
  sd: number;
  min: number;
  max: number;
  p50: number;
  p90: number;
  p95: number;
}

export const EMPTY_SUMMARY: Summary = { n: 0, mean: NaN, sd: NaN, min: NaN, max: NaN, p50: NaN, p90: NaN, p95: NaN };

export function quantileSorted(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function summarize(values: number[]): Summary {
  const n = values.length;
  if (n === 0) return { ...EMPTY_SUMMARY };
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const mean = sum / n;
  let ss = 0;
  for (const v of values) ss += (v - mean) * (v - mean);
  const sd = n > 1 ? Math.sqrt(ss / (n - 1)) : 0;
  const sorted = Float64Array.from(values).sort();
  const arr = Array.from(sorted);
  return { n, mean, sd, min, max, p50: quantileSorted(arr, 0.5), p90: quantileSorted(arr, 0.9), p95: quantileSorted(arr, 0.95) };
}

// Two-sided 95% Student t quantiles t_{0.975, df}
const T975 = [
  NaN, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093,
  2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042
];

export function tQuantile975(df: number): number {
  if (df <= 0) return NaN;
  if (df < T975.length) return T975[df];
  if (df <= 40) return 2.021;
  if (df <= 60) return 2.0;
  if (df <= 120) return 1.98;
  return 1.96;
}

export interface Estimate {
  mean: number;
  sd: number;
  /** Half width of the 95% confidence interval across replications (NaN for one replication). */
  ciHalfWidth: number;
  min: number;
  max: number;
  n: number;
}

/** Point estimate and 95% CI from independent replication means. */
export function estimate(values: number[]): Estimate {
  const finite = values.filter((v) => Number.isFinite(v));
  const n = finite.length;
  if (n === 0) return { mean: NaN, sd: NaN, ciHalfWidth: NaN, min: NaN, max: NaN, n: 0 };
  const mean = finite.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(finite.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1)) : 0;
  return {
    mean,
    sd,
    ciHalfWidth: n > 1 ? (tQuantile975(n - 1) * sd) / Math.sqrt(n) : NaN,
    min: Math.min(...finite),
    max: Math.max(...finite),
    n
  };
}

export interface HistogramBin {
  from: number;
  to: number;
  count: number;
}

export function histogram(values: number[], bins = 20, range?: [number, number]): HistogramBin[] {
  if (values.length === 0) return [];
  const lo = range ? range[0] : Math.min(...values);
  let hi = range ? range[1] : Math.max(...values);
  if (hi <= lo) hi = lo + 1;
  const width = (hi - lo) / bins;
  const out: HistogramBin[] = Array.from({ length: bins }, (_, i) => ({ from: lo + i * width, to: lo + (i + 1) * width, count: 0 }));
  for (const v of values) {
    let i = Math.floor((v - lo) / width);
    if (i >= bins) i = bins - 1;
    if (i < 0) i = 0;
    out[i].count++;
  }
  return out;
}

/** Time-weighted average of a piecewise-constant quantity (WIP, queue length, busy workers). */
export class TimeWeighted {
  private value = 0;
  private last = 0;
  private area = 0;
  private start = 0;
  maxValue = 0;

  constructor(start = 0) {
    this.start = start;
    this.last = start;
  }

  set(t: number, v: number) {
    this.advance(t);
    this.value = v;
    if (v > this.maxValue) this.maxValue = v;
  }

  add(t: number, delta: number) {
    this.set(t, this.value + delta);
  }

  get current() {
    return this.value;
  }

  advance(t: number) {
    if (t > this.last) {
      this.area += this.value * (t - this.last);
      this.last = t;
    }
  }

  /** Discard history before t (end of warm-up). */
  reset(t: number) {
    this.advance(t);
    this.area = 0;
    this.start = t;
    this.last = t;
    this.maxValue = this.value;
  }

  integral(t: number) {
    this.advance(t);
    return this.area;
  }

  average(t: number) {
    this.advance(t);
    const span = t - this.start;
    return span > 0 ? this.area / span : this.value;
  }
}

/** Keep at most `limit` values using deterministic systematic thinning. */
export function thin<T>(values: T[], limit: number): T[] {
  if (values.length <= limit) return values;
  const step = values.length / limit;
  const out: T[] = [];
  for (let i = 0; i < limit; i++) out.push(values[Math.floor(i * step)]);
  return out;
}
