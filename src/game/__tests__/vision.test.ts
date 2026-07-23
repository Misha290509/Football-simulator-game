import { describe, it, expect } from 'vitest';
import { pickVision, reviewVision, MANDATE_LABEL, type VisionContext } from '../board';
import type { Club } from '../../types/club';

const club = (rep: number): Club => ({
  id: 'C', name: 'Club', shortName: 'C', abbrev: 'CLB', countryId: 'EN',
  crestSeed: 'x', primaryColor: '#000', secondaryColor: '#fff',
  stadium: { name: 'G', capacity: 1 }, reputation: rep,
  finances: { balance: 0, transferBudget: 0, wageBudget: 0, wageBudgetUsed: 0 },
  playerIds: [], formation: '4-3-3', captainId: null,
});

const ctx = (o: Partial<VisionContext>): VisionContext => ({
  goalsFor: 50, played: 38, position: 6, leagueSize: 20, wonTrophy: false, youthCount: 1, balance: 0, relegated: false, ...o,
});

describe('club vision mandates (#43)', () => {
  it('assigns bigger clubs silverware/attacking, smaller clubs youth/prudence', () => {
    expect(pickVision(club(88)).mandates).toContain('SILVERWARE');
    expect(pickVision(club(50)).mandates).toContain('PRUDENCE');
    // Every mandate is labelled.
    for (const m of pickVision(club(70)).mandates) expect(MANDATE_LABEL[m]).toBeTruthy();
  });

  it('rewards honouring the vision with a positive confidence nudge', () => {
    const v = pickVision(club(88)); // SILVERWARE + ATTACKING
    const good = reviewVision(v, ctx({ wonTrophy: true, position: 1, goalsFor: 95, played: 38 }));
    expect(good.confidenceDelta).toBeGreaterThan(0);
    expect(good.vision.seasonsJudged).toBe(1);
    expect(good.summary).toMatch(/vision review/i);
  });

  it('penalises betraying the vision', () => {
    const v = pickVision(club(88));
    const bad = reviewVision(v, ctx({ wonTrophy: false, position: 17, goalsFor: 22, played: 38 }));
    expect(bad.confidenceDelta).toBeLessThan(0);
  });

  it('smooths ratings across seasons (EMA) rather than jumping', () => {
    let v = pickVision(club(70)); // ATTACKING + YOUTH, both start at 50
    v = reviewVision(v, ctx({ goalsFor: 95, played: 38, youthCount: 3 })).vision;
    const after1 = v.scores.YOUTH;
    v = reviewVision(v, ctx({ goalsFor: 20, played: 38, youthCount: 0 })).vision;
    // A single bad season doesn't crater a previously-strong rating.
    expect(v.scores.YOUTH).toBeLessThan(after1);
    expect(v.scores.YOUTH).toBeGreaterThan(0);
    expect(v.seasonsJudged).toBe(2);
  });
});
