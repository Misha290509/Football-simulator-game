import { describe, it, expect } from 'vitest';
import { resolveKnockoutTie, playExtraTime } from '../knockout';
import { Rng } from '../../engine/rng';
import type { Match } from '../../types/match';
import type { Club } from '../../types/club';

const club = (id: string, rep: number): Club => ({
  id, name: id, shortName: id, abbrev: id.slice(0, 3), countryId: 'EN',
  crestSeed: 'x', primaryColor: '#000', secondaryColor: '#fff',
  stadium: { name: 'G', capacity: 1 }, reputation: rep,
  finances: { balance: 0, transferBudget: 0, wageBudget: 0, wageBudgetUsed: 0 },
  playerIds: [], formation: '4-3-3', captainId: null,
});

const tie = (hg: number, ag: number, events: Match['events'] = []): Match => ({
  id: 'm', competitionId: 'c', seasonId: 's', round: 1, day: 1,
  homeClubId: 'H', awayClubId: 'A', played: true, homeGoals: hg, awayGoals: ag,
  homeXg: 0, awayXg: 0, events, playerStats: [], seed: 1, neutral: true,
});

const clubs = { H: club('H', 70), A: club('A', 68) };

describe('knockout ties — extra time then penalties (#29)', () => {
  it('returns the winner outright when normal time is decisive (no ET/pens)', () => {
    const m = tie(2, 1);
    const before = m.events.length;
    expect(resolveKnockoutTie(m, clubs, new Rng(1))).toBe('H');
    expect(m.events.length).toBe(before); // untouched
  });

  it('respects a shootout already played out live', () => {
    const m = tie(1, 1, [{ minute: 120, type: 'PENALTY', side: 'away', description: 'Penalty shootout 4–3' }]);
    expect(resolveKnockoutTie(m, clubs, new Rng(1))).toBe('A');
  });

  it('always produces a single winner from a level tie', () => {
    for (let s = 0; s < 60; s++) {
      const m = tie(1, 1);
      const w = resolveKnockoutTie(m, clubs, new Rng(s));
      expect([m.homeClubId, m.awayClubId]).toContain(w);
      // The winner is consistent with the (possibly extra-time-updated) score, or
      // a shootout marker settled a still-level tie.
      if (m.homeGoals !== m.awayGoals) {
        expect(w).toBe(m.homeGoals > m.awayGoals ? 'H' : 'A');
        expect(m.events.every((e) => e.type !== 'PENALTY')).toBe(true);
      } else {
        expect(m.events.some((e) => e.type === 'PENALTY')).toBe(true);
      }
    }
  });

  it('sometimes settles a tie in extra time before penalties', () => {
    let etDecided = 0;
    for (let s = 0; s < 200; s++) {
      const m = tie(1, 1);
      resolveKnockoutTie(m, clubs, new Rng(s));
      if (m.events.some((e) => e.type === 'GOAL' && e.description === 'Extra-time goal') && m.events.every((e) => e.type !== 'PENALTY')) etDecided++;
    }
    expect(etDecided).toBeGreaterThan(0);
  });

  it('playExtraTime only ever adds goals, never removes them', () => {
    const m = tie(2, 2);
    playExtraTime(m, clubs, new Rng(5));
    expect(m.homeGoals).toBeGreaterThanOrEqual(2);
    expect(m.awayGoals).toBeGreaterThanOrEqual(2);
  });
});
