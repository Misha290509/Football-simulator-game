import { describe, it, expect } from 'vitest';
import { Rng } from '../rng';
import { staffWage, evaluateStaffTerms, generateStaffPool } from '../staff';
import type { Staff } from '../../types/staff';

describe('Backroom staff economics', () => {
  it('scales wages steeply with quality and by role', () => {
    // A top assistant costs clearly more than a low-rated youth coach.
    expect(staffWage(90, 'ASSISTANT')).toBeGreaterThan(staffWage(90, 'YOUTH_COACH'));
    expect(staffWage(90, 'COACH')).toBeGreaterThan(staffWage(50, 'COACH'));
    // Realistic weekly figures — well above the old ~£600.
    expect(staffWage(90, 'ASSISTANT')).toBeGreaterThan(9000);
    expect(staffWage(50, 'PHYSIO')).toBeGreaterThan(1500);
  });

  it('accepts terms at or above expectation and rejects below', () => {
    const coach: Staff = { id: 's', name: { first: 'A', last: 'B' }, role: 'COACH', rating: 75, wage: 0, clubId: null };
    const wants = evaluateStaffTerms(coach, 0, 2).wants;
    expect(evaluateStaffTerms(coach, wants, 2).ok).toBe(true);
    expect(evaluateStaffTerms(coach, wants - 100, 2).ok).toBe(false);
    // A longer deal costs a premium.
    expect(evaluateStaffTerms(coach, 0, 4).wants).toBeGreaterThan(wants);
  });

  it('generates a varied market of all roles', () => {
    const pool = generateStaffPool(12, new Rng(3));
    expect(pool.length).toBe(12);
    const roles = new Set(pool.map((s) => s.role));
    expect(roles.size).toBeGreaterThan(2);
    for (const s of pool) { expect(s.clubId).toBeNull(); expect(s.wage).toBeGreaterThan(0); }
  });
});
