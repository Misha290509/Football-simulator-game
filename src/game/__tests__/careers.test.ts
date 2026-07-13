import { describe, it, expect } from 'vitest';
import { loadDataset } from '../../data/datasetLoader';
import { ENGLAND_DATASET } from '../../data/england';
import { initialManagerReputation, updateManagerReputation, generateJobOffers, fallbackJobOffers, switchClub } from '../careers';
import { Rng } from '../../engine/rng';
import type { StandingRow } from '../../types/league';

const world = loadDataset(ENGLAND_DATASET, 5, 2024);
const comp = Object.values(world.competitions).find((c) => c.tier === 1)!;
const clubIds = comp.clubIds;
// Standings ordered by reputation (so everyone finishes at their "expected" spot by default).
const byRep = [...clubIds].sort((a, b) => world.clubs[b].reputation - world.clubs[a].reputation);
const standings = (order: string[]): Record<string, StandingRow[]> => ({
  [comp.id]: order.map((clubId, i) => ({ clubId, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: order.length - i })),
});

describe('Manager reputation', () => {
  it('overperformance + trophies raise reputation; a sacking lowers it', () => {
    expect(updateManagerReputation(50, 1, 6, 2, false)).toBeGreaterThan(50); // beat target + trophies
    expect(updateManagerReputation(50, 12, 4, 0, false)).toBeLessThan(50); // way below target
    expect(updateManagerReputation(50, 10, 4, 0, true)).toBeLessThan(updateManagerReputation(50, 10, 4, 0, false));
  });

  it('initial reputation scales with the starting club', () => {
    const big = [...clubIds].sort((a, b) => world.clubs[b].reputation - world.clubs[a].reputation)[0];
    const small = [...clubIds].sort((a, b) => world.clubs[a].reputation - world.clubs[b].reputation)[0];
    expect(initialManagerReputation(world.clubs[big])).toBeGreaterThan(initialManagerReputation(world.clubs[small]));
  });
});

describe('Job market', () => {
  it('generates rebuild offers for a sacked manager', () => {
    const mid = byRep[Math.floor(byRep.length / 2)];
    const rep = initialManagerReputation(world.clubs[mid]);
    const offers = generateJobOffers(rep, mid, world.clubs, world.competitions, standings(byRep), new Rng(3), true, 0);
    expect(offers.length).toBeGreaterThan(0);
    // A sacked manager's offers come from clubs at or below the one he left, never far above.
    for (const o of offers) expect(o.clubReputation).toBeLessThanOrEqual(world.clubs[mid].reputation + 3);
  });

  it('a sacked SMALL-club manager is not courted by the giants', () => {
    // Regression: a manager fired from the weakest club must not be offered the
    // strongest clubs in the world (the old fallback grabbed them by reputation).
    const small = [...clubIds].sort((a, b) => world.clubs[a].reputation - world.clubs[b].reputation)[0];
    const rep = initialManagerReputation(world.clubs[small]) - 6; // knocked down by the sacking
    const reps = clubIds.map((id) => world.clubs[id].reputation).sort((a, b) => b - a);
    const topRep = reps[0];
    // Both the normal (empty-standings) and the emergency path.
    const gen = generateJobOffers(rep, small, world.clubs, world.competitions, {}, new Rng(4), true, 0);
    const fb = fallbackJobOffers(rep, small, world.clubs, world.competitions, new Rng(4), 0);
    for (const o of [...gen, ...fb]) {
      expect(o.clubReputation).toBeLessThan(topRep - 6); // never the elite
    }
    expect(fb.length).toBeGreaterThan(0); // but the career never dead-ends
  });

  it('a highly-rated manager can be headhunted by bigger clubs', () => {
    // Make several big clubs "underperform" by finishing bottom.
    const order = [...byRep].reverse(); // reputation-inverted table → big clubs finish low (vacancy)
    const offers = generateJobOffers(85, 'nobody', world.clubs, world.competitions, standings(order), new Rng(1), false, 0);
    // At least one offer should exist; headhunting reasons reference stronger clubs.
    expect(offers.length).toBeGreaterThan(0);
  });

  it('is deterministic for a fixed seed', () => {
    const run = () => generateJobOffers(60, clubIds[0], world.clubs, world.competitions, standings(byRep), new Rng(9), false, 0).map((o) => o.clubId).join(',');
    expect(run()).toBe(run());
  });
});

describe('switchClub', () => {
  it('closes the current stint and opens a new one', () => {
    const start = [{ clubId: 'a', clubName: 'A', fromYear: 2024, seasons: 2, trophies: 1 }];
    const next = switchClub(start, world.clubs[clubIds[0]], 2026, 'HEADHUNTED');
    expect(next).toHaveLength(2);
    expect(next[0].toYear).toBe(2026);
    expect(next[0].reasonLeft).toBe('HEADHUNTED');
    expect(next[1].clubId).toBe(clubIds[0]);
    expect(next[1].toYear).toBeUndefined();
  });
});
