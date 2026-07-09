// ---------------------------------------------------------------------------
// Academy system (§ Academy). Every club runs a youth academy: a parallel
// roster of prospects (real Player objects owned via `academyClubId`, kept out
// of the 30-man first-team cap) plus the structures that develop, scout, play
// and graduate them. All of this hangs off the SaveGame meta so it persists in
// one blob and reuses the existing player/match/finance engines.
// ---------------------------------------------------------------------------

import type { Position } from './attributes';
import type { Player } from './player';

export type AgeGroup = 'U16' | 'U18' | 'U21';
export type AcademyContract = 'schoolboy' | 'scholar' | 'professional';

/** A youngster who has graduated and gone on to a first-team career. */
export interface GraduateRecord {
  playerId: string;
  name: string;
  graduatedYear: number;
  peakOvr: number;
  /** Fee received if later sold (drives the reputation flywheel + economy). */
  saleFee?: number;
  awards: number;
}

/** A graduating "Class of '__" cohort, tracked over time (Idea 15). */
export interface CohortRecord {
  year: number;
  label: string; // e.g. "Class of '27"
  playerIds: string[];
}

export interface YouthTrophy {
  competitionId: string;
  competitionName: string;
  year: number;
}

export interface Academy {
  clubId: string;
  rating: number; // 1–5 stars (derived, cached)
  reputation: number; // 0–100, own flywheel rep separate from club rep
  philosophyId: string; // DNA / attribute-bias profile key
  facilities: { training: number; coaching: number; medical: number; recruitment: number };
  youthCoachIds: string[]; // Staff ids (role 'YOUTH_COACH')
  graduates: GraduateRecord[];
  cohorts: CohortRecord[];
  trophies: YouthTrophy[];
}

/**
 * Per-player academy state, keyed by playerId on the meta. The athletic data
 * (attributes/potential/age/dev) lives on the real Player; this holds only the
 * academy-specific overlay so existing player code is untouched.
 */
export interface AcademyPlayer {
  playerId: string;
  clubId: string;
  ageGroup: AgeGroup;
  playedUp: boolean; // promoted a level ahead of his age (faster growth, tougher test)
  heldBack: boolean; // kept a level down to rebuild confidence (steadier, slower)
  ageGroupPerformance: number; // 0–100 vs his peers, drives accelerated progress
  readiness: number; // derived promotion gauge 0–100
  contractStatus: AcademyContract;
  /** A pro deal at 17 protects from poaching (Idea 9). */
  dualRegistered: boolean; // eligible to feature for academy AND first team
  mentorId?: string;
  trainingFocus?: string;
  personality: { determination: number; professionalism: number; ambition: number };
  flameOutRisk: number; // 0–1; high potential is never guaranteed
  isProdigy: boolean;
}

/**
 * A youth-scouting contract. The scout watches a country/positions and files a
 * fresh report of several prospects every month until the term (3/6/9 months)
 * runs out. Legacy single-trip fields are kept optional for old saves.
 */
export interface ScoutAssignment {
  scoutId: string;
  positions: Position[]; // 1–3, enforced
  country: string;
  /** Contract term in months (3, 6 or 9). Absent on pre-contract saves. */
  monthsTotal?: number;
  /** How many monthly reports have already been filed. */
  reportsDelivered?: number;
  /** Sim day the next monthly report is due. */
  nextReportDay?: number;
  foundPlayerIds: string[];
  // Legacy single-trip fields (pre-contract model).
  durationRemaining?: number; // matchdays left
  progress?: number; // 0–100
}

/** A scouted-but-unsigned prospect awaiting a trial / academy contract. */
export interface YouthProspect {
  player: Player;
  academy: AcademyPlayer;
  knowledgePct: number; // tightens with more scouting / a trial
  discoveredByClubId: string;
  trialled: boolean;
}

export type YouthCompetitionType = 'youth_league' | 'youth_cup' | 'continental_youth';

export interface YouthCompetition {
  id: string;
  name: string;
  type: YouthCompetitionType;
  countryId: string;
  format: 'round_robin' | 'knockout' | 'group_knockout';
  clubIds: string[];
  year: number;
  championClubId?: string;
  runnerUpClubId?: string;
}
