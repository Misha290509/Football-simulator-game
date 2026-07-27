import { describe, it, expect } from 'vitest';
import {
  seasonPhase, phaseFatigueFactor, phaseInjuryFactor, congestion,
  preSeasonTour, applyTour, raceContext, runInNews, buildCalendar,
  type SeasonPhase,
} from '../seasonStructure';
import type { Player } from '../../types/player';
import type { Club } from '../../types/club';
import type { Match } from '../../types/match';
import type { StandingRow } from '../../types/league';

const player = (over: Partial<Player> = {}): Player => ({
  id: 'me', name: { first: 'Sam', last: 'Reid' }, position: 'ST', positions: ['ST'],
  overall: 78, nationality: 'England', morale: 60, fitness: 90,
  born: { year: 2000, month: 1, day: 1 }, contract: { clubId: 'C', wage: 40_000 },
  attributes: { technical: {}, mental: {}, physical: {}, goalkeeping: {} },
  hidden: { professionalism: 60, bigGame: 60, consistency: 60, injuryProneness: 40, ambition: 60, versatility: 60 },
  ...over,
} as unknown as Player);
const club = (over: Partial<Club> = {}): Club =>
  ({ id: 'C', name: 'Northgate City', shortName: 'NGC', reputation: 60, countryId: 'eng', ...over } as unknown as Club);
const match = (day: number, over: Partial<Match> = {}): Match =>
  ({ id: `m${day}`, competitionId: 'comp_1', seasonId: 's', round: 1, day, homeClubId: 'C', awayClubId: 'D',
     played: false, homeGoals: 0, awayGoals: 0, homeXg: 0, awayXg: 0, events: [], playerStats: [], seed: 1, ...over } as unknown as Match);
const row = (clubId: string, points: number): StandingRow =>
  ({ clubId, played: 30, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points });

describe('the shape of the year', () => {
  it('walks through every phase from July to May', () => {
    const seen = new Set<SeasonPhase>();
    for (let d = 0; d <= 300; d++) seen.add(seasonPhase(d, 300, 'eng').phase);
    expect(seen).toEqual(new Set(['PRESEASON', 'EARLY', 'AUTUMN', 'CHRISTMAS', 'SPRING', 'RUN_IN']));
  });

  it('gives a winter break to the leagues that take one, and not to England', () => {
    expect(seasonPhase(130, 300, 'eng').phase).toBe('CHRISTMAS');
    expect(seasonPhase(130, 300, 'ger').phase).toBe('WINTER_BREAK');
    expect(seasonPhase(130, 300, 'sco').phase).toBe('CHRISTMAS');
    // Unknown countries default to playing through, like England.
    expect(seasonPhase(130, 300).phase).toBe('CHRISTMAS');
  });

  it('handles a season that has not been scheduled yet', () => {
    expect(seasonPhase(0, 0).phase).toBe('PRESEASON');
  });

  it('makes Christmas the hardest part of the year and the break the easiest', () => {
    expect(phaseFatigueFactor('CHRISTMAS')).toBeGreaterThan(phaseFatigueFactor('RUN_IN'));
    expect(phaseFatigueFactor('RUN_IN')).toBeGreaterThan(phaseFatigueFactor('SPRING'));
    expect(phaseFatigueFactor('WINTER_BREAK')).toBeLessThan(1);
    expect(phaseInjuryFactor('CHRISTMAS')).toBeGreaterThan(1);
    expect(phaseInjuryFactor('WINTER_BREAK')).toBeLessThan(1);
    expect(phaseInjuryFactor('SPRING')).toBe(1);
  });
});

describe('fixture congestion', () => {
  const fixtures = [match(10), match(13), match(17), match(20), match(23), match(40)];

  it('counts only this club’s unplayed games in the next fortnight', () => {
    const c = congestion(fixtures, 'C', 10);
    expect(c.count).toBe(5);
    expect(c.severity).toBe(1);
    expect(c.note).toMatch(/something has to give/i);
  });

  it('ignores games already played and games for other clubs', () => {
    const mixed = [match(10, { played: true }), match(11, { homeClubId: 'X', awayClubId: 'Y' }), match(12)];
    expect(congestion(mixed, 'C', 10).count).toBe(1);
  });

  it('calls a quiet fortnight a chance to get fit', () => {
    const c = congestion(fixtures, 'C', 30);
    expect(c.count).toBe(1);
    expect(c.severity).toBe(0);
    expect(c.note).toMatch(/quiet/i);
  });
});

describe('pre-season tours', () => {
  it('sends the giants chasing money and everyone else up a mountain', () => {
    const kinds = (rep: number) => {
      const s = new Set<string>();
      for (let seed = 0; seed < 200; seed++) s.add(preSeasonTour(player(), club({ reputation: rep }), 2030, seed).tour.kind);
      return s;
    };
    expect(kinds(88)).toContain('ASIA');
    expect(kinds(50)).toEqual(new Set(['MOUNTAIN_CAMP']));
  });

  it('trades sharpness for exposure, and the camp does the opposite', () => {
    const big = preSeasonTour(player(), club({ reputation: 90 }), 2030, 1).tour;
    const small = preSeasonTour(player(), club({ reputation: 40 }), 2030, 1).tour;
    expect(small.kind).toBe('MOUNTAIN_CAMP');
    expect(small.fitness).toBeGreaterThan(0);
    expect(small.following).toBeLessThan(big.following);
    if (big.kind !== 'MOUNTAIN_CAMP') expect(big.fitness).toBeLessThan(0);
  });

  it('offers a different choice on a commercial tour than at a training camp', () => {
    const commercial = preSeasonTour(player(), club({ reputation: 90 }), 2030, 2);
    const camp = preSeasonTour(player(), club({ reputation: 40 }), 2030, 2);
    expect(commercial.conversation!.trigger).toBe('PRESEASON_TOUR');
    expect(commercial.conversation!.choices[0].following!).toBeGreaterThan(0);
    // At a camp there is nothing to sell — only work to do or duck.
    expect(camp.conversation!.choices[0].standing!).toBeGreaterThan(0);
    expect(camp.conversation!.choices[2].trust!).toBeLessThan(0);
  });

  it('applies the physical outcome without pushing fitness out of range', () => {
    const camp = preSeasonTour(player(), club({ reputation: 40 }), 2030, 3).tour;
    expect(applyTour(player({ fitness: 95 } as never), camp).fitness).toBe(100);
    expect(applyTour(player({ fitness: 60 } as never), camp).fitness).toBe(70);
  });

  it('is deterministic for the same club, year and seed', () => {
    const a = preSeasonTour(player(), club(), 2030, 5).tour;
    const b = preSeasonTour(player(), club(), 2030, 5).tour;
    expect(a).toEqual(b);
    expect(preSeasonTour(player(), club(), 2031, 5).tour.year).toBe(2031);
  });
});

describe('the run-in', () => {
  // A tight top-four with a clear gap down to the rest, and a scrap at the bottom.
  const table: StandingRow[] = [
    row('A', 70), row('B', 68), row('C', 66), row('D', 64),
    row('E', 50), row('F', 48), row('G', 46), row('H', 44),
    row('X', 30), row('Y', 29), row('Z', 28),
  ];

  it('says nothing before the closing weeks, or for a club not in the table', () => {
    expect(raceContext(table, 'A', 20)).toBeNull();
    expect(raceContext(table, 'A', 0)).toBeNull();
    expect(raceContext(table, 'NOPE', 5)).toBeNull();
    expect(raceContext([], 'A', 5)).toBeNull();
  });

  it('frames a live title race, and gets more urgent the tighter it is', () => {
    const leader = raceContext(table, 'A', 5)!;
    expect(leader.kind).toBe('TITLE');
    expect(leader.position).toBe(1);
    expect(leader.label).toMatch(/top of the league/i);

    const chaser = raceContext(table, 'B', 5)!;
    expect(chaser.kind).toBe('TITLE');
    expect(chaser.gap).toBe(2);
    expect(chaser.importance).toBeGreaterThan(0.8);
    // A two-point gap is more urgent than a six-point one.
    expect(chaser.importance).toBeGreaterThan(raceContext(table, 'D', 5)!.importance);
  });

  it('calls it a relegation fight for the clubs actually in trouble', () => {
    const inTheZone = raceContext(table, 'Z', 4)!;
    expect(inTheZone.kind).toBe('SURVIVAL');
    expect(inTheZone.label).toMatch(/relegation zone/i);
    expect(inTheZone.importance).toBeGreaterThan(0.78);

    // Fourteen points clear of the drop with four to play is not a fight;
    // with six to play (eighteen available) it very much is.
    expect(raceContext(table, 'H', 4)!.kind).toBe('NOTHING');
    const justAbove = raceContext(table, 'H', 6)!;
    expect(justAbove.kind).toBe('SURVIVAL');
    expect(justAbove.label).toMatch(/fighting to stay up/i);
  });

  it('picks out the European scrap in between', () => {
    const table2: StandingRow[] = [
      row('A', 80), row('B', 78), row('C', 70), row('D', 60),
      row('E', 59), row('F', 58), row('G', 40), row('H', 38), row('X', 20), row('Y', 19), row('Z', 18),
    ];
    const r = raceContext(table2, 'E', 3)!;
    expect(r.kind).toBe('EUROPE');
    expect(r.gap).toBe(1);
    expect(r.blurb).toMatch(/Thursday nights/);
  });

  it('reads the second tier as a promotion race, not a title race', () => {
    const r = raceContext(table, 'B', 5, { tier: 2, promotionPlaces: 2 })!;
    expect(r.kind).toBe('PROMOTION');
    expect(r.label).toMatch(/going up/i);
    // And there is no European place to chase down there.
    expect(raceContext(table, 'F', 3, { tier: 2 })!.kind).not.toBe('EUROPE');
  });

  it('admits when there is nothing left to play for', () => {
    const r = raceContext(table, 'F', 2)!;
    expect(r.kind).toBe('NOTHING');
    expect(r.importance).toBeLessThan(0.5);
    expect(runInNews(r, club(), 200)).toBeNull();
  });

  it('writes a beat for a race that matters', () => {
    const beat = runInNews(raceContext(table, 'A', 5)!, club(), 200)!;
    expect(beat.title).toMatch(/Northgate City/);
    expect(beat.body.length).toBeGreaterThan(20);
  });
});

describe('the calendar', () => {
  const fixtures = [
    match(60, { played: true, homeGoals: 2, awayGoals: 1 }),
    match(20, { played: true, homeGoals: 0, awayGoals: 0, awayClubId: 'E' }),
    match(250, { homeClubId: 'F', awayClubId: 'C', competitionId: 'cup_1' }),
    match(90, { homeClubId: 'X', awayClubId: 'Y' }), // not his club
  ];
  const names = { C: 'Northgate', D: 'Ashfield', E: 'Brackley', F: 'Deepdale' };
  const comps = { comp_1: 'Premier Division', cup_1: 'National Cup' };

  it('lists only his club’s fixtures, in order, with the phase each falls in', () => {
    const cal = buildCalendar(fixtures, 'C', names, comps, 300, 'eng');
    expect(cal.map((e) => e.day)).toEqual([20, 60, 250]);
    expect(cal[0].phase).toBe('EARLY');
    expect(cal[2].phase).toBe('RUN_IN');
  });

  it('gets home/away, the opponent and the score right', () => {
    const cal = buildCalendar(fixtures, 'C', names, comps, 300, 'eng');
    expect(cal[0]).toMatchObject({ home: true, opponent: 'Brackley', played: true, score: '0–0' });
    expect(cal[1]).toMatchObject({ home: true, opponent: 'Ashfield', score: '2–1' });
    expect(cal[2]).toMatchObject({ home: false, opponent: 'Deepdale', competition: 'National Cup', played: false });
    expect(cal[2].score).toBeUndefined();
  });

  it('falls back gracefully on unknown clubs and competitions', () => {
    const cal = buildCalendar([match(10)], 'C', {}, {}, 300);
    expect(cal[0].opponent).toBe('Opposition');
    expect(cal[0].competition).toBe('League');
  });
});
