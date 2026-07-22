import { describe, it, expect } from 'vitest';
import { applyAvatarMatchday, initialPlayerCareer } from '../playerCareer';
import type { Player } from '../../types/player';
import type { Match } from '../../types/match';
import type { Club } from '../../types/club';
import type { Competition } from '../../types/competition';

const CLUBS = {
  C: { shortName: 'CFC', name: 'City FC' },
  O: { shortName: 'OPP', name: 'Opponent' },
} as unknown as Record<string, Club>;
const COMPS = { L: { name: 'Premier League' } } as unknown as Record<string, Competition>;

function avatar(stats: Partial<Player['stats'][number]>[]): Player {
  return {
    id: 'av', name: { first: 'Alex', last: 'Hunter' }, position: 'ST', positions: ['ST'],
    contract: { clubId: 'C', wage: 500, startYear: 2025, expiresYear: 2028, signingBonus: 0, releaseClause: null, bonuses: [] },
    born: { year: 2009 }, hidden: { professionalism: 55, ambition: 60 },
    stats: stats.map((s) => ({
      seasonId: 'S', competitionId: 'L', clubId: 'C', appearances: 0, starts: 0, minutes: 0,
      goals: 0, assists: 0, cleanSheets: 0, yellowCards: 0, redCards: 0, avgRating: 0, ratingSum: 0, ratingCount: 0, ...s,
    })),
  } as unknown as Player;
}

function match(id: string, day: number, hs: number, as: number, ps: Partial<Match['playerStats'][number]>): Match {
  return {
    id, day, neutral: false, played: true, homeClubId: 'C', awayClubId: 'O', homeGoals: hs, awayGoals: as,
    competitionId: 'L',
    playerStats: [{ playerId: 'av', minutes: 90, goals: 0, assists: 0, shots: 1, rating: 6.7, yellow: false, red: false, ...ps }],
  } as unknown as Match;
}

function freshCareer() {
  return initialPlayerCareer(avatar([]), 'CREATED', 'Academy Graduate', 'City FC');
}

describe('applyAvatarMatchday (Player Career matchday loop)', () => {
  it('records tallies, a win summary, trust rise, and debut + first-goal milestones', () => {
    const av = avatar([{ appearances: 1, starts: 1, minutes: 90, goals: 1, ratingSum: 7.5, ratingCount: 1, avgRating: 7.5 }]);
    const played = [match('m1', 10, 2, 1, { goals: 1, rating: 7.5 })];
    const { career, news } = applyAvatarMatchday(freshCareer(), av, played, CLUBS, COMPS, 'S', 12);

    expect(career.seasonApps).toBe(1);
    expect(career.seasonGoals).toBe(1);
    expect(career.seasonAvgRating).toBe(7.5);
    expect(career.managerTrust).toBeGreaterThan(42); // good game lifts trust
    expect(career.lastMatch).toMatchObject({ opponent: 'OPP', result: 'W', goals: 1, rating: 7.5, home: true });

    const timeline = career.milestones.map((m) => m.text.toLowerCase()).join(' | ');
    expect(timeline).toContain('debut');
    expect(timeline).toContain('first senior goal');
    // Personal feed items were raised.
    expect(news.some((n) => /debut/i.test(n.title))).toBe(true);
    expect(news.some((n) => /first senior goal/i.test(n.title))).toBe(true);
  });

  it('does nothing to trust when the avatar did not feature', () => {
    const av = avatar([]); // no stats
    const before = freshCareer();
    const { career, news } = applyAvatarMatchday(before, av, [], CLUBS, COMPS, 'S', 12);
    expect(career.managerTrust).toBe(before.managerTrust);
    expect(news).toHaveLength(0);
    expect(career.lastMatch).toBeUndefined();
  });

  it('does not duplicate the debut milestone on a later advance', () => {
    const av1 = avatar([{ appearances: 1, minutes: 90, ratingSum: 7, ratingCount: 1 }]);
    const step1 = applyAvatarMatchday(freshCareer(), av1, [match('m1', 10, 1, 0, { rating: 7 })], CLUBS, COMPS, 'S', 12).career;
    const debutCount1 = step1.milestones.filter((m) => /debut/i.test(m.text)).length;
    expect(debutCount1).toBe(1);

    // Second advance: avatar now has 2 apps.
    const av2 = avatar([{ appearances: 2, minutes: 180, ratingSum: 14, ratingCount: 2 }]);
    const step2 = applyAvatarMatchday(step1, av2, [match('m2', 13, 0, 2, { rating: 6.5 })], CLUBS, COMPS, 'S', 15).career;
    const debutCount2 = step2.milestones.filter((m) => /debut/i.test(m.text)).length;
    expect(debutCount2).toBe(1); // still just the one
  });
});
