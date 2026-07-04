import { describe, it, expect } from 'vitest';
import { loadDataset } from '../../data/datasetLoader';
import { ENGLAND_DATASET } from '../../data/england';
import { academyRatingFor, philosophyFor, eliteAcademyFor, ageGroupForAge, facilityLevelFor } from '../../engine/academy';
import { migrateSave, CURRENT_SCHEMA_VERSION } from '../../db/migrations';
import type { SaveMeta } from '../../db/db';
import type { Club } from '../../types/club';

const world = loadDataset(ENGLAND_DATASET, 7, 2024);
const clubs = Object.values(world.clubs);

function fakeClub(name: string, reputation: number, transferBudget: number, countryId = 'GB'): Club {
  return {
    ...clubs[0],
    id: `fake_${name}`,
    name,
    reputation,
    countryId,
    finances: { ...clubs[0].finances, transferBudget },
  };
}

function v1Meta(managerClubId: string): SaveMeta {
  return {
    id: 'test', name: 'test', seed: 7, createdAt: 0, schemaVersion: 1,
    managerClubId, managerName: 'X', currentDay: 0, startYear: 2024,
    competitions: world.competitions,
    seasons: { s: { id: 's', year: 2024, label: '2024/25', competitionIds: [], current: true, finished: false } },
    news: [],
  } as SaveMeta;
}

describe('Academy tailoring (Phase 1)', () => {
  it('elite, wealthy clubs out-rate small ones', () => {
    const big = academyRatingFor(fakeClub('Big City', 88, 150_000_000));
    const small = academyRatingFor(fakeClub('Tiny Town', 45, 500_000));
    expect(big).toBeGreaterThan(small);
    expect(big).toBeLessThanOrEqual(5);
    expect(small).toBeGreaterThanOrEqual(1);
  });

  it('applies the elite-academy star floor regardless of formula', () => {
    expect(eliteAcademyFor('FC Barcelona')?.rating).toBe(5);
    // Even modelled as a modest club, La Masia stays 5★.
    expect(academyRatingFor(fakeClub('FC Barcelona', 60, 5_000_000, 'ES'))).toBe(5);
  });

  it('resolves philosophy from elite override then country default', () => {
    expect(philosophyFor(fakeClub('FC Barcelona', 80, 1, 'ES'))).toBe('TIKI_TAKA');
    expect(philosophyFor(fakeClub('Some Spanish Club', 70, 1, 'ES'))).toBe('TIKI_TAKA');
    expect(philosophyFor(fakeClub('Some Brazil Club', 70, 1, 'BR'))).toBe('FLAIR');
  });

  it('maps ages to the right group', () => {
    expect(ageGroupForAge(15)).toBe('U16');
    expect(ageGroupForAge(17)).toBe('U18');
    expect(ageGroupForAge(20)).toBe('U21');
  });
});

describe('Facility levels', () => {
  it('only elite, wealthy clubs reach 5; modest top-flight sides land ~2', () => {
    expect(facilityLevelFor(89, 170_000_000, 80_000)).toBe(5); // Real Madrid-level
    expect(facilityLevelFor(80, 60_000_000, 68_000)).toBe(4); // Atlético-level
    expect(facilityLevelFor(73, 24_000_000, 14_000)).toBeLessThanOrEqual(2); // Girona-level (was 4)
    expect(facilityLevelFor(56, 3_000_000, 20_000)).toBe(1); // lower-division
  });

  it('finances matter: a richer club of equal reputation invests more', () => {
    const rich = facilityLevelFor(75, 120_000_000, 30_000);
    const poor = facilityLevelFor(75, 5_000_000, 30_000);
    expect(rich).toBeGreaterThan(poor);
  });
});

describe('Save migration v1 → v2', () => {
  it('backfills academies for every club and bumps the schema version', () => {
    const res = migrateSave(v1Meta(clubs[0].id), world.clubs, world.players);
    expect(res.changed).toBe(true);
    expect(res.meta.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(Object.keys(res.meta.academies ?? {}).length).toBe(clubs.length);
    for (const a of Object.values(res.meta.academies ?? {})) {
      expect(a.rating).toBeGreaterThanOrEqual(1);
      expect(a.rating).toBeLessThanOrEqual(5);
    }
  });

  it('enrolls under-19 players as dual-registered prospects without removing them', () => {
    const res = migrateSave(v1Meta(clubs[0].id), world.clubs, world.players);
    // The v7 top-up also seeds fresh (non-dual-registered) prospects; the v2
    // enrollment is the dual-registered subset — those must stay first-teamers.
    const aps = Object.values(res.meta.academyPlayers ?? {}).filter((ap) => ap.dualRegistered);
    expect(aps.length).toBeGreaterThan(0);
    for (const ap of aps) {
      const p = res.players[ap.playerId];
      expect(p).toBeTruthy();
      expect(2024 - p.born.year).toBeLessThanOrEqual(18);
      expect(p.academyClubId).toBe(ap.clubId);
      expect(p.contract.clubId).toBe(ap.clubId); // still registered to the first team
    }
  });

  it('is deterministic and idempotent', () => {
    const a = migrateSave(v1Meta(clubs[0].id), world.clubs, world.players);
    const b = migrateSave(v1Meta(clubs[0].id), world.clubs, world.players);
    const ratingsA = Object.values(a.meta.academies ?? {}).map((x) => x.rating).join(',');
    const ratingsB = Object.values(b.meta.academies ?? {}).map((x) => x.rating).join(',');
    expect(ratingsA).toBe(ratingsB);
    // Running again on a migrated save is a no-op.
    const again = migrateSave(a.meta, a.clubs, a.players);
    expect(again.changed).toBe(false);
  });
});
