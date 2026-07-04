// ---------------------------------------------------------------------------
// Continental install (§ Continental). Given the world at the start of a season,
// qualifies clubs and creates the season's continental competitions with their
// opening-phase fixtures already placed on the calendar:
//   • UEFA Champions/Europa/Conference League every season (Swiss league phase).
//   • FIFA Club World Cup every four years (seasonYear % 4 === 1 → 2025, 2029…).
// ---------------------------------------------------------------------------

import type { Club } from '../../types/club';
import type { Match } from '../../types/match';
import type { Competition } from '../../types/competition';
import type { StandingRow } from '../../types/league';
import type { ContinentalState } from '../../types/continental';
import { buildEuropeanQualification } from './qualification';
import { createContinental } from './competition';

export interface ContinentalInstall {
  states: Record<string, ContinentalState>;
  matches: Match[];
}

/** Club id → its confederation (from the tier-1 competition it plays in). */
function confederationByClub(competitions: Record<string, Competition>): Record<string, string> {
  const map: Record<string, string> = {};
  for (const comp of Object.values(competitions)) {
    if (comp.tier !== 1) continue;
    for (const id of comp.clubIds) map[id] = comp.confederation;
  }
  return map;
}

/** Is this a Club World Cup year? Held every four years (2025, 2029, 2033…). */
export function isClubWorldCupYear(seasonYear: number): boolean {
  return seasonYear % 4 === 1;
}

/** Build the 32-team Club World Cup field: reigning champions first, then by
 * reputation with per-confederation caps for a realistic global spread. */
function clubWorldCupField(
  competitions: Record<string, Competition>,
  clubs: Record<string, Club>,
  champions: Record<string, { clubId: string; year: number }> | undefined,
): string[] {
  const conf = confederationByClub(competitions);
  const caps: Record<string, number> = { UEFA: 14, CONMEBOL: 6, CONCACAF: 6, AFC: 8, CAF: 6 };
  const picked: string[] = [];
  const used = new Set<string>();
  const perConf: Record<string, number> = {};
  const take = (id: string) => {
    if (!id || used.has(id) || !clubs[id]) return;
    const c = conf[id] ?? 'UEFA';
    if ((perConf[c] ?? 0) >= (caps[c] ?? 4)) return;
    picked.push(id); used.add(id); perConf[c] = (perConf[c] ?? 0) + 1;
  };
  // Reigning continental champions get in first.
  for (const ch of Object.values(champions ?? {})) take(ch.clubId);
  // Then the strongest clubs by reputation, respecting caps.
  const ranked = Object.values(clubs).sort((a, b) => b.reputation - a.reputation);
  for (const c of ranked) { if (picked.length >= 32) break; take(c.id); }
  // If caps starved it, relax to guarantee 32.
  if (picked.length < 32) {
    for (const c of ranked) { if (picked.length >= 32) break; if (!used.has(c.id)) { picked.push(c.id); used.add(c.id); } }
  }
  return picked.slice(0, 32);
}

export function installContinental(args: {
  competitions: Record<string, Competition>;
  clubs: Record<string, Club>;
  seasonId: string;
  seasonYear: number;
  maxLeagueDay: number;
  seed: number;
  finalStandings?: Record<string, StandingRow[]>;
  continentalChampions?: Record<string, { clubId: string; year: number }>;
  countryCoefficients?: Record<string, number>;
}): ContinentalInstall {
  const { competitions, clubs, seasonId, seasonYear, maxLeagueDay, seed } = args;
  const states: Record<string, ContinentalState> = {};
  const matches: Match[] = [];

  const q = buildEuropeanQualification(competitions, clubs, args.finalStandings, args.countryCoefficients);
  const uefa: { id: 'UEFA_CL' | 'UEFA_EL' | 'UEFA_CONF'; name: string; field: string[]; games: number }[] = [
    { id: 'UEFA_CL', name: 'Champions League', field: q.championsLeague, games: 8 },
    { id: 'UEFA_EL', name: 'Europa League', field: q.europaLeague, games: 8 },
    { id: 'UEFA_CONF', name: 'Conference League', field: q.conferenceLeague, games: 6 },
  ];
  for (const c of uefa) {
    if (c.field.length < c.games + 1) continue; // not enough clubs
    const setup = createContinental({
      id: c.id, name: c.name, format: 'swiss', clubIds: c.field,
      seasonId, year: seasonYear, leaguePhaseGames: c.games,
      clubs, seed: seed ^ hash(c.id), maxLeagueDay,
    });
    states[c.id] = setup.state;
    matches.push(...setup.matches);
  }

  if (isClubWorldCupYear(seasonYear)) {
    const field = clubWorldCupField(competitions, clubs, args.continentalChampions);
    if (field.length >= 32) {
      const setup = createContinental({
        id: 'FIFA_CWC', name: 'Club World Cup', format: 'groups', clubIds: field,
        seasonId, year: seasonYear, leaguePhaseGames: 0, nGroups: 8,
        clubs, seed: seed ^ hash('FIFA_CWC'), maxLeagueDay,
      });
      states['FIFA_CWC'] = setup.state;
      matches.push(...setup.matches);
    }
  }

  return { states, matches };
}

function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
