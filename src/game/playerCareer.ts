// ---------------------------------------------------------------------------
// Player Career mode — orchestration helpers (§ Player Career). Tier 1 seed:
// pure, read-only helpers for reasoning about which career mode a save is in.
// Later tiers grow this module with avatar creation, the selection model
// (playerSelectionWeight), the personal matchday loop and progression.
// ---------------------------------------------------------------------------

import type { SaveGame } from '../types/league';
import type { CareerMode, PlayerCareer } from '../types/playerCareer';

/** The career mode of a save. Absent flag ⇒ 'MANAGER' (every legacy save). */
export function careerModeOf(meta: Pick<SaveGame, 'careerMode'> | null | undefined): CareerMode {
  return meta?.careerMode ?? 'MANAGER';
}

/** True when the human is playing as a single footballer, not a manager. */
export function isPlayerCareer(meta: Pick<SaveGame, 'careerMode'> | null | undefined): boolean {
  return careerModeOf(meta) === 'PLAYER';
}

/**
 * The avatar's career block, if this is a Player save. Returns null in manager
 * mode (or if a Player save somehow lacks the block), so callers can branch
 * without repeating the mode check.
 */
export function playerCareerOf(
  meta: (Pick<SaveGame, 'careerMode'> & { playerCareer?: PlayerCareer }) | null | undefined,
): PlayerCareer | null {
  return isPlayerCareer(meta) ? meta?.playerCareer ?? null : null;
}
