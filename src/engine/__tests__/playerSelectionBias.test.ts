import { describe, it, expect } from 'vitest';
import { assignXI } from '../lineup';
import { generatePlayer } from '../generator';
import { Rng } from '../rng';
import type { Player } from '../../types/player';

// A squad big enough to leave players on the bench for a 4-3-3.
function squad(seed: number): Player[] {
  const rng = new Rng(seed);
  const spec: [Player['position'], number][] = [
    ['GK', 70], ['GK', 62],
    ['RB', 72], ['RCB', 74], ['LCB', 73], ['LB', 71], ['RB', 68], ['LCB', 66],
    ['CDM', 75], ['CM', 74], ['CAM', 73], ['CM', 70], ['CDM', 67],
    ['RW', 76], ['ST', 78], ['LW', 75], ['ST', 71], ['RW', 66],
  ];
  return spec.map(([position, target], i) => {
    const p = generatePlayer({ rng, currentYear: 2025, target, position, ageRange: [22, 29], ratingCap: 90 });
    p.id = `pl_${i}`;
    return p;
  });
}

const idsOf = (xi: ReturnType<typeof assignXI>) => new Set(xi.filter(Boolean).map((s) => s!.player.id));

describe('Selection bias (Player Career selection model)', () => {
  it('a large positive bias forces a benched player into the XI', () => {
    const players = squad(1);
    const base = idsOf(assignXI(players, '4-3-3', { autoMode: true }));
    const benched = players.find((p) => !base.has(p.id))!;
    expect(benched).toBeTruthy();

    const withBias = idsOf(assignXI(players, '4-3-3', { autoMode: true, selectionBias: { [benched.id]: 100 } }));
    expect(withBias.has(benched.id)).toBe(true);
  });

  it('a large negative bias drops a starter from the XI', () => {
    const players = squad(2);
    const base = idsOf(assignXI(players, '4-3-3', { autoMode: true }));
    const starter = players.find((p) => base.has(p.id) && p.position !== 'GK')!;

    const withBias = idsOf(assignXI(players, '4-3-3', { autoMode: true, selectionBias: { [starter.id]: -100 } }));
    expect(withBias.has(starter.id)).toBe(false);
  });

  it('no bias leaves selection identical (deterministic, no side effects)', () => {
    const players = squad(3);
    const a = [...idsOf(assignXI(players, '4-3-3', { autoMode: true }))].sort();
    const b = [...idsOf(assignXI(players, '4-3-3', { autoMode: true, selectionBias: {} }))].sort();
    expect(a).toEqual(b);
  });
});
