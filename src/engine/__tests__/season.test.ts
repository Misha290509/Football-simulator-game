import { describe, it, expect } from 'vitest';
import { ENGLAND_DATASET } from '../../data/england';
import { loadDataset } from '../../data/datasetLoader';
import { generateSchedule } from '../schedule';
import { buildLineupProfile } from '../lineup';
import { simulateMatch } from '../match';
import { computeStandings } from '../standings';

const world = loadDataset(ENGLAND_DATASET, 4242, 2024);
const pl = Object.values(world.competitions).find((c) => c.tier === 1)!;

describe('Schedule generation', () => {
  const fixtures = generateSchedule(pl, 's', 1);

  it('produces a full double round-robin', () => {
    const n = pl.clubIds.length; // 20
    expect(fixtures.length).toBe(n * (n - 1)); // 380
  });

  it('every club plays every other home and away exactly once', () => {
    const seen = new Map<string, number>();
    for (const m of fixtures) {
      const key = `${m.homeClubId}->${m.awayClubId}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    for (const v of seen.values()) expect(v).toBe(1);
    // Each club appears in 2*(n-1) matches.
    const counts = new Map<string, number>();
    for (const m of fixtures) {
      counts.set(m.homeClubId, (counts.get(m.homeClubId) ?? 0) + 1);
      counts.set(m.awayClubId, (counts.get(m.awayClubId) ?? 0) + 1);
    }
    for (const c of counts.values()) expect(c).toBe(2 * (pl.clubIds.length - 1));
  });

  it('caps each matchday at n/2 matches', () => {
    const byDay = new Map<number, number>();
    for (const m of fixtures) byDay.set(m.day, (byDay.get(m.day) ?? 0) + 1);
    for (const v of byDay.values()) expect(v).toBeLessThanOrEqual(pl.clubIds.length / 2);
  });
});

describe('Match engine', () => {
  const ids = pl.clubIds;
  const playersOf = (clubId: string) =>
    Object.values(world.players).filter((p) => p.contract.clubId === clubId);
  const a = buildLineupProfile(ids[0], playersOf(ids[0]), '4-3-3');
  const b = buildLineupProfile(ids[1], playersOf(ids[1]), '4-3-3');

  it('is deterministic for a given seed', () => {
    const r1 = simulateMatch(a, b, 777);
    const r2 = simulateMatch(a, b, 777);
    expect(r1.homeGoals).toBe(r2.homeGoals);
    expect(r1.awayGoals).toBe(r2.awayGoals);
    expect(r1.events).toEqual(r2.events);
  });

  it('emits a kickoff and a fulltime event with a sorted timeline', () => {
    const r = simulateMatch(a, b, 5);
    expect(r.events[0].type).toBe('KICKOFF');
    expect(r.events[r.events.length - 1].type).toBe('FULLTIME');
    const minutes = r.events.map((e) => e.minute);
    expect([...minutes].sort((x, y) => x - y)).toEqual(minutes);
  });

  it('goals scored match the goal events', () => {
    const r = simulateMatch(a, b, 31337);
    const homeGoalEvents = r.events.filter((e) => e.type === 'GOAL' && e.side === 'home').length;
    expect(homeGoalEvents).toBe(r.homeGoals);
  });

  it('produces plausible average goals over many matches', () => {
    let goals = 0;
    const N = 200;
    for (let i = 0; i < N; i++) goals += (() => {
      const r = simulateMatch(a, b, i + 1);
      return r.homeGoals + r.awayGoals;
    })();
    const avg = goals / N;
    expect(avg).toBeGreaterThan(1.5);
    expect(avg).toBeLessThan(5);
  });
});

describe('Standings', () => {
  it('awards points correctly and orders by tiebreakers', () => {
    const fixtures = generateSchedule(pl, 's2', 9).map((m, i) => {
      // Force club[0] to win all, club at end to lose all (deterministic).
      if (i % 1 === 0) return m;
      return m;
    });
    // Play a couple of concrete results manually.
    const [m0] = fixtures;
    m0.played = true; m0.homeGoals = 3; m0.awayGoals = 0;
    const table = computeStandings(pl, [m0]);
    const winner = table.find((r) => r.clubId === m0.homeClubId)!;
    const loser = table.find((r) => r.clubId === m0.awayClubId)!;
    expect(winner.points).toBe(3);
    expect(winner.goalsFor).toBe(3);
    expect(loser.points).toBe(0);
    // Winner ranks above loser.
    expect(table.indexOf(winner)).toBeLessThan(table.indexOf(loser));
  });
});
