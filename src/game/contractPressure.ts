// ---------------------------------------------------------------------------
// Player Career — contracts & career pressure (§ The business end). The parts of
// a career that happen in offices and car parks rather than on grass:
//
//   • Clauses — a contract is more than a wage. Release clauses, appearance and
//     goal bonuses, loyalty payments, image rights: each is a lever he can push
//     for, and each costs him something at the table.
//   • Running it down — refuse to sign, play out the final year, and leave for
//     nothing. It's his right, it's lucrative, and his own supporters will
//     despise him for it.
//   • Exile — hand in a transfer request and a ruthless club can freeze him out
//     entirely. No minutes, sharpness rotting, morale collapsing.
//   • Forced moves — sometimes the club simply sells him, and nobody asks.
//
// Pure & deterministic: hashes stable ids, never the sim's RNG stream.
// ---------------------------------------------------------------------------

import type { Player } from '../types/player';
import type { NewsItem } from '../types/league';
import type { PlayerCareer } from '../types/playerCareer';
import { hashSeed, clamp } from '../engine/rng';

let _seq = 0;
const feed = (day: number, category: NewsItem['category'], title: string, body: string): NewsItem =>
  ({ id: `news_pc_ctr_${day}_${_seq++}`, day, category, title, body, read: false });
const nameOf = (p: Player) => `${p.name.first} ${p.name.last}`;

// --- Clause negotiation -----------------------------------------------------

export type ClauseId = 'RELEASE' | 'APPEARANCE_BONUS' | 'GOAL_BONUS' | 'LOYALTY' | 'IMAGE_RIGHTS' | 'WAGE_RISE';

export interface ClauseDef {
  id: ClauseId;
  label: string;
  blurb: string;
  /** How much goodwill it costs to demand this (0–1 of the club's patience). */
  cost: number;
}

export const CLAUSES: ClauseDef[] = [
  { id: 'APPEARANCE_BONUS', label: 'Appearance bonus', blurb: 'Paid per game you actually play.', cost: 0.15 },
  { id: 'GOAL_BONUS', label: 'Goal bonus', blurb: 'A cheque for every goal you score.', cost: 0.2 },
  { id: 'LOYALTY', label: 'Loyalty bonus', blurb: 'A lump sum for seeing the deal out.', cost: 0.25 },
  { id: 'WAGE_RISE', label: 'Wage rise on appearances', blurb: 'Your wage steps up once you hit a games target.', cost: 0.3 },
  { id: 'IMAGE_RIGHTS', label: 'Image rights', blurb: 'You keep a share of what your name earns them.', cost: 0.35 },
  { id: 'RELEASE', label: 'Release clause', blurb: 'A fixed price any club can trigger — your escape hatch.', cost: 0.45 },
];

export const clauseById = (id: ClauseId) => CLAUSES.find((c) => c.id === id);

/**
 * How much the club will tolerate at the negotiating table. Star players with
 * the manager's trust can ask for the world; a squad player asking for image
 * rights gets laughed out of the room.
 */
export function negotiatingPower(career: PlayerCareer, avatar: Player): number {
  const statusWeight: Record<string, number> = { YOUTH: 0.05, PROSPECT: 0.15, ROTATION: 0.3, KEY: 0.6, STAR: 0.9, CAPTAIN: 0.95 };
  return clamp(
    (statusWeight[career.status] ?? 0.3) * 0.55
    + clamp((avatar.overall - 65) / 25, 0, 1) * 0.25
    + clamp((career.managerTrust ?? 50) / 100, 0, 1) * 0.1
    + clamp((career.transferInterest?.length ?? 0) / 4, 0, 1) * 0.1,
    0, 1);
}

export interface ClauseOutcome { granted: ClauseId[]; refused: ClauseId[]; news: NewsItem[] }

/**
 * Push for a set of clauses. The club grants what his standing justifies, in
 * order of cheapness, and refuses the rest — asking for too much sours nothing
 * permanently, but he doesn't get it.
 */
export function negotiateClauses(
  career: PlayerCareer, avatar: Player, wanted: ClauseId[], day: number,
): ClauseOutcome {
  const power = negotiatingPower(career, avatar);
  const sorted = [...wanted].sort((a, b) => (clauseById(a)?.cost ?? 1) - (clauseById(b)?.cost ?? 1));
  const granted: ClauseId[] = [];
  const refused: ClauseId[] = [];
  let budget = power;
  for (const id of sorted) {
    const cost = clauseById(id)?.cost ?? 1;
    if (budget >= cost) { granted.push(id); budget -= cost; } else refused.push(id);
  }
  const news: NewsItem[] = [];
  if (granted.length) {
    news.push(feed(day, 'BOARD', 'Terms agreed',
      `${nameOf(avatar)}'s people got what they came for: ${granted.map((g) => clauseById(g)?.label.toLowerCase()).join(', ')}.`));
  }
  if (refused.length) {
    news.push(feed(day, 'BOARD', 'They said no',
      `The club wouldn't move on ${refused.map((r) => clauseById(r)?.label.toLowerCase()).join(', ')}. Earn more leverage and ask again.`));
  }
  return { granted, refused, news };
}

// --- Running down the contract (Bosman) -------------------------------------

export interface RunDownState { since: number; fanBacklash: number; declared: boolean }

/** Is he in the final year, and therefore able to run it down? */
export function canRunDown(avatar: Player, year: number): boolean {
  return avatar.contract.expiresYear - year <= 1;
}

/**
 * Refuse to sign and play out the deal. Lucrative — he'll leave for nothing and
 * pocket the fee himself — but his own supporters turn on him, hard.
 */
export function declareRunDown(career: PlayerCareer, avatar: Player, day: number): { career: PlayerCareer; news: NewsItem[]; moraleDelta: number } {
  const backlash = 18;
  return {
    career: {
      ...career,
      runDown: { since: day, fanBacklash: backlash, declared: true },
      fanRating: clamp((career.fanRating ?? 50) - backlash, 0, 100) as number,
      clubRelationship: clamp((career.clubRelationship ?? 50) - 25, 0, 100) as number,
    },
    news: [feed(day, 'TRANSFER', 'He won’t sign',
      `${nameOf(avatar)} has refused the club's offer and will run his contract down. He'll leave for nothing in the summer — and the stands have already made their feelings clear.`)],
    moraleDelta: -3,
  };
}

/** The ongoing cost of running it down: the crowd doesn't forget. */
export function runDownDrip(career: PlayerCareer, day: number): { career: PlayerCareer; news: NewsItem[] } {
  const rd = career.runDown;
  if (!rd?.declared) return { career, news: [] };
  const news: NewsItem[] = [];
  if ((hashSeed(`rundown_${day}`) % 100) < 22) {
    news.push(feed(day, 'GENERAL', 'Jeered by his own',
      'Another afternoon of boos every time he touches it. This is the price of the free transfer.'));
  }
  return { career: { ...career, fanRating: clamp((career.fanRating ?? 50) - 0.5, 0, 100) as number }, news };
}

// --- Training-ground exile (the bomb squad) ---------------------------------

export interface ExileState { since: number; reason: string }

/**
 * A ruthless club's answer to a transfer request: freeze him out completely.
 * No minutes, sharpness rotting, morale collapsing — real punishment with a real
 * way out (withdraw the request, or force the move).
 */
export function maybeExile(
  career: PlayerCareer, avatar: Player, day: number, seed: number,
): { career: PlayerCareer; news: NewsItem[]; moraleDelta: number } {
  if (career.exile || !career.transferRequestPending) return { career, news: [], moraleDelta: 0 };
  const ruthless = career.managerStyle === 'RUTHLESS';
  const chance = ruthless ? 55 : 22;
  if ((hashSeed(`exile_${seed}_${day}`) % 100) >= chance) return { career, news: [], moraleDelta: 0 };
  return {
    career: { ...career, exile: { since: day, reason: 'handed in a transfer request' } },
    news: [feed(day, 'BOARD', 'Frozen out',
      `${nameOf(avatar)} has been told to train with the reserves until further notice. No squad, no minutes, no explanation beyond the obvious. The bomb squad is a lonely place.`)],
    moraleDelta: -10,
  };
}

/** Exile rots him: sharpness bleeds away and morale sinks each advance. */
export function exileDrip(career: PlayerCareer, day: number): { career: PlayerCareer; news: NewsItem[]; moraleDelta: number } {
  if (!career.exile) return { career, news: [], moraleDelta: 0 };
  const weeks = Math.max(1, Math.round((day - career.exile.since) / 7));
  const news: NewsItem[] = [];
  if (weeks === 4) {
    news.push(feed(day, 'GENERAL', 'A month in the cold',
      'Four weeks training alone. The sharpness is going, and so is the interest from anyone who might have signed him.'));
  }
  return {
    career: {
      ...career,
      matchSharpness: clamp((career.matchSharpness ?? 100) - 6, 0, 100) as number,
      confidence: clamp((career.confidence ?? 60) - 3, 0, 100) as number,
    },
    news,
    moraleDelta: -2,
  };
}

/** Back in from the cold — the request withdrawn or the move done. */
export function endExile(career: PlayerCareer, avatar: Player, day: number): { career: PlayerCareer; news: NewsItem[]; moraleDelta: number } {
  if (!career.exile) return { career, news: [], moraleDelta: 0 };
  return {
    career: { ...career, exile: null },
    news: [feed(day, 'GENERAL', 'Back in from the cold',
      `${nameOf(avatar)} is training with the first team again. Now he has to win back everything he lost out there.`)],
    moraleDelta: 5,
  };
}

// --- Forced sale --------------------------------------------------------------

/**
 * Sometimes nobody asks. A club under financial pressure, or one that's simply
 * decided he's surplus, accepts a bid and tells him where he's going.
 */
export function forcedSaleNews(avatar: Player, fromClub: string, toClub: string, day: number): NewsItem {
  return feed(day, 'TRANSFER', 'Sold — and nobody asked',
    `${fromClub} have accepted a bid from ${toClub} for ${nameOf(avatar)}. He wasn't consulted. Pack your things; the medical is in the morning.`);
}

/** A failed medical reveals something that follows him for the rest of his career. */
export function failedMedicalNews(avatar: Player, club: string, day: number): NewsItem {
  return feed(day, 'INJURY', 'The medical flagged something',
    `${club}'s doctors found a chronic issue in ${nameOf(avatar)}'s knee. The move is off, and the question mark stays on his file.`);
}
