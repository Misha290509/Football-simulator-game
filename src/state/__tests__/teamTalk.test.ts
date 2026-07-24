import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { useGameStore } from '../store';
import { createNewGame } from '../../game/newGame';
import { loadDataset } from '../../data/datasetLoader';
import { ENGLAND_DATASET } from '../../data/england';
import { createSave } from '../../db/db';

function managerClubId(): string {
  const world = loadDataset(ENGLAND_DATASET, 77, 2024);
  const comp = Object.values(world.competitions).find((c) => c.tier === 1)!;
  return comp.clubIds[0];
}

async function freshGame() {
  const snap = createNewGame({
    saveName: 'Talk — Test', managerName: 'M', dataset: ENGLAND_DATASET,
    managerClubId: managerClubId(), startYear: 2024, seed: 3,
  });
  await createSave(snap);
  await useGameStore.getState().load(snap.meta.id);
}

describe('pre-match team talks (#48)', () => {
  beforeEach(() => {
    useGameStore.setState({ loaded: false, meta: null, clubs: {}, players: {}, matches: {} });
  });

  it('applies a talk once per fixture and records the matchday', async () => {
    await freshGame();
    const s = () => useGameStore.getState();
    const next = s().managerNextMatch();
    expect(next).toBeTruthy();

    const res = await s().giveTeamTalk('FIRED_UP');
    expect(res.ok).toBe(true);
    expect(s().meta!.lastTeamTalkDay).toBe(next!.day);

    // A second talk before the same fixture is refused.
    const again = await s().giveTeamTalk('CALM');
    expect(again.ok).toBe(false);
  });
});
