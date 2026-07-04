// ---------------------------------------------------------------------------
// Overall (OVR) computed per position via tunable weighting tables (§6).
// The same player yields a different OVR at different positions.
// ---------------------------------------------------------------------------

import type { Attributes, AttributeKey, Position } from '../types/attributes';
import { clamp } from './rng';

/** Flatten the grouped attributes into a single key→value lookup. */
export function flattenAttributes(a: Attributes): Record<AttributeKey, number> {
  return {
    ...a.technical,
    ...a.mental,
    ...a.physical,
    ...a.goalkeeping,
  };
}

type WeightTable = Partial<Record<AttributeKey, number>>;

// Weights are relative; they are normalized at compute time. Tuned for
// plausible role emphasis rather than realism precision (balance harness, M7).
// Heavily position-specific: a position weights its own skills, so a player
// with the wrong skill set (e.g. a striker with no tackling/marking/defensiveIQ)
// scores poorly out of position.
// Position weights over the 34-attribute model (FIFA-style role emphasis).
// Heavily position-specific so out-of-position ratings collapse realistically.
const WEIGHTS: Record<Position, WeightTable> = {
  GK: {
    gkReflexes: 6, gkDiving: 5, gkPositioning: 5, gkHandling: 4, gkKicking: 2,
    reactions: 2, composure: 1,
  },
  LCB: {
    marking: 5, standingTackle: 5, interceptions: 4, headingAccuracy: 4, slidingTackle: 3,
    strength: 4, composure: 3, reactions: 3, jumping: 3, shortPassing: 2, sprintSpeed: 2,
  },
  RCB: {
    marking: 5, standingTackle: 5, interceptions: 4, headingAccuracy: 4, slidingTackle: 3,
    strength: 4, composure: 3, reactions: 3, jumping: 3, shortPassing: 2, sprintSpeed: 2,
  },
  LB: {
    standingTackle: 4, marking: 3, interceptions: 3, slidingTackle: 3, crossing: 4,
    sprintSpeed: 4, acceleration: 4, stamina: 4, shortPassing: 3, ballControl: 3, dribbling: 2,
  },
  RB: {
    standingTackle: 4, marking: 3, interceptions: 3, slidingTackle: 3, crossing: 4,
    sprintSpeed: 4, acceleration: 4, stamina: 4, shortPassing: 3, ballControl: 3, dribbling: 2,
  },
  CDM: {
    interceptions: 5, standingTackle: 5, marking: 4, shortPassing: 4, longPassing: 3,
    reactions: 3, composure: 3, stamina: 3, strength: 3, slidingTackle: 3, vision: 2,
  },
  CM: {
    shortPassing: 5, longPassing: 4, vision: 4, ballControl: 4, dribbling: 3,
    composure: 3, reactions: 3, stamina: 3, longShots: 2, interceptions: 2, standingTackle: 2,
  },
  LM: {
    dribbling: 5, crossing: 4, ballControl: 4, acceleration: 4, sprintSpeed: 4,
    shortPassing: 3, agility: 3, curve: 2, vision: 2, stamina: 2,
  },
  RM: {
    dribbling: 5, crossing: 4, ballControl: 4, acceleration: 4, sprintSpeed: 4,
    shortPassing: 3, agility: 3, curve: 2, vision: 2, stamina: 2,
  },
  CAM: {
    vision: 5, ballControl: 5, shortPassing: 4, dribbling: 4, longShots: 3,
    composure: 3, curve: 3, positioning: 3, reactions: 3, finishing: 2,
  },
  LW: {
    dribbling: 6, acceleration: 5, sprintSpeed: 5, ballControl: 4, agility: 4,
    crossing: 3, finishing: 3, curve: 3, positioning: 3,
  },
  RW: {
    dribbling: 6, acceleration: 5, sprintSpeed: 5, ballControl: 4, agility: 4,
    crossing: 3, finishing: 3, curve: 3, positioning: 3,
  },
  ST: {
    finishing: 6, positioning: 5, shotPower: 4, ballControl: 3, headingAccuracy: 3,
    composure: 3, reactions: 3, dribbling: 3, sprintSpeed: 3, acceleration: 3,
    longShots: 2, volleys: 2, penalties: 1,
  },
};

/** Weight of an attribute for a position (0 if irrelevant). Used by generation. */
export function attributeWeight(position: Position, key: AttributeKey): number {
  return WEIGHTS[position][key] ?? 0;
}

export const GK_KEYS: AttributeKey[] = [
  'gkDiving', 'gkHandling', 'gkKicking', 'gkPositioning', 'gkReflexes',
];

/** Compute OVR (0–100) for a player's attributes at a specific position. */
export function overallAt(attrs: Attributes, position: Position): number {
  const flat = flattenAttributes(attrs);
  const table = WEIGHTS[position];
  let sum = 0;
  let weightSum = 0;
  for (const key in table) {
    const w = table[key as AttributeKey]!;
    sum += (flat[key as AttributeKey] ?? 0) * w;
    weightSum += w;
  }
  return clamp(Math.round(sum / weightSum));
}

/** Best OVR across a player's listed positions, plus where it occurs. */
export function bestOverall(
  attrs: Attributes,
  positions: Position[],
): { position: Position; ovr: number } {
  let best = { position: positions[0], ovr: -1 };
  for (const p of positions) {
    const ovr = overallAt(attrs, p);
    if (ovr > best.ovr) best = { position: p, ovr };
  }
  return best;
}
