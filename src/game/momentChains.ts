// ---------------------------------------------------------------------------
// Player Career — chained and situational moments (§ Why every match felt alike).
//
// The match engine drew a fixed handful of moment types from a six-entry pool
// per role, every game, for a whole career. Nothing ever followed from anything
// else, and the state of the game only ever moved hidden multipliers — it never
// changed what you were actually *asked*.
//
// Two additions fix that:
//
//   • CHAINS — a decision can create the next moment. Beat your man and the
//     cross is on immediately. Win it in midfield and you're away. Dive in and
//     miss, and now you're chasing back to block the shot. Sequences are what
//     make a match feel like a match instead of a quiz.
//
//   • SITUATIONS — moments that only exist under specific circumstances, and so
//     are rare by design: the 88th-minute corner when you're a goal down, the
//     lead you're asked to see out, the hat-trick ball when a team-mate is
//     better placed, the referee who has just booked you, and the sixty minutes
//     in which nobody has passed to you.
//
// Everything here is a pure function of state already determined at that point
// in the replay, hash-seeded off stable ids. The engine's RNG stream is never
// touched, so (seed, decisionLog) still reproduces a match exactly.
// ---------------------------------------------------------------------------

import type { MomentType } from '../types/interactiveMatch';
import { hashSeed } from '../engine/rng';
import type { MomentRole } from './momentLibrary';

/** A moment the engine should insert immediately after the current one. */
export interface InsertedMoment {
  type: MomentType;
  minute: number;
  /** A line explaining why this moment exists, shown above the prompt. */
  because: string;
}

// --- Chains -------------------------------------------------------------------

interface ChainRule {
  from: MomentType;
  /** Which choice triggers it; omitted = any choice. */
  choice?: string;
  /** Does it need the previous moment to have come off? */
  onSuccess: boolean;
  to: MomentType;
  because: string;
  /** How often it fires when it applies (0–100). Not everything leads somewhere. */
  chance: number;
}

/**
 * What can follow what. Deliberately short and legible — a chain should feel
 * like a consequence, not a slot machine.
 */
export const CHAINS: ChainRule[] = [
  // Attacking: beat your man and the next decision is on you immediately.
  { from: 'TAKE_ON', choice: 'takeon', onSuccess: true, to: 'CROSS_OR_CUT', chance: 75,
    because: 'You’ve gone past him and the byline is open.' },
  { from: 'TAKE_ON', choice: 'nutmeg', onSuccess: true, to: 'ONE_ON_ONE', chance: 70,
    because: 'You’ve burst clear and there’s only the keeper.' },
  // A save or a block spills, and somebody has to react first.
  { from: 'ONE_ON_ONE', onSuccess: false, to: 'FIRST_TIME_FINISH', chance: 35,
    because: 'It’s come straight back off the keeper.' },
  { from: 'LONG_SHOT', onSuccess: false, to: 'FIRST_TIME_FINISH', chance: 25,
    because: 'Parried, and it’s dropped in the six-yard box.' },
  // Midfield: win it high and the game breaks open.
  { from: 'MIDFIELD_TACKLE', choice: 'step', onSuccess: true, to: 'DRIVE_FORWARD', chance: 70,
    because: 'You’ve nicked it and their midfield is out of position.' },
  { from: 'MIDFIELD_TACKLE', choice: 'step', onSuccess: false, to: 'BLOCK_SHOT', chance: 55,
    because: 'You dived in and missed. Now get back.' },
  { from: 'SLIDE_TACKLE', choice: 'slide', onSuccess: false, to: 'BLOCK_SHOT', chance: 60,
    because: 'You’re on the floor and he’s gone past you. Recover.' },
  // Defending: win the header, then decide what to do with it.
  { from: 'AERIAL_DUEL', onSuccess: true, to: 'CLEAR_OR_PLAY_OUT', chance: 55,
    because: 'You’ve won the header and it’s dropped at your feet.' },
  { from: 'BLOCK_SHOT', onSuccess: true, to: 'CLEAR_OR_PLAY_OUT', chance: 45,
    because: 'Blocked — but it’s still live in your own box.' },
  // Keeper: the save is only half of it.
  { from: 'SHOT_STOP', onSuccess: true, to: 'GK_DISTRIBUTION', chance: 50,
    because: 'You’ve held it. They’ve committed men forward.' },
  { from: 'CLAIM_CROSS', onSuccess: true, to: 'GK_DISTRIBUTION', chance: 55,
    because: 'Claimed cleanly, and there’s space to break into.' },
  { from: 'SHOT_STOP', onSuccess: false, to: 'SHOT_STOP', chance: 30,
    because: 'You could only push it out, and they’re shooting again.' },
  // Creating: thread it and you might get it back.
  { from: 'THROUGH_BALL', choice: 'thread', onSuccess: true, to: 'FIRST_TIME_FINISH', chance: 30,
    because: 'He’s squared it straight back to you.' },
];

/**
 * Does this decision lead somewhere? Deterministic in the match id and the
 * moment's position, so a replay produces the identical sequence.
 */
export function chainAfter(
  from: MomentType, choiceId: string, success: boolean, minute: number,
  matchId: string, index: number, depth: number,
): InsertedMoment | null {
  // A chain can chain once more, but never runs away with the match.
  if (depth >= 2) return null;
  const rules = CHAINS.filter((r) =>
    r.from === from && r.onSuccess === success && (r.choice == null || r.choice === choiceId));
  if (rules.length === 0) return null;
  // Deterministic pick when several rules apply.
  const rule = rules[hashSeed(`chainpick_${matchId}_${index}`) % rules.length];
  if ((hashSeed(`chain_${matchId}_${index}_${rule.to}`) % 100) >= rule.chance) return null;
  return { type: rule.to, minute: Math.min(90, minute), because: rule.because };
}

// --- Situations ------------------------------------------------------------------

/** The state a situational moment is judged against. */
export interface SituationState {
  minute: number;
  teamGoals: number;
  oppGoals: number;
  avatarGoals: number;
  /** Key moments he has won and lost so far — a read on whether he's in the game. */
  won: number;
  lost: number;
  booked: boolean;
}

/**
 * Moments that only exist under specific circumstances. Each is gated hard, so
 * they stay rare — which is exactly why they land when they do.
 */
export function situationMoment(
  state: SituationState, role: MomentRole, matchId: string, index: number,
): InsertedMoment | null {
  const { minute, teamGoals, oppGoals, avatarGoals } = state;
  const diff = teamGoals - oppGoals;
  const roll = (tag: string) => hashSeed(`sit_${matchId}_${index}_${tag}`) % 100;

  // The referee has just booked him, and he has an opinion about it.
  if (state.booked && roll('ref') < 40) {
    return { type: 'REF_DECISION', minute, because: 'The referee has just booked you, and you don’t agree.' };
  }

  // A goal down, the clock is gone, and there's a corner. Keepers included.
  if (minute >= 85 && diff === -1 && roll('corner') < 55) {
    return {
      type: 'LATE_CORNER', minute,
      because: role === 'GK'
        ? 'Last corner of the match, a goal down. The whole ground is looking at you.'
        : 'Deep into stoppage time, a goal down, and the corner is swinging in.',
    };
  }

  // One up, late, and somebody has to be sensible.
  if (minute >= 75 && diff === 1 && roll('manage') < 40) {
    return { type: 'GAME_MANAGEMENT', minute, because: 'One goal in it, and the game needs seeing out.' };
  }

  // Two goals to his name and a third on. Everybody knows.
  if (avatarGoals === 2 && minute >= 60 && role !== 'GK' && roll('hattrick') < 65) {
    return { type: 'HAT_TRICK_BALL', minute, because: 'You’re on two. A team-mate is better placed. Everybody in the ground knows it.' };
  }

  // An hour gone and he has been anonymous.
  if (minute >= 55 && minute <= 75 && state.won + state.lost <= 1 && role !== 'GK' && roll('demand') < 45) {
    return { type: 'DEMAND_THE_BALL', minute, because: 'An hour gone and you have barely touched it.' };
  }

  return null;
}

/** Situational moments are one-per-match — they lose their weight otherwise. */
export const SITUATION_TYPES = new Set<MomentType>([
  'REF_DECISION', 'LATE_CORNER', 'GAME_MANAGEMENT', 'HAT_TRICK_BALL', 'DEMAND_THE_BALL',
]);

export function isSituation(t: MomentType): boolean { return SITUATION_TYPES.has(t); }
