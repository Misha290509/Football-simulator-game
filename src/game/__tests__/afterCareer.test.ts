import { describe, it, expect } from 'vitest';
import {
  EPILOGUE_PATHS, PATH_BY_ID, availablePaths, epilogueYear, maybeStatue,
  hallOfFame, maybeChild, advanceChild, childSummary, epilogueEarnings,
  type EpilogueState, type ChildCareer,
} from '../afterCareer';
import type { Player } from '../../types/player';
import type { Club } from '../../types/club';
import type { PlayerCareer } from '../../types/playerCareer';

const player = (over: Partial<Player> & { bornYear?: number } = {}): Player => {
  const { bornYear, ...rest } = over;
  return {
    id: 'me', name: { first: 'Sam', last: 'Reid' }, position: 'ST', positions: ['ST'],
    overall: 82, nationality: 'England', morale: 60, fitness: 100,
    born: { year: bornYear ?? 2000, month: 1, day: 1 }, contract: { clubId: 'C' },
    attributes: { technical: {}, mental: {}, physical: {}, goalkeeping: {} },
    hidden: { professionalism: 60, bigGame: 60, consistency: 60, injuryProneness: 40, ambition: 60, versatility: 60 },
    ...rest,
  } as unknown as Player;
};
const career = (over: Partial<PlayerCareer> = {}): PlayerCareer =>
  ({ playerId: 'me', seasonHistory: [], international: { capped: false, caps: 0, intlGoals: 0 }, ...over } as unknown as PlayerCareer);
const club = (id: string, name: string): Club =>
  ({ id, name, shortName: name, reputation: 70 } as unknown as Club);
const state = (over: Partial<EpilogueState> = {}): EpilogueState =>
  ({ path: 'PUNDITRY', since: 2035, years: 0, earned: 0, seen: [], ...over });

describe('the paths', () => {
  it('always leaves him the dugout, the academy and the door', () => {
    const bare = availablePaths(career());
    expect(bare).toContain('MANAGEMENT');
    expect(bare).toContain('ACADEMY');
    expect(bare).toContain('AWAY');
  });

  it('only offers television to somebody people recognise', () => {
    expect(availablePaths(career({ following: 5_000, fanRating: 40 }))).not.toContain('PUNDITRY');
    expect(availablePaths(career({ following: 400_000 }))).toContain('PUNDITRY');
    // A long international career counts as recognition too.
    expect(availablePaths(career({ international: { capped: true, caps: 40, intlGoals: 5 } } as never))).toContain('PUNDITRY');
  });

  it('only offers an ambassador’s role where they actually love him', () => {
    expect(availablePaths(career())).not.toContain('AMBASSADOR');
    expect(availablePaths(career({ legacy: { legendAtClubs: ['c1'] } } as never))).toContain('AMBASSADOR');
  });

  it('prices each path honestly', () => {
    expect(PATH_BY_ID.MANAGEMENT.income).toBeGreaterThan(PATH_BY_ID.PUNDITRY.income);
    expect(PATH_BY_ID.ACADEMY.income).toBeLessThan(PATH_BY_ID.AMBASSADOR.income);
    expect(PATH_BY_ID.AWAY.income).toBe(0);
    // Only two of them keep him inside the game.
    expect(EPILOGUE_PATHS.filter((p) => p.inGame).map((p) => p.id).sort()).toEqual(['ACADEMY', 'MANAGEMENT']);
  });
});

describe('living the years after', () => {
  it('counts the years and the money', () => {
    let s = state({ path: 'ACADEMY' });
    for (let i = 0; i < 4; i++) s = epilogueYear(s, player(), 2036 + i, 1).state;
    expect(s.years).toBe(4);
    expect(s.earned).toBe(PATH_BY_ID.ACADEMY.income * 4);
    expect(epilogueEarnings(s)).toBe(s.earned);
    expect(epilogueEarnings(undefined)).toBe(0);
  });

  it('gives each path its own beats, and never repeats one', () => {
    const run = (path: EpilogueState['path']) => {
      let s = state({ path });
      const titles: string[] = [];
      for (let i = 0; i < 10; i++) {
        const r = epilogueYear(s, player(), 2036 + i, 1);
        s = r.state;
        titles.push(...r.news.map((n) => n.title));
      }
      return titles;
    };
    const pundit = run('PUNDITRY');
    const academy = run('ACADEMY');
    expect(pundit.some((t) => /joins the panel/i.test(t))).toBe(true);
    expect(academy.some((t) => /under-18s/i.test(t))).toBe(true);
    expect(pundit.some((t) => /under-18s/i.test(t))).toBe(false);
    // Nothing lands twice.
    const once = pundit.filter((t) => /joins the panel/i.test(t));
    expect(once).toHaveLength(1);
  });

  it('is deterministic', () => {
    const a = epilogueYear(state({ years: 3 }), player(), 2040, 9);
    const b = epilogueYear(state({ years: 3 }), player(), 2040, 9);
    expect(a.state).toEqual(b.state);
    expect(a.news.map((n) => n.title)).toEqual(b.news.map((n) => n.title));
  });
});

describe('the statue', () => {
  const clubs = { c1: club('c1', 'Northgate City'), c2: club('c2', 'Ashfield United') };
  const legend = (ids: string[], history: { club: string }[]) => career({
    legacy: { legendAtClubs: ids },
    seasonHistory: history.map((h) => ({ season: '', club: h.club, apps: 30, goals: 10, assists: 5, avgRating: 7, honours: [] })),
  } as never);

  it('waits a few years, and only for a genuine club legend', () => {
    expect(maybeStatue(legend(['c1'], [{ club: 'Northgate City' }]), player(), clubs, 1, 2040)).toBeNull();
    expect(maybeStatue(career(), player(), clubs, 10, 2040)).toBeNull();
    expect(maybeStatue(legend(['c1'], [{ club: 'Northgate City' }]), player(), clubs, 4, 2040)).not.toBeNull();
  });

  it('goes up at the club he gave the most of himself to', () => {
    const c = legend(['c1', 'c2'], [
      { club: 'Northgate City' }, { club: 'Ashfield United' }, { club: 'Ashfield United' }, { club: 'Ashfield United' },
    ]);
    const r = maybeStatue(c, player(), clubs, 5, 2040)!;
    expect(r.career.statue).toEqual({ clubId: 'c2', clubName: 'Ashfield United', year: 2040 });
    expect(r.news[0].title).toMatch(/Ashfield United/);
  });

  it('only ever goes up once', () => {
    const already = career({ statue: { clubId: 'c1', clubName: 'X', year: 2038 } } as never);
    expect(maybeStatue(already, player(), clubs, 10, 2040)).toBeNull();
  });

  it('does nothing when the legend club no longer exists in the world', () => {
    expect(maybeStatue(legend(['gone'], [{ club: 'Gone FC' }]), player(), clubs, 6, 2040)).toBeNull();
  });
});

describe('the Hall of Fame', () => {
  const big = (over: Partial<PlayerCareer> = {}) => career({
    seasonHistory: Array.from({ length: 15 }, () => ({ season: '', club: 'C', apps: 35, goals: 15, assists: 8, avgRating: 7.3, honours: ['League'] })),
    international: { capped: true, caps: 90, intlGoals: 30 },
    legacy: { legendAtClubs: ['c1'] },
    ...over,
  } as never);

  it('waits five years and turns down a career that does not warrant it', () => {
    expect(hallOfFame(big(), player(), 2, 2045)).toBeNull();
    expect(hallOfFame(career(), player(), 20, 2045)).toBeNull();
    expect(hallOfFame(big(), player(), 6, 2045)).not.toBeNull();
  });

  it('lets the mentor read the citation when there was one', () => {
    const r = hallOfFame(big({ mentor: { playerId: 'x', name: 'Danny Hale', bond: 80, since: 2020 } } as never), player(), 6, 2045)!;
    expect(r.career.hallOfFame).toMatchObject({ year: 2045, inductedBy: 'Danny Hale', kind: 'MENTOR' });
    expect(r.news[0].body).toMatch(/Danny Hale/);
  });

  it('falls to an old rival when there was no mentor', () => {
    const c = big({ rival: { playerId: 'r', relationship: -40 } } as never);
    const r = hallOfFame(c, player(), 6, 2045, 'Marc Delaine')!;
    expect(r.career.hallOfFame).toMatchObject({ inductedBy: 'Marc Delaine', kind: 'RIVAL' });
    expect(r.news[0].body).toMatch(/fifteen years/);
  });

  it('inducts him alone when there was nobody', () => {
    const r = hallOfFame(big(), player(), 6, 2045)!;
    expect(r.career.hallOfFame).toMatchObject({ inductedBy: null, kind: 'NOBODY' });
    expect(r.news[0].body).toMatch(/alone/);
  });

  it('only inducts once', () => {
    const already = big({ hallOfFame: { year: 2040, inductedBy: null, kind: 'NOBODY' } } as never);
    expect(hallOfFame(already, player(), 20, 2045)).toBeNull();
  });
});

describe('the kid', () => {
  const firstBirth = (p: Player) => {
    for (let seed = 0; seed < 200; seed++) {
      for (let y = 2026; y <= 2036; y++) {
        const r = maybeChild(career(), p, y, seed);
        if (r) return { r, y };
      }
    }
    return null;
  };

  it('only arrives in the middle of the career', () => {
    const p = player({ bornYear: 2000 });
    for (let seed = 0; seed < 40; seed++) {
      for (let y = 2020; y <= 2025; y++) expect(maybeChild(career(), p, y, seed)).toBeNull(); // too young
      for (let y = 2037; y <= 2045; y++) expect(maybeChild(career(), p, y, seed)).toBeNull(); // too late
    }
    expect(firstBirth(p)).not.toBeNull();
  });

  it('carries his father’s surname, which is rather the point', () => {
    const { r } = firstBirth(player({ bornYear: 2000 }))!;
    expect(r.career.child!.name.endsWith('Reid')).toBe(true);
    expect(r.career.child!.stage).toBe('CHILD');
    expect(r.news[0].body).toMatch(/surname/);
  });

  it('never arrives twice', () => {
    const has = career({ child: { name: 'X Reid', bornYear: 2030, stage: 'CHILD', potential: 80 } } as never);
    expect(maybeChild(has, player(), 2032, 1)).toBeNull();
  });

  const kid = (over: Partial<ChildCareer>): PlayerCareer =>
    career({ child: { name: 'Joe Reid', bornYear: 2030, stage: 'CHILD', potential: 85, ...over } } as never);

  it('signs the talented ones and quietly loses the rest at nine', () => {
    const good = advanceChild(kid({ potential: 85 }), player(), 'Northgate City', 2039);
    expect(good.career.child!.stage).toBe('ACADEMY');
    expect(good.career.child!.clubName).toBe('Northgate City');
    expect(good.news[0].title).toMatch(/academy/i);

    const ordinary = advanceChild(kid({ potential: 40 }), player(), 'Northgate City', 2039);
    expect(ordinary.career.child!.stage).toBe('FADED');
    expect(ordinary.news[0].title).toMatch(/not going to be a footballer/i);
  });

  it('releases most of the academy at eighteen and debuts the rest', () => {
    const released = advanceChild(kid({ stage: 'ACADEMY', potential: 65 }), player(), 'C', 2048);
    expect(released.career.child!.stage).toBe('FADED');
    expect(released.news[0].title).toMatch(/released/i);

    const debut = advanceChild(kid({ stage: 'ACADEMY', potential: 90 }), player(), 'C', 2048);
    expect(debut.career.child!.stage).toBe('DEBUT');
    expect(debut.news[0].title).toMatch(/debut/i);
  });

  it('lets only the very best step out of the shadow', () => {
    const made = advanceChild(kid({ stage: 'DEBUT', potential: 90 }), player(), 'C', 2052);
    expect(made.career.child!.stage).toBe('ESTABLISHED');
    expect(made.news[0].title).toMatch(/his own player now/i);

    const decent = advanceChild(kid({ stage: 'DEBUT', potential: 75 }), player(), 'C', 2052);
    expect(decent.career.child!.stage).toBe('FADED');
    expect(decent.news[0].title).toMatch(/perfectly good career/i);
  });

  it('does nothing before the next milestone, or with no child at all', () => {
    expect(advanceChild(kid({}), player(), 'C', 2035).news).toHaveLength(0);
    expect(advanceChild(kid({ stage: 'ESTABLISHED' }), player(), 'C', 2060).news).toHaveLength(0);
    expect(advanceChild(career(), player(), 'C', 2040).news).toHaveLength(0);
  });

  it('summarises where he is up to', () => {
    const c = (stage: ChildCareer['stage']): ChildCareer => ({ name: 'Joe Reid', bornYear: 2030, stage, potential: 80, clubName: 'Northgate City' });
    expect(childSummary(c('CHILD'), 2040)).toMatch(/^10 years old/);
    expect(childSummary(c('ACADEMY'), 2046)).toMatch(/Northgate City/);
    expect(childSummary(c('DEBUT'), 2049)).toMatch(/somebody's son/);
    expect(childSummary(c('ESTABLISHED'), 2053)).toMatch(/his own man/);
    expect(childSummary(c('FADED'), 2053)).toMatch(/did not work out/);
  });
});
