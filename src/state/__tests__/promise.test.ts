import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { useGameStore } from '../store';
import { createNewGame } from '../../game/newGame';
import { loadDataset } from '../../data/datasetLoader';
import { ENGLAND_DATASET } from '../../data/england';
import { createSave } from '../../db/db';

function managerClubId(): string {
  const world = loadDataset(ENGLAND_DATASET, 12, 2024);
  const comp = Object.values(world.competitions).find((c) => c.tier === 1)!;
  return comp.clubIds[0];
}

async function freshGame() {
  const snap = createNewGame({
    saveName: 'Promise — Test', managerName: 'M', dataset: ENGLAND_DATASET,
    managerClubId: managerClubId(), startYear: 2024, seed: 8,
  });
  await createSave(snap);
  await useGameStore.getState().load(snap.meta.id);
}

describe('squad promises (#49)', () => {
  beforeEach(() => {
    useGameStore.setState({ loaded: false, meta: null, clubs: {}, players: {}, matches: {} });
  });

  it('records a playing-time promise and buoys the player, once', async () => {
    await freshGame();
    const s = () => useGameStore.getState();
    const mgrId = s().meta!.managerClubId;
    const mine = Object.values(s().players).find((p) => p.contract.clubId === mgrId && !p.loan)!;
    const moraleBefore = mine.morale;

    const res = await s().promisePlayingTime(mine.id);
    expect(res.ok).toBe(true);
    expect(s().players[mine.id].promise).toEqual({ kind: 'PLAYING_TIME', madeYear: expect.any(Number) });
    expect(s().players[mine.id].morale).toBeGreaterThan(moraleBefore);

    // A second promise is rejected.
    const again = await s().promisePlayingTime(mine.id);
    expect(again.ok).toBe(false);
  });

  it('refuses to promise a player who is not yours', async () => {
    await freshGame();
    const s = () => useGameStore.getState();
    const mgrId = s().meta!.managerClubId;
    const other = Object.values(s().players).find((p) => p.contract.clubId && p.contract.clubId !== mgrId)!;
    const res = await s().promisePlayingTime(other.id);
    expect(res.ok).toBe(false);
  });
});
