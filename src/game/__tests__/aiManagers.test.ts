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

  it('appoints retired legends into the dugout when a job opens (§ #52)', () => {
    const comp = Object.values(world.competitions)[0];
    const rows = comp.clubIds.map((clubId, i) => ({
      clubId, played: 38, won: 20 - i, drawn: 0, lost: 18 + i, goalsFor: 40, goalsAgainst: 40, gd: 0, points: Math.max(6, 60 - i * 3),
    }));
    // A pool of decorated retirees, all with a recognisable name.
    const legendPool = Array.from({ length: 8 }, (_, i) => ({ name: `Legend ${String.fromCharCode(65 + i)}`, peakOvr: 90 }));
    let appointedLegend = false;
    for (let seed = 1; seed < 40 && !appointedLegend; seed++) {
      const res = rolloverAiManagers(undefined, world.clubs, { [comp.id]: rows }, managerClubId, 2025, seed, legendPool);
      const legends = Object.values(res.managers).filter((m) => m.formerPlayer);
      if (legends.length > 0) {
        appointedLegend = true;
        // A legend's reputation is seeded from his playing peak, well above a nobody.
        expect(legends[0].reputation).toBeGreaterThan(50);
        expect(legends[0].name).toMatch(/^Legend /);
        expect(res.news.some((n) => /appoint/i.test(n.title))).toBe(true);
      }
    }
    expect(appointedLegend).toBe(true);
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
