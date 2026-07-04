// ---------------------------------------------------------------------------
// Youth scouting (§ Academy core + Ideas 6–8). Interactive scout dispatch:
// a chosen scout watches up to 3 target positions in a target country and,
// after a trip, returns prospects as YouthProspects with uncertain reports
// (OVR/POT ranges via the existing `revealed()` model). Better scouts find more
// and better players and report more accurately. Pure & deterministic.
// ---------------------------------------------------------------------------

import type { SquadRole } from '../types/player';
import type { Staff } from '../types/staff';
import type { Position } from '../types/attributes';
import type { AcademyPlayer, ScoutAssignment, YouthProspect } from '../types/academy';
import type { NewsItem } from '../types/league';
import { Rng, clamp } from './rng';
import { generatePlayer } from './generator';
import { rollSkewedPotential, PRODIGY_POTENTIAL } from './academy';
import { youthIndexFor } from '../data/academyData';

/** A standard scouting trip length, in sim days. */
export const SCOUT_TRIP_DAYS = 56;
export const MAX_SCOUT_POSITIONS = 3;

/** A scout's effective skill for a given target (region + specialization aware). */
function effectiveSkill(scout: Staff, country: string, positions: Position[]): { ability: number; potential: number; region: number } {
  const sp = scout.scoutProfile;
  const ability = sp?.judgingAbility ?? scout.rating;
  const potential = sp?.judgingPotential ?? Math.max(20, scout.rating - 8);
  let region = sp?.regionalKnowledge[country] ?? scout.rating * 0.6;
  // Specialization boost when scouting its niche.
  if (sp?.specialization) {
    if (sp.specialization.region === country) region = clamp(region + 18, 0, 99);
    if (positions.some((p) => sp.specialization!.positions.includes(p))) region = clamp(region + 8, 0, 99);
  }
  return { ability, potential, region };
}

/** Generate one scouted prospect for a trip. The "true" ratings are real; the
 *  report's accuracy (knowledgePct) reflects the scout's skill. */
function generateProspect(
  scout: Staff,
  discoveredByClubId: string,
  positions: Position[],
  country: string,
  year: number,
  ratingCap: number,
  rng: Rng,
  uid: string,
): YouthProspect {
  const { ability, region } = effectiveSkill(scout, country, positions);
  const position = rng.pick(positions);
  // Realistic ceiling: country youth strength + scout region knowledge set the
  // baseline; high potentials get progressively rarer (90+ generational).
  const baseCeil = 64 + youthIndexFor(country) * 0.12 + region * 0.06;
  const potential = rollSkewedPotential(baseCeil, youthIndexFor(country) / 100, rng);
  const target = clamp(Math.min(potential, ratingCap) - rng.int(16, 30), 26, Math.min(potential, ratingCap) - 5);
  const player = generatePlayer({
    rng, currentYear: year, target, position, ageRange: [15, 17], nationality: country,
    ratingCap, squadRole: 'PROSPECT' as SquadRole,
  });
  player.potential = Math.max(player.overall + 3, potential);
  player.contract.clubId = null;
  player.id = uid; // deterministic id (generator default uses Date.now)

  const prof = clamp(player.hidden?.professionalism ?? 50);
  const amb = clamp(player.hidden?.ambition ?? 50);
  const det = clamp(player.hidden?.consistency ?? 50);
  const academy: AcademyPlayer = {
    playerId: player.id, clubId: discoveredByClubId, ageGroup: 'U16', playedUp: false, heldBack: false,
    ageGroupPerformance: 50, readiness: 0, contractStatus: 'schoolboy', dualRegistered: false,
    personality: { determination: det, professionalism: prof, ambition: amb },
    flameOutRisk: clamp(0.5 - (prof + det + amb) / 600, 0, 0.5) as number, isProdigy: player.potential >= PRODIGY_POTENTIAL,
  };
  // Better judgement (and region knowledge) → tighter initial report.
  const knowledgePct = clamp(Math.round(22 + ability * 0.4 + region * 0.12 + rng.int(-6, 6)), 10, 80);
  return { player, academy, knowledgePct, discoveredByClubId, trialled: false };
}

export interface ScoutResolveResult {
  assignments: ScoutAssignment[]; // still-running
  prospects: YouthProspect[]; // newly discovered
  news: NewsItem[];
}

/**
 * Advance every active scouting trip by `daysAdvanced`. Completed trips return
 * prospects sized by the scout's skill, then drop off the active list.
 */
export function resolveScoutAssignments(
  assignments: ScoutAssignment[],
  scoutsById: Record<string, Staff>,
  managerClubId: string,
  year: number,
  daysAdvanced: number,
  ratingCap: number,
  rng: Rng,
): ScoutResolveResult {
  const still: ScoutAssignment[] = [];
  const prospects: YouthProspect[] = [];
  const news: NewsItem[] = [];

  for (const a of assignments) {
    const progress = clamp(a.progress + daysAdvanced * (100 / SCOUT_TRIP_DAYS), 0, 100) as number;
    const durationRemaining = Math.max(0, Math.round(SCOUT_TRIP_DAYS * (1 - progress / 100)));
    const scout = scoutsById[a.scoutId];
    if (progress < 100 || !scout) {
      still.push({ ...a, progress, durationRemaining });
      continue;
    }
    // Trip complete → discover prospects. Yield scales with skill + region.
    const { ability, region } = effectiveSkill(scout, a.country, a.positions as Position[]);
    let finds = 1 + (ability > 70 ? 1 : 0) + (region > 62 ? 1 : 0);
    if (rng.chance((ability + region) / 400)) finds += 1;
    const found: string[] = [];
    for (let i = 0; i < finds; i++) {
      const uid = `ps_${a.scoutId}_${a.country}_${year}_${i}`;
      const p = generateProspect(scout, managerClubId, a.positions as Position[], a.country, year, ratingCap, rng, uid);
      prospects.push(p);
      found.push(p.player.id);
    }
    news.push({
      id: `news_scout_${a.scoutId}_${year}_${found.length}`,
      day: 0, category: 'TRANSFER',
      title: `${scout.name.last} returns from ${a.country}`,
      body: `Your scout reports ${found.length} prospect${found.length === 1 ? '' : 's'} (${a.positions.join(', ')}).`,
      read: false,
    });
  }
  return { assignments: still, prospects, news };
}
