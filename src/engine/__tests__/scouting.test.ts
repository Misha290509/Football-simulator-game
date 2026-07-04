import { describe, it, expect } from 'vitest';
import { Rng } from '../rng';
import { generatePlayer } from '../generator';
import { revealed } from '../scouting';
import { coachingFactor, physioFactor, scoutingRate } from '../staff';
import type { Staff } from '../../types/staff';

const p = generatePlayer({ rng: new Rng(1), currentYear: 2024, target: 75, position: 'ST' });

describe('Scouting ranges', () => {
  it('returns exact values at full knowledge', () => {
    const r = revealed(p, 100);
    expect(r.ovrText).toBe(String(p.overall));
    expect(r.potText).toBe(String(p.potential));
  });
  it('returns a wider band at low knowledge', () => {
    const lo = revealed(p, 10);
    const hi = revealed(p, 90);
    expect(lo.ovrHigh - lo.ovrLow).toBeGreaterThan(hi.ovrHigh - hi.ovrLow);
  });
  it('is deterministic', () => {
    expect(revealed(p, 40)).toEqual(revealed(p, 40));
  });
});

describe('Staff factors', () => {
  const coaches: Staff[] = [
    { id: 'a', name: { first: 'A', last: 'B' }, role: 'COACH', rating: 90, wage: 1, clubId: 'c' },
  ];
  const weakCoach: Staff[] = [
    { id: 'b', name: { first: 'C', last: 'D' }, role: 'COACH', rating: 40, wage: 1, clubId: 'c' },
  ];
  it('better coaches develop players faster', () => {
    expect(coachingFactor(coaches, { academy: 5, training: 5 })).toBeGreaterThan(
      coachingFactor(weakCoach, { academy: 1, training: 1 }),
    );
  });
  it('better physios reduce injury factor (<1)', () => {
    const good: Staff[] = [{ id: 'p', name: { first: 'P', last: 'H' }, role: 'PHYSIO', rating: 95, wage: 1, clubId: 'c' }];
    expect(physioFactor(good)).toBeLessThan(1);
  });
  it('better scouts learn faster', () => {
    const fast: Staff[] = [{ id: 's', name: { first: 'S', last: 'C' }, role: 'SCOUT', rating: 95, wage: 1, clubId: 'c' }];
    const slow: Staff[] = [{ id: 's2', name: { first: 'S', last: 'C' }, role: 'SCOUT', rating: 35, wage: 1, clubId: 'c' }];
    expect(scoutingRate(fast)).toBeGreaterThan(scoutingRate(slow));
  });
});
