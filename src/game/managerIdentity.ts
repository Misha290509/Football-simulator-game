// ---------------------------------------------------------------------------
// Manager attributes & identity (§ #45). Four attributes derived from the
// manager's career — they grow with experience, results and reputation — and a
// concrete effect (a Developer boosts youth/coaching growth at his club). Pure
// and deterministic from the save meta.
// ---------------------------------------------------------------------------

import type { SaveGame } from '../types/league';

export interface ManagerAttributes {
  tactician: number;      // 0–100 — tactical acumen
  motivator: number;      // 0–100 — lifting the dressing room
  developer: number;      // 0–100 — improving players
  disciplinarian: number; // 0–100 — control and organisation
}

const clamp = (n: number) => Math.max(1, Math.min(99, Math.round(n)));

/** Derive the manager's attributes from their career record. */
export function managerAttributes(meta: Pick<SaveGame, 'managerReputation' | 'managerStints' | 'managerStyle'>): ManagerAttributes {
  const rep = meta.managerReputation ?? 50;
  const stints = meta.managerStints ?? [];
  const seasons = stints.reduce((a, s) => a + s.seasons, 0);
  const trophies = stints.reduce((a, s) => a + s.trophies, 0);
  const styleWins = meta.managerStyle?.wins ?? 0;
  return {
    tactician: clamp(40 + rep * 0.3 + Math.min(22, styleWins * 0.5)),
    motivator: clamp(45 + seasons * 1.4 + trophies * 1.2),
    developer: clamp(40 + seasons * 2 + trophies * 0.4),
    disciplinarian: clamp(45 + rep * 0.25 + seasons * 0.8),
  };
}

/** Growth multiplier a manager's Developer rating grants his players (§ #45). */
export const developerGrowthBonus = (developer: number): number => 1 + (developer / 100) * 0.3;

/** 1–5 star rating for display. */
export const attrStars = (v: number): number => Math.max(1, Math.min(5, Math.round(v / 20)));
