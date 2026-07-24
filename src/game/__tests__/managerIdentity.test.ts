import { describe, it, expect } from 'vitest';
import { managerAttributes, developerGrowthBonus, attrStars } from '../managerIdentity';

describe('manager attributes & identity (#45)', () => {
  it('derives four attributes in range from the career record', () => {
    const a = managerAttributes({ managerReputation: 50, managerStints: [], managerStyle: undefined });
    for (const v of Object.values(a)) { expect(v).toBeGreaterThanOrEqual(1); expect(v).toBeLessThanOrEqual(99); }
  });

  it('grows with experience, trophies and reputation', () => {
    const rookie = managerAttributes({ managerReputation: 40, managerStints: [], managerStyle: undefined });
    const veteran = managerAttributes({
      managerReputation: 85,
      managerStints: [{ clubId: 'c', clubName: 'C', startYear: 2000, endYear: 2015, seasons: 15, trophies: 12, left: 'RESIGNED' } as never],
      managerStyle: { wins: 60 } as never,
    });
    expect(veteran.developer).toBeGreaterThan(rookie.developer);
    expect(veteran.motivator).toBeGreaterThan(rookie.motivator);
    expect(veteran.tactician).toBeGreaterThan(rookie.tactician);
  });

  it('a Developer grants a growth bonus (1.0 at zero, up to +30%)', () => {
    expect(developerGrowthBonus(0)).toBeCloseTo(1, 6);
    expect(developerGrowthBonus(100)).toBeCloseTo(1.3, 6);
    expect(developerGrowthBonus(50)).toBeGreaterThan(1);
  });

  it('maps to 1–5 stars', () => {
    expect(attrStars(0)).toBe(1);
    expect(attrStars(100)).toBe(5);
    expect(attrStars(50)).toBe(3);
  });
});
