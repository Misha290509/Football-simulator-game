import type { Competition } from './competition';
import type { ContinentalState } from './continental';
import type { DomesticCupState } from './cup';
import type { BoardState } from './staff';
import type { Academy, AcademyPlayer, ScoutAssignment, YouthProspect, YouthCompetition } from './academy';

export interface StandingRow {
  clubId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  /** Conference key for MLS-style competitions, else undefined. */
  conference?: string;
}

export interface Standings {
  competitionId: string;
  seasonId: string;
  rows: StandingRow[];
}

export interface Season {
  id: string;
  year: number; // starting calendar year of the season
  label: string; // e.g. "2024/25"
  competitionIds: string[];
  current: boolean;
  finished: boolean;
}

export type NewsCategory =
  | 'BOARD'
  | 'TRANSFER'
  | 'INJURY'
  | 'RESULT'
  | 'AWARD'
  | 'MILESTONE'
  | 'GENERAL';

export interface NewsItem {
  id: string;
  day: number;
  category: NewsCategory;
  title: string;
  body: string;
  read: boolean;
}

export type AwardType =
  // Club honours
  | 'LEAGUE_CHAMPION'
  | 'DOMESTIC_CUP'
  | 'CONTINENTAL'
  | 'MANAGER_OF_YEAR'
  // Season-end individual honours (resolved at rollover)
  | 'GOLDEN_BOOT'          // per-league top scorer
  | 'GLOBAL_GOLDEN_BOOT'   // worldwide, coefficient-weighted (European Golden Shoe style)
  | 'PLAYMAKER'            // top assister
  | 'PLAYER_OF_SEASON'     // per-league best player
  | 'CONFED_POTY'          // per-confederation player of the year
  | 'UEFA_POTY'            // best player across the European club competitions
  | 'CONTINENTAL_BEST'     // best player of a single continental competition (CL/EL/Conf)
  | 'TEAM_OF_SEASON'       // a slot in the World XI
  // The autumn gala (deferred to late October, honouring the prior season)
  | 'GLOBAL_BEST'          // Ballon d'Or
  | 'KOPA'                 // best under-21 player
  | 'YASHIN'               // best goalkeeper
  | 'PUSKAS'               // best goal
  // International tournament honours
  | 'GOLDEN_BALL'          // player of the tournament (World Cup)
  | 'GOLDEN_GLOVE'         // best goalkeeper (World Cup)
  | 'WC_YOUNG_PLAYER'      // best young player (World Cup)
  | 'TOURNAMENT_BEST'      // player of a Euros / Copa América
  // Legacy — retained for older saves' history entries
  | 'YOUNG_PLAYER';

export interface Award {
  type: AwardType;
  label: string;
  seasonId: string;
  competitionId?: string;
  playerId?: string;
  clubId?: string;
  value?: number; // e.g. goals for the golden boot
  slot?: string; // position slot, for Team-of-the-Season entries
  note?: string; // short human context (e.g. "18 goals, 11 assists")
}

/** A live transfer negotiation for one target: the club's drifting public ask
 *  vs its hidden floor, plus the round count, so talks resume and grade. */
export interface TransferTalk {
  playerId: string;
  clubId: string;
  /** Hidden lowest cash fee the club will actually accept. */
  floor: number;
  /** The club's current (overpriced) ask; drifts toward the floor as you haggle. */
  ask: number;
  /** The first ask, kept for grading how far you talked them down. */
  initialAsk: number;
  rounds: number;
}

/** One year's slice of an installment transfer fee. */
export interface InstalmentPayment {
  /** Season year the payment falls due (deducted at that rollover). */
  dueYear: number;
  /** The manager's club pays; the selling club (if any) receives. */
  payerClubId: string;
  payeeClubId: string | null;
  amount: number;
  playerName: string;
}

/** A transfer agreed while the window was shut; the player joins when it opens. */
export interface PendingArrival {
  playerId: string;
  toClubId: string;
  fee: number;
  wage: number;
  years: number;
  releaseClause: number | null;
  playerName: string;
  /** Human label of the window he'll arrive in, e.g. "January" or "the summer". */
  arriveLabel: string;
}

/** The deferred autumn awards gala (Ballon d'Or & co.), announced in October. */
export interface GalaCeremony {
  seasonId: string;   // the season being honoured
  year: number;       // that season's year
  announceDay: number; // sim-day (in the following season) the gala fires
  awards: Award[];
  announced: boolean;
}

export type Difficulty = 'RELAXED' | 'NORMAL' | 'HARD';

export interface SeasonHistory {
  seasonId: string;
  year: number;
  label: string;
  awards: Award[];
}

export interface TransferOffer {
  id: string;
  type: 'BUY' | 'LOAN';
  playerId: string;
  fromClubId: string; // AI club making the offer
  fee: number; // transfer fee (BUY)
  wage: number; // wage the buyer/loanee will pay
  loanUntilYear?: number;
  wageSplitParent?: number;
  day: number;
}

// --- Press conferences (§ Boardroom & media) -------------------------------
export type PressTone = 'HUMBLE' | 'CONFIDENT' | 'DEFIANT' | 'CRITICAL' | 'DEFLECT';
export interface PressQuestion {
  id: string;
  prompt: string;
  options: { tone: PressTone; label: string }[];
}
export interface ResultContext {
  outcome: 'WIN' | 'LOSS' | 'DRAW';
  margin: number;
  opponentName: string;
}
export interface PendingPress {
  question: PressQuestion;
  ctx: ResultContext;
}

/** A spell managing one club (§ Manager career). */
export interface ManagerStint {
  clubId: string;
  clubName: string;
  fromYear: number;
  toYear?: number; // undefined = current
  seasons: number;
  trophies: number;
  reasonLeft?: 'RESIGNED' | 'HEADHUNTED' | 'SACKED';
}

/** A job offer / vacancy the manager can accept (§ Manager career). */
export interface JobOffer {
  id: string;
  clubId: string;
  clubName: string;
  clubReputation: number;
  leagueName: string;
  reason: string;
  day: number;
}

// --- Scouting the transfer market (§ Market) -------------------------------
/** A completed scout's read on a market target — a biased point estimate. */
export interface ScoutReport {
  playerId: string;
  estOverall: number;
  estPotential: number;
  estValue: number;
  stars: number;        // scout confidence, 1–5
  day: number;          // day the report landed
  scoutName: string;
}
/** A scout dispatched to assess a specific player; resolves after `dueDay`. */
export interface PlayerScoutAssignment {
  scoutId: string;
  playerId: string;
  startDay: number;
  dueDay: number;
}

// --- International tournaments (§ Internationals) --------------------------
export type TournamentKind = 'WORLD_CUP' | 'EUROS' | 'COPA';

export interface IntlGroupRow {
  nation: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
}
export interface IntlGroup {
  name: string; // "Group A"
  rows: IntlGroupRow[]; // ranked
}
export interface IntlTie {
  round: string; // "Round of 32", "Quarter-final", "Final", …
  homeNation: string;
  awayNation: string;
  homeGoals: number;
  awayGoals: number;
  winner: string;
  pens?: [number, number]; // shootout score if drawn after 90'
}
export interface IntlScorer {
  name: string;
  nation: string;
  count: number;
  playerId?: string; // set when a real dataset player
}
/** A completed international tournament, serialized into the save. */
export interface TournamentSummary {
  kind: TournamentKind;
  name: string; // "World Cup 2026"
  year: number;
  championNation: string;
  runnerUpNation: string;
  groups: IntlGroup[];
  knockout: IntlTie[];
  topScorers: IntlScorer[];
  topAssisters: IntlScorer[];
  participants: string[];
}

export interface HallOfFameEntry {
  playerId: string;
  name: string;
  nationality: string;
  peakOvr: number;
  inductedYear: number;
  lastClubName: string;
  awardCount: number;
}

/**
 * The complete persistent state of a single save (a "league"/career).
 * Entities are referenced by stable id; this is the serialization root.
 */
export interface SaveGame {
  id: string;
  name: string;
  seed: number;
  createdAt: number;
  schemaVersion: number;

  // The human player's context
  managerClubId: string;
  managerName: string;

  // Calendar
  currentDay: number; // sim day index since save start
  startYear: number;

  /** Per-save overall rating ceiling (~89–91); caps generation & development. */
  ratingCap?: number;

  // Entities (stored as records keyed by id)
  competitions: Record<string, Competition>;
  seasons: Record<string, Season>;

  /** Unified news/inbox feed (§8). Newest items appended last. */
  news: NewsItem[];

  /** Player-knowledge from scouting: playerId → 0–100 (§8, M5). */
  scouting?: Record<string, number>;
  /** Completed scout reports on market targets (biased point estimates). */
  scoutReports?: Record<string, ScoutReport>;
  /** Scouts currently out assessing specific market targets. */
  playerScoutAssignments?: PlayerScoutAssignment[];
  /** Season-by-season honours archive (§8, M6). */
  history?: SeasonHistory[];
  /** Hall of Fame inductees (§8, M6). */
  hallOfFame?: HallOfFameEntry[];
  /** Retired shirt numbers honouring player-career legends (Tier 5), by club. */
  retiredShirts?: { clubId: string; number: number; playerId: string; playerName: string; year: number }[];
  /** Board objective & job security for the manager's club (§8, M5). */
  board?: BoardState;
  /** Set true when the manager is dismissed. */
  sacked?: boolean;
  /** Incoming AI offers for the manager's transfer/loan-listed players. */
  pendingOffers?: TransferOffer[];

  // --- Academy system (§ Academy) ----------------------------------------
  /** Per-club youth academies, keyed by clubId. */
  academies?: Record<string, Academy>;
  /** Per-player academy overlay, keyed by playerId. */
  academyPlayers?: Record<string, AcademyPlayer>;
  /** Active interactive scouting trips. */
  scoutAssignments?: ScoutAssignment[];
  /** Discovered-but-unsigned youth prospects (manager club). */
  youthProspects?: YouthProspect[];
  /** Youth competitions for the current season. */
  youthCompetitions?: Record<string, YouthCompetition>;
  /** Man-management: last day the manager interacted with a player (cooldown). */
  lastInteraction?: Record<string, number>;
  /** Player ids the manager has shortlisted (QoL). */
  shortlist?: string[];

  // --- International management (§ Internationals) ------------------------
  /** Reigning World Cup holder. */
  worldChampion?: { nation: string; year: number } | null;
  /** Past World Cup winners. */
  internationalHistory?: { year: number; nation: string }[];
  /** Most recent international tournaments (World Cup / Euros / Copa America). */
  lastTournaments?: TournamentSummary[];
  /** National team the manager also leads (nation name), if any. */
  nationalJob?: string | null;
  /** International honours won as a national-team manager. */
  nationalTrophies?: { name: string; year: number }[];

  // --- Continental club competitions (§ Continental) ---------------------
  /** In-progress continental competitions this season, keyed by id. */
  continental?: Record<string, ContinentalState>;
  /** In-progress domestic cups + Super Cup this season, keyed by id. */
  domesticCups?: Record<string, DomesticCupState>;
  /** Reigning domestic cup holders, keyed by cup id. */
  cupHolders?: Record<string, { clubId: string; year: number }>;
  /** Reigning continental champions, keyed by competition id. */
  continentalChampions?: Record<string, { clubId: string; year: number }>;
  /** Past continental winners (for a roll of honour). */
  continentalHistory?: { id: string; name: string; year: number; clubId: string }[];
  /** Evolving UEFA country coefficients that drift with European results. */
  countryCoefficients?: Record<string, number>;
  /** Unlocked achievements, keyed by achievement id → year unlocked. */
  achievements?: Record<string, number>;
  /** Deferred autumn awards gala (Ballon d'Or et al.), pending its October date. */
  pendingGala?: GalaCeremony | null;
  /** Reigning Ballon d'Or holder, set when the autumn gala is announced. */
  ballonDor?: { playerId: string; name: string; year: number } | null;
  /** Stored AI-manager churn (defaults are derived; only changes live here). */
  aiManagers?: Record<string, import('../game/aiManagers').AiManager>;
  /** The human manager's tactic win counters → style tags. */
  managerStyle?: Record<string, number>;
  /** Persistent backroom-staff market (free agents you can hire), refreshable. */
  staffMarket?: import('./staff').Staff[];
  /** Staff-market refreshes used within the current window (max 3). */
  staffRefreshes?: { windowKey: string; used: number };
  /** Deals agreed while the window was shut — paid now, the player joins on open. */
  pendingArrivals?: PendingArrival[];
  /** Clubs that broke off transfer talks after an insulting bid, keyed by
   *  playerId → the window (or shut-window day) the snub happened in. They
   *  refuse to negotiate again until the window moves on. Cleared at rollover. */
  brokenTalks?: Record<string, { key: string | null; day: number }>;
  /** Youth-coach candidates who walked out of wage talks (id → day walked). */
  walkedStaff?: Record<string, number>;
  /** How each club feels about the manager's transfer haggling, keyed by clubId.
   *  Tension rises with lowball offers; at 100 the club refuses to talk until
   *  `refuseUntil`, after which it resets to a calmer baseline. */
  clubRelations?: Record<string, { tension: number; refuseUntil?: number }>;
  /** Live transfer talks the manager has open, keyed by target playerId. Holds
   *  the club's drifting ask and the hidden floor so a negotiation can be
   *  resumed and graded on completion. */
  transferTalks?: Record<string, TransferTalk>;
  /** Scheduled installment payments on agreed transfers (deducted per year). */
  installments?: InstalmentPayment[];
  /** Clubs whose job offers the manager turned down (so fresh approaches come
   *  from elsewhere). Cleared when a job is taken or the season rolls over. */
  declinedJobClubIds?: string[];
  /** Long-running story arcs (wonderkid, nemesis, sagas, objective memory). */
  storylines?: import('../game/storylines').StorylineState;
  /** Active challenge scenario for this save, if the career started as one. */
  challenge?: import('../game/challenges').ChallengeState;
  /** Chosen challenge/difficulty for this save. */
  difficulty?: Difficulty;

  // --- Financial Fair Play (§ Structure) ---------------------------------
  /** FFP standing for the manager's club: consecutive breaches + sanctions. */
  ffp?: { strikes: number; embargo: boolean };
  /** League points deducted from a club this season (FFP sanction), keyed by clubId. */
  pointsPenalties?: Record<string, number>;
  /** God Mode currently active (sandbox tools usable). */
  godModeEnabled?: boolean;
  /** Permanent record: this save has used God Mode at some point. */
  godModeUsed?: boolean;

  // --- Manager career (§ Manager career) ---------------------------------
  /** The manager's own reputation (0–100), separate from club reputation. */
  managerReputation?: number;
  /** Career history: every club the manager has led. */
  managerStints?: ManagerStint[];
  /** Pending job offers the manager can accept or decline. */
  jobOffers?: JobOffer[];

  // --- Boardroom & media (§ Boardroom) -----------------------------------
  /** Day of the manager's last board request (cooldown). */
  lastBoardRequest?: number;
  /** A press question awaiting the manager's answer. */
  pendingPress?: PendingPress | null;

  // --- Player Career mode (§ Player Career) ------------------------------
  /** Which seat the human occupies. Absent ⇒ 'MANAGER' (every existing save). */
  careerMode?: import('./playerCareer').CareerMode;
  /** The be-a-player career state; present only when careerMode === 'PLAYER'. */
  playerCareer?: import('./playerCareer').PlayerCareer;
  /** Tier-3 interactive-match settings (input mode, timers, on/off). */
  careerSettings?: import('./interactiveMatch').CareerSettings;
  // Clubs and players are kept in separate Dexie tables for performance,
  // but a fully-exported save inlines them (see import/export).
}
