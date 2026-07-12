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
    saveName: 'To Next Match — Test', managerName: 'M', dataset: ENGLAND_DATASET,
    managerClubId: managerClubId(), startYear: 2024, seed: 7,
  });
  await createSave(snap);
  await useGameStore.getState().load(snap.meta.id);
}

describe('To Next Match', () => {
  beforeEach(() => {
    useGameStore.setState({ loaded: false, meta: null, clubs: {}, players: {}, matches: {} });
  });

  it('makes progress on every press instead of stalling on the match day', async () => {
    await freshGame();
    const s = () => useGameStore.getState();
    const played = () => s().currentSeasonMatches().filter((m) =>
      m.played && !m.neutral && (m.homeClubId === s().meta!.managerClubId || m.awayClubId === s().meta!.managerClubId)).length;

    // First press skips ahead and stops AT the opener, unplayed (so it can be watched).
    await s().simToNextManagerMatch();
    const arrivedDay = s().meta!.currentDay;
    const next1 = s().managerNextMatch();
    expect(next1).not.toBeNull();
    expect(next1!.day).toBe(arrivedDay); // standing on the fixture
    expect(next1!.played).toBe(false);
    expect(played()).toBe(0); // nothing simmed yet — it's watchable

    // Pressing again while standing on the (unplayed) match must NOT no-op: it
    // sims that match and carries on to the next fixture.
    await s().simToNextManagerMatch();
    expect(s().meta!.currentDay).toBeGreaterThan(arrivedDay);
    expect(played()).toBe(1);
    const next2 = s().managerNextMatch();
    expect(next2).not.toBeNull();
    expect(next2!.day).toBeGreaterThan(arrivedDay);

    // A few more presses keep advancing, one match at a time.
    for (let i = 2; i <= 4; i++) {
      const day = s().meta!.currentDay;
      await s().simToNextManagerMatch();
      expect(s().meta!.currentDay).toBeGreaterThan(day);
      expect(played()).toBe(i);
    }
  }, 180_000);
});
