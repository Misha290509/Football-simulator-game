import { describe, it, expect } from 'vitest';
import { driftClubReputations } from '../reputationDrift';
import type { Club } from '../../types/club';
import type { Competition } from '../../types/competition';
import type { StandingRow } from '../../types/league';

const club = (id: string, rep: number): Club => ({
  id, name: id, shortName: id, abbrev: id.slice(0, 3), countryId: 'EN',
  crestSeed: 'x', primaryColor: '#000', secondaryColor: '#fff',
  stadium: { name: 'G', capacity: 1 }, reputation: rep,
  finances: { balance: 0, transferBudget: 0, wageBudget: 0, wageBudgetUsed: 0 },
  playerIds: [], formation: '4-3-3', captainId: null,
});

const row = (clubId: string): StandingRow => ({
  clubId, played: 38, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0,
} as StandingRow);

const comp = (tier: number): Competition => ({ tier } as Competition);

describe('club reputation drift (#50)', () => {
  it('lifts an over-achiever and lowers an under-achiever, gently', () => {
    // A modest club (rep 60) winning tier 1 should rise; an elite club (rep 90)
    // finishing bottom should fall — but only a little in one season.
    const clubs = { A: club('A', 60), B: club('B', 90) };
    const standings = { L: [row('A'), ...Array.from({ length: 18 }, (_, i) => row(`x${i}`)), row('B')] };
    const changed = driftClubReputations(clubs, standings, { L: comp(1) });
    const a = changed.find((c) => c.id === 'A')!;
    const b = changed.find((c) => c.id === 'B')!;
    expect(a.reputation).toBeGreaterThan(60);
    expect(b.reputation).toBeLessThan(90);
    // Gentle: never more than the per-season cap.
    expect(a.reputation - 60).toBeLessThanOrEqual(1.5);
    expect(90 - b.reputation).toBeLessThanOrEqual(1.5);
  });

  it('leaves a club already at its deserved level roughly unchanged', () => {
    // A mid-table tier-1 club at ~72 sits near its target — negligible drift.
    const clubs = { M: club('M', 72) };
    const standings = { L: [...Array.from({ length: 10 }, (_, i) => row(`x${i}`)), row('M'), ...Array.from({ length: 9 }, (_, i) => row(`y${i}`))] };
    const changed = driftClubReputations(clubs, standings, { L: comp(1) });
    const m = changed.find((c) => c.id === 'M');
    if (m) expect(Math.abs(m.reputation - 72)).toBeLessThan(1);
  });

  it('converges toward a stable level over many seasons of the same finish', () => {
    let clubs = { A: club('A', 55) };
    const standings = { L: [row('A'), ...Array.from({ length: 19 }, (_, i) => row(`x${i}`))] }; // champions every year
    for (let s = 0; s < 40; s++) {
      const changed = driftClubReputations(clubs, standings, { L: comp(1) });
      if (changed[0]) clubs = { A: changed[0] };
    }
    // Champions of tier 1 converge toward the ~94 ceiling, not overshoot.
    expect(clubs.A.reputation).toBeGreaterThan(88);
    expect(clubs.A.reputation).toBeLessThanOrEqual(96);
  });
});
