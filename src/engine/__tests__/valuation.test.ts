import { describe, it, expect } from 'vitest';
import { estimateValue } from '../valuation';

describe('Market valuation curve', () => {
  it('prices elite players in the modern €150M+ band', () => {
    // Lamine Yamal (89 OVR, 18, 95 pot) should clear the €180M mark, not €38M.
    expect(estimateValue(89, 18, 95)).toBeGreaterThanOrEqual(180_000_000);
    // Prime superstars land in the same ballpark.
    expect(estimateValue(90, 25, 92)).toBeGreaterThan(150_000_000); // Haaland-ish
    expect(estimateValue(91, 27, 94)).toBeGreaterThan(150_000_000); // Mbappé-ish
  });

  it('keeps the rest of the market grounded', () => {
    expect(estimateValue(72, 24, 74)).toBeLessThan(10_000_000);   // squad player
    const starter = estimateValue(80, 25, 82);
    expect(starter).toBeGreaterThan(12_000_000);                  // solid starter
    expect(starter).toBeLessThan(60_000_000);
  });

  it('rises with ability, youth and upside; falls with age', () => {
    expect(estimateValue(85, 24, 85)).toBeGreaterThan(estimateValue(80, 24, 80));
    // A 21-year-old is worth more than an identical 33-year-old.
    expect(estimateValue(84, 21, 88)).toBeGreaterThan(estimateValue(84, 33, 84));
    // Upside adds a premium at equal current ability.
    expect(estimateValue(78, 20, 90)).toBeGreaterThan(estimateValue(78, 20, 78));
  });

  it('is far steeper at the top than a linear scale (a 90 beats 3× a 78)', () => {
    expect(estimateValue(90, 25, 90)).toBeGreaterThan(3 * estimateValue(78, 25, 78));
  });
});
