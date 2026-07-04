import { describe, it, expect } from 'vitest';
import { resolveScoutAssignments, SCOUT_TRIP_DAYS } from '../youthScouting';
import { makeScoutProfile } from '../staff';
import { Rng } from '../rng';
import type { Staff } from '../../types/staff';
import type { ScoutAssignment } from '../../types/academy';

function scout(rating: number, seed: number): Staff {
  return {
    id: `scout_${rating}`, name: { first: 'S', last: 'Cout' }, role: 'SCOUT', rating, wage: 1000, clubId: 'club',
    scoutProfile: makeScoutProfile(rating, new Rng(seed)),
  };
}

function assignment(scoutId: string): ScoutAssignment {
  return { scoutId, positions: ['ST', 'CAM'], country: 'BR', durationRemaining: SCOUT_TRIP_DAYS, progress: 0, foundPlayerIds: [] };
}

describe('Youth scouting (Phase 4)', () => {
  it('does not resolve until the trip completes, then returns prospects', () => {
    const s = scout(70, 1);
    const scouts = { [s.id]: s };
    // Half-way: still running, no prospects.
    let res = resolveScoutAssignments([assignment(s.id)], scouts, 'club', 2024, SCOUT_TRIP_DAYS / 2, 90, new Rng(3));
    expect(res.prospects.length).toBe(0);
    expect(res.assignments.length).toBe(1);
    expect(res.assignments[0].progress).toBeGreaterThan(0);
    // Finish the trip.
    res = resolveScoutAssignments(res.assignments, scouts, 'club', 2024, SCOUT_TRIP_DAYS, 90, new Rng(3));
    expect(res.prospects.length).toBeGreaterThan(0);
    expect(res.assignments.length).toBe(0);
    for (const p of res.prospects) {
      expect(p.discoveredByClubId).toBe('club');
      expect(p.player.nationality).toBe('BR');
      expect(['ST', 'CAM']).toContain(p.player.position);
    }
  });

  it('better scouts find more prospects and report more accurately', () => {
    const good = scout(90, 5);
    const poor = scout(40, 5);
    let goodFinds = 0, poorFinds = 0, goodKnow = 0, poorKnow = 0, gN = 0, pN = 0;
    for (let i = 0; i < 30; i++) {
      const g = resolveScoutAssignments([assignment(good.id)], { [good.id]: good }, 'club', 2024, SCOUT_TRIP_DAYS, 90, new Rng(100 + i));
      const p = resolveScoutAssignments([assignment(poor.id)], { [poor.id]: poor }, 'club', 2024, SCOUT_TRIP_DAYS, 90, new Rng(100 + i));
      goodFinds += g.prospects.length; poorFinds += p.prospects.length;
      for (const x of g.prospects) { goodKnow += x.knowledgePct; gN++; }
      for (const x of p.prospects) { poorKnow += x.knowledgePct; pN++; }
    }
    expect(goodFinds).toBeGreaterThan(poorFinds);
    expect(goodKnow / Math.max(1, gN)).toBeGreaterThan(poorKnow / Math.max(1, pN));
  });

  it('is deterministic for a fixed seed', () => {
    const s = scout(75, 9);
    const run = () => resolveScoutAssignments([assignment(s.id)], { [s.id]: s }, 'club', 2024, SCOUT_TRIP_DAYS, 90, new Rng(77))
      .prospects.map((p) => `${p.player.position}:${p.player.overall}:${p.player.potential}:${p.knowledgePct}`).join('|');
    expect(run()).toBe(run());
  });
});
