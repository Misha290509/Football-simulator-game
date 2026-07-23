// ---------------------------------------------------------------------------
// Season projections (§ Match presentation). A lightweight, deterministic Monte
// Carlo over a league's remaining fixtures: from the current table + a strength
// model it estimates each club's title / top-N / relegation probability. Not the
// full match engine (that would be far too heavy to run thousands of times in
// the UI) — a fast strength-based W/D/L model, seeded so the numbers are stable
// for a given matchday.
// ---------------------------------------------------------------------------

import type { Competition } from '../types/competition';
import type { Club } from '../types/club';
import type { Match } from '../types/match';
import type { StandingRow } from '../types/league';
import { Rng, hashSeed } from '../engine/rng';

export interface ClubProjection {
  clubId: string;
  title: number;      // P(finish 1st) 0–1
  topN: number;       // P(finish in the top `topSlots`)
  relegation: number; // P(finish in the drop zone)
  expectedPoints: number;
  expectedPosition: number;
}

const HOME_EDGE = 4; // strength points

/** Elo-style expected result for the home side (0–1) from a strength gap. */
function expectedHome(strHome: number, strAway: number): number {
  return 1 / (1 + Math.pow(10, -((strHome - strAway) + HOME_EDGE) / 16));
}

/**
 * Project the finish of a single-table league. `strengthOf` returns a 0–100
 * club strength (reputation blended with current form is a good choice). Runs
 * `sims` seeded Monte-Carlo seasons over the unplayed fixtures.
 */
export function projectLeague(
  comp: Competition,
  rows: StandingRow[],
  remaining: Match[],
  clubs: Record<string, Club>,
  seed: number,
  opts: { sims?: number; topSlots?: number } = {},
): ClubProjection[] {
  const sims = opts.sims ?? 1500;
  const topSlots = opts.topSlots ?? Math.max(1, comp.promotion?.autoPromote ?? 4);
  const relegate = comp.promotion?.autoRelegate ?? 0;
  const n = rows.length;
  const ids = rows.map((r) => r.clubId);
  const idx = new Map(ids.map((id, i) => [id, i]));
  const basePts = rows.map((r) => r.points);
  const baseGd = rows.map((r) => r.goalsFor - r.goalsAgainst);
  const strength = ids.map((id) => clubs[id]?.reputation ?? 55);

  const fixtures = remaining
    .filter((m) => !m.played && m.competitionId === comp.id && idx.has(m.homeClubId) && idx.has(m.awayClubId))
    .map((m) => ({ h: idx.get(m.homeClubId)!, a: idx.get(m.awayClubId)! }));

  const titleCount = new Array(n).fill(0);
  const topCount = new Array(n).fill(0);
  const relCount = new Array(n).fill(0);
  const posSum = new Array(n).fill(0);
  const ptsSum = new Array(n).fill(0);
  const rng = new Rng((seed ^ hashSeed(`proj_${comp.id}_${basePts.reduce((a, b) => a + b, 0)}`)) >>> 0);

  for (let s = 0; s < sims; s++) {
    const pts = basePts.slice();
    const gd = baseGd.slice();
    for (const f of fixtures) {
      const e = expectedHome(strength[f.h], strength[f.a]);
      const pDraw = 0.30 - 0.22 * Math.abs(e - 0.5);
      const pHome = Math.max(0, e - pDraw / 2);
      const roll = rng.next();
      if (roll < pHome) { pts[f.h] += 3; gd[f.h] += 1; gd[f.a] -= 1; }
      else if (roll < pHome + pDraw) { pts[f.h] += 1; pts[f.a] += 1; }
      else { pts[f.a] += 3; gd[f.a] += 1; gd[f.h] -= 1; }
    }
    // Rank by points, then goal difference (a tiny strength tiebreak keeps it stable).
    const order = ids.map((_id, i) => i).sort((x, y) => pts[y] - pts[x] || gd[y] - gd[x] || strength[y] - strength[x]);
    for (let pos = 0; pos < n; pos++) {
      const i = order[pos];
      posSum[i] += pos + 1;
      ptsSum[i] += pts[i];
      if (pos === 0) titleCount[i]++;
      if (pos < topSlots) topCount[i]++;
      if (relegate > 0 && pos >= n - relegate) relCount[i]++;
    }
  }

  return ids.map((clubId, i) => ({
    clubId,
    title: titleCount[i] / sims,
    topN: topCount[i] / sims,
    relegation: relCount[i] / sims,
    expectedPoints: Math.round(ptsSum[i] / sims),
    expectedPosition: posSum[i] / sims,
  }));
}
