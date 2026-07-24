import { describe, it, expect } from 'vitest';
import { cupName, superCupName, hasLeagueCup, CUP_NAMES } from '../cupNames';

describe('real domestic cup names (#18)', () => {
  it('uses real names for modelled countries', () => {
    expect(cupName('GB', 'MAJOR')).toBe('FA Cup');
    expect(cupName('ES', 'MAJOR')).toBe('Copa del Rey');
    expect(cupName('DE', 'MAJOR')).toBe('DFB-Pokal');
    expect(cupName('IT', 'MAJOR')).toBe('Coppa Italia');
    expect(superCupName('DE')).toBe('DFL-Supercup');
  });

  it('only a handful of countries run a secondary league cup', () => {
    expect(hasLeagueCup('GB')).toBe(true);   // EFL Cup
    expect(cupName('GB', 'LEAGUE')).toBe('EFL Cup');
    expect(hasLeagueCup('ES')).toBe(false);  // Spain has no league cup
    expect(hasLeagueCup('DE')).toBe(false);
  });

  it('falls back to a generic name for an unmodelled country', () => {
    expect(cupName('ZZ', 'MAJOR')).toBe('ZZ Cup');
    expect(superCupName('ZZ')).toBe('ZZ Super Cup');
  });

  it('every entry has a major cup name', () => {
    for (const [id, names] of Object.entries(CUP_NAMES)) {
      expect(names.major.length, id).toBeGreaterThan(0);
    }
  });
});
