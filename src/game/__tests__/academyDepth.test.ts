import { describe, it, expect } from 'vitest';
import { loadDataset } from '../../data/datasetLoader';
import { ENGLAND_DATASET } from '../../data/england';
import { buildAcademy } from '../../engine/academy';
import { processAcademyRollover } from '../academy';
import { Rng } from '../../engine/rng';
import type { Club } from '../../types/club';
import type { Player } from '../../types/player';
import type { AcademyPlayer } from '../../types/academy';

const world = loadDataset(ENGLAND_DATASET, 31, 2024);
const base = Object.values(world.clubs)[0];
const tmpl = Object.values(world.players)[0];

function fakeClub(): Club {
  return { ...base, id: 'depth_club', name: 'Depth FC', reputation: 75 };
}

function prospect(id: string, born: number, overall: number, potential: number, clubId: string): Player {
  return { ...structuredClone(tmpl), id, born: { year: born }, overall, potential, contract: { ...tmpl.contract, clubId: null }, academyClubId: clubId };
}

function ap(id: string, clubId: string, over = false, mentorId?: string): AcademyPlayer {
  return {
    playerId: id, clubId, ageGroup: over ? 'U21' : 'U18', playedUp: false, heldBack: false,
    ageGroupPerformance: 60, readiness: 50, contractStatus: 'scholar', dualRegistered: false, mentorId,
    personality: { determination: 50, professionalism: 50, ambition: 50 }, flameOutRisk: 0.2, isProdigy: false,
  };
}

describe('Academy depth (Phase 6)', () => {
  it('reputation rises when graduates are produced and decays when none are', () => {
    const club = fakeClub();
    const clubs = { [club.id]: club };
    const startRep = 60;

    // Graduate-producing year: a strong 21-year-old turns 22 and graduates.
    const gradAc = { ...buildAcademy(club, new Rng(1)).academy, reputation: startRep };
    const p = prospect('grad1', 2003, 74, 80, club.id);
    const res1 = processAcademyRollover({ [club.id]: gradAc }, { grad1: ap('grad1', club.id, true) }, [p], clubs, { [club.id]: 70 }, 2025, 91, new Rng(2), club.id, 0);
    expect(res1.graduates.length).toBeGreaterThan(0);
    expect(res1.academies[club.id].reputation).toBeGreaterThan(startRep);

    // Barren year: no academy players at all → reputation decays.
    const quietAc = { ...buildAcademy(club, new Rng(1)).academy, reputation: startRep };
    const res2 = processAcademyRollover({ [club.id]: quietAc }, {}, [], clubs, { [club.id]: 70 }, 2025, 91, new Rng(3), club.id, 0);
    expect(res2.academies[club.id].reputation).toBeLessThan(startRep);
  });

  it('a mentor rubs off on a youngster\'s personality', () => {
    const club = fakeClub();
    const clubs = { [club.id]: club };
    const academy = buildAcademy(club, new Rng(1)).academy;

    const youngster = prospect('kid', 2008, 55, 78, club.id); // age 16/17 — stays in academy
    const mentor: Player = { ...structuredClone(tmpl), id: 'mentor', born: { year: 1994 }, contract: { ...tmpl.contract, clubId: club.id }, hidden: { ...tmpl.hidden, professionalism: 95, ambition: 95, consistency: 95 } };
    const overlay = { kid: ap('kid', club.id, false, 'mentor') };

    const res = processAcademyRollover({ [club.id]: academy }, overlay, [youngster], clubs, { [club.id]: 70 }, 2025, 91, new Rng(5), club.id, 0, { mentor });
    const updated = res.overlay['kid'];
    expect(updated).toBeTruthy();
    // Personality drifted upward toward the elite mentor (was 50).
    expect(updated.personality.professionalism).toBeGreaterThan(50);
  });
});
