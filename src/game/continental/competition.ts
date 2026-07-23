// ---------------------------------------------------------------------------
// Continental competition orchestration (§ Continental). Creates a competition's
// on-calendar fixtures, computes the Swiss league-phase / group tables, and — as
// each phase finishes — draws the next knockout round (resolving level ties on
// penalties). The season loop calls `advanceContinental` after playing matches
// so brackets fill in mid-season.
// ---------------------------------------------------------------------------

import type { Match } from '../../types/match';
import type { Club } from '../../types/club';
import type { Player } from '../../types/player';
import type { StandingRow } from '../../types/league';
import type { ContinentalState, ContinentalId } from '../../types/continental';
import { Rng } from '../../engine/rng';
import { resolveKnockoutTie } from '../knockout';
import { buildSwissLeaguePhase, buildGroupStage, buildKnockoutRound } from './schedule';
import { CALENDAR_STRIDE, DAY_CLASS, slotsInClass, nextDayInClass } from '../calendar';

/** League round `r` (0-based) sits on day `r * LEAGUE_STRIDE` (calendar class 0). */
export const LEAGUE_STRIDE = CALENDAR_STRIDE;

/** Distinct continental (class-1) day slots in (lo, hi], ascending. */
const oddSlots = (lo: number, hi: number, count: number): number[] =>
  slotsInClass(lo, hi, count, DAY_CLASS.CONTINENTAL);

export interface ContinentalSetup { state: ContinentalState; matches: Match[] }

/**
 * Create a continental competition and schedule its opening phase onto the
 * calendar. UEFA competitions (Swiss) run their league phase across the first
 * ~62% of the season; the Club World Cup (groups) runs after the league season
 * as a summer tournament.
 */
export function createContinental(p: {
  id: ContinentalId;
  name: string;
  format: 'swiss' | 'groups';
  clubIds: string[];
  seasonId: string;
  year: number;
  leaguePhaseGames: number; // swiss
  nGroups?: number; // groups
  clubs: Record<string, Club>;
  seed: number;
  maxLeagueDay: number;
}): ContinentalSetup {
  const matches: Match[] = [];
  if (p.format === 'swiss') {
    const { matchdays } = buildSwissLeaguePhase(p.id, p.seasonId, p.clubIds, p.leaguePhaseGames, p.seed);
    // League phase across the first half; reserve knockout days spread through
    // the back half so the bracket unfolds as the season climaxes.
    const days = oddSlots(1, Math.floor(p.maxLeagueDay * 0.5), matchdays.length);
    matchdays.forEach((md, i) => { for (const m of md) { m.day = days[i]; matches.push(m); } });
    const koDays = oddSlots(Math.floor(p.maxLeagueDay * 0.55), Math.floor(p.maxLeagueDay * 1.02), 8);
    return {
      state: {
        id: p.id, name: p.name, seasonId: p.seasonId, year: p.year, format: 'swiss',
        clubIds: p.clubIds, leaguePhaseGames: p.leaguePhaseGames, stage: 'LEAGUE', prizePaid: {}, koDays,
      },
      matches,
    };
  }
  // Groups (Club World Cup): a compact post-season tournament on odd days.
  const { groups, matchdays } = buildGroupStage(p.id, p.seasonId, p.clubIds, p.nGroups ?? 8, p.clubs, p.seed);
  const days = oddSlots(p.maxLeagueDay + 1, p.maxLeagueDay + 9, matchdays.length);
  matchdays.forEach((md, i) => { for (const m of md) { m.day = days[i]; matches.push(m); } });
  const koDays = oddSlots(p.maxLeagueDay + 10, p.maxLeagueDay + 26, 6);
  return {
    state: {
      id: p.id, name: p.name, seasonId: p.seasonId, year: p.year, format: 'groups',
      clubIds: p.clubIds, leaguePhaseGames: 0, groups, stage: 'GROUPS', prizePaid: {}, koDays,
    },
    matches,
  };
}

/** The next reserved knockout day after `currentDay`, or the next continental day. */
function nextKoDay(state: ContinentalState, currentDay: number): number {
  const reserved = (state.koDays ?? []).find((d) => d > currentDay);
  if (reserved !== undefined) return reserved;
  return nextDayInClass(currentDay, DAY_CLASS.CONTINENTAL);
}

/**
 * The earliest day the season loop must pause at to draw a continental round:
 * the day after the last fixture of each competition's current, unfinished
 * phase. Returns Infinity when nothing is pending.
 */
export function nextContinentalStop(
  continental: Record<string, ContinentalState>,
  allMatches: Match[],
  currentDay: number,
): number {
  let stop = Infinity;
  for (const st of Object.values(continental)) {
    if (st.stage === 'DONE') continue;
    const mine = allMatches.filter((m) => m.competitionId === st.id);
    const phase = st.stage === 'GROUPS' ? mine.filter((m) => m.stageLabel?.startsWith('Group '))
      : st.stage === 'LEAGUE' ? mine.filter((m) => m.stageLabel === 'League Phase')
        : st.stage === 'KO_PLAYOFF' ? mine.filter((m) => m.stageLabel === 'Knockout Play-off')
          : mine.filter((m) => m.stageLabel === st.roundLabel);
    if (phase.length === 0) continue;
    if (phase.every((m) => m.played)) { stop = Math.min(stop, currentDay); continue; }
    const lastDay = Math.max(...phase.map((m) => m.day));
    if (lastDay + 1 > currentDay) stop = Math.min(stop, lastDay + 1);
  }
  return stop;
}

// --- Tables ----------------------------------------------------------------

function emptyRow(clubId: string): StandingRow {
  return { clubId, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 };
}
function feed(row: StandingRow, gf: number, ga: number) {
  row.played++; row.goalsFor += gf; row.goalsAgainst += ga;
  if (gf > ga) { row.won++; row.points += 3; } else if (gf === ga) { row.drawn++; row.points += 1; } else row.lost++;
}
const byTable = (a: StandingRow, b: StandingRow) =>
  b.points - a.points || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst) || b.goalsFor - a.goalsFor;

/** The combined Swiss league-phase table (only 'League Phase' matches count). */
export function leaguePhaseTable(state: ContinentalState, matches: Match[]): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  for (const id of state.clubIds) rows.set(id, emptyRow(id));
  for (const m of matches) {
    if (m.competitionId !== state.id || m.stageLabel !== 'League Phase' || !m.played) continue;
    feed(rows.get(m.homeClubId)!, m.homeGoals, m.awayGoals);
    feed(rows.get(m.awayClubId)!, m.awayGoals, m.homeGoals);
  }
  return [...rows.values()].sort(byTable);
}

/** Per-group tables (Club World Cup). */
export function groupTables(state: ContinentalState, matches: Match[]): StandingRow[][] {
  if (!state.groups) return [];
  return state.groups.map((grp, gi) => {
    const label = `Group ${String.fromCharCode(65 + gi)}`;
    const rows = new Map(grp.map((id) => [id, emptyRow(id)]));
    for (const m of matches) {
      if (m.competitionId !== state.id || m.stageLabel !== label || !m.played) continue;
      feed(rows.get(m.homeClubId)!, m.homeGoals, m.awayGoals);
      feed(rows.get(m.awayClubId)!, m.awayGoals, m.homeGoals);
    }
    return [...rows.values()].sort(byTable);
  });
}

// --- Knockout progression --------------------------------------------------

/** Human label for a knockout round entered by `n` teams. */
function labelForCount(n: number): string {
  if (n <= 2) return 'Final';
  if (n <= 4) return 'Semi-final';
  if (n <= 8) return 'Quarter-final';
  if (n <= 16) return 'Round of 16';
  return 'Round of 32';
}
/** Ordering key so earlier rounds sort before later ones. */
const roundNoForCount = (n: number) => 200 - n;

/** Resolve a played knockout tie (goals → extra time → penalties). Mutates `m`. */
const tieWinner = (m: Match, clubs: Record<string, Club>, rng: Rng): string => resolveKnockoutTie(m, clubs, rng);

export interface ContinentalAdvance {
  state: ContinentalState;
  newMatches: Match[];      // next round's fixtures to add
  updatedMatches: Match[];  // played ties updated with penalty results
}

/**
 * Advance a competition if its current phase has just finished: draw the next
 * knockout round onto later calendar days. Returns null when nothing changed
 * (phase still in progress, or the competition is complete).
 */
export function advanceContinental(
  state: ContinentalState,
  allMatches: Match[],
  clubs: Record<string, Club>,
  _players: Record<string, Player>,
  currentDay: number,
  maxLeagueDay: number,
  seed: number,
): ContinentalAdvance | null {
  void maxLeagueDay;
  if (state.stage === 'DONE') return null;
  const mine = allMatches.filter((m) => m.competitionId === state.id);
  // Identify the fixtures of the current phase and check they've all been played.
  const inStage = state.stage === 'GROUPS'
    ? mine.filter((m) => m.stageLabel?.startsWith('Group '))
    : state.stage === 'LEAGUE' ? mine.filter((m) => m.stageLabel === 'League Phase')
      : state.stage === 'KO_PLAYOFF' ? mine.filter((m) => m.stageLabel === 'Knockout Play-off')
        : mine.filter((m) => m.stageLabel === state.roundLabel);
  if (inStage.length === 0 || inStage.some((m) => !m.played)) return null; // not finished

  const rng = new Rng(seed);
  const updatedMatches: Match[] = [];

  // Place the next round on the next free odd day (Europe plays midweek). The
  // season can't roll over until every tie is played, so this may run past the
  // domestic finale. Rounds land on reserved knockout days spread through the
  // back half so European nights sit between league games all the way to May.
  const day = nextKoDay(state, currentDay);

  // Draw a knockout round from `seeds`; if it comes down to one team, that's the
  // champion. Returns the advance payload.
  const drawRound = (seeds: string[], lastTies: Match[]): ContinentalAdvance => {
    if (seeds.length <= 1) {
      state.championId = seeds[0] ?? null;
      const fin = lastTies[0];
      if (fin) state.runnerUpId = fin.homeClubId === seeds[0] ? fin.awayClubId : fin.homeClubId;
      state.stage = 'DONE';
      return { state, newMatches: [], updatedMatches };
    }
    const label = labelForCount(seeds.length);
    const { matches, byes } = buildKnockoutRound(state.id, state.seasonId, seeds, label, roundNoForCount(seeds.length), rng.seedValue());
    for (const m of matches) m.day = day;
    state.byes = byes;
    state.roundLabel = label;
    state.stage = 'KO';
    return { state, newMatches: matches, updatedMatches };
  };

  if (state.stage === 'LEAGUE') {
    const table = leaguePhaseTable(state, allMatches);
    state.alive = table.slice(0, 8).map((r) => r.clubId);            // direct to R16
    const playoff = table.slice(8, 24).map((r) => r.clubId);         // 9–24 play-off
    const { matches, byes } = buildKnockoutRound(state.id, state.seasonId, playoff, 'Knockout Play-off', 99, rng.seedValue());
    for (const m of matches) m.day = day;
    state.byes = byes;
    state.stage = 'KO_PLAYOFF';
    return { state, newMatches: matches, updatedMatches };
  }
  if (state.stage === 'KO_PLAYOFF') {
    const winners = [...inStage.map((m) => { const w = tieWinner(m, clubs, rng); updatedMatches.push(m); return w; }), ...(state.byes ?? [])];
    return drawRound([...(state.alive ?? []), ...winners], inStage);
  }
  if (state.stage === 'GROUPS') {
    const tables = groupTables(state, allMatches);
    const winners = tables.map((t) => t[0]?.clubId).filter(Boolean) as string[];
    const runners = tables.map((t) => t[1]?.clubId).filter(Boolean) as string[];
    const seeds: string[] = [];
    for (let i = 0; i < winners.length; i++) { seeds.push(winners[i]); seeds.push(runners[(i + 1) % runners.length]); }
    return drawRound(seeds, []);
  }
  // A main knockout round (state.stage === 'KO').
  const winners = [...inStage.map((m) => { const w = tieWinner(m, clubs, rng); updatedMatches.push(m); return w; }), ...(state.byes ?? [])];
  return drawRound(winners, inStage);
}

export interface ContinentalBatch {
  states: Record<string, ContinentalState>;
  newMatches: Match[];
  updatedMatches: Match[];
  changed: boolean;
}

/** Advance every competition one step where its current phase has finished. */
export function advanceAllContinental(
  continental: Record<string, ContinentalState>,
  allMatches: Match[],
  clubs: Record<string, Club>,
  players: Record<string, Player>,
  currentDay: number,
  maxLeagueDay: number,
  seed: number,
): ContinentalBatch {
  const states: Record<string, ContinentalState> = { ...continental };
  const newMatches: Match[] = [];
  const updatedMatches: Match[] = [];
  let changed = false;
  let working = [...allMatches];
  for (const state of Object.values(continental)) {
    const res = advanceContinental(
      { ...state }, working, clubs, players, currentDay, maxLeagueDay,
      (seed ^ hashId(state.id)) >>> 0,
    );
    if (!res) continue;
    changed = true;
    states[state.id] = res.state;
    newMatches.push(...res.newMatches);
    updatedMatches.push(...res.updatedMatches);
    working = [...working, ...res.newMatches];
  }
  return { states, newMatches, updatedMatches, changed };
}

function hashId(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
