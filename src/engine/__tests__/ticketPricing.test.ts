import { describe, it, expect } from 'vitest';
import { computeSeasonFinances } from '../finances';
import type { Club } from '../../types/club';

function club(ticketLevel?: number): Club {
  return {
    id: 'C', name: 'C', shortName: 'C', abbrev: 'CLB', countryId: 'EN',
    crestSeed: 'x', primaryColor: '#000', secondaryColor: '#fff',
    stadium: { name: 'G', capacity: 40_000 }, reputation: 72,
    finances: { balance: 0, transferBudget: 0, wageBudget: 0, wageBudgetUsed: 0 },
    playerIds: [], formation: '4-3-3', captainId: null, ticketLevel,
  };
}

const income = (level?: number) => computeSeasonFinances(club(level), 8, 20, 1, 500_000, 50_000).income;

describe('ticket pricing (#40)', () => {
  it('an absent level matches an explicit standard (50)', () => {
    expect(income(undefined)).toBe(income(50));
  });

  it('premium pricing earns more than standard, cheap earns less', () => {
    expect(income(100)).toBeGreaterThan(income(50));
    expect(income(0)).toBeLessThan(income(50));
  });

  it('attendance elasticity keeps the premium gain sub-linear (peaks softly)', () => {
    // Doubling the price band does not double gate income — seats empty as prices rise.
    const std = income(50);
    const premium = income(100);
    expect(premium).toBeLessThan(std * 1.4); // price mult is 1.4, but attendance drops
    expect(premium).toBeGreaterThan(std);
  });
});
