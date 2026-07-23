import { describe, it, expect } from 'vitest';
import { generateSponsorOffers } from '../sponsorship';
import { computeSeasonFinances } from '../../engine/finances';
import { Rng } from '../../engine/rng';
import type { Club } from '../../types/club';

function club(extra: Partial<Club> = {}): Club {
  return {
    id: 'C', name: 'C', shortName: 'C', abbrev: 'CLB', countryId: 'EN',
    crestSeed: 'x', primaryColor: '#000', secondaryColor: '#fff',
    stadium: { name: 'G', capacity: 40_000 }, reputation: 78,
    finances: { balance: 0, transferBudget: 0, wageBudget: 0, wageBudgetUsed: 0 },
    playerIds: [], formation: '4-3-3', captainId: null, ...extra,
  };
}

describe('shirt sponsorship (#37)', () => {
  it('offers three deals trading annual value against length, deterministically', () => {
    const a = generateSponsorOffers(club(), 0.5, new Rng(9));
    const b = generateSponsorOffers(club(), 0.5, new Rng(9));
    expect(a).toEqual(b);
    expect(a.length).toBe(3);
    // The short deal pays a higher annual than the long one.
    const short = a.find((o) => o.years === 2)!;
    const long = a.find((o) => o.years === 5)!;
    expect(short.annual).toBeGreaterThan(long.annual);
    for (const o of a) { expect(o.annual).toBeGreaterThan(0); expect(o.name).toBeTruthy(); }
  });

  it('bigger clubs and recent success command larger deals', () => {
    const small = generateSponsorOffers(club({ reputation: 55 }), 0.1, new Rng(1))[1].annual;
    const big = generateSponsorOffers(club({ reputation: 88 }), 0.9, new Rng(1))[1].annual;
    expect(big).toBeGreaterThan(small);
  });

  it('a signed sponsor adds to commercial income', () => {
    const base = computeSeasonFinances(club(), 8, 20, 1, 500_000, 50_000).income;
    const withSponsor = computeSeasonFinances(club({ sponsor: { name: 'X', annual: 25_000_000, untilYear: 2030 } }), 8, 20, 1, 500_000, 50_000).income;
    expect(withSponsor - base).toBe(25_000_000);
  });
});
