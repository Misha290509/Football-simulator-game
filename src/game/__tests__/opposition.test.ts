import { describe, it, expect } from 'vitest';
import {
  buildOppositionPlan, targetingFactor, tacticalFoulAt, tacticalFoulTick,
  updateBogeyTeams, bogeyFactor,
} from '../opposition';
import type { Player } from '../../types/player';
import type { PlayerCareer, SquadStatus } from '../../types/playerCareer';

const player = (overall = 85): Player =>
  ({ id: 'me', name: { first: 'Alex', last: 'Hunter' }, position: 'ST', positions: ['ST'], overall } as unknown as Player);
const career = (status: SquadStatus, over: Partial<PlayerCareer> = {}): PlayerCareer =>
  ({ playerId: 'me', status, seasonGoals: 15, ...over } as unknown as PlayerCareer);

describe('opposition plans', () => {
  it('ignores a squad player and targets a star', () => {
    const youth = buildOppositionPlan(career('YOUTH'), player(62), 'm1', 7);
    const star = buildOppositionPlan(career('STAR'), player(88), 'm1', 7, 'Big Jim');
    expect(youth.attention).toBeLessThan(star.attention);
    expect(youth.manMarked).toBe(false);
    expect(star.attention).toBeGreaterThan(0.6);
  });

  it('is deterministic per fixture', () => {
    const a = buildOppositionPlan(career('STAR'), player(88), 'm1', 7, 'Jim');
    const b = buildOppositionPlan(career('STAR'), player(88), 'm1', 7, 'Jim');
    expect(a).toEqual(b);
  });

  it('names the marker only when they actually man-mark', () => {
    let sawMarked = false;
    for (let i = 0; i < 40 && !sawMarked; i++) {
      const plan = buildOppositionPlan(career('STAR'), player(90), `m${i}`, 7, 'Big Jim');
      if (plan.manMarked) { expect(plan.markerName).toBe('Big Jim'); sawMarked = true; }
      else expect(plan.markerName).toBeUndefined();
    }
    expect(sawMarked).toBe(true);
  });

  it('man-marking and doubling up make his on-ball moments harder', () => {
    const plan = { manMarked: true, doubledUp: true, tacticalFouls: true, attention: 0.9, label: '' };
    expect(targetingFactor(plan, 'ONE_ON_ONE', 'GOAL')).toBeLessThan(1);
    expect(targetingFactor(plan, 'TAKE_ON', 'KEY_PASS')).toBeLessThan(1);
    // A defensive clearance isn't affected by being man-marked.
    expect(targetingFactor(plan, 'CLEAR_OR_PLAY_OUT', 'CLEAN_CLEARANCE')).toBe(1);
    expect(targetingFactor(undefined, 'ONE_ON_ONE', 'GOAL')).toBe(1);
  });

  it('tactical fouls only happen to targeted players, deterministically', () => {
    const none = { manMarked: false, doubledUp: false, tacticalFouls: false, attention: 0.1, label: '' };
    expect(tacticalFoulAt(none, 'm1', 0)).toBe(false);
    const targeted = { manMarked: true, doubledUp: false, tacticalFouls: true, attention: 0.8, label: '' };
    let fouls = 0;
    for (let i = 0; i < 100; i++) if (tacticalFoulAt(targeted, 'm1', i)) fouls++;
    expect(fouls).toBeGreaterThan(0);
    expect(fouls).toBeLessThan(45); // disruptive, not constant
    expect(tacticalFoulAt(targeted, 'm1', 3)).toBe(tacticalFoulAt(targeted, 'm1', 3));
  });

  it('produces a readable foul tick', () => {
    const t = tacticalFoulTick(player(), 34, 'm1', 2);
    expect(t.minute).toBe(34);
    expect(t.text).toContain('Hunter');
  });
});

describe('bogey teams', () => {
  it('becomes a bogey side after repeated quiet games, then breaks', () => {
    let c = career('KEY');
    for (let i = 0; i < 3; i++) c = updateBogeyTeams(c, player(), 'Chelsea', 6.0, 10 + i).career;
    expect(c.bogeyTeams!.Chelsea.isBogey).toBe(true);
    expect(bogeyFactor(c, 'Chelsea')).toBeLessThan(1);

    const broke = updateBogeyTeams(c, player(), 'Chelsea', 7.8, 50);
    expect(broke.career.bogeyTeams!.Chelsea.isBogey).toBe(false);
    expect(broke.news.some((n) => /hoodoo/i.test(n.title))).toBe(true);
    expect(bogeyFactor(broke.career, 'Chelsea')).toBe(1);
  });

  it('raises the story beat exactly once', () => {
    let c = career('KEY');
    let fired = 0;
    for (let i = 0; i < 6; i++) {
      const r = updateBogeyTeams(c, player(), 'Chelsea', 6.0, 10 + i);
      c = r.career;
      fired += r.news.filter((n) => /have your number/i.test(n.title)).length;
    }
    expect(fired).toBe(1);
  });

  it('a good game resets the count without a beat', () => {
    let c = career('KEY');
    c = updateBogeyTeams(c, player(), 'Arsenal', 6.0, 10).career;
    c = updateBogeyTeams(c, player(), 'Arsenal', 7.5, 20).career;
    expect(c.bogeyTeams!.Arsenal.poorGames).toBe(0);
    expect(bogeyFactor(c, 'Arsenal')).toBe(1);
  });

  it('an unseen opponent has no effect', () => {
    expect(bogeyFactor(career('KEY'), 'Nobody')).toBe(1);
  });
});
