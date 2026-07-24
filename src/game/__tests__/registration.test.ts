import { describe, it, expect } from 'vitest';
import { gbeCheck, GBE_THRESHOLD, squadCompliance, isHomegrown, registrationRules } from '../registration';
import type { Player } from '../../types/player';
import type { Club } from '../../types/club';

const club = (countryId: string): Club => ({
  id: 'C', name: 'C', shortName: 'C', abbrev: 'CLB', countryId,
  crestSeed: 'x', primaryColor: '#000', secondaryColor: '#fff',
  stadium: { name: 'G', capacity: 1 }, reputation: 80,
  finances: { balance: 0, transferBudget: 0, wageBudget: 0, wageBudgetUsed: 0 },
  playerIds: [], formation: '4-3-3', captainId: null,
});

const player = (nationality: string, overall: number, potential = overall): Player =>
  ({ nationality, overall, potential } as unknown as Player);

describe('work permits / GBE (#21)', () => {
  it('only applies to English clubs', () => {
    expect(gbeCheck(player('BR', 62), club('ES')).allowed).toBe(true); // Spanish club — exempt here
    expect(gbeCheck(player('BR', 62), club('DE')).required).toBe(0);
  });

  it('domestic (home-nation / CTA) players never need an endorsement', () => {
    expect(gbeCheck(player('GB', 55), club('GB')).allowed).toBe(true);
    expect(gbeCheck(player('SCO', 55), club('GB')).allowed).toBe(true);
    expect(gbeCheck(player('IE', 55), club('GB')).allowed).toBe(true);
  });

  it('grants a strong foreign player and refuses a weak one', () => {
    const star = gbeCheck(player('BR', 82), club('GB')); // strong nation, high quality
    expect(star.allowed).toBe(true);
    expect(star.points).toBeGreaterThanOrEqual(GBE_THRESHOLD);

    const journeyman = gbeCheck(player('IN', 64), club('GB')); // weak nation, modest quality
    expect(journeyman.allowed).toBe(false);
    expect(journeyman.reason).toMatch(/refused/i);
  });

  it('credits high-potential prospects some upside points', () => {
    const prospect = gbeCheck(player('FR', 70, 88), club('GB'));
    const flat = gbeCheck(player('FR', 70, 70), club('GB'));
    expect(prospect.points).toBeGreaterThan(flat.points);
  });
});

const named = (nationality: string, extra: Record<string, unknown> = {}): Player =>
  ({ nationality, overall: 75, potential: 75, ...extra } as unknown as Player);

describe('squad registration compliance (#15)', () => {
  it('has no rules for unmodelled countries', () => {
    expect(registrationRules('AU')).toBeNull();
    expect(squadCompliance([named('AU')], club('AU'))).toBeNull();
  });

  it('counts home-grown by home pool or academy graduation', () => {
    expect(isHomegrown(named('GB'), club('GB'))).toBe(true);
    expect(isHomegrown(named('SCO'), club('GB'))).toBe(true);      // home nation pool
    expect(isHomegrown(named('BR', { academyGraduateOf: 'C' }), club('GB'))).toBe(true); // academy
    expect(isHomegrown(named('BR'), club('GB'))).toBe(false);
  });

  it('flags a foreign-heavy squad as short of home-grown', () => {
    const foreigners = Array.from({ length: 20 }, () => named('BR'));
    const comp = squadCompliance(foreigners, club('GB'))!;
    expect(comp.homegrown).toBe(0);
    expect(comp.violations.some((v) => /home-grown/i.test(v))).toBe(true);
  });

  it('passes a well-balanced squad', () => {
    const squad = [...Array.from({ length: 10 }, () => named('GB')), ...Array.from({ length: 10 }, () => named('BR'))];
    const comp = squadCompliance(squad, club('GB'))!;
    expect(comp.homegrown).toBe(10);
    expect(comp.squadCount).toBe(20);
    expect(comp.violations).toEqual([]);
  });
});
