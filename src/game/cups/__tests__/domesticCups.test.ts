import { describe, it, expect } from 'vitest';
import type { Club } from '../../../types/club';
import type { Competition } from '../../../types/competition';
import type { Match } from '../../../types/match';
import type { DomesticCupState } from '../../../types/cup';
import { createDomesticCups, createSuperCup, advanceDomesticCup } from '../domesticCups';
import { createNewGame } from '../../newGame';
import { ENGLAND_DATASET } from '../../../data/england';

function fakeWorld(nClubs: number): { clubs: Record<string, Club>; competitions: Record<string, Competition> } {
  const clubs: Record<string, Club> = {};
  const ids: string[] = [];
  for (let i = 0; i < nClubs; i++) { const id = `c${i}`; ids.push(id); clubs[id] = { id, reputation: 40 + (i % 45) } as Club; }
  const half = Math.ceil(nClubs / 2);
  const competitions: Record<string, Competition> = {
    t1: { id: 't1', countryId: 'GB', tier: 1, clubIds: ids.slice(0, half) } as Competition,
    t2: { id: 't2', countryId: 'GB', tier: 2, clubIds: ids.slice(half) } as Competition,
  };
  return { clubs, competitions };
}

function playAll(matches: Match[], clubs: Record<string, Club>) {
  for (const m of matches) {
    if (m.played) continue;
    const hr = clubs[m.homeClubId].reputation, ar = clubs[m.awayClubId].reputation;
    m.homeGoals = Math.max(0, Math.round((hr - ar) / 20) + (hr % 3));
    m.awayGoals = Math.max(0, Math.round((ar - hr) / 20) + (ar % 3));
    m.played = true;
  }
}

describe('Domestic cups — engine', () => {
  const { clubs, competitions } = fakeWorld(48);

  it('creates a major cup (all clubs) and a League Cup (top two tiers) on class-2 days', () => {
    const { states, matches } = createDomesticCups(competitions, clubs, 's', 2024, 75, 1);
    expect(states['cup_GB_MAJOR']).toBeTruthy();
    expect(states['cup_GB_LEAGUE']).toBeTruthy();
    expect(matches.every((m) => m.day % 3 === 2)).toBe(true); // cup day-class
  });

  it('progresses a cup round-by-round to a single winner', () => {
    const { states, matches } = createDomesticCups(competitions, clubs, 's', 2024, 75, 2);
    const st: DomesticCupState = states['cup_GB_MAJOR'];
    const all = [...matches.filter((m) => m.competitionId === st.id)];
    playAll(all, clubs);
    let state = st; let day = 10; let guard = 0;
    while (state.stage !== 'DONE' && guard++ < 20) {
      const res = advanceDomesticCup(state, all, clubs, day, 2);
      expect(res).not.toBeNull();
      state = res!.state;
      for (const u of res!.updatedMatches) { const i = all.findIndex((m) => m.id === u.id); if (i >= 0) all[i] = u; }
      all.push(...res!.newMatches);
      playAll(res!.newMatches, clubs);
      day += 3;
    }
    expect(state.championId).toBeTruthy();
    expect(st.clubIds).toContain(state.championId!);
  });

  it('builds a one-off Super Cup between two clubs', () => {
    const { states, matches } = createSuperCup('GB', 'c0', 'c1', 's', 2024, 5);
    expect(states['supercup_GB']?.clubIds).toEqual(['c0', 'c1']);
    expect(matches.length).toBe(1);
  });
});

describe('Domestic cups — installed into a new game', () => {
  const snap = createNewGame({
    saveName: 'C', managerName: 'X', dataset: ENGLAND_DATASET,
    managerClubId: 'club_GB_ARS', startYear: 2024, seed: 7,
  });

  it('installs both England cups with fixtures the manager can play', () => {
    expect(snap.meta.domesticCups?.['cup_GB_MAJOR']?.stage).toBe('KO');
    expect(snap.meta.domesticCups?.['cup_GB_LEAGUE']?.stage).toBe('KO');
    const cupMatches = Object.values(snap.matches).filter((m) => m.competitionId.startsWith('cup_GB_'));
    expect(cupMatches.length).toBeGreaterThan(0);
    expect(cupMatches.every((m) => m.day % 3 === 2)).toBe(true);
  });

  it('keeps league, continental and cup fixtures on distinct day-classes', () => {
    const all = Object.values(snap.matches);
    const league = all.filter((m) => snap.meta.competitions[m.competitionId]);
    const cont = all.filter((m) => m.competitionId.startsWith('UEFA_'));
    const cups = all.filter((m) => m.competitionId.startsWith('cup_'));
    expect(league.every((m) => m.day % 3 === 0)).toBe(true);
    expect(cont.every((m) => m.day % 3 === 1)).toBe(true);
    expect(cups.every((m) => m.day % 3 === 2)).toBe(true);
  });
});
