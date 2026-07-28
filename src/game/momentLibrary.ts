// ---------------------------------------------------------------------------
// Player Career — key-moment libraries (Tier 3). Tunable data, keyed by the
// avatar's on-pitch role. Each moment type offers 2–3 position-appropriate
// choices with a risk/reward profile and the attributes that resolve them. A
// GK's library shares nothing with a striker's.
// ---------------------------------------------------------------------------

import type { Position } from '../types/attributes';
import type { MomentType, MomentChoice, GamePlan, PositioningIntent, PositioningOption } from '../types/interactiveMatch';

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

// --- Off-the-ball positioning (Tier 3, off-the-ball phases) ------------------

/** The positioning options offered to each on-pitch role before kickoff. */
export const ROLE_POSITIONING: Record<MomentRole, PositioningOption[]> = {
  ST: [
    { id: 'IN_BEHIND', label: 'Run in behind', blurb: 'Gamble on the shoulder — more one-on-ones, higher variance.' },
    { id: 'SHOW_FOR_IT', label: 'Come short', blurb: 'Drop in and link play — more chances to create, fewer to finish.' },
    { id: 'BETWEEN_LINES', label: 'Play the pocket', blurb: 'Find space between the lines — a mix of shots and key passes.' },
  ],
  WIDE: [
    { id: 'STAY_WIDE', label: 'Hug the touchline', blurb: 'Stretch the play — more take-ons and crosses.' },
    { id: 'BETWEEN_LINES', label: 'Drift inside', blurb: 'Come inside onto your stronger foot — more shots and through-balls.' },
    { id: 'SHOW_FOR_IT', label: 'Support play', blurb: 'Link with the midfield — safer, more assists.' },
  ],
  CM: [
    { id: 'BETWEEN_LINES', label: 'Get forward', blurb: 'Break the lines — more driving runs and killer passes.' },
    { id: 'SHOW_FOR_IT', label: 'Dictate deep', blurb: 'Take the ball off the back four — retain and switch play.' },
    { id: 'PRESS', label: 'Hunt the ball', blurb: 'Press aggressively — more tackles, more involvement, card risk.' },
  ],
  FB: [
    { id: 'STAY_WIDE', label: 'Overlap', blurb: 'Get up the line — more crosses, less cover behind.' },
    { id: 'HOLD_SHAPE', label: 'Stay disciplined', blurb: 'Keep your shape — more defensive duels, safer.' },
    { id: 'PRESS', label: 'Jump the winger', blurb: 'Step out and press — more tackles, more risk in behind.' },
  ],
  CB: [
    { id: 'HOLD_SHAPE', label: 'Hold the line', blurb: 'Read and cover — more blocks and clearances.' },
    { id: 'PRESS', label: 'Step out', blurb: 'Follow runners and step in — more interceptions, more exposure.' },
    { id: 'SHOW_FOR_IT', label: 'Play out', blurb: 'Take it and build — more on-the-ball moments from the back.' },
  ],
  GK: [
    { id: 'HOLD_SHAPE', label: 'Stay on your line', blurb: 'Set for shots — more shot-stopping moments.' },
    { id: 'PRESS', label: 'Sweep high', blurb: 'Command the space — more one-on-ones and sweeping.' },
    { id: 'SHOW_FOR_IT', label: 'Play it out', blurb: 'Start attacks — more distribution moments.' },
  ],
};

/** Per-intent weight multipliers on moment types (default 1.0 when unlisted). */
const INTENT_TYPE_MULT: Record<PositioningIntent, Partial<Record<MomentType, number>>> = {
  IN_BEHIND: { RUN_IN_BEHIND: 2.4, ONE_ON_ONE: 2.0, FIRST_TIME_FINISH: 1.3, LONG_SHOT: 0.4, SHOOT_OR_SQUARE: 0.7 },
  SHOW_FOR_IT: { SHOOT_OR_SQUARE: 1.8, THROUGH_BALL: 1.6, RETENTION_PASS: 1.6, CROSS_OR_CUT: 1.3, ONE_ON_ONE: 0.6, RUN_IN_BEHIND: 0.5 },
  STAY_WIDE: { CROSS_OR_CUT: 2.2, TAKE_ON: 1.9, LONG_SHOT: 0.6, THROUGH_BALL: 0.7 },
  BETWEEN_LINES: { THROUGH_BALL: 1.9, DRIVE_FORWARD: 1.7, LONG_SHOT: 1.6, TAKE_ON: 1.3, RETENTION_PASS: 0.7 },
  PRESS: { MIDFIELD_TACKLE: 2.2, SLIDE_TACKLE: 2.0, OFFSIDE_TRAP: 1.4, BLOCK_SHOT: 1.3, GK_ONE_ON_ONE: 1.6, SWEEPER: 1.6 },
  HOLD_SHAPE: { BLOCK_SHOT: 1.8, AERIAL_DUEL: 1.6, CLEAR_OR_PLAY_OUT: 1.6, SHOT_STOP: 1.6, CLAIM_CROSS: 1.4, MIDFIELD_TACKLE: 0.6 },
};

/** How the intent shifts total involvement (extra/fewer moments in the budget). */
export const INTENT_INVOLVEMENT: Record<PositioningIntent, number> = {
  IN_BEHIND: 0, SHOW_FOR_IT: 1, STAY_WIDE: 0, BETWEEN_LINES: 1, PRESS: 1, HOLD_SHAPE: -1,
};

/** The weight multiplier a positioning intent applies to a moment type. */
export function intentWeight(intent: PositioningIntent | undefined, type: MomentType): number {
  if (!intent) return 1;
  return INTENT_TYPE_MULT[intent]?.[type] ?? 1;
}

/** The default positioning for a role (the first, most natural option). */
export function defaultPositioning(role: MomentRole): PositioningIntent {
  return ROLE_POSITIONING[role][0].id;
}

const C = (id: string, label: string, risk: MomentChoice['risk'], baseSuccess: number, reward: MomentChoice['reward'], attributes: string[]): MomentChoice =>
  ({ id, label, risk, baseSuccess, reward, attributes });

/** Prompt + choices for each moment type. Success probabilities are the base
 *  before the resolution model scales them by attributes/traits/context. */
export const MOMENT_DEFS: Record<MomentType, { prompt: string; choices: MomentChoice[] }> = {
  ONE_ON_ONE: { prompt: 'Clean through, one-on-one with the keeper.', choices: [
    C('slot', 'Slot it low into the corner', 'SAFE', 0.44, 'GOAL', ['finishing', 'composure']),
    C('dink', 'Dink it over the keeper', 'AMBITIOUS', 0.30, 'GOAL', ['composure', 'finishing']),
    C('round', 'Round the keeper', 'AMBITIOUS', 0.28, 'GOAL', ['dribbling', 'composure']),
    { ...C('panenka', '⚡ Cheeky chip — send him the wrong way', 'AMBITIOUS', 0.24, 'GOAL', ['composure', 'finishing']), signature: true },
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
    // Going down under contact: the referee either buys it or he doesn't, and
    // either way it goes on the record as the kind of thing you do.
    C('godown', 'Go down under the contact', 'AMBITIOUS', 0.38, 'KEY_PASS', ['agility', 'composure']),
    { ...C('nutmeg', '⚡ Nutmeg him and burst clear', 'AMBITIOUS', 0.30, 'GOAL', ['dribbling', 'agility']), signature: true },
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
    { ...C('screamer', '⚡ Go for the top corner', 'AMBITIOUS', 0.12, 'GOAL', ['longShots', 'shotPower', 'curve']), signature: true },
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
    { ...C('knuckle', '⚡ Knuckleball it over the wall', 'AMBITIOUS', 0.14, 'GOAL', ['fkAccuracy', 'shotPower', 'curve']), signature: true },
  ] },

  // --- Situational moments (§ game/momentChains) -----------------------------
  // These are never drawn from a role's pool. They exist only when the state of
  // the match creates them, so each one asks a question the scoreline is asking.

  LATE_CORNER: { prompt: 'The last corner of the match, and you’re a goal down.', choices: [
    C('goup', 'Go up for it', 'AMBITIOUS', 0.13, 'GOAL', ['headingAccuracy', 'jumping', 'strength']),
    C('stay', 'Stay out and take the second ball', 'BALANCED', 0.34, 'SHOT_ON', ['positioning', 'longShots']),
    C('shape', 'Hold your position — somebody has to', 'SAFE', 0.70, 'RETAIN', ['positioning']),
  ] },

  GAME_MANAGEMENT: { prompt: 'One goal in it, and the game needs seeing out.', choices: [
    C('keep', 'Keep the ball in the corner', 'SAFE', 0.78, 'RETAIN', ['ballControl', 'strength', 'composure']),
    C('kill', 'Go and kill the game off', 'AMBITIOUS', 0.26, 'GOAL', ['finishing', 'composure']),
    C('drop', 'Drop in and defend the lead', 'SAFE', 0.72, 'DUEL_WON', ['positioning', 'marking']),
  ] },

  HAT_TRICK_BALL: { prompt: 'You’re on two. He’s in more space than you are.', choices: [
    C('greedy', 'Shoot. This is your night', 'AMBITIOUS', 0.24, 'GOAL', ['finishing', 'composure']),
    C('square', 'Square it. The team comes first', 'SAFE', 0.62, 'ASSIST', ['vision', 'shortPassing']),
  ] },

  REF_DECISION: { prompt: 'The referee has just booked you, and you don’t agree.', choices: [
    C('walk', 'Walk away and say nothing', 'SAFE', 0.88, 'RETAIN', ['composure']),
    C('word', 'Have a quiet word with him', 'BALANCED', 0.52, 'RETAIN', ['composure', 'aggression']),
    C('surround', 'Let him know exactly what you think', 'AMBITIOUS', 0.22, 'NOTHING', ['aggression']),
  ] },

  DEMAND_THE_BALL: { prompt: 'An hour gone and you have barely touched it.', choices: [
    C('demand', 'Go and get on it. Show for everything', 'BALANCED', 0.48, 'KEY_PASS', ['composure', 'shortPassing', 'vision']),
    C('drift', 'Drift wide and find the space', 'BALANCED', 0.44, 'SHOT_ON', ['positioning', 'agility']),
    C('hide', 'Stay in position and wait for it to come', 'SAFE', 0.66, 'RETAIN', ['positioning']),
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
