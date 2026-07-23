// ---------------------------------------------------------------------------
// Player Career — off-pitch life (Tier 4). The inverted transfer market (clubs
// bidding for the avatar), the agent, contracts/renewals, loans for game time,
// media/press, sponsorships and the weekly lifestyle routine + wealth.
//
// GOVERNING RULE: off-pitch content must never become admin. Everything here is
// PUSH (surfaced in the inbox at the right moment), never PULL (a spreadsheet to
// tend). It is low-frequency and high-stakes, deterministic under the seeded
// RNG, and always skippable/automatable — a player who only wants football can
// hire an agent, tick auto-manage, and ignore all of it with a coherent career.
//
// The engine is pure: `advanceOffPitch` folds one advance's worth of off-pitch
// life into the career (interest, sagas, renewals, loans, sponsors, press
// triggers, wages), returning news + patches for the store to apply. The
// player-driven executions (accept an offer, answer the press, hire an agent)
// live as store actions but share the executors below.
// ---------------------------------------------------------------------------

import type { Player } from '../types/player';
import type { Club } from '../types/club';
import type { NewsItem } from '../types/league';
import type { PlayerCareer, AvatarMatchSummary, SquadStatus } from '../types/playerCareer';
import type {
  PlayerAgent, ClubInterest, TransferSaga, ContractOffer, LoanOffer, LoanSpell,
  SponsorOffer, PressPrompt, PressChoice, PublicImage, Lifestyle, SponsorTier,
} from '../types/playerOffPitch';
import { DEFAULT_LIFESTYLE, DEFAULT_PUBLIC_IMAGE } from '../types/playerOffPitch';
import { Rng, clamp, hashSeed } from '../engine/rng';
import { marketWage } from '../engine/finances';

const nameOf = (p: Player) => `${p.name.first} ${p.name.last}`;
const STATUS_ORDER: SquadStatus[] = ['YOUTH', 'PROSPECT', 'ROTATION', 'KEY', 'STAR', 'CAPTAIN'];
const statusRank = (s: SquadStatus) => STATUS_ORDER.indexOf(s);

let _seq = 0;
const feed = (day: number, category: NewsItem['category'], title: string, body: string): NewsItem =>
  ({ id: `news_pc_off_${day}_${_seq++}`, day, category, title, body, read: false });

/** A deterministic RNG for one off-pitch subsystem on one day. */
function rngFor(seed: number, day: number, tag: string): Rng {
  return new Rng((seed ^ hashSeed(`offpitch_${tag}_${day}`)) >>> 0);
}

// --- Agents -----------------------------------------------------------------

/** The pool of agents the avatar can hire. Better agents attract bigger clubs
 *  and squeeze better terms, but take a larger cut. Self-representation (no
 *  agent) is always allowed — you just negotiate everything yourself. */
export const AGENT_ROSTER: Omit<PlayerAgent, 'relationship' | 'autoNegotiate'>[] = [
  { id: 'agent_diaz', name: 'Rafael Díaz', negotiation: 62, network: 55, mediaSavvy: 60, reputation: 50, commissionPct: 5 },
  { id: 'agent_kovac', name: 'Ivana Kovač', negotiation: 74, network: 70, mediaSavvy: 68, reputation: 66, commissionPct: 8 },
  { id: 'agent_mendez', name: 'Jorge Méndez Jr.', negotiation: 88, network: 92, mediaSavvy: 80, reputation: 90, commissionPct: 12 },
  { id: 'agent_okafor', name: 'Ada Okafor', negotiation: 70, network: 60, mediaSavvy: 88, reputation: 62, commissionPct: 7 },
];

export function agentById(id: string | undefined | null): typeof AGENT_ROSTER[number] | undefined {
  return AGENT_ROSTER.find((a) => a.id === id);
}

/** Hire an agent (fresh relationship + a sensible default auto-negotiate floor). */
export function hireAgent(base: typeof AGENT_ROSTER[number], avatar: Player): PlayerAgent {
  return {
    ...base,
    relationship: 60,
    autoNegotiate: { enabled: false, minWage: Math.round(marketWage(avatar.overall) * 1.1), minRole: 'ROTATION' },
  };
}

// --- Market interest (clubs earn a reason to want you) ----------------------

/** The avatar's current market heat (0–100) — a pure read of real performance:
 *  ability, output, standing, form, reach and youth. This is what turns clubs'
 *  heads; nothing is bought with menus. */
export function marketHeat(career: PlayerCareer, avatar: Player, year: number): number {
  const age = year - avatar.born.year;
  const perApp = career.seasonApps > 0 ? career.seasonGoals / career.seasonApps : 0;
  const youth = age <= 20 ? 12 : age <= 23 ? 8 : age <= 27 ? 3 : age >= 32 ? -8 : 0;
  const heat =
    (avatar.overall - 62) * 2.4 +
    (career.seasonAvgRating - 6.7) * 10 +
    perApp * 22 +
    statusRank(career.status) * 4 +
    clamp(avatar.form, -30, 30) * 0.25 +
    Math.min(20, career.following / 500) +
    youth;
  return clamp(Math.round(heat), 0, 100) as number;
}

/** Refresh AI clubs' standing interest from the avatar's heat. Clubs a notch
 *  above the avatar's current level (and richer than his club) warm to him when
 *  he's hot and cool when he's not. Deterministic; a handful of clubs at most. */
export function updateInterest(
  career: PlayerCareer, avatar: Player, clubs: Record<string, Club>, year: number, day: number, seed: number,
): ClubInterest[] {
  const heat = marketHeat(career, avatar, year);
  const parent = clubs[avatar.contract.clubId ?? ''];
  const parentRep = parent?.reputation ?? 55;
  const network = career.agent?.network ?? 45; // self-rep reaches fewer clubs
  const existing = new Map((career.transferInterest ?? []).map((i) => [i.clubId, i]));

  // Candidate suitors: clubs richer/bigger than the parent, within reach of the
  // avatar's level, excluding his own club. Ranked, then a network-sized slice.
  // Suitors: bigger than the parent, at the avatar's level and no more than a
  // notch above it — a giant won't chase a fringe journeyman just because he's
  // cheap. The upper band widens for hot youth (heat), so wonderkids draw giants.
  const ceiling = avatar.overall + 12 + Math.round(heat / 8);
  const suitors = Object.values(clubs)
    .filter((c) => c.id !== avatar.contract.clubId && c.reputation >= parentRep - 2
      && c.reputation >= avatar.overall - 8 && c.reputation <= ceiling)
    .sort((a, b) => b.reputation - a.reputation)
    .slice(0, 6 + Math.round(network / 12));

  const rng = rngFor(seed, day, 'interest');
  const out: ClubInterest[] = [];
  for (const c of suitors) {
    const prev = existing.get(c.id)?.level ?? 0;
    // A club chases harder the hotter you are and the more it out-classes your
    // current side; it drifts back down when you go cold.
    const pull = heat * 0.5 + clamp((c.reputation - parentRep) * 1.5, -10, 20) + rng.int(-6, 8);
    const target = clamp(pull, 0, 100);
    const level = clamp(Math.round(prev + (target - prev) * 0.4), 0, 100) as number;
    if (level >= 8) out.push({ clubId: c.id, level, lastSeen: day });
  }
  // Preserve any interest from clubs no longer in the suitor slice, decayed.
  for (const [id, i] of existing) {
    if (out.some((o) => o.clubId === id)) continue;
    const level = clamp(Math.round(i.level * 0.7), 0, 100) as number;
    if (level >= 12) out.push({ clubId: id, level, lastSeen: i.lastSeen });
  }
  return out.sort((a, b) => b.level - a.level).slice(0, 8);
}

// --- Valuation & offers ------------------------------------------------------

/** What the parent club will ask for the avatar (a premium on market value). */
export function askingPrice(avatar: Player, career: PlayerCareer): number {
  const base = Math.max(250_000, avatar.value || 1_000_000);
  const premium = 1.2 + statusRank(career.status) * 0.08 + (career.transferRequestPending ? -0.25 : 0);
  return Math.round((base * premium) / 250_000) * 250_000;
}

/** Personal terms a suitor offers, sweetened by the agent's negotiation. */
function personalTerms(avatar: Player, career: PlayerCareer, suitor: Club, fee: number, day: number): ContractOffer {
  const neg = career.agent?.negotiation ?? 45;
  const baseWage = Math.max(marketWage(avatar.overall), avatar.contract.wage);
  const wage = Math.round((baseWage * (1.15 + neg / 400)) / 100) * 100;
  const bigger = suitor.reputation >= (avatar.overall + 4);
  return {
    id: `off_${suitor.id}_${day}`,
    clubId: suitor.id,
    kind: 'TRANSFER',
    wage,
    length: 4,
    signingBonus: Math.round(wage * (4 + neg / 20)),
    goalBonus: Math.round(wage * 0.05),
    releaseClause: bigger ? null : Math.round(fee * 1.8),
    rolePromise: bigger ? 'ROTATION' : 'KEY',
    deadline: day + 14,
    fee,
  };
}

// --- Transfer sagas (rumour → bid → personal terms → move / collapse) -------

export interface OffPitchResult {
  career: PlayerCareer;
  news: NewsItem[];
  moraleDelta: number;
  earningsDelta: number;
  /** Patch to merge onto the avatar Player (e.g. a completed move). */
  playerPatch?: Partial<Player>;
  /** Clubs to replace wholesale (squad + finances after a move). */
  clubPatches?: Record<string, Club>;
}

/** Advance the live transfer sagas one step. Paced by each saga's `deadline`:
 *  a stage only moves when its clock runs down, so a saga plays out over weeks
 *  in the inbox, never as a flurry of menus. */
function advanceSagas(
  career: PlayerCareer, avatar: Player, clubs: Record<string, Club>, day: number, seed: number,
): { career: PlayerCareer; news: NewsItem[] } {
  const news: NewsItem[] = [];
  let sagas = [...(career.activeSagas ?? [])];
  let offers = [...(career.contractOffers ?? [])];
  const interest = new Map((career.transferInterest ?? []).map((i) => [i.clubId, i.level]));
  const rng = rngFor(seed, day, 'sagas');
  let transferRequestPending = career.transferRequestPending;

  const next: TransferSaga[] = [];
  for (const saga of sagas) {
    const club = clubs[saga.clubId];
    if (!club || saga.stage === 'DONE' || saga.stage === 'COLLAPSED') {
      // Keep terminal sagas briefly, then let them drop.
      if (day < saga.deadline + 20) next.push(saga);
      continue;
    }
    if (day < saga.deadline) { next.push(saga); continue; }
    const wants = transferRequestPending || (career.clubRelationship ?? 55) < 35;

    if (saga.stage === 'RUMOUR') {
      const level = interest.get(saga.clubId) ?? 0;
      if (level >= 55 || wants) {
        const fee = askingPrice(avatar, career);
        news.push(feed(day, 'TRANSFER', `${club.shortName} table a bid`, `${club.name} have made a €${fmtM(fee)} offer to ${clubs[avatar.contract.clubId ?? '']?.shortName ?? 'your club'} for ${nameOf(avatar)}.`));
        next.push({ ...saga, stage: 'BID', fee, deadline: day + rng.int(7, 14), note: 'Bid lodged.' });
      } else {
        news.push(feed(day, 'GENERAL', 'Transfer talk cools', `Speculation linking ${nameOf(avatar)} with ${club.shortName} has quietly died down.`));
        next.push({ ...saga, stage: 'COLLAPSED', deadline: day, note: 'Interest faded.' });
      }
    } else if (saga.stage === 'BID') {
      const parent = clubs[avatar.contract.clubId ?? ''];
      const asking = askingPrice(avatar, career);
      const accept = wants || saga.fee >= asking || (parent && parent.reputation < club.reputation - 6 && saga.fee >= asking * 0.85);
      if (accept) {
        const offer = personalTerms(avatar, career, club, saga.fee, day);
        offers = [...offers.filter((o) => o.clubId !== club.id), offer];
        next.push({ ...saga, stage: 'PERSONAL_TERMS', deadline: offer.deadline, note: 'Clubs agree a fee.' });
        news.push(feed(day, 'TRANSFER', `${club.shortName} agree a fee`, `The clubs have agreed a €${fmtM(saga.fee)} fee. ${club.name} have opened personal terms — the decision is yours. (Check your offers.)`));
      } else {
        // One bump, then it collapses.
        if (saga.fee < asking && rng.chance(0.6)) {
          const bumped = Math.round((asking * rng.float(0.95, 1.05)) / 250_000) * 250_000;
          next.push({ ...saga, fee: bumped, deadline: day + rng.int(6, 12), note: 'Improved bid.' });
          news.push(feed(day, 'TRANSFER', `${club.shortName} return with more`, `${club.shortName} have upped their offer for ${nameOf(avatar)} to €${fmtM(bumped)}.`));
        } else {
          next.push({ ...saga, stage: 'COLLAPSED', deadline: day, note: 'Clubs could not agree a fee.' });
          news.push(feed(day, 'GENERAL', 'Bid rejected', `${clubs[avatar.contract.clubId ?? '']?.shortName ?? 'Your club'} have knocked back ${club.shortName}'s interest in ${nameOf(avatar)}.`));
        }
      }
    } else if (saga.stage === 'PERSONAL_TERMS') {
      // The player's ContractOffer is on the table. If it lapsed unanswered, the
      // agent may auto-decide (escape hatch); otherwise it collapses.
      const offer = offers.find((o) => o.clubId === saga.clubId && o.kind === 'TRANSFER');
      if (!offer) { next.push({ ...saga, stage: 'COLLAPSED', deadline: day, note: 'Talks ended.' }); continue; }
      // (Auto-accept via agent is handled in advanceOffPitch before this.)
      offers = offers.filter((o) => o.id !== offer.id);
      next.push({ ...saga, stage: 'COLLAPSED', deadline: day, note: 'Move fell through.' });
      news.push(feed(day, 'GENERAL', 'Move collapses', `${nameOf(avatar)}'s proposed move to ${club.shortName} is off — no decision was taken in time.`));
    }
  }

  return {
    career: { ...career, activeSagas: next, contractOffers: offers, transferRequestPending },
    news,
  };
}

/** Kick off new rumours from clubs whose interest has boiled over, at low
 *  frequency and only when no saga with that club is already live. */
function spawnRumours(
  career: PlayerCareer, avatar: Player, clubs: Record<string, Club>, day: number, seed: number,
): { career: PlayerCareer; news: NewsItem[] } {
  const news: NewsItem[] = [];
  const live = new Set((career.activeSagas ?? []).filter((s) => s.stage !== 'COLLAPSED' && s.stage !== 'DONE').map((s) => s.clubId));
  if (live.size >= 2) return { career, news }; // never a circus
  const rng = rngFor(seed, day, 'rumours');
  const hot = (career.transferInterest ?? []).filter((i) => i.level >= 68 && !live.has(i.clubId));
  const sagas = [...(career.activeSagas ?? [])];
  for (const i of hot.slice(0, 1)) {
    // Even a hot club only comes calling now and then.
    if (!career.transferRequestPending && !rng.chance(0.5)) continue;
    const club = clubs[i.clubId];
    if (!club) continue;
    sagas.push({ id: `saga_${club.id}_${day}`, clubId: club.id, stage: 'RUMOUR', fee: 0, deadline: day + rng.int(10, 20), note: 'Linked with a move.' });
    news.push(feed(day, 'TRANSFER', `${club.shortName} keen on ${avatar.name.last}`, `Reports link ${nameOf(avatar)} with a move to ${club.name}. Nothing concrete yet — but they're watching.`));
  }
  return { career: { ...career, activeSagas: sagas }, news };
}

// --- Contract renewals & expiry (at the current club) -----------------------

function advanceContracts(
  career: PlayerCareer, avatar: Player, clubs: Record<string, Club>, year: number, day: number, seed: number,
): { career: PlayerCareer; news: NewsItem[] } {
  const news: NewsItem[] = [];
  let offers = [...(career.contractOffers ?? [])];
  const club = clubs[avatar.contract.clubId ?? ''];
  if (!club) return { career, news };
  const yearsLeft = avatar.contract.expiresYear - year;
  const haveRenewal = offers.some((o) => o.kind === 'RENEWAL');

  // Within the final year the club opens renewal talks — once — if he's wanted.
  if (yearsLeft <= 1 && !haveRenewal && statusRank(career.status) >= statusRank('ROTATION')) {
    const rng = rngFor(seed, day, 'renewal');
    if (rng.chance(0.5)) {
      const neg = career.agent?.negotiation ?? 45;
      const wage = Math.round((Math.max(marketWage(avatar.overall), avatar.contract.wage) * (1.12 + neg / 500)) / 100) * 100;
      offers.push({
        id: `renew_${club.id}_${day}`, clubId: club.id, kind: 'RENEWAL', wage,
        length: statusRank(career.status) >= statusRank('KEY') ? 4 : 3,
        signingBonus: Math.round(wage * 3), goalBonus: Math.round(wage * 0.04),
        releaseClause: null, rolePromise: career.status, deadline: day + 21,
      });
      news.push(feed(day, 'TRANSFER', 'Contract talks open', `${club.name} have offered ${nameOf(avatar)} a new ${offers[offers.length - 1].length}-year deal. (Check your offers.)`));
    }
  }
  return { career: { ...career, contractOffers: offers }, news };
}

// --- Loans (out for game time) ----------------------------------------------

function advanceLoans(
  career: PlayerCareer, avatar: Player, clubs: Record<string, Club>, year: number, day: number, seed: number,
): { career: PlayerCareer; news: NewsItem[] } {
  const news: NewsItem[] = [];
  if (career.loanSpell) return { career, news }; // already out; return handled at rollover
  const age = year - avatar.born.year;
  // Buried = a fringe player who just isn't getting on. A loan for regular
  // football is the escape hatch out of a 0-appearances dead end — offered to
  // any player through his prime (not just teenagers), including one who moved
  // to a big club and can't break in.
  const buried = statusRank(career.status) <= statusRank('ROTATION') && career.seasonApps <= 3 && career.managerTrust < 55;
  if (!(buried && age <= 28)) return { career, news };
  if ((career.loanOffers ?? []).length > 0) return { career, news };
  const rng = rngFor(seed, day, 'loan');
  if (!rng.chance(0.55)) return { career, news };
  const parentRep = clubs[avatar.contract.clubId ?? '']?.reputation ?? 55;
  // A club where the avatar would actually walk into the side (at or below his
  // own ability), so the loan means real minutes, not more bench-warming.
  const dest = Object.values(clubs)
    .filter((c) => c.id !== avatar.contract.clubId && c.reputation <= Math.min(parentRep - 3, avatar.overall + 2) && c.reputation >= parentRep - 26)
    .sort((a, b) => b.reputation - a.reputation);
  const pick = dest[rng.int(0, Math.max(0, Math.min(4, dest.length - 1)))];
  if (!pick) return { career, news };
  const offers: LoanOffer[] = [{
    id: `loan_${pick.id}_${day}`, clubId: pick.id, minutesGuarantee: rng.chance(0.85),
    quality: pick.reputation, deadline: day + 14,
    note: `${pick.shortName} want ${nameOf(avatar)} on loan to get him regular football.`,
  }];
  news.push(feed(day, 'TRANSFER', 'Loan interest', `${pick.name} have enquired about taking ${nameOf(avatar)} on loan for game time. (Check your offers.)`));
  return { career: { ...career, loanOffers: offers }, news };
}

// --- Sponsorships ------------------------------------------------------------

const SPONSOR_BRANDS: Record<SponsorTier, string[]> = {
  LOCAL: ['Riverside Motors', 'Cortez Sportswear', 'Del Sol Energy'],
  NATIONAL: ['Vantage Bank', 'Aero Airlines', 'Pulse Telecom'],
  GLOBAL: ['Apex Athletics', 'Nexus', 'Orbit Cola', 'Titan Boots'],
};

function tierFor(following: number): SponsorTier | null {
  if (following >= 40_000) return 'GLOBAL';
  if (following >= 8_000) return 'NATIONAL';
  if (following >= 1_500) return 'LOCAL';
  return null;
}

function advanceSponsors(
  career: PlayerCareer, avatar: Player, day: number, seed: number,
): { career: PlayerCareer; news: NewsItem[] } {
  const news: NewsItem[] = [];
  const tier = tierFor(career.following);
  if (!tier) return { career, news };
  if ((career.pendingSponsorOffers ?? []).length > 0) return { career, news };
  // Don't pile deals on: cap active sponsorships.
  const active = (career.sponsorships ?? []).filter((s) => s.until > (avatar.contract.startYear));
  if (active.length >= 3) return { career, news };
  const rng = rngFor(seed, day, 'sponsor');
  if (!rng.chance(0.25)) return { career, news };
  const mult = tier === 'GLOBAL' ? 1 : tier === 'NATIONAL' ? 0.35 : 0.1;
  const value = Math.round((career.following * 6 * mult * rng.float(0.8, 1.3)) / 1000) * 1000;
  if (value < 5_000) return { career, news };
  const brand = SPONSOR_BRANDS[tier][rng.int(0, SPONSOR_BRANDS[tier].length - 1)];
  const offer: SponsorOffer = {
    id: `spon_${day}_${brand.replace(/\W/g, '')}`, brand, tier, value, length: rng.int(1, 3),
    goalBonus: tier === 'GLOBAL' ? Math.round(value * 0.02) : 0, deadline: day + 21,
  };
  news.push(feed(day, 'GENERAL', `${brand} come calling`, `${brand} (${tier.toLowerCase()}) want ${nameOf(avatar)} as a brand ambassador — €${fmtK(value)}/yr. (Check your offers.)`));
  return { career: { ...career, pendingSponsorOffers: [offer] }, news };
}

// --- Media / press / public image -------------------------------------------

/** Persona derived from the controversy meter — the image the world sees. */
export function derivePersona(image: PublicImage, career: PlayerCareer): string {
  const c = image.controversy;
  if (c >= 70) return 'Bad Boy';
  if (c >= 45) return 'Outspoken';
  if ((career.fanRating ?? 50) >= 72 && c < 25) return 'Fan Favourite';
  if (c < 15 && (career.personality.professionalism ?? 50) >= 65) return 'Model Professional';
  if (c >= 25) return 'Enigma';
  return 'Grounded';
}

/** Build a press prompt for a notable match, if one warrants it. Event-driven:
 *  a hat-trick, a red card, a derby, a thrashing — a moment worth a mic. */
export function pressPromptFor(summary: AvatarMatchSummary, avatar: Player, day: number): PressPrompt | null {
  const topic = (() => {
    if (summary.goals >= 3) return 'HATTRICK';
    if (summary.goals >= 1 && summary.result === 'W') return 'MATCHWINNER';
    if (summary.result === 'L' && summary.oppGoals - summary.teamGoals >= 3) return 'THRASHING';
    if (summary.rating >= 8.5) return 'STAR_SHOW';
    if (summary.rating < 5.5) return 'OFF_DAY';
    return null;
  })();
  if (!topic) return null;
  const last = avatar.name.last;
  const P: Record<string, { prompt: string; choices: PressChoice[] }> = {
    HATTRICK: {
      prompt: `Three goals, and the cameras want ${last}. What's the line?`,
      choices: [
        { text: `Credit the team — "it's all of us"`, tone: 'HUMBLE', fanRating: 3, relationship: 3, following: 400 },
        { text: `Own it — "I'm the best finisher here"`, tone: 'CONFIDENT', fanRating: 1, following: 1500, controversy: 6, trust: -1 },
        { text: 'Aim a message at the doubters', tone: 'DEFIANT', following: 2500, controversy: 14, rival: -6 },
      ],
    },
    MATCHWINNER: {
      prompt: `${last} settled it. The reporters lean in.`,
      choices: [
        { text: 'Praise the manager\'s plan', tone: 'DIPLOMATIC', trust: 2, relationship: 2, following: 300 },
        { text: 'Talk up your form', tone: 'CONFIDENT', following: 1000, fanRating: 1 },
      ],
    },
    THRASHING: {
      prompt: `A heavy defeat. The press want a reaction from ${last}.`,
      choices: [
        { text: 'Take responsibility', tone: 'HUMBLE', trust: 2, relationship: 2, fanRating: 2 },
        { text: 'Stay measured — "we go again"', tone: 'DIPLOMATIC', trust: 1 },
        { text: 'Call out the effort', tone: 'CONTROVERSIAL', following: 1200, controversy: 18, relationship: -8, trust: -3 },
      ],
    },
    STAR_SHOW: {
      prompt: `A standout display. ${last} is the story.`,
      choices: [
        { text: 'Stay humble', tone: 'HUMBLE', fanRating: 2, relationship: 2, following: 500 },
        { text: 'Send a message to the selectors', tone: 'CONFIDENT', following: 1200, controversy: 5 },
      ],
    },
    OFF_DAY: {
      prompt: `A game to forget. The mics still find ${last}.`,
      choices: [
        { text: 'Front up — "not good enough"', tone: 'HUMBLE', trust: 2, fanRating: 1 },
        { text: 'Deflect to the officials', tone: 'CONTROVERSIAL', controversy: 16, fanRating: -3, trust: -2 },
      ],
    },
  };
  const def = P[topic];
  return { id: `press_${day}_${topic}`, topic, prompt: def.prompt, choices: def.choices };
}

/** Following grows/shrinks from standing + persona each advance (slow, organic). */
function driftFollowing(career: PlayerCareer): number {
  const heatish = statusRank(career.status) * 300 + Math.max(0, career.seasonGoals) * 120 + Math.max(0, career.fanRating - 50) * 30;
  const controversyBoost = (career.publicImage?.controversy ?? 0) * 12;
  const target = Math.max(0, heatish + controversyBoost + (career.international.capped ? 6000 : 0));
  return Math.round(career.following + (target - career.following) * 0.15);
}

// --- Lifestyle: routine, personality drift, wealth --------------------------

/** Sensible auto-managed routine, weighted by the avatar's stage of career. */
export function autoRoutine(avatar: Player, year: number): Lifestyle['routine'] {
  const age = year - avatar.born.year;
  if (age <= 21) return { TRAINING: 2, REST: 1, MEDIA: 0, COMMUNITY: 1, PERSONAL: 1 };
  if (age >= 31) return { TRAINING: 1, REST: 2, MEDIA: 1, COMMUNITY: 1, PERSONAL: 0 };
  return { TRAINING: 1, REST: 1, MEDIA: 1, COMMUNITY: 1, PERSONAL: 1 };
}

/** Personality/attribute nudges + controversy drift from how time is spent.
 *  Tiny per advance — set-and-forget shapes the player over a career. */
function applyLifestyle(
  career: PlayerCareer, avatar: Player, year: number,
): { career: PlayerCareer; playerPatch?: Partial<Player> } {
  const lifestyle = career.lifestyle ?? DEFAULT_LIFESTYLE;
  const routine = lifestyle.autoManage ? autoRoutine(avatar, year) : lifestyle.routine;
  const total = Object.values(routine).reduce((a, b) => a + b, 0) || 1;
  const w = (k: keyof typeof routine) => routine[k] / total;

  const pers = { ...career.personality };
  pers.professionalism = clamp(pers.professionalism + (w('TRAINING') - 0.2) * 1.2 - (w('PERSONAL') - 0.2) * 0.8, 0, 100);
  pers.temperament = clamp(pers.temperament + (w('REST') - 0.2) * 0.8 + (w('COMMUNITY') - 0.2) * 0.6, 0, 100);
  const image = { ...(career.publicImage ?? DEFAULT_PUBLIC_IMAGE) };
  image.controversy = clamp(image.controversy + (w('MEDIA') - 0.2) * 1.5 + (w('PERSONAL') - 0.2) * 1.0 - 0.5, 0, 100);
  image.persona = derivePersona(image, { ...career, personality: pers });

  // Community work slowly warms the fans; heavy media without substance cools.
  const fanRating = clamp((career.fanRating ?? 50) + (w('COMMUNITY') - 0.2) * 1.0, 0, 100);

  // A big training bias can nudge fitness recovery (small, capped).
  let playerPatch: Partial<Player> | undefined;
  if (w('REST') >= 0.35 && avatar.fitness < 100) playerPatch = { fitness: clamp(avatar.fitness + 2, 0, 100) as number };

  return {
    career: { ...career, personality: pers, publicImage: image, fanRating, lifestyle: { ...lifestyle, routine } },
    playerPatch,
  };
}

/** Weekly earnings accrued over the advance: wage (less agent commission) plus a
 *  slice of active sponsorship value. `weeks` ≈ days/7. */
function accrueEarnings(career: PlayerCareer, avatar: Player, weeks: number): number {
  const commission = (career.agent?.commissionPct ?? 0) / 100;
  const wage = avatar.contract.wage * (1 - commission);
  const sponsorPerWeek = (career.sponsorships ?? []).reduce((a, s) => a + s.value, 0) / 52;
  return Math.round((wage + sponsorPerWeek) * Math.max(0, weeks));
}

const fmtM = (n: number) => (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1);
const fmtK = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1000)}k`;

// --- Executors (shared by store actions + the auto-negotiate escape hatch) --

/** Execute a signed contract offer — a permanent move (TRANSFER) or a renewal.
 *  Returns the patched avatar, the clubs that changed, and a milestone/news. */
export function executeContractOffer(
  career: PlayerCareer, avatar: Player, offer: ContractOffer, clubs: Record<string, Club>, year: number, day: number,
): { career: PlayerCareer; avatar: Player; clubPatches: Record<string, Club>; news: NewsItem[] } {
  const news: NewsItem[] = [];
  const clubPatches: Record<string, Club> = {};
  let nextAvatar = avatar;
  let nextCareer = career;

  if (offer.kind === 'RENEWAL') {
    nextAvatar = { ...avatar, contract: { ...avatar.contract, wage: offer.wage, startYear: year, expiresYear: year + offer.length } };
    nextCareer = {
      ...career,
      milestones: [...career.milestones, { day, text: `Signed a new ${offer.length}-year deal at ${clubs[offer.clubId]?.shortName ?? 'the club'}.` }],
      careerEarnings: (career.careerEarnings ?? 0) + offer.signingBonus,
    };
    news.push(feed(day, 'MILESTONE', 'New contract signed', `${nameOf(avatar)} has committed to ${clubs[offer.clubId]?.name ?? 'the club'} on a ${offer.length}-year deal.`));
  } else {
    const buyer = clubs[offer.clubId];
    const seller = clubs[avatar.contract.clubId ?? ''];
    if (buyer && seller) {
      const fee = offer.fee ?? 0;
      nextAvatar = {
        ...avatar,
        contract: { ...avatar.contract, clubId: buyer.id, wage: offer.wage, startYear: year, expiresYear: year + offer.length },
        squadRole: offer.rolePromise === 'KEY' || offer.rolePromise === 'STAR' ? 'KEY' : 'ROTATION',
        transferListed: false, loan: null,
      };
      clubPatches[seller.id] = {
        ...seller,
        playerIds: seller.playerIds.filter((id) => id !== avatar.id),
        finances: { ...seller.finances, balance: seller.finances.balance + fee, transferBudget: seller.finances.transferBudget + Math.round(fee * 0.6) },
      };
      clubPatches[buyer.id] = {
        ...buyer,
        playerIds: [...buyer.playerIds.filter((id) => id !== avatar.id), avatar.id],
        finances: { ...buyer.finances, balance: buyer.finances.balance - fee, transferBudget: buyer.finances.transferBudget - fee },
      };
      nextCareer = {
        ...career,
        status: offer.rolePromise,
        managerTrust: 50, clubRelationship: 62, transferRequestPending: false,
        activeSagas: (career.activeSagas ?? []).map((s) => s.clubId === buyer.id ? { ...s, stage: 'DONE' as const } : s),
        // A role promise from the new club becomes a Tier-2 promise to keep.
        promises: [...(career.promises ?? []), { text: `${buyer.shortName} promised ${roleLabel(offer.rolePromise)} minutes`, kind: 'PLAYING_TIME', deadline: day + 200 }],
        milestones: [...career.milestones, { day, text: `Signed for ${buyer.name} in a €${fmtM(fee)} move.` }],
        careerEarnings: (career.careerEarnings ?? 0) + offer.signingBonus,
      };
      news.push(feed(day, 'MILESTONE', `${nameOf(avatar)} signs for ${buyer.shortName}!`, `A €${fmtM(fee)} move is done. A new chapter begins at ${buyer.name}.`));
    }
  }
  // Clear resolved offers.
  nextCareer = { ...nextCareer, contractOffers: (nextCareer.contractOffers ?? []).filter((o) => o.id !== offer.id) };
  return { career: nextCareer, avatar: nextAvatar, clubPatches, news };
}

/** Execute an accepted loan move out to a club for game time. */
export function executeLoanOffer(
  career: PlayerCareer, avatar: Player, offer: LoanOffer, clubs: Record<string, Club>, year: number, day: number,
): { career: PlayerCareer; avatar: Player; clubPatches: Record<string, Club>; news: NewsItem[] } {
  const parent = clubs[avatar.contract.clubId ?? ''];
  const dest = clubs[offer.clubId];
  const clubPatches: Record<string, Club> = {};
  if (!parent || !dest) return { career: { ...career, loanOffers: [] }, avatar, clubPatches, news: [] };
  const until = year + 1;
  clubPatches[parent.id] = { ...parent, playerIds: parent.playerIds.filter((id) => id !== avatar.id) };
  clubPatches[dest.id] = { ...dest, playerIds: [...dest.playerIds.filter((id) => id !== avatar.id), avatar.id] };
  const spell: LoanSpell = {
    parentClubId: parent.id, loanClubId: dest.id, until, minutesGuarantee: offer.minutesGuarantee,
    loanManagerTrust: 55, appsAtLoan: 0, goalsAtLoan: 0,
  };
  const nextAvatar: Player = {
    ...avatar,
    contract: { ...avatar.contract, clubId: dest.id },
    loan: { parentClubId: parent.id, untilYear: until, wageSplitParent: 0.5, optionToBuy: null },
    squadRole: 'ROTATION',
  };
  return {
    career: { ...career, loanSpell: spell, loanOffers: [], managerTrust: 55, milestones: [...career.milestones, { day, text: `Joined ${dest.shortName} on loan for game time.` }] },
    avatar: nextAvatar,
    clubPatches,
    news: [feed(day, 'MILESTONE', `Loan move to ${dest.shortName}`, `${nameOf(avatar)} joins ${dest.name} on loan${offer.minutesGuarantee ? ' with a minutes guarantee' : ''} — time to go and play.`)],
  };
}

const roleLabel = (s: SquadStatus) => s.charAt(0) + s.slice(1).toLowerCase();

// --- Orchestrator ------------------------------------------------------------

/**
 * Fold one advance's off-pitch life into the career. Deterministic under the
 * seed + day. Returns news + patches; all player-facing decisions are surfaced
 * (never auto-taken) unless the agent's auto-negotiate is armed, or a routine is
 * auto-managed. Pure — the store applies the returned patches.
 */
export function advanceOffPitch(input: {
  career: PlayerCareer;
  avatar: Player;
  clubs: Record<string, Club>;
  year: number;
  day: number;
  daysElapsed: number;
  seed: number;
  newSummary?: AvatarMatchSummary | null;
}): OffPitchResult {
  const { avatar, clubs, year, day, daysElapsed, seed } = input;
  let career = input.career;
  const news: NewsItem[] = [];
  let moraleDelta = 0;
  let clubPatches: Record<string, Club> | undefined;
  let playerPatch: Partial<Player> = {};

  // On loan: don't run the buying market; the spell resolves at the rollover.
  const onLoan = !!career.loanSpell;

  // 1) Following drift + lifestyle shaping (always on, tiny).
  career = { ...career, following: driftFollowing(career) };
  const life = applyLifestyle(career, avatar, year);
  career = life.career;
  if (life.playerPatch) playerPatch = { ...playerPatch, ...life.playerPatch };

  // 2) Market interest + sagas + contracts + loans + sponsors (not while loaned).
  if (!onLoan) {
    career = { ...career, transferInterest: updateInterest(career, avatar, clubs, year, day, seed) };

    const sg = advanceSagas(career, avatar, clubs, day, seed); career = sg.career; news.push(...sg.news);
    const sp = spawnRumours(career, avatar, clubs, day, seed); career = sp.career; news.push(...sp.news);
    const ct = advanceContracts(career, avatar, clubs, year, day, seed); career = ct.career; news.push(...ct.news);
    const ln = advanceLoans(career, avatar, clubs, year, day, seed); career = ln.career; news.push(...ln.news);
    const so = advanceSponsors(career, avatar, day, seed); career = so.career; news.push(...so.news);

    // Agent auto-negotiate escape hatch: quietly accept qualifying offers.
    if (career.agent?.autoNegotiate.enabled) {
      const auto = career.agent.autoNegotiate;
      const offers = career.contractOffers ?? [];
      const qualifying = offers.find((o) =>
        o.wage >= auto.minWage && statusRank(o.rolePromise) >= statusRank(auto.minRole));
      if (qualifying) {
        const ex = executeContractOffer(career, avatar, qualifying, clubs, year, day);
        career = ex.career; clubPatches = { ...(clubPatches ?? {}), ...ex.clubPatches };
        playerPatch = { ...playerPatch, ...patchFromAvatar(avatar, ex.avatar) };
        news.push(feed(day, 'TRANSFER', 'Agent seals the deal', `Your agent has agreed terms on your behalf.`));
        news.push(...ex.news);
      }
    }
  }

  // 3) Press trigger from the latest match (event-driven, one at a time).
  if (input.newSummary && (career.pendingPress ?? []).length === 0) {
    const prompt = pressPromptFor(input.newSummary, avatar, day);
    if (prompt) {
      career = { ...career, pendingPress: [prompt] };
      news.push(feed(day, 'GENERAL', 'The press want a word', `Reporters are waiting after the ${input.newSummary.opponent} game. (Answer in your inbox.)`));
    }
  }

  // 4) Wealth accrual.
  const earningsDelta = accrueEarnings(career, avatar, daysElapsed / 7);
  career = { ...career, careerEarnings: (career.careerEarnings ?? 0) + earningsDelta };

  return {
    career, news, moraleDelta, earningsDelta,
    playerPatch: Object.keys(playerPatch).length ? playerPatch : undefined,
    clubPatches,
  };
}

/** Diff two avatar snapshots into a patch (used when an executor rebuilt one). */
function patchFromAvatar(before: Player, after: Player): Partial<Player> {
  const patch: Partial<Player> = {};
  if (after.contract !== before.contract) patch.contract = after.contract;
  if (after.squadRole !== before.squadRole) patch.squadRole = after.squadRole;
  if (after.loan !== before.loan) patch.loan = after.loan;
  if (after.transferListed !== before.transferListed) patch.transferListed = after.transferListed;
  return patch;
}
