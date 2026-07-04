import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { useGameStore } from '../store';
import { createNewGame } from '../../game/newGame';
import { loadDataset } from '../../data/datasetLoader';
import { ENGLAND_DATASET } from '../../data/england';
import { createSave } from '../../db/db';

// A real top-tier club id for the manager.
function managerClubId(): string {
  const world = loadDataset(ENGLAND_DATASET, 99, 2024);
  const comp = Object.values(world.competitions).find((c) => c.tier === 1)!;
  return comp.clubIds[0];
}

async function freshGame() {
  const snap = createNewGame({
    saveName: 'T — Test', managerName: 'M', dataset: ENGLAND_DATASET,
    managerClubId: managerClubId(), startYear: 2024, seed: 99,
  });
  await createSave(snap);
  await useGameStore.getState().load(snap.meta.id);
  return useGameStore.getState();
}

describe('Academy promotion / demotion / dual-registration (Phase 3)', () => {
  beforeEach(() => {
    useGameStore.setState({ loaded: false, meta: null, clubs: {}, players: {}, matches: {} });
  });

  it('promotes an academy prospect to the first team', async () => {
    const s = await freshGame();
    const clubId = s.meta!.managerClubId;
    const apId = Object.values(s.meta!.academyPlayers ?? {}).find((a) => a.clubId === clubId)!.playerId;
    const res = await useGameStore.getState().promoteToFirstTeam(apId, 'PROSPECT');
    expect(res.ok).toBe(true);
    const st = useGameStore.getState();
    expect(st.players[apId].contract.clubId).toBe(clubId);
    expect(st.players[apId].academyClubId).toBeUndefined();
    expect(st.meta!.academyPlayers?.[apId]).toBeUndefined();
    expect(st.clubs[clubId].playerIds).toContain(apId);
  });

  it('dual-registers and then returns to academy-only', async () => {
    const s = await freshGame();
    const clubId = s.meta!.managerClubId;
    const apId = Object.values(s.meta!.academyPlayers ?? {}).find((a) => a.clubId === clubId)!.playerId;
    expect((await useGameStore.getState().dualRegister(apId, true)).ok).toBe(true);
    let st = useGameStore.getState();
    expect(st.players[apId].contract.clubId).toBe(clubId);
    expect(st.players[apId].academyClubId).toBe(clubId);
    expect(st.meta!.academyPlayers?.[apId].dualRegistered).toBe(true);

    expect((await useGameStore.getState().dualRegister(apId, false)).ok).toBe(true);
    st = useGameStore.getState();
    expect(st.players[apId].contract.clubId).toBeNull();
    expect(st.meta!.academyPlayers?.[apId].dualRegistered).toBe(false);
  }, 20_000);

  it('blocks demotion of a player older than 18', async () => {
    const s = await freshGame();
    const clubId = s.meta!.managerClubId;
    const year = 2024;
    const senior = Object.values(s.players).find((p) => p.contract.clubId === clubId && year - p.born.year > 18)!;
    const res = await useGameStore.getState().demoteToAcademy(senior.id);
    expect(res.ok).toBe(false);
    expect(useGameStore.getState().players[senior.id].academyClubId).toBeUndefined();
  }, 20_000);

  it('allows demotion of an under-19 first-teamer', async () => {
    const s = await freshGame();
    const clubId = s.meta!.managerClubId;
    // Promote a prospect first so there's an under-19 in the first team.
    const apId = Object.values(s.meta!.academyPlayers ?? {}).find((a) => a.clubId === clubId && 2024 - s.players[a.playerId].born.year <= 18)?.playerId;
    if (!apId) return; // nothing eligible in this seed; skip
    await useGameStore.getState().promoteToFirstTeam(apId);
    const res = await useGameStore.getState().demoteToAcademy(apId);
    expect(res.ok).toBe(true);
    const st = useGameStore.getState();
    expect(st.players[apId].contract.clubId).toBeNull();
    expect(st.players[apId].academyClubId).toBe(clubId);
    expect(st.meta!.academyPlayers?.[apId]).toBeTruthy();
  }, 20_000);
});
