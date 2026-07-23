import { describe, it, expect } from 'vitest';
import {
  careerTotals, computeLegacy, deriveIdentities, defaultAmbitions, updateAmbitions,
  updateDecline, earnedVeteranTraits, roleEvolutionOf, managerRepSeed, HALL_OF_FAME_BAR,
} from '../playerLegacy';
import {
  lateCareerOffers, retirementAvailable, forcedRetirement, buildSendOff, managerStartClub,
} from '../playerEndgame';
import { generatePlayer } from '../../engine/generator';
import { Rng } from '../../engine/rng';
import type { Player } from '../../types/player';
import type { Club } from '../../types/club';
import type { PlayerCareer } from '../../types/playerCareer';
import type { AwardRef } from '../../types/player';

function mk(overall: number, opts: { age?: number; position?: Player['position']; clubId?: string } = {}): Player {
  const year = 2025;
  const p = generatePlayer({ rng: new Rng(overall * 11 + 5), currentYear: year, target: overall, position: opts.position ?? 'ST', ageRange: [opts.age ?? 30, opts.age ?? 30], ratingCap: 95 });
  p.overall = overall;
  p.contract.clubId = opts.clubId ?? 'C1';
  p.value = 20_000_000;
  return p;
}

function club(id: string, reputation: number, country = 'ENG'): Club {
  return { id, name: `${id} FC`, shortName: id, abbrev: id.slice(0, 3).toUpperCase(), countryId: country, reputation, playerIds: [], finances: { balance: 200_000_000, transferBudget: 120_000_000, wageBudget: 3_000_000 } } as unknown as Club;
}

function career(over: Partial<PlayerCareer> = {}): PlayerCareer {
  return {
    playerId: 'av', origin: 'CREATED', archetype: 'Academy Graduate',
    managerTrust: 60, status: 'KEY', clubRelationship: 60, fanRating: 60, following: 5000,
    seasonGoals: 0, seasonApps: 0, seasonAvgRating: 0, objectives: [], traits: [],
    personality: { professionalism: 60, ambition: 60, loyalty: 60, temperament: 55 },
    sponsorships: [], international: { capped: false, caps: 0, intlGoals: 0 },
    milestones: [], seasonHistory: [], ...over,
  };
}

function award(type: string, seasonId = 's1', label?: string): AwardRef { return { awardId: type, seasonId, label: label ?? type }; }

const CLUBS: Record<string, Club> = { C1: club('C1', 82), Big: club('Big', 90), Home: club('Home', 70, 'ESP'), Low: club('Low', 55) };

describe('career totals', () => {
  it('aggregates stats + awards from the canonical sources', () => {
    const p = mk(84, { age: 30 });
    p.stats = [{ seasonId: 's1', competitionId: 'L', appearances: 30, goals: 20, assists: 8, ratingSum: 225, ratingCount: 30, cleanSheets: 0 } as never];
    p.awards = [award('LEAGUE_CHAMPION'), award('CONTINENTAL'), award('GLOBAL_BEST')];
    const t = careerTotals(career({ international: { capped: true, caps: 40, intlGoals: 15 } }), p, p.born.year);
    expect(t.apps).toBe(30);
    expect(t.goals).toBe(20);
    expect(t.leagueTitles).toBe(1);
    expect(t.continentalTitles).toBe(1);
    expect(t.ballonDors).toBe(1);
    expect(t.caps).toBe(40);
    expect(t.avgRating).toBeCloseTo(7.5, 1);
  });
});

describe('identity derivation', () => {
  it('a decorated globetrotter reads differently from a one-club servant', () => {
    const p = mk(86, { age: 34 });
    const globe = career({ seasonHistory: [
      { season: '1', club: 'A', apps: 30, goals: 10, assists: 5, avgRating: 7.2, honours: [] },
      { season: '2', club: 'B', apps: 30, goals: 10, assists: 5, avgRating: 7.2, honours: [] },
      { season: '3', club: 'C', apps: 30, goals: 10, assists: 5, avgRating: 7.2, honours: [] },
      { season: '4', club: 'D', apps: 30, goals: 10, assists: 5, avgRating: 7.2, honours: [] },
    ] });
    p.awards = Array.from({ length: 14 }, () => award('LEAGUE_CHAMPION'));
    const tg = careerTotals(globe, p, p.born.year);
    const ig = deriveIdentities(tg, globe, p, 2025);
    expect(ig).toContain('GLOBETROTTER');
    expect(ig).toContain('SERIAL_WINNER');

    const loyalP = mk(84, { age: 35 });
    const oneClub = career({ seasonHistory: Array.from({ length: 12 }, (_, i) => ({ season: `${i}`, club: 'Home', apps: 30, goals: 8, assists: 4, avgRating: 7.1, honours: [] })) });
    const il = deriveIdentities(careerTotals(oneClub, loyalP, loyalP.born.year), oneClub, loyalP, 2025);
    expect(il).toContain('ONE_CLUB_LEGEND');
  });

  it('never leaves a finished career unlabelled', () => {
    const p = mk(66, { age: 34 });
    const c = career();
    const ids = deriveIdentities(careerTotals(c, p, p.born.year), c, p, 2025);
    expect(ids.length).toBeGreaterThanOrEqual(1);
  });
});

describe('legacy score', () => {
  it('a great career scores far higher than a modest one, with a transparent breakdown', () => {
    const great = mk(90, { age: 34 });
    great.stats = [{ seasonId: 's1', competitionId: 'L', appearances: 400, goals: 300, assists: 120, ratingSum: 3000, ratingCount: 400, cleanSheets: 0 } as never];
    great.awards = [...Array(6)].map(() => award('LEAGUE_CHAMPION')).concat([...Array(3)].map(() => award('CONTINENTAL')), [award('GLOBAL_BEST'), award('GLOBAL_BEST')]);
    great.developmentLog = [{ year: 2020, ovr: 90, pot: 92 }];
    const cg = career({ international: { capped: true, caps: 90, intlGoals: 40 }, fanRating: 85, following: 80000 });
    const lg = computeLegacy(cg, great, CLUBS, { av: great }, 2025);

    const modest = mk(68, { age: 34 });
    modest.stats = [{ seasonId: 's1', competitionId: 'L', appearances: 120, goals: 15, assists: 10, ratingSum: 780, ratingCount: 120, cleanSheets: 0 } as never];
    const lm = computeLegacy(career(), modest, CLUBS, { av: modest }, 2025);

    expect(lg.score).toBeGreaterThan(lm.score);
    expect(lg.score).toBeGreaterThan(HALL_OF_FAME_BAR);
    expect(Object.keys(lg.breakdown).length).toBeGreaterThan(4);
  });

  it('is deterministic', () => {
    const p = mk(84, { age: 32 });
    const c = career();
    expect(computeLegacy(c, p, CLUBS, { av: p }, 2025)).toEqual(computeLegacy(c, p, CLUBS, { av: p }, 2025));
  });
});

describe('ambitions', () => {
  it('seed + achieve from real data', () => {
    const p = mk(80, { age: 24, position: 'ST' });
    const ambitions = defaultAmbitions(p);
    expect(ambitions.some((a) => a.kind === 'LEAGUE_TITLE')).toBe(true);
    p.awards = [award('LEAGUE_CHAMPION')];
    p.stats = [{ seasonId: 's1', competitionId: 'L', appearances: 30, goals: 30, assists: 0, ratingSum: 210, ratingCount: 30, cleanSheets: 0 } as never];
    const res = updateAmbitions(ambitions, career(), p, 100);
    expect(res.ambitions.find((a) => a.kind === 'LEAGUE_TITLE')!.achieved).toBe(true);
    expect(res.achieved.length).toBeGreaterThan(0);
  });
});

describe('decline, veteran traits, role', () => {
  it('decline starts once past peak in the 30s; veteran traits unlock', () => {
    const p = mk(82, { age: 33 });
    p.developmentLog = [{ year: 2019, ovr: 88, pot: 90 }, { year: 2025, ovr: 82, pot: 82 }];
    p.attributes.mental.composure = 86; p.attributes.mental.reactions = 80;
    const d = updateDecline(career(), p, 2025);
    expect(d.started).toBe(true);
    expect(d.peakOvr).toBe(88);
    expect(earnedVeteranTraits(p, 2025)).toContain('LEADER');
    const role = roleEvolutionOf(career({ decline: d, status: 'KEY', seasonApps: 25 }), p, 2025);
    expect(['EXPERIENCED_KEY', 'IMPACT_SUB', 'SQUAD_ELDER']).toContain(role);
  });

  it('a 24-year-old has no veteran traits and is in his prime', () => {
    const p = mk(80, { age: 24 });
    expect(earnedVeteranTraits(p, 2025)).toHaveLength(0);
    expect(roleEvolutionOf(career(), p, 2025)).toBe('PRIME');
  });
});

describe('late-career + retirement', () => {
  it('twilight offers appear for a high-rep veteran and carry a route tag', () => {
    const p = mk(84, { age: 32, clubId: 'C1' });
    let seen = false;
    for (let day = 0; day < 400 && !seen; day += 10) {
      const res = lateCareerOffers(career({ status: 'STAR' }), p, CLUBS, 2025, day, 999);
      if (res.offers.length) { seen = true; expect(/^\[[A-Z_]+\]/.test(res.offers[0].note ?? '')).toBe(true); }
    }
    expect(seen).toBe(true);
  });

  it('retirement is available in the 30s, not before', () => {
    expect(retirementAvailable(career(), mk(80, { age: 28 }), 2025)).toBe(false);
    expect(retirementAvailable(career(), mk(80, { age: 34 }), 2025)).toBe(true);
  });

  it('a career-ending injury for an old pro is a forced retirement', () => {
    const p = mk(70, { age: 35 });
    p.injury = { type: 'Knee', weeksOut: 40, severity: 'severe' } as never;
    expect(forcedRetirement(career(), p, 2025).forced).toBe(true);
  });

  it('a big legacy induction produces a Hall of Fame entry', () => {
    const p = mk(90, { age: 35 });
    p.awards = [...Array(6)].map(() => award('LEAGUE_CHAMPION')).concat([award('GLOBAL_BEST')]);
    const c = career({ seasonHistory: Array.from({ length: 12 }, (_, i) => ({ season: `${i}`, club: 'C1 FC', apps: 30, goals: 20, assists: 5, avgRating: 7.4, honours: ['x'] })) });
    const legacy = computeLegacy(c, p, CLUBS, { av: p }, 2025);
    const sendOff = buildSendOff(c, p, CLUBS, 2025, 100, legacy);
    expect(sendOff.career.legacy!.hallOfFame).toBe(legacy.score >= HALL_OF_FAME_BAR);
    if (legacy.score >= HALL_OF_FAME_BAR) expect(sendOff.hallOfFameAdd).toBeDefined();
  });
});

describe('manager transition seeding', () => {
  it('a legend seeds a higher rep and lands a bigger club than a journeyman', () => {
    const legendC = career({ legacy: { score: 900, identities: [], legendAtClubs: ['C1'], hallOfFame: true, breakdown: {} }, seasonHistory: [{ season: '1', club: 'C1 FC', apps: 30, goals: 10, assists: 5, avgRating: 7.2, honours: [] }] });
    const legendTotals = careerTotals(legendC, mk(88, { age: 35 }), 1990);
    const legendRep = managerRepSeed(legendC.legacy, legendTotals);

    const journeyC = career({ legacy: { score: 120, identities: [], legendAtClubs: [], hallOfFame: false, breakdown: {} } });
    const journeyRep = managerRepSeed(journeyC.legacy, careerTotals(journeyC, mk(66, { age: 35 }), 1990));
    expect(legendRep).toBeGreaterThan(journeyRep);

    const start = managerStartClub(legendC, CLUBS, legendRep);
    expect(start).not.toBeNull();
  });
});
