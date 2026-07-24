// ---------------------------------------------------------------------------
// Work permits / GBE (§ #21, post-Brexit England). An English club signing a
// non-domestic player needs a Governing Body Endorsement, awarded on a points
// system (a simplified stand-in for the real senior/youth international, league
// quality and minutes criteria). Below the threshold the signing is blocked.
// Pure/deterministic. A framework the wider registration rules (#15) can extend.
// ---------------------------------------------------------------------------

import type { Player } from '../types/player';
import type { Club } from '../types/club';

// --- Squad-registration rules (§ #15) --------------------------------------

export interface RegistrationRules {
  /** Maximum first-team squad size subject to registration. */
  squadLimit: number;
  /** Minimum home-grown players that must be within the registered squad. */
  homegrownMin: number;
  /** Optional cap on non-domestic (foreign) players. */
  nonDomesticMax?: number;
}

/** Home nations sharing a "domestic" pool for home-grown purposes. */
const HOME_POOL: Record<string, string[]> = {
  GB: ['GB', 'SCO', 'IE'],
};

/** Per-country registration rules (a distilled model of real regulations). */
export const REGISTRATION_RULES: Record<string, RegistrationRules> = {
  GB: { squadLimit: 25, homegrownMin: 8 },              // Premier League 25/8 HG
  ES: { squadLimit: 25, homegrownMin: 8, nonDomesticMax: 3 }, // La Liga non-EU cap
  IT: { squadLimit: 25, homegrownMin: 8 },
  DE: { squadLimit: 25, homegrownMin: 8 },
  FR: { squadLimit: 25, homegrownMin: 8 },
  PT: { squadLimit: 25, homegrownMin: 8 },
  NL: { squadLimit: 25, homegrownMin: 6 },
  // MLS (§ #16): a larger roster with a hard cap on international (non-domestic)
  // slots rather than a home-grown minimum.
  US: { squadLimit: 30, homegrownMin: 0, nonDomesticMax: 8 },
};

export const registrationRules = (countryId: string): RegistrationRules | null => REGISTRATION_RULES[countryId] ?? null;

export interface SquadCompliance {
  rules: RegistrationRules;
  squadCount: number;
  homegrown: number;
  nonDomestic: number;
  violations: string[];
}

/** Is a player home-grown for a club — a national, a home-pool national, or an
 *  academy graduate who came through a club's system. */
export function isHomegrown(p: Player, club: Club): boolean {
  const pool = HOME_POOL[club.countryId] ?? [club.countryId];
  return pool.includes(p.nationality) || !!p.academyGraduateOf;
}

/** Assess a squad against its country's registration rules (§ #15). */
export function squadCompliance(players: Player[], club: Club): SquadCompliance | null {
  const rules = registrationRules(club.countryId);
  if (!rules) return null;
  // The senior squad that needs registering (exclude U21s, who are exempt).
  const senior = players.filter((p) => !p.academyClubId || p.contract.clubId === club.id);
  const homegrown = senior.filter((p) => isHomegrown(p, club)).length;
  const pool = HOME_POOL[club.countryId] ?? [club.countryId];
  const nonDomestic = senior.filter((p) => !pool.includes(p.nationality)).length;
  const violations: string[] = [];
  if (senior.length > rules.squadLimit) violations.push(`Squad of ${senior.length} exceeds the ${rules.squadLimit}-man limit.`);
  if (homegrown < rules.homegrownMin) violations.push(`Only ${homegrown} home-grown players — ${rules.homegrownMin} required.`);
  if (rules.nonDomesticMax != null && nonDomestic > rules.nonDomesticMax) violations.push(`${nonDomestic} non-domestic players — max ${rules.nonDomesticMax}.`);
  return { rules, squadCount: senior.length, homegrown, nonDomestic, violations };
}

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
