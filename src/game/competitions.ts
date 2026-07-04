// ---------------------------------------------------------------------------
// Domestic cups, confederation-correct continental competitions, the MLS
// conference playoff, and season awards (§8, §11-M6). Resolved at season end as
// seeded knockouts via the match engine; winners feed news, honours & history.
// ---------------------------------------------------------------------------

import type { Club } from '../types/club';
import type { Player } from '../types/player';
import type { Match } from '../types/match';
import type { Competition, Confederation } from '../types/competition';
import type { Award, NewsItem, StandingRow } from '../types/league';
import { Rng } from '../engine/rng';
import { simulateMatches } from '../engine/simClient';

const CONTINENTAL_NAME: Record<Confederation, string> = {
  UEFA: 'Champions League',
  CONMEBOL: 'Copa Libertadores',
  CONCACAF: 'Champions Cup',
  AFC: 'Asian Champions League',
};

let _seq = 0;
const mk = (year: number, category: NewsItem['category'], title: string, body: string): NewsItem => ({
  id: `news_c_${year}_${_seq++}`, day: 0, category, title, body, read: false,
});

/** Decide a level knockout tie on penalties. Slight edge to the stronger club. */
function penaltyShootout(
  homeId: string,
  awayId: string,
  clubs: Record<string, Club>,
  rng: Rng,
): { winner: string; homeScore: number; awayScore: number } {
  const hr = clubs[homeId]?.reputation ?? 50;
  const ar = clubs[awayId]?.reputation ?? 50;
  const pHome = 0.75 + (hr - ar) / 500; // ~0.55–0.95
  const pAway = 0.75 + (ar - hr) / 500;
  let hs = 0, as = 0;
  for (let i = 0; i < 5; i++) { if (rng.chance(pHome)) hs++; if (rng.chance(pAway)) as++; }
  let guard = 0;
  while (hs === as && guard++ < 20) { // sudden death
    const h = rng.chance(pHome), a = rng.chance(pAway);
    if (h) hs++; if (a) as++;
  }
  if (hs === as) hs++; // guarantee a winner
  return { winner: hs > as ? homeId : awayId, homeScore: hs, awayScore: as };
}

/** Single-leg seeded knockout; higher seed (earlier in list) hosts. Level ties → penalties. */
async function knockout(
  seeds: string[],
  label: string,
  clubs: Record<string, Club>,
  players: Record<string, Player>,
  rng: Rng,
  kind: 'continental' | 'cup' = 'cup',
): Promise<{ winner: string; matches: Match[] }> {
  let round = seeds.slice();
  // Trim to a power of two by byes for the top seeds.
  const matches: Match[] = [];
  let roundNo = 0;
  while (round.length > 1) {
    const next: string[] = [];
    const half = Math.floor(round.length / 2);
    const ties: Match[] = [];
    for (let i = 0; i < half; i++) {
      const home = round[i];
      const away = round[round.length - 1 - i];
      ties.push({
        id: `m_${label}_${roundNo}_${i}_${home}_${away}`,
        competitionId: label, seasonId: label, round: 8000 + roundNo, day: 8000 + roundNo,
        homeClubId: home, awayClubId: away, played: false,
        homeGoals: 0, awayGoals: 0, homeXg: 0, awayXg: 0,
        events: [], playerStats: [], seed: rng.seedValue(), neutral: true,
      });
    }
    const ctx = Object.fromEntries(ties.map((t) => [t.id, { kind }]));
    const played = await simulateMatches(ties, clubs, players, ctx);
    for (let i = 0; i < played.length; i++) {
      const m = played[i];
      // Level ties are settled on penalties (§ set-pieces / shootouts).
      if (m.homeGoals === m.awayGoals) {
        const s = penaltyShootout(m.homeClubId, m.awayClubId, clubs, rng);
        m.events = [...m.events, {
          minute: 120, type: 'PENALTY', side: s.winner === m.homeClubId ? 'home' : 'away',
          description: `Penalty shootout: ${clubs[m.homeClubId]?.shortName ?? 'Home'} ${s.homeScore}–${s.awayScore} ${clubs[m.awayClubId]?.shortName ?? 'Away'}`,
        }];
        matches.push(m);
        next.push(s.winner);
      } else {
        matches.push(m);
        next.push(m.homeGoals > m.awayGoals ? m.homeClubId : m.awayClubId);
      }
    }
    if (round.length % 2 === 1) next.push(round[half]); // odd one out gets a bye
    round = next;
    roundNo++;
  }
  return { winner: round[0], matches };
}

export interface CompetitionsResult {
  news: NewsItem[];
  awards: Award[];
  matches: Match[];
}

export async function resolveSeasonCompetitions(
  competitions: Record<string, Competition>,
  clubs: Record<string, Club>,
  players: Record<string, Player>,
  finalStandings: Record<string, StandingRow[]>,
  seasonId: string,
  year: number,
  seed: number,
): Promise<CompetitionsResult> {
  const rng = new Rng(seed ^ 0xc0ffee);
  const news: NewsItem[] = [];
  const awards: Award[] = [];
  const allMatches: Match[] = [];

  // Domestic cups are now calendar-integrated (see game/cups/domesticCups.ts),
  // played through the season rather than resolved instantly here.

  // --- MLS conference playoff (no pro/rel; crown a champion) --------------
  for (const comp of Object.values(competitions)) {
    if (comp.format !== 'conference_playoff' || !comp.conferences) continue;
    const rows = finalStandings[comp.id] ?? [];
    const qualifiers: string[] = [];
    comp.conferences.names.forEach((_, ci) => {
      const inConf = rows.filter((_r, idx) => idx % comp.conferences!.names.length === ci);
      qualifiers.push(...inConf.slice(0, comp.conferences!.playoffQualifiersPerConference).map((r) => r.clubId));
    });
    if (qualifiers.length >= 2) {
      const { winner, matches } = await knockout(qualifiers, `mlscup_${comp.id}_${seasonId}`, clubs, players, rng);
      allMatches.push(...matches);
      awards.push({ type: 'LEAGUE_CHAMPION', label: `${comp.name} Cup`, seasonId, competitionId: comp.id, clubId: winner });
      news.push(mk(year, 'AWARD', `${clubs[winner]?.name} win the ${comp.name} Cup`,
        `${clubs[winner]?.name} are crowned champions through the playoffs.`));
    }
  }

  // --- Continental competitions per confederation ------------------------
  // UEFA is handled by the calendar-integrated Champions/Europa/Conference
  // League system, so only the other confederations resolve here.
  const byConfed: Record<string, string[]> = {};
  for (const comp of Object.values(competitions)) {
    if (comp.tier !== 1 || comp.confederation === 'UEFA') continue;
    const rows = finalStandings[comp.id] ?? [];
    // Top 4 (or top 6 for big single tables) qualify for their confederation.
    const slots = comp.numClubs >= 24 ? 6 : 4;
    const qualifiers = rows.slice(0, slots).map((r) => r.clubId);
    (byConfed[comp.confederation] ??= []).push(...qualifiers);
  }
  for (const [confed, clubIds] of Object.entries(byConfed)) {
    if (clubIds.length < 2) continue;
    const seeds = [...clubIds].sort((a, b) => (clubs[b]?.reputation ?? 0) - (clubs[a]?.reputation ?? 0)).slice(0, 32);
    const name = CONTINENTAL_NAME[confed as Confederation];
    const { winner, matches } = await knockout(seeds, `cont_${confed}_${seasonId}`, clubs, players, rng, 'continental');
    allMatches.push(...matches);
    awards.push({ type: 'CONTINENTAL', label: name, seasonId, clubId: winner });
    news.push(mk(year, 'AWARD', `${clubs[winner]?.name} win the ${name}`,
      `${clubs[winner]?.name} are champions of ${confed}.`));
  }

  return { news, awards, matches: allMatches };
}
