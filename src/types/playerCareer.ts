// ---------------------------------------------------------------------------
// Player Career Mode (§ Player Career). Types for the "be-a-player" career: a
// save either follows a manager (the default, historical mode) or a single
// avatar footballer. All of this hangs off the save meta via `careerMode` and
// `playerCareer` (see SaveGame) and is absent on every existing manager save.
//
// The full shape is defined up-front (per the master spec) so later tiers don't
// reshape it; Tier 1 only populates the core fields (playerId / origin /
// archetype, managerTrust, status, season tallies, milestones). Fields for
// later tiers are optional or start at sensible zero values.
// ---------------------------------------------------------------------------

/** Which seat the human occupies. Absent on a save ⇒ 'MANAGER' (all old saves). */
export type CareerMode = 'MANAGER' | 'PLAYER';

/** How the avatar entered the world. */
export type PlayerCareerOrigin = 'ACADEMY' | 'EXISTING' | 'CREATED';

/** Squad-status ladder — the arc from academy hopeful to club captain. */
export type SquadStatus = 'YOUTH' | 'PROSPECT' | 'ROTATION' | 'KEY' | 'STAR' | 'CAPTAIN';

/** A dated line on the player's personal timeline (debut, first goal, …). */
export interface CareerMilestone {
  day: number;
  text: string;
}

/** A per-match or per-season objective set by the club/manager. */
export interface CareerObjective {
  text: string;
  met: boolean;
}

/** A boot/brand deal (Tier 4). */
export interface Sponsorship {
  brand: string;
  value: number;
  until: number; // year
}

/** International career tallies (Tier 2+). */
export interface InternationalRecord {
  capped: boolean;
  caps: number;
  intlGoals: number;
}

/** Off-pitch personality that shapes development + narrative (Tier 2+). */
export interface CareerPersonality {
  professionalism: number;
  ambition: number;
  loyalty: number;
  temperament: number;
}

/** One completed season of the avatar's career, for the timeline/legacy view. */
export interface CareerSeasonRecord {
  season: string; // label, e.g. "2025/26"
  club: string;
  apps: number;
  goals: number;
  assists: number;
  avgRating: number;
  honours: string[];
}

/**
 * The complete player-career state. Lives on the save meta (`playerCareer`).
 * The avatar itself is a normal `Player` in `world.players`, referenced by
 * `playerId`; this block holds only the personal, be-a-player systems layered
 * on top.
 */
export interface PlayerCareer {
  /** Avatar = a real Player in world.players. */
  playerId: string;
  origin: PlayerCareerOrigin;
  archetype: string;

  // --- Selection & standing --------------------------------------------------
  managerTrust: number; // 0–100 → drives selection
  status: SquadStatus;
  clubRelationship: number; // 0–100
  fanRating: number; // 0–100
  following: number; // social reach / reputation

  // --- Season HUD (reset each season) ---------------------------------------
  seasonGoals: number;
  seasonApps: number;
  seasonAvgRating: number;

  // --- Development & standing ------------------------------------------------
  objectives: CareerObjective[];
  traits: string[]; // earned perks (Tier 2+)
  personality: CareerPersonality;

  // --- Off-pitch (Tier 4) ----------------------------------------------------
  agentId?: string;
  sponsorships: Sponsorship[];
  international: InternationalRecord;

  // --- Timeline & legacy -----------------------------------------------------
  milestones: CareerMilestone[];
  seasonHistory: CareerSeasonRecord[];
}
