import { describe, it, expect } from 'vitest';
import { estimateValue } from '../valuation';
import { computeSeasonFinances, deriveBudgets } from '../finances';
import type { Club } from '../../types/club';

const club = (): Club => ({
  id: 'C', name: 'C', shortName: 'C', abbrev: 'CLB', countryId: 'EN',
  crestSeed: 'x', primaryColor: '#000', secondaryColor: '#fff',
  stadium: { name: 'G', capacity: 40_000 }, reputation: 75,
  finances: { balance: 0, transferBudget: 0, wageBudget: 0, wageBudgetUsed: 0 },
  playerIds: [], formation: '4-3-3', captainId: null,
});

describe('market inflation (#36)', () => {
  it('defaults to no inflation (multiplier 1)', () => {
    expect(estimateValue(85, 24, 88)).toBe(estimateValue(85, 24, 88, 1));
    expect(computeSeasonFinances(club(), 5, 20, 1, 500_000, 50_000).income)
      .toBe(computeSeasonFinances(club(), 5, 20, 1, 500_000, 50_000, 1).income);
  });

  it('scales player value, income and budget floors with the multiplier', () => {
    const base = estimateValue(85, 24, 88, 1);
    const inflated = estimateValue(85, 24, 88, 1.5);
    expect(inflated).toBeGreaterThan(base * 1.4);

    const incBase = computeSeasonFinances(club(), 5, 20, 1, 500_000, 50_000, 1).income;
    const incUp = computeSeasonFinances(club(), 5, 20, 1, 500_000, 50_000, 1.5).income;
    expect(incUp).toBeCloseTo(incBase * 1.5, -6);

    // A cash-poor club's budget floor lifts with inflation.
    const budBase = deriveBudgets(0, 100_000, 75, 1, 1).transferBudget;
    const budUp = deriveBudgets(0, 100_000, 75, 1, 1.5).transferBudget;
    expect(budUp).toBeGreaterThan(budBase);
  });

  it('compounds over the decades (≈3%/season)', () => {
    let inflation = 1;
    for (let s = 0; s < 20; s++) inflation *= 1.03;
    // Twenty seasons of 3% ≈ 1.8×.
    expect(inflation).toBeGreaterThan(1.7);
    expect(inflation).toBeLessThan(1.9);
    expect(estimateValue(80, 25, 82, inflation)).toBeGreaterThan(estimateValue(80, 25, 82, 1) * 1.7);
  });
});
