import { describe, it, expect } from 'vitest';
import { Rng, hashSeed } from '../rng';
import { overallAt, bestOverall } from '../ratings';
import { generatePlayer, generateSquad, resetIdCounter } from '../generator';
import { DEFAULT_ATTRIBUTES } from '../../data/defaults';

describe('Rng determinism', () => {
  it('produces identical sequences for the same seed', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    expect(a.next()).not.toEqual(b.next());
  });

  it('stays within bounds for int()', () => {
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(3, 9);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(9);
    }
  });

  it('hashSeed is stable', () => {
    expect(hashSeed('Arsenal')).toEqual(hashSeed('Arsenal'));
    expect(hashSeed('Arsenal')).not.toEqual(hashSeed('Chelsea'));
  });
});

describe('Overall per position', () => {
  it('rates a striker higher up front than at the back', () => {
    const attrs = structuredClone(DEFAULT_ATTRIBUTES);
    attrs.technical.finishing = 95;
    attrs.mental.positioning = 90;
    attrs.physical.sprintSpeed = 88;
    expect(overallAt(attrs, 'ST')).toBeGreaterThan(overallAt(attrs, 'RCB'));
  });

  it('bestOverall picks the strongest listed position', () => {
    const attrs = structuredClone(DEFAULT_ATTRIBUTES);
    attrs.technical.finishing = 99;
    const best = bestOverall(attrs, ['RCB', 'ST']);
    expect(best.position).toBe('ST');
  });
});

describe('Generator determinism', () => {
  it('same seed yields identical player attributes', () => {
    resetIdCounter();
    const p1 = generatePlayer({ rng: new Rng(99), currentYear: 2024, target: 70, position: 'ST' });
    resetIdCounter();
    const p2 = generatePlayer({ rng: new Rng(99), currentYear: 2024, target: 70, position: 'ST' });
    expect(p1.attributes).toEqual(p2.attributes);
    expect(p1.overall).toEqual(p2.overall);
    expect(p1.potential).toBeGreaterThanOrEqual(p1.overall);
  });

  it('higher reputation yields a stronger squad on average', () => {
    const strong = generateSquad({ rng: new Rng(5), currentYear: 2024, reputation: 90, clubId: 'a', nationality: 'GB' });
    const weak = generateSquad({ rng: new Rng(5), currentYear: 2024, reputation: 40, clubId: 'b', nationality: 'GB' });
    const avg = (ps: { overall: number }[]) => ps.reduce((s, p) => s + p.overall, 0) / ps.length;
    expect(avg(strong)).toBeGreaterThan(avg(weak));
  });

  it('generates a full ~25-man squad', () => {
    const squad = generateSquad({ rng: new Rng(1), currentYear: 2024, reputation: 70, clubId: 'c', nationality: 'GB' });
    expect(squad.length).toBeGreaterThanOrEqual(24);
    expect(squad.some((p) => p.position === 'GK')).toBe(true);
  });
});
