// ---------------------------------------------------------------------------
// Match + event timeline (§7A). Match results are produced by the pure engine.
// ---------------------------------------------------------------------------

export type MatchEventType =
  | 'KICKOFF'
  | 'GOAL'
  | 'BIG_CHANCE'
  | 'SHOT'
  | 'SAVE'
  | 'YELLOW'
  | 'RED'
  | 'INJURY'
  | 'SUB'
  | 'PENALTY'
  | 'COMMENTARY' // ambient live commentary (no discrete event)
  | 'HALFTIME'
  | 'FULLTIME';

export interface MatchEvent {
  minute: number;
  type: MatchEventType;
  /** Club the event belongs to ('home' | 'away'). */
  side: 'home' | 'away';
  playerId?: string;
  assistPlayerId?: string;
  description: string;
}

export interface PlayerMatchStat {
  playerId: string;
  minutes: number;
  goals: number;
  assists: number;
  shots: number;
  rating: number; // 0–10
  yellow: boolean;
  red: boolean;
  saves?: number; // goalkeeper saves (optional — absent on pre-update matches)
}

export interface Match {
  id: string;
  competitionId: string;
  seasonId: string;
  round: number;
  day: number; // sim day index
  homeClubId: string;
  awayClubId: string;
  played: boolean;
  homeGoals: number;
  awayGoals: number;
  homeXg: number;
  awayXg: number;
  events: MatchEvent[];
  playerStats: PlayerMatchStat[];
  seed: number; // per-match seed for deterministic replay
  /** True for promotion-playoff / knockout ties (no league points). */
  neutral?: boolean;
  /** Display label for continental rounds (e.g. "League Phase", "Quarter-final"). */
  stageLabel?: string;
  /** Match-day weather (§ Match realism) — cosmetic + small sim effect. */
  weather?: 'CLEAR' | 'RAIN' | 'WIND' | 'SNOW' | 'HOT';
  /** The match referee (§ Match realism). */
  referee?: string;
}

/**
 * Pre-computed, serializable team strength + contribution pools. Built on the
 * main thread from a club's squad, then passed to the (pure) sim worker so the
 * engine never touches the full player graph.
 */
export interface LineupProfile {
  clubId: string;
  /** The shape being played — drives the formation-matchup edge (§ Tactics depth). */
  formation: string;
  attack: number; // 0–100
  defense: number;
  midfield: number;
  gk: number;
  aggression: number; // team mean, drives card frequency
  /** Weighted pools for attributing goals / assists to players. */
  scorers: { playerId: string; weight: number }[];
  creators: { playerId: string; weight: number }[];
  starters: string[]; // 11 player ids (for ratings/minutes)
  gkId: string | null;
  defenderIds: string[];
  /** Tactic-driven shot-volume and chance-quality multipliers (default 1). */
  shotVolumeMod: number;
  chanceQualityMod: number;
  /** Substitutes eligible to be brought on during the match (best first). */
  bench: BenchEntry[];
}

export interface BenchEntry {
  playerId: string;
  ovr: number;
  scorerWeight: number;
  creatorWeight: number;
}
