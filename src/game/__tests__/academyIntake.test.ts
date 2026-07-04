import { describe, it, expect } from 'vitest';
import { loadDataset } from '../../data/datasetLoader';
import { ENGLAND_DATASET } from '../../data/england';
import { buildAcademy } from '../../engine/academy';
import { generateAcademyIntake, processAcademyRollover } from '../academy';
import { Rng } from '../../engine/rng';
import type { Club } from '../../types/club';
import type { Player } from '../../types/player';
import type { AcademyPlayer } from '../../types/academy';

const world = loadDataset(ENGLAND_DATASET, 11, 2024);
const baseClub = Object.values(world.clubs)[0];

function fakeClub(name: string, reputation: number, transferBudget: number, countryId = 'GB'): Club {
  return { ...baseClub, id: `fake_${name}`, name, reputation, countryId, finances: { ...baseClub.finances, transferBudget } };
}

describe('Academy intake (Phase 2)', () => {
  it('elite academies out-produce small ones over many intakes', () => {
    const big = fakeClub('Big', 88, 150_000_000);
    const small = fakeClub('Small', 45, 400_000);
    const bigAc = buildAcademy(big, new Rng(1)).academy;
    const smallAc = buildAcademy(small, new Rng(1)).academy;

    let bigCount = 0, smallCount = 0, bigPot = 0, smallPot = 0;
    for (let y = 0; y < 25; y++) {
      const b = generateAcademyIntake(big, bigAc, 2024 + y, new Rng(100 + y), 91);
      const s = generateAcademyIntake(small, smallAc, 2024 + y, new Rng(100 + y), 91);
      bigCount += b.length; smallCount += s.length;
      bigPot += b.reduce((a, p) => a + p.potential, 0);
      smallPot += s.reduce((a, p) => a + p.potential, 0);
    }
    expect(bigCount).toBeGreaterThan(smallCount);
    // Average ceiling of a big-academy prospect beats a small one's.
    expect(bigPot / Math.max(1, bigCount)).toBeGreaterThan(smallPot / Math.max(1, smallCount));
  });

  it('is deterministic for a fixed seed', () => {
    const c = fakeClub('Det', 75, 20_000_000);
    const ac = buildAcademy(c, new Rng(5)).academy;
    const a = generateAcademyIntake(c, ac, 2024, new Rng(42), 91).map((p) => `${p.position}:${p.overall}:${p.potential}`).join('|');
    const b = generateAcademyIntake(c, ac, 2024, new Rng(42), 91).map((p) => `${p.position}:${p.overall}:${p.potential}`).join('|');
    expect(a).toBe(b);
  });

  it('biases positions toward the philosophy (defensive academy yields more defenders than a flair one)', () => {
    const defClub = fakeClub('Catenaccio', 78, 30_000_000, 'IT'); // Italy → DEFENSIVE
    const flairClub = fakeClub('Samba', 78, 30_000_000, 'BR'); // Brazil → FLAIR
    const defAc = buildAcademy(defClub, new Rng(2)).academy;
    const flairAc = buildAcademy(flairClub, new Rng(2)).academy;
    expect(defAc.philosophyId).toBe('DEFENSIVE');
    expect(flairAc.philosophyId).toBe('FLAIR');

    const defShare = (club: typeof defClub, ac: typeof defAc) => {
      let def = 0, total = 0;
      for (let y = 0; y < 60; y++) {
        for (const p of generateAcademyIntake(club, ac, 2024, new Rng(7 + y), 91)) {
          total++;
          if (['LCB', 'RCB', 'LB', 'RB'].includes(p.position)) def++;
        }
      }
      return def / Math.max(1, total);
    };
    expect(defShare(defClub, defAc)).toBeGreaterThan(defShare(flairClub, flairAc));
  });
});

describe('Academy rollover cycle', () => {
  it('ages prospects, graduates the over-age, and takes a fresh intake', () => {
    const club = fakeClub('Cycle', 80, 50_000_000);
    const clubs = { [club.id]: club };
    const ac = buildAcademy(club, new Rng(3)).academy;
    const academies = { [club.id]: ac };

    // A 21-year-old strong prospect should graduate next year (turns 22).
    const grad = world.players[Object.keys(world.players)[0]];
    const prospect: Player = { ...structuredClone(grad), id: 'ply_grad', born: { year: 2003 }, overall: 70, potential: 78, contract: { ...grad.contract, clubId: null }, academyClubId: club.id };
    const overlay: Record<string, AcademyPlayer> = {
      ply_grad: { playerId: 'ply_grad', clubId: club.id, ageGroup: 'U21', playedUp: false, heldBack: false, ageGroupPerformance: 80, readiness: 70, contractStatus: 'professional', dualRegistered: false, personality: { determination: 70, professionalism: 70, ambition: 70 }, flameOutRisk: 0.1, isProdigy: false },
    };

    const res = processAcademyRollover(academies, overlay, [prospect], clubs, { [club.id]: 72 }, 2025, 91, new Rng(9), club.id, 0);
    // Graduated (age 22) to the first team.
    expect(res.graduates.some((p) => p.id === 'ply_grad')).toBe(true);
    expect(res.graduates[0].contract.clubId).toBe(club.id);
    expect(res.graduates[0].academyClubId).toBeUndefined();
    // Fresh U16 intake arrived and is carried in the academy.
    const intakeIds = Object.keys(res.carriedPlayers);
    expect(intakeIds.length).toBeGreaterThan(0);
    for (const id of intakeIds) {
      expect(res.overlay[id].ageGroup).toBe('U16');
      expect(res.carriedPlayers[id].academyClubId).toBe(club.id);
      expect(res.carriedPlayers[id].contract.clubId).toBeNull();
    }
  });

  it('is deterministic across the rollover', () => {
    const club = fakeClub('Det2', 76, 25_000_000);
    const clubs = { [club.id]: club };
    const academies = { [club.id]: buildAcademy(club, new Rng(4)).academy };
    const run = () => processAcademyRollover(academies, {}, [], clubs, { [club.id]: 70 }, 2025, 91, new Rng(13), club.id, 0);
    const a = Object.values(run().overlay).map((o) => `${o.ageGroup}:${o.ageGroupPerformance}`).sort().join('|');
    const b = Object.values(run().overlay).map((o) => `${o.ageGroup}:${o.ageGroupPerformance}`).sort().join('|');
    expect(a).toBe(b);
  });
});
