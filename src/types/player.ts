import type { Attributes, HiddenAttributes, Position } from './attributes';

export type Foot = 'L' | 'R' | 'B';

export type SquadRole =
  | 'KEY' // key player
  | 'FIRST' // first team
  | 'ROTATION'
  | 'BACKUP'
  | 'PROSPECT'
  | 'SURPLUS';

export type InjuryType =
  | 'KNOCK'
  | 'MUSCLE'
  | 'LIGAMENT'
  | 'FRACTURE'
  | 'ILLNESS';

export interface Injury {
  type: InjuryType;
  description: string;
  weeksOut: number;
  occurredOnDay: number; // sim day index
}

export interface ContractBonus {
  type: 'appearance' | 'goal' | 'cleanSheet' | 'promotion' | 'titleWin';
  amount: number; // per-event payout
}

export interface Loan {
  parentClubId: string; // club that owns the player
  untilYear: number; // loan ends at this season's rollover
  wageSplitParent: number; // fraction of wage paid by the parent club (0–1)
  /** Optional agreed fee to sign the player permanently during/after the loan. */
  optionToBuy?: number | null;
}

export interface Contract {
  clubId: string | null; // null = free agent
  wage: number; // per week
  startYear: number;
  expiresYear: number;
  signingBonus: number;
  releaseClause: number | null;
  bonuses: ContractBonus[];
  squadRolePromise?: SquadRole;
}

/** Per-season, per-competition accumulated statistics. */
export interface SeasonStats {
  seasonId: string;
  competitionId: string;
  clubId: string;
  appearances: number;
  starts: number;
  minutes: number;
  goals: number;
  assists: number;
  cleanSheets: number; // GK / defenders
  saves?: number; // goalkeeper saves (optional — absent on pre-update saves)
  yellowCards: number;
  redCards: number;
  avgRating: number; // running average match rating (0–10)
  ratingSum: number; // internal accumulator for avg
  ratingCount: number;
}

export interface AwardRef {
  awardId: string;
  seasonId: string;
  /** Human-readable trophy/award name (e.g. "Premier League", "Ballon d'Or"). */
  label?: string;
}

/** Attribute emphasis a manager can set for a player's individual training. */
export type PlayerTrainingFocus =
  | 'SHOOTING' | 'PASSING' | 'DRIBBLING' | 'DEFENDING' | 'PHYSICAL' | 'GOALKEEPING';

/** Manager-set training plan (own squad only; optional on older saves). */
export interface TrainingPlan {
  focus?: PlayerTrainingFocus | null;
  /** Position being learned; added to `positions` when progress hits 100. */
  retrainPosition?: import('./attributes').Position | null;
  retrainProgress?: number; // 0–100
}

export interface DevelopmentPoint {
  year: number;
  ovr: number;
  pot: number;
}

/**
 * How a player changed over the season just completed, captured at rollover.
 * Powers the green/red movement indicators in the squad view: the OVR swing
 * plus the per-attribute deltas (rounded to the integers the UI shows, so a
 * displayed 78→80 reads as +2). Only attributes that actually moved are kept.
 */
export interface SeasonChange {
  year: number; // season-end year this snapshot was taken at
  ovrFrom: number;
  ovrTo: number;
  attrs: Record<string, number>; // attribute key → integer delta (non-zero only)
}

export interface Player {
  id: string;
  name: { first: string; last: string };
  nationality: string; // ISO-3166 alpha-2 (or 'XX' for generated)
  born: { year: number };
  position: Position; // primary
  positions: Position[]; // all playable
  preferredFoot: Foot;
  height_cm: number;
  weight_kg: number;

  attributes: Attributes;
  hidden: HiddenAttributes;
  potential: number; // hidden ceiling 0–100

  // Derived / dynamic state
  overall: number; // OVR at primary position, cached
  form: number; // -100..100 short-term
  morale: number; // 0..100
  /** Self-importance 0–100. High = more self-centred (shoots more, creates less);
   *  low = more of a team player. Not inherently good or bad. */
  ego?: number;
  fitness: number; // 0..100 match-ready sharpness
  fatigueLoad: number; // 0..100 accumulated load
  injury: Injury | null;
  cards: { yellow: number; red: number; suspendedFor: number };

  contract: Contract;
  value: number; // derived market value
  squadRole: SquadRole;
  /** Manager/AI has listed the player for transfer (M4). */
  transferListed?: boolean;
  /** The player has handed in a transfer request (unhappy — wants to leave). */
  transferRequested?: boolean;
  /** Listed as available for a loan move. */
  loanListed?: boolean;
  /** Active loan: the player is owned by parentClubId but playing for contract.clubId. */
  loan?: Loan | null;
  /** A signed Bosman pre-contract (§ Living market, #34): the player has agreed
   *  to join `toClubId` on a free next summer. He keeps playing for his current
   *  club until the window opens; his club won't renew him. */
  preContract?: { toClubId: string } | null;
  /** A buy-back clause (§ Living market, #33): the club that sold him keeps the
   *  right to re-sign him at a fixed price through `untilYear`. */
  buyBack?: { clubId: string; price: number; untilYear: number } | null;
  /**
   * Academy ownership. Set on prospects in a club's youth academy. Unpromoted
   * academy players have `contract.clubId = null` and this set, keeping them out
   * of first-team/contract code and the squad cap. A dual-registered or promoted
   * youngster has both `contract.clubId` and this set.
   */
  academyClubId?: string;
  /** Club whose academy developed this player (set on graduation) — drives
   *  sell-on profit, training compensation and legacy tracking. */
  academyGraduateOf?: string;

  /** Manager-set individual training (focus + position retraining). */
  training?: TrainingPlan | null;

  stats: SeasonStats[];
  awards: AwardRef[];
  developmentLog: DevelopmentPoint[];
  /** How the player moved over the most recent completed season (rollover). */
  lastSeasonChange?: SeasonChange | null;

  isReal: boolean; // from real dataset vs generated regen
  dataSourceId?: string;
}
