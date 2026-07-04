import { describe, it, expect } from 'vitest';
import { assessFfp, applyPointsPenalties } from '../ffp';
import type { StandingRow } from '../../types/league';

describe('Financial Fair Play', () => {
  it('is compliant when wages are a healthy share of revenue', () => {
    const v = assessFfp(50, 100, { strikes: 0, embargo: false });
    expect(v.breach).toBe(false);
    expect(v.embargo).toBe(false);
  });

  it('escalates warning → embargo → forced sale + points deduction on repeated breaches', () => {
    const a = assessFfp(90, 100, { strikes: 0, embargo: false });
    expect(a.breach).toBe(true);
    expect(a.strikes).toBe(1);
    expect(a.embargo).toBe(false);

    const b = assessFfp(90, 100, { strikes: 1, embargo: false });
    expect(b.embargo).toBe(true);
    expect(b.pointsPenalty).toBe(0);

    const c = assessFfp(90, 100, { strikes: 2, embargo: true });
    expect(c.embargo).toBe(true);
    expect(c.forceSale).toBe(true);
    expect(c.pointsPenalty).toBeGreaterThan(0);
  });

  it('burns a strike back down after a compliant season', () => {
    const v = assessFfp(60, 100, { strikes: 2, embargo: true });
    expect(v.breach).toBe(false);
    expect(v.strikes).toBe(1);
  });

  it('applies points penalties and re-sorts the table', () => {
    const rows: StandingRow[] = [
      { clubId: 'a', played: 10, won: 8, drawn: 1, lost: 1, goalsFor: 20, goalsAgainst: 8, points: 25 },
      { clubId: 'b', played: 10, won: 7, drawn: 2, lost: 1, goalsFor: 18, goalsAgainst: 9, points: 23 },
    ];
    const adj = applyPointsPenalties(rows, { a: 6 });
    expect(adj[0].clubId).toBe('b'); // a dropped below b after −6
    expect(adj.find((r) => r.clubId === 'a')!.points).toBe(19);
  });
});
