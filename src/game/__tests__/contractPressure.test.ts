import { describe, it, expect } from 'vitest';
import {
  CLAUSES, negotiatingPower, negotiateClauses, canRunDown, declareRunDown, runDownDrip,
  maybeExile, exileDrip, endExile, forcedSaleNews, failedMedicalNews,
} from '../contractPressure';
import type { Player } from '../../types/player';
import type { PlayerCareer, SquadStatus } from '../../types/playerCareer';

const player = (over: Partial<Player> = {}): Player =>
  ({ id: 'me', name: { first: 'Alex', last: 'Hunter' }, overall: 82,
     contract: { clubId: 'C', expiresYear: 2028, wage: 50000 }, ...over } as unknown as Player);
const career = (status: SquadStatus, over: Partial<PlayerCareer> = {}): PlayerCareer =>
  ({ playerId: 'me', status, managerTrust: 70, fanRating: 60, clubRelationship: 60,
     matchSharpness: 100, confidence: 60, ...over } as unknown as PlayerCareer);

describe('negotiating power', () => {
  it('rises with status, ability, trust and outside interest', () => {
    const weak = negotiatingPower(career('ROTATION'), player({ overall: 68 }));
    const strong = negotiatingPower(career('STAR', { transferInterest: [{}, {}, {}, {}] as never }), player({ overall: 88 }));
    expect(weak).toBeLessThan(strong);
    expect(strong).toBeLessThanOrEqual(1);
    expect(weak).toBeGreaterThanOrEqual(0);
  });
});

describe('clause negotiation', () => {
  it('grants the cheap asks first and refuses what he cannot back up', () => {
    const junior = career('ROTATION', { managerTrust: 45 });
    const r = negotiateClauses(junior, player({ overall: 70 }), ['RELEASE', 'APPEARANCE_BONUS'], 10);
    // Appearance bonus is cheap; a release clause is not.
    expect(r.granted).toContain('APPEARANCE_BONUS');
    expect(r.refused).toContain('RELEASE');
    expect(r.news.length).toBeGreaterThan(0);
  });

  it('a star can win the expensive clauses', () => {
    const star = career('STAR', { managerTrust: 90, transferInterest: [{}, {}, {}, {}] as never });
    const r = negotiateClauses(star, player({ overall: 90 }), ['RELEASE'], 10);
    expect(r.granted).toContain('RELEASE');
  });

  it('every clause is well-formed', () => {
    for (const c of CLAUSES) {
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.cost).toBeGreaterThan(0);
      expect(c.cost).toBeLessThanOrEqual(1);
    }
  });
});

describe('running down the contract', () => {
  it('is only possible in the final year', () => {
    expect(canRunDown(player({ contract: { clubId: 'C', expiresYear: 2030 } } as never), 2025)).toBe(false);
    expect(canRunDown(player({ contract: { clubId: 'C', expiresYear: 2026 } } as never), 2025)).toBe(true);
  });

  it('costs him the fans and the club relationship', () => {
    const r = declareRunDown(career('STAR'), player(), 10);
    expect(r.career.runDown!.declared).toBe(true);
    expect(r.career.fanRating!).toBeLessThan(60);
    expect(r.career.clubRelationship!).toBeLessThan(60);
    expect(r.news[0].title).toMatch(/won.t sign/i);
  });

  it('keeps dripping fan anger while it runs', () => {
    const c = declareRunDown(career('STAR'), player(), 10).career;
    const before = c.fanRating!;
    const drip = runDownDrip(c, 40);
    expect(drip.career.fanRating!).toBeLessThan(before);
    // No run-down declared → nothing happens.
    expect(runDownDrip(career('STAR'), 40).news).toHaveLength(0);
  });
});

describe('training-ground exile', () => {
  it('only happens after a transfer request, and a ruthless manager is likelier', () => {
    expect(maybeExile(career('KEY'), player(), 10, 7).career.exile ?? null).toBeNull();
    let ruthlessExiles = 0, loyalExiles = 0;
    for (let d = 0; d < 60; d++) {
      if (maybeExile(career('KEY', { transferRequestPending: true, managerStyle: 'RUTHLESS' }), player(), d, 7).career.exile) ruthlessExiles++;
      if (maybeExile(career('KEY', { transferRequestPending: true, managerStyle: 'LOYAL' }), player(), d, 7).career.exile) loyalExiles++;
    }
    expect(ruthlessExiles).toBeGreaterThan(loyalExiles);
  });

  it('rots sharpness, confidence and morale while it lasts', () => {
    const c = career('KEY', { exile: { since: 10, reason: 'x' } });
    const r = exileDrip(c, 40);
    expect(r.career.matchSharpness!).toBeLessThan(100);
    expect(r.career.confidence!).toBeLessThan(60);
    expect(r.moraleDelta).toBeLessThan(0);
  });

  it('ends with a lift when he comes back in from the cold', () => {
    const c = career('KEY', { exile: { since: 10, reason: 'x' } });
    const r = endExile(c, player(), 60);
    expect(r.career.exile).toBeNull();
    expect(r.moraleDelta).toBeGreaterThan(0);
    expect(r.news[0].title).toMatch(/back in from the cold/i);
  });
});

describe('forced moves', () => {
  it('produce readable beats', () => {
    expect(forcedSaleNews(player(), 'City', 'Rovers', 10).body).toContain('Rovers');
    expect(failedMedicalNews(player(), 'Rovers', 10).title).toMatch(/medical/i);
  });
});
