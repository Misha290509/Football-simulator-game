// ---------------------------------------------------------------------------
// Market scouting (§ Market). Turns a scout + a target into a biased point
// estimate of overall, potential and value. Better scouts read closer to the
// truth — a 5★ scout is within ±1 (often exact); a 2★ can be well off in either
// direction, so you may overpay or underbid and get knocked back. The estimate
// is the ceiling: you only ever see your scout's read, never a guaranteed truth.
// Deterministic per (player, scout) so a report never jitters.
// ---------------------------------------------------------------------------

import type { Player } from '../types/player';
import type { Staff } from '../types/staff';
import type { ScoutReport } from '../types/league';
import { estimateValue } from './development';

/** A scout's star rating (1–5) from their 0–100 rating. */
export function scoutStars(scout: Staff): number {
  return Math.max(1, Math.min(5, Math.round(scout.rating / 20)));
}

const clampR = (n: number) => Math.max(40, Math.min(99, Math.round(n)));

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** A signed error in [-max, max], magnitude skewed small; deterministic from h. */
function bias(h: number, max: number): number {
  if (max <= 0) return 0;
  // Triangular-ish: bias toward small errors even for weak scouts.
  const a = h % (max + 1);
  const b = (h >> 5) % (max + 1);
  const mag = Math.min(a, b);
  const sign = (h >> 11) & 1 ? 1 : -1;
  return sign * mag;
}

/**
 * Build a scout's report on a player. `days`-agnostic — the caller decides when
 * it lands. Accuracy is driven by the scout's judging ability; the value read is
 * derived from the (biased) overall so overrating a player also overvalues him.
 */
export function buildScoutReport(player: Player, scout: Staff, year: number, day: number): ScoutReport {
  const acc = scout.scoutProfile?.judgingAbility ?? scout.rating;
  const potAcc = scout.scoutProfile?.judgingPotential ?? Math.max(20, acc - 6);
  // 5★ (acc ~95) → ±1; 3★ (acc ~55) → ±4; 2★ (acc ~40) → ±5–6; 1★ → ±7–8.
  const maxErr = Math.max(1, Math.min(8, Math.round((100 - acc) / 11)));
  const maxPotErr = Math.max(1, Math.min(13, Math.round((100 - potAcc) / 7)));
  const h = hash(`${player.id}|${scout.id}`);
  const estOverall = clampR(player.overall + bias(h, maxErr));
  const estPotential = clampR(Math.max(estOverall, player.potential + bias(h >> 3, maxPotErr)));
  const age = year - player.born.year;
  return {
    playerId: player.id,
    estOverall,
    estPotential,
    estValue: estimateValue(estOverall, age, estPotential),
    stars: scoutStars(scout),
    day,
    scoutName: `${scout.name.first} ${scout.name.last}`,
  };
}

export type MarketKnowledge = 'OWN' | 'ELITE' | 'REPORT' | 'ESTIMATE';
export interface MarketView {
  level: MarketKnowledge;
  ovr: number;        // shown overall (true or estimate — never hidden)
  pot: number;
  value: number;      // shown value (true or estimate)
  stars: number | null; // read confidence (scout report / department)
  exact: boolean;     // true value vs. an estimate
}

/** Confidence stars (1–5) from a 0–100 scouting-department rating. */
export const departmentStars = (scoutRating: number): number =>
  Math.max(1, Math.min(5, Math.round(scoutRating / 20)));

/**
 * Your scouting department's read on a player you haven't specifically scouted.
 * Every player is visible; a weak department just sees a noisier estimate. The
 * value read tracks the overall misread, so overrating a player overvalues him.
 * Deterministic per (player, club).
 */
function departmentEstimate(player: Player, managerClubId: string, scoutRating: number) {
  const acc = Math.max(20, Math.min(95, scoutRating));
  const maxErr = Math.max(1, Math.min(10, Math.round((100 - acc) / 8)));   // 90→1, 55→6, 20→10
  const maxPotErr = Math.max(2, Math.min(15, Math.round((100 - acc) / 5)));
  const h = hash(`${player.id}|dept|${managerClubId}`);
  const ovrBias = bias(h, maxErr);
  const ovr = clampR(player.overall + ovrBias);
  const pot = clampR(Math.max(ovr, player.potential + bias(h >> 3, maxPotErr)));
  // Value follows the overall misread (±6% per OVR point) plus its own noise.
  const valNoise = bias(h >> 7, maxErr) / 100;
  const value = Math.max(0, Math.round((player.value * (1 + ovrBias * 0.06 + valNoise)) / 10_000) * 10_000);
  return { ovr, pot, value, stars: departmentStars(scoutRating) };
}

/**
 * What the manager sees about a player in the market. Nothing is hidden:
 *  • OWN      — your own player: exact.
 *  • ELITE    — one of the world's best (globally known): exact.
 *  • REPORT   — a scout you dispatched has filed a sharper estimate.
 *  • ESTIMATE — your scouting department's baseline read, skewed by its quality.
 */
export function marketView(
  player: Player,
  opts: { managerClubId: string; eliteIds: Set<string>; report?: ScoutReport; scoutRating?: number },
): MarketView {
  if (player.contract.clubId === opts.managerClubId || player.academyClubId === opts.managerClubId) {
    return { level: 'OWN', ovr: player.overall, pot: player.potential, value: player.value, stars: null, exact: true };
  }
  if (opts.eliteIds.has(player.id)) {
    return { level: 'ELITE', ovr: player.overall, pot: player.potential, value: player.value, stars: null, exact: true };
  }
  if (opts.report) {
    return { level: 'REPORT', ovr: opts.report.estOverall, pot: opts.report.estPotential, value: opts.report.estValue, stars: opts.report.stars, exact: false };
  }
  const est = departmentEstimate(player, opts.managerClubId, opts.scoutRating ?? 40);
  return { level: 'ESTIMATE', ovr: est.ovr, pot: est.pot, value: est.value, stars: est.stars, exact: false };
}

/** A club's scouting-department strength (0–100): its best scout, else a floor. */
export function clubScoutRating(staff: Staff[] | undefined): number {
  const scouts = (staff ?? []).filter((s) => s.role === 'SCOUT');
  if (scouts.length === 0) return 28; // no scouts → poor, noisy reads
  return Math.max(...scouts.map((s) => s.rating));
}

/** The ids of the globally-known elite — the top `n` players by true overall. */
export function eliteKnownIds(players: Record<string, Player> | Player[], n = 50): Set<string> {
  const list = Array.isArray(players) ? players : Object.values(players);
  return new Set(
    [...list]
      .filter((p) => p.contract.clubId) // contracted players only
      .sort((a, b) => b.overall - a.overall || (a.id < b.id ? -1 : 1))
      .slice(0, n)
      .map((p) => p.id),
  );
}
