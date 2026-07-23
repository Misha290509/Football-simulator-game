import { describe, it, expect } from 'vitest';
import { formationMatchup } from '../formationMatchup';

describe('formation matchup matrix', () => {
  it('is neutral when both sides play the same shape', () => {
    for (const f of ['4-3-3', '4-4-2', '4-2-3-1', '4-1-2-1-2']) {
      expect(formationMatchup(f, f).shotVol).toBe(1);
    }
  });

  it('is symmetric — one side gains exactly what the other loses', () => {
    const a = formationMatchup('4-4-2', '4-3-3').shotVol; // 2 central vs 3 central
    const b = formationMatchup('4-3-3', '4-4-2').shotVol;
    expect(a - 1).toBeCloseTo(1 - b, 6);
  });

  it('a packed central midfield edges a lighter one', () => {
    // 4-3-3 (3 central) should out-volume 4-4-2 (2 central), all else equal.
    expect(formationMatchup('4-3-3', '4-4-2').shotVol).toBeGreaterThan(1);
    expect(formationMatchup('4-4-2', '4-3-3').shotVol).toBeLessThan(1);
  });

  it('the narrow diamond concedes more on the flanks than it wins in the middle', () => {
    // Diamond (4 central, 0 width) vs 4-3-3 (3 central, 2 width): central
    // surplus +0.02, width deficit −0.024 → a small net penalty for ceding both
    // flanks, exactly reversed for the wide side.
    const diamond = formationMatchup('4-1-2-1-2', '4-3-3').shotVol;
    const wide = formationMatchup('4-3-3', '4-1-2-1-2').shotVol;
    expect(diamond).toBeLessThan(1);
    expect(diamond).toBeGreaterThan(0.99);
    expect(wide).toBeGreaterThan(1);
  });

  it('never swings more than ±6%', () => {
    const shapes = ['4-1-2-1-2', '4-1-4-1', '4-2-3-1', '4-5-1', '4-2-4', '4-3-3', '4-4-1-1', '4-4-2'];
    for (const a of shapes) for (const b of shapes) {
      const v = formationMatchup(a, b).shotVol;
      expect(v).toBeGreaterThanOrEqual(0.94);
      expect(v).toBeLessThanOrEqual(1.06);
    }
  });
});
