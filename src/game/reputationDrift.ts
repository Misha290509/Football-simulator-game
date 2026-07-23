// ---------------------------------------------------------------------------
// Club reputation drift (§ Living world, #50). Over the decades a club's standing
// should track its results: serial winners grow into giants, perennial strugglers
// and relegated sides fade. Each rollover nudges every club's reputation a little
// toward a target set by where it just finished — gentle, so a single season
// barely moves it but a sustained era reshapes the hierarchy. Pure/deterministic.
// ---------------------------------------------------------------------------

import type { Club } from '../types/club';
import type { Competition } from '../types/competition';
import type { StandingRow } from '../types/league';

/** Reputation a club "deserves" from a single finish: its tier floor plus how
 *  high it placed within the division. */
function targetReputation(tier: number, position: number, numClubs: number): number {
  const tierBase = tier === 1 ? 62 : tier === 2 ? 48 : tier === 3 ? 38 : tier === 4 ? 30 : 24;
  const posFrac = (numClubs - position + 1) / Math.max(1, numClubs); // 1 = champions
  return Math.min(96, Math.max(12, tierBase + posFrac * 32));
}

const MAX_STEP = 1.5;   // most a club can move in one season
const DRIFT_RATE = 0.12; // fraction of the gap closed per season

/**
 * Return the clubs whose reputation moved this season (a fresh object each), with
 * reputation nudged toward the finish-derived target. Clubs without a league
 * finish (e.g. not in any modelled division) are left untouched.
 */
export function driftClubReputations(
  clubs: Record<string, Club>,
  finalStandings: Record<string, StandingRow[]>,
  competitions: Record<string, Competition>,
): Club[] {
  const changed: Club[] = [];
  for (const [compId, rows] of Object.entries(finalStandings)) {
    const comp = competitions[compId];
    if (!comp) continue;
    rows.forEach((row, i) => {
      const club = clubs[row.clubId];
      if (!club) return;
      const target = targetReputation(comp.tier, i + 1, rows.length);
      const gap = target - club.reputation;
      const step = Math.max(-MAX_STEP, Math.min(MAX_STEP, gap * DRIFT_RATE));
      const next = Math.round((club.reputation + step) * 10) / 10;
      if (next !== club.reputation) changed.push({ ...club, reputation: next });
    });
  }
  return changed;
}
