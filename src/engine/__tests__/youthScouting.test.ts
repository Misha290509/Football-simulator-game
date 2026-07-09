import { describe, it, expect } from 'vitest';
import {
  resolveScoutAssignments, SCOUT_TRIP_DAYS, SCOUT_MONTH_DAYS, REPORT_MIN, REPORT_MAX,
} from '../youthScouting';
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

/** A fresh N-month scouting contract, first report due after one month. */
function contract(scoutId: string, months = 3): ScoutAssignment {
  return { scoutId, positions: ['ST', 'CAM'], country: 'BR', monthsTotal: months, reportsDelivered: 0, nextReportDay: SCOUT_MONTH_DAYS, foundPlayerIds: [] };
}

describe('Youth scouting contracts', () => {
  it('files one report per month, 5–8 prospects each, until the term ends', () => {
    const s = scout(70, 1);
    const scouts = { [s.id]: s };
    // First month only: one report, contract still active.
    let res = resolveScoutAssignments([contract(s.id, 3)], scouts, 'club', 2024, 0, SCOUT_MONTH_DAYS, 90, 3);
    expect(res.prospects.length).toBeGreaterThanOrEqual(REPORT_MIN);
    expect(res.prospects.length).toBeLessThanOrEqual(REPORT_MAX);
    expect(res.assignments.length).toBe(1);
    expect(res.assignments[0].reportsDelivered).toBe(1);
    for (const p of res.prospects) {
      expect(p.discoveredByClubId).toBe('club');
      expect(p.player.nationality).toBe('BR');
      expect(['ST', 'CAM']).toContain(p.player.position);
    }
  });

  it('delivers every month of the term in a single long advance, then completes', () => {
    const s = scout(70, 1);
    const scouts = { [s.id]: s };
    const res = resolveScoutAssignments([contract(s.id, 6)], scouts, 'club', 2024, 0, SCOUT_MONTH_DAYS * 6, 90, 7);
    // Six monthly reports of 5–8 each.
    expect(res.prospects.length).toBeGreaterThanOrEqual(REPORT_MIN * 6);
    expect(res.prospects.length).toBeLessThanOrEqual(REPORT_MAX * 6);
    expect(res.assignments.length).toBe(0); // term fulfilled → scout comes home
  });

  it('better scouts report more accurately', () => {
    const good = scout(90, 5);
    const poor = scout(40, 5);
    let goodKnow = 0, poorKnow = 0, gN = 0, pN = 0;
    for (let i = 0; i < 20; i++) {
      const g = resolveScoutAssignments([contract(good.id, 3)], { [good.id]: good }, 'club', 2024, 0, SCOUT_MONTH_DAYS * 3, 90, 100 + i);
      const p = resolveScoutAssignments([contract(poor.id, 3)], { [poor.id]: poor }, 'club', 2024, 0, SCOUT_MONTH_DAYS * 3, 90, 100 + i);
      for (const x of g.prospects) { goodKnow += x.knowledgePct; gN++; }
      for (const x of p.prospects) { poorKnow += x.knowledgePct; pN++; }
    }
    expect(goodKnow / Math.max(1, gN)).toBeGreaterThan(poorKnow / Math.max(1, pN));
  });

  it('is deterministic for a fixed seed', () => {
    const s = scout(75, 9);
    const run = () => resolveScoutAssignments([contract(s.id, 3)], { [s.id]: s }, 'club', 2024, 0, SCOUT_MONTH_DAYS * 3, 90, 77)
      .prospects.map((p) => `${p.player.position}:${p.player.overall}:${p.player.potential}:${p.knowledgePct}`).join('|');
    expect(run()).toBe(run());
  });

  it('still resolves legacy single-trip assignments', () => {
    const s = scout(70, 1);
    const legacy: ScoutAssignment = { scoutId: s.id, positions: ['ST'], country: 'BR', durationRemaining: SCOUT_TRIP_DAYS, progress: 0, foundPlayerIds: [] };
    // Half-way through the trip: still running.
    let res = resolveScoutAssignments([legacy], { [s.id]: s }, 'club', 2024, 0, SCOUT_TRIP_DAYS / 2, 90, 3);
    expect(res.prospects.length).toBe(0);
    expect(res.assignments.length).toBe(1);
    // Complete it.
    res = resolveScoutAssignments(res.assignments, { [s.id]: s }, 'club', 2024, 0, SCOUT_TRIP_DAYS, 90, 3);
    expect(res.prospects.length).toBeGreaterThan(0);
    expect(res.assignments.length).toBe(0);
  });
});
