// ---------------------------------------------------------------------------
// AI-to-AI transfer market (§ Living world). AI clubs trade with each other so
// the world moves without the manager: each buying club identifies its weakest
// position group, shortlists affordable upgrades at other clubs (respecting
// the seller's willingness via isAvailable), and executes deals within its
// transfer and wage budgets. Runs twice a year — the summer window at rollover
// and a smaller winter window mid-season. Pure and deterministic per Rng.
// ---------------------------------------------------------------------------

import type { Club } from '../types/club';
import type { Player } from '../types/player';
import type { NewsItem } from '../types/league';
import { POSITION_GROUP, type PositionGroup } from '../types/attributes';
import { Rng } from '../engine/rng';
import { reputationToAbility } from '../engine/generator';
import { askingPrice, wageDemand, weeklyWageBill, applyTransfer, isAvailable } from './transfers';

export interface AiDeal {
  playerId: string;
  playerName: string;
  fromClubId: string;
  toClubId: string;
  fee: number;
  ovr: number;
}

export interface AiTransfersResult {
  players: Record<string, Player>;
  clubs: Record<string, Club>;
  deals: AiDeal[];
  news: NewsItem[];
}

/** Healthy depth per position group; below this a club shops for that group. */
const GROUP_TARGET: Record<PositionGroup, number> = { GK: 3, DEF: 8, MID: 8, ATT: 6 };
const MIN_SELLER_SQUAD = 18;
const MAX_BUYER_SQUAD = 29;

/** The buyer's weakest position group: thin depth first, then weak quality. */
function neediestGroup(squad: Player[], targetAbility: number): PositionGroup {
  let worst: PositionGroup = 'MID';
  let worstScore = Infinity;
  for (const g of ['GK', 'DEF', 'MID', 'ATT'] as PositionGroup[]) {
    const inGroup = squad.filter((p) => POSITION_GROUP[p.position] === g).sort((a, b) => b.overall - a.overall);
    const starters = g === 'GK' ? 1 : g === 'ATT' ? 3 : 4;
    const top = inGroup.slice(0, starters);
    const quality = top.length ? top.reduce((s, p) => s + p.overall, 0) / top.length : 0;
    const score = Math.min(1, inGroup.length / GROUP_TARGET[g]) * 0.55 + Math.min(1.2, quality / targetAbility) * 0.45;
    if (score < worstScore) { worstScore = score; worst = g; }
  }
  return worst;
}

export function runAiToAiTransfers(
  clubsIn: Record<string, Club>,
  playersIn: Record<string, Player>,
  managerClubId: string,
  year: number,
  rng: Rng,
  opts: { maxDeals: number; day: number; reserved?: Set<string> },
): AiTransfersResult {
  const reserved = opts.reserved ?? new Set<string>();
  const clubs = { ...clubsIn };
  const players = { ...playersIn };
  const deals: AiDeal[] = [];
  const moved = new Set<string>(); // no player moves twice in one window

  // Squad index, updated as deals execute.
  const squadOf = new Map<string, Player[]>();
  for (const p of Object.values(players)) {
    if (p.contract.clubId) (squadOf.get(p.contract.clubId) ?? squadOf.set(p.contract.clubId, []).get(p.contract.clubId)!).push(p);
  }

  // Big clubs shop first (with a little deterministic jitter for variety).
  const buyers = Object.values(clubs)
    .filter((c) => c.id !== managerClubId)
    .map((c) => ({ c, order: c.reputation + rng.int(-6, 6) }))
    .sort((a, b) => b.order - a.order)
    .map((x) => x.c);

  for (const buyerStart of buyers) {
    if (deals.length >= opts.maxDeals) break;
    // Busier markets at bigger clubs.
    if (!rng.chance(0.2 + buyerStart.reputation / 260)) continue;
    const buyer = clubs[buyerStart.id];
    const squad = squadOf.get(buyer.id) ?? [];
    if (squad.length >= MAX_BUYER_SQUAD) continue;

    const targetAbility = reputationToAbility(buyer.reputation);
    const need = neediestGroup(squad, targetAbility);
    const inGroup = squad.filter((p) => POSITION_GROUP[p.position] === need);
    const groupBest = inGroup.length ? Math.max(...inGroup.map((p) => p.overall)) : 0;
    const wageRoom = buyer.finances.wageBudget - weeklyWageBill(squad);
    const budget = buyer.finances.transferBudget;
    if (budget < 250_000 || wageRoom < 800) continue;

    // Shortlist: an upgrade on the group's depth, affordable, and gettable.
    let best: Player | null = null;
    let bestScore = -Infinity;
    for (const cand of Object.values(players)) {
      const sellerId = cand.contract.clubId;
      if (!sellerId || sellerId === buyer.id || sellerId === managerClubId) continue;
      if (moved.has(cand.id) || reserved.has(cand.id)) continue;
      if (POSITION_GROUP[cand.position] !== need) continue;
      const age = year - cand.born.year;
      if (age > 32 || cand.injury) continue;
      // Worth buying: stronger than the group's depth, plausible for the level.
      if (cand.overall < groupBest - 6 || cand.overall > targetAbility + 12) continue;
      const sellerSquad = squadOf.get(sellerId) ?? [];
      if (sellerSquad.length <= MIN_SELLER_SQUAD) continue;
      if (!isAvailable(cand, sellerSquad)) continue;
      const fee = askingPrice(cand, year);
      if (fee > budget) continue;
      if (wageDemand(cand) > wageRoom) continue;
      // Prefer quality now, a dash of youth/potential, discount heavy fees.
      const score = cand.overall + (cand.potential - cand.overall) * 0.25 - age * 0.2 - fee / 40_000_000 + rng.float(0, 1.5);
      if (score > bestScore) { bestScore = score; best = cand; }
    }
    if (!best || best.overall <= groupBest - 4) continue;

    const sellerId = best.contract.clubId!;
    const fee = askingPrice(best, year);
    const upd = applyTransfer(clubs[buyer.id], clubs[sellerId], best, fee, wageDemand(best), year);
    clubs[buyer.id] = upd.buyer;
    if (upd.seller) clubs[sellerId] = upd.seller;
    players[best.id] = upd.player;
    // Keep the squad index current.
    const sSquad = squadOf.get(sellerId)!;
    sSquad.splice(sSquad.findIndex((p) => p.id === best!.id), 1);
    (squadOf.get(buyer.id) ?? squadOf.set(buyer.id, []).get(buyer.id)!).push(upd.player);

    moved.add(best.id);
    deals.push({
      playerId: best.id, playerName: `${best.name.first} ${best.name.last}`,
      fromClubId: sellerId, toClubId: buyer.id, fee, ovr: best.overall,
    });
  }

  // Newsworthy moves: the biggest fees make headlines (avoid feed spam).
  const headlineDeals = [...deals].sort((a, b) => b.fee - a.fee).slice(0, 8);
  const newsItems: NewsItem[] = headlineDeals.map((d, i) => ({
    id: `news_ai_deal_${year}_${opts.day}_${i}`,
    day: opts.day,
    category: 'TRANSFER',
    title: `${d.playerName} joins ${clubs[d.toClubId]?.shortName ?? '?'}`,
    body: `${clubs[d.toClubId]?.name} sign ${d.playerName} (${d.ovr} OVR) from ${clubs[d.fromClubId]?.name} for ${d.fee.toLocaleString()}.`,
    read: false,
  }));

  return { players, clubs, deals, news: newsItems };
}
