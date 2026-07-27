import { describe, it, expect } from 'vitest';
import {
  deriveConditions, conditionsFactor, conditionsFatigue, crowdFlowPenalty,
  buildScoutReport, scoutFactor, lateLegsFactor,
  isExplosiveChoice, fatigueLevel, fatigueGateFactor, FATIGUE_GATE, clarityLevel, fuzzyDescriptor,
  type MatchConditions,
} from '../matchConditions';
import type { Club } from '../../types/club';
import type { Player } from '../../types/player';
import type { MomentChoice } from '../../types/interactiveMatch';

const club = (id: string, reputation: number): Club => ({ id, name: id, shortName: id, reputation } as unknown as Club);
const cond = (over: Partial<MatchConditions> = {}): MatchConditions =>
  ({ weather: 'CLEAR', pitch: 'PRISTINE', hostility: 0, altitude: false, attendance: 40000, label: '', ...over });

const choice = (over: Partial<MomentChoice> = {}): MomentChoice =>
  ({ id: 'c', label: 'c', risk: 'BALANCED', attributes: [], baseSuccess: 0.4, reward: 'GOAL', ...over } as MomentChoice);

describe('conditions', () => {
  it('are deterministic for a fixture', () => {
    const a = deriveConditions('m1', 7, 100, 300, club('C', 70), false);
    const b = deriveConditions('m1', 7, 100, 300, club('C', 70), false);
    expect(a).toEqual(b);
  });

  it('only the away side faces a hostile crowd, and only at a big ground', () => {
    expect(deriveConditions('m1', 7, 100, 300, club('C', 90), true).hostility).toBe(0);
    expect(deriveConditions('m1', 7, 100, 300, club('C', 90), false).hostility).toBeGreaterThan(0);
    expect(deriveConditions('m1', 7, 100, 300, club('C', 55), false).hostility).toBe(0);
  });

  it('rain and a rutted pitch hurt control; a dry pitch helps slightly', () => {
    expect(conditionsFactor(cond({ weather: 'HEAVY_RAIN' }), 'TAKE_ON', 'KEY_PASS')).toBeLessThan(1);
    expect(conditionsFactor(cond({ pitch: 'RUTTED' }), 'TAKE_ON', 'KEY_PASS')).toBeLessThan(1);
    expect(conditionsFactor(cond({ pitch: 'DRY' }), 'TAKE_ON', 'KEY_PASS')).toBeGreaterThan(1);
    expect(conditionsFactor(cond(), 'TAKE_ON', 'KEY_PASS')).toBe(1);
  });

  it('wind hurts aerial moments', () => {
    expect(conditionsFactor(cond({ weather: 'WIND' }), 'HEADER', 'GOAL')).toBeLessThan(1);
  });

  it('altitude and heat drain the legs', () => {
    expect(conditionsFatigue(cond({ altitude: true }))).toBeGreaterThan(0);
    expect(conditionsFatigue(cond({ weather: 'HEAT' }))).toBeGreaterThan(0);
    expect(conditionsFatigue(cond())).toBe(0);
  });

  it('a hostile crowd suppresses flow unless big-game temperament is high', () => {
    const nervy = crowdFlowPenalty(cond({ hostility: 1 }), 40);
    const ice = crowdFlowPenalty(cond({ hostility: 1 }), 100);
    expect(nervy).toBeGreaterThan(0);
    expect(ice).toBe(0);
    expect(nervy).toBeGreaterThan(ice);
  });
});

function squad(): Player[] {
  const mk = (id: string, pos: Player['position'], overall: number, attrs: Record<string, Record<string, number>>): Player =>
    ({ id, name: { first: 'A', last: id }, position: pos, positions: [pos], overall, attributes: attrs, cards: { yellow: 0, red: 0, suspendedFor: 0 } } as unknown as Player);
  return [
    mk('gk', 'GK', 70, { goalkeeping: { gkReflexes: 62, gkPositioning: 60 }, technical: {}, mental: {}, physical: {} }),
    mk('cb', 'RCB', 68, { technical: { headingAccuracy: 70 }, mental: {}, physical: { sprintSpeed: 60 }, goalkeeping: {} }),
    mk('st', 'ST', 80, { technical: {}, mental: {}, physical: { sprintSpeed: 85 }, goalkeeping: {} }),
  ];
}

describe('scouting report', () => {
  it('is deterministic and produces up to three grounded notes', () => {
    const a = buildScoutReport('m1', 7, squad());
    const b = buildScoutReport('m1', 7, squad());
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
    expect(a.length).toBeLessThanOrEqual(3);
    for (const n of a) { expect(n.text.length).toBeGreaterThan(0); expect(n.hint.length).toBeGreaterThan(0); }
  });

  it('reads a weak keeper off the actual opposition', () => {
    const notes = buildScoutReport('m1', 7, squad()); // gk positioning 60 → dives early
    expect(notes.some((n) => n.tag === 'KEEPER_DIVES_EARLY')).toBe(true);
  });

  it('exploiting a scouted weakness improves the right choice', () => {
    const notes = [{ tag: 'KEEPER_DIVES_EARLY' as const, text: '', hint: '' }];
    expect(scoutFactor(notes, 'ONE_ON_ONE', 'dink', 'GOAL')).toBeGreaterThan(1);
    expect(scoutFactor(notes, 'ONE_ON_ONE', 'slot', 'GOAL')).toBe(1); // not the exploit
    // A dominant aerial CB makes headers worse, not better.
    expect(scoutFactor([{ tag: 'CB_DOMINANT_AIR' as const, text: '', hint: '' }], 'HEADER', 'power', 'GOAL')).toBeLessThan(1);
    expect(scoutFactor(undefined, 'HEADER', 'power', 'GOAL')).toBe(1);
  });

  it('tiring opponents only help late', () => {
    const notes = [{ tag: 'TIRING_LEGS' as const, text: '', hint: '' }];
    expect(lateLegsFactor(notes, 30)).toBe(1);
    expect(lateLegsFactor(notes, 80)).toBeGreaterThan(1);
  });
});

describe('fatigue gating', () => {
  it('flags explosive choices', () => {
    expect(isExplosiveChoice('RUN_IN_BEHIND', choice())).toBe(true);
    expect(isExplosiveChoice('LONG_SHOT', choice({ reward: 'GOAL' }))).toBe(true);
    expect(isExplosiveChoice('ONE_ON_ONE', choice({ signature: true }))).toBe(true);
    expect(isExplosiveChoice('RETENTION_PASS', choice({ reward: 'RETAIN' }))).toBe(false);
  });

  it('rises with the minute, low fitness and hard conditions', () => {
    expect(fatigueLevel(100, 10)).toBeLessThan(fatigueLevel(100, 85));
    expect(fatigueLevel(100, 60)).toBeLessThan(fatigueLevel(55, 60));
    expect(fatigueLevel(100, 60)).toBeLessThan(fatigueLevel(100, 60, cond({ altitude: true })));
  });

  it('penalises explosive options only once genuinely gassed', () => {
    expect(fatigueGateFactor(0.3, true)).toBe(1);
    expect(fatigueGateFactor(0.95, false)).toBe(1); // non-explosive is unaffected
    expect(fatigueGateFactor(0.95, true)).toBeLessThan(1);
    expect(fatigueGateFactor(FATIGUE_GATE + 0.3, true)).toBeLessThan(fatigueGateFactor(FATIGUE_GATE + 0.05, true));
  });
});

describe('instinct vs information', () => {
  it('keeps clarity when calm, loses it under heat — unless he has the temperament', () => {
    expect(clarityLevel(0, 50, 50, 0)).toBe(1);
    const nervy = clarityLevel(1, 30, 40, 0.8);
    const cool = clarityLevel(1, 95, 90, 0.8);
    expect(nervy).toBeLessThan(1);
    expect(cool).toBeGreaterThan(nervy);
  });

  it('fuzzy descriptors are stable per choice', () => {
    expect(fuzzyDescriptor('dink', 'm1')).toBe(fuzzyDescriptor('dink', 'm1'));
    expect(fuzzyDescriptor('dink', 'm1').length).toBeGreaterThan(0);
  });
});
