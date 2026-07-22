// ---------------------------------------------------------------------------
// Save migrations (§ Academy — "preserve saves"). A pure, deterministic runner
// keyed off meta.schemaVersion. Invoked on load/import so existing careers gain
// new systems with sensible, non-destructive backfills. The Dexie store schema
// is unchanged — all new state lives inside the meta blob and existing player
// rows — so old saves load cleanly without an IndexedDB version bump.
// ---------------------------------------------------------------------------

import type { SaveMeta } from './db';
import type { Club } from '../types/club';
import type { Player } from '../types/player';
import type { Academy, AcademyPlayer } from '../types/academy';
import { Rng, clamp, hashSeed } from '../engine/rng';
import { translateLegacyPosition } from '../types/attributes';
import { FORMATION_NAMES } from '../engine/lineup';
import { buildAcademy, ageGroupForAge, ageOfPlayer, computeReadiness, academyPotential, PRODIGY_POTENTIAL, facilityLevelFor } from '../engine/academy';
import { makeScoutProfile, staffWage, generateStaffPool } from '../engine/staff';
import { fillAcademyBands } from '../game/academy';
import { injectSpecialPlayers } from '../game/specialPlayers';
import { generateSeasonObjectives } from '../game/playerObjectives';

export const CURRENT_SCHEMA_VERSION = 10;

export interface MigrationResult {
  meta: SaveMeta;
  clubs: Record<string, Club>;
  players: Record<string, Player>;
  changed: boolean;
}

function currentYear(meta: SaveMeta): number {
  const s = Object.values(meta.seasons).find((x) => x.current);
  return s?.year ?? meta.startYear;
}

/**
 * v1 → v2: give every club a tailored academy and seed its youth roster from
 * existing under-19 squad players as dual-registered prospects (non-destructive
 * — they stay in the first team). Idempotent: clubs that already have an
 * academy are skipped.
 */
function migrateToV2(meta: SaveMeta, clubs: Record<string, Club>, players: Record<string, Player>): void {
  const rng = new Rng((meta.seed ^ 0xaca0e111) >>> 0);
  const year = currentYear(meta);
  const academies: Record<string, Academy> = { ...(meta.academies ?? {}) };
  const academyPlayers: Record<string, AcademyPlayer> = { ...(meta.academyPlayers ?? {}) };

  // Index squads once.
  const squadByClub: Record<string, Player[]> = {};
  for (const p of Object.values(players)) {
    const c = p.contract.clubId;
    if (c) (squadByClub[c] ??= []).push(p);
  }

  for (const club of Object.values(clubs)) {
    // Backfill scout skill profiles for interactive youth scouting (Idea 6).
    for (const s of club.staff ?? []) {
      if (s.role === 'SCOUT' && !s.scoutProfile) s.scoutProfile = makeScoutProfile(s.rating, rng);
    }
    if (academies[club.id]) continue;
    const { academy, coaches } = buildAcademy(club, rng);
    academies[club.id] = academy;
    club.staff = [...(club.staff ?? []), ...coaches];

    const squad = squadByClub[club.id] ?? [];
    const seniors = squad.filter((p) => ageOfPlayer(p, year) > 18);
    const firstTeamAvg = seniors.length
      ? seniors.reduce((s, p) => s + p.overall, 0) / seniors.length
      : Math.max(50, club.reputation * 0.85);

    for (const p of squad) {
      const age = ageOfPlayer(p, year);
      if (age > 18 || academyPlayers[p.id]) continue;
      p.academyClubId = club.id; // dual-registered: stays in the first team too
      const prof = clamp(p.hidden?.professionalism ?? 50);
      const amb = clamp(p.hidden?.ambition ?? 50);
      const det = clamp(p.hidden?.consistency ?? 50);
      academyPlayers[p.id] = {
        playerId: p.id,
        clubId: club.id,
        ageGroup: ageGroupForAge(age),
        playedUp: false,
        heldBack: false,
        ageGroupPerformance: 50,
        readiness: computeReadiness(p.overall, p.potential, 50, firstTeamAvg),
        contractStatus: age >= 17 ? 'professional' : 'scholar',
        dualRegistered: true,
        personality: { determination: det, professionalism: prof, ambition: amb },
        flameOutRisk: clamp(0.5 - (prof + det + amb) / 600, 0, 0.5) as number,
        isProdigy: false,
      };
    }
  }

  meta.academies = academies;
  meta.academyPlayers = academyPlayers;
  meta.scoutAssignments = meta.scoutAssignments ?? [];
  meta.youthProspects = meta.youthProspects ?? [];
  meta.youthCompetitions = meta.youthCompetitions ?? {};
}

/** Apply any pending migrations. Returns whether anything changed. */
export function migrateSave(
  metaIn: SaveMeta,
  clubsIn: Record<string, Club>,
  playersIn: Record<string, Player>,
): MigrationResult {
  const fromVersion = metaIn.schemaVersion ?? 1;
  if (fromVersion >= CURRENT_SCHEMA_VERSION) {
    return { meta: metaIn, clubs: clubsIn, players: playersIn, changed: false };
  }
  // Clone so callers can compare / persist the migrated copies.
  const meta: SaveMeta = structuredClone(metaIn);
  const clubs: Record<string, Club> = structuredClone(clubsIn);
  const players: Record<string, Player> = structuredClone(playersIn);

  if (fromVersion < 2) migrateToV2(meta, clubs, players);
  if (fromVersion < 3) migrateToV3(meta, players);
  if (fromVersion < 4) migrateToV4(meta, clubs);
  if (fromVersion < 5) migrateToV5(clubs, players);
  if (fromVersion < 6) migrateToV6(meta, clubs);
  if (fromVersion < 7) migrateToV7(meta, clubs, players);
  if (fromVersion < 8) migrateToV8(meta);
  if (fromVersion < 9) migrateToV9(meta, players);
  if (fromVersion < 10) migrateToV10(meta);

  meta.schemaVersion = CURRENT_SCHEMA_VERSION;
  return { meta, clubs, players, changed: true };
}

/**
 * v9 → v10: Tier-2 manager-relationship fields. Backfill defaults on existing
 * Player saves (status ladder history, promises, conversations, rival,
 * confidence/sharpness, international extras). Manager saves untouched.
 */
function migrateToV10(meta: SaveMeta): void {
  if (meta.careerMode !== 'PLAYER' || !meta.playerCareer) return;
  const pc = meta.playerCareer;
  pc.statusHistory = pc.statusHistory ?? [];
  pc.promises = pc.promises ?? [];
  pc.pendingConversations = pc.pendingConversations ?? [];
  pc.rival = pc.rival ?? null;
  pc.confidence = pc.confidence ?? 60;
  pc.matchSharpness = pc.matchSharpness ?? 100;
  pc.tournamentSquads = pc.tournamentSquads ?? [];
  pc.traitProgress = pc.traitProgress ?? {};
}

/**
 * v7 → v8: introduce Player Career mode. Every existing save is a manager
 * career, so stamp `careerMode: 'MANAGER'` explicitly (rather than relying on
 * the absent ⇒ MANAGER convention). Purely additive — no player-career state is
 * created here; that only appears when a Player save is started. Idempotent.
 */
function migrateToV8(meta: SaveMeta): void {
  meta.careerMode ??= 'MANAGER';
}

/**
 * v8 → v9: player-career objectives (Tier 2). Backfill season objectives and an
 * (empty) match-objective list on existing Player saves so the objectives loop
 * has state to work with. Manager saves are untouched. Deterministic.
 */
function migrateToV9(meta: SaveMeta, players: Record<string, Player>): void {
  if (meta.careerMode !== 'PLAYER' || !meta.playerCareer) return;
  const pc = meta.playerCareer;
  const avatar = players[pc.playerId];
  pc.matchObjectives = pc.matchObjectives ?? [];
  if (avatar && (!pc.objectives || pc.objectives.length === 0)) {
    pc.objectives = generateSeasonObjectives(avatar, meta.seed);
  }
}

/**
 * v6 → v7: fill out the manager's own youth academy. Existing saves seeded only
 * a handful of prospects; bring the manager's club up to a full team in each age
 * band (U16/U18/U21 — min 18, max 25 each) and inject any hand-authored cameo
 * players. Deterministic per save. Idempotent — bounded by the per-band minimum.
 */
function migrateToV7(meta: SaveMeta, clubs: Record<string, Club>, players: Record<string, Player>): void {
  const year = currentYear(meta);
  const ratingCap = meta.ratingCap ?? 90;
  const academies = meta.academies ?? {};
  const academyPlayers = meta.academyPlayers ?? {};

  const rng = new Rng((meta.seed ^ 0x18a0f077) >>> 0);
  const club = clubs[meta.managerClubId];
  const academy = club ? academies[club.id] : undefined;
  if (club && academy) {
    fillAcademyBands(club, academy, players, academyPlayers, year, ratingCap, rng, 'm7_');
  }

  meta.academies = academies;
  meta.academyPlayers = academyPlayers;

  // Cameo players (idempotent — skipped if already present).
  injectSpecialPlayers(clubs, players, academyPlayers, year, ratingCap, meta.seed);
}

/**
 * v5 → v6: backroom-staff overhaul. Recompute every staff member's wage on the
 * new realistic, role-scaled curve (old saves had ~£600/wk coaches), give them
 * a contract end year, and seed a persistent, refreshable staff market.
 */
function migrateToV6(meta: SaveMeta, clubs: Record<string, Club>): void {
  const year = currentYear(meta);
  for (const club of Object.values(clubs)) {
    for (const s of club.staff ?? []) {
      s.wage = staffWage(s.rating, s.role);
      if (s.expiresYear == null) s.expiresYear = year + 2;
    }
  }
  if (!meta.staffMarket) {
    meta.staffMarket = generateStaffPool(12, new Rng((meta.seed ^ 0x57aff00d) >>> 0));
  }
}

/**
 * v4 → v5: translate legacy position codes (DC/DL/DR/DM/MC/ML/MR/AMC/AML/AMR)
 * to the FIFA-style set (LB/LCB/RCB/RB/CDM/CM/CAM/LM/RM/LW/RW). Centre-backs
 * split by foot: left-footed → LCB, otherwise RCB. Also snaps stored club
 * formations onto the current back-four-only set. Idempotent.
 */
function migrateToV5(clubs: Record<string, Club>, players: Record<string, Player>): void {
  for (const p of Object.values(players)) {
    p.position = translateLegacyPosition(p.position, p.preferredFoot);
    if (Array.isArray(p.positions)) {
      const mapped = p.positions.map((x) => translateLegacyPosition(x, p.preferredFoot));
      p.positions = mapped.filter((x, i) => mapped.indexOf(x) === i);
    }
  }
  for (const club of Object.values(clubs)) {
    if (club.formation && !FORMATION_NAMES.includes(club.formation)) club.formation = '4-3-3';
  }
}

/**
 * v3 → v4: recompute club + academy facility levels from the realistic formula
 * (reputation + finances + stadium) so modest clubs no longer start with elite
 * 4–5/5 academies. Deterministic per club. Leaves the academy star rating alone.
 */
function migrateToV4(meta: SaveMeta, clubs: Record<string, Club>): void {
  const academies = meta.academies ?? {};
  for (const club of Object.values(clubs)) {
    const r = new Rng(hashSeed(`fac_${club.id}`));
    const lvl = facilityLevelFor(club.reputation, club.finances?.transferBudget ?? 0, club.stadium?.capacity);
    club.facilities = { academy: lvl, training: clamp(lvl + r.int(-1, 0), 1, 5) };
    const academy = academies[club.id];
    if (academy) {
      const jitter = () => clamp(lvl + r.int(-1, 1), 1, 5);
      academy.facilities = { training: jitter(), coaching: jitter(), medical: jitter(), recruitment: jitter() };
    }
  }
}

/**
 * v2 → v3: re-roll academy prospects' potentials onto the realistic curve
 * (most mid-70s to low-80s; 85+ rare, 90+ generational), fixing the earlier
 * inflated values. Deterministic per player so it's stable across reloads.
 */
function migrateToV3(meta: SaveMeta, players: Record<string, Player>): void {
  const academies = meta.academies ?? {};
  const academyPlayers = meta.academyPlayers ?? {};
  for (const ap of Object.values(academyPlayers)) {
    const player = players[ap.playerId];
    const academy = academies[ap.clubId];
    if (!player || !academy) continue;
    const rng = new Rng(hashSeed(`pot_${player.id}`));
    const potential = Math.max(player.overall, academyPotential(academy.rating, academy.reputation, rng));
    player.potential = potential;
    if (player.developmentLog.length > 0) {
      const last = player.developmentLog[player.developmentLog.length - 1];
      player.developmentLog[player.developmentLog.length - 1] = { ...last, pot: potential };
    }
    ap.isProdigy = potential >= PRODIGY_POTENTIAL;
  }
}
