import { describe, it, expect } from 'vitest';
import { buildLineupProfile } from '../lineup';
import { FORMATIONS } from '../lineup';
import { roleModFor, defaultRoleFor, ROLES_BY_POSITION } from '../roles';
import { generatePlayer } from '../generator';
import { Rng } from '../rng';
import type { Player } from '../../types/player';

function squad(): Player[] {
  const rng = new Rng(42);
  const slots = FORMATIONS['4-3-3'];
  return slots.map((pos, i) => {
    const p = generatePlayer({ rng, currentYear: 2025, target: 75, position: pos, ageRange: [24, 28], ratingCap: 90 });
    p.id = `p${i}`; p.contract.clubId = 'C';
    return p;
  });
}

describe('player roles', () => {
  it('neutral/default roles do not change the profile (balance-preserving)', () => {
    const players = squad();
    const base = buildLineupProfile('C', players, '4-3-3', { autoMode: true });
    const withDefaults = buildLineupProfile('C', players, '4-3-3', {
      autoMode: true,
      roles: FORMATIONS['4-3-3'].map((pos) => defaultRoleFor(pos)),
    });
    expect(withDefaults.attack).toBeCloseTo(base.attack, 6);
    expect(withDefaults.defense).toBeCloseTo(base.defense, 6);
    expect(withDefaults.midfield).toBeCloseTo(base.midfield, 6);
    expect(withDefaults.shotVolumeMod).toBeCloseTo(base.shotVolumeMod, 6);
    expect(withDefaults.chanceQualityMod).toBeCloseTo(base.chanceQualityMod, 6);
  });

  it('wing-backs raise attack and drop defence vs stay-home full-backs', () => {
    const players = squad();
    const slots = FORMATIONS['4-3-3']; // GK LB LCB RCB RB CM CM CM LW ST RW
    const roles = slots.map(() => null as string | null);
    roles[1] = 'WING_BACK'; roles[4] = 'WING_BACK';
    const base = buildLineupProfile('C', players, '4-3-3', { autoMode: true });
    const wb = buildLineupProfile('C', players, '4-3-3', { autoMode: true, roles });
    expect(wb.attack).toBeGreaterThan(base.attack);
    expect(wb.defense).toBeLessThan(base.defense);
    expect(wb.shotVolumeMod).toBeGreaterThan(base.shotVolumeMod);
  });

  it('a false 9 raises chance quality and shifts the striker toward creating', () => {
    const players = squad();
    const slots = FORMATIONS['4-3-3'];
    const stIdx = slots.indexOf('ST');
    const roles = slots.map(() => null as string | null);
    roles[stIdx] = 'FALSE_NINE';
    const base = buildLineupProfile('C', players, '4-3-3', { autoMode: true });
    const f9 = buildLineupProfile('C', players, '4-3-3', { autoMode: true, roles });
    expect(f9.chanceQualityMod).toBeGreaterThan(base.chanceQualityMod);
    // The striker's scorer weight falls.
    const stScorerBase = base.scorers.find((s) => players.some((p) => p.id === s.playerId && p.position === 'ST'));
    const stScorerF9 = f9.scorers.find((s) => players.some((p) => p.id === s.playerId && p.position === 'ST'));
    expect(stScorerF9!.weight).toBeLessThan(stScorerBase!.weight);
  });

  it('tactic sliders at 50 (or absent) are neutral; extremes shift the profile', () => {
    const players = squad();
    const base = buildLineupProfile('C', players, '4-3-3', { autoMode: true, tactics: { defensive: 'BALANCED', offensive: 'POSSESSION' } });
    const neutral = buildLineupProfile('C', players, '4-3-3', { autoMode: true, tactics: { defensive: 'BALANCED', offensive: 'POSSESSION', width: 50, tempo: 50, pressing: 50 } });
    expect(neutral.shotVolumeMod).toBeCloseTo(base.shotVolumeMod, 6);
    expect(neutral.aggression).toBeCloseTo(base.aggression, 6);

    const highTempo = buildLineupProfile('C', players, '4-3-3', { autoMode: true, tactics: { defensive: 'BALANCED', offensive: 'POSSESSION', tempo: 100 } });
    expect(highTempo.shotVolumeMod).toBeGreaterThan(base.shotVolumeMod);
    const highPress = buildLineupProfile('C', players, '4-3-3', { autoMode: true, tactics: { defensive: 'BALANCED', offensive: 'POSSESSION', pressing: 100 } });
    expect(highPress.aggression).toBeGreaterThan(base.aggression);
  });

  it('tactical familiarity: absent/full is neutral, a freshly-changed shape plays below itself', () => {
    const players = squad();
    const base = buildLineupProfile('C', players, '4-3-3', { autoMode: true });
    const full = buildLineupProfile('C', players, '4-3-3', { autoMode: true, familiarity: 1 });
    expect(full.attack).toBeCloseTo(base.attack, 6);
    expect(full.defense).toBeCloseTo(base.defense, 6);
    expect(full.midfield).toBeCloseTo(base.midfield, 6);

    const rusty = buildLineupProfile('C', players, '4-3-3', { autoMode: true, familiarity: 0.35 });
    expect(rusty.attack).toBeLessThan(base.attack);
    expect(rusty.defense).toBeLessThan(base.defense);
    expect(rusty.midfield).toBeLessThan(base.midfield);
    // Never a big swing — a couple of percent at the floor.
    expect(rusty.attack).toBeGreaterThan(base.attack * 0.95);
  });

  it('every position has a neutral default role first', () => {
    for (const [pos, roles] of Object.entries(ROLES_BY_POSITION)) {
      const first = roles[0];
      const mod = roleModFor(pos as never, first.id);
      expect(mod).toEqual({ atk: 1, def: 1, mid: 1, scorer: 1, creator: 1, shotVol: 0, chanceQual: 0 });
    }
  });
});
