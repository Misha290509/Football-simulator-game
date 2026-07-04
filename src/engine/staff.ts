// ---------------------------------------------------------------------------
// Staff & facilities helpers (§8, §11-M5). Pure. Staff ratings translate into
// multiplier "factors" that feed development, scouting and injury systems.
// ---------------------------------------------------------------------------

import type { Staff, StaffRole, Facilities, TrainingFocus, ScoutProfile } from '../types/staff';
import { Rng, clamp } from './rng';
import { FIRST_NAMES, LAST_NAMES } from '../data/names';
import { ALL_POSITIONS } from '../types/attributes';
import { COUNTRY_YOUTH_INDEX } from '../data/academyData';

const SCOUT_REGIONS = Object.keys(COUNTRY_YOUTH_INDEX);

/** Build a scout's skill profile, anchored to overall rating (Idea 6). */
export function makeScoutProfile(rating: number, rng: Rng): ScoutProfile {
  const regionalKnowledge: Record<string, number> = {};
  for (const r of SCOUT_REGIONS) regionalKnowledge[r] = clamp(Math.round(rng.normal(rating * 0.72, 15)), 10, 95);
  const home = rng.pick(SCOUT_REGIONS);
  regionalKnowledge[home] = clamp(regionalKnowledge[home] + 22, 10, 99);

  let specialization: ScoutProfile['specialization'];
  if (rating > 66 && rng.chance(0.5)) {
    const n = rng.int(1, 2);
    const positions = Array.from({ length: n }, () => rng.pick(ALL_POSITIONS) as string);
    specialization = { positions: [...new Set(positions)], region: rng.pick(SCOUT_REGIONS) };
  }
  return {
    judgingAbility: clamp(Math.round(rng.normal(rating, 8)), 20, 99),
    judgingPotential: clamp(Math.round(rng.normal(rating - 5, 9)), 15, 99),
    experience: clamp(Math.round(rng.normal(rating, 12)), 10, 99),
    regionalKnowledge,
    specialization,
  };
}

let _staffSeq = 0;
function staffId(): string {
  return `staff_${(_staffSeq++).toString(36)}_${Date.now().toString(36)}`;
}

const ROLE_BASELINE: StaffRole[] = ['ASSISTANT', 'COACH', 'COACH', 'SCOUT', 'SCOUT', 'PHYSIO'];

/** Generate a club's starting staff, quality anchored to reputation. */
export function generateStaffFor(clubId: string, reputation: number, rng: Rng): Staff[] {
  return ROLE_BASELINE.map((role) => makeStaff(role, reputation, clubId, rng));
}

/** A free-agent pool of hireable staff for the staff market (all roles). */
export function generateStaffPool(count: number, rng: Rng): Staff[] {
  const roles: StaffRole[] = ['ASSISTANT', 'COACH', 'COACH', 'YOUTH_COACH', 'SCOUT', 'SCOUT', 'PHYSIO'];
  return Array.from({ length: count }, () =>
    makeStaff(rng.pick(roles), rng.int(42, 95), null, rng),
  );
}

/** How much more each role's expertise costs per week (relative to base). */
const ROLE_WAGE_MULT: Record<StaffRole, number> = {
  ASSISTANT: 1.4, COACH: 1.15, YOUTH_COACH: 0.85, SCOUT: 0.9, PHYSIO: 0.95,
};

/**
 * Realistic weekly wage for a backroom member, steep in quality and scaled by
 * role: e.g. a 90-rated assistant ≈ £11k/wk, a 70-rated coach ≈ £5.6k, a
 * 50-rated physio ≈ £2.4k, a 45-rated youth coach ≈ £1.7k.
 */
export function staffWage(rating: number, role: StaffRole): number {
  return Math.round((rating * rating * ROLE_WAGE_MULT[role]) / 100) * 100;
}

function makeStaff(role: StaffRole, anchor: number, clubId: string | null, rng: Rng): Staff {
  // Steep so only big clubs get top staff: rep 85 → ~72 avg, 64 → ~43, 52 → ~26.
  const baseline = 30 + (anchor - 55) * 1.4;
  const rating = clamp(Math.round(rng.normal(baseline, 7)), 25, 92);
  return {
    id: staffId(),
    name: { first: rng.pick(FIRST_NAMES), last: rng.pick(LAST_NAMES) },
    role,
    rating,
    wage: staffWage(rating, role),
    clubId,
    scoutProfile: role === 'SCOUT' ? makeScoutProfile(rating, rng) : undefined,
  };
}

/**
 * Whether a coach accepts proposed terms (wage/years) when hiring or renewing.
 * They want at least their market wage; a longer deal needs a small premium.
 * Returns the counter (their minimum) when they reject.
 */
export function evaluateStaffTerms(staff: Staff, wage: number, years: number): { ok: boolean; wants: number; message: string } {
  const wants = Math.round(staffWage(staff.rating, staff.role) * (1 + Math.max(0, years - 2) * 0.05) / 100) * 100;
  if (wage >= wants) {
    return { ok: true, wants, message: `${staff.name.last} agrees terms: ${wage.toLocaleString()}/wk for ${years} year${years > 1 ? 's' : ''}.` };
  }
  return { ok: false, wants, message: `${staff.name.last} wants at least ${wants.toLocaleString()}/wk — offer more.` };
}

const avgRating = (staff: Staff[], role: StaffRole): number => {
  const xs = staff.filter((s) => s.role === role);
  return xs.length ? xs.reduce((s, x) => s + x.rating, 0) / xs.length : 50;
};

/** Coaching multiplier on player development (≈0.9–1.25). */
export function coachingFactor(staff: Staff[] | undefined, facilities: Facilities | undefined): number {
  const coach = avgRating(staff ?? [], 'COACH');
  const training = (facilities?.training ?? 2) / 5; // 0.2–1.0
  return clamp(0.9 + (coach - 50) / 250 + training * 0.12, 0.85, 1.3) as number;
}

/** Scouting knowledge gained per matchday for an assigned target. */
export function scoutingRate(staff: Staff[] | undefined): number {
  const scout = avgRating(staff ?? [], 'SCOUT');
  return 1.2 + (scout / 100) * 3.5; // ~1.2–4.7 knowledge points / matchday
}

/** Physio multiplier reducing injury severity/risk (≤1). */
export function physioFactor(staff: Staff[] | undefined): number {
  const physio = avgRating(staff ?? [], 'PHYSIO');
  return clamp(1 - (physio - 50) / 220, 0.7, 1.1) as number;
}

/** Training-focus bias on which attribute groups develop fastest. */
export function trainingBias(focus: TrainingFocus | undefined): number {
  // A small overall growth nudge; group targeting is approximated in dev.
  return focus === 'YOUTH' ? 1.08 : focus === 'FITNESS' ? 1.04 : 1.0;
}

export const FACILITY_UPGRADE_COST = (level: number): number => level * 8_000_000;
