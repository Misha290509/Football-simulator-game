import { describe, it, expect } from 'vitest';
import { buildLineupProfile, FORMATIONS } from '../lineup';
import { generatePlayer } from '../generator';
import { Rng } from '../rng';
import type { Player } from '../../types/player';

function squad(): Player[] {
  const rng = new Rng(3);
  return FORMATIONS['4-3-3'].map((pos, i) => {
    const p = generatePlayer({ rng, currentYear: 2025, target: 80, position: pos, ageRange: [24, 28], ratingCap: 92 });
    p.id = `p${i}`; p.contract.clubId = 'C';
    return p;
  });
}

describe('set-piece routines (#13)', () => {
  it('no routine set is neutral (balance-preserving)', () => {
    const players = squad();
    const base = buildLineupProfile('C', players, '4-3-3', { autoMode: true });
    const withNothing = buildLineupProfile('C', players, '4-3-3', { autoMode: true, setPieceRoutine: {} });
    expect(withNothing.chanceQualityMod).toBeCloseTo(base.chanceQualityMod, 6);
    expect(withNothing.defense).toBeCloseTo(base.defense, 6);
  });

  it('a drilled attacking routine with a strong taker raises chance quality', () => {
    const players = squad();
    // Make a clearly excellent corner taker so the routine is a net positive.
    const taker = players[8]; // LW
    taker.attributes.technical.crossing = 92;
    taker.attributes.technical.curve = 90;
    taker.attributes.technical.shortPassing = 90;
    taker.attributes.mental.vision = 90;
    const base = buildLineupProfile('C', players, '4-3-3', { autoMode: true, setPieces: { cornerTakerId: taker.id } });
    const drilled = buildLineupProfile('C', players, '4-3-3', {
      autoMode: true,
      setPieces: { cornerTakerId: taker.id },
      setPieceRoutine: { corner: 'FAR' },
    });
    expect(drilled.chanceQualityMod).toBeGreaterThan(base.chanceQualityMod);
  });

  it('a marking scheme that suits the defenders firms up the defence', () => {
    const players = squad();
    // Beef up the centre-backs' man-marking profile.
    for (const cb of players.filter((p) => p.position === 'LCB' || p.position === 'RCB')) {
      cb.attributes.mental.marking = 90;
      cb.attributes.physical.strength = 90;
      cb.attributes.mental.aggression = 85;
    }
    const base = buildLineupProfile('C', players, '4-3-3', { autoMode: true });
    const drilled = buildLineupProfile('C', players, '4-3-3', { autoMode: true, setPieceRoutine: { marking: 'MAN' } });
    expect(drilled.defense).toBeGreaterThan(base.defense);
  });

  it('the effect is small — never more than a few percent', () => {
    const players = squad();
    for (const p of players) {
      p.attributes.technical.crossing = 99; p.attributes.technical.curve = 99;
      p.attributes.technical.fkAccuracy = 99; p.attributes.technical.shotPower = 99;
      p.attributes.technical.headingAccuracy = 99; p.attributes.physical.jumping = 99;
    }
    const base = buildLineupProfile('C', players, '4-3-3', { autoMode: true });
    const maxed = buildLineupProfile('C', players, '4-3-3', {
      autoMode: true,
      setPieces: { cornerTakerId: players[8].id, freeKickTakerId: players[9].id },
      setPieceRoutine: { corner: 'FAR', freeKick: 'SHOOT', marking: 'ZONAL' },
    });
    expect(maxed.chanceQualityMod).toBeLessThan(base.chanceQualityMod * 1.08);
  });
});
