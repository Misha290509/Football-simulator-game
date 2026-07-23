import { describe, it, expect } from 'vitest';
import { assignXI, slotPenalty } from '../lineup';
import { positionalScarcityBoost, avatarSelectionBias } from '../../game/playerCareer';
import { generatePlayer } from '../generator';
import { Rng } from '../rng';
import type { Player } from '../../types/player';

function mk(position: Player['position'], overall: number, id: string): Player {
  const p = generatePlayer({ rng: new Rng(overall * 13 + id.length), currentYear: 2025, target: overall, position, ageRange: [24, 27], ratingCap: 90 });
  p.id = id; p.overall = overall; p.contract.clubId = 'C';
  return p;
}

describe('wide-role adjacency (winger ↔ wide midfielder)', () => {
  it('a natural RW takes only a small penalty at RM, not the full cross-group hit', () => {
    const rw = mk('RW', 64, 'rw');
    // RW is ATT, RM is MID — previously a 14-point penalty; now a small one.
    expect(slotPenalty(rw, 'RM')).toBeLessThanOrEqual(4);
    expect(slotPenalty(rw, 'RM')).toBeLessThan(slotPenalty(rw, 'CDM'));
  });

  it('the sole natural winger, with his career bias, makes a same-level 4-3-3 XI', () => {
    // A ~72-level squad; the avatar (66) is the club's only natural winger.
    const squad: Player[] = [
      mk('GK', 72, 'gk'),
      mk('LB', 72, 'lb'), mk('LCB', 73, 'lcb'), mk('RCB', 72, 'rcb'), mk('RB', 71, 'rb'),
      mk('CDM', 73, 'dm'), mk('CM', 72, 'cm1'), mk('CAM', 72, 'cam'),
      mk('LW', 72, 'lw'), mk('ST', 74, 'st'),
      mk('RW', 66, 'avatar'), // the only right winger, below the squad's level
      mk('CM', 71, 'cm2'), mk('RCB', 70, 'x1'), mk('CM', 70, 'x2'),
    ];
    const avatar = squad.find((p) => p.id === 'avatar')!;
    const bias = { avatar: avatarSelectionBias({ managerTrust: 50, status: 'ROTATION' }, avatar, squad) };
    const xi = assignXI(squad, '4-3-3', { autoMode: true, selectionBias: bias }).filter(Boolean).map((s) => s!.player.id);
    expect(xi).toContain('avatar');
  });

  it('a sole natural winger makes a winger-less (4-4-2) XI', () => {
    // A squad that plays 4-4-2 (RM/LM, no RW/LW slot) with one natural RW.
    const squad: Player[] = [
      mk('GK', 66, 'gk'),
      mk('LB', 65, 'lb'), mk('LCB', 66, 'lcb'), mk('RCB', 66, 'rcb'), mk('RB', 65, 'rb'),
      mk('LM', 64, 'lm'), mk('CM', 66, 'cm1'), mk('CM', 65, 'cm2'),
      mk('ST', 67, 'st1'), mk('ST', 65, 'st2'),
      mk('RW', 64, 'avatar'), // the only right-sided wide option
      mk('CM', 63, 'cm3'), mk('LCB', 60, 'sub'),
    ];
    const xi = assignXI(squad, '4-4-2', { autoMode: true }).filter(Boolean).map((s) => s!.player.id);
    expect(xi).toContain('avatar');
  });
});

describe('positional scarcity boost', () => {
  it('rewards the club’s only/best specialist in a role', () => {
    const avatar = mk('RW', 64, 'av');
    const noRival = [avatar, mk('ST', 70, 'x'), mk('CM', 72, 'y')];
    expect(positionalScarcityBoost(avatar, noRival)).toBe(5);

    const oneBetter = [avatar, mk('RW', 68, 'rw2'), mk('ST', 70, 'x')];
    expect(positionalScarcityBoost(avatar, oneBetter)).toBe(2);

    const twoBetter = [avatar, mk('RW', 68, 'rw2'), mk('RW', 70, 'rw3')];
    expect(positionalScarcityBoost(avatar, twoBetter)).toBe(0);
  });

  it('the full avatar bias folds trust, status and scarcity together', () => {
    const avatar = mk('RW', 64, 'av');
    const squad = [avatar, mk('ST', 70, 'x')];
    const bias = avatarSelectionBias({ managerTrust: 50, status: 'ROTATION' }, avatar, squad);
    expect(bias).toBeGreaterThan(5); // scarcity (5) + rotation status (1)
  });
});
