import { describe, it, expect } from 'vitest';
import {
  generateMatchObjectives, evaluateMatchObjectives, generateSeasonObjectives, updateSeasonObjectives,
} from '../playerObjectives';
import type { Player } from '../../types/player';
import type { Match } from '../../types/match';
import type { Position } from '../../types/attributes';

function player(position: Position): Player {
  return { id: 'av', position, positions: [position], born: { year: 2007 }, contract: { clubId: 'C' } } as unknown as Player;
}
function match(id: string): Match {
  return { id, day: 10, neutral: false, homeClubId: 'C', awayClubId: 'O', homeGoals: 0, awayGoals: 0, competitionId: 'L', playerStats: [] } as unknown as Match;
}
const ps = (o: Partial<Match['playerStats'][number]>) => ({ playerId: 'av', minutes: 90, goals: 0, assists: 0, shots: 0, rating: 6.7, yellow: false, red: false, ...o });

describe('per-match objectives', () => {
  it('are position-correct — a keeper is never asked to score', () => {
    const gk = generateMatchObjectives(player('GK'), match('m1'), 7);
    expect(gk.length).toBeGreaterThanOrEqual(1);
    expect(gk.some((o) => o.kind === 'GOAL')).toBe(false);
    expect(gk.some((o) => o.kind === 'CLEAN_SHEET' || o.kind === 'SAVES')).toBe(true);
  });

  it('a striker gets a scoring brief', () => {
    const st = generateMatchObjectives(player('ST'), match('m2'), 7);
    expect(st[0].kind).toBe('GOAL');
  });

  it('is deterministic for a fixed seed', () => {
    const a = generateMatchObjectives(player('CM'), match('m3'), 42).map((o) => `${o.kind}:${o.target}`).join('|');
    const b = generateMatchObjectives(player('CM'), match('m3'), 42).map((o) => `${o.kind}:${o.target}`).join('|');
    expect(a).toBe(b);
  });

  it('evaluates against playerStats and rewards met / penalises missed', () => {
    const objs = [
      { matchId: 'm', kind: 'GOAL' as const, target: 1, text: '' },
      { matchId: 'm', kind: 'CLEAN_SHEET' as const, target: 1, text: '' },
    ];
    // Scored (met) but conceded (missed clean sheet): net small.
    const out = evaluateMatchObjectives(objs, ps({ goals: 1 }), 2, 1);
    expect(out.objectives[0].met).toBe(true);
    expect(out.objectives[1].met).toBe(false);
    // Both met → positive trust; both missed → negative.
    const allMet = evaluateMatchObjectives(objs, ps({ goals: 1 }), 1, 0);
    expect(allMet.trustDelta).toBeGreaterThan(0);
    const allMiss = evaluateMatchObjectives(objs, ps({ goals: 0 }), 0, 2);
    expect(allMiss.trustDelta).toBeLessThan(0);
    expect(allMet.trustDelta).toBeLessThanOrEqual(3);
    expect(allMiss.trustDelta).toBeGreaterThanOrEqual(-3);
  });
});

describe('season objectives', () => {
  it('generates role-appropriate targets and tracks progress to completion', () => {
    const objs = generateSeasonObjectives(player('ST'), 7);
    expect(objs.length).toBeGreaterThanOrEqual(2);
    expect(objs.some((o) => o.kind === 'GOALS')).toBe(true);

    const goalsObj = objs.find((o) => o.kind === 'GOALS')!;
    const under = updateSeasonObjectives(objs, { apps: 10, goals: goalsObj.target! - 1, assists: 2, avgRating: 7 });
    expect(under.find((o) => o.kind === 'GOALS')!.met).toBe(false);
    const over = updateSeasonObjectives(objs, { apps: 30, goals: goalsObj.target!, assists: 9, avgRating: 7.2 });
    expect(over.find((o) => o.kind === 'GOALS')!.met).toBe(true);
  });

  it('avg-rating objective needs a minimum sample before it can complete', () => {
    const objs = [{ kind: 'AVG_RATING' as const, target: 7.0, progress: 0, met: false, text: '' }];
    expect(updateSeasonObjectives(objs, { apps: 2, goals: 0, assists: 0, avgRating: 8 })[0].met).toBe(false);
    expect(updateSeasonObjectives(objs, { apps: 6, goals: 0, assists: 0, avgRating: 8 })[0].met).toBe(true);
  });
});
