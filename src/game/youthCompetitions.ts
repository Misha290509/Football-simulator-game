// ---------------------------------------------------------------------------
// Youth competitions (§ Academy, Idea 11). A youth league + youth cup per
// country and a continental youth tournament for clubs whose senior team
// qualified for continental football. Results are produced from youth-team
// strength with seeded variance (deterministic and cheap at world scale),
// award trophies into each academy's cabinet, feed the age-group performance
// score, and surface champions in the news. Run once per season at rollover.
// ---------------------------------------------------------------------------

import type { Club } from '../types/club';
import type { Player } from '../types/player';
import type { Competition, Confederation } from '../types/competition';
import type { StandingRow } from '../types/league';
import type { NewsItem } from '../types/league';
import type { Academy, YouthCompetition } from '../types/academy';
import { Rng, clamp } from '../engine/rng';

const CONTINENTAL_YOUTH_NAME: Record<Confederation, string> = {
  UEFA: 'UEFA Youth League',
  CONMEBOL: 'CONMEBOL Youth Cup',
  CONCACAF: 'CONCACAF Youth Championship',
  AFC: 'AFC Youth League',
};

/** Youth-team strength: the average of a club's best 11 academy prospects. */
function youthStrength(squad: Player[] | undefined): number {
  if (!squad || squad.length === 0) return 38;
  const top = [...squad].sort((a, b) => b.overall - a.overall).slice(0, 11);
  return top.reduce((s, p) => s + p.overall, 0) / top.length;
}

/** A single strength-based youth tie; higher (strength + noise) advances. */
function tie(a: string, b: string, strength: Record<string, number>, rng: Rng): string {
  const sa = (strength[a] ?? 38) + rng.normal(0, 6);
  const sb = (strength[b] ?? 38) + rng.normal(0, 6);
  return sa >= sb ? a : b;
}

/** Seeded single-elimination among the given clubs → { champion, runnerUp }. */
function knockout(seeds: string[], strength: Record<string, number>, rng: Rng): { champion: string; runnerUp?: string } {
  let round = seeds.slice();
  let runnerUp: string | undefined;
  while (round.length > 1) {
    const next: string[] = [];
    const half = Math.floor(round.length / 2);
    const losers: string[] = [];
    for (let i = 0; i < half; i++) {
      const home = round[i];
      const away = round[round.length - 1 - i];
      const w = tie(home, away, strength, rng);
      next.push(w);
      losers.push(w === home ? away : home);
    }
    if (round.length % 2 === 1) next.push(round[half]);
    if (next.length === 1) runnerUp = losers[losers.length - 1];
    round = next;
  }
  return { champion: round[0], runnerUp };
}

export interface YouthCompetitionsResult {
  academies: Record<string, Academy>;
  news: NewsItem[];
  /** clubId → age-group performance boost from youth-competition success. */
  perfBoostByClub: Record<string, number>;
  youthCompetitions: Record<string, YouthCompetition>;
}

let _ycSeq = 0;
const mk = (year: number, title: string, body: string): NewsItem => ({
  id: `news_yc_${year}_${_ycSeq++}`, day: 0, category: 'AWARD', title, body, read: false,
});

export function runYouthCompetitions(
  academiesIn: Record<string, Academy>,
  squadsByClub: Record<string, Player[]>,
  clubs: Record<string, Club>,
  competitions: Record<string, Competition>,
  finalStandings: Record<string, StandingRow[]>,
  seasonId: string,
  year: number,
  rng: Rng,
  managerClubId: string,
): YouthCompetitionsResult {
  // Clone so we never mutate the caller's academies (determinism + no live-meta
  // mutation during rollover).
  const academies: Record<string, Academy> = structuredClone(academiesIn);
  const news: NewsItem[] = [];
  const perfBoostByClub: Record<string, number> = {};
  const youthCompetitions: Record<string, YouthCompetition> = {};
  const strength: Record<string, number> = {};
  for (const id of Object.keys(clubs)) strength[id] = youthStrength(squadsByClub[id]);

  const addTrophy = (clubId: string, competitionId: string, competitionName: string, repGain = 3) => {
    const ac = academies[clubId];
    if (ac) {
      ac.trophies = [...ac.trophies, { competitionId, competitionName, year }];
      ac.reputation = clamp(ac.reputation + repGain, 0, 100) as number;
    }
  };
  const boost = (clubId: string, amount: number) => {
    perfBoostByClub[clubId] = (perfBoostByClub[clubId] ?? 0) + amount;
  };
  const champNews = (clubId: string, label: string) => {
    if (clubId === managerClubId) news.push(mk(year, `Your academy win the ${label}`, `The young guns are champions of the ${label}.`));
    else if (clubs[clubId]) news.push(mk(year, `${clubs[clubId].shortName} win the ${label}`, `${clubs[clubId].name}'s academy lift the ${label}.`));
  };

  // Tier-1 clubs grouped by country (these contest the youth competitions).
  const tier1ByCountry: Record<string, string[]> = {};
  const confedOfCountry: Record<string, Confederation> = {};
  for (const comp of Object.values(competitions)) {
    if (comp.tier !== 1) continue;
    (tier1ByCountry[comp.countryId] ??= []).push(...comp.clubIds);
    confedOfCountry[comp.countryId] = comp.confederation;
  }

  // --- Youth league + youth cup per country ------------------------------
  for (const [countryId, clubIds] of Object.entries(tier1ByCountry)) {
    if (clubIds.length < 4) continue;
    const ranked = [...clubIds].sort((a, b) => (strength[b] + rng.normal(0, 5)) - (strength[a] + rng.normal(0, 5)));

    // League: champion = strongest over the long season.
    const leagueChamp = ranked[0];
    const leagueId = `yl_${countryId}_${seasonId}`;
    const leagueName = `${countryId} Youth League`;
    addTrophy(leagueChamp, leagueId, leagueName);
    boost(leagueChamp, 10);
    boost(ranked[1], 5); boost(ranked[2], 3); boost(ranked[3], 2);
    champNews(leagueChamp, leagueName);
    youthCompetitions[leagueId] = { id: leagueId, name: leagueName, type: 'youth_league', countryId, format: 'round_robin', clubIds, year, championClubId: leagueChamp, runnerUpClubId: ranked[1] };

    // Cup: seeded knockout (more variance than the league).
    const cup = knockout(ranked, strength, rng);
    const cupId = `yc_${countryId}_${seasonId}`;
    const cupName = `${countryId} Youth Cup`;
    addTrophy(cup.champion, cupId, cupName);
    boost(cup.champion, 6);
    if (cup.runnerUp) boost(cup.runnerUp, 3);
    champNews(cup.champion, cupName);
    youthCompetitions[cupId] = { id: cupId, name: cupName, type: 'youth_cup', countryId, format: 'knockout', clubIds, year, championClubId: cup.champion, runnerUpClubId: cup.runnerUp };
  }

  // --- Continental youth (clubs whose senior team qualified) -------------
  const byConfed: Record<string, string[]> = {};
  for (const comp of Object.values(competitions)) {
    if (comp.tier !== 1) continue;
    const rows = finalStandings[comp.id] ?? [];
    const slots = comp.numClubs >= 24 ? 6 : 4;
    const qualifiers = rows.slice(0, slots).map((r) => r.clubId);
    (byConfed[comp.confederation] ??= []).push(...qualifiers);
  }
  for (const [confed, clubIds] of Object.entries(byConfed)) {
    if (clubIds.length < 2) continue;
    const seeds = [...clubIds].sort((a, b) => strength[b] - strength[a]).slice(0, 32);
    const { champion, runnerUp } = knockout(seeds, strength, rng);
    const name = CONTINENTAL_YOUTH_NAME[confed as Confederation] ?? `${confed} Youth League`;
    const id = `ycont_${confed}_${seasonId}`;
    addTrophy(champion, id, name, 6);
    boost(champion, 12);
    if (runnerUp) boost(runnerUp, 6);
    champNews(champion, name);
    youthCompetitions[id] = { id, name, type: 'continental_youth', countryId: '', format: 'knockout', clubIds: seeds, year, championClubId: champion, runnerUpClubId: runnerUp };
  }

  return { academies, news, perfBoostByClub, youthCompetitions };
}
