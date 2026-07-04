import { describe, it, expect } from 'vitest';
import { loadDataset } from '../../data/datasetLoader';
import { ENGLAND_DATASET } from '../../data/england';
import { buildAcademy } from '../../engine/academy';
import { processAcademyRollover } from '../academy';
import { Rng } from '../../engine/rng';
import type { Club } from '../../types/club';
import type { Player } from '../../types/player';
import type { AcademyPlayer, AgeGroup } from '../../types/academy';

const world = loadDataset(ENGLAND_DATASET, 41, 2024);
const base = Object.values(world.clubs)[0];
const tmpl = Object.values(world.players)[0];

const club: Club = { ...base, id: 'legacy_club', name: 'Legacy FC', reputation: 78 };

function prospect(id: string, born: number, overall: number, potential: number): Player {
  return { ...structuredClone(tmpl), id, born: { year: born }, overall, potential, contract: { ...tmpl.contract, clubId: null }, academyClubId: club.id };
}
function ap(id: string, group: AgeGroup, status: AcademyPlayer['contractStatus'] = 'scholar'): AcademyPlayer {
  return {
    playerId: id, clubId: club.id, ageGroup: group, playedUp: false, heldBack: false,
    ageGroupPerformance: 70, readiness: 60, contractStatus: status, dualRegistered: false,
    personality: { determination: 60, professionalism: 60, ambition: 60 }, flameOutRisk: 0.2, isProdigy: false,
  };
}

describe('Academy legacy + events (Phase 7)', () => {
  it('records graduates and a "Class of" cohort, tagging the graduate origin', () => {
    const academies = { [club.id]: buildAcademy(club, new Rng(1)).academy };
    const p = prospect('grad', 2003, 74, 80); // turns 22 → graduates
    const res = processAcademyRollover(academies, { grad: ap('grad', 'U21') }, [p], { [club.id]: club }, { [club.id]: 72 }, 2025, 91, new Rng(2), club.id, 0);
    expect(res.graduates[0].academyGraduateOf).toBe(club.id);
    const academy = res.academies[club.id];
    expect(academy.graduates.some((g) => g.playerId === 'grad')).toBe(true);
    expect(academy.cohorts.some((c) => c.year === 2025 && c.playerIds.includes('grad'))).toBe(true);
  });

  it('protects professional-terms prospects from poaching but can lose unprotected ones', () => {
    const academies = { [club.id]: buildAcademy(club, new Rng(1)).academy };
    // The seeded unprotected high-potential teenager should be poached for at
    // least one seed; the protected one never is. (Filter to the seeded id so we
    // ignore poaching of the random fresh intake.)
    let unprotectedLost = 0, protectedLost = 0;
    for (let s = 0; s < 25; s++) {
      const u = processAcademyRollover(academies, { seed_u: ap('seed_u', 'U18', 'scholar') }, [prospect('seed_u', 2008, 60, 84)], { [club.id]: club }, { [club.id]: 72 }, 2025, 91, new Rng(500 + s), club.id, 0);
      if (u.lostPlayerIds.includes('seed_u')) unprotectedLost++;
      const p = processAcademyRollover(academies, { seed_p: ap('seed_p', 'U18', 'professional') }, [prospect('seed_p', 2008, 60, 84)], { [club.id]: club }, { [club.id]: 72 }, 2025, 91, new Rng(500 + s), club.id, 0);
      if (p.lostPlayerIds.includes('seed_p')) protectedLost++;
    }
    expect(unprotectedLost).toBeGreaterThan(0);
    expect(protectedLost).toBe(0);
  });

  it('remains deterministic with the new events', () => {
    const academies = { [club.id]: buildAcademy(club, new Rng(1)).academy };
    const p = prospect('d', 2008, 58, 82);
    const run = () => {
      const r = processAcademyRollover(academies, { d: ap('d', 'U18') }, [p], { [club.id]: club }, { [club.id]: 72 }, 2025, 91, new Rng(321), club.id, 0);
      return `${r.lostPlayerIds.join(',')}|${Object.keys(r.carriedPlayers).sort().join(',')}`;
    };
    expect(run()).toBe(run());
  });
});
