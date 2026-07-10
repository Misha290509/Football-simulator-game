// ---------------------------------------------------------------------------
// Transfer-fee negotiation (§ Market). The selling club values a player on his
// true worth, steepened by how important he is to them and how far above the
// buyer he sits — stars and key players cost a heavy premium and can be prised
// away only by blowing the club out of the water. The buyer can sweeten a cash
// bid with instalments, a sell-on clause and performance add-ons. The club then
// accepts, counters, or rejects. Pure + deterministic.
// ---------------------------------------------------------------------------

import type { Player } from '../types/player';
import type { Club } from '../types/club';
import { estimateValue } from '../engine/development';

export interface FeeOffer {
  fee: number;            // guaranteed cash
  instalmentYears: number; // 1 = paid up front; 2–4 spreads it (club likes it less)
  sellOnPct: number;      // 0–40, % of a future sale owed to the seller
  addOns: number;         // performance-based add-ons (appearances/goals)
}

export type FeeOutcome = 'ACCEPT' | 'COUNTER' | 'REJECT';
export interface FeeResult {
  outcome: FeeOutcome;
  message: string;
  counterFee?: number; // the club's suggested guaranteed fee
  valuation: number;   // what the club effectively wants (for UI hints)
}

const round100k = (n: number) => Math.round(n / 100_000) * 100_000;

/**
 * The selling club's true valuation — the guaranteed cash it really wants. Built
 * from market value, then steepened for squad importance and for a player who
 * sits well above the buyer's stature (the classic "not for sale" premium).
 */
export function clubValuation(player: Player, seller: Club | null, buyer: Club, year: number): number {
  const base = estimateValue(player.overall, year - player.born.year, player.potential);
  const roleMult =
    player.transferListed ? 0.9 :
    player.squadRole === 'KEY' ? 1.7 :
    player.squadRole === 'FIRST' ? 1.35 :
    player.squadRole === 'SURPLUS' ? 0.82 : 1.1;
  // Prestige premium: prising a player off a stronger club, or a player the
  // buyer has clearly not earned, costs more.
  const sellerRep = seller?.reputation ?? 55;
  const prestige = 1 + Math.max(0, sellerRep - buyer.reputation) * 0.012
    + Math.max(0, player.overall - buyer.reputation) * 0.02;
  // Final-year players are cheaper (they can leave soon anyway).
  const yearsLeft = player.contract.expiresYear - year;
  const contractMult = yearsLeft <= 0 ? 0.15 : yearsLeft === 1 ? 0.6 : 1;
  return round100k(Math.max(50_000, base * roleMult * prestige * contractMult));
}

/** The cash-equivalent of an offer to the seller (add-ons sweeten a lower fee). */
export function effectiveValue(offer: FeeOffer, player: Player): number {
  const instalmentPenalty = offer.instalmentYears > 1 ? (offer.instalmentYears - 1) * 0.03 : 0;
  const sellOn = Math.min(40, Math.max(0, offer.sellOnPct)) / 100 * player.value * 0.5; // discounted future money
  const addOns = Math.max(0, offer.addOns) * 0.5; // uncertain, so half-valued
  return offer.fee * (1 - instalmentPenalty) + sellOn + addOns;
}

// --- Stateful, tension-driven negotiation (§ Market) -----------------------
// The manager haggles round by round. The club opens with an *overpriced* ask
// and drifts it toward a hidden floor as you bid; meet the floor and they sell.
// Lowball offers raise the club's tension with you; at 100 they walk away.

/** The lowest guaranteed cash the club will truly accept (the hidden floor). */
export function transferFloor(player: Player, seller: Club | null, buyer: Club, year: number): number {
  const valuation = clubValuation(player, seller, buyer, year);
  const untouchable = player.squadRole === 'KEY' && !player.transferListed && player.overall > buyer.reputation + 2;
  return round100k(untouchable ? valuation * 1.15 : valuation * 0.98);
}

/** The club's opening ask — a mark-up over the floor, so you can haggle it down.
 *  `factor` (≈1.25–1.5) is supplied by the caller's RNG for determinism. */
export function overpricedAsk(floor: number, factor: number): number {
  return round100k(floor * factor);
}

/** Letter grade for how close the final fee landed to the club's floor. */
export function dealGrade(finalFee: number, floor: number, initialAsk: number): string {
  const span = Math.max(1, initialAsk - floor);
  const r = Math.min(1, Math.max(0, (finalFee - floor) / span));
  if (r <= 0.04) return 'A+';
  if (r <= 0.12) return 'A';
  if (r <= 0.22) return 'B+';
  if (r <= 0.34) return 'B';
  if (r <= 0.5) return 'C';
  if (r <= 0.7) return 'D';
  return 'E';
}

export interface TalkResponse {
  outcome: 'ACCEPT' | 'COUNTER' | 'REFUSE';
  message: string;
  ask: number;      // the club's updated public ask
  tension: number;  // updated 0–100 tension with this club
  grade?: string;   // set on ACCEPT
}

/** One round of haggling. Pure: the store owns the persisted talk + tension. */
export function respondToTransferOffer(p: {
  offer: FeeOffer; player: Player; sellerName: string;
  floor: number; ask: number; initialAsk: number; tension: number;
}): TalkResponse {
  const eff = effectiveValue(p.offer, p.player);
  const clamp01 = (n: number) => Math.min(100, Math.max(0, Math.round(n)));
  // Meeting (or beating) the floor closes the deal, however you reached it.
  if (eff >= p.floor) {
    const grade = dealGrade(p.offer.fee, p.floor, p.initialAsk);
    return {
      outcome: 'ACCEPT', grade, ask: p.floor, tension: clamp01(p.tension - 6),
      message: `${p.sellerName} accept your offer for ${p.player.name.last}. Deal grade: ${grade}.`,
    };
  }
  const ratio = eff / Math.max(1, p.floor);
  const delta = ratio < 0.6 ? 18 : ratio < 0.85 ? 10 : 5;
  const tension = clamp01(p.tension + delta);
  // They give ground, dropping the ask ~45% of the way toward their floor.
  const ask = round100k(Math.max(p.floor, p.ask - (p.ask - p.floor) * 0.45));
  if (tension >= 100) {
    return {
      outcome: 'REFUSE', ask, tension: 100,
      message: `${p.sellerName} are fed up with your lowballing and break off talks.`,
    };
  }
  const mood = ratio < 0.6 ? 'That offer insults them' : ratio < 0.85 ? 'Still well short' : 'Getting closer';
  return {
    outcome: 'COUNTER', ask, tension,
    message: `${mood} — ${p.sellerName} now want ${ask.toLocaleString()} for ${p.player.name.last}.`,
  };
}

export function negotiateFee(
  player: Player, seller: Club | null, buyer: Club, offer: FeeOffer, year: number,
): FeeResult {
  const valuation = clubValuation(player, seller, buyer, year);
  if (!seller) {
    return { outcome: 'ACCEPT', message: 'Free agent — no fee required.', valuation: 0 };
  }
  const name = player.name.last;
  // A club won't sell its prized asset unless truly blown away.
  const untouchable = player.squadRole === 'KEY' && !player.transferListed && player.overall > buyer.reputation + 2;
  const acceptBar = untouchable ? valuation * 1.15 : valuation * 0.98;

  const eff = effectiveValue(offer, player);
  if (eff >= acceptBar) {
    return { outcome: 'ACCEPT', message: `${seller.shortName} accept your offer for ${name}.`, valuation };
  }
  // No minimum bid: lowball freely. A merely low offer is met with a counter
  // (they name their price); only an insultingly low one is rejected outright.
  if (eff >= valuation * 0.5) {
    return {
      outcome: 'COUNTER',
      message: `${seller.shortName} want more for ${name} — they're holding out for ${round100k(acceptBar).toLocaleString()}.`,
      counterFee: round100k(acceptBar),
      valuation,
    };
  }
  return {
    outcome: 'REJECT',
    message: untouchable
      ? `${seller.shortName} insist ${name} is not for sale at anything like that price.`
      : `${seller.shortName} break off talks — that bid is nowhere near their valuation.`,
    valuation,
  };
}
