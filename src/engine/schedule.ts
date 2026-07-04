// ---------------------------------------------------------------------------
// Schedule generation (§7B). Balanced round-robin via the circle method.
// Deterministic given a seed. Each "matchday" index doubles as the sim day so
// competitions of different sizes interleave naturally on the calendar.
// ---------------------------------------------------------------------------

import type { Match } from '../types/match';
import type { Competition } from '../types/competition';
import { Rng } from './rng';

interface Pairing {
  home: string;
  away: string;
}

/**
 * Single round-robin pairings using the circle method, returning `n-1` rounds
 * for `n` clubs (n assumed even; a bye is added if odd and filtered out).
 */
function singleRoundRobin(clubIds: string[]): Pairing[][] {
  const teams = [...clubIds];
  const bye = '__BYE__';
  if (teams.length % 2 !== 0) teams.push(bye);

  const n = teams.length;
  const rounds: Pairing[][] = [];
  const fixed = teams[0];
  let rotating = teams.slice(1);

  for (let r = 0; r < n - 1; r++) {
    const round: Pairing[] = [];
    const left = [fixed, ...rotating].slice(0, n / 2);
    const right = [fixed, ...rotating].slice(n / 2).reverse();
    for (let i = 0; i < n / 2; i++) {
      const home = left[i];
      const away = right[i];
      if (home !== bye && away !== bye) {
        // Alternate home/away by round to balance venues.
        round.push(r % 2 === 0 ? { home, away } : { home: away, away: home });
      }
    }
    rounds.push(round);
    // Rotate all but the fixed team.
    rotating = [rotating[rotating.length - 1], ...rotating.slice(0, -1)];
  }
  return rounds;
}

/**
 * Build a full fixture list for a competition. `rounds` = how many times each
 * pair meets (2 = home/away double round-robin). Returns Match stubs (unplayed)
 * with day == matchday index.
 */
export function generateSchedule(
  competition: Competition,
  seasonId: string,
  seed: number,
  /** Sim-day spacing between league rounds (>1 leaves gaps for midweek cups). */
  stride = 1,
): Match[] {
  const rng = new Rng(seed);
  const clubIds = rng.shuffle([...competition.clubIds]);

  const base = singleRoundRobin(clubIds);
  const allRounds: Pairing[][] = [];

  for (let cycle = 0; cycle < competition.rounds; cycle++) {
    for (const round of base) {
      // Flip venues on odd cycles so each pair plays home & away.
      const flipped =
        cycle % 2 === 1
          ? round.map((p) => ({ home: p.away, away: p.home }))
          : round.map((p) => ({ ...p }));
      allRounds.push(flipped);
    }
  }

  const matches: Match[] = [];
  allRounds.forEach((round, dayIdx) => {
    for (const p of round) {
      matches.push({
        id: `m_${competition.id}_${seasonId}_${dayIdx}_${p.home}_${p.away}`,
        competitionId: competition.id,
        seasonId,
        round: dayIdx + 1,
        day: dayIdx * stride,
        homeClubId: p.home,
        awayClubId: p.away,
        played: false,
        homeGoals: 0,
        awayGoals: 0,
        homeXg: 0,
        awayXg: 0,
        events: [],
        playerStats: [],
        seed: rng.seedValue(),
      });
    }
  });

  return matches;
}

/** The last matchday index across a set of matches (number of days - 1). */
export function lastMatchday(matches: Match[]): number {
  return matches.reduce((mx, m) => Math.max(mx, m.day), 0);
}
