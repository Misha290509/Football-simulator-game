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
import { MOMENT_DEFS, ROLE_MOMENTS, gamePlanAlignedChoices, isDefensiveRole, type MomentRole } from '../game/momentLibrary';

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
  let base = input.role === 'ST' ? 7 : input.role === 'GK' ? 5 : 6;
  base += input.frequency === 'LOW' ? -2 : input.frequency === 'HIGH' ? 2 : 0;
  if (input.status === 'STAR' || input.status === 'CAPTAIN') base += 1;
  else if (input.status === 'YOUTH') base -= 1;
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
  const minutes = Array.from({ length: n }, () => rng.int(3, 90)).sort((a, b) => a - b);
  const moments = minutes.map((minute) => ({ type: pickWeighted(rng, ROLE_MOMENTS[input.role]).type, minute }));
  return { teammateGoals, oppBaseGoals, moments };
}

// --- Resolution model -------------------------------------------------------

interface Running {
  avatarGoals: number; avatarAssists: number; avatarShots: number; avatarSaves: number;
  tacklesWon: number; duelsWon: number; clearances: number; keyPasses: number;
  teamGoals: number; oppGoals: number; oppPrevented: number;
  bigWon: number; bigLost: number; decisive: number; ratingBonus: number;
  penScored: number; penMissed: number; penSaved: number;
  yellow: boolean; red: boolean; ticks: MatchTick[];
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
  // Context bites: fatigue late, pressure in big games (unless Big-Game Player),
  // and low confidence all degrade the outcome.
  const fatigue = clamp(1 - input.fitness / 100 + moment.minute / 320, 0, 0.6);
  const bigGame = traitsOf(input.avatar).includes('BIG_GAME_PLAYER');
  p *= 1 - fatigue * 0.18;
  p *= 1 - moment.context.pressure * (bigGame ? 0.02 : 0.14);
  p *= 0.9 + (input.confidence / 100) * 0.2;
  const success = rng.chance(clamp(p, 0.03, 0.95));

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
      if (success) { run.avatarGoals++; run.teamGoals++; bump(1.0); won(); run.ticks.push({ minute: moment.minute, text: `⚽ You score! (${input.avatar.name.last})`, kind: 'GOAL' }); }
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
interface Running { oppGoalsBaseline: number; defensiveDanger: number }

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
  return {
    id: `${input.matchId}_m${index}`,
    matchId: input.matchId, index, minute: spec.minute, type: spec.type, position: input.avatar.position,
    prompt: def.prompt, choices: def.choices, gamePlanAligned: gamePlanAlignedChoices(spec.type, input.gamePlan),
    context: ctxFor(input, run, spec.minute),
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
    defensiveDanger: isDefensiveRole(input.role) ? plan.oppBaseGoals : 0,
    bigWon: 0, bigLost: 0, decisive: 0, ratingBonus: 0, penScored: 0, penMissed: 0, penSaved: 0, yellow: false, red: false, ticks: [],
  };
  const decisionLog: MomentDecision[] = [];

  for (let i = 0; i < plan.moments.length; i++) {
    const moment = buildMoment(input, plan.moments[i], i, run);
    const decided = decisions[i];
    if (!decided) {
      return { kind: 'DECISION', moment, ticker: [...run.ticks] };
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
  if (run.avatarGoals >= 3) standout = `Scored a hat-trick against ${input.oppName}.`;
  else if (run.decisive > 0 && won) standout = `Produced a decisive late contribution to beat ${input.oppName}.`;
  else if (run.penSaved > 0) standout = `Saved a penalty against ${input.oppName}.`;
  else if (run.avatarGoals >= 2) standout = `Scored a brace against ${input.oppName}.`;

  run.ticks.push({ minute: 90, text: `Full time: ${homeGoals}–${awayGoals}`, kind: 'INFO' });
  return {
    kind: 'DONE', match,
    record: {
      matchId: input.matchId, seed: input.seed, decisionLog, gamePlan: input.gamePlan,
      gamePlanAdherence: adherence, momentCount: decisionLog.length,
      tally: { bigWon: run.bigWon, bigLost: run.bigLost, penScored: run.penScored, penMissed: run.penMissed, penSaved: run.penSaved, decisive: run.decisive },
      standout,
    },
    ticker: [...run.ticks],
  };
}
