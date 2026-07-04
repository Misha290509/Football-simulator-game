// ---------------------------------------------------------------------------
// Standings computation with per-competition tiebreakers (§7B). Tiebreakers are
// data (Competition.tiebreakers); head-to-head is resolved as a mini-table
// among the tied group.
// ---------------------------------------------------------------------------

import type { Match } from '../types/match';
import type { Competition, Tiebreaker } from '../types/competition';
import type { StandingRow } from '../types/league';

function emptyRow(clubId: string): StandingRow {
  return {
    clubId,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
  };
}

/** Build raw standing rows from played league matches (ignores neutral ties). */
export function computeStandings(
  competition: Competition,
  matches: Match[],
): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  for (const id of competition.clubIds) rows.set(id, emptyRow(id));

  for (const m of matches) {
    if (!m.played || m.neutral) continue;
    if (m.competitionId !== competition.id) continue;
    const home = rows.get(m.homeClubId);
    const away = rows.get(m.awayClubId);
    if (!home || !away) continue;

    home.played++;
    away.played++;
    home.goalsFor += m.homeGoals;
    home.goalsAgainst += m.awayGoals;
    away.goalsFor += m.awayGoals;
    away.goalsAgainst += m.homeGoals;

    if (m.homeGoals > m.awayGoals) {
      home.won++; away.lost++; home.points += 3;
    } else if (m.homeGoals < m.awayGoals) {
      away.won++; home.lost++; away.points += 3;
    } else {
      home.drawn++; away.drawn++; home.points += 1; away.points += 1;
    }
  }

  return sortStandings([...rows.values()], competition.tiebreakers, matches, competition.id);
}

const gd = (r: StandingRow) => r.goalsFor - r.goalsAgainst;

function metric(r: StandingRow, t: Tiebreaker): number {
  switch (t) {
    case 'points': return r.points;
    case 'goalDifference': return gd(r);
    case 'goalsFor': return r.goalsFor;
    case 'wins': return r.won;
    case 'headToHead': return 0; // handled separately
  }
}

/** Head-to-head points among a tied subset of clubs. */
function headToHeadPoints(
  clubIds: Set<string>,
  matches: Match[],
  competitionId: string,
): Map<string, number> {
  const pts = new Map<string, number>();
  for (const id of clubIds) pts.set(id, 0);
  for (const m of matches) {
    if (!m.played || m.neutral || m.competitionId !== competitionId) continue;
    if (!clubIds.has(m.homeClubId) || !clubIds.has(m.awayClubId)) continue;
    if (m.homeGoals > m.awayGoals) pts.set(m.homeClubId, pts.get(m.homeClubId)! + 3);
    else if (m.homeGoals < m.awayGoals) pts.set(m.awayClubId, pts.get(m.awayClubId)! + 3);
    else {
      pts.set(m.homeClubId, pts.get(m.homeClubId)! + 1);
      pts.set(m.awayClubId, pts.get(m.awayClubId)! + 1);
    }
  }
  return pts;
}

export function sortStandings(
  rows: StandingRow[],
  tiebreakers: Tiebreaker[],
  matches: Match[],
  competitionId: string,
): StandingRow[] {
  return [...rows].sort((a, b) => {
    for (const t of tiebreakers) {
      if (t === 'headToHead') {
        const tied = new Set([a.clubId, b.clubId]);
        const h2h = headToHeadPoints(tied, matches, competitionId);
        const diff = (h2h.get(b.clubId) ?? 0) - (h2h.get(a.clubId) ?? 0);
        if (diff !== 0) return diff;
      } else {
        const diff = metric(b, t) - metric(a, t);
        if (diff !== 0) return diff;
      }
    }
    // Stable final fallback for full determinism.
    return a.clubId < b.clubId ? -1 : a.clubId > b.clubId ? 1 : 0;
  });
}
