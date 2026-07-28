// ---------------------------------------------------------------------------
// Player Career — the market, rebuilt around motive (§ Why would they want him?).
//
// The old model asked one question — "is this club bigger than his?" — and so
// every move was upward, most players had no suitors at all, and every offer
// that did arrive read identically. Real careers are not like that. A player
// drops a division to play. He takes the money in a league nobody watches. He
// goes home. A newly-relegated club offers to build a team around him.
//
// So a suitor is classified by *what it wants him for*, and the motive decides
// both whether the club is interested and what the contract actually looks like.
// The motives together cover moves up, sideways and down, so there is always
// somewhere to go — and a reason it might be the wrong move.
//
// Pure & deterministic: hash-seeded, never the sim's RNG stream.
// ---------------------------------------------------------------------------

import type { Player } from '../types/player';
import type { Club } from '../types/club';
import type { PlayerCareer, SquadStatus } from '../types/playerCareer';
import type { ContractOffer } from '../types/playerOffPitch';
import { hashSeed, clamp } from '../engine/rng';
import { marketWage } from '../engine/finances';

const STATUS_ORDER: SquadStatus[] = ['YOUTH', 'PROSPECT', 'ROTATION', 'KEY', 'STAR', 'CAPTAIN'];
const statusRank = (s: SquadStatus) => STATUS_ORDER.indexOf(s);

// --- Motives -------------------------------------------------------------------

export type SuitorMotive =
  | 'STEP_UP'           // a bigger club; the move every player says he wants
  | 'REGULAR_FOOTBALL'  // smaller club, but you would actually play
  | 'PAYDAY'            // a fortune in a league nobody watches
  | 'HOMECOMING'        // your country, or the club you grew up supporting
  | 'REBUILD'           // they want to build the team around you
  | 'PANIC_BUY';        // someone got injured and the window is closing

export interface MotiveInfo {
  id: SuitorMotive;
  label: string;
  /** What the club is actually offering, in one line, for the offer card. */
  pitch: string;
}

export const MOTIVES: Record<SuitorMotive, MotiveInfo> = {
  STEP_UP: { id: 'STEP_UP', label: 'A step up', pitch: 'Bigger stage, better players, and no promises about your place in the side.' },
  REGULAR_FOOTBALL: { id: 'REGULAR_FOOTBALL', label: 'Regular football', pitch: 'Less money and a smaller crowd, but you would play every single week.' },
  PAYDAY: { id: 'PAYDAY', label: 'The money', pitch: 'More than you will ever be offered again, somewhere nobody is watching.' },
  HOMECOMING: { id: 'HOMECOMING', label: 'Going home', pitch: 'Back where you came from, in front of people who already love you.' },
  REBUILD: { id: 'REBUILD', label: 'Built around you', pitch: 'A club starting again, and they want you at the centre of it.' },
  PANIC_BUY: { id: 'PANIC_BUY', label: 'A club in trouble', pitch: 'They have lost someone and the window shuts on Monday. They will overpay.' },
};

export interface Suitor {
  clubId: string;
  motive: SuitorMotive;
  /** 0–100 — how badly they want him, before the interest curve smooths it. */
  pull: number;
}

/** Is the avatar actually playing? The single biggest driver of who wants him. */
function starved(career: PlayerCareer): boolean {
  return career.seasonApps <= 4 && statusRank(career.status) <= statusRank('ROTATION');
}

/**
 * Classify one club's motive for wanting the avatar, or null if it has none.
 *
 * Every applicable motive is scored and the strongest wins, rather than the
 * first one that happens to match — otherwise the order the branches are
 * written in silently decides what kind of move a club is offering, which is
 * both wrong and impossible to reason about.
 */
export function classifyMotive(
  club: Club, parent: Club | undefined, avatar: Player, career: PlayerCareer, heat: number, year: number,
): { motive: SuitorMotive; pull: number } | null {
  if (club.id === avatar.contract.clubId) return null;
  const parentRep = parent?.reputation ?? 55;
  const age = year - avatar.born.year;
  const gap = club.reputation - parentRep;        // + = bigger than his club
  const reach = club.reputation - avatar.overall; // + = he'd be punching up

  // A club far above his level is not interested at any price.
  if (reach > 16) return null;

  const cands: { motive: SuitorMotive; pull: number }[] = [];

  // --- Step up: meaningfully bigger, and only if he is genuinely hot.
  if (gap >= 4 && reach >= -14) {
    const pull = heat * 0.75 + clamp(gap, 0, 25) * 0.6 - Math.max(0, age - 29) * 3;
    if (pull >= 20) cands.push({ motive: 'STEP_UP', pull: clamp(pull, 0, 100) });
  }

  // --- Regular football: smaller than his club, but he'd walk into the side.
  //     This is the branch the old model had no room for at all.
  if (gap <= -4 && club.reputation <= avatar.overall + 4) {
    // They only come calling if he's rotting, out of favour, or getting on.
    if (starved(career) || (career.clubRelationship ?? 55) < 40 || age >= 31) {
      const pull = 45 + (avatar.overall - club.reputation) * 1.6 + (starved(career) ? 18 : 0);
      cands.push({ motive: 'REGULAR_FOOTBALL', pull: clamp(pull, 0, 100) });
    }
  }

  // --- Payday: a club whose money is wildly out of proportion to its standing,
  //     and which can pay him far more than he is worth. Not merely "solvent".
  {
    const budget = club.finances?.wageBudget ?? 0;
    const rate = marketWage(avatar.overall);
    const canGorge = budget > rate * 60;                 // room to pay a fortune
    const punchingDown = club.reputation < avatar.overall - 8;
    if (canGorge && punchingDown) {
      const pull = 30 + Math.max(0, age - 28) * 6 + heat * 0.25;
      cands.push({ motive: 'PAYDAY', pull: clamp(pull, 0, 100) });
    }
  }

  // --- Homecoming: only means anything if he is currently playing abroad, or
  //     if it is the club he actually grew up supporting.
  {
    const boyhood = career.identity?.boyhoodClub;
    const isBoyhood = !!boyhood && club.name === boyhood;
    const away = !!parent && parent.countryId !== avatar.nationality;
    const home = isBoyhood || (away && club.countryId === avatar.nationality);
    if (home && Math.abs(reach) <= 12) {
      const pull = (isBoyhood ? 55 : 30) + heat * 0.3 + Math.max(0, age - 29) * 4;
      cands.push({ motive: 'HOMECOMING', pull: clamp(pull, 0, 100) });
    }
  }

  // --- Rebuild: roughly his level or a notch below, with money to spend and a
  //     squad that needs a face. They will promise him the world.
  if (gap <= 2 && gap >= -14 && reach <= 6) {
    const funded = (club.finances?.transferBudget ?? 0) > (avatar.value || 1_000_000) * 0.8;
    if (funded) {
      const pull = 35 + heat * 0.4 + (avatar.overall - club.reputation) * 1.2;
      cands.push({ motive: 'REBUILD', pull: clamp(pull, 0, 100) });
    }
  }

  if (cands.length === 0) return null;
  // Strongest motive wins; the id breaks ties so this stays deterministic.
  return cands.reduce((a, b) => (b.pull > a.pull || (b.pull === a.pull && b.motive < a.motive) ? b : a));
}

/**
 * Rank every club in the world by its motive for wanting the avatar. Because
 * the motives cover downward and sideways moves, a player who is going nowhere
 * at a big club now has somewhere to go — which is the whole point.
 */
export function findSuitors(
  clubs: Record<string, Club>, avatar: Player, career: PlayerCareer, heat: number, year: number, limit = 8,
): Suitor[] {
  const parent = clubs[avatar.contract.clubId ?? ''];
  const out: Suitor[] = [];
  for (const club of Object.values(clubs)) {
    const m = classifyMotive(club, parent, avatar, career, heat, year);
    if (m && m.pull >= 18) out.push({ clubId: club.id, motive: m.motive, pull: m.pull });
  }
  return out
    .sort((a, b) => b.pull - a.pull || a.clubId.localeCompare(b.clubId))
    .slice(0, limit);
}

/**
 * A club that has just lost someone with the window about to shut, and will pay
 * over the odds for a body. Deliberately rare, and only near a deadline.
 */
export function panicBuyer(
  clubs: Record<string, Club>, avatar: Player, daysToDeadline: number, day: number, seed: number,
): Suitor | null {
  if (daysToDeadline > 7 || daysToDeadline < 0) return null;
  if ((hashSeed(`panic_${seed}_${avatar.id}_${day}`) % 100) >= 18) return null;
  const parentRep = clubs[avatar.contract.clubId ?? '']?.reputation ?? 55;
  const pool = Object.values(clubs).filter((c) =>
    c.id !== avatar.contract.clubId &&
    c.reputation >= parentRep - 6 &&
    c.reputation <= avatar.overall + 14 &&
    (c.finances?.transferBudget ?? 0) > 0);
  if (pool.length === 0) return null;
  const pick = pool[hashSeed(`panicwho_${seed}_${avatar.id}_${day}`) % pool.length];
  return { clubId: pick.id, motive: 'PANIC_BUY', pull: 95 };
}

// --- Terms ----------------------------------------------------------------------

/** Per-motive shape of an offer. This is what stops every contract reading alike. */
interface TermsShape {
  /** Multiplier on his market wage. */
  wage: number;
  length: number;
  /** What they'll actually promise about his place in the team. */
  role: SquadStatus;
  /** Signing bonus as a multiple of the weekly wage. */
  bonusWeeks: number;
  /** Does the deal carry a release clause? */
  clause: boolean;
  /** Multiplier on the fee the buying club will pay. */
  feeMult: number;
}

const SHAPES: Record<SuitorMotive, TermsShape> = {
  // Big club, big money, and pointedly no promise about your place.
  STEP_UP: { wage: 1.55, length: 4, role: 'ROTATION', bonusWeeks: 6, clause: false, feeMult: 1 },
  // They cannot match the money, so they sell you the shirt instead.
  REGULAR_FOOTBALL: { wage: 0.88, length: 3, role: 'KEY', bonusWeeks: 3, clause: true, feeMult: 0.75 },
  // An enormous number, a short deal, and nothing else on the table.
  PAYDAY: { wage: 2.6, length: 2, role: 'STAR', bonusWeeks: 12, clause: false, feeMult: 0.85 },
  // Sentiment is cheap. They know you want to come.
  HOMECOMING: { wage: 0.95, length: 3, role: 'KEY', bonusWeeks: 4, clause: true, feeMult: 0.9 },
  // You are the project. They will promise you anything.
  REBUILD: { wage: 1.3, length: 5, role: 'STAR', bonusWeeks: 8, clause: true, feeMult: 1.1 },
  // No time to haggle. Over the odds on everything.
  PANIC_BUY: { wage: 1.7, length: 3, role: 'KEY', bonusWeeks: 10, clause: false, feeMult: 1.45 },
};

export function shapeOf(motive: SuitorMotive): TermsShape { return SHAPES[motive]; }

/** The fee a suitor with this motive will actually pay for him. */
export function feeFor(motive: SuitorMotive, askingPrice: number): number {
  return Math.round((askingPrice * SHAPES[motive].feeMult) / 250_000) * 250_000;
}

/**
 * Build the personal terms a suitor puts on the table. The agent's negotiation
 * moves the money, but the *shape* of the deal comes from why they want him.
 */
export function buildOffer(
  avatar: Player, career: PlayerCareer, club: Club, motive: SuitorMotive, fee: number, day: number,
): ContractOffer {
  const shape = SHAPES[motive];
  const neg = career.agent?.negotiation ?? 45;
  const base = Math.max(marketWage(avatar.overall), avatar.contract.wage);
  const wage = Math.round((base * shape.wage * (1 + neg / 600)) / 100) * 100;
  // A club can only ever offer a role it could plausibly honour: a giant will
  // not promise a fringe player he starts.
  const role: SquadStatus = club.reputation >= avatar.overall + 8 && statusRank(shape.role) > statusRank('ROTATION')
    ? 'ROTATION' : shape.role;
  return {
    id: `off_${club.id}_${day}`,
    clubId: club.id,
    kind: 'TRANSFER',
    wage,
    length: shape.length,
    signingBonus: Math.round(wage * shape.bonusWeeks),
    goalBonus: Math.round(wage * (motive === 'PAYDAY' ? 0.02 : 0.05)),
    releaseClause: shape.clause ? Math.round(fee * 1.6) : null,
    rolePromise: role,
    deadline: day + (motive === 'PANIC_BUY' ? 4 : 14),
    fee,
    note: `[${motive}] ${MOTIVES[motive].pitch}`,
  };
}

/** Pull the motive back off an offer built above (for the UI). */
export function motiveOf(offer: ContractOffer): SuitorMotive | null {
  const m = /^\[([A-Z_]+)\]/.exec(offer.note ?? '');
  const id = m?.[1] as SuitorMotive | undefined;
  return id && id in MOTIVES ? id : null;
}

// --- Negotiation ------------------------------------------------------------------

export type Ask = 'MORE_MONEY' | 'RELEASE_CLAUSE' | 'BIGGER_ROLE' | 'SHORTER_DEAL';

export const ASKS: { id: Ask; label: string; blurb: string }[] = [
  { id: 'MORE_MONEY', label: 'Ask for more money', blurb: 'The simplest ask, and the one clubs expect.' },
  { id: 'RELEASE_CLAUSE', label: 'Ask for a release clause', blurb: 'A way out if it goes wrong. Clubs hate giving them.' },
  { id: 'BIGGER_ROLE', label: 'Ask for a guarantee on your place', blurb: 'Get the promise in writing. The hardest thing to extract.' },
  { id: 'SHORTER_DEAL', label: 'Ask for a shorter deal', blurb: 'Keeps your options open — and cuts their protection.' },
];

export type CounterOutcome = 'IMPROVED' | 'REFUSED' | 'WITHDRAWN';

export interface CounterResult {
  outcome: CounterOutcome;
  offer: ContractOffer | null; // null when they walk
  message: string;
}

/** How much room a club has to move, before the ask's own difficulty. */
function leverage(career: PlayerCareer, avatar: Player, club: Club, motive: SuitorMotive, heat: number): number {
  const neg = career.agent?.negotiation ?? 40;
  // Desperation helps you; a giant with alternatives does not have to budge.
  const desperation = motive === 'PANIC_BUY' ? 30 : motive === 'REBUILD' ? 14 : motive === 'REGULAR_FOOTBALL' ? 10 : 0;
  const overqualified = clamp(avatar.overall - club.reputation, -20, 20);
  return neg * 0.5 + heat * 0.3 + desperation + overqualified;
}

/** Difficulty of each ask, and what a successful one changes. */
const ASK_COST: Record<Ask, number> = {
  MORE_MONEY: 34, RELEASE_CLAUSE: 48, BIGGER_ROLE: 58, SHORTER_DEAL: 40,
};

/**
 * Push back on an offer. Clubs improve it, refuse it, or — if he has already
 * pushed his luck — take it off the table entirely. Deterministic per offer and
 * ask, so a save can't be re-rolled by reloading.
 */
export function counterOffer(
  offer: ContractOffer, ask: Ask, career: PlayerCareer, avatar: Player, club: Club, heat: number,
  attempts: number, day: number, seed: number,
): CounterResult {
  const motive = motiveOf(offer) ?? 'STEP_UP';
  const lev = leverage(career, avatar, club, motive, heat);
  // Every previous push makes the next one harder and the walk-away likelier.
  const need = ASK_COST[ask] + attempts * 22;
  const roll = hashSeed(`counter_${seed}_${offer.id}_${ask}_${attempts}`) % 100;
  const margin = lev - need;

  // Push a third time and patience runs out regardless of how much they want him.
  if (attempts >= 2 || (margin < -25 && roll < 30)) {
    return {
      outcome: 'WITHDRAWN', offer: null,
      message: `${club.shortName} have withdrawn the offer. They felt they were being messed about, and they were probably right.`,
    };
  }
  if (roll >= clamp(50 + margin, 8, 92)) {
    return {
      outcome: 'REFUSED', offer,
      message: `${club.shortName} will not move on that. The offer stands as it is — take it or leave it.`,
    };
  }

  // They move. How much depends on how much room they had.
  const generosity = clamp(0.06 + margin / 500, 0.04, 0.22);
  let improved: ContractOffer = { ...offer };
  let what = '';
  switch (ask) {
    case 'MORE_MONEY':
      improved.wage = Math.round((offer.wage * (1 + generosity)) / 100) * 100;
      improved.signingBonus = Math.round(improved.signingBonus * (1 + generosity));
      what = `wages up to €${improved.wage.toLocaleString()}/wk`;
      break;
    case 'RELEASE_CLAUSE': {
      const base = offer.releaseClause ?? Math.round((offer.fee ?? 0) * 2.2);
      improved.releaseClause = Math.round((base * (1 - generosity)) / 250_000) * 250_000 || 250_000;
      what = `a €${(improved.releaseClause / 1_000_000).toFixed(1)}m release clause written in`;
      break;
    }
    case 'BIGGER_ROLE': {
      const next = STATUS_ORDER[Math.min(STATUS_ORDER.length - 1, statusRank(offer.rolePromise) + 1)];
      improved.rolePromise = next;
      what = `a promise of ${next.toLowerCase().replace('_', ' ')} minutes`;
      break;
    }
    case 'SHORTER_DEAL':
      improved.length = Math.max(1, offer.length - 1);
      what = `the deal cut to ${improved.length} year${improved.length === 1 ? '' : 's'}`;
      break;
  }
  improved.deadline = Math.max(offer.deadline, day + 5);
  return { outcome: 'IMPROVED', offer: improved, message: `${club.shortName} have moved — ${what}.` };
}

/**
 * When two clubs are both at the table, the weaker offer improves rather than
 * losing him for nothing. A bidding war is the only time a club bids against
 * itself, and it should feel like it.
 */
export function competingBump(offers: ContractOffer[], day: number): { offers: ContractOffer[]; bumped: string[] } {
  const live = offers.filter((o) => o.kind === 'TRANSFER' && o.deadline >= day);
  if (live.length < 2) return { offers, bumped: [] };
  const best = live.reduce((a, b) => (b.wage > a.wage ? b : a));
  const bumped: string[] = [];
  const next = offers.map((o) => {
    if (o.id === best.id || o.kind !== 'TRANSFER' || o.deadline < day) return o;
    if (o.wage >= best.wage * 0.95) return o;
    bumped.push(o.clubId);
    return {
      ...o,
      wage: Math.round((best.wage * 1.02) / 100) * 100,
      signingBonus: Math.round(o.signingBonus * 1.15),
      deadline: Math.max(o.deadline, day + 5),
    };
  });
  return { offers: next, bumped };
}

/**
 * Whether the avatar's own club will even let him go. A key player at a club
 * with nothing to gain from selling can simply be told no — which the old model
 * never did, and which is one of the more infuriatingly real things in football.
 */
export function clubBlocks(
  career: PlayerCareer, avatar: Player, parent: Club | undefined, motive: SuitorMotive, day: number, seed: number,
): { blocked: boolean; reason: string } {
  if (!parent) return { blocked: false, reason: '' };
  if (career.transferRequestPending) return { blocked: false, reason: '' };
  // They only dig in over somebody they actually rely on.
  const important = statusRank(career.status) >= statusRank('KEY');
  if (!important) return { blocked: false, reason: '' };
  // And never over a move that suits them too — a payday sale or a downward move.
  if (motive === 'PAYDAY' || motive === 'REGULAR_FOOTBALL') return { blocked: false, reason: '' };
  const roll = hashSeed(`block_${seed}_${avatar.id}_${day}`) % 100;
  if (roll >= 35) return { blocked: false, reason: '' };
  return {
    blocked: true,
    reason: `${parent.shortName} have told them he is not for sale at any price. If he wants this move he will have to force it.`,
  };
}
