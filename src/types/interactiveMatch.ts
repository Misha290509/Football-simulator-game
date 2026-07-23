// ---------------------------------------------------------------------------
// Player Career — interactive key-moments match layer (Tier 3). Types for the
// resumable, decision-driven simulation of the avatar's own match. The match is
// a pure function of (seed, decisionLog): re-running from the start applying the
// logged decisions reproduces it exactly, and pauses at the first undecided
// moment. Only the avatar's fixture uses this; every other match batch-sims.
// ---------------------------------------------------------------------------

import type { Position } from './attributes';
import type { Match } from './match';

export type MomentType =
  | 'ONE_ON_ONE' | 'FIRST_TIME_FINISH' | 'HEADER' | 'SHOOT_OR_SQUARE' | 'RUN_IN_BEHIND'
  | 'PENALTY' | 'TAKE_ON' | 'CROSS_OR_CUT' | 'THROUGH_BALL' | 'LONG_SHOT'
  | 'RETENTION_PASS' | 'DRIVE_FORWARD' | 'MIDFIELD_TACKLE' | 'SWITCH_PLAY'
  | 'SLIDE_TACKLE' | 'AERIAL_DUEL' | 'CLEAR_OR_PLAY_OUT' | 'BLOCK_SHOT' | 'OFFSIDE_TRAP'
  | 'SHOT_STOP' | 'GK_ONE_ON_ONE' | 'CLAIM_CROSS' | 'SWEEPER' | 'GK_DISTRIBUTION' | 'PENALTY_SAVE'
  | 'FREE_KICK';

export type MomentRisk = 'SAFE' | 'BALANCED' | 'AMBITIOUS';

export interface MomentChoice {
  id: string;
  label: string;
  risk: MomentRisk;
  /** Attribute keys (dot paths into Attributes) that resolve this choice. */
  attributes: string[];
  /** Base success probability before attributes/context (0–1). */
  baseSuccess: number;
  /** What a success is worth: the primary stat effect. */
  reward: MomentReward;
}

export type MomentReward =
  | 'GOAL' | 'ASSIST' | 'SHOT_ON' | 'KEY_PASS' | 'RETAIN' | 'TACKLE_WON'
  | 'SAVE' | 'CLEAN_CLEARANCE' | 'DUEL_WON' | 'NOTHING';

export interface MomentContext {
  score: [number, number]; // [avatarTeam, opponent]
  importance: number; // 0–1 (cup/derby/run-in raise it)
  pressure: number; // 0–1
  fatigue: number; // 0–1 (rises late / low fitness)
  confidence: number; // 0–100 (Tier 2)
}

export interface KeyMoment {
  id: string;
  matchId: string;
  index: number; // 0-based order within the match (aligns with decisionLog)
  minute: number;
  type: MomentType;
  position: Position;
  prompt: string;
  choices: MomentChoice[];
  /** Choice ids that align with the manager's game plan. */
  gamePlanAligned: string[];
  context: MomentContext;
}

export interface MomentDecision {
  momentId: string;
  choiceId: string;
  autoResolved: boolean;
  followedGamePlan: boolean;
  success: boolean;
  effect: string; // short human summary
}

export type GamePlan = 'ATTACK' | 'SUPPORT' | 'BALANCED' | 'CONTAIN' | 'POSSESSION';

export interface InteractiveMatchRecord {
  matchId: string;
  seed: number;
  decisionLog: MomentDecision[];
  gamePlan: GamePlan;
  gamePlanAdherence: number; // 0–1 → Tier 2 trust
  momentCount: number;
  /** Lifetime-stat contributions from this match (folded into MomentStats). */
  tally: { bigWon: number; bigLost: number; penScored: number; penMissed: number; penSaved: number; decisive: number };
  /** A standout line for the career timeline, if the match produced one. */
  standout?: string;
}

/** A step of the resumable sim: either a decision is needed, or the match is done. */
export type InteractiveStep =
  | { kind: 'DECISION'; moment: KeyMoment; ticker: MatchTick[] }
  | { kind: 'DONE'; match: Match; record: InteractiveMatchRecord; ticker: MatchTick[] };

/** A compressed live-feed line shown between moments. */
export interface MatchTick { minute: number; text: string; kind: 'GOAL' | 'CHANCE' | 'INFO' }

/** Career-level settings for the interactive layer. */
export interface CareerSettings {
  interactive: boolean; // master on/off
  timed: boolean; // countdown on moments
  timerSeconds: number; // adjustable
  momentFrequency: 'LOW' | 'NORMAL' | 'HIGH';
}

export const DEFAULT_CAREER_SETTINGS: CareerSettings = {
  interactive: true, timed: false, timerSeconds: 15, momentFrequency: 'NORMAL',
};

/** Lifetime interactive-moment stats on the player career. */
export interface MomentStats {
  bigMomentsWon: number;
  bigMomentsLost: number;
  penaltiesScored: number;
  penaltiesMissed: number;
  penaltiesSaved: number;
  decisiveContributions: number; // goals/assists/saves in the last 15'
}

export const EMPTY_MOMENT_STATS: MomentStats = {
  bigMomentsWon: 0, bigMomentsLost: 0, penaltiesScored: 0, penaltiesMissed: 0, penaltiesSaved: 0, decisiveContributions: 0,
};
