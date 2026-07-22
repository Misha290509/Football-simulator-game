import { describe, it, expect } from 'vitest';
import { ENGLAND_DATASET } from '../../data/england';
import { loadDataset } from '../../data/datasetLoader';
import { createPlayerCareerGame, buildPlayerWorld, careerModeOf, playerCareerOf } from '../playerCareer';
import { buildLineupProfile } from '../../engine/lineup';

function aClubId(): string {
  const world = loadDataset(ENGLAND_DATASET, 99, 2025);
  const comp = Object.values(world.competitions).find((c) => c.tier === 1)!;
  return comp.clubIds[0];
}

describe('Player Career — new-game Player path (Tier 1 · Step 2)', () => {
  it('creates a PLAYER save with a registered, selectable avatar', () => {
    const clubId = aClubId();
    const snap = createPlayerCareerGame({
      saveName: 'Alex Hunter — TEST', dataset: ENGLAND_DATASET, clubId,
      startYear: 2025, seed: 123, origin: 'CREATED',
      playerName: { first: 'Alex', last: 'Hunter' }, position: 'ST', preferredFoot: 'R',
      archetype: 'Prodigy',
    });

    // Mode + career block.
    expect(careerModeOf(snap.meta)).toBe('PLAYER');
    const career = playerCareerOf(snap.meta)!;
    expect(career).not.toBeNull();
    expect(career.archetype).toBe('Prodigy');
    expect(career.origin).toBe('CREATED');
    expect(career.status).toBe('YOUTH');

    // Avatar exists, is named, young, and first-team registered at the club.
    const avatar = snap.players[career.playerId];
    expect(avatar).toBeTruthy();
    expect(avatar.name).toEqual({ first: 'Alex', last: 'Hunter' });
    expect(avatar.position).toBe('ST');
    expect(avatar.contract.clubId).toBe(clubId);
    expect(avatar.academyClubId).toBe(clubId); // dual-registered backstory
    const age = 2025 - avatar.born.year;
    expect(age).toBeGreaterThanOrEqual(16);
    expect(age).toBeLessThanOrEqual(18);

    // Crucially: the existing selection engine can actually see the avatar —
    // he's in the club's player pool that buildLineupProfile draws from.
    const squad = Object.values(snap.players).filter((p) => p.contract.clubId === clubId);
    expect(squad.some((p) => p.id === avatar.id)).toBe(true);
    const profile = buildLineupProfile(clubId, squad, snap.clubs[clubId].formation ?? '4-3-3', { autoMode: true });
    expect(profile.starters.length).toBe(11);
    // (He won't necessarily start as a 16-yo prospect — that battle is Step 3 —
    //  but he must be a candidate the engine considers, i.e. in the pool.)
  });

  it('is deterministic under a fixed seed', () => {
    const clubId = aClubId();
    const cfg = {
      saveName: 'Det — TEST', dataset: ENGLAND_DATASET, clubId, startYear: 2025, seed: 999,
      origin: 'CREATED' as const, playerName: { first: 'Sam', last: 'Reed' }, position: 'CM' as const, archetype: 'Late Bloomer',
    };
    const a = createPlayerCareerGame(cfg);
    const b = createPlayerCareerGame(cfg);
    const av = a.players[playerCareerOf(a.meta)!.playerId];
    const bv = b.players[playerCareerOf(b.meta)!.playerId];
    expect(`${av.overall}:${av.potential}:${av.born.year}`).toBe(`${bv.overall}:${bv.potential}:${bv.born.year}`);
  });

  it('inherits an existing first-team player when origin is EXISTING (pre-built world)', () => {
    const clubId = aClubId();
    // The real inherit flow: build the world once, let the user pick a real id
    // from it, then attach the career to that same world.
    const world = buildPlayerWorld({ saveName: 'Inherit — TEST', dataset: ENGLAND_DATASET, clubId, startYear: 2025, seed: 5 });
    const existingId = Object.values(world.players).find((p) => p.contract.clubId === clubId)!.id;

    const snap = createPlayerCareerGame({
      saveName: 'Inherit — TEST', dataset: ENGLAND_DATASET, clubId, startYear: 2025, seed: 5,
      origin: 'EXISTING', existingPlayerId: existingId, prebuiltWorld: world,
    });
    const career = playerCareerOf(snap.meta)!;
    expect(career.playerId).toBe(existingId);
    expect(snap.players[existingId].contract.clubId).toBe(clubId);
  });

  it('rejects inheriting a player who is not at the chosen club', () => {
    const clubId = aClubId();
    const world = buildPlayerWorld({ saveName: 'Bad — TEST', dataset: ENGLAND_DATASET, clubId, startYear: 2025, seed: 5 });
    expect(() => createPlayerCareerGame({
      saveName: 'Bad — TEST', dataset: ENGLAND_DATASET, clubId, startYear: 2025, seed: 5,
      origin: 'EXISTING', existingPlayerId: 'nope_not_real', prebuiltWorld: world,
    })).toThrow();
  });
});
