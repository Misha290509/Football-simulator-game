// ---------------------------------------------------------------------------
// Player Career — legacy & endgame (Tier 5). The payoff layer: personal
// ambitions and a living legacy score, the dignified decline, the twilight
// paths, the retirement decision, the send-off (testimonial / shirt / Hall of
// Fame) and the player→manager continuation. All derived from real career data
// recorded across Tiers 1–4, deterministic under the seed, additively migrated.
// ---------------------------------------------------------------------------

import type { Position } from './attributes';

/** A personal ambition the player is chasing — evaluated from real career data. */
export type AmbitionKind =
  | 'LEAGUE_TITLE' | 'CONTINENTAL' | 'DOMESTIC_CUP' | 'CAREER_GOALS' | 'CAREER_APPS'
  | 'PLAY_FOR_CLUB' | 'BALLON_DOR' | 'INTERNATIONAL_CAPS' | 'DREAM_MOVE';

export interface CareerAmbition {
  id: string;
  text: string;
  kind: AmbitionKind;
  target?: number;
  clubId?: string; // for PLAY_FOR_CLUB / DREAM_MOVE
  progress?: number;
  achieved: boolean;
  achievedDay?: number;
}

/** Tracks the graceful decline of physical peak into a smarter, veteran game. */
export interface DeclineState {
  started: boolean;
  startedAge?: number;
  peakOvr: number;
  peakAge?: number;
  retrainedFrom?: Position;
}

/** The evolving squad-elder arc within the decline. */
export type RoleEvolution = 'PRIME' | 'EXPERIENCED_KEY' | 'IMPACT_SUB' | 'SQUAD_ELDER';

export type RetirementReason = 'AGE' | 'INJURY' | 'NO_CLUB' | 'CHOICE';

export interface RetirementState {
  announced: boolean;
  announcedDay?: number;
  finalSeason?: number; // the season year that will be the last
  retiredDay?: number;
  forced: boolean;
  reason?: RetirementReason;
  internationalRetiredDay?: number;
  testimonialMatchId?: string;
  shirtRetiredAt?: { clubId: string; number: number }[];
}

/** Career-shape identities — a career is celebrated for what it was. */
export type CareerIdentity =
  | 'ONE_CLUB_LEGEND' | 'SERIAL_WINNER' | 'GLOBETROTTER' | 'WONDERKID_FULFILLED'
  | 'LATE_BLOOMER' | 'CULT_HERO' | 'NEARLY_MAN' | 'JOURNEYMAN_PRO' | 'COUNTRYS_GREATEST';

export const IDENTITY_LABEL: Record<CareerIdentity, string> = {
  ONE_CLUB_LEGEND: 'One-Club Legend',
  SERIAL_WINNER: 'Serial Winner',
  GLOBETROTTER: 'Globetrotter',
  WONDERKID_FULFILLED: 'Wonderkid Fulfilled',
  LATE_BLOOMER: 'Late Bloomer',
  CULT_HERO: 'Cult Hero',
  NEARLY_MAN: 'The Nearly Man',
  JOURNEYMAN_PRO: 'Journeyman Pro',
  COUNTRYS_GREATEST: "Country's Greatest",
};

export const IDENTITY_BLURB: Record<CareerIdentity, string> = {
  ONE_CLUB_LEGEND: 'A lifetime in one shirt — loyalty made legend.',
  SERIAL_WINNER: 'A cabinet groaning with silverware.',
  GLOBETROTTER: 'Conquered leagues across the football world.',
  WONDERKID_FULFILLED: 'The hype was real — and then some.',
  LATE_BLOOMER: 'Came good when others had written the story.',
  CULT_HERO: 'Never the biggest name, always the fans’ favourite.',
  NEARLY_MAN: 'So much talent, so close to the very top.',
  JOURNEYMAN_PRO: 'A proper pro who made a living the hard way.',
  COUNTRYS_GREATEST: 'The finest his nation has ever produced.',
};

/** The transparent, data-derived legacy of a career. */
export interface LegacyState {
  score: number;
  identities: CareerIdentity[];
  legendAtClubs: string[]; // clubIds where legend thresholds were hit
  hallOfFame: boolean;
  hofInductionSeason?: number;
  peerRank?: number; // rank among all players in the save at retirement (1 = best)
  breakdown: Record<string, number>; // transparent scoring components
}

/** What the human does after the playing career ends. */
export interface Continuation {
  choice: 'END' | 'MANAGER' | 'AMBASSADOR';
  managerRepSeed?: number;
}

/** A late-career mentorship of an academy prospect / young first-teamer. */
export interface Mentorship {
  menteeId: string;
  since: number; // year
  developmentBonus: number;
}

/** A distinct twilight route the agent surfaces late in the career. */
export type LateCareerKind = 'TWILIGHT_ABROAD' | 'HOMECOMING' | 'DROP_DOWN' | 'THE_CHASE' | 'ONE_CLUB';
