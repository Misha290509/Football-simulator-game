import { describe, it, expect } from 'vitest';
import { accrueHonours, dynastyBoard, honoursTotal } from '../dynasty';
import type { Award } from '../../types/league';

const award = (type: Award['type'], clubId?: string): Award => ({ type, label: type, seasonId: 's', clubId });

describe('dynasty & all-time records (#53)', () => {
  it('accrues only the three club trophies, ignoring individual gongs', () => {
    const h = accrueHonours(undefined, [
      award('LEAGUE_CHAMPION', 'A'),
      award('DOMESTIC_CUP', 'A'),
      award('CONTINENTAL', 'A'),
      award('GOLDEN_BOOT', 'A'), // ignored
      award('MANAGER_OF_YEAR', 'A'), // ignored
      award('LEAGUE_CHAMPION'), // no club → ignored
    ]);
    expect(h.A).toEqual({ league: 1, cup: 1, continental: 1 });
    expect(honoursTotal(h.A)).toBe(3);
  });

  it('accumulates across seasons without rescanning', () => {
    let h = accrueHonours(undefined, [award('LEAGUE_CHAMPION', 'A')]);
    h = accrueHonours(h, [award('LEAGUE_CHAMPION', 'A'), award('DOMESTIC_CUP', 'B')]);
    h = accrueHonours(h, [award('CONTINENTAL', 'A')]);
    expect(h.A).toEqual({ league: 2, cup: 0, continental: 1 });
    expect(h.B).toEqual({ league: 0, cup: 1, continental: 0 });
  });

  it('ranks the most-decorated clubs, breaking ties on league titles', () => {
    const h = {
      A: { league: 3, cup: 1, continental: 1 }, // total 5
      B: { league: 5, cup: 0, continental: 0 }, // total 5, more leagues → ranks above A
      C: { league: 0, cup: 1, continental: 0 }, // total 1
    };
    const board = dynastyBoard(h);
    expect(board.map((r) => r.clubId)).toEqual(['B', 'A', 'C']);
    expect(board[0].total).toBe(5);
  });

  it('omits clubs with no silverware and respects the limit', () => {
    const h = { A: { league: 1, cup: 0, continental: 0 }, Z: { league: 0, cup: 0, continental: 0 } };
    const board = dynastyBoard(h, 1);
    expect(board.length).toBe(1);
    expect(board[0].clubId).toBe('A');
  });
});
