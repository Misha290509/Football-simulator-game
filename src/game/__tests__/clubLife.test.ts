import { describe, it, expect } from 'vitest';
import {
  divisionMove, maybeTakeover, maybeCrisis, crisisDrip, shirtSales,
  classifyBigNight, giantKillingShame, finalNews,
} from '../clubLife';
import type { Player } from '../../types/player';
import type { Club } from '../../types/club';
import type { PlayerCareer } from '../../types/playerCareer';

function player(over: Partial<Player> = {}): Player {
  return {
    id: 'me', name: { first: 'Sam', last: 'Reid' }, position: 'ST', positions: ['ST'],
    overall: 75, nationality: 'eng', morale: 60, fitness: 100,
    born: { year: 2000, month: 1, day: 1 },
    contract: { clubId: 'C', wage: 40_000 },
    attributes: { technical: {}, mental: {}, physical: {}, goalkeeping: {} },
    hidden: { professionalism: 60, bigGame: 60, consistency: 60, injuryProneness: 40, ambition: 60, versatility: 60 },
    ...over,
  } as unknown as Player;
}
const career = (over: Partial<PlayerCareer> = {}): PlayerCareer =>
  ({ playerId: 'me', status: 'KEY', fanRating: 50, clubRelationship: 50, following: 0, ...over } as unknown as PlayerCareer);
const club = (over: Partial<Club> = {}): Club =>
  ({ id: 'C', name: 'Northgate City', shortName: 'NGC', reputation: 60, finances: { balance: 5_000_000 }, ...over } as unknown as Club);

describe('relegation & promotion', () => {
  it('cuts the wage by a quarter and forces a stay-or-go decision when the club goes down', () => {
    const p = player();
    const r = divisionMove(career(), p, club(), 'RELEGATED', 200);
    expect(r.player.contract.wage).toBe(30_000);
    expect(r.career.relegationClause).toEqual({ triggeredDay: 200, oldWage: 40_000, newWage: 30_000 });
    expect(r.moraleDelta).toBeLessThan(0);
    expect(r.conversation!.trigger).toBe('RELEGATION');
    expect(r.conversation!.choices).toHaveLength(3);
    // Loyalty buys goodwill; forcing a move burns it.
    expect(r.conversation!.choices[0].fanRating!).toBeGreaterThan(0);
    expect(r.conversation!.choices[2].fanRating!).toBeLessThan(0);
    expect(r.news[0].title).toMatch(/relegated/i);
  });

  it('leaves the wage alone and lifts the club on promotion', () => {
    const p = player();
    const r = divisionMove(career(), p, club(), 'PROMOTED', 200);
    expect(r.player.contract.wage).toBe(40_000);
    expect(r.player).toBe(p);
    expect(r.career.fanRating!).toBeGreaterThan(50);
    expect(r.career.clubRelationship!).toBeGreaterThan(50);
    expect(r.moraleDelta).toBeGreaterThan(0);
    expect(r.conversation).toBeNull();
    expect(r.news[0].category).toBe('MILESTONE');
  });
});

describe('takeovers', () => {
  const fired = (seed: number) => maybeTakeover(career(), player(), club(), 2030, 10, seed);

  it('is rare — most seasons pass with nothing happening', () => {
    let hits = 0;
    for (let s = 0; s < 400; s++) if (fired(s).career.owner) hits++;
    expect(hits).toBeGreaterThan(0);
    expect(hits / 400).toBeLessThan(0.2);
  });

  it('produces all three kinds of owner across seeds, each with matching morale', () => {
    const kinds = new Set<string>();
    for (let s = 0; s < 2000; s++) {
      const r = fired(s);
      const o = r.career.owner;
      if (!o) continue;
      kinds.add(o.kind);
      expect(o.since).toBe(10);
      expect(o.name.length).toBeGreaterThan(0);
      expect(r.news).toHaveLength(1);
      if (o.kind === 'BILLIONAIRE') expect(r.moraleDelta).toBeGreaterThan(0);
      if (o.kind === 'ASSET_STRIPPER') expect(r.moraleDelta).toBeLessThan(0);
    }
    expect(kinds).toEqual(new Set(['BILLIONAIRE', 'ASSET_STRIPPER', 'STEADY']));
  });

  it('is deterministic for the same club, season and seed', () => {
    // News ids carry a feed sequence counter; everything else must match exactly.
    const shape = (r: ReturnType<typeof fired>) =>
      JSON.stringify({ ...r, news: r.news.map(({ id: _id, ...n }) => n) });
    for (let s = 0; s < 50; s++) expect(shape(fired(s))).toBe(shape(fired(s)));
  });

  it('does nothing without a club', () => {
    const r = maybeTakeover(career(), player(), undefined, 2030, 10, 1);
    expect(r.career.owner).toBeUndefined();
    expect(r.news).toHaveLength(0);
  });
});

describe('financial crisis', () => {
  const solvent = club();
  const broke = club({ finances: { balance: -8_000_000 } as never });

  it('never strikes a solvent club under a normal owner', () => {
    for (let d = 0; d < 400; d++) {
      expect(maybeCrisis(career(), solvent, d, 7).career.crisis).toBeFalsy();
    }
  });

  it('strikes a club in the red, and more often under an asset-stripper', () => {
    const count = (c: PlayerCareer, cl: Club) => {
      let n = 0;
      for (let d = 0; d < 600; d++) if (maybeCrisis(c, cl, d, 7).career.crisis) n++;
      return n;
    };
    const broken = count(career(), broke);
    const stripped = count(career({ owner: { kind: 'ASSET_STRIPPER', since: 0, name: 'a trust' } } as never), solvent);
    expect(broken).toBeGreaterThan(0);
    expect(stripped).toBeGreaterThan(broken);
  });

  it('defers wages and offers a protest the player can join or duck', () => {
    let hit: ReturnType<typeof maybeCrisis> | null = null;
    for (let d = 0; d < 600 && !hit; d++) {
      const r = maybeCrisis(career(), broke, d, 7);
      if (r.career.crisis) hit = r;
    }
    expect(hit).not.toBeNull();
    expect(hit!.career.crisis!.wagesDeferred).toBe(true);
    expect(hit!.moraleDelta).toBeLessThan(0);
    expect(hit!.conversation!.trigger).toBe('PROTEST');
    // Siding with the fans costs you with the club, and vice versa.
    const [withFans, , withClub] = hit!.conversation!.choices;
    expect(withFans.fanRating!).toBeGreaterThan(0);
    expect(withFans.relationship!).toBeLessThan(0);
    expect(withClub.fanRating!).toBeLessThan(0);
    expect(withClub.relationship!).toBeGreaterThan(0);
  });

  it('does not stack a second crisis on top of one already running', () => {
    const running = career({ crisis: { since: 5, wagesDeferred: true, severity: 2 } } as never);
    for (let d = 0; d < 300; d++) {
      expect(maybeCrisis(running, broke, d, 7).career.crisis!.since).toBe(5);
    }
  });

  it('grinds on week to week, then resolves after roughly twenty weeks', () => {
    const c = career({ crisis: { since: 100, wagesDeferred: true, severity: 1 } } as never);
    const mid = crisisDrip(c, 170);
    expect(mid.career.crisis).toBeTruthy();
    expect(mid.moraleDelta).toBeLessThan(0);
    expect(mid.news).toHaveLength(0);

    const done = crisisDrip(c, 100 + 20 * 7);
    expect(done.career.crisis).toBeNull();
    expect(done.moraleDelta).toBeGreaterThan(0);
    expect(done.news[0].title).toMatch(/stable/i);
  });

  it('is inert with no crisis running', () => {
    const r = crisisDrip(career(), 50);
    expect(r.news).toHaveLength(0);
    expect(r.moraleDelta).toBe(0);
  });
});

describe('shirt sales', () => {
  it('stays quiet until he is genuinely famous', () => {
    expect(shirtSales(career({ following: 50_000, fanRating: 55 }), player(), 10).career.topShirtSeller).toBeFalsy();
  });

  it('fires once past the fame threshold', () => {
    const r = shirtSales(career({ following: 250_000, fanRating: 80 }), player(), 10);
    expect(r.career.topShirtSeller).toBe(true);
    expect(r.news[0].body).toMatch(/Sam Reid/);
  });

  it('only ever fires once', () => {
    const already = career({ following: 900_000, fanRating: 90, topShirtSeller: true } as never);
    const r = shirtSales(already, player(), 10);
    expect(r.news).toHaveLength(0);
    expect(r.career).toBe(already);
  });
});

describe('big nights', () => {
  it('ignores league fixtures entirely', () => {
    expect(classifyBigNight('Premier Division', 60, 60, false)).toBeNull();
    expect(classifyBigNight(undefined, 60, 60, false)).toBeNull();
  });

  it('frames a European night, and a European final above it', () => {
    const night = classifyBigNight('Champions Cup', 70, 60, false)!;
    expect(night.kind).toBe('EUROPEAN_NIGHT');
    const final = classifyBigNight('Champions Cup', 70, 60, true)!;
    expect(final.kind).toBe('EUROPEAN_FINAL');
    expect(final.importance).toBeGreaterThan(night.importance);
    expect(final.importance).toBe(1);
  });

  it('separates a filthy away day from a shot at a giant', () => {
    const away = classifyBigNight('National Cup', 35, 70, false)!;
    expect(away.kind).toBe('CUP_AWAY_DAY');
    const giant = classifyBigNight('National Cup', 88, 55, false)!;
    expect(giant.kind).toBe('GIANT_KILLING');
    expect(giant.importance).toBeGreaterThan(away.importance);
    // An evenly-matched cup tie is just a match.
    expect(classifyBigNight('National Cup', 62, 60, false)).toBeNull();
  });

  it('makes a domestic final a landmark short of a European one', () => {
    const cup = classifyBigNight('National Cup', 62, 60, true)!;
    expect(cup.kind).toBe('CUP_FINAL');
    expect(cup.label).toMatch(/Final/);
    expect(cup.importance).toBeLessThan(classifyBigNight('Europa Trophy', 62, 60, true)!.importance);
  });

  it('writes the humiliation and the medal', () => {
    expect(giantKillingShame(player(), 'Ashfield Town', 30).title).toMatch(/humiliated/i);
    expect(finalNews(player(), 'National Cup', true, 30).category).toBe('MILESTONE');
    expect(finalNews(player(), 'National Cup', false, 30).title).toMatch(/beaten/i);
  });
});
