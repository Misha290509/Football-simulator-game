// ---------------------------------------------------------------------------
// Deadline-day feed (§ Living market, #31). When a transfer window slams shut,
// the last-minute business — AI deals across the leagues plus the manager's own
// completed moves — is formatted as a ticking, chronological feed for a bit of
// theatre. Pure and deterministic given its inputs.
// ---------------------------------------------------------------------------

import type { Club } from '../types/club';
import type { Player } from '../types/player';
import type { DeadlineFeed } from '../types/league';
import type { AiDeal } from './aiTransfers';

const money = (n: number) => (n <= 0 ? 'free' : `£${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}m`);

/** A descending run of clock times through the final hours (e.g. 23:41 → 18:02). */
function clockAt(i: number, total: number): string {
  const start = 23 * 60 + 55; // 23:55
  const span = 6 * 60;        // spread across the last ~6 hours
  const mins = Math.max(0, start - Math.round((span * i) / Math.max(1, total)));
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Build the deadline-day feed from the AI deals struck as the window closed and
 * the manager's own arrivals, newest (latest clock) first.
 */
export function buildDeadlineFeed(
  deals: AiDeal[],
  managerMoves: { playerName: string; text: string }[],
  players: Record<string, Player>,
  clubs: Record<string, Club>,
  windowLabel: string,
  day: number,
): DeadlineFeed {
  // Biggest-money deals headline the top of the feed (latest, most dramatic).
  const ranked = [...deals].sort((a, b) => b.fee - a.fee);
  const items: DeadlineFeed['items'] = [];
  const total = ranked.length + managerMoves.length;

  managerMoves.forEach((m) => {
    items.push({ time: clockAt(items.length, total), text: m.text, mine: true, big: true });
  });
  ranked.forEach((d) => {
    const p = players[d.playerId];
    const to = clubs[d.toClubId];
    const from = clubs[d.fromClubId];
    const name = p ? `${p.name.first[0]}. ${p.name.last}` : d.playerName;
    items.push({
      time: clockAt(items.length, total),
      text: `${to?.shortName ?? 'A club'} sign ${name} from ${from?.shortName ?? 'their club'} (${money(d.fee)})`,
      big: d.fee >= 30_000_000,
    });
  });

  return { windowLabel, day, items };
}
