import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { useGameStore } from '../store';
import { createNewGame } from '../../game/newGame';
import { loadDataset } from '../../data/datasetLoader';
import { ENGLAND_DATASET } from '../../data/england';
import { createSave, persistMeta } from '../../db/db';
import { migrateSave, CURRENT_SCHEMA_VERSION } from '../../db/migrations';
import { careerModeOf, isPlayerCareer, playerCareerOf } from '../../game/playerCareer';
import type { PlayerCareer } from '../../types/playerCareer';
import type { SaveMeta } from '../../db/db';

function managerClubId(): string {
  const world = loadDataset(ENGLAND_DATASET, 99, 2024);
  const comp = Object.values(world.competitions).find((c) => c.tier === 1)!;
  return comp.clubIds[0];
}

async function freshGame() {
  const snap = createNewGame({
    saveName: 'Player Career — Test', managerName: 'M', dataset: ENGLAND_DATASET,
    managerClubId: managerClubId(), startYear: 2024, seed: 7,
  });
  await createSave(snap);
  await useGameStore.getState().load(snap.meta.id);
  return snap;
}

describe('Player Career — schema, migration & plumbing (Tier 1 · Step 1)', () => {
  beforeEach(() => {
    useGameStore.setState({ loaded: false, meta: null, clubs: {}, players: {}, matches: {} });
  });

  it('backfills careerMode = MANAGER on an old save and bumps the schema', () => {
    // A pre-Player-Career save (schemaVersion 7, no careerMode field).
    const legacy = { schemaVersion: 7, seed: 1, startYear: 2024, seasons: {} } as unknown as SaveMeta;
    const res = migrateSave(legacy, {}, {});
    expect(res.changed).toBe(true);
    expect(res.meta.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(res.meta.careerMode).toBe('MANAGER');
    expect(res.meta.playerCareer).toBeUndefined();
    // Helpers agree.
    expect(careerModeOf(res.meta)).toBe('MANAGER');
    expect(isPlayerCareer(res.meta)).toBe(false);
    expect(playerCareerOf(res.meta)).toBeNull();
  });

  it('leaves an explicit PLAYER careerMode untouched when migrating', () => {
    const already = { schemaVersion: 7, seed: 1, startYear: 2024, seasons: {}, careerMode: 'PLAYER' } as unknown as SaveMeta;
    const res = migrateSave(already, {}, {});
    expect(res.meta.careerMode).toBe('PLAYER');
  });

  it('new games default to MANAGER and carry the current schema version', async () => {
    await freshGame();
    const meta = useGameStore.getState().meta!;
    expect(meta.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(careerModeOf(meta)).toBe('MANAGER');
    expect(isPlayerCareer(meta)).toBe(false);
  });

  it('persists a PLAYER careerMode + playerCareer block through save/load', async () => {
    const snap = await freshGame();
    const s = () => useGameStore.getState();
    // Pick any real player as a stand-in avatar.
    const avatarId = Object.keys(s().players)[0];

    const career: PlayerCareer = {
      playerId: avatarId, origin: 'ACADEMY', archetype: 'Academy Graduate',
      managerTrust: 40, status: 'YOUTH', clubRelationship: 50, fanRating: 50, following: 0,
      seasonGoals: 0, seasonApps: 0, seasonAvgRating: 0,
      objectives: [], traits: [],
      personality: { professionalism: 60, ambition: 70, loyalty: 55, temperament: 50 },
      sponsorships: [], international: { capped: false, caps: 0, intlGoals: 0 },
      milestones: [{ day: 0, text: 'Joined the academy.' }], seasonHistory: [],
    };
    const newMeta: SaveMeta = { ...s().meta!, careerMode: 'PLAYER', playerCareer: career };
    useGameStore.setState({ meta: newMeta });
    await persistMeta(newMeta); // meta blob carries playerCareer

    // Reload from the database — migration runs on load and must preserve it.
    useGameStore.setState({ loaded: false, meta: null, clubs: {}, players: {}, matches: {} });
    const ok = await s().load(snap.meta.id);
    expect(ok).toBe(true);

    const loaded = s().meta!;
    expect(careerModeOf(loaded)).toBe('PLAYER');
    expect(isPlayerCareer(loaded)).toBe(true);
    const pc = playerCareerOf(loaded)!;
    expect(pc).not.toBeNull();
    expect(pc.playerId).toBe(avatarId);
    expect(pc.origin).toBe('ACADEMY');
    expect(pc.status).toBe('YOUTH');
    expect(pc.milestones[0].text).toBe('Joined the academy.');
  });
});
