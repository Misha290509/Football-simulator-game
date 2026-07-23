// ---------------------------------------------------------------------------
// Hybrid match engine (§7A). Pure & deterministic: models the match as a
// sequence of chances (xG-style), converts chances → shots → goals, and emits a
// minute-by-minute event timeline plus per-player ratings/stats. Substitutes
// come on during the match (minutes, ratings, late goal/assist attribution).
// No DOM, no I/O — runs identically on the main thread or in the sim worker.
// ---------------------------------------------------------------------------

import type {
  LineupProfile,
  MatchEvent,
  PlayerMatchStat,
} from '../types/match';
import { Rng } from './rng';

export interface MatchOutcome {
  homeGoals: number;
  awayGoals: number;
  homeXg: number;
  awayXg: number;
  events: MatchEvent[];
  playerStats: PlayerMatchStat[];
  weather?: Weather;
  referee?: string;
}

const HOME_ADVANTAGE = 9; // added to home attack quality

// --- Match environment: weather + referee (§ Match realism) ----------------
// Derived from a sub-seed so it doesn't perturb the base match RNG stream, then
// applied as small, symmetric modifiers. Deterministic and returned for display.

export type Weather = 'CLEAR' | 'RAIN' | 'WIND' | 'SNOW' | 'HOT';

export interface MatchEnv {
  weather: Weather;
  referee: string;
  strictness: number; // card-frequency multiplier
  shotVol: number;    // team shot-volume multiplier
  chanceQual: number; // chance-quality multiplier
}

const WEATHER_MODS: Record<Weather, { shotVol: number; chanceQual: number }> = {
  CLEAR: { shotVol: 1.0, chanceQual: 1.0 },
  RAIN: { shotVol: 1.02, chanceQual: 0.97 },
  WIND: { shotVol: 1.0, chanceQual: 0.96 },
  SNOW: { shotVol: 0.97, chanceQual: 0.95 },
  HOT: { shotVol: 0.97, chanceQual: 1.0 },
};

const REFEREE_NAMES = [
  'Referee Vega', 'Referee Björk', 'Referee Costa', 'Referee Almeida', 'Referee Novák',
  'Referee Marsh', 'Referee Ozan', 'Referee Diallo', 'Referee Renner', 'Referee Sato',
];

/** Roll the (deterministic) weather + referee for a match from its seed. */
export function rollMatchEnv(seed: number): MatchEnv {
  const r = new Rng((seed ^ 0x5eed_c0de) >>> 0);
  const w = r.next();
  const weather: Weather = w < 0.62 ? 'CLEAR' : w < 0.78 ? 'RAIN' : w < 0.88 ? 'WIND' : w < 0.94 ? 'HOT' : 'SNOW';
  const referee = REFEREE_NAMES[r.int(0, REFEREE_NAMES.length - 1)];
  const strictness = 0.72 + r.float(0, 0.62); // 0.72 … 1.34
  const wm = WEATHER_MODS[weather];
  return { weather, referee, strictness, shotVol: wm.shotVol, chanceQual: wm.chanceQual };
}

interface Sub { minute: number; offId: string; onId: string }
type Pool = { playerId: string; weight: number }[];

function poisson(rng: Rng, lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do { k++; p *= rng.next(); } while (p > L);
  return k - 1;
}

function weightedPick(rng: Rng, pool: Pool): string | null {
  const total = pool.reduce((s, x) => s + x.weight, 0);
  if (total <= 0) return null;
  let r = rng.next() * total;
  for (const x of pool) {
    r -= x.weight;
    if (r <= 0) return x.playerId;
  }
  return pool[pool.length - 1].playerId;
}

/** Up to 3 tactical substitutions, best bench player on for an outfield starter. */
function planSubs(rng: Rng, profile: LineupProfile): Sub[] {
  const bench = profile.bench;
  const n = Math.min(3, bench.length);
  if (n === 0) return [];
  const outfield = rng.shuffle(profile.starters.filter((id) => id !== profile.gkId));
  const minutes = [rng.int(58, 66), rng.int(67, 74), rng.int(75, 83)];
  const subs: Sub[] = [];
  for (let i = 0; i < n && outfield[i]; i++) {
    subs.push({ minute: minutes[i], offId: outfield[i], onId: bench[i].playerId });
  }
  return subs;
}

/** The pool active at a given minute: starters minus those already subbed off,
 *  plus those already subbed on (with their bench weights). */
function activePool(base: Pool, subs: Sub[], benchW: Map<string, number>, minute: number): Pool {
  if (subs.length === 0) return base;
  const off = new Set<string>();
  const add: Pool = [];
  for (const s of subs) {
    if (s.minute <= minute) {
      off.add(s.offId);
      add.push({ playerId: s.onId, weight: benchW.get(s.onId) ?? 0.1 });
    }
  }
  if (off.size === 0) return base;
  return base.filter((x) => !off.has(x.playerId)).concat(add);
}

interface SideContext {
  profile: LineupProfile;
  isHome: boolean;
  subs: Sub[];
  benchScorer: Map<string, number>;
  benchCreator: Map<string, number>;
  goals: number;
  xg: number;
  saves: number;
}

function simulateSide(
  rng: Rng,
  side: SideContext,
  opp: SideContext,
  events: MatchEvent[],
  statMap: Map<string, PlayerMatchStat>,
  env: MatchEnv,
): void {
  const homeBonus = side.isHome ? HOME_ADVANTAGE : 0;
  const attackQuality = side.profile.attack + 0.35 * side.profile.midfield + homeBonus;
  const defQuality =
    opp.profile.defense * 0.7 + opp.profile.gk * 0.3 + 0.25 * opp.profile.midfield;

  const diff = attackQuality - defQuality;
  // A wider spread on squad strength so the better side dominates the chances —
  // upsets still happen, but weak teams shouldn't win leagues. Weather nudges
  // the volume/quality of chances.
  const shotsLambda =
    Math.max(2.0, Math.min(22, 9.6 + diff * 0.30)) * side.profile.shotVolumeMod * env.shotVol;
  const numShots = poisson(rng, shotsLambda);

  const sideKey: 'home' | 'away' = side.isHome ? 'home' : 'away';
  const finishMod = 1 + (attackQuality - 65) / 170;
  const gkMod = 1 + (opp.profile.gk - 65) / 150;

  for (let i = 0; i < numShots; i++) {
    const roll = rng.next();
    const xq =
      (roll > 0.92
        ? rng.float(0.28, 0.55)
        : roll > 0.68
          ? rng.float(0.1, 0.28)
          : rng.float(0.02, 0.1)) * side.profile.chanceQualityMod * env.chanceQual;
    side.xg += xq;

    const minute = rng.int(1, 90);
    const scorers = activePool(side.profile.scorers, side.subs, side.benchScorer, minute);
    const shooter = weightedPick(rng, scorers);
    if (shooter) bumpStat(statMap, shooter).shots++;

    const pGoal = Math.max(0.01, Math.min(0.95, (xq * finishMod) / gkMod));

    if (rng.chance(pGoal)) {
      side.goals++;
      const creators = activePool(side.profile.creators, side.subs, side.benchCreator, minute)
        .filter((c) => c.playerId !== shooter);
      const assist = rng.chance(0.72) ? weightedPick(rng, creators) ?? undefined : undefined;
      if (shooter) bumpStat(statMap, shooter).goals++;
      if (assist) bumpStat(statMap, assist).assists++;
      events.push({ minute, type: 'GOAL', side: sideKey, playerId: shooter ?? undefined, assistPlayerId: assist, description: 'Goal' });
    } else if (xq > 0.3) {
      opp.saves++;
      const isSave = rng.chance(0.6);
      // Credit the goalkeeper with the save (a missed "big chance" is not one).
      if (opp.profile.gkId) {
        const gs = bumpStat(statMap, opp.profile.gkId);
        if (isSave) gs.saves = (gs.saves ?? 0) + 1;
      }
      events.push({
        minute,
        type: isSave ? 'SAVE' : 'BIG_CHANCE',
        side: sideKey,
        playerId: shooter ?? undefined,
        description: rng.chance(0.6) ? 'Big save' : 'Big chance missed',
      });
    }
  }
}

function bumpStat(map: Map<string, PlayerMatchStat>, playerId: string): PlayerMatchStat {
  let s = map.get(playerId);
  if (!s) {
    s = { playerId, minutes: 90, goals: 0, assists: 0, shots: 0, rating: 6.3, yellow: false, red: false };
    map.set(playerId, s);
  }
  return s;
}

function simulateCards(
  rng: Rng,
  profile: LineupProfile,
  sideKey: 'home' | 'away',
  events: MatchEvent[],
  statMap: Map<string, PlayerMatchStat>,
  strictness: number,
): void {
  const yellowLambda = (1.4 + (profile.aggression - 50) / 40) * strictness;
  const yellows = poisson(rng, Math.max(0.3, yellowLambda));
  for (let i = 0; i < yellows; i++) {
    const pid = weightedPick(rng, profile.starters.map((id) => ({ playerId: id, weight: 1 })));
    if (!pid) continue;
    const s = bumpStat(statMap, pid);
    const minute = rng.int(10, 90);
    if (s.yellow && rng.chance(0.5)) {
      s.red = true;
      events.push({ minute, type: 'RED', side: sideKey, playerId: pid, description: 'Second yellow' });
    } else {
      s.yellow = true;
      events.push({ minute, type: 'YELLOW', side: sideKey, playerId: pid, description: 'Yellow card' });
    }
  }
  if (rng.chance(0.03)) {
    const pid = weightedPick(rng, profile.starters.map((id) => ({ playerId: id, weight: 1 })));
    if (pid) {
      bumpStat(statMap, pid).red = true;
      events.push({ minute: rng.int(20, 90), type: 'RED', side: sideKey, playerId: pid, description: 'Sent off' });
    }
  }
}

/** Minutes played per player given the substitutions. */
function minutesFor(profile: LineupProfile, subs: Sub[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const id of profile.starters) m.set(id, 90);
  for (const s of subs) {
    m.set(s.offId, s.minute);
    m.set(s.onId, 90 - s.minute);
  }
  return m;
}

function finalizeRatings(home: SideContext, away: SideContext, statMap: Map<string, PlayerMatchStat>, rng: Rng): void {
  const rate = (side: SideContext, opp: SideContext) => {
    const conceded = opp.goals;
    const cleanSheet = conceded === 0;
    const mins = minutesFor(side.profile, side.subs);
    for (const [pid, minutes] of mins) {
      const s = bumpStat(statMap, pid);
      s.minutes = minutes;
      let r = 6.3 + rng.normal(0, 0.35);
      r += s.goals * 0.85 + s.assists * 0.55;
      if (pid === side.profile.gkId) {
        r += cleanSheet ? 0.8 : -conceded * 0.22 + side.saves * 0.12;
      } else if (side.profile.defenderIds.includes(pid)) {
        r += cleanSheet ? 0.4 : -conceded * 0.12;
      }
      if (s.yellow) r -= 0.2;
      if (s.red) r -= 1.2;
      s.rating = Math.max(3.5, Math.min(10, Math.round(r * 10) / 10));
    }
  };
  rate(home, away);
  rate(away, home);
}

function benchMaps(profile: LineupProfile): { scorer: Map<string, number>; creator: Map<string, number> } {
  const scorer = new Map<string, number>();
  const creator = new Map<string, number>();
  for (const b of profile.bench) {
    scorer.set(b.playerId, b.scorerWeight);
    creator.set(b.playerId, b.creatorWeight);
  }
  return { scorer, creator };
}

export function simulateMatch(
  homeProfile: LineupProfile,
  awayProfile: LineupProfile,
  seed: number,
): MatchOutcome {
  const rng = new Rng(seed);
  const env = rollMatchEnv(seed);
  const homeSubs = planSubs(rng, homeProfile);
  const awaySubs = planSubs(rng, awayProfile);
  const hb = benchMaps(homeProfile);
  const ab = benchMaps(awayProfile);

  const home: SideContext = { profile: homeProfile, isHome: true, subs: homeSubs, benchScorer: hb.scorer, benchCreator: hb.creator, goals: 0, xg: 0, saves: 0 };
  const away: SideContext = { profile: awayProfile, isHome: false, subs: awaySubs, benchScorer: ab.scorer, benchCreator: ab.creator, goals: 0, xg: 0, saves: 0 };

  const events: MatchEvent[] = [];
  const statMap = new Map<string, PlayerMatchStat>();

  events.push({ minute: 0, type: 'KICKOFF', side: 'home', description: 'Kick-off' });

  simulateSide(rng, home, away, events, statMap, env);
  simulateSide(rng, away, home, events, statMap, env);
  simulateCards(rng, homeProfile, 'home', events, statMap, env.strictness);
  simulateCards(rng, awayProfile, 'away', events, statMap, env.strictness);

  for (const s of homeSubs) events.push({ minute: s.minute, type: 'SUB', side: 'home', playerId: s.onId, assistPlayerId: s.offId, description: 'Substitution' });
  for (const s of awaySubs) events.push({ minute: s.minute, type: 'SUB', side: 'away', playerId: s.onId, assistPlayerId: s.offId, description: 'Substitution' });

  finalizeRatings(home, away, statMap, rng);

  events.push({ minute: 45, type: 'HALFTIME', side: 'home', description: 'Half-time' });
  events.push({ minute: 90, type: 'FULLTIME', side: 'home', description: 'Full-time' });
  events.sort((a, b) => a.minute - b.minute || rank(a.type) - rank(b.type));

  return {
    homeGoals: home.goals,
    awayGoals: away.goals,
    homeXg: Math.round(home.xg * 100) / 100,
    awayXg: Math.round(away.xg * 100) / 100,
    events,
    playerStats: [...statMap.values()],
    weather: env.weather,
    referee: env.referee,
  };
}

const ORDER: Record<string, number> = { KICKOFF: 0, HALFTIME: 1, FULLTIME: 9 };
const rank = (t: string) => ORDER[t] ?? 5;
