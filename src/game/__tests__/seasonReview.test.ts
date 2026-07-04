import { describe, it, expect } from 'vitest';
import { computeSeasonSummary } from '../seasonReview';
import { loadDataset } from '../../data/datasetLoader';
import { ENGLAND_DATASET } from '../../data/england';
import type { Match } from '../../types/match';
import type { Player } from '../../types/player';
import type { PlayerMatchStat } from '../../types/match';

const world = loadDataset(ENGLAND_DATASET, 5, 2024);
const US = 'us';
const THEM = 'them';
const players: Record<string, Player> = {
  striker: { ...Object.values(world.players)[0], id: 'striker', contract: { ...Object.values(world.players)[0].contract, clubId: US } },
  mid: { ...Object.values(world.players)[1], id: 'mid', contract: { ...Object.values(world.players)[1].contract, clubId: US } },
};

function stat(id: string, goals: number, rating: number, minutes = 90): PlayerMatchStat {
  return { playerId: id, minutes, goals, assists: 0, shots: 0, rating, yellow: false, red: false };
}
function match(id: string, day: number, hg: number, ag: number, stats: PlayerMatchStat[]): Match {
  return { id, competitionId: 'c', seasonId: 's', round: day, day, homeClubId: US, awayClubId: THEM, played: true, homeGoals: hg, awayGoals: ag, homeXg: 0, awayXg: 0, events: [], playerStats: stats, seed: 0 };
}

describe('Season review', () => {
  const matches = [
    match('a', 1, 3, 0, [stat('striker', 2, 8.0), stat('mid', 1, 7.5)]),
    match('b', 2, 1, 1, [stat('striker', 1, 7.0), stat('mid', 0, 6.5)]),
    match('c', 3, 0, 2, [stat('striker', 0, 5.5), stat('mid', 0, 6.0)]),
    match('d', 4, 5, 0, [stat('striker', 3, 9.0), stat('mid', 1, 7.0)]),
    match('e', 5, 2, 1, [stat('striker', 1, 7.5), stat('mid', 1, 8.5)]),
  ];

  it('computes the record and goals', () => {
    const s = computeSeasonSummary(US, matches, players);
    expect(s.played).toBe(5);
    expect(s.won).toBe(3);
    expect(s.drawn).toBe(1);
    expect(s.lost).toBe(1);
    expect(s.goalsFor).toBe(11);
    expect(s.goalsAgainst).toBe(4);
  });

  it('identifies the biggest win, top scorer and best performer', () => {
    const s = computeSeasonSummary(US, matches, players);
    expect(s.biggestWin?.score).toBe('5-0');
    expect(s.topScorerId).toBe('striker');
    expect(s.topScorerGoals).toBe(7);
    expect(s.bestRatedId).toBe('striker'); // higher season average across 5 apps
  });

  it('ignores matches the club did not play in', () => {
    const other: Match = { ...match('x', 6, 9, 0, []), homeClubId: 'a', awayClubId: 'b' };
    const s = computeSeasonSummary(US, [...matches, other], players);
    expect(s.played).toBe(5);
  });
});
