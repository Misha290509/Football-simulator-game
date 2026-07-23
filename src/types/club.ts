import type { Staff, Facilities, TrainingFocus } from './staff';

export type DefensiveTactic = 'DEEP' | 'BALANCED' | 'PRESSING';
export type OffensiveTactic = 'POSSESSION' | 'COUNTER' | 'DIRECT';

/**
 * "Club DNA": a real-club personality that biases results in specific contexts
 * (§ club-personality). Deterministic strength multipliers, not scripted wins —
 * they nudge tendencies (Madrid rise in Europe, Atléti freeze in finals, etc.).
 */
export type ClubTrait =
  | 'CONTINENTAL_KINGS' // overperform in continental knockouts
  | 'CONTINENTAL_CHOKER' // underperform in continental knockouts
  | 'DOMESTIC_FORTRESS' // dominate their own league
  | 'TROPHY_SHY' // freeze in cup/knockout deciders
  | 'BOTTLER' // fade in the title run-in
  | 'CUP_SPECIALIST'; // raise their game in knockouts

export interface Tactics {
  defensive: DefensiveTactic;
  offensive: OffensiveTactic;
  /** Fine-tuning sliders, 0–100, 50 = neutral (absent ⇒ neutral). */
  width?: number;    // narrow ↔ wide
  tempo?: number;    // patient ↔ high-tempo
  pressing?: number; // contain ↔ press high
}

/** A saved team sheet the manager can switch to on the Tactics page. */
export interface LineupPreset {
  name: string;
  formation: string;
  lineup: (string | null)[]; // starting XI by slot index
  bench: string[]; // substitutes' bench, player ids
}

export interface Stadium {
  name: string;
  capacity: number;
}

export interface Finances {
  balance: number;
  transferBudget: number;
  wageBudget: number; // per week
  wageBudgetUsed: number; // per week
}

export interface FinanceSnapshot {
  year: number;
  income: number;
  expenses: number;
  balance: number;
}

export interface Club {
  id: string;
  name: string;
  shortName: string;
  abbrev: string; // 3-letter, e.g. ARS
  countryId: string; // ISO country
  /** Recolorable generic crest seed — never a copyrighted logo (§9). */
  crestSeed: string;
  primaryColor: string;
  secondaryColor: string;
  stadium: Stadium;
  reputation: number; // 0–100, drives generation & finances
  finances: Finances;
  playerIds: string[];
  // Tactical defaults
  formation: string; // e.g. '4-3-3'
  captainId: string | null;
  tactics?: Tactics;
  /** Chosen starting XI by slot index (length 11); null = auto-fill that slot. */
  lineup?: (string | null)[];
  /** Chosen substitutes' bench (up to 9 player ids); eligible to be subbed on. */
  bench?: (string | null)[];
  /** Per-formation-slot player roles (§ Tactics depth), index-aligned to the
   *  slots. Absent ⇒ each slot plays its position's neutral role. */
  roles?: (string | null)[];
  /** When true, the best XI is auto-selected every match. */
  autoMode?: boolean;
  /** When true, Auto-Mode keeps the chosen formation instead of optimizing it. */
  lockFormation?: boolean;
  /** Named team-sheet presets the manager can switch between (e.g. a first XI
   *  and a rotated/rest XI). Each captures formation + starting XI + bench. */
  lineupPresets?: LineupPreset[];
  /** Season-by-season finance history for charts (§8, M4). */
  financeHistory?: FinanceSnapshot[];
  // Depth systems (§8, M5)
  staff?: Staff[];
  facilities?: Facilities;
  trainingFocus?: TrainingFocus;
  /** Real-club personality traits that bias context-specific results. */
  traits?: ClubTrait[];
  /** Designated set-piece takers (player ids). */
  penaltyTakerId?: string | null;
  freeKickTakerId?: string | null;
  cornerTakerId?: string | null;
}