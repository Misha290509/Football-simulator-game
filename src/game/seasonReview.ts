// ---------------------------------------------------------------------------
// Season review (§ QoL). Pure: summarizes the manager's league season from the
// played matches — record, goals, biggest win, top scorer and best performer.
// ---------------------------------------------------------------------------

import type { Match } from '../types/match';
import type { Player } from '../types/player';

export interface SeasonSummary {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  biggestWin?: { margin: number; opponentId: string; score: string };
  topScorerId?: string;
  topScorerGoals: number;
  bestRatedId?: string;
  bestRating: number;
}

/**
 * Summarize the manager's season from their played league matches. Goals + form
 * are aggregated from the per-match player stats of the manager's squad.
 */
export function computeSeasonSummary(
  managerClubId: string,
  leagueMatches: Match[],
  players: Record<string, Player>,
): SeasonSummary {
  const sum: SeasonSummary = { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, topScorerGoals: 0, bestRating: 0 };
  const goals: Record<string, number> = {};
  const ratings: Record<string, { total: number; apps: number }> = {};

  for (const m of leagueMatches) {
    const isHome = m.homeClubId === managerClubId;
    const isAway = m.awayClubId === managerClubId;
    if ((!isHome && !isAway) || !m.played) continue;
    const gf = isHome ? m.homeGoals : m.awayGoals;
    const ga = isHome ? m.awayGoals : m.homeGoals;
    sum.played++; sum.goalsFor += gf; sum.goalsAgainst += ga;
    if (gf > ga) sum.won++; else if (gf < ga) sum.lost++; else sum.drawn++;
    const margin = gf - ga;
    if (margin > 0 && (!sum.biggestWin || margin > sum.biggestWin.margin)) {
      sum.biggestWin = { margin, opponentId: isHome ? m.awayClubId : m.homeClubId, score: `${gf}-${ga}` };
    }
    for (const st of m.playerStats) {
      if (players[st.playerId]?.contract.clubId !== managerClubId) continue;
      goals[st.playerId] = (goals[st.playerId] ?? 0) + st.goals;
      const r = (ratings[st.playerId] ??= { total: 0, apps: 0 });
      if (st.minutes > 0) { r.total += st.rating; r.apps++; }
    }
  }

  for (const [id, g] of Object.entries(goals)) {
    if (g > sum.topScorerGoals) { sum.topScorerGoals = g; sum.topScorerId = id; }
  }
  for (const [id, r] of Object.entries(ratings)) {
    if (r.apps >= 5) {
      const avg = r.total / r.apps;
      if (avg > sum.bestRating) { sum.bestRating = avg; sum.bestRatedId = id; }
    }
  }
  return sum;
}
