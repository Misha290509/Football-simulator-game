import { describe, it, expect } from 'vitest';
import { Rng } from '../rng';
import { generatePlayer, generateSquad } from '../generator';
import { overallAt } from '../ratings';

describe('Position specialization', () => {
  it('a striker is dramatically worse at centre-back', () => {
    const st = generatePlayer({ rng: new Rng(5), currentYear: 2024, target: 82, position: 'ST', ratingCap: 91 });
    const atSt = overallAt(st.attributes, 'ST');
    const atRcb = overallAt(st.attributes, 'RCB');
    expect(atSt - atRcb).toBeGreaterThan(16); // a heavy, realistic drop
  });

  it('a centre-back is dramatically worse at striker', () => {
    const cb = generatePlayer({ rng: new Rng(6), currentYear: 2024, target: 82, position: 'RCB', ratingCap: 91 });
    expect(overallAt(cb.attributes, 'RCB') - overallAt(cb.attributes, 'ST')).toBeGreaterThan(18);
  });
});

describe('Rating cap & distribution', () => {
  it('never generates above the rating cap', () => {
    const cap = 88;
    const squad = generateSquad({ rng: new Rng(3), currentYear: 2024, reputation: 95, clubId: 'a', nationality: 'GB', ratingCap: cap });
    for (const p of squad) {
      expect(p.overall).toBeLessThanOrEqual(cap);
      expect(p.potential).toBeLessThanOrEqual(cap);
    }
  });

  it('keeps most players well below elite (room to grow)', () => {
    const squad = generateSquad({ rng: new Rng(7), currentYear: 2024, reputation: 60, clubId: 'b', nationality: 'GB', ratingCap: 90 });
    const avg = squad.reduce((s, p) => s + p.overall, 0) / squad.length;
    expect(avg).toBeLessThan(72);
  });
});
