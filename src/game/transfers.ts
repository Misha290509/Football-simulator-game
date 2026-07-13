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

/** Weekly wage a player expects to sign (rises with quality & ambition). */
export function wageDemand(p: Player): number {
  const ambition = 0.95 + (p.hidden.ambition / 100) * 0.3;
  return Math.round((marketWage(p.overall) * ambition) / 100) * 100;
}

export function weeklyWageBill(players: Player[]): number {
  // Loaned-in players only cost the club its share of the wage.
  return players.reduce((s, p) => s + p.contract.wage * (p.loan ? 1 - p.loan.wageSplitParent : 1), 0);
}

/**
 * Generate AI offers for the manager's transfer-/loan-listed players. Returns
 * new offers to surface in the inbox/Transfers screen (manager accepts/rejects).
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
  const haveOfferFor = new Set(existing.map((o) => `${o.playerId}_${o.type}`));
  const aiClubs = Object.values(clubs).filter((c) => c.id !== managerClubId);

  for (const p of Object.values(players)) {
    if (p.contract.clubId !== managerClubId) continue;
    if (p.loan) continue; // can't sell/loan a loaned-in player

    if (p.transferListed && !haveOfferFor.has(`${p.id}_BUY`) && rng.chance(0.3)) {
      // A buyer near the player's level who can afford the asking price.
      const ask = askingPrice(p);
      const buyer = aiClubs.find(
        (c) => Math.abs(c.reputation - p.overall) <= 12 && c.finances.transferBudget >= ask,
      ) ?? aiClubs.find((c) => c.finances.transferBudget >= ask);
      if (buyer) {
        offers.push({
          id: `offer_${p.id}_buy_${day}`,
          type: 'BUY', playerId: p.id, fromClubId: buyer.id,
          fee: Math.round(ask * rng.float(0.85, 1.15) / 100_000) * 100_000,
          wage: wageDemand(p), day,
        });
      }
    }

    if (p.loanListed && !haveOfferFor.has(`${p.id}_LOAN`) && rng.chance(0.35)) {
      const taker = aiClubs.find((c) => c.reputation >= p.overall - 14 && c.reputation <= p.overall + 4);
      if (taker) {
        offers.push({
          id: `offer_${p.id}_loan_${day}`,
          type: 'LOAN', playerId: p.id, fromClubId: taker.id,
          fee: 0, wage: wageDemand(p),
          loanUntilYear: year + rng.int(1, 2), wageSplitParent: rng.pick([0.5, 0.5, 0.6]), day,
        });
      }
    }
  }
  return offers;
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
