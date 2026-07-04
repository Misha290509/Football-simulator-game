// ---------------------------------------------------------------------------
// Live match engine (§ Living Match Day). A stepped, minute-by-minute version of
// the batch match model (see match.ts). Because it advances one minute at a time
// and reads each side's *current* lineup profile every step, mid-match changes
// (subs, formation, tactics) take effect immediately — the whole point of an
// interactive match. Pure & deterministic given the same RNG + user actions.
// ---------------------------------------------------------------------------

import type { LineupProfile, MatchEvent, PlayerMatchStat, BenchEntry } from '../types/match';
import { Rng, clamp } from './rng';
import { evaluateTeamTalk, type TalkTone, type TalkContext, type TalkResult } from './morale';

const HOME_ADVANTAGE = 9;

type Pool = { playerId: string; weight: number }[];
export type LivePhase = 'PREMATCH' | 'FIRST_HALF' | 'HALF_TIME' | 'SECOND_HALF' | 'SHOOTOUT' | 'FULL_TIME';
export type Side = 'home' | 'away';

export interface ShootoutKick { side: Side; scored: boolean }
export interface ShootoutState {
  home: number;
  away: number;
  kicks: ShootoutKick[];
  done: boolean;
  winner: Side | null;
}

interface AiSub { minute: number; offId: string; onId: string }

export interface LiveSideState {
  clubId: string;
  isHome: boolean;
  /** Formation currently on the pitch (drives the 2D pitch view). */
  formation?: string;
  profile: LineupProfile;
  scorers: Pool;
  creators: Pool;
  onPitch: string[];
  bench: BenchEntry[];
  goals: number;
  xg: number;
  shots: number;
  saves: number;
  reds: number;
  subsUsed: number;
  aiSubs: AiSub[]; // auto-subs for a non-managed side
  managed: boolean;
  talkBoost: number; // team-talk strength multiplier (default 1)
}

export interface LiveMatchState {
  matchId: string;
  competitionId: string;
  seasonId: string;
  homeClubId: string;
  awayClubId: string;
  seed: number;
  minute: number;
  added1: number; // first-half stoppage
  added2: number; // second-half stoppage
  phase: LivePhase;
  home: LiveSideState;
  away: LiveSideState;
  events: MatchEvent[];
  stats: Record<string, PlayerMatchStat>;
  onMinuteOf: Record<string, number>; // when a player came on (0 = started)
  offMinuteOf: Record<string, number>; // when a player left (undefined = still on)
  momentum: number; // -100 (away pressure) … +100 (home pressure)
  lastTalk: { message: string; reception: number } | null;
  finished: boolean;
  /** Knockout tie: a level score after 90' goes to a penalty shootout. */
  needsWinner?: boolean;
  /** Shootout progress once a level knockout tie reaches full time. */
  shootout?: ShootoutState;
  /** Penalty-taking skill (0–100) per side — from the designated taker. */
  homePenSkill?: number;
  awayPenSkill?: number;
}

// --- Commentary phrase pools (name-agnostic; the UI adds minute + player) ----
const GOAL_PHRASES = [
  'buries it low into the corner!', 'rifles it into the roof of the net!',
  'slots it past the keeper!', 'heads it home!', 'smashes it in off the bar!',
  'finishes coolly one-on-one!', 'curls a beauty into the top corner!',
];
const SAVE_PHRASES = ['is denied by a stunning save!', 'sees the keeper get down well!', 'forces a fingertip save!'];
const CHANCE_PHRASES = ['drags it just wide!', 'blazes over the bar!', 'hits the side netting!', 'is a whisker away!'];
const AMBIENT_HOME = ['The home side are pressing high.', 'Wave after wave of home pressure.', 'The crowd senses a goal.'];
const AMBIENT_AWAY = ['The visitors are dictating the tempo.', 'The away side look dangerous on the break.', 'Sustained away pressure.'];
const AMBIENT_NEUTRAL = ['A scrappy spell in midfield.', 'Both sides feeling each other out.', 'The game has slowed to a lull.', 'Tidy possession, no end product.'];

const pick = (rng: Rng, arr: readonly string[]): string => arr[rng.int(0, arr.length - 1)];

function weightedPick(rng: Rng, pool: Pool): string | null {
  const total = pool.reduce((s, x) => s + x.weight, 0);
  if (total <= 0) return null;
  let r = rng.next() * total;
  for (const x of pool) { r -= x.weight; if (r <= 0) return x.playerId; }
  return pool[pool.length - 1].playerId;
}

function stat(state: LiveMatchState, playerId: string): PlayerMatchStat {
  let s = state.stats[playerId];
  if (!s) { s = { playerId, minutes: 0, goals: 0, assists: 0, shots: 0, rating: 6.3, yellow: false, red: false }; state.stats[playerId] = s; }
  return s;
}

function planAiSubs(rng: Rng, side: LiveSideState): AiSub[] {
  const bench = side.profile.bench;
  const n = Math.min(3, bench.length);
  if (n === 0) return [];
  const outfield = rng.shuffle(side.profile.starters.filter((id) => id !== side.profile.gkId));
  const minutes = [rng.int(58, 66), rng.int(67, 74), rng.int(75, 83)];
  const subs: AiSub[] = [];
  for (let i = 0; i < n && outfield[i]; i++) subs.push({ minute: minutes[i], offId: outfield[i], onId: bench[i].playerId });
  return subs;
}

function makeSide(clubId: string, isHome: boolean, profile: LineupProfile, managed: boolean, rng: Rng, formation?: string): LiveSideState {
  const side: LiveSideState = {
    clubId, isHome, formation, profile,
    scorers: profile.scorers.map((x) => ({ ...x })),
    creators: profile.creators.map((x) => ({ ...x })),
    onPitch: [...profile.starters],
    bench: profile.bench.map((b) => ({ ...b })),
    goals: 0, xg: 0, shots: 0, saves: 0, reds: 0, subsUsed: 0,
    aiSubs: [], managed, talkBoost: 1,
  };
  side.aiSubs = managed ? [] : planAiSubs(rng, side);
  return side;
}

export function createLiveMatch(opts: {
  matchId: string; competitionId: string; seasonId: string;
  homeClubId: string; awayClubId: string;
  homeProfile: LineupProfile; awayProfile: LineupProfile;
  managedSide: Side; seed: number; needsWinner?: boolean;
  homePenSkill?: number; awayPenSkill?: number;
  homeFormation?: string; awayFormation?: string;
}): { state: LiveMatchState; rng: Rng } {
  const rng = new Rng(opts.seed >>> 0);
  const state: LiveMatchState = {
    matchId: opts.matchId, competitionId: opts.competitionId, seasonId: opts.seasonId,
    homeClubId: opts.homeClubId, awayClubId: opts.awayClubId, seed: opts.seed,
    minute: 0, added1: 0, added2: 0, phase: 'PREMATCH',
    home: makeSide(opts.homeClubId, true, opts.homeProfile, opts.managedSide === 'home', rng, opts.homeFormation),
    away: makeSide(opts.awayClubId, false, opts.awayProfile, opts.managedSide === 'away', rng, opts.awayFormation),
    events: [], stats: {}, onMinuteOf: {}, offMinuteOf: {}, momentum: 0, lastTalk: null, finished: false,
    needsWinner: opts.needsWinner,
    homePenSkill: opts.homePenSkill, awayPenSkill: opts.awayPenSkill,
  };
  for (const id of [...state.home.onPitch, ...state.away.onPitch]) { stat(state, id); state.onMinuteOf[id] = 0; }
  return { state, rng };
}

/** Kick the match off (PREMATCH → FIRST_HALF). */
export function kickOff(state: LiveMatchState): void {
  if (state.phase !== 'PREMATCH') return;
  state.phase = 'FIRST_HALF';
  state.events.push({ minute: 0, type: 'KICKOFF', side: 'home', description: 'Kick-off!' });
}

/** Resume for the second half (HALF_TIME → SECOND_HALF). */
export function startSecondHalf(state: LiveMatchState): void {
  if (state.phase !== 'HALF_TIME') return;
  state.phase = 'SECOND_HALF';
  state.events.push({ minute: 45, type: 'KICKOFF', side: 'home', description: 'Second half under way.' });
}

const effAttack = (s: LiveSideState) => (s.profile.attack + 0.35 * s.profile.midfield + (s.isHome ? HOME_ADVANTAGE : 0)) * (1 - 0.07 * s.reds) * s.talkBoost;
const effDefense = (s: LiveSideState) => (s.profile.defense * 0.7 + s.profile.gk * 0.3 + 0.25 * s.profile.midfield) * (1 - 0.05 * s.reds);

function generateChance(state: LiveMatchState, rng: Rng, s: LiveSideState, o: LiveSideState): void {
  const sideKey: Side = s.isHome ? 'home' : 'away';
  const attackQuality = effAttack(s);
  const roll = rng.next();
  const xq = (roll > 0.92 ? rng.float(0.28, 0.55) : roll > 0.68 ? rng.float(0.1, 0.28) : rng.float(0.02, 0.1)) * s.profile.chanceQualityMod;
  s.xg += xq; s.shots++;
  const shooter = weightedPick(rng, s.scorers);
  if (shooter) stat(state, shooter).shots++;

  const finishMod = 1 + (attackQuality - 65) / 260;
  const gkMod = 1 + (o.profile.gk - 65) / 150;
  const pGoal = clamp(xq * finishMod / gkMod, 0.01, 0.95) as number;

  const swing = s.isHome ? 1 : -1;
  if (rng.chance(pGoal)) {
    s.goals++;
    const creators = s.creators.filter((c) => c.playerId !== shooter);
    const assist = rng.chance(0.72) ? weightedPick(rng, creators) ?? undefined : undefined;
    if (shooter) stat(state, shooter).goals++;
    if (assist) stat(state, assist).assists++;
    state.events.push({ minute: state.minute, type: 'GOAL', side: sideKey, playerId: shooter ?? undefined, assistPlayerId: assist, description: pick(rng, GOAL_PHRASES) });
    state.momentum = clamp(state.momentum + swing * 40, -100, 100) as number;
  } else if (xq > 0.28) {
    o.saves++;
    if (o.profile.gkId) stat(state, o.profile.gkId);
    const isSave = rng.chance(0.6);
    state.events.push({ minute: state.minute, type: isSave ? 'SAVE' : 'BIG_CHANCE', side: sideKey, playerId: shooter ?? undefined, description: isSave ? pick(rng, SAVE_PHRASES) : pick(rng, CHANCE_PHRASES) });
    state.momentum = clamp(state.momentum + swing * 20, -100, 100) as number;
  } else {
    state.events.push({ minute: state.minute, type: 'SHOT', side: sideKey, playerId: shooter ?? undefined, description: pick(rng, CHANCE_PHRASES) });
    state.momentum = clamp(state.momentum + swing * 10, -100, 100) as number;
  }
}

function maybeCard(state: LiveMatchState, rng: Rng, s: LiveSideState): void {
  const sideKey: Side = s.isHome ? 'home' : 'away';
  const yellowRate = (1.4 + (s.profile.aggression - 50) / 40) / 90; // per minute
  if (rng.chance(Math.max(0.004, yellowRate))) {
    const pid = weightedPick(rng, s.onPitch.map((id) => ({ playerId: id, weight: 1 })));
    if (!pid) return;
    const st = stat(state, pid);
    if (st.yellow && rng.chance(0.5)) {
      st.red = true; s.reds++;
      removeFromPitch(state, s, pid);
      state.events.push({ minute: state.minute, type: 'RED', side: sideKey, playerId: pid, description: 'Second yellow — off!' });
    } else if (!st.yellow) {
      st.yellow = true;
      state.events.push({ minute: state.minute, type: 'YELLOW', side: sideKey, playerId: pid, description: 'Booked.' });
    }
  }
  if (rng.chance(0.0004)) { // very rare straight red
    const pid = weightedPick(rng, s.onPitch.map((id) => ({ playerId: id, weight: 1 })));
    if (pid) {
      stat(state, pid).red = true; s.reds++;
      removeFromPitch(state, s, pid);
      state.events.push({ minute: state.minute, type: 'RED', side: sideKey, playerId: pid, description: 'Straight red — sent off!' });
    }
  }
}

function removeFromPitch(state: LiveMatchState, s: LiveSideState, pid: string): void {
  s.onPitch = s.onPitch.filter((id) => id !== pid);
  s.scorers = s.scorers.filter((x) => x.playerId !== pid);
  s.creators = s.creators.filter((x) => x.playerId !== pid);
  state.offMinuteOf[pid] = state.minute;
}

function applyDueAiSubs(state: LiveMatchState, s: LiveSideState): void {
  for (const sub of s.aiSubs) {
    if (sub.minute !== state.minute) continue;
    if (!s.onPitch.includes(sub.offId)) continue;
    const benchEntry = s.bench.find((b) => b.playerId === sub.onId);
    if (!benchEntry) continue;
    s.onPitch = s.onPitch.filter((id) => id !== sub.offId).concat(sub.onId);
    s.scorers = s.scorers.filter((x) => x.playerId !== sub.offId).concat({ playerId: sub.onId, weight: benchEntry.scorerWeight });
    s.creators = s.creators.filter((x) => x.playerId !== sub.offId).concat({ playerId: sub.onId, weight: benchEntry.creatorWeight });
    s.bench = s.bench.filter((b) => b.playerId !== sub.onId);
    s.subsUsed++;
    state.offMinuteOf[sub.offId] = state.minute;
    state.onMinuteOf[sub.onId] = state.minute;
    stat(state, sub.onId);
    state.events.push({ minute: state.minute, type: 'SUB', side: s.isHome ? 'home' : 'away', playerId: sub.onId, assistPlayerId: sub.offId, description: 'Substitution.' });
  }
}

function maybeAmbient(state: LiveMatchState, rng: Rng): void {
  if (!rng.chance(0.12)) return;
  const m = state.momentum;
  const line = m > 30 ? pick(rng, AMBIENT_HOME) : m < -30 ? pick(rng, AMBIENT_AWAY) : pick(rng, AMBIENT_NEUTRAL);
  state.events.push({ minute: state.minute, type: 'COMMENTARY', side: m >= 0 ? 'home' : 'away', description: line });
}

const halfEnd = (state: LiveMatchState) => 45 + state.added1;
const fullEnd = (state: LiveMatchState) => 90 + state.added2;

/** Advance the match by one minute, handling phase transitions. */
export function tickLiveMatch(state: LiveMatchState, rng: Rng): void {
  if (state.phase !== 'FIRST_HALF' && state.phase !== 'SECOND_HALF') return;

  // Set stoppage time as we reach the end of each half.
  if (state.phase === 'FIRST_HALF' && state.minute === 44 && state.added1 === 0) state.added1 = rng.int(0, 3);
  if (state.phase === 'SECOND_HALF' && state.minute === 89 && state.added2 === 0) state.added2 = rng.int(1, 5);

  state.minute++;
  const m = state.minute;

  applyDueAiSubs(state, state.home);
  applyDueAiSubs(state, state.away);

  for (const [s, o] of [[state.home, state.away], [state.away, state.home]] as const) {
    const lambda = clamp(9.6 + (effAttack(s) - effDefense(o)) * 0.18, 2.5, 20) as number;
    const perMinute = (lambda / 90) * s.profile.shotVolumeMod;
    if (rng.chance(perMinute)) generateChance(state, rng, s, o);
    maybeCard(state, rng, s);
  }
  maybeAmbient(state, rng);
  state.momentum = (state.momentum * 0.86) as number;

  if (state.phase === 'FIRST_HALF' && m >= halfEnd(state)) {
    state.phase = 'HALF_TIME';
    state.events.push({ minute: 45, type: 'HALFTIME', side: 'home', description: `Half-time: ${state.home.goals}-${state.away.goals}` });
  } else if (state.phase === 'SECOND_HALF' && m >= fullEnd(state)) {
    finalize(state, rng);
  }
}

function finalize(state: LiveMatchState, rng: Rng): void {
  const end = state.minute;
  const level = state.home.goals === state.away.goals;
  // Player ratings are settled at 90'; the shootout (if any) doesn't change them.
  ratePlayers(state, rng, end);
  if (state.needsWinner && level) {
    // A level knockout tie goes to penalties — the manager takes them from the UI.
    state.phase = 'SHOOTOUT';
    state.finished = false;
    state.shootout = { home: 0, away: 0, kicks: [], done: false, winner: null };
    state.events.push({ minute: 90, type: 'FULLTIME', side: 'home', description: `Full-time: ${state.home.goals}-${state.away.goals} — level, to penalties!` });
    return;
  }
  state.phase = 'FULL_TIME';
  state.finished = true;
  state.events.push({ minute: 90, type: 'FULLTIME', side: 'home', description: `Full-time: ${state.home.goals}-${state.away.goals}` });
}

function ratePlayers(state: LiveMatchState, rng: Rng, end: number): void {
  const rate = (s: LiveSideState, o: LiveSideState) => {
    const conceded = o.goals;
    const cleanSheet = conceded === 0;
    for (const pid of Object.keys(state.stats)) {
      if (!sideOwns(s, pid)) continue;
      const st = state.stats[pid];
      const on = state.onMinuteOf[pid] ?? 0;
      const off = state.offMinuteOf[pid] ?? end;
      st.minutes = Math.max(0, Math.min(90 + state.added2, off - on));
      let r = 6.3 + rng.normal(0, 0.3);
      r += st.goals * 0.85 + st.assists * 0.55;
      if (pid === s.profile.gkId) r += cleanSheet ? 0.8 : -conceded * 0.22 + s.saves * 0.12;
      else if (s.profile.defenderIds.includes(pid)) r += cleanSheet ? 0.4 : -conceded * 0.12;
      if (st.yellow) r -= 0.2;
      if (st.red) r -= 1.2;
      st.rating = Math.max(3.5, Math.min(10, Math.round(r * 10) / 10));
    }
  };
  rate(state.home, state.away);
  rate(state.away, state.home);
}

/**
 * Take one penalty in a shootout (alternating home/away, home first). Best of
 * five, then sudden death; resolves the tie and finishes the match once decided.
 */
export function tickShootout(state: LiveMatchState, rng: Rng): void {
  if (state.phase !== 'SHOOTOUT' || !state.shootout || state.shootout.done) return;
  const sh = state.shootout;
  const ht = sh.kicks.filter((k) => k.side === 'home').length;
  const at = sh.kicks.filter((k) => k.side === 'away').length;
  const side: Side = ht <= at ? 'home' : 'away'; // home kicks first each round
  const keeper = side === 'home' ? state.away : state.home;
  // The designated penalty taker's skill (falls back to the side's attack).
  const takerSkill = side === 'home'
    ? (state.homePenSkill ?? state.home.profile.attack)
    : (state.awayPenSkill ?? state.away.profile.attack);
  const p = clamp(0.72 + (takerSkill - keeper.profile.gk) / 300, 0.5, 0.95);
  const scored = rng.chance(p);
  sh.kicks.push({ side, scored });
  if (scored) { if (side === 'home') sh.home++; else sh.away++; }

  if (shootoutDecided(sh)) {
    sh.done = true;
    sh.winner = sh.home > sh.away ? 'home' : 'away';
    state.phase = 'FULL_TIME';
    state.finished = true;
    state.events.push({
      minute: 120, type: 'PENALTY', side: sh.winner,
      description: `Won on penalties ${sh.home}–${sh.away}`,
    });
  }
}

/** Whether the shootout has a decided winner. */
function shootoutDecided(sh: ShootoutState): boolean {
  const ht = sh.kicks.filter((k) => k.side === 'home').length;
  const at = sh.kicks.filter((k) => k.side === 'away').length;
  if (ht <= 5 || at <= 5) { // regulation five kicks each
    const hRem = Math.max(0, 5 - ht);
    const aRem = Math.max(0, 5 - at);
    if (sh.home > sh.away + aRem) return true;
    if (sh.away > sh.home + hRem) return true;
    return false;
  }
  // Sudden death: decided after an equal number of kicks with a difference.
  return ht === at && sh.home !== sh.away;
}

/** Which side a player belongs to (started, on the bench, or subbed on). */
function sideOwns(s: LiveSideState, pid: string): boolean {
  return s.profile.starters.includes(pid) || s.profile.bench.some((b) => b.playerId === pid) || s.onPitch.includes(pid);
}

/**
 * Apply a freshly-rebuilt profile for the managed side after the manager makes a
 * change (sub / formation / tactics). The store rebuilds the profile from the
 * live working lineup; we swap it in and resync the live pools + on-pitch XI.
 * When `sub` is provided, records the substitution event + minutes.
 */
export function applyManagerChange(
  state: LiveMatchState,
  side: Side,
  newProfile: LineupProfile,
  sub?: { offId: string; onId: string },
  formation?: string,
): void {
  const s = state[side];
  if (formation) s.formation = formation;
  s.profile = newProfile;
  s.scorers = newProfile.scorers.map((x) => ({ ...x }));
  s.creators = newProfile.creators.map((x) => ({ ...x }));
  s.onPitch = [...newProfile.starters];
  s.bench = newProfile.bench.map((b) => ({ ...b }));
  if (sub) {
    s.subsUsed++;
    state.offMinuteOf[sub.offId] = state.minute;
    state.onMinuteOf[sub.onId] = state.minute;
    stat(state, sub.onId);
    state.events.push({ minute: state.minute, type: 'SUB', side, playerId: sub.onId, assistPlayerId: sub.offId, description: 'Substitution.' });
  }
}

/**
 * Deliver a team talk to the managed side. Sets the side's talk-boost multiplier
 * for the rest of the match, swings momentum toward (or away from) them, and
 * records the dressing-room reaction. Returns the full result so the caller can
 * persist the squad morale/form deltas. `weAreFavourite` + squad professionalism
 * come from the caller (which has the Player data).
 */
export function applyTeamTalk(
  state: LiveMatchState,
  side: Side,
  tone: TalkTone,
  weAreFavourite: boolean,
  squadProfessionalism: number,
): TalkResult {
  const s = state[side];
  const o = side === 'home' ? state.away : state.home;
  const phase: TalkContext['phase'] = state.phase === 'PREMATCH' ? 'PRE' : 'HALF';
  const ctx: TalkContext = { phase, scoreDiff: s.goals - o.goals, weAreFavourite };
  const result = evaluateTeamTalk(tone, ctx, squadProfessionalism);
  s.talkBoost = result.talkBoost;
  state.momentum = clamp(state.momentum + (side === 'home' ? 1 : -1) * result.momentumSwing, -100, 100) as number;
  state.lastTalk = { message: result.message, reception: result.reception };
  return result;
}

/** Produce a batch-style outcome to commit once the match is finished. Ambient
 *  commentary lines are dropped so the stored match timeline stays clean. */
export function liveOutcome(state: LiveMatchState) {
  return {
    homeGoals: state.home.goals,
    awayGoals: state.away.goals,
    homeXg: Math.round(state.home.xg * 100) / 100,
    awayXg: Math.round(state.away.xg * 100) / 100,
    events: state.events.filter((e) => e.type !== 'COMMENTARY'),
    playerStats: Object.values(state.stats).filter((s) => s.minutes > 0 || s.goals > 0 || s.shots > 0 || s.yellow || s.red),
  };
}
