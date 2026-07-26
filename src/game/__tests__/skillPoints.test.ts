import { describe, it, expect } from 'vitest';
import {
  recommendedBuild, attrBudgetFor, targetOvrFor, attrCapFor, overallOf, pointsSpent,
  validateAllocation, floorAttributes, costTo, pointCost, floorMentality, mentalitySpent, mentalityValid, MENTALITY_BUDGET,
} from '../skillPoints';
import type { Position } from '../../types/attributes';

const ARCHETYPES = ['Late Bloomer', 'Journeyman', 'Academy Graduate', 'Street Baller', 'Prodigy'];
const POSITIONS: Position[] = ['ST', 'LW', 'CAM', 'CM', 'CDM', 'RCB', 'LB', 'GK'];

describe('recommendedBuild', () => {
  it('lands on the target OVR (±1) for every position', () => {
    for (const pos of POSITIONS) {
      for (const target of [56, 60, 63, 66]) {
        const build = recommendedBuild(pos, target, 85);
        expect(Math.abs(overallOf(build, pos) - target)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('never floors below 40 and respects the cap', () => {
    const b = recommendedBuild('ST', 66, 82);
    const v = validateAllocation(b, 10_000, 82);
    expect(v.belowFloor).toHaveLength(0);
    expect(v.overCap).toHaveLength(0);
  });
});

describe('archetype budgets fit the billing', () => {
  it('spending the whole budget on the recommended build hits the archetype start-OVR band', () => {
    const clubRep = 68;
    for (const arch of ARCHETYPES) {
      for (const pos of POSITIONS) {
        const target = targetOvrFor(arch, clubRep);
        const budget = attrBudgetFor(arch, pos, clubRep);
        const build = recommendedBuild(pos, target, attrCapFor(arch));
        // The recommended build fits within budget and reaches the target.
        expect(pointsSpent(build)).toBeLessThanOrEqual(budget);
        expect(Math.abs(overallOf(build, pos) - target)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('orders archetypes by starting quality (Prodigy > Academy > Journeyman > Late Bloomer)', () => {
    const rep = 65;
    expect(targetOvrFor('Prodigy', rep)).toBeGreaterThan(targetOvrFor('Academy Graduate', rep));
    expect(targetOvrFor('Academy Graduate', rep)).toBeGreaterThan(targetOvrFor('Journeyman', rep));
    expect(targetOvrFor('Journeyman', rep)).toBeGreaterThan(targetOvrFor('Late Bloomer', rep));
  });

  it('scales the start with club reputation (a prospect at a big club starts stronger)', () => {
    expect(targetOvrFor('Academy Graduate', 82)).toBeGreaterThan(targetOvrFor('Academy Graduate', 55));
  });

  it('keepers need fewer points than outfielders for the same target (concentrated rating)', () => {
    expect(attrBudgetFor('Academy Graduate', 'GK', 68)).toBeLessThan(attrBudgetFor('Academy Graduate', 'ST', 68));
  });
});

describe('point-cost model discourages spiking', () => {
  it('gets steeper as an attribute climbs', () => {
    expect(pointCost(50)).toBeLessThan(pointCost(70));
    expect(pointCost(70)).toBeLessThan(pointCost(80));
    // Raising one attribute 40→80 costs far more than 40→60 twice over.
    expect(costTo(80)).toBeGreaterThan(costTo(60) * 2);
  });
});

describe('mentality pool', () => {
  it('starts empty and validates against its budget', () => {
    const m = floorMentality();
    expect(mentalitySpent(m)).toBe(0);
    expect(mentalityValid(m)).toBe(true);
    m.consistency = 90; m.bigGame = 90; // 40 + 40 = 80 > budget
    expect(mentalitySpent(m)).toBe(80);
    expect(mentalityValid(m)).toBe(false);
    m.bigGame = 50; // back to 40 spent, within budget
    expect(mentalitySpent(m)).toBeLessThanOrEqual(MENTALITY_BUDGET);
    expect(mentalityValid(m)).toBe(true);
  });
});

describe('floor + validation', () => {
  it('the blank slate spends nothing and is OVR ~40', () => {
    const f = floorAttributes();
    expect(pointsSpent(f)).toBe(0);
    expect(overallOf(f, 'ST')).toBe(40);
  });
});
