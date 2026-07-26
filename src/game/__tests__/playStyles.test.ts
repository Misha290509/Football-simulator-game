import { describe, it, expect } from 'vitest';
import { playStylesOf, playStyleFactor } from '../playStyles';
import type { Player } from '../../types/player';

function player(attrs: Partial<Record<string, Partial<Record<string, number>>>>): Player {
  return {
    id: 'a', name: { first: 'A', last: 'B' }, position: 'ST', positions: ['ST'],
    attributes: {
      technical: { finishing: 50, shortPassing: 50, longPassing: 50, dribbling: 50, crossing: 50, headingAccuracy: 50, longShots: 50, fkAccuracy: 50, curve: 50, penalties: 50, shotPower: 50, ...(attrs.technical ?? {}) },
      mental: { vision: 50, composure: 50, positioning: 50, reactions: 50, aggression: 50, marking: 50, interceptions: 50, standingTackle: 50, slidingTackle: 50, ...(attrs.mental ?? {}) },
      physical: { pace: 50, sprintSpeed: 50, acceleration: 50, stamina: 50, strength: 50, jumping: 50, agility: 50, ...(attrs.physical ?? {}) },
      goalkeeping: { gkDiving: 50, gkHandling: 50, gkKicking: 50, gkPositioning: 50, gkReflexes: 50, ...(attrs.goalkeeping ?? {}) },
    },
  } as unknown as Player;
}

describe('playStylesOf', () => {
  it('grants Finesse to a curler and Poacher to a sharp positional finisher', () => {
    expect(playStylesOf(player({ technical: { curve: 84, finishing: 82 } }))).toContain('FINESSE');
    expect(playStylesOf(player({ mental: { positioning: 85 }, technical: { finishing: 83 } }))).toContain('POACHER');
  });

  it('grants nothing to a blank-slate 50-everything player', () => {
    expect(playStylesOf(player({}))).toHaveLength(0);
  });
});

describe('playStyleFactor', () => {
  it('boosts the moments a style suits, and leaves others alone', () => {
    // Finesse lifts a long-shot goal, but not a header.
    expect(playStyleFactor(['FINESSE'], 'LONG_SHOT', 'GOAL')).toBeGreaterThan(1);
    expect(playStyleFactor(['FINESSE'], 'HEADER', 'GOAL')).toBe(1);
    // Dead-Ball lifts free-kicks and penalties.
    expect(playStyleFactor(['DEAD_BALL'], 'FREE_KICK', 'GOAL')).toBeGreaterThan(1);
    // No styles → neutral.
    expect(playStyleFactor([], 'ONE_ON_ONE', 'GOAL')).toBe(1);
  });

  it('is modest — a single style never more than ~15%', () => {
    expect(playStyleFactor(['POWER_HEADER'], 'HEADER', 'GOAL')).toBeLessThanOrEqual(1.15 + 1e-9);
  });
});
