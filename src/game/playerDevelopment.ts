// ---------------------------------------------------------------------------
// Player Career — player-controlled development (§ Training). Beyond the passive
// season engine, the human earns Development Points from how he performs and
// spends them to grow the attributes HE chooses — the RPG progression made
// hands-on. A weekly training intensity adds a real risk/reward: push hard for
// faster growth at the cost of fitness (and the odd knock), or ease off to stay
// fresh. Pure & deterministic; investment never pushes an attribute past a
// sensible ceiling tied to the player's potential.
// ---------------------------------------------------------------------------

import type { Player } from '../types/player';
import type { AttributeKey } from '../types/attributes';
import type { PlayerCareer } from '../types/playerCareer';
import { bestOverall, flattenAttributes } from '../engine/ratings';

export type TrainingIntensity = 'LIGHT' | 'BALANCED' | 'INTENSE';

export interface IntensityEffect { focusMult: number; dpMult: number; fitnessDelta: number; knockChance: number; label: string; blurb: string }
export const INTENSITY: Record<TrainingIntensity, IntensityEffect> = {
  LIGHT: { focusMult: 0.6, dpMult: 0.75, fitnessDelta: 7, knockChance: 0, label: 'Light', blurb: 'Ease off — recover fitness, slower growth.' },
  BALANCED: { focusMult: 1, dpMult: 1, fitnessDelta: 0, knockChance: 0.01, label: 'Balanced', blurb: 'A steady, sustainable workload.' },
  INTENSE: { focusMult: 1.5, dpMult: 1.35, fitnessDelta: -5, knockChance: 0.07, label: 'Intense', blurb: 'Push hard — faster growth, but it drains you and risks a knock.' },
};
export const intensityOf = (c: PlayerCareer): TrainingIntensity => c.trainingIntensity ?? 'BALANCED';

/** Development Points earned from a batch of appearances (rewards playing well).
 *  Scaled by the training intensity's dp multiplier. */
export function dpEarned(ratings: number[], intensity: TrainingIntensity): number {
  let dp = 0;
  for (const r of ratings) dp += Math.max(0, Math.round((r - 6.2) * 3));
  return Math.round(dp * INTENSITY[intensity].dpMult);
}

/** DP cost to raise an attribute one point from its current value (steeper as
 *  it climbs, mirroring the creation cost curve's spirit). */
export function investCost(v: number): number {
  return v < 60 ? 4 : v < 70 ? 6 : v < 80 ? 9 : 14;
}

/** The value an attribute can be trained up to — headroom above the player's
 *  potential, shrinking naturally as he matures. */
export function attrCeiling(player: Player, ratingCap: number): number {
  return Math.min(ratingCap, player.potential + 6);
}

export interface InvestResult { ok: boolean; player: Player; career: PlayerCareer; message: string }

/** Spend DP to raise one attribute by a point. Pure: recomputes OVR from the
 *  real model and never exceeds the attribute ceiling or the DP balance. */
export function investAttribute(player: Player, career: PlayerCareer, key: AttributeKey, ratingCap: number): InvestResult {
  const flat = flattenAttributes(player.attributes);
  const v = flat[key] ?? 0;
  const ceiling = attrCeiling(player, ratingCap);
  if (v >= ceiling) return { ok: false, player, career, message: 'That attribute is at its ceiling for now — raise your potential first.' };
  const cost = investCost(v);
  const dp = career.developmentPoints ?? 0;
  if (dp < cost) return { ok: false, player, career, message: `Not enough Development Points (need ${cost}).` };

  const group = (['technical', 'mental', 'physical', 'goalkeeping'] as const).find((g) => key in (player.attributes[g] as Record<string, number>))!;
  const attributes = { ...player.attributes, [group]: { ...(player.attributes[group] as Record<string, number>), [key]: v + 1 } };
  const overall = Math.min(ratingCap, bestOverall(attributes, player.positions).ovr) as number;
  const nextPlayer: Player = { ...player, attributes, overall };
  const nextCareer: PlayerCareer = { ...career, developmentPoints: dp - cost };
  return { ok: true, player: nextPlayer, career: nextCareer, message: `+1 ${key} (−${cost} DP).` };
}
