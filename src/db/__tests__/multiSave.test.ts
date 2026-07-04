import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { createSave, loadSave, type WorldSnapshot } from '../db';
import type { SaveMeta } from '../db';

// Most ids in a generated world are deterministic (real players, academy youth,
// fixtures, clubs), so they are IDENTICAL across saves. These tests pin the
// [saveId+id] re-key: multiple saves must never clobber each other's rows.

function tinyWorld(saveId: string, marker: number): WorldSnapshot {
  const meta = {
    id: saveId, name: saveId, seed: marker, createdAt: marker, schemaVersion: 7,
    managerClubId: 'club_X', managerName: 'M', currentDay: 0, startYear: 2025,
    competitions: {}, seasons: { s1: { id: 's1', year: 2025, label: '2025/26', current: true } }, news: [],
  } as unknown as SaveMeta;
  return {
    meta,
    // Same ids in every save — only `marker` (reputation/overall/day) differs.
    clubs: { club_X: { id: 'club_X', name: `Club ${marker}`, reputation: marker } as never },
    players: { p_1: { id: 'p_1', name: { first: 'A', last: `P${marker}` }, overall: marker } as never },
    matches: { m_1: { id: 'm_1', seasonId: 's1', day: marker, played: false } as never },
  };
}

describe('Multi-save isolation ([saveId+id] keys)', () => {
  it('two saves sharing every id keep separate rows', async () => {
    await createSave(tinyWorld('save_A', 11));
    await createSave(tinyWorld('save_B', 22)); // would clobber save_A under bare-id keys

    const a = await loadSave('save_A');
    const b = await loadSave('save_B');
    expect(a?.players.p_1.overall).toBe(11);
    expect(b?.players.p_1.overall).toBe(22);
    expect(a?.clubs.club_X.reputation).toBe(11);
    expect(b?.clubs.club_X.reputation).toBe(22);
    expect(a?.matches.m_1.day).toBe(11);
    expect(b?.matches.m_1.day).toBe(22);
  });

  it('upgrades a legacy bare-id database without losing rows', async () => {
    // Build a v2-schema database under a distinct name, as an old install had.
    const name = 'football-gm-upgrade-test';
    const legacy = new Dexie(name);
    legacy.version(2).stores({
      saves: 'id, name, createdAt',
      clubs: 'id, saveId, countryId',
      players: 'id, saveId, [saveId+position]',
      matches: 'id, saveId, [saveId+seasonId], [saveId+seasonId+day]',
    });
    await legacy.open();
    const old = tinyWorld('save_old', 7);
    await legacy.table('saves').put(old.meta);
    await legacy.table('clubs').put({ ...old.clubs.club_X, saveId: 'save_old' });
    await legacy.table('players').put({ ...old.players.p_1, saveId: 'save_old' });
    await legacy.table('matches').put({ ...old.matches.m_1, saveId: 'save_old' });
    legacy.close();

    // Re-open with the current schema (v3 copy + v4 drop) and read it back.
    // (GMDatabase hardcodes its db name, so mirror its version chain against
    // the legacy-named database — same declarations as src/db/db.ts.)
    const modern = new Dexie(name);
    modern.version(2).stores({
      saves: 'id, name, createdAt',
      clubs: 'id, saveId, countryId',
      players: 'id, saveId, [saveId+position]',
      matches: 'id, saveId, [saveId+seasonId], [saveId+seasonId+day]',
    });
    modern.version(3).stores({
      clubsV2: '[saveId+id], saveId, countryId',
      playersV2: '[saveId+id], saveId',
      matchesV2: '[saveId+id], saveId, [saveId+seasonId], [saveId+seasonId+day]',
    }).upgrade(async (tx) => {
      const [c, p, m] = await Promise.all([
        tx.table('clubs').toArray(), tx.table('players').toArray(), tx.table('matches').toArray(),
      ]);
      await Promise.all([
        tx.table('clubsV2').bulkPut(c), tx.table('playersV2').bulkPut(p), tx.table('matchesV2').bulkPut(m),
      ]);
    });
    modern.version(4).stores({ clubs: null, players: null, matches: null });
    await modern.open();

    const players = await modern.table('playersV2').where('saveId').equals('save_old').toArray();
    const clubs = await modern.table('clubsV2').where('saveId').equals('save_old').toArray();
    const matches = await modern.table('matchesV2').where('saveId').equals('save_old').toArray();
    expect(players).toHaveLength(1);
    expect(players[0].overall).toBe(7);
    expect(clubs).toHaveLength(1);
    expect(matches).toHaveLength(1);
    modern.close();
  });
});
