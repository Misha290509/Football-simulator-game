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
function effectiveValue(offer: FeeOffer, player: Player): number {
  const instalmentPenalty = offer.instalmentYears > 1 ? (offer.instalmentYears - 1) * 0.03 : 0;
  const sellOn = Math.min(40, Math.max(0, offer.sellOnPct)) / 100 * player.value * 0.5; // discounted future money
  const addOns = Math.max(0, offer.addOns) * 0.5; // uncertain, so half-valued
  return offer.fee * (1 - instalmentPenalty) + sellOn + addOns;
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
  if (eff >= valuation * 0.78) {
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
      : `${seller.shortName} reject the bid out of hand.`,
    valuation,
  };
}
