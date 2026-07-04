// ---------------------------------------------------------------------------
// Domestic cup orchestration (§ Cups). Builds each nation's two cups + the Super
// Cup, schedules the opening round on the calendar, and draws each subsequent
// round as the previous one finishes (level ties settled on penalties). Mirrors
// the continental knockout machinery but is a pure single-elimination bracket.
// ---------------------------------------------------------------------------

import type { Match } from '../../types/match';
import type { Club } from '../../types/club';
import type { Competition } from '../../types/competition';
import type { DomesticCupState, CupKind } from '../../types/cup';
import { Rng } from '../../engine/rng';
import { buildKnockoutRound } from '../continental/schedule';
import { DAY_CLASS, slotsInClass, nextDayInClass } from '../calendar';

/** Human label for a cup round entered by `n` teams. */
function roundLabel(n: number): string {
  if (n <= 2) return 'Final';
  if (n <= 4) return 'Semi-final';
  if (n <= 8) return 'Quarter-final';
  if (n <= 16) return 'Round of 16';
  if (n <= 32) return 'Round of 32';
  if (n <= 64) return 'Round of 64';
  return 'Preliminary Round';
}
const roundNo = (n: number) => 300 - n;

function nextCupDay(state: DomesticCupState, currentDay: number): number {
  const reserved = (state.koDays ?? []).find((d) => d > currentDay);
  return reserved ?? nextDayInClass(currentDay, DAY_CLASS.CUP);
}

/** Settle a played tie (goals, else penalties by reputation; live pens respected). */
function resolveTie(m: Match, clubs: Record<string, Club>, rng: Rng): string {
  if (m.homeGoals > m.awayGoals) return m.homeClubId;
  if (m.awayGoals > m.homeGoals) return m.awayClubId;
  const existing = m.events.find((e) => e.type === 'PENALTY');
  if (existing) return existing.side === 'home' ? m.homeClubId : m.awayClubId;
  const hr = clubs[m.homeClubId]?.reputation ?? 50;
  const ar = clubs[m.awayClubId]?.reputation ?? 50;
  const ph = 0.75 + (hr - ar) / 500, pa = 0.75 + (ar - hr) / 500;
  let hs = 0, as = 0;
  for (let i = 0; i < 5; i++) { if (rng.chance(ph)) hs++; if (rng.chance(pa)) as++; }
  let guard = 0;
  while (hs === as && guard++ < 20) { if (rng.chance(ph)) hs++; if (rng.chance(pa)) as++; }
  if (hs === as) hs++;
  const winner = hs > as ? m.homeClubId : m.awayClubId;
  m.events = [...m.events, { minute: 120, type: 'PENALTY', side: winner === m.homeClubId ? 'home' : 'away', description: `Penalty shootout ${hs}–${as}` }];
  return winner;
}

interface DrawResult { newMatches: Match[]; done: boolean }

/** Draw the next round of a cup from `seeds` onto its reserved day. */
function drawRound(state: DomesticCupState, seeds: string[], currentDay: number, rng: Rng, lastTies: Match[]): DrawResult {
  if (seeds.length <= 1) {
    state.championId = seeds[0] ?? null;
    const fin = lastTies[0];
    if (fin) state.runnerUpId = fin.homeClubId === seeds[0] ? fin.awayClubId : fin.homeClubId;
    state.stage = 'DONE';
    return { newMatches: [], done: true };
  }
  const label = roundLabel(seeds.length);
  const { matches, byes } = buildKnockoutRound(state.id, state.seasonId, seeds, label, roundNo(seeds.length), rng.seedValue());
  const day = nextCupDay(state, currentDay);
  for (const m of matches) m.day = day;
  state.byes = byes;
  state.roundLabel = label;
  return { newMatches: matches, done: false };
}

// --- Creation --------------------------------------------------------------

function cupField(competitions: Competition[], countryId: string, kind: CupKind): string[] {
  const tiers = competitions.filter((c) => c.countryId === countryId).sort((a, b) => a.tier - b.tier);
  const clubs = kind === 'LEAGUE'
    ? tiers.filter((c) => c.tier <= 2).flatMap((c) => c.clubIds)
    : tiers.flatMap((c) => c.clubIds);
  return clubs;
}

export interface CupSetup { states: Record<string, DomesticCupState>; matches: Match[] }

/** Create both domestic cups for every nation with the opening round scheduled. */
export function createDomesticCups(
  competitions: Record<string, Competition>,
  clubs: Record<string, Club>,
  seasonId: string,
  year: number,
  maxLeagueDay: number,
  seed: number,
): CupSetup {
  const comps = Object.values(competitions);
  const countries = [...new Set(comps.map((c) => c.countryId))];
  const states: Record<string, DomesticCupState> = {};
  const matches: Match[] = [];

  for (const countryId of countries) {
    for (const kind of ['MAJOR', 'LEAGUE'] as const) {
      const field = cupField(comps, countryId, kind);
      if (field.length < 4) continue;
      const id = `cup_${countryId}_${kind}`;
      const name = `${countryId} ${kind === 'LEAGUE' ? 'League Cup' : 'Cup'}`;
      // Seed by reputation so the big clubs are spread through the bracket.
      const seeds = [...field].sort((a, b) => (clubs[b]?.reputation ?? 0) - (clubs[a]?.reputation ?? 0));
      const rng = new Rng((seed ^ hashId(id)) >>> 0);
      // Cup rounds run across the whole season on class-2 days.
      const koDays = slotsInClass(Math.floor(maxLeagueDay * 0.12), Math.floor(maxLeagueDay * 1.0), 9, DAY_CLASS.CUP);
      const state: DomesticCupState = {
        id, name, countryId, kind, seasonId, year, clubIds: field, stage: 'KO', koDays,
      };
      const first = drawRound(state, seeds, koDays[0] - 3, rng, []);
      states[id] = state;
      matches.push(...first.newMatches);
    }
  }
  return { states, matches };
}

/** Create the Super Cup: league champion vs major-cup winner, a season opener. */
export function createSuperCup(
  countryId: string, leagueChampion: string, cupWinner: string,
  seasonId: string, year: number, seed: number,
): CupSetup {
  if (!leagueChampion || !cupWinner || leagueChampion === cupWinner) return { states: {}, matches: [] };
  const id = `supercup_${countryId}`;
  const state: DomesticCupState = {
    id, name: `${countryId} Super Cup`, countryId, kind: 'SUPER', seasonId, year,
    clubIds: [leagueChampion, cupWinner], stage: 'KO', roundLabel: 'Final', koDays: [],
  };
  const rng = new Rng((seed ^ hashId(id)) >>> 0);
  const { matches } = buildKnockoutRound(id, seasonId, [leagueChampion, cupWinner], 'Final', 300, rng.seedValue());
  const day = nextDayInClass(2, DAY_CLASS.CUP); // very early in the season
  for (const m of matches) m.day = day;
  return { states: { [id]: state }, matches };
}

// --- Progression -----------------------------------------------------------

export interface CupAdvance { state: DomesticCupState; newMatches: Match[]; updatedMatches: Match[] }

export function advanceDomesticCup(
  state: DomesticCupState, allMatches: Match[], clubs: Record<string, Club>, currentDay: number, seed: number,
): CupAdvance | null {
  if (state.stage === 'DONE') return null;
  const inRound = allMatches.filter((m) => m.competitionId === state.id && m.stageLabel === state.roundLabel);
  if (inRound.length === 0 || inRound.some((m) => !m.played)) return null;
  const rng = new Rng(seed);
  const updatedMatches: Match[] = [];
  const winners = [
    ...inRound.map((m) => { const w = resolveTie(m, clubs, rng); updatedMatches.push(m); return w; }),
    ...(state.byes ?? []),
  ];
  const { newMatches } = drawRound(state, winners, currentDay, rng, inRound);
  return { state, newMatches, updatedMatches };
}

export interface CupBatch { states: Record<string, DomesticCupState>; newMatches: Match[]; updatedMatches: Match[]; changed: boolean }

export function advanceAllDomesticCups(
  cups: Record<string, DomesticCupState>, allMatches: Match[], clubs: Record<string, Club>, currentDay: number, seed: number,
): CupBatch {
  const states = { ...cups };
  const newMatches: Match[] = [];
  const updatedMatches: Match[] = [];
  let changed = false;
  let working = [...allMatches];
  for (const st of Object.values(cups)) {
    const res = advanceDomesticCup({ ...st }, working, clubs, currentDay, (seed ^ hashId(st.id)) >>> 0);
    if (!res) continue;
    changed = true;
    states[st.id] = res.state;
    newMatches.push(...res.newMatches);
    updatedMatches.push(...res.updatedMatches);
    working = [...working, ...res.newMatches];
  }
  return { states, newMatches, updatedMatches, changed };
}

/** Earliest day the sim must pause at to draw the next cup round (or Infinity). */
export function nextDomesticCupStop(
  cups: Record<string, DomesticCupState>, allMatches: Match[], currentDay: number,
): number {
  let stop = Infinity;
  for (const st of Object.values(cups)) {
    if (st.stage === 'DONE') continue;
    const round = allMatches.filter((m) => m.competitionId === st.id && m.stageLabel === st.roundLabel);
    if (round.length === 0) continue;
    if (round.every((m) => m.played)) { stop = Math.min(stop, currentDay); continue; }
    const lastDay = Math.max(...round.map((m) => m.day));
    if (lastDay + 1 > currentDay) stop = Math.min(stop, lastDay + 1);
  }
  return stop;
}

function hashId(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
