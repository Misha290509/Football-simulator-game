import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { useGameStore } from '../store';
import { createNewGame } from '../../game/newGame';
import { loadDataset } from '../../data/datasetLoader';
import { ENGLAND_DATASET } from '../../data/england';
import { createSave } from '../../db/db';

function managerClubId(): string {
  const world = loadDataset(ENGLAND_DATASET, 99, 2024);
  const comp = Object.values(world.competitions).find((c) => c.tier === 1)!;
  return comp.clubIds[0];
}

async function freshGame() {
  const snap = createNewGame({
    saveName: 'Familiarity — Test', managerName: 'M', dataset: ENGLAND_DATASET,
    managerClubId: managerClubId(), startYear: 2024, seed: 11,
  });
  await createSave(snap);
  await useGameStore.getState().load(snap.meta.id);
}

describe('Tactical familiarity', () => {
  beforeEach(() => {
    useGameStore.setState({ loaded: false, meta: null, clubs: {}, players: {}, matches: {} });
  });

  it('starts unset (a new club is fully familiar) and drops to the floor on a shape change', async () => {
    await freshGame();
    const s = () => useGameStore.getState();
    const club = () => s().managerClub()!;

    // A brand-new club has no familiarity record → treated as fully familiar.
    expect(club().familiarity).toBeUndefined();

    const before = club().formation;
    const other = before === '4-3-3' ? '4-4-2' : '4-3-3';
    await s().setFormation(other);
    expect(club().familiarity).toEqual({ formation: other, level: expect.any(Number) });
    expect(club().familiarity!.level).toBeGreaterThan(0);
    expect(club().familiarity!.level).toBeLessThan(1);

    // Re-selecting the same shape does not reset the (partial) progress.
    const level = club().familiarity!.level;
    await s().setFormation(other);
    expect(club().familiarity!.level).toBe(level);
  });

  it('climbs toward full fluency as matches are played in the shape', { timeout: 60_000 }, async () => {
    await freshGame();
    const s = () => useGameStore.getState();
    const club = () => s().managerClub()!;

    const other = club().formation === '4-3-3' ? '4-4-2' : '4-3-3';
    await s().setFormation(other);
    const start = club().familiarity!.level;

    // Advance day-by-day until the manager has actually played a few fixtures in
    // the shape; familiarity should rise off the floor (and never exceed 1).
    for (let i = 0; i < 45 && club().familiarity!.level <= start; i++) {
      await s().advanceMatchday();
    }
    const fam = club().familiarity!;
    expect(fam.formation).toBe(other);
    expect(fam.level).toBeGreaterThan(start);
    expect(fam.level).toBeLessThanOrEqual(1);
  });
});
