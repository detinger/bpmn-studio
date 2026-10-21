/**
 * Reproducible pseudo-random number generation.
 *
 * - Generator: xoshiro128** (Blackman & Vigna), 128-bit state, period 2^128 − 1.
 * - Seeding: SplitMix32 expands a 32-bit seed into the generator state.
 * - Streams: independent streams are derived by hashing (seed, replication,
 *   key) so that each random input (arrivals, one activity's durations for one
 *   case, one gateway's decisions, …) has its own stream. This implements
 *   common random numbers (CRN) across alternative models that share element
 *   ids, which reduces variance when comparing AS-IS and TO-BE designs.
 */

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
}

function splitmix32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
}

export class Xoshiro128 implements Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number) {
    const sm = splitmix32(seed);
    this.a = sm();
    this.b = sm();
    this.c = sm();
    this.d = sm();
    if ((this.a | this.b | this.c | this.d) === 0) this.d = 1;
  }

  nextUint32(): number {
    const result = Math.imul(rotl(Math.imul(this.b, 5), 7), 9) >>> 0;
    const t = this.b << 9;
    this.c ^= this.a;
    this.d ^= this.b;
    this.b ^= this.c;
    this.a ^= this.d;
    this.c ^= t;
    this.d = rotl(this.d, 11);
    return result;
  }

  next(): number {
    return this.nextUint32() / 4294967296;
  }
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/** 32-bit FNV-1a hash of a string, finalized with the murmur3 mixer. */
export function hashString(s: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return fmix32(h);
}

function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** Derive the seed of a named stream. */
export function streamSeed(baseSeed: number, replication: number, key: string): number {
  return hashString(`${key}#${replication}`, fmix32((baseSeed >>> 0) ^ 0x9e3779b9));
}

/** Factory of named, independent streams for one replication. */
export class StreamFactory {
  private cache = new Map<string, Xoshiro128>();

  constructor(
    readonly baseSeed: number,
    readonly replication: number
  ) {}

  stream(key: string): Xoshiro128 {
    let s = this.cache.get(key);
    if (!s) {
      s = new Xoshiro128(streamSeed(this.baseSeed, this.replication, key));
      this.cache.set(key, s);
    }
    return s;
  }

  /** Forget per-case streams to bound memory. */
  release(prefix: string) {
    for (const k of this.cache.keys()) if (k.startsWith(prefix)) this.cache.delete(k);
  }
}

/** Seed used for replication r when users enter one base seed. */
export function replicationSeed(baseSeed: number, replication: number): number {
  return streamSeed(baseSeed, replication, 'replication');
}
