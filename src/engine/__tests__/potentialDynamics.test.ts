import { describe, it, expect } from 'vitest';
import { developPlayer } from '../development';
import { generatePlayer } from '../generator';
import { Rng } from '../rng';

// A player's potential is a living ceiling, not a frozen number: it erodes as he
// ages past his peak (so an old player's POT no longer sits far above his OVR),
// and can still rise for a young overachiever.
describe('Potential dynamics', () => {
  it('erodes an aging player\'s potential toward his overall over several seasons', () => {
    const rng = new Rng(42);
    const p = generatePlayer({ rng, currentYear: 2024, target: 82, position: 'ST', ageRange: [29, 29], nationality: 'GB', ratingCap: 99 });
    p.potential = 90;
    let cur = { ...p };
    const pots: number[] = [];
    for (let y = 1; y <= 6; y++) {
      cur = developPlayer(cur, 2024 + y, new Rng(100 + y), { ratingCap: 99 });
      pots.push(cur.potential);
      // Invariant: potential is never below current ability.
      expect(cur.potential).toBeGreaterThanOrEqual(cur.overall);
    }
    // It fell from 90 …
    expect(pots[pots.length - 1]).toBeLessThan(90);
    // … monotonically (never rises for a declining veteran) …
    for (let i = 1; i < pots.length; i++) expect(pots[i]).toBeLessThanOrEqual(pots[i - 1]);
    // … and by his mid-30s the ceiling has all but closed onto his ability
    // (it can trail a hair behind a season of steep decline).
    expect(pots[pots.length - 1]).toBeLessThanOrEqual(cur.overall + 2);
  });

  it('never drops a player\'s potential below his overall', () => {
    const rng = new Rng(7);
    for (const age of [24, 27, 30, 33, 36]) {
      const p = generatePlayer({ rng, currentYear: 2024, target: 78, position: 'CM', ageRange: [age, age], nationality: 'ES', ratingCap: 99 });
      p.potential = Math.max(p.potential, p.overall + 8);
      const dev = developPlayer(p, 2025, new Rng(200 + age), { ratingCap: 99 });
      expect(dev.potential).toBeGreaterThanOrEqual(dev.overall);
    }
  });
});
