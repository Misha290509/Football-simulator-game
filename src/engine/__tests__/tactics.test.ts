import { describe, it, expect } from 'vitest';
import { Rng } from '../rng';
import { generateSquad } from '../generator';
import {
  FORMATION_NAMES, FORMATIONS, formationRows, assignXI, buildLineupProfile, bestFormation,
} from '../lineup';

const squad = generateSquad({ rng: new Rng(11), currentYear: 2024, reputation: 75, clubId: 'A', nationality: 'GB' });

describe('Formations', () => {
  it('all back-four formations exist with 11 slots and valid row sums', () => {
    const want = ['4-1-2-1-2','4-1-4-1','4-2-3-1','4-5-1','4-2-4','4-3-3','4-4-1-1','4-4-2'];
    for (const f of want) {
      expect(FORMATION_NAMES).toContain(f);
      expect(FORMATIONS[f].length).toBe(11);
      // GK + outfield rows sum to 11.
      expect(1 + formationRows(f).reduce((a, b) => a + b, 0)).toBe(11);
      // Every formation uses a back four: LB, LCB, RCB, RB.
      expect(FORMATIONS[f].slice(1, 5)).toEqual(['LB', 'LCB', 'RCB', 'RB']);
    }
  });

  it('assignXI fills every slot index-aligned for a full squad', () => {
    const xi = assignXI(squad, '4-3-3', { autoMode: true });
    expect(xi.length).toBe(11);
    expect(xi.every((x) => x !== null)).toBe(true);
    expect(xi[0]!.slot).toBe('GK');
  });

  it('honors a manual lineup pick in the chosen slot', () => {
    const st = squad.find((p) => p.position === 'ST')!;
    const lineup: (string | null)[] = FORMATIONS['4-3-3'].map(() => null);
    lineup[9] = st.id; // a striker slot
    const xi = assignXI(squad, '4-3-3', { autoMode: false, lineup });
    expect(xi[9]!.player.id).toBe(st.id);
  });

  it('bestFormation returns one of the known formations', () => {
    expect(FORMATION_NAMES).toContain(bestFormation(squad));
  });
});

describe('Tactics modifiers', () => {
  it('direct increases shot volume vs possession; counter raises chance quality', () => {
    const direct = buildLineupProfile('A', squad, '4-3-3', { tactics: { defensive: 'BALANCED', offensive: 'DIRECT' } });
    const poss = buildLineupProfile('A', squad, '4-3-3', { tactics: { defensive: 'BALANCED', offensive: 'POSSESSION' } });
    const counter = buildLineupProfile('A', squad, '4-3-3', { tactics: { defensive: 'BALANCED', offensive: 'COUNTER' } });
    expect(direct.shotVolumeMod).toBeGreaterThan(poss.shotVolumeMod);
    expect(counter.chanceQualityMod).toBeGreaterThan(poss.chanceQualityMod);
  });

  it('deep raises defense and lowers attack vs pressing', () => {
    const deep = buildLineupProfile('A', squad, '4-3-3', { tactics: { defensive: 'DEEP', offensive: 'POSSESSION' } });
    const press = buildLineupProfile('A', squad, '4-3-3', { tactics: { defensive: 'PRESSING', offensive: 'POSSESSION' } });
    expect(deep.defense).toBeGreaterThan(press.defense);
    expect(press.attack).toBeGreaterThan(deep.attack);
  });
});

import { simulateMatch } from '../match';

describe('Substitutions', () => {
  const a = buildLineupProfile('A', squad, '4-3-3');
  const b = buildLineupProfile('B',
    generateSquad({ rng: new Rng(22), currentYear: 2024, reputation: 72, clubId: 'B', nationality: 'GB' }), '4-4-2');

  it('puts a bench on the profile', () => {
    expect(a.bench.length).toBeGreaterThan(0);
  });

  it('emits SUB events and gives subs partial minutes, deterministically', () => {
    const r1 = simulateMatch(a, b, 4242);
    const r2 = simulateMatch(a, b, 4242);
    expect(r1.events).toEqual(r2.events);
    const subs = r1.events.filter((e) => e.type === 'SUB');
    expect(subs.length).toBeGreaterThan(0);
    // A substitute who came on should have fewer than 90 minutes.
    const benchIds = new Set(a.bench.concat(b.bench).map((x) => x.playerId));
    const playedSub = r1.playerStats.find((s) => benchIds.has(s.playerId) && s.minutes > 0);
    expect(playedSub).toBeTruthy();
    expect(playedSub!.minutes).toBeLessThan(90);
  });
});
