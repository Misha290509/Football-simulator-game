import { describe, it, expect } from 'vitest';
import { academyPotential } from '../academy';
import { Rng } from '../rng';

function sample(stars: number, rep: number, n: number): number[] {
  const rng = new Rng(12345 ^ (stars * 7919) ^ rep);
  return Array.from({ length: n }, () => academyPotential(stars, rep, rng));
}
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const frac = (xs: number[], pred: (v: number) => boolean) => xs.filter(pred).length / xs.length;

describe('Academy potential distribution', () => {
  const N = 8000;
  const girona = sample(3, 52, N); // modest academy
  const elite = sample(5, 82, N); // Barcelona-level

  it('a modest academy produces mostly mid-70s to low-80s ceilings', () => {
    expect(median(girona)).toBeGreaterThanOrEqual(73);
    expect(median(girona)).toBeLessThanOrEqual(83);
    // The bulk sits in a realistic band, not bunched up near the cap.
    expect(frac(girona, (v) => v >= 70 && v <= 84)).toBeGreaterThan(0.6);
  });

  it('high ceilings get rarer; 90+ is genuinely rare at a modest academy', () => {
    expect(frac(girona, (v) => v >= 85)).toBeLessThan(0.22);
    expect(frac(girona, (v) => v >= 90)).toBeLessThan(0.035);
  });

  it('elite academies skew higher but generational talent stays rare', () => {
    expect(median(elite)).toBeGreaterThan(median(girona));
    // Elite produces 90+ more often than a modest academy…
    expect(frac(elite, (v) => v >= 90)).toBeGreaterThan(frac(girona, (v) => v >= 90));
    // …but it's still uncommon.
    expect(frac(elite, (v) => v >= 90)).toBeLessThan(0.18);
  });

  it('potential is uncapped — generational talents can exceed the OVR ceiling', () => {
    const eliteMax = Math.max(...elite);
    expect(eliteMax).toBeGreaterThan(90);
    // Over many samples even a modest academy can, very rarely, turn one up.
    expect(Math.max(...girona)).toBeGreaterThanOrEqual(88);
  });
});
