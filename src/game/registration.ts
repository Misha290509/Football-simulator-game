// ---------------------------------------------------------------------------
// Work permits / GBE (§ #21, post-Brexit England). An English club signing a
// non-domestic player needs a Governing Body Endorsement, awarded on a points
// system (a simplified stand-in for the real senior/youth international, league
// quality and minutes criteria). Below the threshold the signing is blocked.
// Pure/deterministic. A framework the wider registration rules (#15) can extend.
// ---------------------------------------------------------------------------

import type { Player } from '../types/player';
import type { Club } from '../types/club';

/** Countries whose players are "domestic" for GBE purposes (home nations + the
 *  Common Travel Area), and so exempt. */
const GBE_EXEMPT = new Set(['GB', 'SCO', 'IE']);

/** Rough footballing-strength tier of a nation, worth bonus GBE points. */
const STRONG_NATIONS = new Set(['BR', 'AR', 'FR', 'ES', 'DE', 'IT', 'PT', 'NL', 'BE', 'US']);
const MID_NATIONS = new Set(['TR', 'DK', 'NO', 'SE', 'CH', 'AT', 'PL', 'KR', 'SA', 'AU', 'RO']);

export const GBE_THRESHOLD = 15;

export interface GbeResult {
  /** True when no endorsement is required (domestic) or enough points are scored. */
  allowed: boolean;
  points: number;
  required: number;
  reason: string;
}

/**
 * Assess whether an English club may sign a player under GBE rules. Points come
 * from the player's quality (a proxy for international pedigree) plus a bonus for
 * hailing from a strong footballing nation; domestic players are exempt.
 */
export function gbeCheck(player: Player, buyer: Club): GbeResult {
  // Only English clubs operate under GBE; everyone else passes here (their own
  // registration rules live under #15).
  if (buyer.countryId !== 'GB') return { allowed: true, points: 0, required: 0, reason: '' };
  if (GBE_EXEMPT.has(player.nationality)) return { allowed: true, points: 0, required: 0, reason: 'Domestic player — no endorsement needed.' };

  const quality = Math.max(0, player.overall - 60);           // 0 at 60 OVR, 30 at 90
  const potential = Math.max(0, (player.potential - player.overall)) * 0.3; // upside for prospects
  const natBonus = STRONG_NATIONS.has(player.nationality) ? 8 : MID_NATIONS.has(player.nationality) ? 4 : 0;
  const points = Math.round(quality + potential + natBonus);
  const allowed = points >= GBE_THRESHOLD;
  return {
    allowed,
    points,
    required: GBE_THRESHOLD,
    reason: allowed
      ? `Endorsement granted (${points} pts).`
      : `Work-permit refused — ${points} GBE points, ${GBE_THRESHOLD} required. He doesn't meet the criteria.`,
  };
}
