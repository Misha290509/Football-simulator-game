import { describe, it, expect } from 'vitest';
import { buildOppositionReport } from '../oppositionReport';
import { FORMATIONS } from '../../engine/lineup';
import { generatePlayer } from '../../engine/generator';
import { Rng } from '../../engine/rng';
import type { Club } from '../../types/club';
import type { Player } from '../../types/player';

function squad(clubId: string, formation: string): Player[] {
  const rng = new Rng(7);
  return FORMATIONS[formation].map((pos, i) => {
    const p = generatePlayer({ rng, currentYear: 2025, target: 74, position: pos, ageRange: [24, 28], ratingCap: 90 });
    p.id = `${clubId}_${i}`; p.contract.clubId = clubId;
    return p;
  });
}

function club(formation: string): Club {
  return {
    id: 'OPP', name: 'Opp FC', shortName: 'Opp', abbrev: 'OPP', countryId: 'EN',
    crestSeed: 'x', primaryColor: '#000', secondaryColor: '#fff',
    stadium: { name: 'Ground', capacity: 20000 }, reputation: 60,
    finances: { balance: 0, transferBudget: 0, wageBudget: 0, wageBudgetUsed: 0 },
    playerIds: [], formation, captainId: null,
  };
}

describe('opposition report — tactical dossier (#12)', () => {
  it('reports the opponent shape and omits a matchup line when no shape is supplied', () => {
    const r = buildOppositionReport(club('4-4-2'), squad('OPP', '4-4-2'), []);
    expect(r.formation).toBe('4-4-2');
    expect(r.matchup).toBeUndefined();
    expect(r.onesToWatch.length).toBeGreaterThan(0);
  });

  it('reads an even matchup when both play the same shape', () => {
    const r = buildOppositionReport(club('4-3-3'), squad('OPP', '4-3-3'), [], '4-3-3');
    expect(r.matchup).toMatch(/no shape advantage/i);
  });

  it('flags a favourable matchup for a heavier midfield', () => {
    // Your 4-3-3 (3 central) vs their 4-4-2 (2 central) — a shape edge.
    const r = buildOppositionReport(club('4-4-2'), squad('OPP', '4-4-2'), [], '4-3-3');
    expect(r.matchup).toMatch(/shade the tactical battle/i);
  });

  it('warns when the opponent shape matches up well against yours', () => {
    const r = buildOppositionReport(club('4-3-3'), squad('OPP', '4-3-3'), [], '4-4-2');
    expect(r.matchup).toMatch(/consider adjusting your shape/i);
  });
});
