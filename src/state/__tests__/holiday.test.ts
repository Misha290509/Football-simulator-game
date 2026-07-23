import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { useGameStore } from '../store';
import { createNewGame } from '../../game/newGame';
import { loadDataset } from '../../data/datasetLoader';
import { ENGLAND_DATASET } from '../../data/england';
import { createSave } from '../../db/db';

function managerClubId(): string {
  const world = loadDataset(ENGLAND_DATASET, 88, 2024);
  const comp = Object.values(world.competitions).find((c) => c.tier === 1)!;
  return comp.clubIds[0];
}

async function freshGame() {
  const snap = createNewGame({
    saveName: 'Holiday — Test', managerName: 'M', dataset: ENGLAND_DATASET,
    managerClubId: managerClubId(), startYear: 2024, seed: 2,
  });
  await createSave(snap);
  await useGameStore.getState().load(snap.meta.id);
}

// The heavy multi-season path is covered by the simToSeasonEnd / startNextSeason
// tests; here we verify holiday's own control flow (guards + idle state) cheaply.
describe('auto-play / holiday (#56)', () => {
  beforeEach(() => {
    useGameStore.setState({ loaded: false, meta: null, clubs: {}, players: {}, matches: {} });
  });

  it('is a no-op for zero seasons and leaves the sim idle', async () => {
    await freshGame();
    const s = () => useGameStore.getState();
    const year = s().currentSeason()?.year;
    await s().holiday(0);
    expect(s().currentSeason()?.year).toBe(year);
    expect(s().simming).toBe(false);
  });

  it('does nothing (and never starts simming) when the manager is sacked', async () => {
    await freshGame();
    const s = () => useGameStore.getState();
    useGameStore.setState((st) => ({ meta: { ...st.meta!, sacked: true } }));
    const year = s().currentSeason()?.year;
    await s().holiday(3);
    expect(s().currentSeason()?.year).toBe(year);
    expect(s().simming).toBe(false);
  });
});
