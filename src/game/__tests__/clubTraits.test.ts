import { describe, it, expect } from 'vitest';
import { traitsForClub, traitStrengthMod } from '../clubTraits';

describe('Club DNA', () => {
  it('maps marquee clubs to their personalities, accents and all', () => {
    expect(traitsForClub('Real Madrid')).toContain('CONTINENTAL_KINGS');
    expect(traitsForClub('FC Barcelona')).toContain('CONTINENTAL_CHOKER');
    expect(traitsForClub('Atlético Madrid')).toContain('TROPHY_SHY');
    expect(traitsForClub('Paris Saint-Germain')).toContain('DOMESTIC_FORTRESS');
    expect(traitsForClub('Arsenal')).toContain('BOTTLER');
    expect(traitsForClub('Sevilla FC')).toContain('CUP_SPECIALIST');
  });

  it('leaves unknown clubs without traits', () => {
    expect(traitsForClub('Some Random FC')).toEqual([]);
  });

  it('applies context-specific multipliers only in the right competition', () => {
    // Continental kings rise in Europe, neutral at home.
    expect(traitStrengthMod(['CONTINENTAL_KINGS'], { kind: 'continental' })).toBeGreaterThan(1);
    expect(traitStrengthMod(['CONTINENTAL_KINGS'], { kind: 'league' })).toBe(1);

    // European frailty drags only in Europe.
    expect(traitStrengthMod(['CONTINENTAL_CHOKER'], { kind: 'continental' })).toBeLessThan(1);
    expect(traitStrengthMod(['CONTINENTAL_CHOKER'], { kind: 'cup' })).toBe(1);

    // Bottlers only wobble in the run-in.
    expect(traitStrengthMod(['BOTTLER'], { kind: 'league', runIn: true })).toBeLessThan(1);
    expect(traitStrengthMod(['BOTTLER'], { kind: 'league', runIn: false })).toBe(1);

    // No traits → neutral.
    expect(traitStrengthMod(undefined, { kind: 'continental' })).toBe(1);
  });
});
