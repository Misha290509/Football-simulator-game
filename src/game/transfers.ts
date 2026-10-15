// ---------------------------------------------------------------------------
// Transfers, contracts & the AI market (§8, §11-M4). Pricing/negotiation are
// pure; the AI window runs at season rollover to keep the market alive
// (contract expiries → Bosman frees, AI squad maintenance, surplus sales).
// ---------------------------------------------------------------------------

import type { Club } from '../types/club';
import type { Player } from '../types/player';
import type { NewsItem, TransferOffer } from '../types/league';
import { Rng, clamp } from '../engine/rng';
import { reputationToAbility } from '../engine/generator';
import { marketWage } from '../engine/finances';
import { POSITION_GROUP } from '../types/attributes';

/** Fee a selling club expects. Surplus/listed players go cheaper. */
export function askingPrice(p: Player, year?: number): number {
  const roleMult =
    p.transferListed ? 0.85 :
    p.squadRole === 'SURPLUS' ? 0.8 :
    p.squadRole === 'KEY' ? 1.6 :
    p.squadRole === 'FIRST' ? 1.35 : 1.1;
  // Contract situation: an expiring player can leave on a free (Bosman); a
  // final-year player is available at a cut price.
  const left = year != null ? p.contract.expiresYear - year : 99;
  if (left <= 0) return 0; // out of contract → free transfer
  const discount = left === 1 ? 0.55 : 1;
  return Math.max(50_000, Math.round((p.value * roleMult * discount) / 50_000) * 50_000);
}

/**
 * Whether the manager can agree a Bosman pre-contract with a player (§ #34): he
 * must be under contract at another club, running out at the upcoming summer,
 * not already pre-agreed, and it must be the pre-contract window (January–May —
 * the real-world "final six months" rule, since contracts expire in summer).
 */
export function canAgreePreContract(
  p: Player,
  managerClubId: string,
  seasonYear: number,
  month: number, // 0 = January … 11 = December
): { ok: boolean; reason?: string } {
  if (!p.contract.clubId) return { ok: false, reason: 'He is a free agent — sign him outright.' };
  if (p.contract.clubId === managerClubId) return { ok: false, reason: 'He already plays for you — offer a renewal.' };
  if (p.loan) return { ok: false, reason: 'He is out on loan — no pre-contract.' };
  if (p.preContract) return { ok: false, reason: 'He has already agreed a pre-contract.' };
  if (p.contract.expiresYear > seasonYear) return { ok: false, reason: 'His contract runs beyond this season — no Bosman available.' };
  if (month > 4) return { ok: false, reason: 'Pre-contracts can only be agreed from January (final six months).' };
  return { ok: true };
}

/** Weekly wage a player expects to sign (rises with quality & ambition). */
export function wageDemand(p: Player): number {
  const ambition = 0.95 + (p.hidden.ambition / 100) * 0.3;
  return Math.round((marketWage(p.overall) * ambition) / 100) * 100;
}

export function weeklyWageBill(players: Player[]): number {
  // Loaned-in players only cost the club its share of the wage.
  return players.reduce((s, p) => s + p.contract.wage * (p.loan ? 1 - p.loan.wageSplitParent : 1), 0);
}

const round100k = (n: number) => Math.round(n / 100_000) * 100_000;

/** A weighted random pick. Items with a weight of zero or less are skipped. */
function weightedPick<T>(items: readonly T[], weight: (t: T) => number, rng: Rng): T | null {
  let total = 0;
  const weights = items.map((t) => {
    const w = Math.max(0, weight(t));
    total += w;
    return w;
  });
  if (total <= 0) return null;
  let r = rng.next() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}

/**
 * A club plausibly in the market for this player: around his level, able to
 * pay `minBudget`, and not in `exclude`. Picked at random across every club
 * that fits, weighted toward the closest fit, so interest comes from all over
 * the world. Taking the first club in the list that fitted meant the same club
 * (whichever the dataset happened to load first) made every offer.
 */
export function pickInterestedClub(
  player: Player,
  clubs: readonly Club[],
  rng: Rng,
  opts: { minBudget: number; exclude: ReadonlySet<string>; below?: number; above?: number },
): Club | null {
  const below = opts.below ?? 12;
  const above = opts.above ?? 12;
  const affordable = clubs.filter(
    (c) => !opts.exclude.has(c.id) && c.id !== player.contract.clubId && c.finances.transferBudget >= opts.minBudget,
  );
  const near = affordable.filter((c) => c.reputation >= player.overall - below && c.reputation <= player.overall + above);
  // Closer to his level is likelier, but anyone in range can come in.
  const fit = (c: Club) => 1 / (1 + Math.abs(c.reputation - player.overall) / 5);
  return weightedPick(near, fit, rng) ?? weightedPick(affordable, fit, rng);
}

/** Most clubs that will bid for one of your players at the same time. */
export const MAX_COMPETING_BIDS = 3;

/**
 * Generate AI offers for the manager's transfer-/loan-listed players. Returns
 * new offers to surface in the inbox/Transfers screen (manager accepts/rejects).
 *
 * A listed player who already has a bid can attract a second club that tops it,
 * so a good player put up for sale can start a bidding war.
 */
export function generateOffers(
  managerClubId: string,
  clubs: Record<string, Club>,
  players: Record<string, Player>,
  existing: TransferOffer[],
  rng: Rng,
  day: number,
  year: number,
): TransferOffer[] {
  const offers: TransferOffer[] = [];
  const aiClubs = Object.values(clubs).filter((c) => c.id !== managerClubId);
  const offersFor = (playerId: string, type: TransferOffer['type']) =>
    [...existing, ...offers].filter((o) => o.playerId === playerId && o.type === type);

  for (const p of Object.values(players)) {
    if (p.contract.clubId !== managerClubId) continue;
    if (p.loan) continue; // can't sell/loan a loaned-in player

    if (p.transferListed) {
      const bids = offersFor(p.id, 'BUY');
      if (bids.length === 0 && rng.chance(0.3)) {
        // A buyer near the player's level who can afford the asking price.
        const ask = askingPrice(p);
        const buyer = pickInterestedClub(p, aiClubs, rng, { minBudget: ask, exclude: new Set() });
        if (buyer) {
          offers.push({
            id: `offer_${p.id}_buy_${buyer.id}_${day}`,
            type: 'BUY', playerId: p.id, fromClubId: buyer.id,
            fee: round100k(ask * rng.float(0.85, 1.15)),
            wage: wageDemand(p), day,
          });
        }
      } else if (bids.length > 0 && bids.length < MAX_COMPETING_BIDS && rng.chance(0.22)) {
        // Another club gets wind of the bid and tops it.
        const top = bids.reduce((a, b) => (b.fee > a.fee ? b : a));
        const fee = round100k(top.fee * rng.float(1.05, 1.15));
        const rival = pickInterestedClub(p, aiClubs, rng, {
          minBudget: fee,
          exclude: new Set(bids.map((o) => o.fromClubId)),
        });
        if (rival && fee > top.fee) {
          offers.push({
            id: `offer_${p.id}_buy_${rival.id}_${day}`,
            type: 'BUY', playerId: p.id, fromClubId: rival.id,
            fee, wage: wageDemand(p), day, topsClubId: top.fromClubId,
          });
        }
      }
    }

    if (p.loanListed && offersFor(p.id, 'LOAN').length === 0 && rng.chance(0.35)) {
      const taker = pickInterestedClub(p, aiClubs, rng, { minBudget: 0, exclude: new Set(), below: 14, above: 4 });
      if (taker) {
        offers.push({
          id: `offer_${p.id}_loan_${taker.id}_${day}`,
          type: 'LOAN', playerId: p.id, fromClubId: taker.id,
          fee: 0, wage: wageDemand(p),
          loanUntilYear: year + rng.int(1, 2), wageSplitParent: rng.pick([0.5, 0.5, 0.6]), day,
        });
      }
    }
  }
  return offers;
}

// --- Bidding wars when you buy ----------------------------------------------
// When you open talks for a player, another club may already be in for him.
// The seller won't take less than the rival's bid, the rival raises as you
// haggle, and if you take too long the seller may simply take their money.

export interface RivalBid {
  clubId: string;
  /** The rival's current bid. You must beat it, not just match it. */
  bid: number;
  /** The most the rival will go to. Hidden from the player. */
  ceiling: number;
  /** Rounds of haggling since the rival appeared. */
  rounds: number;
}

/** How much you have to beat a rival's bid by for the seller to choose you. */
export function outbidMargin(bid: number): number {
  return Math.max(100_000, round100k(bid * 0.03));
}

/** The least the seller will take with a rival in the race. */
export function floorWithRival(floor: number, rival?: RivalBid): number {
  return rival ? Math.max(floor, rival.bid + outbidMargin(rival.bid)) : floor;
}

/**
 * Is another club already in for this player? Better players draw more
 * competition: about one in six for an ordinary player, nearly one in two for
 * a star.
 */
export function rollRivalBid(
  player: Player,
  sellerId: string,
  buyerId: string,
  floor: number,
  clubs: readonly Club[],
  rng: Rng,
): RivalBid | null {
  const chance = clamp(0.16 + (player.overall - 65) * 0.012, 0.1, 0.45);
  if (!rng.chance(chance)) return null;
  const bid = round100k(floor * rng.float(1.03, 1.15));
  const club = pickInterestedClub(player, clubs, rng, {
    minBudget: bid,
    exclude: new Set([sellerId, buyerId]),
    below: 10,
    above: 15,
  });
  if (!club) return null;
  const ceiling = round100k(Math.max(bid, Math.min(club.finances.transferBudget, floor * rng.float(1.2, 1.5))));
  return { clubId: club.id, bid, ceiling, rounds: 0 };
}

export type RivalMove =
  | { kind: 'RAISED'; rival: RivalBid }
  | { kind: 'HOLDS'; rival: RivalBid }
  | { kind: 'WITHDREW' }
  | { kind: 'SOLD'; rival: RivalBid };

/**
 * The rival's answer to a round of haggling you didn't win.
 *
 * If your offer is already above theirs, they try to top it and pull out when
 * they can't. If they are still ahead, the seller may just take their money,
 * and the longer you haggle the likelier that gets.
 */
export function advanceRival(rival: RivalBid, yourOffer: number, rng: Rng): RivalMove {
  const rounds = rival.rounds + 1;
  if (yourOffer >= rival.bid) {
    const needed = yourOffer + outbidMargin(yourOffer);
    if (needed > rival.ceiling) return { kind: 'WITHDREW' };
    const bid = round100k(Math.min(rival.ceiling, needed * rng.float(1, 1.04)));
    return { kind: 'RAISED', rival: { ...rival, bid: Math.max(bid, needed), rounds } };
  }
  if (rng.chance(Math.min(0.5, 0.05 + rounds * 0.07))) return { kind: 'SOLD', rival: { ...rival, rounds } };
  if (rival.bid < rival.ceiling && rng.chance(0.4)) {
    const bid = round100k(Math.min(rival.ceiling, rival.bid * rng.float(1.04, 1.1)));
    if (bid > rival.bid) return { kind: 'RAISED', rival: { ...rival, bid, rounds } };
  }
  return { kind: 'HOLDS', rival: { ...rival, rounds } };
}

export interface BidResult {
  ok: boolean;
  message: string;
}

/**
 * Resolve a manager bid for a player owned by `seller` (null = free agent).
 * Mutates copies via the provided maps when successful.
 */
export function evaluateBid(
  buyer: Club,
  seller: Club | null,
  player: Player,
  fee: number,
  wageOffer: number,
  buyerWageBill: number,
  year?: number,
): BidResult {
  if (player.contract.clubId === buyer.id) return { ok: false, message: 'Already at your club.' };

  const ask = seller ? askingPrice(player, year) : 0;
  if (seller) {
    if (player.squadRole === 'KEY' && !player.transferListed && fee < ask * 1.1) {
      return { ok: false, message: `${seller.shortName} value him highly — bid at least ${ask}.` };
    }
    if (fee < ask) return { ok: false, message: `${seller.shortName} reject the bid. They want ${ask}.` };
    if (fee > buyer.finances.transferBudget) {
      return { ok: false, message: 'Bid exceeds your transfer budget.' };
    }
  }

  const demand = wageDemand(player);
  if (wageOffer < demand) {
    return { ok: false, message: `The player wants ${demand}/wk in wages.` };
  }
  if (buyerWageBill + wageOffer - player.contract.wage > buyer.finances.wageBudget) {
    return { ok: false, message: 'This wage would breach your wage budget.' };
  }
  return { ok: true, message: 'Transfer agreed!' };
}

export interface SwapEval {
  ok: boolean;
  message: string;
  /** The offered player's worth to the seller, and the cash shortfall if any. */
  offeredWorth: number;
  shortfall: number;
}

/**
 * Evaluate a part-exchange (§ Living market, #32): cash + one of the manager's
 * players for a target. The seller credits the offered player at his market
 * value, discounted if he is clearly below their level (they can't use him),
 * and accepts when cash + that worth clears the asking price and terms are met.
 */
export function evaluateSwap(
  target: Player,
  seller: Club,
  offered: Player,
  cash: number,
  wageOffer: number,
  buyer: Club,
  buyerWageBill: number,
  year?: number,
): SwapEval {
  const ask = askingPrice(target, year);
  const fit = offered.overall >= seller.reputation - 12 ? 1 : offered.overall >= seller.reputation - 20 ? 0.7 : 0.45;
  const offeredWorth = Math.round(offered.value * fit);
  const total = cash + offeredWorth;
  const need = target.squadRole === 'KEY' && !target.transferListed ? Math.round(ask * 1.1) : ask;
  if (cash > buyer.finances.transferBudget) return { ok: false, message: 'The cash element exceeds your transfer budget.', offeredWorth, shortfall: 0 };
  if (total < need) return { ok: false, message: `${seller.shortName} value ${target.name.last} at ${need.toLocaleString()}; your package is worth about ${total.toLocaleString()}.`, offeredWorth, shortfall: need - total };
  const demand = wageDemand(target);
  if (wageOffer < demand) return { ok: false, message: `${target.name.last} wants ${demand.toLocaleString()}/wk.`, offeredWorth, shortfall: 0 };
  if (buyerWageBill - offered.contract.wage + wageOffer > buyer.finances.wageBudget) return { ok: false, message: 'That wage would breach your wage budget.', offeredWorth, shortfall: 0 };
  return { ok: true, message: `${seller.shortName} accept the part-exchange!`, offeredWorth, shortfall: 0 };
}

/** Produce the updated buyer/seller/player after an agreed transfer. */
export function applyTransfer(
  buyer: Club,
  seller: Club | null,
  player: Player,
  fee: number,
  wageOffer: number,
  year: number,
): { buyer: Club; seller: Club | null; player: Player } {
  const newPlayer: Player = {
    ...player,
    contract: {
      ...player.contract,
      clubId: buyer.id,
      wage: wageOffer,
      startYear: year,
      expiresYear: year + 4,
    },
    squadRole: 'ROTATION',
    transferListed: false,
  };
  const newBuyer: Club = {
    ...buyer,
    playerIds: [...buyer.playerIds.filter((id) => id !== player.id), player.id],
    finances: { ...buyer.finances, balance: buyer.finances.balance - fee, transferBudget: buyer.finances.transferBudget - fee },
  };
  let newSeller: Club | null = null;
  if (seller) {
    newSeller = {
      ...seller,
      playerIds: seller.playerIds.filter((id) => id !== player.id),
      finances: {
        ...seller.finances,
        balance: seller.finances.balance + fee,
        transferBudget: seller.finances.transferBudget + Math.round(fee * 0.6),
      },
    };
  }
  return { buyer: newBuyer, seller: newSeller, player: newPlayer };
}

// --- Contract renewals (§ player feedback) ---------------------------------

/** Will the player sign a new deal of `years` at `wage`/week? */
export function evaluateRenewal(player: Player, club: Club, years: number, wage: number): BidResult {
  if (years < 1 || years > 5) return { ok: false, message: 'Contract length must be 1–5 years.' };
  const gap = player.overall - club.reputation; // how far he's outgrown the club
  if (gap >= 10 && player.hidden.ambition > 62) {
    return { ok: false, message: `${player.name.last} feels he has outgrown the club and wants a move away.` };
  }
  const demand = Math.round(wageDemand(player) * (1 + Math.max(0, gap) * 0.03) / 100) * 100;
  if (player.morale < 35 && wage < demand * 1.2) {
    return { ok: false, message: `${player.name.last} is unsettled and won't commit without a much improved offer.` };
  }
  if (wage < demand) return { ok: false, message: `He wants at least ${demand.toLocaleString()}/wk to re-sign.` };
  return { ok: true, message: 'New contract agreed!' };
}

export function applyRenewal(player: Player, years: number, wage: number, year: number): Player {
  return {
    ...player,
    contract: { ...player.contract, wage, startYear: year, expiresYear: year + years },
    transferListed: false,
  };
}

// --- Loans (§ player feedback) ---------------------------------------------

/** Can the manager bring this player in on loan? Good players refuse. */
export function evaluateLoanIn(player: Player, club: Club, years: number): BidResult {
  if (years < 1 || years > 2) return { ok: false, message: 'Loans run for 1–2 years.' };
  if (player.loan) return { ok: false, message: 'He is already out on loan.' };
  if (player.squadRole === 'KEY') return { ok: false, message: 'His club won\'t loan out a key player.' };
  if (player.overall >= 72) return { ok: false, message: 'A player of his quality won\'t accept a loan move.' };
  if (player.overall > club.reputation) return { ok: false, message: 'He\'s too good to join you on loan.' };
  return { ok: true, message: 'Loan move agreed!' };
}

/** Upfront loan fee the parent charges — a slice of market value, steeper for
 *  better players, so a loan competes with your transfer budget. */
export function loanFee(player: Player): number {
  const pct = 0.05 + Math.max(0, player.overall - 55) * 0.004; // ~5% rising to ~12%
  return Math.max(50_000, Math.round((player.value * pct) / 50_000) * 50_000);
}

/**
 * Judge negotiated loan terms. Base eligibility aside, the parent club resists
 * covering a big share of the wages, but a generous option-to-buy sweetens them
 * into paying more. `wageSplitParent` is the fraction of wages the PARENT pays.
 */
export function evaluateLoanTerms(
  player: Player, toClub: Club, fromClub: Club, years: number,
  wageSplitParent: number, optionToBuy: number | null,
): BidResult {
  const base = evaluateLoanIn(player, toClub, years);
  if (!base.ok) return base;
  const val = player.value;
  // How much of the wage the parent will stomach, lifted by a strong buy option.
  let tolerance = 0.5;
  if (optionToBuy != null) {
    if (optionToBuy >= val * 1.2) tolerance += 0.3;
    else if (optionToBuy >= val * 0.9) tolerance += 0.15;
    else if (optionToBuy < val * 0.6) tolerance -= 0.15; // insultingly cheap option
  }
  tolerance = Math.min(0.9, Math.max(0.1, tolerance));
  if (wageSplitParent > tolerance + 0.001) {
    return {
      ok: false,
      message: `${fromClub.shortName} won't cover ${Math.round(wageSplitParent * 100)}% of his wages — they'll go to about ${Math.round(tolerance * 100)}%. Pay more of the wages yourself, or raise the option to buy.`,
    };
  }
  return { ok: true, message: `${fromClub.shortName} agree to the loan on those terms.` };
}

/** Move a player on loan from their current club to `toClub`. The loan fee (if
 *  any) is paid from the borrower's transfer budget to the parent's. */
export function applyLoanMove(
  player: Player,
  fromClub: Club,
  toClub: Club,
  untilYear: number,
  wageSplitParent: number,
  optionToBuy?: number | null,
  fee = 0,
): { player: Player; fromClub: Club; toClub: Club } {
  return {
    player: {
      ...player,
      contract: { ...player.contract, clubId: toClub.id },
      loan: { parentClubId: fromClub.id, untilYear, wageSplitParent, optionToBuy: optionToBuy ?? null },
      loanListed: false,
      transferListed: false,
      squadRole: 'ROTATION',
    },
    fromClub: {
      ...fromClub,
      playerIds: fromClub.playerIds.filter((id) => id !== player.id),
      finances: { ...fromClub.finances, transferBudget: fromClub.finances.transferBudget + fee },
    },
    toClub: {
      ...toClub,
      playerIds: [...toClub.playerIds.filter((id) => id !== player.id), player.id],
      finances: { ...toClub.finances, transferBudget: toClub.finances.transferBudget - fee },
    },
  };
}

export interface WindowResult {
  changedPlayers: Player[];
  changedClubs: Record<string, Club>;
  news: NewsItem[];
}

let _seq = 0;
const news = (year: number, category: NewsItem['category'], title: string, body: string): NewsItem => ({
  id: `news_t_${year}_${_seq++}`, day: 0, category, title, body, read: false,
});

/**
 * AI transfer window at rollover. Handles contract expiries, then has AI clubs
 * fill squad gaps from the free-agent pool and sell a little surplus. Keeps
 * everything within budgets. Deterministic.
 */
export function runAiTransferWindow(
  clubsIn: Record<string, Club>,
  playersIn: Record<string, Player>,
  managerClubId: string,
  year: number,
  rng: Rng,
): WindowResult {
  // The caller passes freshly-built objects this rollover, so we mutate in
  // place and use a squad index for performance (10k+ players globally).
  const clubs = clubsIn;
  const players = playersIn;
  const newsItems: NewsItem[] = [];

  const squadByClub = new Map<string, Player[]>();
  const freeAgents: Player[] = [];
  for (const p of Object.values(players)) {
    if (p.contract.clubId) (squadByClub.get(p.contract.clubId) ?? squadByClub.set(p.contract.clubId, []).get(p.contract.clubId)!).push(p);
    else freeAgents.push(p);
  }

  // 1) Contract expiries → renew core, release fringe to free agency (Bosman).
  for (const [clubId, squad] of squadByClub) {
    const ranked = [...squad].sort((a, b) => b.overall - a.overall);
    const rankOf = new Map(ranked.map((p, i) => [p.id, i]));
    for (const p of [...squad]) {
      if (p.contract.expiresYear > year) continue;
      // A player who signed a Bosman pre-contract elsewhere is not renewed or
      // released here — the pending-arrival fulfilment moves him for free.
      if (p.preContract) continue;
      const age = year - p.born.year;
      const keep = (rankOf.get(p.id) ?? 99) < 20 && age < 33;
      if (keep) {
        p.contract.expiresYear = year + rng.int(2, 4);
        p.contract.wage = Math.max(p.contract.wage, wageDemand(p));
        if (clubId === managerClubId && p.squadRole === 'KEY') {
          newsItems.push(news(year, 'TRANSFER', `${p.name.last} signs a new deal`, 'Contract extended.'));
        }
      } else {
        p.contract.clubId = null;
        p.transferListed = false;
        freeAgents.push(p);
        const arr = squadByClub.get(clubId)!;
        arr.splice(arr.indexOf(p), 1);
      }
    }
  }

  // 2) AI clubs maintain squad size by signing affordable free agents.
  freeAgents.sort((a, b) => b.overall - a.overall);
  for (const club of Object.values(clubs)) {
    if (club.id === managerClubId) continue; // human handles their own market
    const squad = squadByClub.get(club.id) ?? squadByClub.set(club.id, []).get(club.id)!;
    let bill = weeklyWageBill(squad);
    const targetAbility = reputationToAbility(club.reputation);
    let guard = 0;
    while (squad.length < 24 && guard++ < 10) {
      // Pick the closest-ability affordable free agent.
      let bestIdx = -1;
      let bestDist = Infinity;
      for (let i = 0; i < freeAgents.length; i++) {
        const fa = freeAgents[i];
        if (wageDemand(fa) + bill > club.finances.wageBudget) continue;
        const dist = Math.abs(fa.overall - targetAbility);
        if (dist < bestDist) { bestDist = dist; bestIdx = i; }
      }
      if (bestIdx < 0) break;
      const signing = freeAgents.splice(bestIdx, 1)[0];
      signing.contract.clubId = club.id;
      signing.contract.wage = wageDemand(signing);
      signing.contract.startYear = year;
      signing.contract.expiresYear = year + rng.int(1, 4);
      signing.squadRole = 'ROTATION';
      club.playerIds = [...club.playerIds, signing.id];
      squad.push(signing);
      bill += signing.contract.wage;
    }
  }

  // 3) AI clubs put surplus depth and aging players up for sale, so there's a
  //    live market of buyable, cut-price players each window (not just Bosmans).
  for (const club of Object.values(clubs)) {
    if (club.id === managerClubId) continue; // the manager lists their own
    const squad = squadByClub.get(club.id) ?? [];
    for (const p of squad) if (p.transferListed) p.transferListed = false; // refresh each window
    if (squad.length < 21) continue; // thin squads keep everyone
    const ranked = [...squad].sort((a, b) => b.overall - a.overall);
    // Candidates: squad players outside the first-team core, or over-30s.
    const surplus = ranked.filter((p, i) => (i >= 18 || year - p.born.year >= 30) && p.squadRole !== 'KEY');
    // List a handful, weighted so deeper squads offload more.
    const nList = Math.min(surplus.length, rng.chance(0.5) ? rng.int(1, 3) : 0);
    for (let k = 0; k < nList; k++) {
      const pick = surplus[rng.int(0, surplus.length - 1)];
      pick.transferListed = true;
    }
  }

  return {
    changedPlayers: Object.values(players),
    changedClubs: clubs,
    news: newsItems,
  };
}

/** Heuristic: is the AI club willing to sell this player to anyone? */
export function isAvailable(player: Player, squad: Player[]): boolean {
  if (player.transferListed) return true;
  const sorted = [...squad].sort((a, b) => b.overall - a.overall);
  const rank = sorted.findIndex((p) => p.id === player.id);
  const groupDepth = squad.filter((p) => POSITION_GROUP[p.position] === POSITION_GROUP[player.position]).length;
  // Surplus depth players & non-key squad members can be prised away.
  return player.squadRole !== 'KEY' && (rank >= 16 || groupDepth > 4);
}

export { clamp };
