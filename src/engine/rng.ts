// ---------------------------------------------------------------------------
// Seeded, deterministic PRNG (§12). mulberry32 — fast, good enough for a game,
// fully reproducible. All randomness in the sim/generation must thread an Rng
// instance so a given seed + inputs always yields identical results.
// ---------------------------------------------------------------------------

export class Rng {
  private state: number;

  constructor(seed: number) {
    // Ensure a non-zero 32-bit state.
    this.state = (seed >>> 0) || 0x9e3779b9;
  }

  /** Next float in [0, 1). */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Float in [min, max). */
  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Returns true with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Pick a random element. */
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }

  /** In-place Fisher–Yates shuffle (returns the same array). */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /**
   * Approx. normal distribution via sum of uniforms (Bates).
   * mean ± stdev, clamped softly by caller.
   */
  normal(mean: number, stdev: number): number {
    let sum = 0;
    for (let i = 0; i < 6; i++) sum += this.next();
    // Bates(6) has stdev = 1/sqrt(12*6); normalize to unit, then scale.
    const unit = (sum - 3) / Math.sqrt(6 / 12);
    return mean + unit * stdev;
  }

  /** Fork a child RNG deterministically (for sub-systems / per-match seeds). */
  fork(salt: number): Rng {
    return new Rng((this.int(0, 0x7fffffff) ^ Math.imul(salt, 0x85ebca6b)) >>> 0);
  }

  /** A reproducible 32-bit seed value (e.g. to stamp on a match). */
  seedValue(): number {
    return this.int(0, 0x7fffffff);
  }
}

/** Hash a string to a 32-bit seed (FNV-1a). Useful for naming determinism. */
export function hashSeed(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export const clamp = (n: number, lo = 0, hi = 100): number =>
  n < lo ? lo : n > hi ? hi : n;
