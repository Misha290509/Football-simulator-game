import { describe, it, expect } from 'vitest';
import type { Club } from '../../../types/club';
import type { Match } from '../../../types/match';
import type { ContinentalState } from '../../../types/continental';
import { createContinental, advanceContinental, leaguePhaseTable, groupTables } from '../competition';
import { buildEuropeanQualification } from '../qualification';

function makeClubs(n: number): Record<string, Club> {
  const out: Record<string, Club> = {};
  for (let i = 0; i < n; i++) {
    out[`c${i}`] = { id: `c${i}`, reputation: 40 + (i % 45) } as Club;
  }
  return out;
}

/** Deterministically "play" unplayed matches: stronger reputation scores more. */
function playAll(matches: Match[], clubs: Record<string, Club>) {
  for (const m of matches) {
    if (m.played) continue;
    const hr = clubs[m.homeClubId].reputation;
    const ar = clubs[m.awayClubId].reputation;
    m.homeGoals = Math.max(0, Math.round((hr - ar) / 20) + (hr % 3));
    m.awayGoals = Math.max(0, Math.round((ar - hr) / 20) + (ar % 3));
    m.played = true;
  }
}

function runToChampion(seed: number): string {
  const clubs = makeClubs(60);
  const field = Object.keys(clubs).slice(0, 36);
  const { state, matches } = createContinental({
    id: 'UEFA_CL', name: 'Champions League', format: 'swiss', clubIds: field,
    seasonId: 's', year: 2024, leaguePhaseGames: 8, clubs, seed, maxLeagueDay: 74,
  });
  const all = [...matches];
  playAll(all, clubs);
  let st: ContinentalState = state;
  let day = 47;
  let guard = 0;
  while (st.stage !== 'DONE' && guard++ < 20) {
    const res = advanceContinental(st, all, clubs, {}, day, 74, seed);
    expect(res).not.toBeNull();
    st = res!.state;
    for (const u of res!.updatedMatches) { const i = all.findIndex((m) => m.id === u.id); if (i >= 0) all[i] = u; }
    all.push(...res!.newMatches);
    playAll(res!.newMatches, clubs);
    day += 2;
  }
  return st.championId!;
}

describe('Continental — qualification', () => {
  it('fills three 36-team European fields without overlaps', () => {
    const clubs = makeClubs(220);
    // Two fake UEFA top divisions.
    const competitions = {
      a: { id: 'a', confederation: 'UEFA', tier: 1, countryId: 'A', clubIds: Object.keys(clubs).slice(0, 110) },
      b: { id: 'b', confederation: 'UEFA', tier: 1, countryId: 'B', clubIds: Object.keys(clubs).slice(110) },
    } as never;
    const q = buildEuropeanQualification(competitions, clubs);
    expect(q.championsLeague.length).toBe(36);
    expect(q.europaLeague.length).toBe(36);
    expect(q.conferenceLeague.length).toBe(36);
    const all = new Set([...q.championsLeague, ...q.europaLeague, ...q.conferenceLeague]);
    expect(all.size).toBe(108); // no club appears twice
  });
});

describe('Continental — Champions League on the calendar', () => {
  const clubs = makeClubs(60);
  const field = Object.keys(clubs).slice(0, 36);
  const { matches } = createContinental({
    id: 'UEFA_CL', name: 'Champions League', format: 'swiss', clubIds: field,
    seasonId: 's', year: 2024, leaguePhaseGames: 8, clubs, seed: 1, maxLeagueDay: 74,
  });

  it('schedules the league phase on interleaved (odd) midweek days', () => {
    expect(matches.length).toBe(36 * 8 / 2); // 144
    expect(matches.every((m) => m.day % 3 === 1)).toBe(true); // continental day-class
  });

  it('gives every club exactly 8 league-phase games', () => {
    const count: Record<string, number> = {};
    for (const m of matches) { count[m.homeClubId] = (count[m.homeClubId] ?? 0) + 1; count[m.awayClubId] = (count[m.awayClubId] ?? 0) + 1; }
    expect(Object.values(count).every((c) => c === 8)).toBe(true);
  });

  it('progresses league phase → play-off → knockout → a single champion', () => {
    const champ = runToChampion(1);
    expect(champ).toBeTruthy();
    expect(field).toContain(champ);
  });

  it('is deterministic for a given seed', () => {
    expect(runToChampion(7)).toBe(runToChampion(7));
  });

  it('runs the Club World Cup as 8 groups of 4 → knockout → champion', () => {
    const clubs2 = makeClubs(40);
    const field2 = Object.keys(clubs2).slice(0, 32);
    const setup = createContinental({
      id: 'FIFA_CWC', name: 'Club World Cup', format: 'groups', clubIds: field2,
      seasonId: 's', year: 2025, leaguePhaseGames: 0, nGroups: 8, clubs: clubs2, seed: 5, maxLeagueDay: 74,
    });
    expect(setup.state.groups?.length).toBe(8);
    expect(setup.matches.length).toBe(8 * 6); // 8 groups × 6 games
    playAll(setup.matches, clubs2);
    expect(groupTables(setup.state, setup.matches)[0].length).toBe(4);
    const all = [...setup.matches];
    let st = setup.state; let day = 90; let guard = 0;
    while (st.stage !== 'DONE' && guard++ < 20) {
      const res = advanceContinental(st, all, clubs2, {}, day, 74, 5);
      expect(res).not.toBeNull();
      st = res!.state;
      for (const u of res!.updatedMatches) { const i = all.findIndex((m) => m.id === u.id); if (i >= 0) all[i] = u; }
      all.push(...res!.newMatches);
      playAll(res!.newMatches, clubs2);
      day += 2;
    }
    expect(field2).toContain(st.championId!);
  });

  it('computes a 36-row league-phase table once games are played', () => {
    const clubs2 = makeClubs(60);
    const field2 = Object.keys(clubs2).slice(0, 36);
    const setup = createContinental({
      id: 'UEFA_CL', name: 'Champions League', format: 'swiss', clubIds: field2,
      seasonId: 's', year: 2024, leaguePhaseGames: 8, clubs: clubs2, seed: 2, maxLeagueDay: 74,
    });
    playAll(setup.matches, clubs2);
    const table = leaguePhaseTable(setup.state, setup.matches);
    expect(table.length).toBe(36);
    expect(table[0].played).toBe(8);
  });
});
