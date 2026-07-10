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
import { Rng, clamp, hashSeed } from './rng';
import { generatePlayer } from './generator';
import { rollSkewedPotential, PRODIGY_POTENTIAL } from './academy';
import { youthIndexFor } from '../data/academyData';

/** A standard scouting trip length, in sim days (legacy single-trip model). */
export const SCOUT_TRIP_DAYS = 56;
export const MAX_SCOUT_POSITIONS = 3;

// --- Monthly-report contracts -------------------------------------------------
// A youth-scouting contract files a report every "month" for a fixed term. The
// sim runs on abstract day indices (~12 map to a real calendar month at the
// league's day scale), so a scouting month is ~12 sim days.
export const SCOUT_MONTH_DAYS = 12;
export const SCOUT_CONTRACT_MONTHS = [3, 6, 9] as const;
/** Up-front cost per contract term. Longer terms cost more overall but less per month. */
export const SCOUT_CONTRACT_COST: Record<number, number> = { 3: 90_000, 6: 150_000, 9: 180_000 };
/** Players delivered in each monthly report. */
export const REPORT_MIN = 5;
export const REPORT_MAX = 8;

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
  // Deliberately conservative — most scouted teenagers are squad fillers, and
  // real gems are rare, so a small club isn't handed a golden generation.
  const baseCeil = 58 + youthIndexFor(country) * 0.10 + region * 0.05;
  const potential = rollSkewedPotential(baseCeil, (youthIndexFor(country) / 100) * 0.7, rng);
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
 * Advance every active scouting contract across the window [fromDay, toDay].
 * Each contract files a monthly report of 5–8 prospects until its term ends,
 * then drops off the active list. Legacy single-trip assignments (no term) are
 * still resolved the old way so pre-contract saves keep working.
 */
export function resolveScoutAssignments(
  assignments: ScoutAssignment[],
  scoutsById: Record<string, Staff>,
  managerClubId: string,
  year: number,
  fromDay: number,
  toDay: number,
  ratingCap: number,
  seed: number,
): ScoutResolveResult {
  const still: ScoutAssignment[] = [];
  const prospects: YouthProspect[] = [];
  const news: NewsItem[] = [];
  const daysAdvanced = Math.max(1, toDay - fromDay);

  for (const a of assignments) {
    const scout = scoutsById[a.scoutId];

    // --- Legacy single-trip assignment (no contract term). ------------------
    if (a.monthsTotal == null) {
      const progress = clamp((a.progress ?? 0) + daysAdvanced * (100 / SCOUT_TRIP_DAYS), 0, 100) as number;
      const durationRemaining = Math.max(0, Math.round(SCOUT_TRIP_DAYS * (1 - progress / 100)));
      if (progress < 100 || !scout) { still.push({ ...a, progress, durationRemaining }); continue; }
      const { ability, region } = effectiveSkill(scout, a.country, a.positions as Position[]);
      let finds = 1 + (ability > 70 ? 1 : 0) + (region > 62 ? 1 : 0);
      const legacyRng = new Rng((seed ^ hashSeed(a.scoutId)) >>> 0);
      if (legacyRng.chance((ability + region) / 400)) finds += 1;
      const found: string[] = [];
      for (let i = 0; i < finds; i++) {
        const p = generateProspect(scout, managerClubId, a.positions as Position[], a.country, year, ratingCap, legacyRng, `ps_${a.scoutId}_${a.country}_${year}_${i}`);
        prospects.push(p); found.push(p.player.id);
      }
      news.push({
        id: `news_scout_${a.scoutId}_${year}_${found.length}`, day: toDay, category: 'TRANSFER',
        title: `${scout.name.last} returns from ${a.country}`,
        body: `Your scout reports ${found.length} prospect${found.length === 1 ? '' : 's'} (${a.positions.join(', ')}).`,
        read: false,
      });
      continue;
    }

    // --- Contract: file each monthly report now due. ------------------------
    let delivered = a.reportsDelivered ?? 0;
    let nextReportDay = a.nextReportDay ?? (fromDay + SCOUT_MONTH_DAYS);
    const found = [...a.foundPlayerIds];
    while (scout && delivered < a.monthsTotal && nextReportDay <= toDay) {
      const reportRng = new Rng((seed ^ hashSeed(a.scoutId) ^ ((delivered + 1) * 0x9e3779b1)) >>> 0);
      const count = reportRng.int(REPORT_MIN, REPORT_MAX);
      const batch: string[] = [];
      for (let i = 0; i < count; i++) {
        const uid = `ps_${a.scoutId}_${a.country}_${year}_m${delivered + 1}_${i}`;
        const p = generateProspect(scout, managerClubId, a.positions as Position[], a.country, year, ratingCap, reportRng, uid);
        prospects.push(p); found.push(p.player.id); batch.push(p.player.id);
      }
      delivered += 1;
      news.push({
        id: `news_scoutrep_${a.scoutId}_${year}_m${delivered}`, day: nextReportDay, category: 'TRANSFER',
        title: `${scout.name.last}: monthly report ${delivered}/${a.monthsTotal}`,
        body: `${batch.length} prospect${batch.length === 1 ? '' : 's'} scouted in ${a.country} (${a.positions.join(', ')}).`,
        read: false,
      });
      nextReportDay += SCOUT_MONTH_DAYS;
    }

    if (scout && delivered >= a.monthsTotal) {
      // Contract fulfilled — the scout comes home.
      news.push({
        id: `news_scoutend_${a.scoutId}_${year}_${toDay}`, day: toDay, category: 'TRANSFER',
        title: `${scout.name.last}'s scouting contract ends`,
        body: `${delivered} monthly reports delivered from ${a.country}. Assign a new contract whenever you like.`,
        read: false,
      });
    } else {
      still.push({ ...a, reportsDelivered: delivered, nextReportDay, foundPlayerIds: found });
    }
  }
  return { assignments: still, prospects, news };
}
