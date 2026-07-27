// ---------------------------------------------------------------------------
// Player Career — interactive match engine (Tier 3). A resumable, fully
// deterministic simulation of the avatar's own fixture, realised as a REPLAY
// function: `runInteractiveMatch(input, decisions)` re-runs from the seed each
// call, applying the logged decisions in order, and returns either the next
// undecided KeyMoment (pause) or the finished Match. Because it is a pure
// function of (seed, decisionLog), replays, save/reload and tests are all
// bit-reproducible — the moment's randomness is only ever drawn AFTER its
// decision, keeping the RNG stream aligned between a fresh run and a resume.
//
// Only the avatar's match uses this; every other fixture batch-sims unchanged.
// ---------------------------------------------------------------------------

import type { Player } from '../types/player';
import type { Match, LineupProfile, PlayerMatchStat, MatchEvent } from '../types/match';
import type { SquadStatus } from '../types/playerCareer';
import type {
  KeyMoment, MomentDecision, GamePlan, InteractiveStep, MatchTick, MomentType, MomentChoice, MomentContext,
} from '../types/interactiveMatch';
import { Rng, clamp } from './rng';
import { traitsOf } from './traits';
import { MOMENT_DEFS, ROLE_MOMENTS, gamePlanAlignedChoices, isDefensiveRole, intentWeight, INTENT_INVOLVEMENT, type MomentRole } from '../game/momentLibrary';
import { playStylesOf, playStyleFactor } from '../game/playStyles';
import { celebrationById } from '../game/playerIdentity';
import {
  conditionsFactor, conditionsFatigue, crowdFlowPenalty, scoutFactor, lateLegsFactor,
  isExplosiveChoice, fatigueLevel, fatigueGateFactor, clarityLevel,
  type MatchConditions, type ScoutNote,
} from '../game/matchConditions';
import type { PositioningIntent, MarkerInfo } from '../types/interactiveMatch';

export interface InteractiveInput {
  matchId: string;
  seed: number;
  fixture: Match;
  avatar: Player;
  role: MomentRole;
  isAvatarHome: boolean;
  avatarProfile: LineupProfile;
  oppProfile: LineupProfile;
  oppName: string;
  importance: number; // 0–1
  confidence: number; // 0–100
  fitness: number; // 0–100
  status: SquadStatus;
  gamePlan: GamePlan;
  frequency: 'LOW' | 'NORMAL' | 'HIGH';
  /** The avatar comes off the bench: a short late cameo (fewer, later moments). */
  cameo?: boolean;
  /** Off-the-ball movement — reshapes which moments come his way (pre-match). */
  intent?: PositioningIntent;
  /** A half-time switch of off-the-ball movement, applied to second-half moments
   *  only. Same number of RNG draws as `intent`, so the first half replays
   *  identically — only the types of minute≥45 moments change. */
  intent2?: PositioningIntent;
  /** A special occasion framing the fixture (derby, former club, big match) —
   *  presentation + raised stakes; the importance value already reflects it. */
  occasion?: { kind: 'DERBY' | 'FORMER_CLUB' | 'BIG_MATCH'; label: string };
  /** The specific opponent the avatar is locked in a personal duel with. */
  marker?: MarkerInfo;
  /** His pre-match routine was disrupted — superstition bites, flow starts low. */
  ritualBroken?: { line: string };
  /** His signature celebration id (shown when he scores). */
  celebration?: string;
  /** Weather, pitch, crowd and altitude for the day. */
  conditions?: MatchConditions;
  /** The pre-match dossier on the opponent (exploitable weaknesses). */
  scout?: ScoutNote[];
}

// --- Small deterministic helpers -------------------------------------------

function flatAttr(p: Player, key: string): number {
  const a = p.attributes as unknown as Record<string, Record<string, number>>;
  for (const grp of ['technical', 'mental', 'physical', 'goalkeeping']) {
    const v = a[grp]?.[key];
    if (typeof v === 'number') return v;
  }
  return 50;
}
const meanAttr = (p: Player, keys: string[]) => keys.reduce((s, k) => s + flatAttr(p, k), 0) / Math.max(1, keys.length);

function poisson(rng: Rng, lambda: number): number {
  const L = Math.exp(-Math.max(0, lambda));
  let k = 0, prod = 1;
  do { k++; prod *= rng.next(); } while (prod > L);
  return k - 1;
}
/** Expected goals for a team from its attack vs the opponent's defence. */
const xg = (atk: number, def: number) => clamp(1.35 * Math.pow(atk / Math.max(35, def), 1.15), 0.2, 4.2);

function pickWeighted<T extends { weight: number }>(rng: Rng, arr: T[]): T {
  const total = arr.reduce((s, a) => s + a.weight, 0);
  let r = rng.next() * total;
  for (const a of arr) { r -= a.weight; if (r <= 0) return a; }
  return arr[arr.length - 1];
}

// --- The match plan (all structural RNG happens here, once) -----------------

interface MatchPlan { teammateGoals: number; oppBaseGoals: number; moments: { type: MomentType; minute: number }[] }

function momentBudget(rng: Rng, input: InteractiveInput): number {
  // A cameo off the bench is a handful of late chances to make an impact.
  if (input.cameo) return clamp(2 + (input.frequency === 'HIGH' ? 1 : 0) + rng.int(0, 1), 2, 4);
  let base = input.role === 'ST' ? 7 : input.role === 'GK' ? 5 : 6;
  base += input.frequency === 'LOW' ? -2 : input.frequency === 'HIGH' ? 2 : 0;
  if (input.status === 'STAR' || input.status === 'CAPTAIN') base += 1;
  else if (input.status === 'YOUTH') base -= 1;
  if (input.intent) base += INTENT_INVOLVEMENT[input.intent]; // off-the-ball involvement
  return clamp(base + rng.int(-1, 1), 4, 10);
}

function buildPlan(rng: Rng, input: InteractiveInput): MatchPlan {
  const lamFor = xg(input.avatarProfile.attack, input.oppProfile.defense) * input.avatarProfile.shotVolumeMod;
  const lamOpp = xg(input.oppProfile.attack, input.avatarProfile.defense) * input.oppProfile.shotVolumeMod;
  // Teammates carry most of the team's expected goals; the avatar's own share
  // comes from converting moments, keeping aggregate output close to auto-sim.
  const teammateShare = isDefensiveRole(input.role) ? 0.95 : 0.68;
  const teammateGoals = poisson(rng, lamFor * teammateShare);
  const oppBaseGoals = poisson(rng, lamOpp);
  const n = momentBudget(rng, input);
  // A cameo's chances fall in the closing stretch; a start spans the whole game.
  const [lo, hi] = input.cameo ? [66, 90] : [3, 90];
  const minutes = Array.from({ length: n }, () => rng.int(lo, hi)).sort((a, b) => a - b);
  // Off-the-ball intent re-weights which moments come the avatar's way (same
  // number of RNG draws, so the deterministic stream stays aligned). A half-time
  // switch (`intent2`) re-weights the second half only — one draw per moment
  // either way, so the first half replays identically.
  const pool1 = ROLE_MOMENTS[input.role].map((m) => ({ type: m.type, weight: m.weight * intentWeight(input.intent, m.type) }));
  const intent2 = input.intent2 ?? input.intent;
  const pool2 = intent2 === input.intent ? pool1
    : ROLE_MOMENTS[input.role].map((m) => ({ type: m.type, weight: m.weight * intentWeight(intent2, m.type) }));
  const moments: { type: MomentType; minute: number }[] = minutes.map((minute) => ({ type: pickWeighted(rng, minute < 45 ? pool1 : pool2).type, minute }));

  // #15 — set-piece specialists get their signature moments regardless of the
  // general frequency: a dead-ball taker earns free-kicks, a penalty ace the
  // spot-kick. Deterministic; folded into the one-shot structural RNG.
  const deadball = Math.max(flatAttr(input.avatar, 'fkAccuracy'), flatAttr(input.avatar, 'curve'));
  if (deadball >= 78 && !isDefensiveRole(input.role) && rng.chance(0.45)) {
    moments.push({ type: 'FREE_KICK', minute: rng.int(20, 85) });
  }
  if (flatAttr(input.avatar, 'penalties') >= 80 && (input.role === 'ST' || input.role === 'WIDE') && rng.chance(0.22)) {
    moments.push({ type: 'PENALTY', minute: rng.int(25, 88) });
  }
  moments.sort((a, b) => a.minute - b.minute);
  return { teammateGoals, oppBaseGoals, moments };
}

// --- Resolution model -------------------------------------------------------

interface Running {
  avatarGoals: number; avatarAssists: number; avatarShots: number; avatarSaves: number;
  tacklesWon: number; duelsWon: number; clearances: number; keyPasses: number;
  teamGoals: number; oppGoals: number; oppPrevented: number;
  bigWon: number; bigLost: number; decisive: number; ratingBonus: number;
  penScored: number; penMissed: number; penSaved: number;
  yellow: boolean; red: boolean; worldie: boolean; ticks: MatchTick[];
}

function traitFactor(p: Player, reward: MomentChoice['reward']): number {
  const t = traitsOf(p);
  let f = 1;
  if (reward === 'GOAL') { if (t.includes('CLINICAL')) f += 0.14; if (t.includes('POACHER')) f += 0.08; }
  if (reward === 'ASSIST' || reward === 'KEY_PASS') { if (t.includes('PLAYMAKER')) f += 0.15; }
  if (reward === 'SAVE') { /* keeper reflexes already in attrs */ }
  return f;
}

/** Resolve one decided moment. Consumes exactly one primary RNG draw for the
 *  outcome (plus at most one for a card), always AFTER the decision is known. */
function resolveMoment(
  input: InteractiveInput, moment: KeyMoment, choice: MomentChoice, rng: Rng, run: Running,
): { success: boolean; effect: string } {
  const a = meanAttr(input.avatar, choice.attributes);
  let p = choice.baseSuccess;
  // Attributes rule: they dominate, the decision modifies. A weak player with a
  // perfect choice still usually fails; a world-class one can pull off a poor one.
  p *= clamp(0.5 + (a - 50) / 70, 0.35, 1.7);
  p *= traitFactor(input.avatar, choice.reward);
  // PlayStyles: a modest, targeted edge on the moments they suit (attrs still rule).
  p *= playStyleFactor(playStylesOf(input.avatar), moment.type, choice.reward);
  // Context bites: fatigue late, pressure in big games (unless Big-Game Player),
  // and low confidence all degrade the outcome.
  const fatigue = clamp(1 - input.fitness / 100 + moment.minute / 320 + conditionsFatigue(input.conditions), 0, 0.75);
  const bigGame = traitsOf(input.avatar).includes('BIG_GAME_PLAYER');
  p *= 1 - fatigue * 0.18;
  p *= 1 - moment.context.pressure * (bigGame ? 0.02 : 0.14);
  p *= 0.9 + (input.confidence / 100) * 0.2;
  // Flow: a hot player (in the zone) gets a modest edge, a cold one is nervy.
  // Deterministic — run.flow folds only the moments already resolved.
  p *= 0.85 + (clamp(run.flow, 0, 100) / 100) * 0.3;
  // The personal duel: a tough marker makes the direct battles harder.
  if (input.marker && isDuelMoment(moment.type)) p *= clamp(1 - (input.marker.rating - 70) / 200, 0.8, 1.18);
  // Signature flair: extra reward on success, and flow makes it land.
  if (choice.signature) p *= 0.9 + (clamp(run.flow, 0, 100) / 100) * 0.35;
  // Conditions: rain kills the touch, wind swirls a cross, a rutted pitch bites.
  p *= conditionsFactor(input.conditions, moment.type, choice.reward);
  // Scouting: exploiting a real weakness pays; ignoring the dossier costs.
  p *= scoutFactor(input.scout, moment.type, choice.id, choice.reward);
  p *= lateLegsFactor(input.scout, moment.minute);
  // Fatigue gating: explosive options desert you when the legs have gone.
  p *= fatigueGateFactor(fatigueLevel(input.fitness, moment.minute, input.conditions), isExplosiveChoice(moment.type, choice));
  const success = rng.chance(clamp(p, 0.03, 0.96));
  run.momentum = success ? run.momentum + 1 : 0;
  const flowBefore = run.flow;
  run.flow = clamp(run.flow + flowDelta(choice.reward, success, !!choice.signature), 0, 100);
  if (flowBefore < FLOW_HOT && run.flow >= FLOW_HOT) run.ticks.push({ minute: moment.minute, text: `🔥 ${input.avatar.name.last} is in the zone — everything's coming off!`, kind: 'INFO' });
  else if (flowBefore > FLOW_COLD && run.flow <= FLOW_COLD) run.ticks.push({ minute: moment.minute, text: `😬 ${input.avatar.name.last} looks rattled — heads down out there.`, kind: 'INFO' });
  // Track the personal duel and colour it in the ticker.
  if (input.marker && isDuelMoment(moment.type)) {
    if (success) { run.duelWon++; run.ticks.push({ minute: moment.minute, text: `💪 You get the better of ${input.marker.name}!`, kind: 'INFO' }); }
    else { run.duelLost++; run.ticks.push({ minute: moment.minute, text: `${input.marker.name} wins that one — he's a handful.`, kind: 'INFO' }); }
  }

  const late = moment.minute >= 75;
  const ambitious = choice.risk === 'AMBITIOUS';
  if (moment.type === 'PENALTY') { if (success) run.penScored++; else run.penMissed++; }
  if (moment.type === 'PENALTY_SAVE' && success) run.penSaved++;
  applyOutcome(input, moment, choice, success, run, late);

  // Ambitious defensive/tackle failures can cost a card (one extra draw).
  let effect = outcomeText(choice, success);
  if (!success && (choice.reward === 'TACKLE_WON') && ambitious && rng.chance(0.28)) {
    if (run.yellow) { run.red = true; effect = 'Mistimed it — sent off!'; run.ratingBonus -= 1.2; }
    else { run.yellow = true; effect = 'Mistimed the tackle — booked.'; run.ratingBonus -= 0.3; }
  }
  return { success, effect };
}

function applyOutcome(input: InteractiveInput, moment: KeyMoment, choice: MomentChoice, success: boolean, run: Running, late: boolean): void {
  const bump = (n: number) => { run.ratingBonus += n; };
  const won = () => { run.bigWon++; if (late) run.decisive++; };
  const lost = () => { run.bigLost++; };
  switch (choice.reward) {
    case 'GOAL':
      run.avatarShots++;
      if (success) {
        run.avatarGoals++; run.teamGoals++; bump(1.0); won();
        // A spectacular strike — a long-range screamer or a set-piece special —
        // is a goal-of-the-season contender, worth an extra bit of rating shine.
        const spectacular = moment.type === 'LONG_SHOT' || moment.type === 'FREE_KICK' || !!choice.signature;
        if (spectacular) { run.worldie = true; bump(choice.signature ? 0.4 : 0.3); run.ticks.push({ minute: moment.minute, text: `🚀 WHAT A GOAL! ${choice.signature ? 'Audacious brilliance' : 'An unstoppable strike'} from ${input.avatar.name.last}!`, kind: 'GOAL' }); }
        else run.ticks.push({ minute: moment.minute, text: `⚽ You score! (${input.avatar.name.last})`, kind: 'GOAL' });
        // His signature celebration, then the bench going up.
        const cel = celebrationById(input.celebration);
        if (cel) run.ticks.push({ minute: moment.minute, text: `${cel.emoji} ${cel.name} — his signature.`, kind: 'INFO' });
        run.ticks.push({ minute: moment.minute, text: teammateReaction(input, moment.minute, 'GOAL'), kind: 'INFO' });
      }
      else { bump(-0.15); lost(); run.ticks.push({ minute: moment.minute, text: `Chance spurned — ${outcomeText(choice, false)}`, kind: 'CHANCE' }); }
      break;
    case 'ASSIST':
      if (success) { run.avatarAssists++; run.teamGoals++; bump(0.7); won(); if (late) run.decisive++; run.ticks.push({ minute: moment.minute, text: `🅰 You set up a goal!`, kind: 'GOAL' }); }
      else { bump(-0.05); }
      break;
    case 'KEY_PASS': case 'SHOT_ON':
      if (success) { run.keyPasses++; if (choice.reward === 'SHOT_ON') run.avatarShots++; bump(0.25); }
      else { bump(-0.05); lost(); }
      break;
    case 'SAVE':
      if (success) {
        run.avatarSaves++;
        if (dangerPrevent(run)) { run.oppPrevented++; bump(0.6); won(); run.ticks.push({ minute: moment.minute, text: `🧤 Big save — kept it out!`, kind: 'CHANCE' }); }
        else { bump(0.3); run.ticks.push({ minute: moment.minute, text: `🧤 Save made.`, kind: 'CHANCE' }); }
      } else { bump(-0.25); lost(); }
      break;
    case 'TACKLE_WON':
      if (success) { run.tacklesWon++; if (dangerPrevent(run)) { run.oppPrevented++; won(); } bump(0.3); }
      else { bump(-0.2); lost(); }
      break;
    case 'DUEL_WON': case 'CLEAN_CLEARANCE':
      if (success) { run.duelsWon++; run.clearances += choice.reward === 'CLEAN_CLEARANCE' ? 1 : 0; if (dangerPrevent(run)) { run.oppPrevented++; won(); } bump(0.2); }
      else { bump(-0.15); lost(); }
      break;
    case 'RETAIN':
      bump(success ? 0.05 : -0.1); break;
    case 'NOTHING': break;
  }
}

/** For defensive roles, a won duel/tackle/clearance/save can prevent one of the
 *  opponent's baseline goals (ties the shirt battle to the scoreline). Consumes
 *  one unit of the danger budget only on a genuine prevent. */
function dangerPrevent(run: Running): boolean {
  if (run.oppPrevented < run.oppGoalsBaseline && run.defensiveDanger > 0) { run.defensiveDanger--; return true; }
  return false;
}

/** #12 — a deterministic teammate/manager reaction line (no RNG draw, so the
 *  match stream stays perfectly aligned across fresh runs and resumes). */
function teammateReaction(input: InteractiveInput, minute: number, kind: 'GOAL'): string {
  void kind;
  const lines = [
    `The lads mob ${input.avatar.name.last} — the bench is up!`,
    `The gaffer punches the air on the touchline.`,
    `The crowd roars ${input.avatar.name.last}'s name.`,
    `Your captain roars in your face — what a moment!`,
  ];
  return lines[minute % lines.length];
}

function outcomeText(choice: MomentChoice, success: boolean): string {
  if (success) {
    switch (choice.reward) {
      case 'GOAL': return 'Goal!'; case 'ASSIST': return 'Assist!'; case 'SAVE': return 'Saved!';
      case 'TACKLE_WON': return 'Won the ball!'; case 'DUEL_WON': return 'Won the duel!';
      case 'CLEAN_CLEARANCE': return 'Cleared!'; case 'KEY_PASS': return 'Great ball!';
      case 'SHOT_ON': return 'On target!'; default: return 'Kept it.';
    }
  }
  switch (choice.reward) {
    case 'GOAL': return choice.risk === 'AMBITIOUS' ? 'dragged wide.' : 'the keeper saves.';
    case 'ASSIST': case 'KEY_PASS': return 'the pass is cut out.';
    case 'SAVE': return 'beaten — it’s in.'; case 'TACKLE_WON': return 'he skips past you.';
    default: return 'it comes to nothing.';
  }
}

// --- The runner -------------------------------------------------------------

// Extra running fields kept off the interface above for brevity.
interface Running { oppGoalsBaseline: number; defensiveDanger: number; momentum: number; flow: number; duelWon: number; duelLost: number }

// --- Flow ("in the zone") ---------------------------------------------------
// A 0–100 heat meter that folds the outcomes decided so far (pure & replayable).
// Rises with end-product, falls with wastefulness; a hot player gets a modest
// edge and unlocks his signature move, a cold one turns nervy.
export const FLOW_START = 50;
export const FLOW_HOT = 75;
export const FLOW_COLD = 25;

function flowDelta(reward: MomentChoice['reward'], success: boolean, signature: boolean): number {
  const base: Record<string, [number, number]> = {
    GOAL: [20, -14], ASSIST: [16, -6], SAVE: [15, -12], KEY_PASS: [9, -5], SHOT_ON: [9, -5],
    TACKLE_WON: [9, -8], DUEL_WON: [8, -8], CLEAN_CLEARANCE: [8, -6], RETAIN: [3, -4], NOTHING: [0, 0],
  };
  const [up, down] = base[reward] ?? [6, -6];
  return (success ? up : down) * (signature ? 1.3 : 1);
}

// The moment types that pit the avatar directly against his marker (a personal
// duel), by whether he's attacking or defending the situation.
const DUEL_TYPES = new Set<MomentType>([
  'TAKE_ON', 'ONE_ON_ONE', 'RUN_IN_BEHIND', 'HEADER', 'AERIAL_DUEL',
  'MIDFIELD_TACKLE', 'SLIDE_TACKLE', 'BLOCK_SHOT', 'GK_ONE_ON_ONE',
]);
function isDuelMoment(type: MomentType): boolean { return DUEL_TYPES.has(type); }

function ctxFor(input: InteractiveInput, run: Running, minute: number): MomentContext {
  return {
    score: [run.teamGoals, run.oppGoals],
    importance: input.importance,
    pressure: clamp(input.importance * 0.6 + (minute >= 75 ? 0.3 : 0) + (Math.abs(run.teamGoals - run.oppGoals) <= 1 ? 0.2 : 0), 0, 1),
    fatigue: clamp(1 - input.fitness / 100 + minute / 320, 0, 1),
    confidence: input.confidence,
  };
}

function buildMoment(input: InteractiveInput, spec: { type: MomentType; minute: number }, index: number, run: Running): KeyMoment {
  const def = MOMENT_DEFS[spec.type];
  const duel = input.marker && isDuelMoment(spec.type);
  const prompt = duel ? `${def.prompt} You're up against ${input.marker!.name}.` : def.prompt;
  return {
    id: `${input.matchId}_m${index}`,
    matchId: input.matchId, index, minute: spec.minute, type: spec.type, position: input.avatar.position,
    prompt, choices: def.choices, gamePlanAligned: gamePlanAlignedChoices(spec.type, input.gamePlan),
    context: ctxFor(input, run, spec.minute),
    // Instinct vs information: under real pressure the picture gets fuzzy unless
    // he has the temperament to keep his head.
    clarity: clarityLevel(
      ctxFor(input, run, spec.minute).pressure,
      input.avatar.hidden?.bigGame ?? 50,
      flatAttr(input.avatar, 'composure'),
      input.conditions?.hostility ?? 0,
    ),
  };
}

/**
 * Re-run the match from the seed, applying `decisions` in order. Returns the
 * next undecided moment, or the finished Match + record. Pure & deterministic.
 */
export function runInteractiveMatch(input: InteractiveInput, decisions: MomentDecision[]): InteractiveStep {
  const rng = new Rng(input.seed >>> 0);
  const plan = buildPlan(rng, input);
  const run: Running = {
    avatarGoals: 0, avatarAssists: 0, avatarShots: 0, avatarSaves: 0, tacklesWon: 0, duelsWon: 0, clearances: 0, keyPasses: 0,
    teamGoals: plan.teammateGoals, oppGoals: plan.oppBaseGoals, oppPrevented: 0, oppGoalsBaseline: plan.oppBaseGoals,
    defensiveDanger: isDefensiveRole(input.role) ? plan.oppBaseGoals : 0, momentum: 0,
    // A broken pre-match ritual starts him a touch off his rhythm.
    flow: clamp(
      (input.ritualBroken ? FLOW_START - 12 : FLOW_START)
      - crowdFlowPenalty(input.conditions, input.avatar.hidden?.bigGame ?? 50),
      0, 100),
    duelWon: 0, duelLost: 0,
    bigWon: 0, bigLost: 0, decisive: 0, ratingBonus: 0, penScored: 0, penMissed: 0, penSaved: 0, yellow: false, red: false, worldie: false, ticks: [],
  };
  if (input.ritualBroken) run.ticks.push({ minute: 0, text: `🧿 ${input.ritualBroken.line} You're not quite in your rhythm.`, kind: 'INFO' });
  const decisionLog: MomentDecision[] = [];

  for (let i = 0; i < plan.moments.length; i++) {
    const moment = buildMoment(input, plan.moments[i], i, run);
    const decided = decisions[i];
    if (!decided) {
      return { kind: 'DECISION', moment, ticker: [...run.ticks], flow: Math.round(run.flow), marker: input.marker, duel: { won: run.duelWon, lost: run.duelLost } };
    }
    const choice = moment.choices.find((c) => c.id === decided.choiceId) ?? moment.choices[0];
    const { success, effect } = resolveMoment(input, moment, choice, rng, run);
    decisionLog.push({
      momentId: moment.id, choiceId: choice.id, autoResolved: decided.autoResolved,
      followedGamePlan: moment.gamePlanAligned.includes(choice.id), success, effect,
    });
  }

  // All moments decided → finalize.
  return finalize(input, plan, run, decisionLog);
}

function finalize(input: InteractiveInput, plan: MatchPlan, run: Running, decisionLog: MomentDecision[]): InteractiveStep {
  const finalOpp = Math.max(0, run.oppGoals - run.oppPrevented);
  const finalTeam = run.teamGoals;
  const homeGoals = input.isAvatarHome ? finalTeam : finalOpp;
  const awayGoals = input.isAvatarHome ? finalOpp : finalTeam;

  // Distribute goals to concrete scorers so records/awards stay consistent.
  const rng = new Rng((input.seed ^ 0x5c07e5) >>> 0);
  const stats = new Map<string, PlayerMatchStat>();
  const events: MatchEvent[] = [];
  const stat = (id: string): PlayerMatchStat => {
    let s = stats.get(id);
    if (!s) { s = { playerId: id, minutes: 90, goals: 0, assists: 0, shots: 0, rating: 6.5, yellow: false, red: false }; stats.set(id, s); }
    return s;
  };
  const seedStarters = (prof: LineupProfile) => prof.starters.forEach((id) => stat(id));
  seedStarters(input.avatarProfile); seedStarters(input.oppProfile);

  // The avatar's own line.
  const av = stat(input.avatar.id);
  av.goals = run.avatarGoals; av.assists = run.avatarAssists; av.shots = run.avatarShots;
  if (run.avatarSaves) av.saves = run.avatarSaves;
  av.yellow = run.yellow; av.red = run.red;
  // A cameo only logs the minutes the avatar was actually on the pitch.
  if (input.cameo) av.minutes = clamp(90 - (plan.moments[0]?.minute ?? 66) + 4, 8, 30) as number;

  // Teammate goals (excluding the avatar's own) → weighted scorers.
  const teammateGoals = plan.teammateGoals + run.avatarAssists; // assists produced a teammate goal
  const teamScorers = input.avatarProfile.scorers.filter((s) => s.playerId !== input.avatar.id && s.weight > 0);
  for (let g = 0; g < teammateGoals; g++) {
    const pid = pickWeighted(rng, teamScorers.map((s) => ({ ...s, weight: s.weight }))).playerId;
    if (pid !== input.avatar.id) stat(pid).goals++;
  }
  // Opponent goals.
  const oppScorers = input.oppProfile.scorers.filter((s) => s.weight > 0);
  for (let g = 0; g < finalOpp; g++) {
    if (oppScorers.length) stat(pickWeighted(rng, oppScorers.map((s) => ({ ...s, weight: s.weight }))).playerId).goals++;
  }

  // Ratings: everyone a baseline; the avatar reflects his moments.
  for (const s of stats.values()) {
    s.rating = clamp(Math.round((6.4 + s.goals * 0.9 + s.assists * 0.5 + rng.normal(0, 0.25)) * 10) / 10, 4, 9.5);
  }
  av.rating = clamp(Math.round((6.4 + run.ratingBonus + run.avatarGoals * 0.3 + run.avatarAssists * 0.2) * 10) / 10, 3.5, 9.9);

  // Goal events (avatar first for the feed).
  for (let g = 0; g < run.avatarGoals; g++) events.push({ minute: 1, type: 'GOAL', side: input.isAvatarHome ? 'home' : 'away', playerId: input.avatar.id, description: 'Goal' });

  const match: Match = {
    ...input.fixture, played: true, homeGoals, awayGoals,
    homeXg: input.isAvatarHome ? finalTeam + 0.5 : finalOpp + 0.5,
    awayXg: input.isAvatarHome ? finalOpp + 0.5 : finalTeam + 0.5,
    events, playerStats: [...stats.values()],
  };

  const gpFollowed = decisionLog.filter((d) => d.followedGamePlan).length;
  const adherence = decisionLog.length ? gpFollowed / decisionLog.length : 1;

  // A standout line for the timeline (late winner, hat-trick, penalty save…).
  let standout: string | undefined;
  const won = finalTeam > finalOpp;
  const bossedMarker = input.marker && run.duelWon >= 3 && run.duelWon > run.duelLost * 2;
  if (run.avatarGoals >= 3) standout = `Scored a hat-trick against ${input.oppName}.`;
  else if (run.worldie) standout = `Scored a stunning goal against ${input.oppName} — one for the goal-of-the-season shortlist.`;
  else if (run.decisive > 0 && won) standout = `Produced a decisive late contribution to beat ${input.oppName}.`;
  else if (run.penSaved > 0) standout = `Saved a penalty against ${input.oppName}.`;
  else if (run.avatarGoals >= 2) standout = `Scored a brace against ${input.oppName}.`;
  else if (bossedMarker) standout = `Ran ${input.marker!.name} ragged all afternoon.`;

  // The personal-duel verdict for the ticker + post-match.
  if (input.marker && (run.duelWon + run.duelLost) > 0) {
    const verdict = run.duelWon > run.duelLost ? `You came out on top against ${input.marker.name} (${run.duelWon}–${run.duelLost}).`
      : run.duelWon < run.duelLost ? `${input.marker.name} shaded your personal battle (${run.duelWon}–${run.duelLost}).`
      : `An even scrap with ${input.marker.name} (${run.duelWon}–${run.duelLost}).`;
    run.ticks.push({ minute: 90, text: `⚔️ ${verdict}`, kind: 'INFO' });
  }

  run.ticks.push({ minute: 90, text: `Full time: ${homeGoals}–${awayGoals}`, kind: 'INFO' });
  return {
    kind: 'DONE', match,
    record: {
      matchId: input.matchId, seed: input.seed, decisionLog, gamePlan: input.gamePlan,
      gamePlanAdherence: adherence, momentCount: decisionLog.length,
      tally: { bigWon: run.bigWon, bigLost: run.bigLost, penScored: run.penScored, penMissed: run.penMissed, penSaved: run.penSaved, decisive: run.decisive },
      standout,
      duel: input.marker ? { won: run.duelWon, lost: run.duelLost, markerName: input.marker.name } : undefined,
    },
    ticker: [...run.ticks],
    flow: Math.round(run.flow), marker: input.marker, duel: { won: run.duelWon, lost: run.duelLost },
  };
}
