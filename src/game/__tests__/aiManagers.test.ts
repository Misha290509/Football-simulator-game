import { describe, it, expect } from 'vitest';
import { loadDataset } from '../../data/datasetLoader';
import { ENGLAND_DATASET } from '../../data/england';
import { aiManagerOf, rolloverAiManagers, recordStyleResult, styleTags } from '../aiManagers';

const world = loadDataset(ENGLAND_DATASET, 21, 2024);
const managerClubId = Object.keys(world.clubs)[0];

describe('Rival managers', () => {
  it('derives a stable default manager per club without storage', () => {
    const clubId = Object.keys(world.clubs)[3];
    const a = aiManagerOf(clubId, world.clubs[clubId], 21);
    const b = aiManagerOf(clubId, world.clubs[clubId], 21);
    expect(a).toEqual(b);
    expect(a.name.split(' ').length).toBeGreaterThanOrEqual(2);
    // Stored churn takes precedence over the derived default.
    const stored = { [clubId]: { name: 'New Boss', reputation: 60, appointedYear: 2025, titles: 0 } };
    expect(aiManagerOf(clubId, world.clubs[clubId], 21, stored).name).toBe('New Boss');
  });

  it('sacks strugglers and rewards champions at rollover', () => {
    const comp = Object.values(world.competitions)[0];
    const rows = comp.clubIds.map((clubId, i) => ({
      clubId, played: 38, won: 20 - i, drawn: 0, lost: 18 + i, goalsFor: 40, goalsAgainst: 40, gd: 0, points: Math.max(6, 60 - i * 3),
    }));
    const res = rolloverAiManagers(undefined, world.clubs, { [comp.id]: rows }, managerClubId, 2025, 21);
    const champ = res.managers[rows[0].clubId];
    if (rows[0].clubId !== managerClubId) {
      expect(champ.titles).toBe(1);
    }
    // Determinism.
    const res2 = rolloverAiManagers(undefined, world.clubs, { [comp.id]: rows }, managerClubId, 2025, 21);
    expect(res.managers).toEqual(res2.managers);
  });
});

describe('Manager tactical identity', () => {
  it('accumulates wins per tactic and resolves into a style tag', () => {
    let c: Record<string, number> | undefined;
    for (let i = 0; i < 25; i++) c = recordStyleResult(c, { defensive: 'BALANCED', offensive: 'COUNTER' }, true);
    expect(styleTags(c)).toContain('Counter-attacking specialist');
  });

  it('gives no tags before a body of work exists', () => {
    let c: Record<string, number> | undefined;
    for (let i = 0; i < 5; i++) c = recordStyleResult(c, { offensive: 'COUNTER' }, true);
    expect(styleTags(c)).toEqual([]);
  });
});
