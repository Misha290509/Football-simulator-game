// ---------------------------------------------------------------------------
// Fictional fallback generator (§9, §11-M0). Produces players/squads when the
// dataset omits them and creates future youth intakes within a save. Pure &
// deterministic: same Rng + inputs → identical output.
// ---------------------------------------------------------------------------

import type {
  Attributes,
  AttributeKey,
  HiddenAttributes,
  Position,
} from '../types/attributes';
import {
  TECHNICAL_KEYS, MENTAL_KEYS, PHYSICAL_KEYS, GOALKEEPING_KEYS,
} from '../types/attributes';
import type { Foot, Player, SquadRole } from '../types/player';
import { Rng, clamp } from './rng';
import { overallAt, bestOverall, attributeWeight, GK_KEYS } from './ratings';
import { marketWage } from './finances';
import { FIRST_NAMES, LAST_NAMES } from '../data/names';

/** Default rating ceiling if a save doesn't specify one. */
export const DEFAULT_RATING_CAP = 90;

const GK_SET = new Set<string>(GK_KEYS);

let _counter = 0;
/** Stable-ish unique id; the seed prefix keeps saves distinguishable. */
function newId(prefix: string): string {
  _counter += 1;
  return `${prefix}_${_counter.toString(36)}_${Date.now().toString(36)}`;
}

/** Reset the id counter (used by tests / harness for determinism). */
export function resetIdCounter(): void {
  _counter = 0;
}

const OUTFIELD: Position[] = [
  'LB', 'LCB', 'RCB', 'RB', 'CDM', 'CM', 'LM', 'RM', 'CAM', 'LW', 'RW', 'ST',
];

/**
 * Synthesize role-specialized attributes around a target overall. A position's
 * key attributes land near the target; weakly/irrelevant ones drop well below,
 * so a player is genuinely poor out of position (a striker has low tackling/
 * marking/defensive IQ → a low centre-back rating).
 */
function makeAttributes(rng: Rng, target: number, position: Position, cap: number): Attributes {
  const isGk = position === 'GK';

  // Tier offset from the attribute's weight for this position. Key attributes
  // land at/above the target so a player's OVR tracks the target closely.
  const tierFor = (w: number): number =>
    w >= 6 ? 3 : w >= 5 ? 2 : w >= 4 ? 1 : w >= 2 ? -6 : w >= 1 ? -16 : -30;

  const valueFor = (key: AttributeKey): number => {
    const gkKey = GK_SET.has(key);
    if (gkKey && !isGk) return rng.int(12, 30); // outfielders can't keep goal
    if (!gkKey && isGk) return rng.int(20, 40); // keepers have weak outfield skills
    const w = attributeWeight(position, key);
    const v = rng.normal(target + tierFor(w), 5);
    return clamp(Math.round(v), 8, cap);
  };

  const build = (keys: AttributeKey[]) => {
    const out: Record<string, number> = {};
    for (const k of keys) out[k] = valueFor(k);
    return out;
  };

  return {
    technical: build(TECHNICAL_KEYS) as Attributes['technical'],
    mental: build(MENTAL_KEYS) as Attributes['mental'],
    physical: build(PHYSICAL_KEYS) as Attributes['physical'],
    goalkeeping: build(GOALKEEPING_KEYS) as Attributes['goalkeeping'],
  };
}

function makeHidden(rng: Rng): HiddenAttributes {
  return {
    injuryProneness: rng.int(10, 80),
    consistency: rng.int(30, 95),
    bigGame: rng.int(20, 95),
    ambition: rng.int(30, 95),
    professionalism: rng.int(30, 95),
    versatility: rng.int(20, 90),
  };
}

function estimateValue(ovr: number, age: number, potential: number): number {
  // Smooth exponential in OVR, discounted for age, premium for upside.
  const baseline = Math.pow(Math.max(0, ovr - 40) / 10, 3.2) * 90_000;
  const ageFactor =
    age <= 23 ? 1.25 : age <= 27 ? 1.0 : age <= 30 ? 0.7 : age <= 33 ? 0.4 : 0.18;
  const potentialPremium = 1 + Math.max(0, potential - ovr) * 0.03;
  return Math.round((baseline * ageFactor * potentialPremium) / 10_000) * 10_000;
}

export interface GeneratePlayerOpts {
  rng: Rng;
  currentYear: number;
  /** Target overall rating (derive from club reputation + role). */
  target: number;
  position: Position;
  ageRange?: [number, number];
  nationality?: string;
  squadRole?: SquadRole;
  /** Per-save rating ceiling (≈90–91). */
  ratingCap?: number;
}

export function generatePlayer(opts: GeneratePlayerOpts): Player {
  const { rng, currentYear, target, position } = opts;
  const cap = opts.ratingCap ?? DEFAULT_RATING_CAP;
  const [minAge, maxAge] = opts.ageRange ?? [17, 34];
  const age = rng.int(minAge, maxAge);
  const bornYear = currentYear - age;

  const attrs = makeAttributes(rng, Math.min(target, cap), position, cap);
  const hidden = makeHidden(rng);

  // Secondary positions: same group neighbors, gated by versatility.
  const positions: Position[] = [position];
  if (position !== 'GK' && rng.chance(hidden.versatility / 140)) {
    const alt = rng.pick(OUTFIELD.filter((p) => p !== position));
    positions.push(alt);
  }

  const primaryOvr = overallAt(attrs, position);
  const best = bestOverall(attrs, positions);
  const overall = Math.min(cap, Math.max(primaryOvr, best.ovr));

  // Younger players have more growth headroom toward potential (capped).
  const headroom =
    age <= 19 ? rng.int(8, 20) : age <= 23 ? rng.int(4, 12) : age <= 27 ? rng.int(0, 5) : 0;
  const potential = Math.min(cap, clamp(overall + headroom));

  const foot: Foot = rng.chance(0.12) ? 'B' : rng.chance(0.7) ? 'R' : 'L';
  const first = rng.pick(FIRST_NAMES);
  const last = rng.pick(LAST_NAMES);

  return {
    id: newId('p'),
    name: { first, last },
    nationality: opts.nationality ?? 'XX',
    born: { year: bornYear },
    position,
    positions,
    preferredFoot: foot,
    height_cm: position === 'GK' ? rng.int(186, 198) : rng.int(168, 192),
    weight_kg: rng.int(64, 88),
    attributes: attrs,
    hidden,
    potential,
    overall,
    form: 0,
    morale: rng.int(55, 85),
    ego: clamp(Math.round(40 + (hidden.ambition - 50) * 0.6), 15, 90),
    fitness: rng.int(85, 100),
    fatigueLoad: 0,
    injury: null,
    cards: { yellow: 0, red: 0, suspendedFor: 0 },
    contract: {
      clubId: null,
      wage: 0,
      startYear: currentYear,
      expiresYear: currentYear + rng.int(1, 5),
      signingBonus: 0,
      releaseClause: null,
      bonuses: [],
    },
    value: estimateValue(overall, age, potential),
    squadRole: opts.squadRole ?? 'ROTATION',
    stats: [],
    awards: [],
    developmentLog: [{ year: currentYear, ovr: overall, pot: potential }],
    isReal: false,
  };
}

/** Position blueprint for a balanced ~25-man squad. */
const SQUAD_TEMPLATE: { position: Position; count: number }[] = [
  { position: 'GK', count: 3 },
  { position: 'LCB', count: 2 },
  { position: 'RCB', count: 2 },
  { position: 'LB', count: 2 },
  { position: 'RB', count: 2 },
  { position: 'CDM', count: 2 },
  { position: 'CM', count: 3 },
  { position: 'LM', count: 1 },
  { position: 'RM', count: 1 },
  { position: 'CAM', count: 2 },
  { position: 'LW', count: 1 },
  { position: 'RW', count: 1 },
  { position: 'ST', count: 3 },
];

/**
 * Map a club reputation (0–100) to an average squad target rating. Deliberately
 * low so most players sit in the 60s–low 70s, leaving room to develop; only the
 * very top clubs trend toward the low 80s.
 */
export function reputationToAbility(reputation: number): number {
  return clamp(41 + reputation * 0.40, 34, 83);
}

export interface GenerateSquadOpts {
  rng: Rng;
  currentYear: number;
  reputation: number;
  clubId: string;
  nationality: string;
  ratingCap?: number;
}

export function generateSquad(opts: GenerateSquadOpts): Player[] {
  const { rng, currentYear, reputation, clubId, nationality } = opts;
  const cap = opts.ratingCap ?? DEFAULT_RATING_CAP;
  const ability = reputationToAbility(reputation);
  const players: Player[] = [];

  for (const slot of SQUAD_TEMPLATE) {
    for (let i = 0; i < slot.count; i++) {
      // Starters stronger than backups within the slot.
      let tierBonus = i === 0 ? rng.int(2, 6) : i === 1 ? 0 : -rng.int(3, 9);
      // Rare elite spike: a star at a big club can be world class.
      if (i === 0 && reputation > 81 && rng.chance((reputation - 81) / 34)) {
        tierBonus += rng.int(6, 13);
      }
      const p = generatePlayer({
        rng,
        currentYear,
        target: clamp(ability + tierBonus + rng.normal(0, 3)),
        position: slot.position,
        nationality: rng.chance(0.55) ? nationality : 'XX',
        ratingCap: cap,
        squadRole: i === 0 ? 'FIRST' : i === 1 ? 'ROTATION' : ('BACKUP' as SquadRole),
      });
      p.contract.clubId = clubId;
      p.contract.wage = marketWage(p.overall);
      players.push(p);
    }
  }

  return players;
}
