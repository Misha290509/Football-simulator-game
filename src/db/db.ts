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
  clubs!: Table<ClubRow, string>;
  players!: Table<PlayerRow, string>;
  matches!: Table<MatchRow, string>;

  constructor() {
    super('football-gm');
    this.version(2).stores({
      saves: 'id, name, createdAt',
      clubs: 'id, saveId, countryId',
      players: 'id, saveId, [saveId+position]',
      matches: 'id, saveId, [saveId+seasonId], [saveId+seasonId+day]',
    });
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
  await db.transaction('rw', db.saves, db.clubs, db.players, db.matches, async () => {
    await db.saves.put(meta);
    await db.clubs.bulkPut(Object.values(clubs).map((c) => ({ ...c, saveId: meta.id })));
    await db.players.bulkPut(Object.values(players).map((p) => ({ ...p, saveId: meta.id })));
    await db.matches.bulkPut(Object.values(matches).map((m) => ({ ...m, saveId: meta.id })));
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
    db.clubs.where('saveId').equals(saveId).toArray(),
    db.players.where('saveId').equals(saveId).toArray(),
    seasonId
      ? db.matches.where('[saveId+seasonId]').equals([saveId, seasonId]).toArray()
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
  await db.transaction('rw', db.saves, db.clubs, db.players, db.matches, async () => {
    await db.saves.delete(saveId);
    await db.clubs.where('saveId').equals(saveId).delete();
    await db.players.where('saveId').equals(saveId).delete();
    await db.matches.where('saveId').equals(saveId).delete();
  });
}

// --- Targeted writes (hot path for the "Play" menu) ---------------------

export async function persistMeta(meta: SaveMeta): Promise<void> {
  await db.saves.put(meta);
}

export async function putMatches(saveId: string, matches: Match[]): Promise<void> {
  if (matches.length === 0) return;
  await db.matches.bulkPut(matches.map((m) => ({ ...m, saveId })));
}

export async function putClubs(saveId: string, clubs: Club[]): Promise<void> {
  if (clubs.length === 0) return;
  await db.clubs.bulkPut(clubs.map((c) => ({ ...c, saveId })));
}

export async function putPlayers(saveId: string, players: Player[]): Promise<void> {
  if (players.length === 0) return;
  await db.players.bulkPut(players.map((p) => ({ ...p, saveId })));
}

export async function deletePlayers(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.players.bulkDelete(ids);
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
    db.clubs.where('saveId').equals(saveId).toArray(),
    db.players.where('saveId').equals(saveId).toArray(),
    db.matches.where('saveId').equals(saveId).toArray(),
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

  await db.transaction('rw', db.saves, db.clubs, db.players, db.matches, async () => {
    await db.saves.put(meta);
    await db.clubs.bulkPut(data.clubs.map((c) => ({ ...c, saveId })));
    await db.players.bulkPut(data.players.map((p) => ({ ...p, saveId })));
    await db.matches.bulkPut(data.matches.map((m) => ({ ...m, saveId })));
  });
  return saveId;
}
