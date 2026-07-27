// ---------------------------------------------------------------------------
// Player Career — money & life outside (§ What it's actually worth). A wage is
// a headline number; what reaches him is another thing entirely:
//
//   • Tax — gross vs net, and how much moving country really changes.
//   • Investments — a restaurant, property, a stake in something. They pay, or
//     they quietly don't, and one of them can cost him a fortune.
//   • The adviser — the man handling it all, who is either very good or, one
//     day, gone with the lot.
//   • Family — relatives who need help. Saying yes costs money; saying no costs
//     something else.
//
// Pure & deterministic: hashes stable ids, never the sim's RNG stream.
// ---------------------------------------------------------------------------

import type { Player } from '../types/player';
import type { NewsItem } from '../types/league';
import type { PlayerCareer, Conversation } from '../types/playerCareer';
import { hashSeed } from '../engine/rng';

let _seq = 0;
const feed = (day: number, category: NewsItem['category'], title: string, body: string): NewsItem =>
  ({ id: `news_pc_money_${day}_${_seq++}`, day, category, title, body, read: false });
const nameOf = (p: Player) => `${p.name.first} ${p.name.last}`;
const pick = <T>(arr: T[], key: string): T => arr[hashSeed(key) % arr.length];

// --- Tax ------------------------------------------------------------------------

/** Top marginal rates by country, so a move abroad genuinely changes take-home. */
const TAX_RATES: Record<string, number> = {
  eng: 0.45, esp: 0.47, ita: 0.43, ger: 0.45, fra: 0.49, por: 0.48, ned: 0.495,
  sco: 0.47, bra: 0.275, arg: 0.35, usa: 0.37, sau: 0.0, uae: 0.0, qat: 0.0, tur: 0.4, mex: 0.35,
};
export const DEFAULT_TAX = 0.42;

export function taxRateFor(countryId: string | undefined): number {
  return countryId ? (TAX_RATES[countryId] ?? DEFAULT_TAX) : DEFAULT_TAX;
}

export interface WagePacket { gross: number; tax: number; agentCut: number; net: number; rate: number }

/** What actually lands in his account each week. */
export function wagePacket(grossWeekly: number, countryId: string | undefined, agentPct: number): WagePacket {
  const rate = taxRateFor(countryId);
  const tax = grossWeekly * rate;
  const agentCut = grossWeekly * (agentPct / 100);
  return { gross: grossWeekly, tax, agentCut, net: Math.max(0, grossWeekly - tax - agentCut), rate };
}

/** A plain comparison for a prospective move: is the "bigger" offer bigger? */
export function compareNet(
  currentGross: number, currentCountry: string | undefined,
  offerGross: number, offerCountry: string | undefined, agentPct: number,
): { currentNet: number; offerNet: number; better: boolean; deltaPct: number } {
  const a = wagePacket(currentGross, currentCountry, agentPct).net;
  const b = wagePacket(offerGross, offerCountry, agentPct).net;
  return { currentNet: a, offerNet: b, better: b > a, deltaPct: a > 0 ? Math.round(((b - a) / a) * 100) : 0 };
}

// --- Investments -------------------------------------------------------------------

export type InvestmentId = 'RESTAURANT' | 'PROPERTY' | 'STARTUP' | 'ACADEMY' | 'BONDS';

export interface InvestmentDef {
  id: InvestmentId; label: string; blurb: string;
  cost: number; /** Expected annual return as a fraction of cost. */ yield: number;
  /** Chance per year of going badly wrong (0–1). */ risk: number;
}

export const INVESTMENTS: InvestmentDef[] = [
  { id: 'BONDS', label: 'Government bonds', blurb: 'Boring. Safe. Your adviser approves.', cost: 500_000, yield: 0.04, risk: 0.01 },
  { id: 'PROPERTY', label: 'A property portfolio', blurb: 'Bricks and mortar. Slow, steady, hard to lose.', cost: 2_000_000, yield: 0.08, risk: 0.06 },
  { id: 'RESTAURANT', label: 'Open a restaurant', blurb: 'Your name above the door. Everyone says it’s a bad idea.', cost: 1_200_000, yield: 0.12, risk: 0.3 },
  { id: 'ACADEMY', label: 'Fund a youth academy', blurb: 'Back home, where you came from. It may never pay.', cost: 1_500_000, yield: 0.02, risk: 0.05 },
  { id: 'STARTUP', label: 'Back a startup', blurb: 'A friend of a friend swears it’s the next big thing.', cost: 1_000_000, yield: 0.35, risk: 0.55 },
];
export const investmentById = (id: InvestmentId) => INVESTMENTS.find((i) => i.id === id);

export interface Holding { id: InvestmentId; since: number; value: number; failed?: boolean }

export function invest(career: PlayerCareer, avatar: Player, id: InvestmentId, day: number): { ok: boolean; career: PlayerCareer; news: NewsItem[]; message: string } {
  const def = investmentById(id);
  if (!def) return { ok: false, career, news: [], message: 'No such investment.' };
  if ((career.holdings ?? []).some((h) => h.id === id && !h.failed)) return { ok: false, career, news: [], message: 'You already hold that.' };
  if ((career.bankBalance ?? 0) < def.cost) return { ok: false, career, news: [], message: 'You can’t cover that yet.' };
  return {
    ok: true,
    career: {
      ...career,
      bankBalance: (career.bankBalance ?? 0) - def.cost,
      holdings: [...(career.holdings ?? []), { id, since: day, value: def.cost }],
    },
    news: [feed(day, 'GENERAL', `Invested: ${def.label.toLowerCase()}`,
      `${nameOf(avatar)} has put money into ${def.label.toLowerCase()}. ${def.blurb}`)],
    message: `Invested in ${def.label.toLowerCase()}.`,
  };
}

/**
 * A year passes on his portfolio: things grow, and occasionally one of them
 * goes badly wrong. Deterministic per year.
 */
export function advanceInvestments(
  career: PlayerCareer, avatar: Player, year: number, day: number, seed: number,
): { career: PlayerCareer; news: NewsItem[]; moraleDelta: number } {
  const holdings = career.holdings ?? [];
  if (holdings.length === 0) return { career, news: [], moraleDelta: 0 };
  const news: NewsItem[] = [];
  let moraleDelta = 0;
  let balance = career.bankBalance ?? 0;
  const next: Holding[] = [];

  for (const h of holdings) {
    if (h.failed) { next.push(h); continue; }
    const def = investmentById(h.id)!;
    const roll = hashSeed(`inv_${seed}_${h.id}_${year}`) % 1000;
    if (roll < def.risk * 1000) {
      // It's gone.
      news.push(feed(day, 'GENERAL', `${def.label} has collapsed`,
        `The ${def.label.toLowerCase()} ${nameOf(avatar)} backed has gone under. That's ${fmt(h.value)} he won't see again — an expensive lesson, quietly learned.`));
      moraleDelta -= 5;
      next.push({ ...h, value: 0, failed: true });
      continue;
    }
    const payout = Math.round(h.value * def.yield);
    balance += payout;
    if (payout > 0 && (hashSeed(`invnews_${seed}_${h.id}_${year}`) % 100) < 30) {
      news.push(feed(day, 'GENERAL', `${def.label} paid out`, `A good year: ${fmt(payout)} from the ${def.label.toLowerCase()}.`));
    }
    next.push({ ...h, value: h.value + Math.round(payout * 0.3) });
  }
  return { career: { ...career, bankBalance: balance, holdings: next }, news, moraleDelta };
}

const fmt = (n: number) => n >= 1_000_000 ? `€${(n / 1_000_000).toFixed(1)}M` : `€${Math.round(n / 1000)}k`;

/** Everything his portfolio is currently worth. */
export function portfolioValue(career: PlayerCareer): number {
  return (career.holdings ?? []).reduce((n, h) => n + (h.failed ? 0 : h.value), 0);
}

// --- The financial adviser ------------------------------------------------------------

export interface AdviserState { name: string; trustworthy: boolean; since: number; exposed?: boolean }

const ADVISER_NAMES = ['Martin Vale', 'Declan Roche', 'Simon Ferry', 'Anthony Blake', 'Gordon Rees'];

/** Hire someone to handle it. Most are fine. One in five, quietly, is not. */
export function hireAdviser(career: PlayerCareer, day: number, seed: number): { career: PlayerCareer; news: NewsItem[] } {
  if (career.adviser) return { career, news: [] };
  const name = pick(ADVISER_NAMES, `adviser_${seed}`);
  const trustworthy = (hashSeed(`advisertrust_${seed}`) % 100) >= 20;
  return {
    career: { ...career, adviser: { name, trustworthy, since: day } },
    news: [feed(day, 'GENERAL', 'A financial adviser',
      `${name} will handle the money from here. He comes recommended, which is what everybody says.`)],
  };
}

/** The adviser storyline: a good one quietly compounds; a bad one, one day, doesn't. */
export function advanceAdviser(
  career: PlayerCareer, avatar: Player, day: number, seed: number,
): { career: PlayerCareer; news: NewsItem[]; moraleDelta: number } {
  const a = career.adviser;
  if (!a || a.exposed) return { career, news: [], moraleDelta: 0 };
  const years = Math.max(0, Math.round((day - a.since) / 300));

  if (a.trustworthy) {
    // Quietly good: a small bonus return, occasionally mentioned.
    if ((hashSeed(`advgood_${seed}_${day}`) % 100) < 4) {
      const gain = Math.round((career.bankBalance ?? 0) * 0.02);
      return {
        career: { ...career, bankBalance: (career.bankBalance ?? 0) + gain },
        news: gain > 0 ? [feed(day, 'GENERAL', 'Your money is in good hands', `${a.name} has been quietly effective — another ${fmt(gain)} this quarter.`)] : [],
        moraleDelta: 0,
      };
    }
    return { career, news: [], moraleDelta: 0 };
  }

  // The bad one: it takes years, then it all comes out at once.
  if (years < 2 || (hashSeed(`advbad_${seed}_${day}`) % 100) >= 6) return { career, news: [], moraleDelta: 0 };
  const lost = Math.round((career.bankBalance ?? 0) * 0.55);
  return {
    career: {
      ...career,
      bankBalance: Math.max(0, (career.bankBalance ?? 0) - lost),
      adviser: { ...a, exposed: true },
    },
    news: [feed(day, 'GENERAL', 'His adviser has disappeared',
      `${a.name} is gone, and so is a great deal of ${nameOf(avatar)}'s money — ${fmt(lost)} of it. There'll be lawyers, and there'll be years of them.`)],
    moraleDelta: -12,
  };
}

// --- Family -----------------------------------------------------------------------------

const FAMILY_ASKS = [
  { who: 'his brother', what: 'wants backing for a business idea' },
  { who: 'an uncle', what: 'is behind on a mortgage' },
  { who: 'a cousin', what: 'needs help with medical bills' },
  { who: 'an old friend from home', what: 'has asked for a loan he won’t be able to repay' },
];

/**
 * Family and old friends come calling once he's visibly wealthy. Saying yes
 * costs money; saying no costs something you can't buy back.
 */
export function maybeFamilyAsk(
  career: PlayerCareer, avatar: Player, day: number, seed: number,
): { conversation: Conversation | null; news: NewsItem[] } {
  if ((career.bankBalance ?? 0) < 2_000_000) return { conversation: null, news: [] };
  if ((hashSeed(`family_${seed}_${day}`) % 100) >= 4) return { conversation: null, news: [] };
  const ask = pick(FAMILY_ASKS, `familywho_${seed}_${day}`);
  return {
    news: [feed(day, 'GENERAL', 'A call from home', `${nameOf(avatar)} has heard from home: ${ask.who} ${ask.what}.`)],
    conversation: {
      id: `conv_family_${day}`,
      trigger: 'FAMILY',
      prompt: `${ask.who.charAt(0).toUpperCase() + ask.who.slice(1)} ${ask.what}. You can afford it. That isn't really the question.`,
      choices: [
        { text: 'Help — of course you help.', morale: 4, confidence: 2 },
        { text: 'Help, but make it the last time.', morale: 1 },
        { text: 'Say no. You’ve given enough.', morale: -3, confidence: -2 },
      ],
    },
  };
}

/** What saying yes actually costs. */
export const FAMILY_HELP_COST = 250_000;
