// ---------------------------------------------------------------------------
// Player Career — stats & presentation (§ The record). Everything a player has
// actually done, gathered and made legible:
//
//   • A personal dashboard — the real numbers, per season and across a career.
//   • Leaderboards — where he ranks among named players for goals, assists and
//     ratings, so "top scorer" means something concrete.
//   • A highlight reel — the standout moments saved as he earns them.
//   • Head-to-head history — how he's done against every club he's faced.
//   • A career card — the shareable summary of who he was.
//
// Pure & read-only: derives everything from data already recorded.
// ---------------------------------------------------------------------------

import type { Player } from '../types/player';
import type { PlayerCareer } from '../types/playerCareer';

// --- Career totals ------------------------------------------------------------

export interface CareerTotals {
  apps: number; goals: number; assists: number; avgRating: number;
  seasons: number; honours: number; clubs: number;
  goalsPerApp: number; contributionsPerApp: number;
}

/** Everything he's done, across every season recorded. */
export function careerTotals(career: PlayerCareer): CareerTotals {
  const hist = career.seasonHistory ?? [];
  const apps = hist.reduce((n, s) => n + s.apps, 0) + (career.seasonApps ?? 0);
  const goals = hist.reduce((n, s) => n + s.goals, 0) + (career.seasonGoals ?? 0);
  const assists = hist.reduce((n, s) => n + (s.assists ?? 0), 0);
  const rated = hist.filter((s) => s.avgRating > 0);
  const avgRating = rated.length
    ? Math.round((rated.reduce((n, s) => n + s.avgRating * s.apps, 0) / Math.max(1, rated.reduce((n, s) => n + s.apps, 0))) * 100) / 100
    : (career.seasonAvgRating ?? 0);
  return {
    apps, goals, assists, avgRating,
    seasons: hist.length,
    honours: hist.reduce((n, s) => n + (s.honours?.length ?? 0), 0),
    clubs: new Set(hist.map((s) => s.club)).size || 1,
    goalsPerApp: apps ? Math.round((goals / apps) * 100) / 100 : 0,
    contributionsPerApp: apps ? Math.round(((goals + assists) / apps) * 100) / 100 : 0,
  };
}

/** A season-by-season series for charting the shape of a career. */
export interface SeasonPoint { season: string; club: string; apps: number; goals: number; assists: number; rating: number }
export function seasonSeries(career: PlayerCareer): SeasonPoint[] {
  return (career.seasonHistory ?? []).map((s) => ({
    season: s.season, club: s.club, apps: s.apps, goals: s.goals, assists: s.assists ?? 0, rating: s.avgRating,
  }));
}

/** His best and worst campaigns, for the dashboard's narrative line. */
export function bestSeason(career: PlayerCareer): SeasonPoint | null {
  const series = seasonSeries(career).filter((s) => s.apps >= 5);
  if (!series.length) return null;
  return series.reduce((best, s) => (s.goals + s.assists > best.goals + best.assists ? s : best));
}

// --- Leaderboards ---------------------------------------------------------------

export interface LeaderRow { playerId: string; name: string; club: string; value: number; isAvatar: boolean }

const nameOf = (p: Player) => `${p.name.first} ${p.name.last}`;

/**
 * Rank the league's players on a season stat, with the avatar marked. Reads the
 * per-season stat blocks already on every player, so the numbers are the real
 * ones the sim produced.
 */
export function leaderboard(
  players: Player[], clubs: Record<string, { name: string; shortName?: string }>,
  seasonId: string | undefined, metric: 'goals' | 'assists' | 'rating', avatarId: string, limit = 10,
): LeaderRow[] {
  const rows: LeaderRow[] = [];
  for (const p of players) {
    const stats = (p.stats ?? []).filter((s) => !seasonId || s.seasonId === seasonId);
    if (stats.length === 0) continue;
    const apps = stats.reduce((n, s) => n + (s.appearances ?? 0), 0);
    if (apps === 0) continue;
    let value: number;
    if (metric === 'goals') value = stats.reduce((n, s) => n + (s.goals ?? 0), 0);
    else if (metric === 'assists') value = stats.reduce((n, s) => n + (s.assists ?? 0), 0);
    else {
      const sum = stats.reduce((n, s) => n + (s.ratingSum ?? 0), 0);
      const count = stats.reduce((n, s) => n + (s.ratingCount ?? 0), 0);
      if (count < 5) continue; // a handful of games isn't a rating
      value = Math.round((sum / count) * 100) / 100;
    }
    if (value <= 0) continue;
    rows.push({
      playerId: p.id, name: nameOf(p),
      club: clubs[p.contract.clubId ?? '']?.shortName ?? clubs[p.contract.clubId ?? '']?.name ?? '',
      value, isAvatar: p.id === avatarId,
    });
  }
  rows.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  const top = rows.slice(0, limit);
  // Always include the avatar, even when he's outside the top ten.
  if (!top.some((r) => r.isAvatar)) {
    const me = rows.find((r) => r.isAvatar);
    if (me) top.push(me);
  }
  return top;
}

/** Where the avatar sits in a ranking (1-based), or 0 if unranked. */
export function avatarRank(rows: LeaderRow[], avatarId: string): number {
  const i = rows.findIndex((r) => r.playerId === avatarId);
  return i < 0 ? 0 : i + 1;
}

// --- Highlight reel ---------------------------------------------------------------

export interface Highlight { day: number; text: string; kind: 'GOAL' | 'AWARD' | 'MILESTONE' | 'DUEL' }

/** The moments worth keeping, newest first. Built from what actually happened. */
export function highlightReel(career: PlayerCareer, limit = 12): Highlight[] {
  const out: Highlight[] = [];
  for (const m of career.milestones ?? []) {
    const kind: Highlight['kind'] = /legend|record|cap|goal/i.test(m.text) ? 'MILESTONE' : 'MILESTONE';
    out.push({ day: m.day, text: m.text, kind });
  }
  return out.sort((a, b) => b.day - a.day).slice(0, limit);
}

// --- Head-to-head ------------------------------------------------------------------

export interface H2HRow { club: string; games: number; goals: number; avgRating: number }

/** How he's fared against each opponent, from his own match history. */
export function headToHead(career: PlayerCareer): H2HRow[] {
  const map = new Map<string, { games: number; goals: number; ratingSum: number }>();
  for (const r of career.opponentLog ?? []) {
    const cur = map.get(r.club) ?? { games: 0, goals: 0, ratingSum: 0 };
    cur.games += 1; cur.goals += r.goals; cur.ratingSum += r.rating;
    map.set(r.club, cur);
  }
  return [...map.entries()]
    .map(([club, v]) => ({ club, games: v.games, goals: v.goals, avgRating: Math.round((v.ratingSum / v.games) * 100) / 100 }))
    .sort((a, b) => b.games - a.games);
}

// --- The career card ------------------------------------------------------------------

export interface CareerCard {
  name: string; position: string; club: string; age: number;
  overall: number; totals: CareerTotals;
  identity: string[]; honours: string[]; verdict: string;
}

/** A shareable summary of who he was. Pure presentation over real numbers. */
export function buildCareerCard(
  career: PlayerCareer, avatar: Player, clubName: string, year: number,
): CareerCard {
  const totals = careerTotals(career);
  const identity: string[] = [];
  if (career.identity?.hometown) identity.push(`${career.identity.hometown} born`);
  if (career.identity?.boyhoodClub) identity.push(`${career.identity.boyhoodClub} fan`);
  if (career.identity?.homecoming) identity.push('came home');
  if (career.identity?.betrayal) identity.push('crossed the divide');
  if (career.hasChant) identity.push('had his own song');
  if ((career.badges ?? []).length) identity.push(`${career.badges!.length} coaching badge${career.badges!.length === 1 ? '' : 's'}`);
  if (career.international?.capped) identity.push(`${career.international.caps} caps`);

  const honours = [...new Set((career.seasonHistory ?? []).flatMap((s) => s.honours ?? []))];

  const verdict =
    totals.goals >= 200 || totals.honours >= 10 ? 'One of the greats.'
    : totals.apps >= 400 ? 'A career of remarkable longevity.'
    : totals.contributionsPerApp >= 0.7 ? 'A match-winner, week after week.'
    : totals.honours >= 3 ? 'A winner, wherever he went.'
    : totals.apps >= 150 ? 'A proper professional.'
    : 'The story is still being written.';

  return {
    name: `${avatar.name.first} ${avatar.name.last}`,
    position: avatar.position,
    club: clubName,
    age: year - avatar.born.year,
    overall: avatar.overall,
    totals, identity, honours, verdict,
  };
}
