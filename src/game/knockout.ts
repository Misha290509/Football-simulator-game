// ---------------------------------------------------------------------------
// Knockout tie resolution (§ #29). A level tie after 90 minutes now goes to
// extra time — a real chance for a winning goal — before a penalty shootout, in
// both continental and domestic-cup knockouts. Pure/deterministic given the RNG;
// mutates the match with any extra-time goals + a shootout event.
// ---------------------------------------------------------------------------

import type { Match } from '../types/match';
import type { Club } from '../types/club';
import { Rng } from '../engine/rng';

/** Add any extra-time goals to a level tie, updating the scoreline and events. */
export function playExtraTime(m: Match, clubs: Record<string, Club>, rng: Rng): void {
  const hr = clubs[m.homeClubId]?.reputation ?? 50;
  const ar = clubs[m.awayClubId]?.reputation ?? 50;
  // ~0.4 expected goals over 30 minutes, tilted by the reputation gap.
  const etGoals = (rep: number, opp: number): number => {
    const lam = Math.max(0.12, 0.4 + (rep - opp) / 320);
    let g = 0;
    for (let i = 0; i < 3; i++) if (rng.chance(lam / 3)) g++;
    return g;
  };
  const hg = etGoals(hr, ar);
  const ag = etGoals(ar, hr);
  const extra = [] as Match['events'];
  for (let i = 0; i < hg; i++) extra.push({ minute: rng.int(91, 120), type: 'GOAL', side: 'home', description: 'Extra-time goal' });
  for (let i = 0; i < ag; i++) extra.push({ minute: rng.int(91, 120), type: 'GOAL', side: 'away', description: 'Extra-time goal' });
  if (extra.length) {
    m.events = [...m.events, ...extra].sort((a, b) => a.minute - b.minute);
    m.homeGoals += hg;
    m.awayGoals += ag;
  }
}

/** Reputation-weighted penalty shootout. Returns the winning club id. */
export function penaltyShootout(m: Match, clubs: Record<string, Club>, rng: Rng): { winner: string; label: string } {
  const hr = clubs[m.homeClubId]?.reputation ?? 50;
  const ar = clubs[m.awayClubId]?.reputation ?? 50;
  const ph = 0.75 + (hr - ar) / 500, pa = 0.75 + (ar - hr) / 500;
  let hs = 0, as = 0;
  for (let i = 0; i < 5; i++) { if (rng.chance(ph)) hs++; if (rng.chance(pa)) as++; }
  let guard = 0;
  while (hs === as && guard++ < 20) { if (rng.chance(ph)) hs++; if (rng.chance(pa)) as++; }
  if (hs === as) hs++;
  return { winner: hs > as ? m.homeClubId : m.awayClubId, label: `Penalty shootout ${hs}–${as}` };
}

/**
 * Resolve a played knockout tie: goals in normal time, else extra time, else a
 * shootout. Respects a shootout already played out live (a stored PENALTY event).
 * Mutates `m` (extra-time goals, the shootout marker) and returns the winner.
 */
export function resolveKnockoutTie(m: Match, clubs: Record<string, Club>, rng: Rng): string {
  if (m.homeGoals > m.awayGoals) return m.homeClubId;
  if (m.awayGoals > m.homeGoals) return m.awayClubId;
  const existing = m.events.find((e) => e.type === 'PENALTY');
  if (existing) return existing.side === 'home' ? m.homeClubId : m.awayClubId;

  // Extra time — a level tie may be settled by a winning goal here.
  playExtraTime(m, clubs, rng);
  if (m.homeGoals > m.awayGoals) return m.homeClubId;
  if (m.awayGoals > m.homeGoals) return m.awayClubId;

  // Still level → penalties.
  const pen = penaltyShootout(m, clubs, rng);
  m.events = [...m.events, { minute: 120, type: 'PENALTY', side: pen.winner === m.homeClubId ? 'home' : 'away', description: pen.label }];
  return pen.winner;
}
