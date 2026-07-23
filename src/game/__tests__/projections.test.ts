import { describe, it, expect } from 'vitest';
import { projectLeague } from '../projections';
import type { Competition } from '../../types/competition';
import type { Club } from '../../types/club';
import type { Match } from '../../types/match';
import type { StandingRow } from '../../types/league';

const comp = { id: 'L', tier: 1, promotion: { autoPromote: 4, autoRelegate: 3, promotionPlayoffSlots: 0 } } as unknown as Competition;

function club(id: string, rep: number): Club { return { id, reputation: rep } as unknown as Club; }
function row(id: string, points: number): StandingRow { return { clubId: id, played: 10, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points }; }
function fixture(h: string, a: string): Match { return { id: `${h}${a}`, competitionId: 'L', homeClubId: h, awayClubId: a, played: false } as unknown as Match; }

describe('season projections', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  const clubs: Record<string, Club> = { a: club('a', 85), b: club('b', 80), c: club('c', 70), d: club('d', 65), e: club('e', 55), f: club('f', 50) };
  // Everyone level on points, a full round of remaining fixtures.
  const rows = ids.map((id) => row(id, 10));
  const remaining: Match[] = [];
  for (let i = 0; i < ids.length; i++) for (let j = 0; j < ids.length; j++) if (i !== j) remaining.push(fixture(ids[i], ids[j]));

  it('probabilities sum to ~1 across the table for title and relegation', () => {
    const p = projectLeague(comp, rows, remaining, clubs, 42);
    const titleSum = p.reduce((s, x) => s + x.title, 0);
    const relSum = p.reduce((s, x) => s + x.relegation, 0);
    expect(titleSum).toBeGreaterThan(0.98);
    expect(titleSum).toBeLessThan(1.02);
    expect(relSum).toBeGreaterThan(2.9); // 3 relegation spots
    expect(relSum).toBeLessThan(3.1);
  });

  it('the strongest club is likeliest to win, the weakest likeliest to go down', () => {
    const p = projectLeague(comp, rows, remaining, clubs, 42);
    const byId = new Map(p.map((x) => [x.clubId, x]));
    expect(byId.get('a')!.title).toBeGreaterThan(byId.get('f')!.title);
    expect(byId.get('f')!.relegation).toBeGreaterThan(byId.get('a')!.relegation);
  });

  it('is deterministic for a given seed', () => {
    const a = projectLeague(comp, rows, remaining, clubs, 7);
    const b = projectLeague(comp, rows, remaining, clubs, 7);
    expect(a).toEqual(b);
  });
});
