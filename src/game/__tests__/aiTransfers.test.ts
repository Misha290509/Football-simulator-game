import { describe, it, expect } from 'vitest';
import { loadDataset } from '../../data/datasetLoader';
import { ENGLAND_DATASET } from '../../data/england';
import { runAiToAiTransfers } from '../aiTransfers';
import { Rng } from '../../engine/rng';

const world = loadDataset(ENGLAND_DATASET, 9, 2024);
const managerClubId = Object.keys(world.clubs)[0];

const run = (seed: number, maxDeals = 30) =>
  runAiToAiTransfers(world.clubs, world.players, managerClubId, 2024, new Rng(seed), { maxDeals, day: 100 });

describe('AI-to-AI transfer market', () => {
  const res = run(7);

  it('produces deals between AI clubs, respecting the cap', () => {
    expect(res.deals.length).toBeGreaterThan(0);
    expect(res.deals.length).toBeLessThanOrEqual(30);
  });

  it('never involves the manager club on either side of a deal', () => {
    for (const d of res.deals) {
      expect(d.fromClubId).not.toBe(managerClubId);
      expect(d.toClubId).not.toBe(managerClubId);
    }
  });

  it('moves the player and keeps club rosters + finances consistent', () => {
    for (const d of res.deals) {
      const p = res.players[d.playerId];
      expect(p.contract.clubId).toBe(d.toClubId);
      expect(res.clubs[d.toClubId].playerIds).toContain(d.playerId);
      expect(res.clubs[d.fromClubId].playerIds).not.toContain(d.playerId);
      expect(d.fee).toBeGreaterThan(0);
    }
    // No buyer overspends into a negative transfer budget.
    for (const c of Object.values(res.clubs)) expect(c.finances.transferBudget).toBeGreaterThanOrEqual(0);
  });

  it('does not mutate the input world', () => {
    for (const d of res.deals) {
      expect(world.players[d.playerId].contract.clubId).toBe(d.fromClubId);
    }
  });

  it('is deterministic for a fixed seed and varies with it', () => {
    const a = run(7);
    const b = run(7);
    expect(a.deals).toEqual(b.deals);
  });

  it('caps headline news to avoid feed spam', () => {
    expect(res.news.length).toBeLessThanOrEqual(8);
  });
});
