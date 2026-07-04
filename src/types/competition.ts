// ---------------------------------------------------------------------------
// Competition + per-competition rule config (§1A, §7B). Everything that varies
// between leagues is data here — not branches in the engine.
// ---------------------------------------------------------------------------

export type CompetitionFormat =
  | 'round_robin'
  | 'knockout'
  | 'group_knockout'
  | 'conference_playoff';

export type Confederation =
  | 'UEFA'
  | 'CONMEBOL'
  | 'CONCACAF'
  | 'AFC';

export type Tiebreaker =
  | 'points'
  | 'goalDifference'
  | 'goalsFor'
  | 'headToHead'
  | 'wins';

export interface PromotionRule {
  /** Number of clubs auto-promoted to the tier above. */
  autoPromote: number;
  /** Number of clubs auto-relegated to the tier below. */
  autoRelegate: number;
  /** Extra promotion playoff slots (e.g. Championship 4 → 1). */
  promotionPlayoffSlots: number;
  /** Relegation playoff slots (e.g. Bundesliga 16th-place playoff). */
  relegationPlayoffSlots: number;
}

export interface ConferenceConfig {
  /** Names of conferences, e.g. ['East', 'West'] for MLS. */
  names: string[];
  /** How many clubs from each conference enter the playoff bracket. */
  playoffQualifiersPerConference: number;
}

export interface Competition {
  id: string;
  name: string;
  countryId: string;
  confederation: Confederation;
  format: CompetitionFormat;
  tier: number; // 1 = top division
  numClubs: number;
  /** Each pair plays this many times (2 = standard home/away double RR). */
  rounds: number;
  tiebreakers: Tiebreaker[];
  promotion: PromotionRule | null;
  conferences: ConferenceConfig | null; // non-null for MLS-style
  /** Club ids participating this season (populated when a season starts). */
  clubIds: string[];
}
