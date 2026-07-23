import { describe, it, expect } from 'vitest';
import { rollMatchEnv, type Weather } from '../match';

describe('match environment (weather + referee)', () => {
  it('is deterministic for a given seed', () => {
    expect(rollMatchEnv(12345)).toEqual(rollMatchEnv(12345));
    expect(rollMatchEnv(1)).not.toEqual(rollMatchEnv(2));
  });

  it('produces valid weather, a referee and a sane strictness', () => {
    const valid: Weather[] = ['CLEAR', 'RAIN', 'WIND', 'SNOW', 'HOT'];
    for (let s = 0; s < 200; s++) {
      const e = rollMatchEnv(s * 7 + 1);
      expect(valid).toContain(e.weather);
      expect(e.referee).toMatch(/^Referee /);
      expect(e.strictness).toBeGreaterThanOrEqual(0.72);
      expect(e.strictness).toBeLessThanOrEqual(1.35);
      expect(e.shotVol).toBeGreaterThan(0.9);
      expect(e.chanceQual).toBeGreaterThan(0.9);
    }
  });

  it('clear weather is the most common outcome', () => {
    let clear = 0;
    for (let s = 0; s < 1000; s++) if (rollMatchEnv(s * 13 + 3).weather === 'CLEAR') clear++;
    expect(clear).toBeGreaterThan(500);
  });
});
