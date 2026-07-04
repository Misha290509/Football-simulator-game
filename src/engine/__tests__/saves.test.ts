import { describe, it, expect } from 'vitest';
import { Rng } from '../rng';
import { generateSquad } from '../generator';
import { buildLineupProfile } from '../lineup';
import { simulateMatch } from '../match';

describe('Goalkeeper saves', () => {
  const a = buildLineupProfile('A', generateSquad({ rng: new Rng(11), currentYear: 2024, reputation: 75, clubId: 'A', nationality: 'GB' }), '4-3-3');
  const b = buildLineupProfile('B', generateSquad({ rng: new Rng(22), currentYear: 2024, reputation: 72, clubId: 'B', nationality: 'GB' }), '4-4-2');

  it('credits the goalkeeper with saves, deterministically', () => {
    const r1 = simulateMatch(a, b, 4242);
    const r2 = simulateMatch(a, b, 4242);
    const savesOf = (r: typeof r1) => r.playerStats.reduce((s, ps) => s + (ps.saves ?? 0), 0);
    // Saves are recorded and reproducible for a fixed seed.
    expect(savesOf(r1)).toBe(savesOf(r2));
    // Only the two goalkeepers accumulate saves.
    const keepers = new Set([a.gkId, b.gkId]);
    for (const ps of r1.playerStats) {
      if ((ps.saves ?? 0) > 0) expect(keepers.has(ps.playerId)).toBe(true);
    }
  });

  it('produces some saves across a batch of matches', () => {
    let total = 0;
    for (let seed = 0; seed < 20; seed++) {
      const r = simulateMatch(a, b, seed);
      total += r.playerStats.reduce((s, ps) => s + (ps.saves ?? 0), 0);
    }
    expect(total).toBeGreaterThan(0);
  });
});
