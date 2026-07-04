// ---------------------------------------------------------------------------
// Versioned, swappable dataset schema (§9). The app ships a structural dataset
// (league/club facts) and generates player attributes via the fallback
// generator. Users may supply their own appropriately-licensed dataset that
// conforms to this shape.
// ---------------------------------------------------------------------------

import type { Attributes, HiddenAttributes, Position } from './attributes';
import type { Foot } from './player';
import type {
  CompetitionFormat,
  Confederation,
  ConferenceConfig,
  PromotionRule,
  Tiebreaker,
} from './competition';

export const DATASET_SCHEMA_VERSION = 1;

export interface DatasetPlayer {
  // Optional: if omitted, the generator synthesizes everything from club rep.
  firstName?: string;
  lastName?: string;
  nationality?: string;
  bornYear?: number;
  position?: Position;
  positions?: Position[];
  foot?: Foot;
  height_cm?: number;
  weight_kg?: number;
  attributes?: Partial<Attributes>;
  hidden?: Partial<HiddenAttributes>;
  /** Real overall rating (used directly if provided; else derived). */
  overall?: number;
  potential?: number;
  value?: number;
  isReal?: boolean;
  dataSourceId?: string;
}

export interface DatasetClub {
  name: string;
  shortName?: string;
  abbrev: string;
  primaryColor?: string;
  secondaryColor?: string;
  stadiumName?: string;
  stadiumCapacity?: number;
  reputation: number; // 0–100, anchors generation
  /** If omitted/empty, a full squad is generated to fill the roster. */
  players?: DatasetPlayer[];
}

export interface DatasetLeague {
  name: string;
  tier: number;
  format: CompetitionFormat;
  numClubs: number;
  rounds: number;
  tiebreakers: Tiebreaker[];
  promotion: PromotionRule | null;
  conferences: ConferenceConfig | null;
  clubs: DatasetClub[];
}

export interface DatasetCountry {
  id: string; // ISO-3166 alpha-2
  name: string;
  confederation: Confederation;
  leagues: DatasetLeague[];
}

export interface Dataset {
  schemaVersion: number;
  name: string;
  description: string;
  countries: DatasetCountry[];
}
