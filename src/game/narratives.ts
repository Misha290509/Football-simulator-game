// ---------------------------------------------------------------------------
// Dynamic season narratives (§ Narratives). Auto-generated inbox stories from
// the manager's results — winning runs, poor runs, unbeaten streaks and the
// season's biggest win. Pure; called after the manager's matches.
// ---------------------------------------------------------------------------

import type { Match } from '../types/match';
import type { NewsItem } from '../types/league';

let _seq = 0;
const mk = (day: number, title: string, body: string): NewsItem => ({
  id: `news_story_${day}_${_seq++}`, day, category: 'MILESTONE', title, body, read: false,
});

/** Result of a match from the manager club's perspective. */
function result(m: Match, clubId: string): 'W' | 'D' | 'L' {
  const home = m.homeClubId === clubId;
  const gf = home ? m.homeGoals : m.awayGoals;
  const ga = home ? m.awayGoals : m.homeGoals;
  return gf > ga ? 'W' : gf < ga ? 'L' : 'D';
}
function margin(m: Match, clubId: string): number {
  const home = m.homeClubId === clubId;
  return (home ? m.homeGoals : m.awayGoals) - (home ? m.awayGoals : m.homeGoals);
}

/**
 * Generate narrative news from the manager's played matches this season. `latest`
 * is the most-recent match; `oppName` its opponent. Thresholds fire once as a
 * streak passes through them.
 */
export function generateNarratives(
  managerClubId: string,
  managerPlayed: Match[],
  latest: Match,
  oppName: string,
  day: number,
): NewsItem[] {
  const news: NewsItem[] = [];
  const sorted = [...managerPlayed].sort((a, b) => a.day - b.day);

  let wins = 0, unbeaten = 0, losses = 0;
  for (let i = sorted.length - 1; i >= 0; i--) { if (result(sorted[i], managerClubId) === 'W') wins++; else break; }
  for (let i = sorted.length - 1; i >= 0; i--) { if (result(sorted[i], managerClubId) !== 'L') unbeaten++; else break; }
  for (let i = sorted.length - 1; i >= 0; i--) { if (result(sorted[i], managerClubId) === 'L') losses++; else break; }

  if ([3, 5, 7, 10, 15].includes(wins)) {
    news.push(mk(day, `${wins} wins on the bounce`, `The club is flying — ${wins} straight victories and belief is surging.`));
  } else if ([6, 9, 12, 18].includes(unbeaten) && wins < 3) {
    news.push(mk(day, `${unbeaten} games unbeaten`, `A ${unbeaten}-match unbeaten run has the club purring.`));
  }
  if ([3, 5, 8].includes(losses)) {
    news.push(mk(day, `${losses} straight defeats`, `A run of ${losses} losses has the pressure building on the manager.`));
  }

  const m = margin(latest, managerClubId);
  if (m >= 4 && m === Math.max(...sorted.map((x) => margin(x, managerClubId)))) {
    news.push(mk(day, `Emphatic win over ${oppName}`, `A ${m}-goal demolition — the season's biggest win so far.`));
  }
  return news;
}
