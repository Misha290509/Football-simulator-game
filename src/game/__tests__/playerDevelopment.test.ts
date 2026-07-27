import { describe, it, expect } from 'vitest';
import { dpEarned, investCost, attrCeiling, investAttribute, INTENSITY } from '../playerDevelopment';
import { bestOverall } from '../../engine/ratings';
import type { Player } from '../../types/player';
import type { PlayerCareer } from '../../types/playerCareer';

function player(over: Partial<Record<string, Partial<Record<string, number>>>>, potential = 80): Player {
  return {
    id: 'a', name: { first: 'A', last: 'B' }, position: 'ST', positions: ['ST'], overall: 70, potential,
    attributes: {
      technical: { finishing: 60, shortPassing: 55, longPassing: 50, dribbling: 58, crossing: 50, headingAccuracy: 55, longShots: 55, fkAccuracy: 50, curve: 50, penalties: 55, shotPower: 60, ballControl: 58, volleys: 50, ...(over.technical ?? {}) },
      mental: { vision: 55, composure: 60, positioning: 62, reactions: 60, aggression: 50, marking: 40, interceptions: 40, standingTackle: 40, slidingTackle: 40, ...(over.mental ?? {}) },
      physical: { pace: 60, sprintSpeed: 62, acceleration: 62, stamina: 60, strength: 58, jumping: 55, agility: 60, balance: 55, ...(over.physical ?? {}) },
      goalkeeping: { gkDiving: 20, gkHandling: 20, gkKicking: 20, gkPositioning: 20, gkReflexes: 20, ...(over.goalkeeping ?? {}) },
    },
  } as unknown as Player;
}
const career = (dp: number): PlayerCareer => ({ developmentPoints: dp } as unknown as PlayerCareer);

describe('dpEarned', () => {
  it('rewards good performances and scales with intensity', () => {
    expect(dpEarned([7.5, 7.0], 'BALANCED')).toBe(6);
    expect(dpEarned([7.5, 7.0], 'INTENSE')).toBeGreaterThan(dpEarned([7.5, 7.0], 'BALANCED'));
    expect(dpEarned([7.5, 7.0], 'LIGHT')).toBeLessThan(dpEarned([7.5, 7.0], 'BALANCED'));
    expect(dpEarned([5.5, 6.0], 'BALANCED')).toBe(0); // poor games earn nothing
  });
});

describe('investCost', () => {
  it('gets steeper as the attribute climbs', () => {
    expect(investCost(55)).toBeLessThan(investCost(65));
    expect(investCost(65)).toBeLessThan(investCost(75));
    expect(investCost(75)).toBeLessThan(investCost(85));
  });
});

describe('investAttribute', () => {
  it('raises the chosen attribute, deducts DP, and recomputes OVR', () => {
    const p = player({}); const c = career(30);
    const before = bestOverall(p.attributes, p.positions).ovr; // real, computed OVR
    const r = investAttribute(p, c, 'finishing', 90);
    expect(r.ok).toBe(true);
    expect((r.player.attributes.technical as Record<string, number>).finishing).toBe(61);
    expect(r.career.developmentPoints).toBe(30 - investCost(60));
    expect(r.player.overall).toBeGreaterThanOrEqual(before); // finishing is heavily weighted for ST
  });

  it('refuses when DP is short', () => {
    const r = investAttribute(player({}), career(2), 'finishing', 90);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/not enough/i);
  });

  it('refuses past the attribute ceiling (potential + headroom)', () => {
    const p = player({ technical: { finishing: 86 } }, 80); // ceiling = min(90, 86) = 86
    expect(attrCeiling(p, 90)).toBe(86);
    const r = investAttribute(p, career(999), 'finishing', 90);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/ceiling/i);
  });
});

describe('intensity table', () => {
  it('trades growth for freshness across the three settings', () => {
    expect(INTENSITY.INTENSE.focusMult).toBeGreaterThan(INTENSITY.BALANCED.focusMult);
    expect(INTENSITY.INTENSE.fitnessDelta).toBeLessThan(0);
    expect(INTENSITY.LIGHT.fitnessDelta).toBeGreaterThan(0);
    expect(INTENSITY.INTENSE.knockChance).toBeGreaterThan(INTENSITY.LIGHT.knockChance);
  });
});
