// ---------------------------------------------------------------------------
// Academy tuning data (§ Academy, Ideas 1–2). Everything here is editable data,
// not logic: the country youth-development index, the elite-academy override
// table, and the philosophy ("DNA") profiles that bias youth generation. Tweak
// these to rebalance without touching the engine.
// ---------------------------------------------------------------------------

import type { AttributeKey, PositionGroup } from '../types/attributes';

/**
 * Country youth-development index (0–100). How strong a typical academy in that
 * nation is, before club-specific factors. Keyed by the dataset's country ids.
 */
export const COUNTRY_YOUTH_INDEX: Record<string, number> = {
  ES: 88, // Spain
  FR: 90, // France
  BR: 92, // Brazil
  DE: 85, // Germany
  PT: 84, // Portugal
  NL: 86, // Netherlands
  AR: 84, // Argentina
  GB: 82, // England
  IT: 80, // Italy
  US: 70, // USA
  SA: 58, // Saudi Arabia
};
export const DEFAULT_COUNTRY_YOUTH_INDEX = 68;

/** Display names for the modeled scouting regions. */
export const COUNTRY_NAMES: Record<string, string> = {
  ES: 'Spain', FR: 'France', BR: 'Brazil', DE: 'Germany', PT: 'Portugal',
  NL: 'Netherlands', AR: 'Argentina', GB: 'England', IT: 'Italy', US: 'USA', SA: 'Saudi Arabia',
};

export const youthIndexFor = (countryId: string): number =>
  COUNTRY_YOUTH_INDEX[countryId] ?? DEFAULT_COUNTRY_YOUTH_INDEX;

/**
 * Philosophy / academy DNA. A weighted attribute-bias plus position-likelihood
 * bias applied during youth generation. `attrBias` values are gentle multipliers
 * (1.0 = neutral); `positionBias` weights how likely each broad role is.
 */
export interface Philosophy {
  id: string;
  name: string;
  description: string;
  attrBias: Partial<Record<AttributeKey, number>>;
  positionBias: Partial<Record<PositionGroup, number>>;
}

export const PHILOSOPHIES: Record<string, Philosophy> = {
  TIKI_TAKA: {
    id: 'TIKI_TAKA',
    name: 'Possession / Technical',
    description: 'Technically gifted, intelligent footballers raised on the ball (La Masia).',
    attrBias: { shortPassing: 1.15, ballControl: 1.14, vision: 1.12, dribbling: 1.08, composure: 1.1, longPassing: 1.06 },
    positionBias: { MID: 1.4, ATT: 1.05, DEF: 0.95 },
  },
  TOTAL_FOOTBALL: {
    id: 'TOTAL_FOOTBALL',
    name: 'Total Football',
    description: 'Versatile, ball-playing all-rounders comfortable anywhere (Ajax).',
    attrBias: { shortPassing: 1.1, ballControl: 1.1, vision: 1.08, positioning: 1.06, stamina: 1.05 },
    positionBias: { MID: 1.2, ATT: 1.15, DEF: 1.05 },
  },
  ATHLETIC: {
    id: 'ATHLETIC',
    name: 'Pace & Power',
    description: 'Athletic specimens built on speed and strength (classic English profile).',
    attrBias: { sprintSpeed: 1.14, acceleration: 1.12, strength: 1.12, stamina: 1.08, jumping: 1.06 },
    positionBias: { DEF: 1.15, ATT: 1.1, MID: 0.95 },
  },
  FLAIR: {
    id: 'FLAIR',
    name: 'Flair & Dribbling',
    description: 'Expressive dribblers full of trickery (Brazilian street football).',
    attrBias: { dribbling: 1.18, ballControl: 1.12, agility: 1.1, finishing: 1.06, curve: 1.06 },
    positionBias: { ATT: 1.4, MID: 1.05, DEF: 0.85 },
  },
  DEFENSIVE: {
    id: 'DEFENSIVE',
    name: 'Defensive Solidity',
    description: 'Tactically disciplined, defensively rigorous (Italian school).',
    attrBias: { marking: 1.14, standingTackle: 1.12, positioning: 1.1, interceptions: 1.1, composure: 1.06 },
    positionBias: { DEF: 1.4, MID: 1.05, ATT: 0.9 },
  },
  BALANCED: {
    id: 'BALANCED',
    name: 'Balanced',
    description: 'A rounded program with no strong stylistic bias.',
    attrBias: {},
    positionBias: {},
  },
};

export const DEFAULT_PHILOSOPHY = 'BALANCED';

/** Default philosophy per country (the "house style"). */
export const COUNTRY_PHILOSOPHY: Record<string, string> = {
  ES: 'TIKI_TAKA',
  NL: 'TOTAL_FOOTBALL',
  GB: 'ATHLETIC',
  BR: 'FLAIR',
  AR: 'FLAIR',
  IT: 'DEFENSIVE',
  FR: 'ATHLETIC',
  PT: 'TIKI_TAKA',
  DE: 'TOTAL_FOOTBALL',
};

/**
 * Elite-academy override table (Idea 1). Famous academies start strong (and
 * with a signature philosophy) regardless of the formula. `rating` is a floor
 * in stars (1–5); `repBonus` lifts starting academy reputation. Matched by
 * normalized club name.
 */
export interface EliteAcademy {
  rating: number; // star floor 1–5
  repBonus: number; // added to derived academy reputation
  philosophyId?: string;
}

export const ELITE_ACADEMIES: Record<string, EliteAcademy> = {
  'fc barcelona': { rating: 5, repBonus: 22, philosophyId: 'TIKI_TAKA' }, // La Masia
  'real madrid': { rating: 5, repBonus: 18, philosophyId: 'TIKI_TAKA' },
  'atletico madrid': { rating: 4, repBonus: 10, philosophyId: 'DEFENSIVE' },
  'ajax': { rating: 5, repBonus: 22, philosophyId: 'TOTAL_FOOTBALL' },
  'sporting cp': { rating: 5, repBonus: 18, philosophyId: 'TIKI_TAKA' },
  'sl benfica': { rating: 5, repBonus: 18, philosophyId: 'TIKI_TAKA' },
  'benfica': { rating: 5, repBonus: 18, philosophyId: 'TIKI_TAKA' },
  'olympique lyonnais': { rating: 5, repBonus: 16, philosophyId: 'TOTAL_FOOTBALL' },
  'lyon': { rating: 5, repBonus: 16, philosophyId: 'TOTAL_FOOTBALL' },
  'manchester city': { rating: 5, repBonus: 14, philosophyId: 'TIKI_TAKA' },
  'manchester united': { rating: 4, repBonus: 14, philosophyId: 'ATHLETIC' },
  'chelsea': { rating: 5, repBonus: 14, philosophyId: 'ATHLETIC' },
  'arsenal': { rating: 4, repBonus: 12, philosophyId: 'TIKI_TAKA' },
  'borussia dortmund': { rating: 5, repBonus: 16, philosophyId: 'TOTAL_FOOTBALL' },
  'fc bayern munchen': { rating: 4, repBonus: 12, philosophyId: 'TOTAL_FOOTBALL' },
  'river plate': { rating: 5, repBonus: 16, philosophyId: 'FLAIR' },
  'sao paulo': { rating: 5, repBonus: 16, philosophyId: 'FLAIR' },
  'santos': { rating: 5, repBonus: 18, philosophyId: 'FLAIR' },
  'flamengo': { rating: 5, repBonus: 14, philosophyId: 'FLAIR' },
  'partizan': { rating: 4, repBonus: 10, philosophyId: 'BALANCED' },
  'dinamo zagreb': { rating: 4, repBonus: 12, philosophyId: 'TOTAL_FOOTBALL' },
  'athletic club': { rating: 4, repBonus: 12, philosophyId: 'ATHLETIC' },
};
