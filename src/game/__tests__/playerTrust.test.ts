import { describe, it, expect } from 'vitest';
import {
  playerSelectionWeight, trustFromMatch, applyMatchdayToCareer, PAR_MATCH_RATING,
  selectionMomentum, avatarSelectionBias,
} from '../playerCareer';
import type { PlayerCareer } from '../../types/playerCareer';
import type { Player } from '../../types/player';

function career(trust: number, status: PlayerCareer['status'] = 'YOUTH'): PlayerCareer {
  return {
    playerId: 'a', origin: 'CREATED', archetype: 'Academy Graduate',
    managerTrust: trust, status, clubRelationship: 50, fanRating: 50, following: 0,
    seasonGoals: 0, seasonApps: 0, seasonAvgRating: 0, objectives: [], traits: [],
    personality: { professionalism: 55, ambition: 60, loyalty: 55, temperament: 50 },
    sponsorships: [], international: { capped: false, caps: 0, intlGoals: 0 },
    milestones: [], seasonHistory: [],
  };
}

describe('playerSelectionWeight', () => {
  it('rises monotonically with trust and is centred at 50', () => {
    expect(playerSelectionWeight(career(50))).toBeCloseTo(0, 5);
    expect(playerSelectionWeight(career(80))).toBeGreaterThan(playerSelectionWeight(career(50)));
    expect(playerSelectionWeight(career(20))).toBeLessThan(playerSelectionWeight(career(50)));
  });

  it('stays modest at the extremes (never a runaway advantage)', () => {
    expect(playerSelectionWeight(career(100))).toBeLessThanOrEqual(12);
    expect(playerSelectionWeight(career(0))).toBeGreaterThanOrEqual(-12);
  });

  it('a higher squad status adds a small selection floor', () => {
    expect(playerSelectionWeight(career(50, 'KEY'))).toBeGreaterThan(playerSelectionWeight(career(50, 'YOUTH')));
  });
});

describe('trustFromMatch', () => {
  it('a par rating barely moves trust', () => {
    expect(trustFromMatch(50, PAR_MATCH_RATING)).toBeCloseTo(50, 5);
  });

  it('a strong game raises trust; a poor one lowers it', () => {
    expect(trustFromMatch(50, 8.5)).toBeGreaterThan(50);
    expect(trustFromMatch(50, 5.0)).toBeLessThan(50);
  });

  it('caps the per-match swing and clamps to [0,100]', () => {
    expect(trustFromMatch(50, 10)).toBeLessThanOrEqual(53.5 + 1e-9);
    expect(trustFromMatch(99, 10)).toBeLessThanOrEqual(100);
    expect(trustFromMatch(1, 0)).toBeGreaterThanOrEqual(0);
  });

  it('is recoverable — a good run climbs back out of a slump', () => {
    let t = 30;
    for (let i = 0; i < 8; i++) t = trustFromMatch(t, 8.0);
    expect(t).toBeGreaterThan(40);
  });
});

function player(over: Partial<Player> = {}): Player {
  return {
    id: 'a', name: { first: 'Al', last: 'Hunter' }, position: 'ST', positions: ['ST'],
    overall: 72, form: 0, fitness: 90, injury: null, cards: { suspendedFor: 0 } as never,
    contract: { clubId: 'C' }, born: { year: 2003 }, ...over,
  } as unknown as Player;
}

describe('selectionMomentum (the week-to-week shirt battle)', () => {
  it('a hot streak of form + ratings pushes selection up; a cold one pushes it down', () => {
    const base = career(50);
    const hot = selectionMomentum({ ...base, recentRatings: [8, 8.2, 7.8] }, player({ form: 25 }), []);
    const cold = selectionMomentum({ ...base, recentRatings: [5, 5.2, 5.5] }, player({ form: -25 }), []);
    expect(hot).toBeGreaterThan(0);
    expect(cold).toBeLessThan(0);
    expect(hot).toBeGreaterThan(cold);
  });

  it('an undercooked return after injury (low sharpness) dents the case', () => {
    const sharp = selectionMomentum({ ...career(50), matchSharpness: 100 }, player(), []);
    const rusty = selectionMomentum({ ...career(50), matchSharpness: 40 }, player(), []);
    expect(rusty).toBeLessThan(sharp);
  });

  it('the specific rival being sidelined throws the shirt open', () => {
    const squad = [player(), player({ id: 'riv', form: 0, injury: { severity: 'MINOR' } as never })];
    const withRival = { ...career(50), rival: { playerId: 'riv', relationship: 0 } };
    const boost = selectionMomentum(withRival, player(), squad);
    const noRival = selectionMomentum(career(50), player(), squad);
    expect(boost).toBeGreaterThan(noRival);
  });
});

describe('avatarSelectionBias (manager style tilts the earned bias)', () => {
  it('a loyal manager backs a trusted player harder than a ruthless one', () => {
    const c = career(80, 'KEY');
    const loyal = avatarSelectionBias({ ...c, managerStyle: 'LOYAL' }, player(), []);
    const ruthless = avatarSelectionBias({ ...c, managerStyle: 'RUTHLESS' }, player(), []);
    expect(loyal).toBeGreaterThan(ruthless);
  });
});

describe('applyMatchdayToCareer', () => {
  it('averages the ratings of games actually played', () => {
    const before = career(50);
    const after = applyMatchdayToCareer(before, [8.0, 8.0]);
    expect(after.managerTrust).toBeGreaterThan(50);
  });

  it('leaves trust unchanged when the avatar did not feature', () => {
    const before = career(44);
    expect(applyMatchdayToCareer(before, []).managerTrust).toBe(44);
  });
});
