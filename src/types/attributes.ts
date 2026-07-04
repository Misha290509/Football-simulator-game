// ---------------------------------------------------------------------------
// Attributes & ratings (§6). All internal values are integers 0–100.
// ---------------------------------------------------------------------------

// FIFA-style position codes. Centre-backs are split by foot: a LCB is a
// left-footed centre-back (left side of a back four), a RCB right-footed.
export type Position =
  | 'GK'
  | 'LB' // left back
  | 'LCB' // left (left-footed) centre back
  | 'RCB' // right (right-footed) centre back
  | 'RB' // right back
  | 'CDM' // defensive midfield
  | 'CM' // central midfield
  | 'CAM' // attacking midfield
  | 'LM' // left midfield
  | 'RM' // right midfield
  | 'LW' // left wing
  | 'RW' // right wing
  | 'ST'; // striker

export const ALL_POSITIONS: Position[] = [
  'GK',
  'LB',
  'LCB',
  'RCB',
  'RB',
  'CDM',
  'CM',
  'CAM',
  'LM',
  'RM',
  'LW',
  'RW',
  'ST',
];

/** Broad role buckets used for squad views and depth charts. */
export type PositionGroup = 'GK' | 'DEF' | 'MID' | 'ATT';

export const POSITION_GROUP: Record<Position, PositionGroup> = {
  GK: 'GK',
  LB: 'DEF',
  LCB: 'DEF',
  RCB: 'DEF',
  RB: 'DEF',
  CDM: 'MID',
  CM: 'MID',
  CAM: 'MID',
  LM: 'MID',
  RM: 'MID',
  LW: 'ATT',
  RW: 'ATT',
  ST: 'ATT',
};

/**
 * Mirror-side counterpart for a slot (left↔right). Used to model the small
 * penalty a player takes when fielded on his wrong side (e.g. a natural LB at
 * RB, or a left-footed centre-back at RCB).
 */
export const MIRROR_POSITION: Partial<Record<Position, Position>> = {
  LB: 'RB', RB: 'LB',
  LCB: 'RCB', RCB: 'LCB',
  LM: 'RM', RM: 'LM',
  LW: 'RW', RW: 'LW',
};

/**
 * Legacy (pre-FIFA) internal codes → new codes. Used to migrate old saves and
 * to translate the baked real-data dataset, which still ships the old tokens.
 * A generic centre-back ('DC') resolves to LCB/RCB by the player's foot.
 */
const LEGACY_POSITION_MAP: Record<string, Position> = {
  GK: 'GK', DL: 'LB', DR: 'RB', DM: 'CDM', MC: 'CM',
  ML: 'LM', MR: 'RM', AMC: 'CAM', AML: 'LW', AMR: 'RW', ST: 'ST',
};

/** Translate a possibly-legacy position code to a current one (idempotent). */
export function translateLegacyPosition(code: string, foot?: string): Position {
  if (code === 'DC') return foot === 'L' ? 'LCB' : 'RCB';
  return LEGACY_POSITION_MAP[code] ?? (code as Position);
}

// Each group carries an index signature so it can be consumed generically as
// Record<string, number> by UI tables and the generator. The exhaustive key
// list lives in AttributeKey below (kept in sync manually).
// Industry-standard ~34-attribute taxonomy (FIFA/EA FC style) so real datasets
// map 1:1. Grouped into four buckets for display; the index signature lets each
// be consumed generically as Record<string, number>.
export interface TechnicalAttributes {
  [key: string]: number;
  crossing: number;
  finishing: number;
  headingAccuracy: number;
  shortPassing: number;
  longPassing: number;
  volleys: number;
  dribbling: number;
  curve: number;
  fkAccuracy: number;
  ballControl: number;
  shotPower: number;
  longShots: number;
  penalties: number;
}

export interface MentalAttributes {
  [key: string]: number;
  aggression: number;
  interceptions: number;
  positioning: number; // attacking off-ball positioning
  vision: number;
  composure: number;
  reactions: number;
  standingTackle: number;
  slidingTackle: number;
  marking: number; // defensive awareness
}

export interface PhysicalAttributes {
  [key: string]: number;
  acceleration: number;
  sprintSpeed: number;
  agility: number;
  balance: number;
  jumping: number;
  stamina: number;
  strength: number;
}

export interface GoalkeepingAttributes {
  [key: string]: number;
  gkDiving: number;
  gkHandling: number;
  gkKicking: number;
  gkPositioning: number;
  gkReflexes: number;
}

export interface Attributes {
  technical: TechnicalAttributes;
  mental: MentalAttributes;
  physical: PhysicalAttributes;
  goalkeeping: GoalkeepingAttributes;
}

export interface HiddenAttributes {
  injuryProneness: number; // higher = injures more often
  consistency: number; // higher = less match-to-match variance
  bigGame: number; // temperament in big matches
  ambition: number;
  professionalism: number; // affects development & morale
  versatility: number; // ability to play out of position
}

/**
 * Flat union of every visible attribute key, used by generic UI tables and the
 * OVR weighting tables. Declared explicitly (not via keyof) because each group
 * carries an index signature for generic consumption.
 */
export type AttributeKey =
  // technical
  | 'crossing' | 'finishing' | 'headingAccuracy' | 'shortPassing' | 'longPassing'
  | 'volleys' | 'dribbling' | 'curve' | 'fkAccuracy' | 'ballControl' | 'shotPower'
  | 'longShots' | 'penalties'
  // mental
  | 'aggression' | 'interceptions' | 'positioning' | 'vision' | 'composure'
  | 'reactions' | 'standingTackle' | 'slidingTackle' | 'marking'
  // physical
  | 'acceleration' | 'sprintSpeed' | 'agility' | 'balance' | 'jumping' | 'stamina' | 'strength'
  // goalkeeping
  | 'gkDiving' | 'gkHandling' | 'gkKicking' | 'gkPositioning' | 'gkReflexes';

/** Keys grouped, for generators and importers. */
export const TECHNICAL_KEYS: AttributeKey[] = [
  'crossing', 'finishing', 'headingAccuracy', 'shortPassing', 'longPassing', 'volleys',
  'dribbling', 'curve', 'fkAccuracy', 'ballControl', 'shotPower', 'longShots', 'penalties',
];
export const MENTAL_KEYS: AttributeKey[] = [
  'aggression', 'interceptions', 'positioning', 'vision', 'composure', 'reactions',
  'standingTackle', 'slidingTackle', 'marking',
];
export const PHYSICAL_KEYS: AttributeKey[] = [
  'acceleration', 'sprintSpeed', 'agility', 'balance', 'jumping', 'stamina', 'strength',
];
export const GOALKEEPING_KEYS: AttributeKey[] = [
  'gkDiving', 'gkHandling', 'gkKicking', 'gkPositioning', 'gkReflexes',
];
