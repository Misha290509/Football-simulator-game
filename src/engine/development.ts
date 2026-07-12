// ---------------------------------------------------------------------------
// Aging, development & retirement (§6, §11-M3). Pure & deterministic and
// performance-driven: players improve based on how they actually played (match
// ratings, goals/assists, clean sheets, trophies & awards). The young develop
// fastest but it's hard-earned; primes barely move; veterans usually decline.
// ---------------------------------------------------------------------------

import type { Player } from '../types/player';
import type { Position, Attributes } from '../types/attributes';
import { POSITION_GROUP } from '../types/attributes';
import { Rng, clamp } from './rng';
import { overallAt, bestOverall } from './ratings';
import { generatePlayer, reputationToAbility, DEFAULT_RATING_CAP } from './generator';
import { estimateValue } from './valuation';

const PHYSICAL_DECLINE = ['acceleration', 'sprintSpeed', 'agility', 'balance'];

/** Attribute keys emphasised by each individual-training focus. */
const FOCUS_KEYS: Record<string, string[]> = {
  SHOOTING: ['finishing', 'shotPower', 'longShots', 'volleys', 'positioning', 'penalties'],
  PASSING: ['shortPassing', 'longPassing', 'vision', 'crossing', 'curve', 'fkAccuracy'],
  DRIBBLING: ['dribbling', 'ballControl', 'agility', 'balance'],
  DEFENDING: ['marking', 'standingTackle', 'slidingTackle', 'interceptions', 'aggression'],
  PHYSICAL: ['acceleration', 'sprintSpeed', 'stamina', 'strength', 'jumping'],
  GOALKEEPING: ['gkDiving', 'gkHandling', 'gkKicking', 'gkPositioning', 'gkReflexes'],
};

/** A player's aggregated output for the season just finished. */
export interface SeasonPerf {
  minutes: number;
  avgRating: number; // 0 if didn't feature
  goals: number;
  assists: number;
  cleanSheets: number;
  appearances: number;
}

export interface DevelopOpts {
  growthFactor?: number; // coaching × training × focus (≈0.85–1.4)
  ratingCap?: number;
  perf?: SeasonPerf;
  trophies?: number; // club honours won this season
  awards?: number; // individual awards won this season
}

/** Flatten every visible attribute to the integer the UI displays. */
function flattenRounded(a: Attributes): Record<string, number> {
  const out: Record<string, number> = {};
  for (const g of [a.technical, a.mental, a.physical, a.goalkeeping]) {
    for (const k of Object.keys(g)) out[k] = Math.round(g[k]);
  }
  return out;
}

/** Apply an OVR-scale delta to attributes, front-loading physical decline. */
function applyDelta(player: Player, deltaOvr: number, cap: number): void {
  const a = player.attributes;
  if (deltaOvr >= 0) {
    // An individual-training focus channels growth: emphasised attributes gain
    // ~60% more, the rest slightly less — shaping the player, not inflating him.
    const focus = player.training?.focus ? new Set(FOCUS_KEYS[player.training.focus] ?? []) : null;
    for (const g of [a.technical, a.mental, a.physical, a.goalkeeping]) {
      for (const k of Object.keys(g)) {
        const mult = focus ? (focus.has(k) ? 1.6 : 0.85) : 1;
        g[k] = clamp(g[k] + deltaOvr * mult, 1, cap);
      }
    }
  } else {
    const d = -deltaOvr;
    for (const k of Object.keys(a.physical)) {
      const mult = PHYSICAL_DECLINE.includes(k) ? 1.7 : 1.0;
      a.physical[k] = clamp(a.physical[k] - d * mult);
    }
    for (const k of Object.keys(a.technical)) a.technical[k] = clamp(a.technical[k] - d * 0.5);
    for (const k of Object.keys(a.mental)) a.mental[k] = clamp(a.mental[k] - d * 0.35);
    for (const k of Object.keys(a.goalkeeping)) a.goalkeeping[k] = clamp(a.goalkeeping[k] - d * 0.4);
  }
}

/**
 * A performance score (roughly -0.5 … 2.5). ~0.5 is an unremarkable season,
 * 1.0+ is strong, negative is poor. Gated by minutes — you must play to grow.
 */
function performanceScore(position: Position, perf: SeasonPerf | undefined, trophies: number, awards: number): number {
  if (!perf || perf.minutes <= 0) return 0; // didn't play → no development signal
  if (perf.minutes < 400) return 0.2; // fringe minutes, minimal growth

  const per90 = (x: number) => (x * 90) / Math.max(perf.minutes, 1);
  let ps = (perf.avgRating - 6.5) * 1.0; // 6.5→0, 7.5→1.0, 8.0→1.5

  const grp = POSITION_GROUP[position];
  if (grp === 'ATT') ps += per90(perf.goals) * 0.5 + per90(perf.assists) * 0.3;
  else if (grp === 'MID') ps += per90(perf.goals) * 0.35 + per90(perf.assists) * 0.35;
  else ps += (perf.cleanSheets / Math.max(perf.appearances, 1)) * 0.6;

  ps += trophies * 0.12 + awards * 0.25;

  const minFactor = Math.min(1, perf.minutes / 2000);
  ps *= 0.5 + 0.5 * minFactor;
  return clamp(ps, -0.5, 2.5);
}

export function developPlayer(
  player: Player,
  toYear: number,
  rng: Rng,
  opts: DevelopOpts = {},
): Player {
  const p: Player = structuredClone(player);
  const cap = opts.ratingCap ?? DEFAULT_RATING_CAP;
  const gf = opts.growthFactor ?? 1;
  const age = toYear - p.born.year;
  const room = Math.max(0, p.potential - p.overall);
  const ps = performanceScore(p.position, opts.perf, opts.trophies ?? 0, opts.awards ?? 0);
  const pro = 0.8 + (p.hidden.professionalism / 100) * 0.4;

  // Young players develop toward potential from training (always) plus a bonus
  // for strong performances; the older they get the more it's performance-only.
  let delta: number;
  if (age <= 21) {
    const train = room * 0.11 * gf * pro; // baseline from coaching/training
    const earned = room * 0.12 * Math.max(0, ps) * gf; // bonus for playing well
    delta = train + earned + (ps - 0.7) * 0.3;
  } else if (age <= 26) {
    const train = room * 0.06 * gf * pro;
    const earned = room * 0.08 * Math.max(0, ps) * gf;
    delta = train + earned + (ps - 0.8) * 0.3;
  } else if (age <= 31) {
    delta = (ps - 0.9) * 1.1; // plateau; a great year nudges up, poor one down
  } else {
    delta = -(1.6 + (age - 32) * 0.45) + ps * 2.2; // decline unless excellent
  }
  delta += rng.normal(0, 0.5);

  // Snapshot the displayed integers before development so we can report exactly
  // the movement the player will see on the squad screen.
  const ovrFrom = p.overall;
  const beforeAttrs = flattenRounded(p.attributes);

  applyDelta(p, delta, cap);

  const primaryOvr = overallAt(p.attributes, p.position);
  const best = bestOverall(p.attributes, p.positions);
  p.overall = Math.min(cap, Math.max(primaryOvr, best.ovr));
  // A young player who overachieves can lift his ceiling (never lowers it).
  if (age <= 23 && p.overall > p.potential) p.potential = Math.min(cap, p.overall);

  p.value = estimateValue(p.overall, age, p.potential);
  p.developmentLog = [...p.developmentLog, { year: toYear, ovr: p.overall, pot: p.potential }];

  // Record the season's movement (rounded to displayed integers) for the squad
  // view: the OVR swing plus every individual attribute that actually changed.
  const afterAttrs = flattenRounded(p.attributes);
  const attrChanges: Record<string, number> = {};
  for (const k of Object.keys(afterAttrs)) {
    const d = afterAttrs[k] - beforeAttrs[k];
    if (d !== 0) attrChanges[k] = d;
  }
  p.lastSeasonChange = { year: toYear, ovrFrom, ovrTo: p.overall, attrs: attrChanges };

  // Pre-season reset of transient state.
  p.form = 0;
  p.fitness = 100;
  p.fatigueLoad = 0;
  p.cards = { yellow: 0, red: 0, suspendedFor: p.cards.suspendedFor };
  return p;
}

// Re-exported so existing importers keep working; the curve lives in valuation.ts.
export { estimateValue };

export function shouldRetire(player: Player, toYear: number, rng: Rng): boolean {
  const age = toYear - player.born.year;
  if (age < 33) return false;
  if (age >= 40) return true;
  const base = (age - 32) * 0.13;
  const lowOvrBoost = player.overall < 60 ? 0.3 : player.overall < 67 ? 0.12 : 0;
  return rng.chance(Math.min(0.96, base + lowOvrBoost));
}

const YOUTH_POSITIONS: Position[] = [
  'GK', 'LB', 'LCB', 'RCB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST',
];

/** Annual youth intake (§8). Count & quality scale with academy & reputation. */
export function generateYouthIntake(
  clubId: string,
  reputation: number,
  nationality: string,
  toYear: number,
  rng: Rng,
  academyLevel = 2,
  ratingCap = DEFAULT_RATING_CAP,
): Player[] {
  let count = 1 + (reputation > 72 ? 2 : reputation > 56 ? 1 : 0);
  if (academyLevel >= 4) count += 1;
  if (rng.chance(0.4)) count += 1;

  // A prospect's CEILING mirrors the club's level (a big academy breeds future
  // stars); their current ability is far below it — they're projects.
  const potBase = reputationToAbility(reputation) + academyLevel * 1.8;

  const intake: Player[] = [];
  for (let i = 0; i < count; i++) {
    const eliteSpike = reputation > 81 && rng.chance((reputation - 81) / 30) ? rng.int(5, 12) : 0;
    const potential = clamp(Math.round(potBase + rng.normal(0, 5) + eliteSpike), 45, ratingCap);
    const target = clamp(potential - rng.int(14, 28), 28, potential - 5);
    const youth = generatePlayer({
      rng,
      currentYear: toYear,
      target,
      position: rng.pick(YOUTH_POSITIONS),
      ageRange: [16, 18],
      nationality,
      ratingCap,
      squadRole: 'PROSPECT',
    });
    youth.potential = Math.max(youth.overall + 3, potential);
    youth.developmentLog = [{ year: toYear, ovr: youth.overall, pot: youth.potential }];
    youth.contract.clubId = clubId;
    youth.contract.wage = Math.round((youth.overall * 60) / 5) * 5;
    youth.contract.expiresYear = toYear + rng.int(2, 4);
    intake.push(youth);
  }
  return intake;
}
