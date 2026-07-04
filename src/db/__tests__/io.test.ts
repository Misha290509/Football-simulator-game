import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { createSave, exportSave, importSave, loadSave } from '../db';
import { createNewGame } from '../../game/newGame';
import { ENGLAND_DATASET } from '../../data/england';

describe('Save export / import', () => {
  it('round-trips a save losslessly', async () => {
    const snap = createNewGame({
      saveName: 'RT', managerName: 'X', dataset: ENGLAND_DATASET,
      managerClubId: 'club_GB_ARS', startYear: 2024, seed: 1,
    });
    await createSave(snap);

    const json = await exportSave(snap.meta.id);
    expect(json).toBeTruthy();

    const newId = await importSave(json!);
    const loaded = await loadSave(newId);
    expect(loaded).toBeTruthy();
    expect(Object.keys(loaded!.clubs).length).toBe(Object.keys(snap.clubs).length);
    expect(Object.keys(loaded!.players).length).toBe(Object.keys(snap.players).length);
    // Current-season matches reload (history matches live in other seasons).
    expect(Object.keys(loaded!.matches).length).toBe(Object.keys(snap.matches).length);
    // Imported careers get a fresh id to avoid clobbering the original.
    expect(newId).not.toBe(snap.meta.id);
  }, 30_000);

  it('rejects a non-save file', async () => {
    await expect(importSave('{"hello":true}')).rejects.toThrow();
  });
});
