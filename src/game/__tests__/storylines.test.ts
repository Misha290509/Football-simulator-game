import { describe, it, expect } from 'vitest';
import {
  emptyStorylines, advanceWonderkid, advanceNemesis, advanceSagas, advanceObjectiveMemory,
} from '../storylines';
import type { Player } from '../../types/player';
import type { BoardState } from '../../types/staff';

const kid = (id: string, over: Partial<Player> = {}): Player => ({
  id, name: { first: 'Leo', last: 'Prospect' }, nationality: 'ES', born: { year: 2009 },
  position: 'CM', positions: ['CM'], preferredFoot: 'R', height_cm: 178, weight_kg: 70,
  attributes: {} as never, hidden: {} as never, potential: 90, overall: 58, form: 0,
  morale: 70, fitness: 100, fatigueLoad: 0, injury: null,
  cards: { yellow: 0, red: 0, suspendedFor: 0 },
  contract: { clubId: 'club_A', wage: 1000, startYear: 2025, expiresYear: 2028, signingBonus: 0, releaseClause: null, bonuses: [] },
  value: 1_000_000, squadRole: 'PROSPECT', stats: [], awards: [], developmentLog: [], isReal: false,
  ...over,
});

describe('Storyline arcs', () => {
  it('wonderkid: adopts a prodigy, posts one progress check per season, resolves on breakthrough', () => {
    const s = emptyStorylines();
    const players: Record<string, Player> = { p1: kid('p1') };

    const hype = advanceWonderkid(s, players, ['p1'], 2025, 10);
    expect(hype).toHaveLength(1);
    expect(s.wonderkid?.playerId).toBe('p1');
    expect(s.wonderkid?.stage).toBe('HYPE');

    // Same season: no repeat news.
    expect(advanceWonderkid(s, players, ['p1'], 2025, 40)).toHaveLength(0);

    // Next season: one progress check.
    players.p1 = kid('p1', { overall: 66 });
    expect(advanceWonderkid(s, players, ['p1'], 2026, 10)).toHaveLength(1);
    expect(s.wonderkid?.stage).toBe('RISING');

    // Breakthrough resolves the arc.
    players.p1 = kid('p1', { overall: 85 });
    const done = advanceWonderkid(s, players, ['p1'], 2027, 10);
    expect(done).toHaveLength(1);
    expect(done[0].title).toContain('arrived');
    expect(s.wonderkid?.stage).toBe('DONE');
  });

  it('wonderkid: flames out when potential collapses', () => {
    const s = emptyStorylines();
    const players: Record<string, Player> = { p1: kid('p1') };
    advanceWonderkid(s, players, ['p1'], 2025, 10);
    players.p1 = kid('p1', { potential: 75, overall: 66 });
    const out = advanceWonderkid(s, players, ['p1'], 2026, 10);
    expect(out[0].title).toContain('Whatever happened');
    expect(s.wonderkid?.stage).toBe('DONE');
  });

  it('nemesis: three losses crown a nemesis, a win breaks the curse', () => {
    const s = emptyStorylines();
    expect(advanceNemesis(s, 'Jack Stone', false, false, 1)).toHaveLength(0);
    expect(advanceNemesis(s, 'Jack Stone', false, false, 2)).toHaveLength(0);
    const crowned = advanceNemesis(s, 'Jack Stone', false, false, 3);
    expect(crowned).toHaveLength(1);
    expect(s.nemesis['Jack Stone'].isNemesis).toBe(true);

    const redemption = advanceNemesis(s, 'Jack Stone', true, false, 4);
    expect(redemption[0].title).toContain('curse');
    expect(s.nemesis['Jack Stone'].isNemesis).toBe(false);
    // Draws never move the arc.
    expect(advanceNemesis(s, 'Jack Stone', false, true, 5)).toHaveLength(0);
  });

  it('saga: request opens silently, beats every ~15 days, closes when resolved', () => {
    const s = emptyStorylines();
    const players: Record<string, Player> = { p1: kid('p1', { transferRequested: true, squadRole: 'KEY' }) };

    expect(advanceSagas(s, players, 'club_A', 10)).toHaveLength(0); // opens, no news
    expect(s.saga.p1).toBeTruthy();
    expect(advanceSagas(s, players, 'club_A', 20)).toHaveLength(0); // too soon
    expect(advanceSagas(s, players, 'club_A', 26)).toHaveLength(1); // first beat

    // Player sold (left the club): closing piece + state cleared.
    players.p1 = kid('p1', { contract: { ...players.p1.contract, clubId: 'club_B' } });
    const close = advanceSagas(s, players, 'club_A', 30);
    expect(close).toHaveLength(1);
    expect(s.saga.p1).toBeUndefined();
  });

  it('objective memory: fires once at midseason when short, once in the run-in when close', () => {
    const s = emptyStorylines();
    const board: BoardState = { targetPosition: 5, objectiveText: 'x', confidence: 60 };
    // Midseason, 9th vs target 5th → reminder, exactly once.
    expect(advanceObjectiveMemory(s, board, 9, 100, 200, 2025)).toHaveLength(1);
    expect(advanceObjectiveMemory(s, board, 9, 105, 200, 2025)).toHaveLength(0);
    // Run-in, 6th vs 5th → rallying piece, once.
    expect(advanceObjectiveMemory(s, board, 6, 170, 200, 2025)).toHaveLength(1);
    expect(advanceObjectiveMemory(s, board, 6, 180, 200, 2025)).toHaveLength(0);
    // New season fires again.
    expect(advanceObjectiveMemory(s, board, 9, 100, 200, 2026)).toHaveLength(1);
  });
});
