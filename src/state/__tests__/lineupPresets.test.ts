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
    saveName: 'Presets — Test', managerName: 'M', dataset: ENGLAND_DATASET,
    managerClubId: managerClubId(), startYear: 2024, seed: 7,
  });
  await createSave(snap);
  await useGameStore.getState().load(snap.meta.id);
}

describe('Lineup presets', () => {
  beforeEach(() => {
    useGameStore.setState({ loaded: false, meta: null, clubs: {}, players: {}, matches: {} });
  });

  it('switches back and forth between two team sheets repeatedly', async () => {
    await freshGame();
    const s = () => useGameStore.getState();
    const club = () => s().managerClub()!;

    // Sheet AA on 4-3-3, sheet BB on 4-4-2 — distinct formations + XIs.
    await s().setFormation('4-3-3');
    await s().autoFillLineup();
    await s().saveLineupPreset('AA');
    await s().setFormation('4-4-2');
    await s().autoFillLineup();
    await s().saveLineupPreset('BB');

    const presets = club().lineupPresets ?? [];
    expect(presets.map((p) => p.name)).toEqual(['AA', 'BB']);
    expect(presets[0].formation).toBe('4-3-3');
    expect(presets[1].formation).toBe('4-4-2');
    // The two sheets must actually differ, or "switching" is meaningless.
    expect(presets[0].lineup).not.toEqual(presets[1].lineup);

    // Switch A → B → A → B → A and confirm the club follows every time.
    const seen: string[] = [];
    for (const i of [0, 1, 0, 1, 0]) {
      await s().applyLineupPreset(i);
      seen.push(club().formation);
    }
    expect(seen).toEqual(['4-3-3', '4-4-2', '4-3-3', '4-4-2', '4-3-3']);

    // And the concrete XI must match the preset each time, not stick.
    await s().applyLineupPreset(0);
    expect(club().lineup).toEqual(presets[0].lineup);
    await s().applyLineupPreset(1);
    expect(club().lineup).toEqual(presets[1].lineup);
  });
});
