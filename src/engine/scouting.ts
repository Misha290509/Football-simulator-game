// ---------------------------------------------------------------------------
// Scouting uncertainty (§8, §11-M5). Reports return attribute/potential RANGES
// that tighten as knowledge (0–100) grows. Pure & deterministic per player.
// ---------------------------------------------------------------------------

import type { Player } from '../types/player';

export interface Revealed {
  knowledge: number;
  ovrLow: number;
  ovrHigh: number;
  potLow: number;
  potHigh: number;
  /** Display strings like "78–84". */
  ovrText: string;
  potText: string;
}

/**
 * Reveal a player's OVR/POT as a range. Full knowledge → exact value. The
 * spread is deterministic (seeded by player id) so it doesn't jitter per render.
 */
export function revealed(player: Player, knowledge: number): Revealed {
  const k = Math.max(0, Math.min(100, knowledge));
  if (k >= 100) {
    return {
      knowledge: 100,
      ovrLow: player.overall, ovrHigh: player.overall,
      potLow: player.potential, potHigh: player.potential,
      ovrText: String(player.overall), potText: String(player.potential),
    };
  }
  // Spread shrinks from ±10 (ovr) / ±18 (pot) toward 0 as knowledge → 100.
  const ovrSpread = Math.round((1 - k / 100) * 10);
  const potSpread = Math.round((1 - k / 100) * 18);
  // Deterministic asymmetry from the id hash so ranges look organic.
  const h = hash(player.id);
  const ovrCenter = player.overall + ((h % 3) - 1);
  const potCenter = player.potential + (((h >> 3) % 3) - 1);

  const ovrLow = clampR(ovrCenter - ovrSpread);
  const ovrHigh = clampR(ovrCenter + ovrSpread);
  const potLow = clampR(Math.max(ovrLow, potCenter - potSpread));
  const potHigh = clampR(potCenter + potSpread);

  return {
    knowledge: k,
    ovrLow, ovrHigh, potLow, potHigh,
    ovrText: ovrSpread === 0 ? String(ovrLow) : `${ovrLow}–${ovrHigh}`,
    potText: potSpread === 0 ? String(potLow) : `${potLow}–${potHigh}`,
  };
}

const clampR = (n: number) => Math.max(1, Math.min(99, Math.round(n)));

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
