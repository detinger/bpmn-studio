/**
 * Probability distributions for durations, inter-arrival times and delays.
 * All values are expressed in minutes (the simulation clock unit).
 */
import type { Rng } from './random';

export type NonNegativePolicy = 'resample' | 'truncate';

export type Distribution =
  | { type: 'constant'; value: number }
  | { type: 'uniform'; min: number; max: number }
  | { type: 'triangular'; min: number; mode: number; max: number }
  | { type: 'normal'; mean: number; sd: number; policy?: NonNegativePolicy }
  | { type: 'lognormal'; mean: number; sd: number }
  | { type: 'exponential'; mean: number }
  | { type: 'empirical'; values: number[]; weights?: number[] };

export type DistributionType = Distribution['type'];

export const DISTRIBUTION_LABELS: Record<DistributionType, string> = {
  constant: 'Constant',
  uniform: 'Uniform',
  triangular: 'Triangular',
  normal: 'Normal (non-negative)',
  lognormal: 'Lognormal',
  exponential: 'Exponential',
  empirical: 'Empirical'
};

const MAX_RESAMPLE = 1000;

function standardNormal(rng: Rng): number {
  // Box–Muller transform; uses two uniforms per draw (no caching, so each draw
  // consumes a fixed number of random numbers, which keeps streams aligned).
  let u1 = rng.next();
  if (u1 <= Number.EPSILON) u1 = Number.EPSILON;
  const u2 = rng.next();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function sample(d: Distribution, rng: Rng): number {
  switch (d.type) {
    case 'constant':
      return Math.max(0, d.value);
    case 'uniform': {
      const lo = Math.min(d.min, d.max);
      const hi = Math.max(d.min, d.max);
      return Math.max(0, lo + (hi - lo) * rng.next());
    }
    case 'triangular': {
      const a = d.min;
      const c = Math.min(Math.max(d.mode, d.min), d.max);
      const b = d.max;
      if (b <= a) return Math.max(0, a);
      const u = rng.next();
      const fc = (c - a) / (b - a);
      const x = u < fc ? a + Math.sqrt(u * (b - a) * (c - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - c));
      return Math.max(0, x);
    }
    case 'normal': {
      if (d.sd <= 0) return Math.max(0, d.mean);
      if ((d.policy ?? 'resample') === 'truncate') return Math.max(0, d.mean + d.sd * standardNormal(rng));
      for (let i = 0; i < MAX_RESAMPLE; i++) {
        const x = d.mean + d.sd * standardNormal(rng);
        if (x >= 0) return x;
      }
      return 0;
    }
    case 'lognormal': {
      if (d.mean <= 0) return 0;
      if (d.sd <= 0) return d.mean;
      const sigma2 = Math.log(1 + (d.sd * d.sd) / (d.mean * d.mean));
      const mu = Math.log(d.mean) - sigma2 / 2;
      return Math.exp(mu + Math.sqrt(sigma2) * standardNormal(rng));
    }
    case 'exponential': {
      if (d.mean <= 0) return 0;
      return -d.mean * Math.log(1 - rng.next());
    }
    case 'empirical': {
      const values = d.values ?? [];
      if (values.length === 0) return 0;
      const weights = d.weights && d.weights.length === values.length ? d.weights : values.map(() => 1);
      const total = weights.reduce((a, w) => a + Math.max(0, w), 0);
      if (total <= 0) return Math.max(0, values[0]);
      let u = rng.next() * total;
      for (let i = 0; i < values.length; i++) {
        u -= Math.max(0, weights[i]);
        if (u < 0) return Math.max(0, values[i]);
      }
      return Math.max(0, values[values.length - 1]);
    }
  }
}

/** Analytical mean (for the non-negative policies an approximation is noted). */
export function meanOf(d: Distribution): number {
  switch (d.type) {
    case 'constant':
      return d.value;
    case 'uniform':
      return (d.min + d.max) / 2;
    case 'triangular':
      return (d.min + d.mode + d.max) / 3;
    case 'normal':
      return d.mean;
    case 'lognormal':
      return d.mean;
    case 'exponential':
      return d.mean;
    case 'empirical': {
      const w = d.weights && d.weights.length === d.values.length ? d.weights : d.values.map(() => 1);
      const total = w.reduce((a, b) => a + b, 0) || 1;
      return d.values.reduce((a, v, i) => a + v * w[i], 0) / total;
    }
  }
}

export function validateDistribution(d: Distribution): string[] {
  const errs: string[] = [];
  const finite = (n: number) => typeof n === 'number' && Number.isFinite(n);
  switch (d.type) {
    case 'constant':
      if (!finite(d.value) || d.value < 0) errs.push('Value must be a non-negative number.');
      break;
    case 'uniform':
      if (!finite(d.min) || !finite(d.max) || d.min < 0) errs.push('Min and max must be non-negative numbers.');
      else if (d.max < d.min) errs.push('Max must be greater than or equal to min.');
      break;
    case 'triangular':
      if (![d.min, d.mode, d.max].every(finite) || d.min < 0) errs.push('Min, mode and max must be non-negative numbers.');
      else if (!(d.min <= d.mode && d.mode <= d.max)) errs.push('Requires min ≤ mode ≤ max.');
      break;
    case 'normal':
      if (!finite(d.mean) || !finite(d.sd) || d.sd < 0) errs.push('Mean must be a number and SD non-negative.');
      break;
    case 'lognormal':
      if (!finite(d.mean) || !finite(d.sd) || d.mean <= 0 || d.sd < 0) errs.push('Mean must be positive and SD non-negative.');
      break;
    case 'exponential':
      if (!finite(d.mean) || d.mean <= 0) errs.push('Mean must be positive.');
      break;
    case 'empirical':
      if (!d.values?.length) errs.push('Provide at least one value.');
      else if (d.values.some((v) => !finite(v) || v < 0)) errs.push('Values must be non-negative numbers.');
      if (d.weights && d.weights.length !== d.values.length) errs.push('Weights must match the number of values.');
      break;
  }
  return errs;
}

function fmt(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

export function describeDistribution(d: Distribution): string {
  switch (d.type) {
    case 'constant':
      return `${fmt(d.value)}`;
    case 'uniform':
      return `U(${fmt(d.min)}, ${fmt(d.max)})`;
    case 'triangular':
      return `Tri(${fmt(d.min)}, ${fmt(d.mode)}, ${fmt(d.max)})`;
    case 'normal':
      return `N(${fmt(d.mean)}, ${fmt(d.sd)})${d.policy === 'truncate' ? ' trunc.' : ''}`;
    case 'lognormal':
      return `LogN(mean ${fmt(d.mean)}, sd ${fmt(d.sd)})`;
    case 'exponential':
      return `Exp(mean ${fmt(d.mean)})`;
    case 'empirical':
      return `Emp(${d.values.length} values)`;
  }
}

export function defaultDistribution(type: DistributionType, mean = 10): Distribution {
  switch (type) {
    case 'constant':
      return { type, value: mean };
    case 'uniform':
      return { type, min: mean * 0.5, max: mean * 1.5 };
    case 'triangular':
      return { type, min: mean * 0.5, mode: mean, max: mean * 1.5 };
    case 'normal':
      return { type, mean, sd: mean * 0.25, policy: 'resample' };
    case 'lognormal':
      return { type, mean, sd: mean * 0.5 };
    case 'exponential':
      return { type, mean };
    case 'empirical':
      return { type, values: [mean * 0.5, mean, mean * 2], weights: [1, 2, 1] };
  }
}
