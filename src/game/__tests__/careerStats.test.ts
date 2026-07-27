import { describe, it, expect } from 'vitest';
import {
  careerTotals, seasonSeries, bestSeason, leaderboard, avatarRank,
  highlightReel, headToHead, buildCareerCard,
} from '../careerStats';
import type { Player } from '../../types/player';
import type { PlayerCareer } from '../../types/playerCareer';

const seasons = [
  { season: '2024/25', club: 'City', apps: 30, goals: 12, assists: 5, avgRating: 7.1, honours: ['League'] },
  { season: '2025/26', club: 'City', apps: 34, goals: 20, assists: 8, avgRating: 7.5, honours: ['League', 'Cup'] },
  { season: '2026/27', club: 'Rovers', apps: 20, goals: 4, assists: 2, avgRating: 6.6, honours: [] },
];

const career = (over: Partial<PlayerCareer> = {}): PlayerCareer =>
  ({ playerId: 'me', seasonHistory: seasons, seasonApps: 6, seasonGoals: 3, seasonAvgRating: 7.2,
     milestones: [{ day: 10, text: 'Scored his first senior goal.' }, { day: 90, text: 'Reached 25 career goals.' }],
     ...over } as unknown as PlayerCareer);

const avatar = (): Player =>
  ({ id: 'me', name: { first: 'Alex', last: 'Hunter' }, position: 'ST', overall: 84,
     born: { year: 2000 }, contract: { clubId: 'C' } } as unknown as Player);

function statPlayer(id: string, goals: number, assists: number, ratingSum: number, ratingCount: number, apps = 20): Player {
  return {
    id, name: { first: id, last: id.toUpperCase() }, contract: { clubId: 'C' },
    stats: [{ seasonId: 'S1', competitionId: 'L', clubId: 'C', appearances: apps, goals, assists, ratingSum, ratingCount }],
  } as unknown as Player;
}

describe('career totals', () => {
  it('sums every season plus the one in progress', () => {
    const t = careerTotals(career());
    expect(t.apps).toBe(30 + 34 + 20 + 6);
    expect(t.goals).toBe(12 + 20 + 4 + 3);
    expect(t.assists).toBe(15);
    expect(t.seasons).toBe(3);
    expect(t.clubs).toBe(2);
    expect(t.honours).toBe(3);
    expect(t.goalsPerApp).toBeGreaterThan(0);
  });

  it('handles a career that has barely started', () => {
    const t = careerTotals({ playerId: 'me', seasonHistory: [], seasonApps: 0, seasonGoals: 0 } as unknown as PlayerCareer);
    expect(t.apps).toBe(0);
    expect(t.goalsPerApp).toBe(0);
    expect(t.clubs).toBe(1);
  });

  it('weights the average rating by appearances, not by season', () => {
    const t = careerTotals(career());
    expect(t.avgRating).toBeGreaterThan(6.6);
    expect(t.avgRating).toBeLessThan(7.5);
  });
});

describe('season series', () => {
  it('returns a point per completed season and finds the best one', () => {
    expect(seasonSeries(career())).toHaveLength(3);
    expect(bestSeason(career())!.season).toBe('2025/26');
  });

  it('has no best season before he has played', () => {
    expect(bestSeason({ playerId: 'me', seasonHistory: [] } as unknown as PlayerCareer)).toBeNull();
  });
});

describe('leaderboard', () => {
  const clubs = { C: { name: 'City', shortName: 'CTY' } };

  it('ranks by the chosen metric and marks the avatar', () => {
    const players = [statPlayer('me', 15, 4, 140, 20), statPlayer('a', 22, 2, 130, 20), statPlayer('b', 8, 12, 150, 20)];
    const goals = leaderboard(players, clubs, 'S1', 'goals', 'me');
    expect(goals[0].name).toBe('a A');
    expect(goals.find((r) => r.playerId === 'me')!.isAvatar).toBe(true);
    expect(avatarRank(goals, 'me')).toBe(2);

    const assists = leaderboard(players, clubs, 'S1', 'assists', 'me');
    expect(assists[0].playerId).toBe('b');
  });

  it('always includes the avatar even when he is outside the top ten', () => {
    const others = Array.from({ length: 15 }, (_, i) => statPlayer(`p${i}`, 30 + i, 0, 140, 20));
    const players = [...others, statPlayer('me', 1, 0, 100, 20)];
    const rows = leaderboard(players, clubs, 'S1', 'goals', 'me', 10);
    expect(rows.length).toBe(11);
    expect(rows.some((r) => r.isAvatar)).toBe(true);
  });

  it('ignores players with too few games to have a real rating', () => {
    const players = [statPlayer('me', 5, 5, 130, 18), statPlayer('cameo', 0, 0, 29, 3, 3)];
    const rows = leaderboard(players, clubs, 'S1', 'rating', 'me');
    expect(rows.some((r) => r.playerId === 'cameo')).toBe(false);
  });
});

describe('highlight reel & head-to-head', () => {
  it('returns milestones newest first', () => {
    const reel = highlightReel(career());
    expect(reel).toHaveLength(2);
    expect(reel[0].day).toBeGreaterThan(reel[1].day);
  });

  it('aggregates per-opponent history', () => {
    const c = career({ opponentLog: [
      { club: 'Rovers', goals: 2, rating: 8.0, day: 1 },
      { club: 'Rovers', goals: 0, rating: 6.0, day: 8 },
      { club: 'United', goals: 1, rating: 7.0, day: 15 },
    ] });
    const rows = headToHead(c);
    expect(rows[0].club).toBe('Rovers');
    expect(rows[0].games).toBe(2);
    expect(rows[0].goals).toBe(2);
    expect(rows[0].avgRating).toBe(7);
  });
});

describe('career card', () => {
  it('summarises identity, honours and delivers a verdict', () => {
    const c = career({
      identity: { hometown: 'Salford', boyhoodClub: 'City', homecoming: { clubName: 'City', day: 1 } },
      hasChant: true, badges: ['C', 'B'], international: { capped: true, caps: 40, intlGoals: 9 },
    });
    const card = buildCareerCard(c, avatar(), 'City', 2027);
    expect(card.name).toBe('Alex Hunter');
    expect(card.age).toBe(27);
    expect(card.identity.some((t) => /Salford/.test(t))).toBe(true);
    expect(card.identity).toContain('came home');
    expect(card.identity).toContain('had his own song');
    expect(card.honours).toEqual(expect.arrayContaining(['League', 'Cup']));
    expect(card.verdict.length).toBeGreaterThan(0);
  });

  it('gives a modest verdict to a career just beginning', () => {
    const card = buildCareerCard({ playerId: 'me', seasonHistory: [], seasonApps: 2 } as unknown as PlayerCareer, avatar(), 'City', 2025);
    expect(card.verdict).toMatch(/still being written/i);
  });
});
