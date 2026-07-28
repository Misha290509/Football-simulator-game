import { describe, it, expect } from 'vitest';
import {
  MOTIVES, classifyMotive, findSuitors, panicBuyer, shapeOf, feeFor, buildOffer,
  motiveOf, ASKS, counterOffer, competingBump, clubBlocks,
  type SuitorMotive, type Ask,
} from '../transferMarket';
import type { Player } from '../../types/player';
import type { Club } from '../../types/club';
import type { PlayerCareer } from '../../types/playerCareer';
import type { ContractOffer } from '../../types/playerOffPitch';

const player = (over: Partial<Player> & { ovr?: number; bornYear?: number; nat?: string } = {}): Player => {
  const { ovr, bornYear, nat, ...rest } = over;
  return {
    id: 'me', name: { first: 'Sam', last: 'Reid' }, position: 'ST', positions: ['ST'],
    overall: ovr ?? 76, nationality: nat ?? 'eng', morale: 60, fitness: 100, value: 12_000_000,
    born: { year: bornYear ?? 2000, month: 1, day: 1 },
    contract: { clubId: 'HOME', wage: 30_000, expiresYear: 2030 },
    attributes: { technical: {}, mental: {}, physical: {}, goalkeeping: {} },
    hidden: { professionalism: 60, bigGame: 60, consistency: 60, injuryProneness: 40, ambition: 60, versatility: 60 },
    ...rest,
  } as unknown as Player;
};
const club = (id: string, reputation: number, over: Partial<Club> = {}): Club => ({
  id, name: `${id} FC`, shortName: id, reputation, countryId: 'eng',
  finances: { balance: 50_000_000, transferBudget: 40_000_000, wageBudget: 1_500_000 },
  playerIds: [],
  ...over,
} as unknown as Club);
/** A club with nothing to spend, so the REBUILD motive can't apply — lets a
 *  test isolate the one motive it is actually about. */
const skint = { finances: { balance: 1_000_000, transferBudget: 0, wageBudget: 200_000 } } as never;
const career = (over: Partial<PlayerCareer> = {}): PlayerCareer =>
  ({ playerId: 'me', status: 'KEY', seasonApps: 25, seasonGoals: 10, seasonAvgRating: 7.1,
     clubRelationship: 60, ...over } as unknown as PlayerCareer);

const YEAR = 2028; // the avatar is 28 by default

describe('why a club wants him', () => {
  const home = club('HOME', 72);

  it('a much bigger club is a step up — but only if he is hot', () => {
    const giant = club('GIANT', 84);
    const hot = classifyMotive(giant, home, player(), career(), 80, YEAR);
    expect(hot?.motive).toBe('STEP_UP');
    // Ice cold, and they lose interest entirely.
    expect(classifyMotive(giant, home, player(), career(), 5, YEAR)).toBeNull();
  });

  it('never bothers with a club miles above his level', () => {
    expect(classifyMotive(club('ELITE', 95), home, player({ ovr: 70 }), career(), 100, YEAR)).toBeNull();
  });

  it('offers regular football at a smaller club — but only to somebody who needs it', () => {
    const small = club('SMALL', 62, skint);
    // Playing every week at a big club? Nobody below is calling.
    expect(classifyMotive(small, home, player(), career(), 50, YEAR)).toBeNull();
    // Rotting on the bench? They are very interested.
    const buried = career({ status: 'ROTATION', seasonApps: 1 });
    const r = classifyMotive(small, home, player(), buried, 50, YEAR);
    expect(r?.motive).toBe('REGULAR_FOOTBALL');
  });

  it('lets an unhappy or ageing player drop down even while playing', () => {
    const small = club('SMALL', 62, skint);
    expect(classifyMotive(small, home, player(), career({ clubRelationship: 20 }), 50, YEAR)?.motive)
      .toBe('REGULAR_FOOTBALL');
    expect(classifyMotive(small, home, player({ bornYear: 1994 }), career(), 50, 2028)?.motive)
      .toBe('REGULAR_FOOTBALL');
  });

  it('tempts him with money from a club whose wealth outruns its standing', () => {
    const rich = club('OIL', 60, { finances: { balance: 9e9, transferBudget: 5e8, wageBudget: 40_000_000 } as never });
    const r = classifyMotive(rich, home, player({ bornYear: 1994 }), career(), 40, 2028);
    expect(r?.motive).toBe('PAYDAY');
  });

  it('brings him home to his own country and, above all, his boyhood club', () => {
    const abroad = club('HOME', 72, { countryId: 'esp' });
    const domestic = club('DOM', 70, { countryId: 'eng', ...(skint as object) });
    const r = classifyMotive(domestic, abroad, player({ nat: 'eng' }), career(), 40, YEAR);
    expect(r?.motive).toBe('HOMECOMING');
    // The club he grew up supporting pulls hardest of all.
    const boyhood = club('BOYS', 70, { countryId: 'eng', name: 'Ashfield Town', ...(skint as object) });
    const withBoyhood = career({ identity: { boyhoodClub: 'Ashfield Town' } } as never);
    const b = classifyMotive(boyhood, abroad, player({ nat: 'eng' }), withBoyhood, 40, YEAR)!;
    expect(b.motive).toBe('HOMECOMING');
    expect(b.pull).toBeGreaterThan(r!.pull);
  });

  it('lets a funded club at his own level offer to build around him', () => {
    const peer = club('PEER', 68, { finances: { balance: 1e8, transferBudget: 60_000_000, wageBudget: 900_000 } as never });
    expect(classifyMotive(peer, home, player(), career(), 50, YEAR)?.motive).toBe('REBUILD');
  });

  it('is never interested in his own club', () => {
    expect(classifyMotive(home, home, player(), career(), 100, YEAR)).toBeNull();
  });
});

describe('finding suitors — the bug the old model had', () => {
  // A world with clubs above, level with, and below the avatar's own.
  const world = (): Record<string, Club> => Object.fromEntries([
    club('HOME', 80),
    club('GIANT', 88),
    club('PEER', 78, { finances: { balance: 1e8, transferBudget: 60_000_000, wageBudget: 900_000 } as never }),
    club('SMALL', 64),
    club('TINY', 52),
    club('OIL', 58, { finances: { balance: 9e9, transferBudget: 5e8, wageBudget: 40_000_000 } as never }),
  ].map((c) => [c.id, c]));

  it('a fringe player at a big club now has somewhere to go', () => {
    // The exact case the old reputation-band model returned nothing for.
    const buried = career({ status: 'ROTATION', seasonApps: 0, clubRelationship: 30 });
    const suitors = findSuitors(world(), player({ ovr: 70 }), buried, 25, YEAR);
    expect(suitors.length).toBeGreaterThan(0);
    expect(suitors.some((s) => s.motive === 'REGULAR_FOOTBALL')).toBe(true);
  });

  it('offers a hot young star the step up', () => {
    const suitors = findSuitors(world(), player({ ovr: 82, bornYear: 2006 }), career(), 90, YEAR);
    expect(suitors.some((s) => s.motive === 'STEP_UP')).toBe(true);
  });

  it('never returns his own club, and respects the limit', () => {
    const suitors = findSuitors(world(), player(), career(), 70, YEAR, 3);
    expect(suitors.every((s) => s.clubId !== 'HOME')).toBe(true);
    expect(suitors.length).toBeLessThanOrEqual(3);
  });

  it('is deterministic and ordered by how badly they want him', () => {
    const a = findSuitors(world(), player(), career(), 70, YEAR);
    const b = findSuitors(world(), player(), career(), 70, YEAR);
    expect(a).toEqual(b);
    for (let i = 1; i < a.length; i++) expect(a[i - 1].pull).toBeGreaterThanOrEqual(a[i].pull);
  });

  it('produces genuinely different kinds of move across a career', () => {
    const kinds = new Set<SuitorMotive>();
    const w = world();
    // Young and hot, then buried, then old — three stages of one career.
    for (const [p, c, heat] of [
      [player({ ovr: 82, bornYear: 2008 }), career(), 90],
      [player({ ovr: 74 }), career({ status: 'ROTATION', seasonApps: 1 }), 20],
      [player({ ovr: 74, bornYear: 1994 }), career(), 35],
    ] as const) {
      for (const s of findSuitors(w, p, c, heat, 2028)) kinds.add(s.motive);
    }
    expect(kinds.size).toBeGreaterThanOrEqual(3);
  });
});

describe('deadline-day panic', () => {
  const world = Object.fromEntries([club('HOME', 70), club('A', 74), club('B', 76)].map((c) => [c.id, c]));

  it('only ever happens in the last week of the window', () => {
    for (let d = 0; d < 200; d++) {
      expect(panicBuyer(world, player(), 30, d, 1)).toBeNull();
      expect(panicBuyer(world, player(), -1, d, 1)).toBeNull();
    }
  });

  it('is rare even then, and desperate when it lands', () => {
    let hits = 0;
    for (let d = 0; d < 400; d++) if (panicBuyer(world, player(), 3, d, 1)) hits++;
    expect(hits).toBeGreaterThan(0);
    expect(hits / 400).toBeLessThan(0.35);
    const hit = (() => { for (let d = 0; d < 400; d++) { const r = panicBuyer(world, player(), 3, d, 1); if (r) return r; } return null; })()!;
    expect(hit.motive).toBe('PANIC_BUY');
    expect(hit.pull).toBeGreaterThan(90);
  });
});

describe('the offers themselves', () => {
  const c = club('SUITOR', 74);

  it('gives each motive a genuinely different deal', () => {
    const offers = (Object.keys(MOTIVES) as SuitorMotive[])
      .map((m) => ({ m, o: buildOffer(player(), career(), c, m, 10_000_000, 100) }));
    // The payday club pays far more than the club selling him a shirt.
    const pay = offers.find((x) => x.m === 'PAYDAY')!.o;
    const reg = offers.find((x) => x.m === 'REGULAR_FOOTBALL')!.o;
    expect(pay.wage).toBeGreaterThan(reg.wage * 2);
    // But it is short, and it promises nothing you can hold them to.
    expect(pay.length).toBeLessThan(reg.length);
    expect(pay.releaseClause).toBeNull();
    // The small club sells the shirt instead of the money.
    expect(reg.releaseClause).not.toBeNull();
    // A step up is money without a promise about your place.
    expect(offers.find((x) => x.m === 'STEP_UP')!.o.rolePromise).toBe('ROTATION');
    // The rebuilders promise you everything.
    expect(offers.find((x) => x.m === 'REBUILD')!.o.rolePromise).toBe('STAR');
    // Every offer is distinguishable from every other.
    expect(new Set(offers.map((x) => `${x.o.wage}_${x.o.length}_${x.o.rolePromise}`)).size)
      .toBeGreaterThanOrEqual(5);
  });

  it('will not let a giant promise a fringe player he starts', () => {
    const giant = club('GIANT', 90);
    expect(buildOffer(player({ ovr: 74 }), career(), giant, 'REBUILD', 10_000_000, 100).rolePromise).toBe('ROTATION');
  });

  it('scales the fee by why they want him', () => {
    const ask = 20_000_000;
    expect(feeFor('PANIC_BUY', ask)).toBeGreaterThan(feeFor('STEP_UP', ask));
    expect(feeFor('REGULAR_FOOTBALL', ask)).toBeLessThan(feeFor('STEP_UP', ask));
    expect(feeFor('STEP_UP', ask) % 250_000).toBe(0);
  });

  it('gives the panic buyer almost no time to think', () => {
    const panic = buildOffer(player(), career(), c, 'PANIC_BUY', 1e7, 100);
    const normal = buildOffer(player(), career(), c, 'STEP_UP', 1e7, 100);
    expect(panic.deadline).toBeLessThan(normal.deadline);
  });

  it('round-trips its motive so the screen can show it', () => {
    for (const m of Object.keys(MOTIVES) as SuitorMotive[]) {
      expect(motiveOf(buildOffer(player(), career(), c, m, 1e7, 100))).toBe(m);
    }
    expect(motiveOf({ note: 'no tag here' } as ContractOffer)).toBeNull();
    expect(motiveOf({} as ContractOffer)).toBeNull();
    expect(shapeOf('PAYDAY').wage).toBeGreaterThan(1);
  });

  it('pays a well-represented player better', () => {
    const solo = buildOffer(player(), career(), c, 'STEP_UP', 1e7, 100);
    const repped = buildOffer(player(), career({ agent: { negotiation: 95 } } as never), c, 'STEP_UP', 1e7, 100);
    expect(repped.wage).toBeGreaterThan(solo.wage);
  });
});

describe('pushing back on an offer', () => {
  const c = club('SUITOR', 70);
  const offer = () => buildOffer(player(), career({ agent: { negotiation: 85 } } as never), c, 'REBUILD', 1e7, 100);

  const firstOutcome = (ask: Ask, want: string, attempts = 0) => {
    for (let s = 0; s < 400; s++) {
      const r = counterOffer(offer(), ask, career({ agent: { negotiation: 85 } } as never), player(), c, 80, attempts, 100, s);
      if (r.outcome === want) return r;
    }
    return null;
  };

  it('offers four distinct things to ask for', () => {
    expect(ASKS).toHaveLength(4);
    expect(new Set(ASKS.map((a) => a.id)).size).toBe(4);
  });

  it('improves the exact thing he asked for, and nothing else', () => {
    const base = offer();
    const money = firstOutcome('MORE_MONEY', 'IMPROVED')!.offer!;
    expect(money.wage).toBeGreaterThan(base.wage);
    expect(money.length).toBe(base.length);

    const shorter = firstOutcome('SHORTER_DEAL', 'IMPROVED')!.offer!;
    expect(shorter.length).toBe(base.length - 1);
    expect(shorter.wage).toBe(base.wage);

    const role = firstOutcome('BIGGER_ROLE', 'IMPROVED')!.offer!;
    expect(role.rolePromise).not.toBe(base.rolePromise);

    const clause = firstOutcome('RELEASE_CLAUSE', 'IMPROVED')!.offer!;
    expect(clause.releaseClause!).toBeLessThan(base.releaseClause!);
  });

  it('can refuse without killing the deal', () => {
    const r = firstOutcome('BIGGER_ROLE', 'REFUSED')!;
    expect(r.offer).not.toBeNull();
    expect(r.offer!.wage).toBe(offer().wage);
  });

  it('takes the offer off the table on the third push, always', () => {
    for (let s = 0; s < 50; s++) {
      const r = counterOffer(offer(), 'MORE_MONEY', career(), player(), c, 50, 2, 100, s);
      expect(r.outcome).toBe('WITHDRAWN');
      expect(r.offer).toBeNull();
    }
  });

  it('rewards a good agent and real leverage', () => {
    const rate = (neg: number, heat: number) => {
      let ok = 0;
      for (let s = 0; s < 300; s++) {
        const cr = career({ agent: { negotiation: neg } } as never);
        if (counterOffer(offer(), 'MORE_MONEY', cr, player(), c, heat, 0, 100, s).outcome === 'IMPROVED') ok++;
      }
      return ok / 300;
    };
    expect(rate(95, 90)).toBeGreaterThan(rate(20, 10));
  });

  it('is deterministic — you cannot reload for a better answer', () => {
    for (let s = 0; s < 30; s++) {
      const a = counterOffer(offer(), 'MORE_MONEY', career(), player(), c, 60, 0, 100, s);
      const b = counterOffer(offer(), 'MORE_MONEY', career(), player(), c, 60, 0, 100, s);
      expect([a.outcome, a.offer?.wage]).toEqual([b.outcome, b.offer?.wage]);
    }
  });
});

describe('two clubs at the same table', () => {
  const mk = (id: string, wage: number, deadline = 120): ContractOffer =>
    ({ id, clubId: id, kind: 'TRANSFER', wage, length: 4, signingBonus: 100_000, goalBonus: 0,
       releaseClause: null, rolePromise: 'KEY', deadline, fee: 1e7 } as ContractOffer);

  it('does nothing with only one offer on the table', () => {
    const r = competingBump([mk('A', 50_000)], 100);
    expect(r.bumped).toHaveLength(0);
  });

  it('makes the weaker club improve rather than lose him for nothing', () => {
    const r = competingBump([mk('A', 100_000), mk('B', 50_000)], 100);
    expect(r.bumped).toEqual(['B']);
    const b = r.offers.find((o) => o.clubId === 'B')!;
    expect(b.wage).toBeGreaterThan(100_000);
    // The club already ahead does not bid against itself.
    expect(r.offers.find((o) => o.clubId === 'A')!.wage).toBe(100_000);
  });

  it('leaves near-matching offers alone, and ignores lapsed ones', () => {
    expect(competingBump([mk('A', 100_000), mk('B', 99_000)], 100).bumped).toHaveLength(0);
    expect(competingBump([mk('A', 100_000), mk('B', 50_000, 90)], 100).bumped).toHaveLength(0);
  });
});

describe('the club that will not sell', () => {
  const parent = club('HOME', 78);

  it('never blocks a player they do not rely on', () => {
    for (let d = 0; d < 200; d++) {
      expect(clubBlocks(career({ status: 'ROTATION' }), player(), parent, 'STEP_UP', d, 1).blocked).toBe(false);
    }
  });

  it('never blocks a move that suits them too', () => {
    for (let d = 0; d < 200; d++) {
      expect(clubBlocks(career({ status: 'STAR' }), player(), parent, 'PAYDAY', d, 1).blocked).toBe(false);
      expect(clubBlocks(career({ status: 'STAR' }), player(), parent, 'REGULAR_FOOTBALL', d, 1).blocked).toBe(false);
    }
  });

  it('digs in over a key man — but not every time', () => {
    let blocked = 0;
    for (let d = 0; d < 400; d++) if (clubBlocks(career({ status: 'STAR' }), player(), parent, 'STEP_UP', d, 1).blocked) blocked++;
    expect(blocked).toBeGreaterThan(0);
    expect(blocked).toBeLessThan(400);
  });

  it('cannot stop a player who has handed in a request', () => {
    const pushing = career({ status: 'STAR', transferRequestPending: true });
    for (let d = 0; d < 200; d++) {
      expect(clubBlocks(pushing, player(), parent, 'STEP_UP', d, 1).blocked).toBe(false);
    }
  });

  it('explains itself when it does', () => {
    for (let d = 0; d < 400; d++) {
      const r = clubBlocks(career({ status: 'STAR' }), player(), parent, 'STEP_UP', d, 1);
      if (r.blocked) { expect(r.reason).toMatch(/not for sale/i); return; }
    }
    throw new Error('expected at least one block');
  });
});
