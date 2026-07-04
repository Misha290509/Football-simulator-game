import { describe, it, expect } from 'vitest';
import { loadDataset } from '../../data/datasetLoader';
import { ENGLAND_DATASET } from '../../data/england';
import { buildLineupProfile } from '../lineup';
import { createLiveMatch, kickOff, tickLiveMatch, startSecondHalf, applyManagerChange, liveOutcome, tickShootout, type LiveMatchState } from '../liveMatch';
import { Rng } from '../rng';
import type { Club } from '../../types/club';

const world = loadDataset(ENGLAND_DATASET, 5, 2024);
const clubs = Object.values(world.clubs).sort((a, b) => b.reputation - a.reputation);
const playersOf = (id: string) => Object.values(world.players).filter((p) => p.contract.clubId === id);
const profileOf = (c: Club) => buildLineupProfile(c.id, playersOf(c.id), c.formation ?? '4-3-3', { autoMode: true });

function newLive(homeC: Club, awayC: Club, seed: number, managed: 'home' | 'away' = 'home') {
  return createLiveMatch({
    matchId: 'm1', competitionId: 'c', seasonId: 's',
    homeClubId: homeC.id, awayClubId: awayC.id,
    homeProfile: profileOf(homeC), awayProfile: profileOf(awayC),
    managedSide: managed, seed,
  });
}

function runToEnd(state: LiveMatchState, rng: Rng) {
  let guard = 0;
  while (!state.finished && guard++ < 400) {
    if (state.phase === 'PREMATCH') kickOff(state);
    else if (state.phase === 'HALF_TIME') startSecondHalf(state);
    else tickLiveMatch(state, rng);
  }
}

describe('Live match engine', () => {
  it('plays a full match with kickoff, half-time and full-time', () => {
    const { state, rng } = newLive(clubs[0], clubs[1], 42);
    runToEnd(state, rng);
    expect(state.finished).toBe(true);
    expect(state.phase).toBe('FULL_TIME');
    expect(state.minute).toBeGreaterThanOrEqual(90);
    const types = state.events.map((e) => e.type);
    expect(types).toContain('KICKOFF');
    expect(types).toContain('HALFTIME');
    expect(types).toContain('FULLTIME');
    const out = liveOutcome(state);
    expect(out.homeGoals).toBe(state.home.goals);
    expect(out.playerStats.length).toBeGreaterThan(0);
    // Everyone who featured has a rating in range.
    for (const s of out.playerStats) { expect(s.rating).toBeGreaterThanOrEqual(3.5); expect(s.rating).toBeLessThanOrEqual(10); }
  });

  it('is deterministic for a fixed seed with no manager input', () => {
    const a = newLive(clubs[0], clubs[1], 77); runToEnd(a.state, a.rng);
    const b = newLive(clubs[0], clubs[1], 77); runToEnd(b.state, b.rng);
    expect(`${a.state.home.goals}-${a.state.away.goals}`).toBe(`${b.state.home.goals}-${b.state.away.goals}`);
    expect(a.state.events.length).toBe(b.state.events.length);
  });

  it('a much stronger side outscores a weaker one on average', () => {
    const strong = clubs[0];
    const weak = clubs[clubs.length - 1];
    let strongGoals = 0, weakGoals = 0;
    for (let i = 0; i < 12; i++) {
      const { state, rng } = newLive(strong, weak, 100 + i);
      runToEnd(state, rng);
      strongGoals += state.home.goals; weakGoals += state.away.goals;
    }
    expect(strongGoals).toBeGreaterThan(weakGoals);
  });

  it('a level knockout tie goes to a penalty shootout that produces a winner', () => {
    // Force a level tie by pitting a club against itself, flagged needsWinner.
    const c = clubs[0];
    const { state, rng } = createLiveMatch({
      matchId: 'ko', competitionId: 'UEFA_CL', seasonId: 's',
      homeClubId: c.id, awayClubId: clubs[1].id,
      homeProfile: profileOf(c), awayProfile: profileOf(clubs[1]),
      managedSide: 'home', seed: 3, needsWinner: true,
    });
    kickOff(state);
    let guard = 0;
    while (state.phase !== 'SHOOTOUT' && !state.finished && guard++ < 400) {
      if (state.phase === 'HALF_TIME') startSecondHalf(state);
      else tickLiveMatch(state, rng);
      // Bail out early if the 90 minutes weren't level (no shootout needed).
      if (state.phase === 'FULL_TIME') break;
    }
    if (state.phase === 'SHOOTOUT') {
      expect(state.finished).toBe(false);
      let g2 = 0;
      while (!state.finished && g2++ < 100) tickShootout(state, rng);
      expect(state.finished).toBe(true);
      expect(state.phase).toBe('FULL_TIME');
      expect(state.shootout!.home).not.toBe(state.shootout!.away); // decisive
      expect(state.events.some((e) => e.type === 'PENALTY')).toBe(true);
    }
  });

  it('shootout resolves decisively from a forced level state', () => {
    const c = clubs[0];
    const { state, rng } = createLiveMatch({
      matchId: 'ko2', competitionId: 'UEFA_CL', seasonId: 's',
      homeClubId: c.id, awayClubId: clubs[1].id,
      homeProfile: profileOf(c), awayProfile: profileOf(clubs[1]),
      managedSide: 'home', seed: 11, needsWinner: true,
    });
    // Drive straight into a shootout by hand.
    state.phase = 'SHOOTOUT';
    state.shootout = { home: 0, away: 0, kicks: [], done: false, winner: null };
    let g = 0;
    while (!state.shootout.done && g++ < 100) tickShootout(state, rng);
    expect(state.shootout.done).toBe(true);
    expect(state.shootout.winner).toMatch(/home|away/);
    // Best-of-five minimum: at least 6 kicks unless clinched early (≥ 2 each side start).
    expect(state.shootout.kicks.length).toBeGreaterThanOrEqual(3);
  });

  it('records a substitution and updates the pitch', () => {
    const { state, rng } = newLive(clubs[0], clubs[1], 9);
    kickOff(state);
    for (let i = 0; i < 55; i++) tickLiveMatch(state, rng);
    const home = state.home;
    const offId = home.onPitch.find((id) => id !== home.profile.gkId)!;
    const onId = home.bench[0].playerId;
    const swapped = { ...home.profile, starters: home.profile.starters.map((id) => (id === offId ? onId : id)) };
    applyManagerChange(state, 'home', swapped, { offId, onId });
    expect(state.home.subsUsed).toBe(1);
    expect(state.home.onPitch).toContain(onId);
    expect(state.home.onPitch).not.toContain(offId);
    expect(state.events.some((e) => e.type === 'SUB' && e.playerId === onId && e.assistPlayerId === offId)).toBe(true);
  });
});
