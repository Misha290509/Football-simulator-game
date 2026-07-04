// ---------------------------------------------------------------------------
// Persistence via Dexie/IndexedDB (§4). Clubs, players and matches live in
// indexed tables (keyed by id, filtered by saveId); the save "meta" holds the
// smaller competition/season records. Designed for lossless export/import.
// ---------------------------------------------------------------------------

import Dexie, { type Table } from 'dexie';
import type { Club } from '../types/club';
import type { Player } from '../types/player';
import type { Match } from '../types/match';
import type { SaveGame } from '../types/league';

export type ClubRow = Club & { saveId: string };
export type PlayerRow = Player & { saveId: string };
export type MatchRow = Match & { saveId: string };

export interface SaveMeta extends SaveGame {}

export class GMDatabase extends Dexie {
  saves!: Table<SaveMeta, string>;
  clubsV2!: Table<ClubRow, [string, string]>;
  playersV2!: Table<PlayerRow, [string, string]>;
  matchesV2!: Table<MatchRow, [string, string]>;

  constructor() {
    super('football-gm');
    this.version(2).stores({
      saves: 'id, name, createdAt',
      clubs: 'id, saveId, countryId',
      players: 'id, saveId, [saveId+position]',
      matches: 'id, saveId, [saveId+seasonId], [saveId+seasonId+day]',
    });
    // v3/v4: rows used to be keyed by bare `id`, but most ids are deterministic
    // and identical across saves (real players, academy youth, fixtures, clubs),
    // so a second save silently overwrote the first save's rows. Re-key every
    // world table on [saveId+id] so saves can never collide, copying existing
    // data across (Dexie cannot change a primary key in place).
    this.version(3).stores({
      clubsV2: '[saveId+id], saveId, countryId',
      playersV2: '[saveId+id], saveId',
      matchesV2: '[saveId+id], saveId, [saveId+seasonId], [saveId+seasonId+day]',
    }).upgrade(async (tx) => {
      const [clubRows, playerRows, matchRows] = await Promise.all([
        tx.table('clubs').toArray(), tx.table('players').toArray(), tx.table('matches').toArray(),
      ]);
      await Promise.all([
        tx.table('clubsV2').bulkPut(clubRows),
        tx.table('playersV2').bulkPut(playerRows),
        tx.table('matchesV2').bulkPut(matchRows),
      ]);
    });
    this.version(4).stores({ clubs: null, players: null, matches: null });
  }
}

export const db = new GMDatabase();

export interface WorldSnapshot {
  meta: SaveMeta;
  clubs: Record<string, Club>;
  players: Record<string, Player>;
  matches: Record<string, Match>;
}

function currentSeasonId(meta: SaveMeta): string | null {
  const s = Object.values(meta.seasons).find((x) => x.current);
  return s?.id ?? null;
}

/** Persist a brand-new save and its full world atomically. */
export async function createSave(snapshot: WorldSnapshot): Promise<void> {
  const { meta, clubs, players, matches } = snapshot;
  await db.transaction('rw', db.saves, db.clubsV2, db.playersV2, db.matchesV2, async () => {
    await db.saves.put(meta);
    await db.clubsV2.bulkPut(Object.values(clubs).map((c) => ({ ...c, saveId: meta.id })));
    await db.playersV2.bulkPut(Object.values(players).map((p) => ({ ...p, saveId: meta.id })));
    await db.matchesV2.bulkPut(Object.values(matches).map((m) => ({ ...m, saveId: meta.id })));
  });
}

export async function listSaves(): Promise<SaveMeta[]> {
  return db.saves.orderBy('createdAt').reverse().toArray();
}

/** Load a save with its clubs, players and the *current season's* matches. */
export async function loadSave(saveId: string): Promise<WorldSnapshot | null> {
  const meta = await db.saves.get(saveId);
  if (!meta) return null;
  const seasonId = currentSeasonId(meta);
  const [clubRows, playerRows, matchRows] = await Promise.all([
    db.clubsV2.where('saveId').equals(saveId).toArray(),
    db.playersV2.where('saveId').equals(saveId).toArray(),
    seasonId
      ? db.matchesV2.where('[saveId+seasonId]').equals([saveId, seasonId]).toArray()
      : Promise.resolve([] as MatchRow[]),
  ]);
  const clubs: Record<string, Club> = {};
  const players: Record<string, Player> = {};
  const matches: Record<string, Match> = {};
  for (const { saveId: _s, ...c } of clubRows) clubs[c.id] = c as Club;
  for (const { saveId: _s, ...p } of playerRows) players[p.id] = p as Player;
  for (const { saveId: _s, ...m } of matchRows) matches[m.id] = m as Match;
  return { meta, clubs, players, matches };
}

export async function deleteSave(saveId: string): Promise<void> {
  await db.transaction('rw', db.saves, db.clubsV2, db.playersV2, db.matchesV2, async () => {
    await db.saves.delete(saveId);
    await db.clubsV2.where('saveId').equals(saveId).delete();
    await db.playersV2.where('saveId').equals(saveId).delete();
    await db.matchesV2.where('saveId').equals(saveId).delete();
  });
}

// --- Targeted writes (hot path for the "Play" menu) ---------------------

export async function persistMeta(meta: SaveMeta): Promise<void> {
  await db.saves.put(meta);
}

export async function putMatches(saveId: string, matches: Match[]): Promise<void> {
  if (matches.length === 0) return;
  await db.matchesV2.bulkPut(matches.map((m) => ({ ...m, saveId })));
}

export async function putClubs(saveId: string, clubs: Club[]): Promise<void> {
  if (clubs.length === 0) return;
  await db.clubsV2.bulkPut(clubs.map((c) => ({ ...c, saveId })));
}

export async function putPlayers(saveId: string, players: Player[]): Promise<void> {
  if (players.length === 0) return;
  await db.playersV2.bulkPut(players.map((p) => ({ ...p, saveId })));
}

export async function deletePlayers(saveId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.playersV2.bulkDelete(ids.map((id) => [saveId, id] as [string, string]));
}

/** Full upsert (used by import / God Mode). */
export async function persistWorld(snapshot: WorldSnapshot): Promise<void> {
  await createSave(snapshot);
}

// --- Lossless export / import (§8, §11-M7) ------------------------------

export interface SaveExport {
  format: 'football-gm-save';
  version: number;
  meta: SaveMeta;
  clubs: Club[];
  players: Player[];
  matches: Match[];
}

/** Serialize an entire save (all seasons of history) to a JSON string. */
export async function exportSave(saveId: string): Promise<string | null> {
  const meta = await db.saves.get(saveId);
  if (!meta) return null;
  const [clubRows, playerRows, matchRows] = await Promise.all([
    db.clubsV2.where('saveId').equals(saveId).toArray(),
    db.playersV2.where('saveId').equals(saveId).toArray(),
    db.matchesV2.where('saveId').equals(saveId).toArray(),
  ]);
  const strip = <T extends { saveId: string }>(rows: T[]) =>
    rows.map(({ saveId: _s, ...rest }) => rest);
  const data: SaveExport = {
    format: 'football-gm-save',
    version: 2,
    meta,
    clubs: strip(clubRows) as unknown as Club[],
    players: strip(playerRows) as unknown as Player[],
    matches: strip(matchRows) as unknown as Match[],
  };
  return JSON.stringify(data);
}

/** Import a previously-exported save. Returns the (possibly new) save id. */
export async function importSave(json: string): Promise<string> {
  const data = JSON.parse(json) as SaveExport;
  if (data.format !== 'football-gm-save') throw new Error('Unrecognized save file.');

  // Give the imported career a fresh save id if one already exists.
  const exists = await db.saves.get(data.meta.id);
  const meta: SaveMeta = exists
    ? { ...data.meta, id: `save_import_${Date.now().toString(36)}`, name: `${data.meta.name} (imported)` }
    : data.meta;
  const saveId = meta.id;

  await db.transaction('rw', db.saves, db.clubsV2, db.playersV2, db.matchesV2, async () => {
    await db.saves.put(meta);
    await db.clubsV2.bulkPut(data.clubs.map((c) => ({ ...c, saveId })));
    await db.playersV2.bulkPut(data.players.map((p) => ({ ...p, saveId })));
    await db.matchesV2.bulkPut(data.matches.map((m) => ({ ...m, saveId })));
  });
  return saveId;
}
