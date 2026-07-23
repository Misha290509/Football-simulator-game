// ---------------------------------------------------------------------------
// Club takeovers / rich owners (§ Living world, #38). Over the seasons a moneyed
// owner can buy out a mid-tier club, transforming its finances and ambition —
// the single biggest lever for a world that genuinely changes over decades. New
// takeovers inject a windfall and lift reputation; existing wealthy owners keep
// topping the club up so it stays a force. Pure and deterministic given its RNG.
// ---------------------------------------------------------------------------

import type { Club } from '../types/club';
import type { NewsItem } from '../types/league';
import { Rng } from '../engine/rng';

export type OwnerWealth = 'RICH' | 'SUPER_RICH';

const clampRep = (n: number) => Math.min(99, Math.max(1, Math.round(n)));

const WINDFALL: Record<OwnerWealth, { cash: number; budget: number; wageMult: number; rep: number }> = {
  RICH: { cash: 90_000_000, budget: 70_000_000, wageMult: 1.4, rep: 4 },
  SUPER_RICH: { cash: 320_000_000, budget: 240_000_000, wageMult: 1.85, rep: 8 },
};

export interface TakeoverResult {
  changed: Club[];
  news: NewsItem[];
  /** True when the manager's own club was taken over this rollover. */
  managerTakeover: boolean;
}

function news(day: number, title: string, body: string): NewsItem {
  return { id: `news_takeover_${title.replace(/\W+/g, '_')}_${day}`, day, category: 'BOARD', title, body, read: false };
}

/**
 * Process ownership changes for the new season. A small, seeded number of mid-
 * tier clubs (a sleeping giant is a better story than another billionaire toy at
 * an already-elite club) are taken over; clubs that already have a rich owner get
 * an annual top-up so their spending power endures.
 */
export function processTakeovers(
  clubs: Record<string, Club>,
  managerClubId: string,
  year: number,
  day: number,
  rng: Rng,
): TakeoverResult {
  const changed: Club[] = [];
  const newsItems: NewsItem[] = [];
  let managerTakeover = false;

  // 1) New takeovers — candidates are ambitious-but-not-elite clubs.
  const candidates = Object.values(clubs).filter(
    (c) => !c.owner && c.reputation >= 45 && c.reputation <= 82,
  );
  // 0–2 takeovers a season, weighted toward the more attractive projects.
  const nTakeovers = rng.next() < 0.45 ? (rng.next() < 0.3 ? 2 : 1) : 0;
  const pool = [...candidates].sort((a, b) => b.reputation - a.reputation).slice(0, Math.max(6, Math.ceil(candidates.length * 0.3)));
  const taken = new Set<string>();
  for (let i = 0; i < nTakeovers && pool.length > 0; i++) {
    const pick = pool[rng.int(0, pool.length - 1)];
    if (taken.has(pick.id)) continue;
    taken.add(pick.id);
    const wealth: OwnerWealth = rng.next() < 0.3 ? 'SUPER_RICH' : 'RICH';
    const w = WINDFALL[wealth];
    const club = clubs[pick.id];
    const balance = club.finances.balance + w.cash;
    const upgraded: Club = {
      ...club,
      owner: { wealth, since: year },
      reputation: clampRep(club.reputation + w.rep),
      finances: {
        ...club.finances,
        balance,
        transferBudget: club.finances.transferBudget + w.budget,
        wageBudget: Math.round(club.finances.wageBudget * w.wageMult),
      },
    };
    changed.push(upgraded);
    const rich = wealth === 'SUPER_RICH' ? 'a fabulously wealthy consortium' : 'a wealthy new owner';
    newsItems.push(news(day, `Takeover: ${club.name}`,
      `${club.name} have been bought out by ${rich}. A ${(w.cash / 1_000_000) | 0}M war chest and soaring ambitions transform the club overnight.`));
    if (club.id === managerClubId) managerTakeover = true;
  }

  // 2) Existing wealthy owners keep the coffers full.
  for (const club of Object.values(clubs)) {
    if (!club.owner || taken.has(club.id)) continue;
    const topUp = club.owner.wealth === 'SUPER_RICH' ? 120_000_000 : 40_000_000;
    changed.push({
      ...club,
      finances: {
        ...club.finances,
        balance: club.finances.balance + topUp,
        transferBudget: club.finances.transferBudget + Math.round(topUp * 0.7),
      },
    });
  }

  return { changed, news: newsItems, managerTakeover };
}
