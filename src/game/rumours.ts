// ---------------------------------------------------------------------------
// Transfer rumour mill (§ Living market, #30). A seeded gossip generator that
// makes the market feel alive between windows: AI clubs are linked with players,
// speculation escalates from idle interest → a quoted valuation → a looming bid,
// and a hot rumour about one of the manager's own stars turns into a real,
// unsolicited offer. Pure and deterministic given (seed, day) — no I/O.
// ---------------------------------------------------------------------------

import type { Club } from '../types/club';
import type { Player } from '../types/player';
import type { NewsItem, Rumour, TransferOffer } from '../types/league';
import { Rng, hashSeed } from '../engine/rng';
import { askingPrice, wageDemand } from './transfers';

export interface RumourResult {
  rumours: Rumour[];
  news: NewsItem[];
  /** Unsolicited bids spawned when a rumour about a manager's player boils over. */
  bids: TransferOffer[];
}

const MAX_ACTIVE = 24;       // cap the live rumour board
const STAR_THRESHOLD = 80;   // world players interesting enough to gossip about
const money = (n: number) => `£${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}m`;

/** A plausible suitor for a player: a club of similar-or-higher standing that can
 *  afford them and isn't their current club. Deterministic pick from the RNG. */
function pickSuitor(p: Player, clubs: Club[], rng: Rng): Club | null {
  const ask = askingPrice(p);
  const candidates = clubs.filter(
    (c) => c.id !== p.contract.clubId && c.reputation >= p.overall - 6 && c.finances.transferBudget >= ask * 0.6,
  );
  if (candidates.length === 0) return null;
  // Prefer the bigger clubs — weight the pick toward higher reputation.
  candidates.sort((a, b) => b.reputation - a.reputation);
  const top = candidates.slice(0, Math.min(8, candidates.length));
  return top[rng.int(0, top.length - 1)];
}

/**
 * Advance the rumour mill one step. Ages/escalates existing rumours, spawns a few
 * new ones (a mix of gossip about the manager's stars and world moves), and
 * turns a boiling rumour about a manager player into a concrete bid.
 */
export function advanceRumours(
  managerClubId: string,
  clubs: Record<string, Club>,
  players: Record<string, Player>,
  existing: Rumour[],
  pendingOffers: TransferOffer[],
  seed: number,
  day: number,
  prevDay: number,
  year: number,
): RumourResult {
  const rng = new Rng((seed ^ hashSeed(`rumours_${day}`)) >>> 0);
  const daysAdvanced = Math.max(1, day - prevDay);
  const clubList = Object.values(clubs);
  const news: NewsItem[] = [];
  const bids: TransferOffer[] = [];
  const haveBidFor = new Set(pendingOffers.map((o) => `${o.playerId}_${o.type}`));

  // 1) Age & escalate existing rumours.
  const kept: Rumour[] = [];
  const rumouredPlayers = new Set<string>();
  for (const r of existing) {
    const p = players[r.playerId];
    const suitor = clubs[r.fromClubId];
    // Drop stale rumours (player/club gone, or the player already moved there).
    if (!p || !suitor || p.contract.clubId === r.fromClubId) continue;

    // Escalate or cool. Escalation is more likely the hotter it already is.
    const escalate = rng.chance(0.28 + r.heat / 400);
    let next: Rumour = { ...r };
    if (escalate) {
      next.heat = Math.min(100, r.heat + rng.int(12, 26));
      if (r.stage === 'INTEREST' && next.heat >= 55) {
        next.stage = 'PRICE';
        next.valuation = Math.round(askingPrice(p, year) * rng.float(0.9, 1.25) / 100_000) * 100_000;
        news.push(newsItem(`rumour_price_${r.id}_${day}`, day, `${suitor.shortName} value ${p.name.last} at ${money(next.valuation)}`,
          `Speculation is mounting that ${suitor.name} rate ${p.name.first} ${p.name.last} at around ${money(next.valuation)}.`));
      } else if (r.stage === 'PRICE' && next.heat >= 80) {
        next.stage = 'BID_LOOMING';
        news.push(newsItem(`rumour_loom_${r.id}_${day}`, day, `${suitor.shortName} closing in on ${p.name.last}`,
          `Reports suggest ${suitor.name} are ready to make their move for ${p.name.first} ${p.name.last}.`));
      }
    } else {
      next.heat = r.heat - rng.int(8, 16) * daysAdvanced;
    }
    if (next.heat <= 0) continue; // rumour fizzles out

    // A boiling rumour about the manager's own player becomes a real bid.
    if (next.stage === 'BID_LOOMING' && next.aboutManagerPlayer && p.contract.clubId === managerClubId
      && !p.loan && !haveBidFor.has(`${p.id}_BUY`)) {
      const ask = askingPrice(p, year);
      const fee = Math.round(ask * rng.float(0.85, 1.12) / 100_000) * 100_000;
      if (suitor.finances.transferBudget >= fee) {
        bids.push({ id: `offer_rumour_${p.id}_${day}`, type: 'BUY', playerId: p.id, fromClubId: suitor.id, fee, wage: wageDemand(p), day });
        haveBidFor.add(`${p.id}_BUY`);
        news.push(newsItem(`rumour_bid_${p.id}_${day}`, day, `Bid received: ${suitor.shortName} want ${p.name.last}`,
          `${suitor.name} have followed up the speculation with a concrete ${money(fee)} bid for ${p.name.first} ${p.name.last}. Respond on the Transfers screen.`));
        continue; // rumour is spent — it turned into an offer
      }
    }

    next.day = day;
    kept.push(next);
    rumouredPlayers.add(r.playerId);
  }

  // 2) Spawn new rumours (throttled), scaled by how many days elapsed.
  const spawnBudget = Math.min(3, 1 + Math.floor(daysAdvanced / 5));
  let spawned = 0;

  // 2a) Gossip about the manager's best players — the ones rivals covet.
  const mgrStars = Object.values(players)
    .filter((p) => p.contract.clubId === managerClubId && !p.loan && !rumouredPlayers.has(p.id))
    .sort((a, b) => b.overall - a.overall)
    .slice(0, 5);
  for (const p of mgrStars) {
    if (spawned >= spawnBudget || kept.length >= MAX_ACTIVE) break;
    // Bigger stars attract more talk.
    if (!rng.chance(0.10 + Math.max(0, p.overall - 74) * 0.02)) continue;
    const suitor = pickSuitor(p, clubList, rng);
    if (!suitor) continue;
    kept.push({ id: `rumour_${p.id}_${suitor.id}`, playerId: p.id, fromClubId: suitor.id, day, heat: rng.int(28, 46), stage: 'INTEREST', aboutManagerPlayer: true });
    rumouredPlayers.add(p.id);
    spawned++;
    news.push(newsItem(`rumour_new_${p.id}_${day}`, day, `${suitor.shortName} eyeing ${p.name.last}`,
      `${suitor.name} are said to be monitoring your ${p.positions[0]} ${p.name.first} ${p.name.last}.`));
  }

  // 2b) World gossip — notable players elsewhere linked with a move (pure colour).
  if (spawned < spawnBudget && kept.length < MAX_ACTIVE) {
    const worldStars = Object.values(players)
      .filter((p) => p.overall >= STAR_THRESHOLD && p.contract.clubId && p.contract.clubId !== managerClubId && !p.loan && !rumouredPlayers.has(p.id));
    // Deterministic sample: pick a few by hashing, avoiding a full sort of 16k.
    for (let tries = 0; tries < 12 && spawned < spawnBudget && kept.length < MAX_ACTIVE; tries++) {
      if (worldStars.length === 0) break;
      const p = worldStars[rng.int(0, worldStars.length - 1)];
      if (rumouredPlayers.has(p.id)) continue;
      if (!rng.chance(0.5)) continue;
      const suitor = pickSuitor(p, clubList, rng);
      if (!suitor || suitor.id === p.contract.clubId) continue;
      const from = clubs[p.contract.clubId!];
      kept.push({ id: `rumour_${p.id}_${suitor.id}`, playerId: p.id, fromClubId: suitor.id, day, heat: rng.int(24, 40), stage: 'INTEREST', aboutManagerPlayer: false });
      rumouredPlayers.add(p.id);
      spawned++;
      news.push(newsItem(`rumour_new_${p.id}_${day}`, day, `${suitor.shortName} linked with ${p.name.last}`,
        `${suitor.name} have been linked with ${from?.shortName ?? 'his club'}'s ${p.name.first} ${p.name.last} (${p.overall} OVR).`));
    }
  }

  // Keep the hottest rumours if we somehow overflow.
  const rumours = kept.sort((a, b) => b.heat - a.heat).slice(0, MAX_ACTIVE);
  return { rumours, news, bids };
}

function newsItem(id: string, day: number, title: string, body: string): NewsItem {
  return { id, day, category: 'TRANSFER', title, body, read: false };
}

/** UI helper: a one-line human summary of a rumour's current state. */
export function rumourLine(r: Rumour, players: Record<string, Player>, clubs: Record<string, Club>): string {
  const p = players[r.playerId];
  const c = clubs[r.fromClubId];
  const who = p ? `${p.name.first} ${p.name.last}` : 'A player';
  const club = c?.shortName ?? 'A club';
  if (r.stage === 'BID_LOOMING') return `${club} are closing in on ${who}.`;
  if (r.stage === 'PRICE') return `${club} value ${who}${r.valuation ? ` at ${money(r.valuation)}` : ''}.`;
  return `${club} are interested in ${who}.`;
}
