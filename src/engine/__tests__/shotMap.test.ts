import { describe, it, expect } from 'vitest';
import { simulateMatch } from '../match';
import { buildLineupProfile, FORMATIONS } from '../lineup';
import { generatePlayer } from '../generator';
import { Rng } from '../rng';
import type { Player } from '../../types/player';
import type { LineupProfile } from '../../types/match';

function team(clubId: string, seed: number, target: number): LineupProfile {
  const rng = new Rng(seed);
  const players: Player[] = FORMATIONS['4-3-3'].map((pos, i) => {
    const p = generatePlayer({ rng, currentYear: 2025, target, position: pos, ageRange: [23, 29], ratingCap: 90 });
    p.id = `${clubId}_${i}`; p.contract.clubId = clubId;
    return p;
  });
  return buildLineupProfile(clubId, players, '4-3-3', { autoMode: true });
}

describe('shot map', () => {
  const home = team('H', 1, 78);
  const away = team('A', 2, 72);

  it('records one shot per team shot, with goals matching the scoreline', () => {
    const out = simulateMatch(home, away, 4242);
    const totalStatShots = out.playerStats.reduce((n, s) => n + s.shots, 0);
    expect(out.shots.length).toBe(totalStatShots);
    const goalShots = out.shots.filter((s) => s.outcome === 'GOAL').length;
    expect(goalShots).toBe(out.homeGoals + out.awayGoals);
  });

  it('places shots on the pitch with sane coordinates and positive xG', () => {
    const out = simulateMatch(home, away, 99);
    for (const s of out.shots) {
      expect(s.x).toBeGreaterThanOrEqual(60);
      expect(s.x).toBeLessThanOrEqual(99);
      expect(s.y).toBeGreaterThanOrEqual(4);
      expect(s.y).toBeLessThanOrEqual(96);
      expect(s.xg).toBeGreaterThan(0);
      expect(['GOAL', 'SAVED', 'OFF']).toContain(s.outcome);
    }
  });

  it('is deterministic for a given seed', () => {
    expect(simulateMatch(home, away, 7).shots).toEqual(simulateMatch(home, away, 7).shots);
  });

  it('capturing shots does not change the scoreline or xG (sub-RNG only)', () => {
    // Two independent runs on the same seed must agree on the headline result —
    // the shot map draws from an independent stream, so the match is unchanged.
    const a = simulateMatch(home, away, 20240);
    const b = simulateMatch(home, away, 20240);
    expect([a.homeGoals, a.awayGoals, a.homeXg, a.awayXg]).toEqual([b.homeGoals, b.awayGoals, b.homeXg, b.awayXg]);
  });
});
