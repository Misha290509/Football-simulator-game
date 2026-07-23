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

/** Season-objective kinds — all evaluable from accumulated season stats. */
export type SeasonObjectiveKind = 'GOALS' | 'ASSISTS' | 'APPS' | 'AVG_RATING';

/** A season-long objective set by the club/manager (gates status, feeds
 *  contract leverage in later tiers). Legacy Tier-1 saves may carry only
 *  `text`/`met`; the kind/target/progress fields are optional for that reason. */
export interface CareerObjective {
  text: string;
  kind?: SeasonObjectiveKind;
  target?: number;
  progress?: number;
  met: boolean;
}

/** Per-match objective kinds — all evaluable from a single match's playerStats
 *  plus the scoreline (no data we don't already record). */
export type MatchObjectiveKind =
  | 'GOAL' | 'ASSIST' | 'SHOTS' | 'RATING' | 'CLEAN_SHEET' | 'SAVES' | 'WIN' | 'MINUTES';

/** A pre-match objective the manager sets for the avatar; evaluated afterwards. */
export interface MatchObjective {
  matchId: string;
  text: string;
  kind: MatchObjectiveKind;
  target: number;
  met?: boolean;
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

/** A snapshot of the avatar's most recent appearance, for the match summary. */
export interface AvatarMatchSummary {
  day: number;
  opponent: string;
  home: boolean;
  competition?: string;
  minutes: number;
  rating: number;
  goals: number;
  assists: number;
  teamGoals: number;
  oppGoals: number;
  result: 'W' | 'D' | 'L';
  /** How the manager's pre-match objectives for this game turned out. */
  objectives?: { text: string; met: boolean }[];
  /** Net manager-trust change from this match (rating + objectives). */
  trustDelta?: number;
}

/** A squad-status transition, for the arc/timeline. */
export interface StatusChange {
  day: number;
  from: SquadStatus;
  to: SquadStatus;
  reason: string;
}

/** A promise the manager made to the avatar in a conversation. */
export interface CareerPromise {
  text: string;
  kind: 'PLAYING_TIME' | 'NATURAL_POSITION' | 'CAPTAINCY' | 'NEW_DEAL';
  deadline: number; // sim day by which it must be honoured
  kept?: boolean; // set once evaluated
}

/** A pending choice-driven manager conversation surfaced in the feed. */
export interface ConversationChoice {
  text: string;
  trust?: number;
  morale?: number;
  relationship?: number;
  promise?: CareerPromise['kind'];
}
export interface Conversation {
  id: string;
  trigger: string;
  prompt: string;
  choices: ConversationChoice[];
}

/** The avatar's rival for the starting shirt at their position. */
export interface CareerRival {
  playerId: string;
  relationship: number; // −100 bitter … +100 friendly
}

/** A tournament the avatar was named in a national squad for. */
export interface TournamentSquad {
  competition: string;
  season: string;
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
  objectives: CareerObjective[]; // season-long objectives
  /** Pre-match objectives for the avatar's upcoming/most-recent fixtures. */
  matchObjectives?: MatchObjective[];
  traits: string[]; // earned perks (Tier 2+)
  personality: CareerPersonality;

  // --- Off-pitch (Tier 4) ----------------------------------------------------
  agentId?: string;
  sponsorships: Sponsorship[];
  international: InternationalRecord;

  /** The avatar's hired agent (null/absent ⇒ self-represented). */
  agent?: import('./playerOffPitch').PlayerAgent | null;
  /** AI clubs' standing interest in signing the avatar (earned by form). */
  transferInterest?: import('./playerOffPitch').ClubInterest[];
  /** Live transfer pursuits (rumour → bid → personal terms). */
  activeSagas?: import('./playerOffPitch').TransferSaga[];
  /** Concrete contract offers on the table (renewals + transfers). */
  contractOffers?: import('./playerOffPitch').ContractOffer[];
  /** Has the avatar handed in a transfer request? (raises interest, drops rel.) */
  transferRequestPending?: boolean;
  /** Active loan away from the parent club, if any. */
  loanSpell?: import('./playerOffPitch').LoanSpell | null;
  /** Loan offers awaiting a decision. */
  loanOffers?: import('./playerOffPitch').LoanOffer[];
  /** Public persona + controversy meter. */
  publicImage?: import('./playerOffPitch').PublicImage;
  /** History of press answers (for narrative callbacks). */
  pressHistory?: import('./playerOffPitch').PressRecord[];
  /** A press prompt awaiting the player's answer. */
  pendingPress?: import('./playerOffPitch').PressPrompt[];
  /** Sponsorship offers awaiting a decision. */
  pendingSponsorOffers?: import('./playerOffPitch').SponsorOffer[];
  /** Weekly set-and-forget time budget. */
  lifestyle?: import('./playerOffPitch').Lifestyle;
  /** Lifetime career earnings (wages + bonuses + sponsorships). */
  careerEarnings?: number;

  // --- Legacy & endgame (Tier 5) ---------------------------------------------
  /** Personal ambitions checklist, evaluated from real career data. */
  ambitions?: import('./playerLegacy').CareerAmbition[];
  /** The nominated dream club (drives the dream-move saga). */
  dreamClubId?: string;
  /** The graceful-decline arc into a veteran game. */
  decline?: import('./playerLegacy').DeclineState;
  /** Late-unlocked veteran traits (leadership/game-reading compensation). */
  veteranTraits?: string[];
  /** The squad-elder role arc within the decline. */
  roleEvolution?: import('./playerLegacy').RoleEvolution;
  /** The retirement decision + farewell + send-off bookkeeping. */
  retirement?: import('./playerLegacy').RetirementState;
  /** The computed, transparent legacy (score, identities, HoF, peer rank). */
  legacy?: import('./playerLegacy').LegacyState;
  /** What the human chose to do after the playing career ended. */
  continuation?: import('./playerLegacy').Continuation;
  /** Active late-career mentorships of young players. */
  mentorships?: import('./playerLegacy').Mentorship[];

  // --- Manager relationship & standing (Tier 2) ------------------------------
  /** Optional breakdown of what's driving trust, for the UI. */
  trustFactors?: { ratings: number; objectives: number; talks: number; discipline: number; form: number };
  /** Squad-status transitions over the career. */
  statusHistory?: StatusChange[];
  /** Live promises the manager has made. */
  promises?: CareerPromise[];
  /** Choice-driven conversations awaiting the player's answer. */
  pendingConversations?: Conversation[];

  // --- The shirt battle (Tier 2) ---------------------------------------------
  rival?: CareerRival | null;

  // --- Adversity (Tier 2) ----------------------------------------------------
  confidence?: number; // 0–100 slump mechanic
  matchSharpness?: number; // 0–100, drops after an injury, recovers with minutes

  // --- International (Tier 2) ------------------------------------------------
  intlManagerTrust?: number;
  tournamentSquads?: TournamentSquad[];

  // --- Development (Tier 2) --------------------------------------------------
  /** Progress 0–100 toward the nearest not-yet-earned trait. */
  traitProgress?: Record<string, number>;

  // --- Interactive matches (Tier 3) -----------------------------------------
  /** Lifetime interactive key-moment stats. */
  momentStats?: import('./interactiveMatch').MomentStats;

  // --- Timeline & legacy -----------------------------------------------------
  milestones: CareerMilestone[];
  seasonHistory: CareerSeasonRecord[];
  /** The avatar's most recent appearance (for the match-summary card). */
  lastMatch?: AvatarMatchSummary | null;
}
