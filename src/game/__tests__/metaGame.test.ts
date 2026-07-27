import { describe, it, expect } from 'vitest';
import {
  DEFAULT_DIALS, DIFFICULTY_PRESETS, normaliseDials, difficultyScore,
  CHALLENGES, CHALLENGE_BY_ID, challengeProgress,
  PLAYER_ACHIEVEMENTS, evaluateAchievements, newlyEarned, achievementScore,
  compareEraRival, type ChallengeId,
} from '../metaGame';
import type { Player } from '../../types/player';
import type { PlayerCareer } from '../../types/playerCareer';

const player = (over: Partial<Player> & { ovr?: number; bornYear?: number } = {}): Player => {
  const { ovr, bornYear, ...rest } = over;
  return {
    id: 'me', name: { first: 'Sam', last: 'Reid' }, position: 'ST', positions: ['ST'],
    overall: ovr ?? 78, nationality: 'England', morale: 60, fitness: 100,
    born: { year: bornYear ?? 2000, month: 1, day: 1 }, contract: { clubId: 'C' },
    attributes: { technical: {}, mental: {}, physical: {}, goalkeeping: {} },
    hidden: { professionalism: 60, bigGame: 60, consistency: 60, injuryProneness: 40, ambition: 60, versatility: 60 },
    stats: [], awards: [],
    ...rest,
  } as unknown as Player;
};
const season = (over: { club?: string; apps?: number; goals?: number; honours?: string[] } = {}) =>
  ({ season: '', club: over.club ?? 'City', apps: over.apps ?? 30, goals: over.goals ?? 10,
     assists: 5, avgRating: 7, honours: over.honours ?? [] });
const career = (over: Partial<PlayerCareer> = {}): PlayerCareer =>
  ({ playerId: 'me', seasonHistory: [], seasonApps: 0, seasonGoals: 0,
     international: { capped: false, caps: 0, intlGoals: 0 }, ...over } as unknown as PlayerCareer);

describe('difficulty & realism dials', () => {
  it('defaults to neutral and clamps anything silly', () => {
    expect(normaliseDials(undefined)).toEqual(DEFAULT_DIALS);
    const wild = normaliseDials({ injuries: 99, formSwing: -5, growth: 0 });
    expect(wild.injuries).toBe(2.5);
    expect(wild.formSwing).toBe(0.4);
    expect(wild.growth).toBe(0.4);
    // Unspecified dials stay neutral.
    expect(wild.marketInterest).toBe(1);
  });

  it('orders the presets from kind to cruel', () => {
    const forgiving = difficultyScore(DIFFICULTY_PRESETS.FORGIVING.dials);
    const realistic = difficultyScore(DIFFICULTY_PRESETS.REALISTIC.dials);
    const brutal = difficultyScore(DIFFICULTY_PRESETS.BRUTAL.dials);
    expect(forgiving).toBeLessThan(realistic);
    expect(realistic).toBe(0);
    expect(brutal).toBeGreaterThan(realistic);
  });

  it('makes the harsh preset harsh in every direction that matters', () => {
    const b = DIFFICULTY_PRESETS.BRUTAL.dials;
    expect(b.injuries).toBeGreaterThan(1);
    expect(b.managerPatience).toBeLessThan(1);
    expect(b.marketInterest).toBeLessThan(1);
    expect(b.growth).toBeLessThan(1);
  });
});

describe('challenge scenarios', () => {
  it('every scenario states its setup and its goal in plain words', () => {
    for (const c of CHALLENGES) {
      expect(c.setup.length).toBeGreaterThan(10);
      expect(c.goal.length).toBeGreaterThan(10);
      expect(CHALLENGE_BY_ID[c.id]).toBe(c);
    }
    expect(new Set(CHALLENGES.map((c) => c.id)).size).toBe(CHALLENGES.length);
  });

  it('tracks the long way up: the top flight first, then a trophy', () => {
    const climbing = challengeProgress('NON_LEAGUE', career(), player(), 2030);
    expect(climbing.done).toBe(false);

    const arrived = challengeProgress('NON_LEAGUE', career({ reachedTopTier: true } as never), player(), 2030);
    expect(arrived.done).toBe(false);
    expect(arrived.progress).toBeGreaterThan(climbing.progress);

    const won = challengeProgress('NON_LEAGUE',
      career({ reachedTopTier: true, seasonHistory: [season({ honours: ['League'] })] } as never), player(), 2030);
    expect(won.done).toBe(true);
    expect(won.progress).toBe(1);
  });

  it('breaks the one-club challenge the moment he signs elsewhere', () => {
    const loyal = career({ seasonHistory: Array.from({ length: 14 }, () => season({ club: 'City', apps: 30 })) } as never);
    const r = challengeProgress('ONE_CLUB', loyal, player(), 2035);
    expect(r.done).toBe(true);
    expect(r.note).toMatch(/one shirt/);

    const left = career({ seasonHistory: [...(loyal.seasonHistory), season({ club: 'United' })] } as never);
    const broken = challengeProgress('ONE_CLUB', left, player(), 2035);
    expect(broken.done).toBe(false);
    expect(broken.progress).toBe(0);
    expect(broken.note).toMatch(/broken/i);
  });

  it('needs both the clubs and the countries for the journeyman', () => {
    const c = career({
      seasonHistory: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((club) => season({ club })),
      countriesPlayedIn: ['eng', 'ger', 'esp'],
    } as never);
    expect(challengeProgress('JOURNEYMAN', c, player(), 2040).done).toBe(false);
    const done = challengeProgress('JOURNEYMAN',
      { ...c, countriesPlayedIn: ['eng', 'ger', 'esp', 'ita', 'fra'] } as PlayerCareer, player(), 2040);
    expect(done.done).toBe(true);
  });

  it('makes the late bloomer wait for the birthday, not just the rating', () => {
    const c = career();
    expect(challengeProgress('LATE_BLOOMER', c, player({ ovr: 88, bornYear: 2005 }), 2030).done).toBe(false);
    expect(challengeProgress('LATE_BLOOMER', c, player({ ovr: 88, bornYear: 2000 }), 2030).done).toBe(true);
    expect(challengeProgress('LATE_BLOOMER', c, player({ ovr: 70, bornYear: 2000 }), 2030).done).toBe(false);
  });

  it('needs caps and a tournament for the small nation', () => {
    const capped = career({ international: { capped: true, caps: 80, intlGoals: 20 } } as never);
    expect(challengeProgress('SMALL_NATION', capped, player(), 2040).done).toBe(false);
    const been = { ...capped, tournamentSquads: [{ competition: 'World Cup', season: '' }] } as PlayerCareer;
    expect(challengeProgress('SMALL_NATION', been, player(), 2040).done).toBe(true);
  });

  it('counts survival in matches played', () => {
    const c = career({ seasonHistory: Array.from({ length: 10 }, () => season({ apps: 30 })) } as never);
    const r = challengeProgress('NO_SECOND_CHANCES', c, player(), 2035);
    expect(r.done).toBe(true);
    expect(r.note).toMatch(/still standing/);
  });

  it('reports partial progress rather than a bare yes/no', () => {
    const half = career({ seasonHistory: Array.from({ length: 5 }, () => season({ apps: 30 })) } as never);
    const r = challengeProgress('NO_SECOND_CHANCES', half, player(), 2032);
    expect(r.done).toBe(false);
    expect(r.progress).toBeCloseTo(0.5, 1);
  });

  it('never returns a progress outside 0–1 for any scenario', () => {
    const huge = career({
      seasonHistory: Array.from({ length: 30 }, () => season({ apps: 40, goals: 30, honours: ['a', 'b'] })),
      international: { capped: true, caps: 200, intlGoals: 90 },
      countriesPlayedIn: ['a', 'b', 'c', 'd', 'e', 'f'],
      reachedTopTier: true,
      tournamentSquads: [{ competition: 'World Cup', season: '' }],
    } as never);
    for (const c of CHALLENGES) {
      const r = challengeProgress(c.id as ChallengeId, huge, player({ ovr: 92, bornYear: 1995 }), 2035);
      expect(r.progress).toBeGreaterThanOrEqual(0);
      expect(r.progress).toBeLessThanOrEqual(1);
    }
  });
});

describe('achievements', () => {
  it('gives a fresh career nothing at all', () => {
    const states = evaluateAchievements(career(), player(), 2025);
    expect(states.filter((s) => s.earned)).toHaveLength(0);
    expect(achievementScore(states).earned).toBe(0);
  });

  it('unlocks the appearance and goal ladders in order', () => {
    const at = (apps: number, goals: number) =>
      new Set(evaluateAchievements(
        career({ seasonHistory: [season({ apps, goals })] } as never), player(), 2030,
      ).filter((s) => s.earned).map((s) => s.id));
    expect(at(1, 0).has('debut')).toBe(true);
    expect(at(1, 0).has('hundred_apps')).toBe(false);
    expect(at(120, 0).has('hundred_apps')).toBe(true);
    expect(at(520, 320).has('five_hundred')).toBe(true);
    expect(at(520, 320).has('three_hundred_goals')).toBe(true);
  });

  it('recognises the one-club man only for 300 games at a single club', () => {
    const spread = career({ seasonHistory: [season({ club: 'A', apps: 200 }), season({ club: 'B', apps: 200 })] } as never);
    const loyal = career({ seasonHistory: [season({ club: 'A', apps: 200 }), season({ club: 'A', apps: 150 })] } as never);
    const got = (c: PlayerCareer) => evaluateAchievements(c, player(), 2035).find((s) => s.id === 'loyal')!.earned;
    expect(got(spread)).toBe(false);
    expect(got(loyal)).toBe(true);
  });

  it('picks up the things the rest of the game produces', () => {
    const decorated = career({
      statue: { clubId: 'c', clubName: 'City', year: 2040 },
      hallOfFame: { year: 2042, inductedBy: null, kind: 'NOBODY' },
      hasChant: true, topShirtSeller: true, intlRole: 'CAPTAIN',
      comeback: { weeksOut: 8, sinceDay: 1, returned: true },
      child: { name: 'Joe Reid', bornYear: 2030, stage: 'ESTABLISHED', potential: 90 },
      legacy: { legendAtClubs: ['c'] },
    } as never);
    const ids = new Set(evaluateAchievements(decorated, player({ ovr: 91 }), 2042).filter((s) => s.earned).map((s) => s.id));
    for (const id of ['statue', 'hall_of_fame', 'own_chant', 'shirt_seller', 'captain_country', 'comeback', 'father_son', 'club_legend', 'ninety']) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it('reports only what is newly earned', () => {
    const states = evaluateAchievements(career({ seasonHistory: [season({ apps: 120 })] } as never), player(), 2030);
    expect(newlyEarned(undefined, states).sort()).toEqual(['debut', 'hundred_apps']);
    expect(newlyEarned(['debut'], states)).toEqual(['hundred_apps']);
    expect(newlyEarned(['debut', 'hundred_apps'], states)).toEqual([]);
  });

  it('weights the hard ones more than the easy ones', () => {
    const easy = evaluateAchievements(career({ seasonHistory: [season({ apps: 1, goals: 0 })] } as never), player(), 2026);
    const s = achievementScore(easy);
    expect(s.total).toBe(PLAYER_ACHIEVEMENTS.length);
    expect(s.maxPoints).toBe(PLAYER_ACHIEVEMENTS.reduce((a, x) => a + x.tier, 0));
    expect(s.points).toBe(1); // 'debut' is tier 1
    // A five-star achievement is worth five times a one-star one.
    expect(PLAYER_ACHIEVEMENTS.find((a) => a.id === 'five_hundred')!.tier).toBe(5);
  });
});

describe('the era rival', () => {
  const rivalPlayer = (apps: number, goals: number, awards: number): Player => player({
    id: 'him', name: { first: 'Marc', last: 'Delaine' },
    stats: [{ appearances: apps, goals, assists: 0 }],
    awards: Array.from({ length: awards }, () => ({ awardId: 'x', label: 'X', seasonId: 's' })),
  } as never);
  const mine = (apps: number, goals: number, honours: number) => career({
    eraRival: { playerId: 'him', name: 'Marc Delaine' },
    seasonHistory: [season({ apps, goals, honours: Array.from({ length: honours }, (_, i) => `T${i}`) })],
  } as never);

  it('says nothing when no rival was ever generated', () => {
    expect(compareEraRival(career(), player(), undefined)).toBeNull();
  });

  it('admits when it has lost track of him', () => {
    const r = compareEraRival(mine(300, 100, 5), player(), undefined)!;
    expect(r.name).toBe('Marc Delaine');
    expect(r.verdict).toMatch(/lost track/);
  });

  it('computes the edge in each column, signed toward the avatar', () => {
    const r = compareEraRival(mine(400, 150, 8), player(), rivalPlayer(300, 100, 4))!;
    expect(r.appsEdge).toBe(100);
    expect(r.goalsEdge).toBe(50);
    expect(r.trophiesEdge).toBe(4);
    expect(r.verdict).toMatch(/struggle to place/);
  });

  it('is honest when the rival had the better career', () => {
    const r = compareEraRival(mine(200, 40, 1), player(), rivalPlayer(450, 200, 10))!;
    expect(r.appsEdge).toBeLessThan(0);
    expect(r.verdict).toMatch(/better career/);
  });

  it('calls a genuine dead heat a dead heat', () => {
    const r = compareEraRival(mine(300, 100, 5), player(), rivalPlayer(300, 100, 5))!;
    expect([r.appsEdge, r.goalsEdge, r.trophiesEdge]).toEqual([0, 0, 0]);
    expect(r.verdict).toMatch(/can separate/);
  });
});
