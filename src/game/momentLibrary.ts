// ---------------------------------------------------------------------------
// Player Career — key-moment libraries (Tier 3). Tunable data, keyed by the
// avatar's on-pitch role. Each moment type offers 2–3 position-appropriate
// choices with a risk/reward profile and the attributes that resolve them. A
// GK's library shares nothing with a striker's.
// ---------------------------------------------------------------------------

import type { Position } from '../types/attributes';
import type { MomentType, MomentChoice, GamePlan } from '../types/interactiveMatch';

export type MomentRole = 'GK' | 'CB' | 'FB' | 'CM' | 'WIDE' | 'ST';

export function momentRole(position: Position): MomentRole {
  switch (position) {
    case 'GK': return 'GK';
    case 'LCB': case 'RCB': return 'CB';
    case 'LB': case 'RB': return 'FB';
    case 'CDM': case 'CM': return 'CM';
    case 'ST': return 'ST';
    default: return 'WIDE'; // CAM/LM/RM/LW/RW
  }
}

/** Whether a role primarily defends (drives defensive moment + save logic). */
export const isDefensiveRole = (r: MomentRole) => r === 'GK' || r === 'CB' || r === 'FB';

/** Moment types available to each role, with relative spawn weights. */
export const ROLE_MOMENTS: Record<MomentRole, { type: MomentType; weight: number }[]> = {
  ST: [
    { type: 'ONE_ON_ONE', weight: 3 }, { type: 'FIRST_TIME_FINISH', weight: 3 }, { type: 'HEADER', weight: 2 },
    { type: 'SHOOT_OR_SQUARE', weight: 2 }, { type: 'RUN_IN_BEHIND', weight: 2 }, { type: 'LONG_SHOT', weight: 1 },
  ],
  WIDE: [
    { type: 'TAKE_ON', weight: 3 }, { type: 'CROSS_OR_CUT', weight: 3 }, { type: 'THROUGH_BALL', weight: 2 },
    { type: 'LONG_SHOT', weight: 2 }, { type: 'FIRST_TIME_FINISH', weight: 1 }, { type: 'MIDFIELD_TACKLE', weight: 1 },
  ],
  CM: [
    { type: 'RETENTION_PASS', weight: 3 }, { type: 'DRIVE_FORWARD', weight: 2 }, { type: 'THROUGH_BALL', weight: 2 },
    { type: 'MIDFIELD_TACKLE', weight: 2 }, { type: 'SWITCH_PLAY', weight: 2 }, { type: 'LONG_SHOT', weight: 1 },
  ],
  FB: [
    { type: 'SLIDE_TACKLE', weight: 3 }, { type: 'AERIAL_DUEL', weight: 1 }, { type: 'CROSS_OR_CUT', weight: 2 },
    { type: 'CLEAR_OR_PLAY_OUT', weight: 2 }, { type: 'OFFSIDE_TRAP', weight: 1 },
  ],
  CB: [
    { type: 'SLIDE_TACKLE', weight: 2 }, { type: 'AERIAL_DUEL', weight: 3 }, { type: 'BLOCK_SHOT', weight: 2 },
    { type: 'CLEAR_OR_PLAY_OUT', weight: 2 }, { type: 'OFFSIDE_TRAP', weight: 2 },
  ],
  GK: [
    { type: 'SHOT_STOP', weight: 3 }, { type: 'GK_ONE_ON_ONE', weight: 2 }, { type: 'CLAIM_CROSS', weight: 2 },
    { type: 'SWEEPER', weight: 1 }, { type: 'GK_DISTRIBUTION', weight: 1 },
  ],
};

const C = (id: string, label: string, risk: MomentChoice['risk'], baseSuccess: number, reward: MomentChoice['reward'], attributes: string[]): MomentChoice =>
  ({ id, label, risk, baseSuccess, reward, attributes });

/** Prompt + choices for each moment type. Success probabilities are the base
 *  before the resolution model scales them by attributes/traits/context. */
export const MOMENT_DEFS: Record<MomentType, { prompt: string; choices: MomentChoice[] }> = {
  ONE_ON_ONE: { prompt: 'Clean through, one-on-one with the keeper.', choices: [
    C('slot', 'Slot it low into the corner', 'SAFE', 0.44, 'GOAL', ['finishing', 'composure']),
    C('dink', 'Dink it over the keeper', 'AMBITIOUS', 0.30, 'GOAL', ['composure', 'finishing']),
    C('round', 'Round the keeper', 'AMBITIOUS', 0.28, 'GOAL', ['dribbling', 'composure']),
  ] },
  FIRST_TIME_FINISH: { prompt: 'The ball drops in the box — a half-chance.', choices: [
    C('first', 'Hit it first time', 'AMBITIOUS', 0.30, 'GOAL', ['finishing', 'reactions']),
    C('touch', 'Take a touch and steady yourself', 'BALANCED', 0.34, 'GOAL', ['composure', 'finishing']),
  ] },
  HEADER: { prompt: 'A cross swings in toward your head.', choices: [
    C('power', 'Power it goalwards', 'AMBITIOUS', 0.22, 'GOAL', ['headingAccuracy', 'jumping']),
    C('glance', 'Glance it into the corner', 'BALANCED', 0.25, 'GOAL', ['headingAccuracy', 'composure']),
  ] },
  SHOOT_OR_SQUARE: { prompt: 'You’re in the box with a teammate free.', choices: [
    C('shoot', 'Back yourself and shoot', 'AMBITIOUS', 0.28, 'GOAL', ['finishing', 'composure']),
    C('square', 'Square it for the tap-in', 'SAFE', 0.58, 'ASSIST', ['vision', 'shortPassing']),
  ] },
  RUN_IN_BEHIND: { prompt: 'The pass is on — do you gamble on the run?', choices: [
    C('gamble', 'Gamble on the run behind', 'AMBITIOUS', 0.40, 'SHOT_ON', ['sprintSpeed', 'positioning']),
    C('hold', 'Stay onside and hold', 'SAFE', 0.75, 'RETAIN', ['positioning']),
  ] },
  PENALTY: { prompt: 'You step up to take the penalty.', choices: [
    C('placed', 'Side-foot it into the corner', 'BALANCED', 0.80, 'GOAL', ['penalties', 'composure']),
    C('blast', 'Blast it down the middle', 'AMBITIOUS', 0.74, 'GOAL', ['penalties', 'shotPower']),
  ] },
  TAKE_ON: { prompt: 'The fullback stands you up out wide.', choices: [
    C('takeon', 'Take him on', 'AMBITIOUS', 0.42, 'KEY_PASS', ['dribbling', 'agility']),
    C('simple', 'Pass it simple and recycle', 'SAFE', 0.88, 'RETAIN', ['shortPassing']),
  ] },
  CROSS_OR_CUT: { prompt: 'You reach the byline with options.', choices: [
    C('cross', 'Whip an early cross in', 'BALANCED', 0.40, 'ASSIST', ['crossing', 'vision']),
    C('cut', 'Cut inside and shoot', 'AMBITIOUS', 0.28, 'GOAL', ['finishing', 'dribbling']),
  ] },
  THROUGH_BALL: { prompt: 'A runner peels off the shoulder — is the ball on?', choices: [
    C('thread', 'Thread it through', 'AMBITIOUS', 0.42, 'ASSIST', ['vision', 'longPassing']),
    C('safe', 'Keep it simple', 'SAFE', 0.88, 'RETAIN', ['shortPassing']),
  ] },
  LONG_SHOT: { prompt: 'Space opens up 25 yards out.', choices: [
    C('shoot', 'Let fly from distance', 'AMBITIOUS', 0.15, 'GOAL', ['longShots', 'shotPower']),
    C('work', 'Work it closer', 'SAFE', 0.85, 'RETAIN', ['shortPassing']),
  ] },
  RETENTION_PASS: { prompt: 'You receive under light pressure in midfield.', choices: [
    C('break', 'Play the line-breaking pass', 'AMBITIOUS', 0.52, 'KEY_PASS', ['vision', 'longPassing']),
    C('keep', 'Keep it simple', 'SAFE', 0.93, 'RETAIN', ['shortPassing']),
  ] },
  DRIVE_FORWARD: { prompt: 'Space ahead of you to carry into.', choices: [
    C('drive', 'Drive forward with it', 'BALANCED', 0.52, 'KEY_PASS', ['dribbling', 'stamina']),
    C('shape', 'Hold your shape', 'SAFE', 0.90, 'RETAIN', ['positioning']),
  ] },
  MIDFIELD_TACKLE: { prompt: 'Their playmaker is turning in midfield.', choices: [
    C('step', 'Step in and win it', 'AMBITIOUS', 0.50, 'TACKLE_WON', ['standingTackle', 'aggression']),
    C('jockey', 'Jockey and delay', 'SAFE', 0.72, 'DUEL_WON', ['positioning', 'marking']),
  ] },
  SWITCH_PLAY: { prompt: 'The far side is wide open.', choices: [
    C('switch', 'Switch the play', 'BALANCED', 0.56, 'KEY_PASS', ['longPassing', 'vision']),
    C('recycle', 'Recycle possession', 'SAFE', 0.92, 'RETAIN', ['shortPassing']),
  ] },
  SLIDE_TACKLE: { prompt: 'The winger knocks it past you — last man-ish.', choices: [
    C('slide', 'Slide in to win it', 'AMBITIOUS', 0.46, 'TACKLE_WON', ['slidingTackle']),
    C('standup', 'Stand up and shepherd', 'SAFE', 0.68, 'DUEL_WON', ['standingTackle', 'positioning']),
  ] },
  AERIAL_DUEL: { prompt: 'A high ball into your zone.', choices: [
    C('attack', 'Attack the ball', 'BALANCED', 0.50, 'DUEL_WON', ['jumping', 'headingAccuracy', 'strength']),
    C('drop', 'Drop off and cover', 'SAFE', 0.72, 'CLEAN_CLEARANCE', ['positioning', 'marking']),
  ] },
  CLEAR_OR_PLAY_OUT: { prompt: 'You win it deep under pressure.', choices: [
    C('clear', 'Clear the danger', 'SAFE', 0.90, 'CLEAN_CLEARANCE', ['strength']),
    C('playout', 'Play out from the back', 'AMBITIOUS', 0.56, 'RETAIN', ['shortPassing', 'composure']),
  ] },
  BLOCK_SHOT: { prompt: 'A shot is coming in — throw yourself at it?', choices: [
    C('block', 'Throw yourself in front', 'BALANCED', 0.56, 'CLEAN_CLEARANCE', ['positioning', 'jumping']),
    C('close', 'Close him down', 'SAFE', 0.62, 'DUEL_WON', ['standingTackle']),
  ] },
  OFFSIDE_TRAP: { prompt: 'Do you step up for the offside trap?', choices: [
    C('step', 'Step up as a line', 'AMBITIOUS', 0.50, 'CLEAN_CLEARANCE', ['positioning', 'interceptions']),
    C('drop', 'Drop and mark', 'SAFE', 0.70, 'DUEL_WON', ['marking']),
  ] },
  SHOT_STOP: { prompt: 'A shot fizzes toward your goal.', choices: [
    C('dive', 'Dive full stretch', 'BALANCED', 0.46, 'SAVE', ['gkDiving', 'gkReflexes']),
    C('big', 'Stay big and block', 'SAFE', 0.42, 'SAVE', ['gkPositioning', 'gkReflexes']),
  ] },
  GK_ONE_ON_ONE: { prompt: 'A striker bears down on you one-on-one.', choices: [
    C('rush', 'Rush out and smother', 'AMBITIOUS', 0.46, 'SAVE', ['gkPositioning', 'gkReflexes']),
    C('big', 'Stay big and wait', 'BALANCED', 0.42, 'SAVE', ['gkReflexes', 'gkDiving']),
  ] },
  CLAIM_CROSS: { prompt: 'A dangerous cross into your box.', choices: [
    C('claim', 'Come and claim it', 'BALANCED', 0.60, 'CLEAN_CLEARANCE', ['gkHandling', 'gkPositioning']),
    C('punch', 'Punch it clear', 'SAFE', 0.70, 'CLEAN_CLEARANCE', ['gkHandling']),
  ] },
  SWEEPER: { prompt: 'A ball in behind your defence.', choices: [
    C('sweep', 'Sweep out and clear', 'AMBITIOUS', 0.56, 'CLEAN_CLEARANCE', ['gkPositioning', 'gkKicking']),
    C('stay', 'Stay back on your line', 'SAFE', 0.66, 'SAVE', ['gkReflexes']),
  ] },
  GK_DISTRIBUTION: { prompt: 'You gather it — how do you start the attack?', choices: [
    C('short', 'Short build-up', 'SAFE', 0.92, 'RETAIN', ['gkKicking', 'shortPassing']),
    C('long', 'Launch it long', 'AMBITIOUS', 0.50, 'KEY_PASS', ['gkKicking']),
  ] },
  PENALTY_SAVE: { prompt: 'A penalty against you — you have to guess.', choices: [
    C('guess', 'Commit to a corner', 'AMBITIOUS', 0.28, 'SAVE', ['gkDiving']),
    C('read', 'Read it and react', 'BALANCED', 0.22, 'SAVE', ['gkReflexes', 'gkPositioning']),
  ] },
  FREE_KICK: { prompt: 'A free-kick in a dangerous area — you’re the taker.', choices: [
    C('shoot', 'Shoot for goal', 'AMBITIOUS', 0.13, 'GOAL', ['fkAccuracy', 'curve']),
    C('cross', 'Whip it into the box', 'BALANCED', 0.40, 'ASSIST', ['crossing', 'fkAccuracy']),
  ] },
};

/** The manager's preferred risk + rewards per game plan, for adherence. */
const PLAN_PREF: Record<GamePlan, { risk: MomentChoice['risk'][]; reward: MomentChoice['reward'][] }> = {
  ATTACK: { risk: ['AMBITIOUS', 'BALANCED'], reward: ['GOAL', 'SHOT_ON'] },
  SUPPORT: { risk: ['BALANCED', 'SAFE'], reward: ['ASSIST', 'KEY_PASS'] },
  BALANCED: { risk: ['BALANCED'], reward: ['GOAL', 'ASSIST', 'KEY_PASS', 'DUEL_WON'] },
  CONTAIN: { risk: ['SAFE'], reward: ['CLEAN_CLEARANCE', 'TACKLE_WON', 'DUEL_WON', 'SAVE', 'RETAIN'] },
  POSSESSION: { risk: ['SAFE', 'BALANCED'], reward: ['RETAIN', 'KEY_PASS', 'ASSIST'] },
};

/** Choice ids on a moment that align with the manager's game plan. */
export function gamePlanAlignedChoices(type: MomentType, plan: GamePlan): string[] {
  const pref = PLAN_PREF[plan];
  return MOMENT_DEFS[type].choices
    .filter((c) => pref.risk.includes(c.risk) || pref.reward.includes(c.reward))
    .map((c) => c.id);
}

/** A sensible auto-resolve default: the plan-aligned choice, else the safest. */
export function defaultChoiceId(type: MomentType, plan: GamePlan): string {
  const aligned = gamePlanAlignedChoices(type, plan);
  if (aligned.length) return aligned[0];
  const choices = MOMENT_DEFS[type].choices;
  return (choices.find((c) => c.risk === 'SAFE') ?? choices[0]).id;
}
