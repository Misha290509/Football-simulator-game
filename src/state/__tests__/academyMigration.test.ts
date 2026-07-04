import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { useGameStore } from '../store';
import { createNewGame } from '../../game/newGame';
import { loadDataset } from '../../data/datasetLoader';
import { ENGLAND_DATASET } from '../../data/england';
import { db } from '../../db/db';
import { CURRENT_SCHEMA_VERSION } from '../../db/migrations';
import type { Player } from '../../types/player';

function managerClubId(): string {
  const world = loadDataset(ENGLAND_DATASET, 99, 2024);
  return Object.values(world.competitions).find((c) => c.tier === 1)!.clubIds[0];
}

/** Persist a pre-academy (schemaVersion 1) save, mimicking an existing career. */
async function seedV1Save(): Promise<string> {
  const snap = createNewGame({
    saveName: 'Legacy — Save', managerName: 'M', dataset: ENGLAND_DATASET,
    managerClubId: managerClubId(), startYear: 2024, seed: 2024,
  });
  // Downgrade to v1: drop all academy state and the parallel-roster players.
  const meta = { ...snap.meta, schemaVersion: 1 };
  delete (meta as { academies?: unknown }).academies;
  delete (meta as { academyPlayers?: unknown }).academyPlayers;
  delete (meta as { scoutAssignments?: unknown }).scoutAssignments;
  delete (meta as { youthProspects?: unknown }).youthProspects;
  delete (meta as { youthCompetitions?: unknown }).youthCompetitions;
  const players = Object.values(snap.players)
    .filter((p) => !p.academyClubId || p.contract.clubId) // drop parallel-roster academy players
    .map((p) => { const c = structuredClone(p) as Player; delete c.academyClubId; return c; });

  await db.transaction('rw', db.saves, db.clubs, db.players, db.matches, async () => {
    await db.saves.put(meta);
    await db.clubs.bulkPut(Object.values(snap.clubs).map((c) => ({ ...c, saveId: meta.id })));
    await db.players.bulkPut(players.map((p) => ({ ...p, saveId: meta.id })));
    await db.matches.bulkPut(Object.values(snap.matches).map((m) => ({ ...m, saveId: meta.id })));
  });
  return meta.id;
}

describe('Save migration integrity (Phase 8)', () => {
  beforeEach(() => {
    useGameStore.setState({ loaded: false, meta: null, clubs: {}, players: {}, matches: {} });
  });

  it('loads a pre-academy v1 save and migrates it cleanly', async () => {
    const id = await seedV1Save();
    const ok = await useGameStore.getState().load(id);
    expect(ok).toBe(true);
    const st = useGameStore.getState();

    // Migration ran: schema bumped, academies built for every club.
    expect(st.meta!.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(Object.keys(st.meta!.academies ?? {}).length).toBe(Object.keys(st.clubs).length);
    expect(st.meta!.scoutAssignments).toEqual([]);

    // The manager's academy exists with a valid rating + philosophy.
    const academy = st.meta!.academies![st.meta!.managerClubId];
    expect(academy.rating).toBeGreaterThanOrEqual(1);
    expect(academy.rating).toBeLessThanOrEqual(5);
    expect(academy.philosophyId).toBeTruthy();

    // Existing under-19 squad players were enrolled as dual-registered prospects
    // without being removed from the first team. (The v7 top-up also adds fresh
    // academy-only prospects, so restrict the check to the dual-registered set.)
    const aps = Object.values(st.meta!.academyPlayers ?? {}).filter((ap) => ap.dualRegistered);
    expect(aps.length).toBeGreaterThan(0);
    for (const ap of aps) {
      const p = st.players[ap.playerId];
      expect(p).toBeTruthy();
      expect(p.contract.clubId).toBe(ap.clubId);
    }

    // The migration persisted: re-loading is a no-op (already current).
    const ok2 = await useGameStore.getState().load(id);
    expect(ok2).toBe(true);
    expect(useGameStore.getState().meta!.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });
});
