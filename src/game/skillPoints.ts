// ---------------------------------------------------------------------------
// Player Career — skill-point allocation at creation (§ Build your player). The
// human doesn't inherit preset attribute levels; he's given a pool of points and
// decides where they go. OVR emerges from the real weighting model (a weighted
// mean of the position's key attributes), so investing in your position's core
// skills raises your rating fast, while off-position points buy versatility at
// an OVR cost — a genuine specialise-vs-spread choice.
//
// Everything here is pure & deterministic. Budgets are *derived*, not guessed:
// a self-calibrating "recommended build" binary-searches an internal level so it
// lands exactly on the archetype's target OVR for any position (keepers, whose
// rating draws on fewer attributes, automatically need fewer points), and the
// budget is simply that build's cost — so archetypes always fit their billing.
// ---------------------------------------------------------------------------

import type { Attributes, AttributeKey, HiddenAttributes, Position } from '../types/attributes';
import { TECHNICAL_KEYS, MENTAL_KEYS, PHYSICAL_KEYS, GOALKEEPING_KEYS } from '../types/attributes';
import { overallAt, attributeWeight, flattenAttributes } from '../engine/ratings';
import { clamp } from '../engine/rng';

export const ATTR_FLOOR = 40;
export const ALL_ATTR_KEYS: AttributeKey[] = [...TECHNICAL_KEYS, ...MENTAL_KEYS, ...PHYSICAL_KEYS, ...GOALKEEPING_KEYS];

/** Marginal cost of the next point at a given value — steeper as it climbs, so
 *  spiking one attribute to the ceiling is deliberately expensive. */
export function pointCost(v: number): number {
  return v < 55 ? 1 : v < 65 ? 2 : v < 75 ? 3 : 4;
}
/** Total cost to raise an attribute from the floor up to `v`. */
export function costTo(v: number): number {
  let c = 0;
  for (let x = ATTR_FLOOR; x < v; x++) c += pointCost(x);
  return c;
}

/** Per-archetype ceiling on any single attribute at creation. */
const ARCHETYPE_CAP: Record<string, number> = {
  'Academy Graduate': 82, 'Prodigy': 85, 'Late Bloomer': 82, 'Street Baller': 84, 'Journeyman': 78,
};
export function attrCapFor(archetype: string): number { return ARCHETYPE_CAP[archetype] ?? 82; }

/** Per-archetype base target OVR (outfield); club reputation nudges it. */
const ARCHETYPE_BASE_OVR: Record<string, number> = {
  'Late Bloomer': 58, 'Journeyman': 61, 'Academy Graduate': 63, 'Street Baller': 63, 'Prodigy': 66,
};
/** The start-OVR an archetype aims for at a club of the given reputation. */
export function targetOvrFor(archetype: string, clubReputation: number): number {
  const base = ARCHETYPE_BASE_OVR[archetype] ?? 62;
  return clamp(Math.round(base + (clubReputation - 65) * 0.28), 50, 70);
}

const GROUP_OF: Record<string, 'technical' | 'mental' | 'physical' | 'goalkeeping'> = {};
for (const k of TECHNICAL_KEYS) GROUP_OF[k] = 'technical';
for (const k of MENTAL_KEYS) GROUP_OF[k] = 'mental';
for (const k of PHYSICAL_KEYS) GROUP_OF[k] = 'physical';
for (const k of GOALKEEPING_KEYS) GROUP_OF[k] = 'goalkeeping';

/** Every attribute at the floor — the blank slate the human builds from. */
export function floorAttributes(): Attributes {
  const out = { technical: {}, mental: {}, physical: {}, goalkeeping: {} } as unknown as Attributes;
  for (const k of ALL_ATTR_KEYS) (out[GROUP_OF[k]] as Record<string, number>)[k] = ATTR_FLOOR;
  return out;
}

/** Points spent to reach an allocation from the floor. */
export function pointsSpent(a: Attributes): number {
  const flat = flattenAttributes(a);
  let c = 0;
  for (const k of ALL_ATTR_KEYS) c += costTo(flat[k] ?? ATTR_FLOOR);
  return c;
}

/** OVR of an allocation at a position (the real weighting model). */
export function overallOf(a: Attributes, position: Position): number {
  return overallAt(a, position);
}

// The generator's role tiers: key attributes sit above the internal level, weak
// ones below — so a build looks like a real specialist, not a flat line.
function tierFor(w: number): number {
  return w >= 6 ? 3 : w >= 5 ? 2 : w >= 4 ? 1 : w >= 2 ? -6 : w >= 1 ? -16 : -30;
}

function buildAtLevel(position: Position, level: number, cap: number): Attributes {
  const out = floorAttributes();
  for (const k of ALL_ATTR_KEYS) {
    const w = attributeWeight(position, k);
    if (w > 0) (out[GROUP_OF[k]] as Record<string, number>)[k] = clamp(Math.round(level + tierFor(w)), ATTR_FLOOR, cap);
  }
  return out;
}

/**
 * A sensible, role-shaped allocation that lands on `targetOvr` at `position` —
 * found by binary-searching the internal level. This is both the default build
 * shown to the player and the yardstick the budget is derived from.
 */
export function recommendedBuild(position: Position, targetOvr: number, cap: number): Attributes {
  let lo = ATTR_FLOOR, hi = cap + 30, best = buildAtLevel(position, lo, cap);
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const b = buildAtLevel(position, mid, cap);
    if (overallAt(b, position) < targetOvr) lo = mid; else { hi = mid; best = b; }
  }
  return best;
}

/** The attribute-points budget for an archetype at a club — derived from the
 *  cost of the recommended build, plus a little slack to reshape freely. */
export function attrBudgetFor(archetype: string, position: Position, clubReputation: number): number {
  const target = targetOvrFor(archetype, clubReputation);
  const rec = recommendedBuild(position, target, attrCapFor(archetype));
  return Math.round(pointsSpent(rec) * 1.06);
}

/** Validate a candidate allocation against the pool + per-attribute cap. */
export function validateAllocation(
  a: Attributes, budget: number, cap: number,
): { ok: boolean; spent: number; remaining: number; overCap: AttributeKey[]; belowFloor: AttributeKey[] } {
  const flat = flattenAttributes(a);
  const overCap: AttributeKey[] = [];
  const belowFloor: AttributeKey[] = [];
  for (const k of ALL_ATTR_KEYS) {
    const v = flat[k] ?? ATTR_FLOOR;
    if (v > cap) overCap.push(k);
    if (v < ATTR_FLOOR) belowFloor.push(k);
  }
  const spent = pointsSpent(a);
  return { ok: spent <= budget && overCap.length === 0 && belowFloor.length === 0, spent, remaining: budget - spent, overCap, belowFloor };
}

// --- Mentality pool (hidden temperament) ------------------------------------

export const MENTALITY_FLOOR = 50;
export const MENTALITY_CAP = 90;
export const MENTALITY_BUDGET = 60; // points across the shaped hidden traits

/** The hidden traits the human can shape at creation (1 point = +1). */
export interface MentalityAlloc {
  consistency: number; // less match-to-match variance
  bigGame: number; // temperament on the big occasion
  professionalism: number; // faster development, steadier morale
  durability: number; // resistance to injury (maps to 100 − injuryProneness)
}

export function floorMentality(): MentalityAlloc {
  return { consistency: MENTALITY_FLOOR, bigGame: MENTALITY_FLOOR, professionalism: MENTALITY_FLOOR, durability: MENTALITY_FLOOR };
}
export function mentalitySpent(m: MentalityAlloc): number {
  return (m.consistency - MENTALITY_FLOOR) + (m.bigGame - MENTALITY_FLOOR) + (m.professionalism - MENTALITY_FLOOR) + (m.durability - MENTALITY_FLOOR);
}
export function mentalityValid(m: MentalityAlloc): boolean {
  const within = [m.consistency, m.bigGame, m.professionalism, m.durability].every((v) => v >= MENTALITY_FLOOR && v <= MENTALITY_CAP);
  return within && mentalitySpent(m) <= MENTALITY_BUDGET;
}

/** Fold the mentality choices into a full hidden-attribute block, keeping the
 *  generator's defaults for anything the player didn't shape. */
export function applyMentality(base: HiddenAttributes, m: MentalityAlloc): HiddenAttributes {
  return {
    ...base,
    consistency: m.consistency,
    bigGame: m.bigGame,
    professionalism: m.professionalism,
    injuryProneness: clamp(100 - m.durability, 5, 95),
  };
}
