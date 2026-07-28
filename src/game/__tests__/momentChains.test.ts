import { describe, it, expect } from 'vitest';
import {
  CHAINS, chainAfter, situationMoment, isSituation, SITUATION_TYPES,
  type SituationState,
} from '../momentChains';
import { MOMENT_DEFS } from '../momentLibrary';
import type { MomentType } from '../../types/interactiveMatch';

const state = (over: Partial<SituationState> = {}): SituationState =>
  ({ minute: 40, teamGoals: 0, oppGoals: 0, avatarGoals: 0, won: 3, lost: 2, booked: false, ...over });

/** The first index at which a chain/situation fires, across many positions. */
const firstChain = (from: MomentType, choice: string, success: boolean, depth = 0) => {
  for (let i = 0; i < 300; i++) {
    const r = chainAfter(from, choice, success, 50, 'm1', i, depth);
    if (r) return r;
  }
  return null;
};
const firstSituation = (s: SituationState, role: Parameters<typeof situationMoment>[1] = 'ST') => {
  for (let i = 0; i < 300; i++) {
    const r = situationMoment(s, role, 'm1', i);
    if (r) return r;
  }
  return null;
};

describe('the chain table itself', () => {
  it('only ever chains into moments the game actually knows how to play', () => {
    for (const r of CHAINS) {
      expect(MOMENT_DEFS[r.from], r.from).toBeDefined();
      expect(MOMENT_DEFS[r.to], r.to).toBeDefined();
      expect(MOMENT_DEFS[r.to].choices.length).toBeGreaterThan(1);
    }
  });

  it('explains every chain in words, and never fires every time', () => {
    for (const r of CHAINS) {
      expect(r.because.length).toBeGreaterThan(10);
      expect(r.chance).toBeGreaterThan(0);
      expect(r.chance).toBeLessThan(100);
    }
  });
});

describe('one decision leading to the next', () => {
  it('beats his man and puts the cross immediately on', () => {
    const r = firstChain('TAKE_ON', 'takeon', true)!;
    expect(r.type).toBe('CROSS_OR_CUT');
    expect(r.because).toMatch(/past him/i);
  });

  it('sends a successful nutmeg clean through', () => {
    expect(firstChain('TAKE_ON', 'nutmeg', true)!.type).toBe('ONE_ON_ONE');
  });

  it('makes a missed tackle into a recovery, not just a failure', () => {
    expect(firstChain('MIDFIELD_TACKLE', 'step', false)!.type).toBe('BLOCK_SHOT');
    expect(firstChain('SLIDE_TACKLE', 'slide', false)!.type).toBe('BLOCK_SHOT');
  });

  it('turns a won tackle into a break forward', () => {
    expect(firstChain('MIDFIELD_TACKLE', 'step', true)!.type).toBe('DRIVE_FORWARD');
  });

  it('lets a save start the counter, and a parry invite another shot', () => {
    expect(firstChain('SHOT_STOP', 'catch', true)!.type).toBe('GK_DISTRIBUTION');
    expect(firstChain('SHOT_STOP', 'catch', false)!.type).toBe('SHOT_STOP');
  });

  it('spills a missed one-on-one back to him', () => {
    expect(firstChain('ONE_ON_ONE', 'slot', false)!.type).toBe('FIRST_TIME_FINISH');
  });

  it('respects the choice a rule names — a dive doesn’t become a cross', () => {
    for (let i = 0; i < 300; i++) {
      expect(chainAfter('TAKE_ON', 'godown', true, 50, 'm1', i, 0)).toBeNull();
      expect(chainAfter('TAKE_ON', 'simple', true, 50, 'm1', i, 0)).toBeNull();
    }
  });

  it('never chains from a moment with nothing to follow', () => {
    for (let i = 0; i < 200; i++) {
      expect(chainAfter('RETENTION_PASS', 'safe', true, 50, 'm1', i, 0)).toBeNull();
      expect(chainAfter('PENALTY', 'placed', true, 50, 'm1', i, 0)).toBeNull();
    }
  });

  it('stops after two links so a match can’t run away with itself', () => {
    expect(firstChain('TAKE_ON', 'takeon', true, 0)).not.toBeNull();
    expect(firstChain('TAKE_ON', 'takeon', true, 1)).not.toBeNull();
    for (let i = 0; i < 300; i++) {
      expect(chainAfter('TAKE_ON', 'takeon', true, 50, 'm1', i, 2)).toBeNull();
      expect(chainAfter('TAKE_ON', 'takeon', true, 50, 'm1', i, 5)).toBeNull();
    }
  });

  it('never pushes a chained moment past full time', () => {
    const r = chainAfter('TAKE_ON', 'takeon', true, 96, 'm1',
      Array.from({ length: 300 }, (_, i) => i).find((i) => chainAfter('TAKE_ON', 'takeon', true, 96, 'm1', i, 0))!, 0)!;
    expect(r.minute).toBeLessThanOrEqual(90);
  });

  it('is deterministic in the match and the moment index', () => {
    for (let i = 0; i < 60; i++) {
      const a = chainAfter('TAKE_ON', 'takeon', true, 50, 'match_a', i, 0);
      const b = chainAfter('TAKE_ON', 'takeon', true, 50, 'match_a', i, 0);
      expect(a).toEqual(b);
    }
    // A different match is a different game.
    const inA = Array.from({ length: 60 }, (_, i) => !!chainAfter('TAKE_ON', 'takeon', true, 50, 'A', i, 0));
    const inB = Array.from({ length: 60 }, (_, i) => !!chainAfter('TAKE_ON', 'takeon', true, 50, 'B', i, 0));
    expect(inA).not.toEqual(inB);
  });
});

describe('moments the scoreline creates', () => {
  it('produces nothing at all in an ordinary passage of play', () => {
    for (let i = 0; i < 300; i++) {
      expect(situationMoment(state(), 'ST', 'm1', i)).toBeNull();
    }
  });

  it('offers the last corner only when a goal down, and late', () => {
    expect(firstSituation(state({ minute: 88, teamGoals: 0, oppGoals: 1 }))!.type).toBe('LATE_CORNER');
    // Two down, or level, or early: no.
    expect(firstSituation(state({ minute: 88, teamGoals: 0, oppGoals: 2 }))).toBeNull();
    expect(firstSituation(state({ minute: 88, teamGoals: 1, oppGoals: 1 }))).toBeNull();
    expect(firstSituation(state({ minute: 60, teamGoals: 0, oppGoals: 1 }))).toBeNull();
  });

  it('asks a keeper to go up for it too, in his own words', () => {
    const gk = firstSituation(state({ minute: 90, teamGoals: 1, oppGoals: 2 }), 'GK')!;
    expect(gk.type).toBe('LATE_CORNER');
    expect(gk.because).toMatch(/looking at you/i);
  });

  it('asks him to see out a one-goal lead, late', () => {
    expect(firstSituation(state({ minute: 80, teamGoals: 2, oppGoals: 1 }))!.type).toBe('GAME_MANAGEMENT');
    // Three up is not a game that needs managing.
    expect(firstSituation(state({ minute: 80, teamGoals: 3, oppGoals: 0 }))).toBeNull();
  });

  it('puts the hat-trick ball in front of him only on two goals', () => {
    expect(firstSituation(state({ minute: 70, avatarGoals: 2 }))!.type).toBe('HAT_TRICK_BALL');
    expect(firstSituation(state({ minute: 70, avatarGoals: 1 }))).toBeNull();
    // A keeper is not chasing a hat-trick.
    expect(firstSituation(state({ minute: 70, avatarGoals: 2 }), 'GK')).toBeNull();
  });

  it('lets him argue with the referee, but only once booked', () => {
    expect(firstSituation(state({ booked: true }))!.type).toBe('REF_DECISION');
    expect(firstSituation(state({ booked: false }))).toBeNull();
  });

  it('calls out an hour of anonymity — and only an hour of anonymity', () => {
    expect(firstSituation(state({ minute: 65, won: 0, lost: 1 }))!.type).toBe('DEMAND_THE_BALL');
    // Busy in the game? Nothing to say.
    expect(firstSituation(state({ minute: 65, won: 4, lost: 3 }))).toBeNull();
    // Too early, or too late to matter.
    expect(firstSituation(state({ minute: 30, won: 0, lost: 0 }))).toBeNull();
    expect(firstSituation(state({ minute: 85, won: 0, lost: 0 }))).toBeNull();
  });

  it('explains itself every time it fires', () => {
    const cases: SituationState[] = [
      state({ minute: 88, teamGoals: 0, oppGoals: 1 }),
      state({ minute: 80, teamGoals: 2, oppGoals: 1 }),
      state({ minute: 70, avatarGoals: 2 }),
      state({ booked: true }),
      state({ minute: 65, won: 0, lost: 0 }),
    ];
    for (const c of cases) {
      const r = firstSituation(c)!;
      expect(r).not.toBeNull();
      expect(r.because.length).toBeGreaterThan(15);
      expect(isSituation(r.type)).toBe(true);
    }
  });

  it('is deterministic for the same state and index', () => {
    const s = state({ minute: 88, teamGoals: 0, oppGoals: 1 });
    for (let i = 0; i < 60; i++) {
      expect(situationMoment(s, 'ST', 'm1', i)).toEqual(situationMoment(s, 'ST', 'm1', i));
    }
  });
});

describe('the situational types', () => {
  it('are all playable and all flagged', () => {
    for (const t of SITUATION_TYPES) {
      expect(MOMENT_DEFS[t], t).toBeDefined();
      expect(MOMENT_DEFS[t].choices.length).toBeGreaterThanOrEqual(2);
      expect(isSituation(t)).toBe(true);
    }
    expect(SITUATION_TYPES.size).toBe(5);
  });

  it('are never in a role’s ordinary pool — they have to be earned', async () => {
    const { ROLE_MOMENTS } = await import('../momentLibrary');
    for (const pool of Object.values(ROLE_MOMENTS)) {
      for (const m of pool) expect(isSituation(m.type)).toBe(false);
    }
  });

  it('always give him a way out as well as a way in', () => {
    // Every situation offers at least one safe option — none is a trap.
    for (const t of SITUATION_TYPES) {
      expect(MOMENT_DEFS[t].choices.some((c) => c.risk === 'SAFE')).toBe(true);
    }
  });
});
