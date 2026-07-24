import { describe, it, expect } from 'vitest';
import { applyDebt, debtCeiling } from '../debt';

describe('debt, interest & administration (#39)', () => {
  it('leaves a healthy balance untouched', () => {
    expect(applyDebt(50_000_000, 80)).toEqual({ balance: 50_000_000, administration: false });
    expect(applyDebt(0, 60)).toEqual({ balance: 0, administration: false });
  });

  it('charges 8% interest on debt within the ceiling', () => {
    const out = applyDebt(-10_000_000, 70);
    expect(out.administration).toBe(false);
    expect(out.balance).toBe(Math.round(-10_000_000 * 1.08)); // deeper in the red
  });

  it('tips into administration past the ceiling, restructuring the debt', () => {
    const ceiling = debtCeiling(60); // -(20m + 60*1.5m) = -110m
    const out = applyDebt(ceiling - 50_000_000, 60);
    expect(out.administration).toBe(true);
    // Debt is written down to 40% of the ceiling — less deep than before.
    expect(out.balance).toBe(Math.round(ceiling * 0.4));
    expect(out.balance).toBeGreaterThan(ceiling);
  });

  it('lets bigger clubs (and an inflated economy) carry more debt', () => {
    expect(debtCeiling(85)).toBeLessThan(debtCeiling(50)); // more negative = deeper allowance
    expect(debtCeiling(60, 2)).toBeLessThan(debtCeiling(60, 1));
  });
});
