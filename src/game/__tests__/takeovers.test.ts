import { describe, it, expect } from 'vitest';
import { processTakeovers } from '../takeovers';
import { loadDataset } from '../../data/datasetLoader';
import { ENGLAND_DATASET } from '../../data/england';
import { Rng } from '../../engine/rng';
import type { Club } from '../../types/club';

function world(): Record<string, Club> {
  const w = loadDataset(ENGLAND_DATASET, 3, 2024);
  return w.clubs;
}

describe('club takeovers (#38)', () => {
  it('is deterministic for a given seed', () => {
    const a = processTakeovers(world(), 'none', 2025, 100, new Rng(42));
    const b = processTakeovers(world(), 'none', 2025, 100, new Rng(42));
    expect(a.changed.map((c) => c.id + c.finances.balance)).toEqual(b.changed.map((c) => c.id + c.finances.balance));
  });

  it('a takeover injects cash, raises reputation and tags the owner', () => {
    const clubs = world();
    // Find a seed that produces at least one new takeover.
    let res = processTakeovers(clubs, 'none', 2025, 100, new Rng(1));
    for (let s = 1; s < 50 && !res.changed.some((c) => c.owner); s++) res = processTakeovers(clubs, 'none', 2025, 100, new Rng(s));
    const taken = res.changed.find((c) => c.owner)!;
    expect(taken).toBeTruthy();
    const before = clubs[taken.id];
    expect(taken.finances.balance).toBeGreaterThan(before.finances.balance);
    expect(taken.finances.transferBudget).toBeGreaterThan(before.finances.transferBudget);
    expect(taken.reputation).toBeGreaterThan(before.reputation);
    expect(['RICH', 'SUPER_RICH']).toContain(taken.owner!.wealth);
    expect(res.news.some((n) => /Takeover/.test(n.title))).toBe(true);
  });

  it('only takes over mid-tier clubs (not the elite) and never mutates the input', () => {
    const clubs = world();
    const snapshot = Object.fromEntries(Object.values(clubs).map((c) => [c.id, c.finances.balance]));
    for (let s = 0; s < 30; s++) {
      const res = processTakeovers(clubs, 'none', 2025, 100, new Rng(s));
      for (const c of res.changed) {
        if (c.owner && c.owner.since === 2025) {
          // Candidate reputations were 45–82 before the +rep bump.
          expect(clubs[c.id].reputation).toBeLessThanOrEqual(82);
        }
      }
    }
    // Input clubs untouched.
    for (const c of Object.values(clubs)) expect(c.finances.balance).toBe(snapshot[c.id]);
  });

  it('tops up clubs that already have a wealthy owner', () => {
    const clubs = world();
    const anyId = Object.keys(clubs)[0];
    clubs[anyId] = { ...clubs[anyId], owner: { wealth: 'SUPER_RICH', since: 2020 } };
    const before = clubs[anyId].finances.balance;
    const res = processTakeovers(clubs, 'none', 2025, 100, new Rng(7));
    const topped = res.changed.find((c) => c.id === anyId)!;
    expect(topped.finances.balance).toBeGreaterThan(before);
  });
});
