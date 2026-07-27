import { describe, it, expect } from 'vitest';
import {
  detectBadHabits, trainOutHabit, advanceHabits, habitFactor, refereeTrust, BAD_HABITS,
  studyMoment, analysisFactor, MAX_ANALYSIS_BONUS,
  setBodyType, bodyOf, BODY,
  availableBadges, startBadge, advanceBadge, BADGES,
  CAMPS, attendCamp, versatilityRating, versatilityBias,
} from '../trainingDepth';
import type { Player } from '../../types/player';
import type { PlayerCareer } from '../../types/playerCareer';

const player = (over: Partial<Player> = {}): Player => ({
  id: 'me', name: { first: 'Alex', last: 'Hunter' }, position: 'ST', positions: ['ST'], overall: 80,
  born: { year: 1998, month: 1, day: 1 },
  attributes: {
    technical: { finishing: 80 }, mental: { composure: 75 },
    physical: { sprintSpeed: 80, acceleration: 80, strength: 70, agility: 75, balance: 70, jumping: 70, stamina: 75 },
    goalkeeping: {},
  },
  hidden: { professionalism: 70, bigGame: 60, consistency: 60, injuryProneness: 40, ambition: 70, versatility: 60 },
  ...over,
} as unknown as Player);

const career = (over: Partial<PlayerCareer> = {}): PlayerCareer =>
  ({ playerId: 'me', personality: { professionalism: 70 }, matchSharpness: 80, developmentPoints: 0, ...over } as unknown as PlayerCareer);

const tally = (over: Partial<Record<string, number>> = {}) =>
  ({ dives: 0, cards: 0, wastedShots: 0, hoggedChances: 0, missedTracks: 0, ...over } as never);

describe('bad habits', () => {
  it('only hardens once the behaviour is genuinely repeated', () => {
    expect(detectBadHabits(career(), player(), tally({ cards: 2 }), 10).news).toHaveLength(0);
    const r = detectBadHabits(career(), player(), tally({ cards: 6 }), 10);
    expect(r.career.badHabits!.some((h) => h.id === 'HOT_HEADED')).toBe(true);
    expect(r.news.length).toBe(1);
  });

  it('never adds the same habit twice', () => {
    const first = detectBadHabits(career(), player(), tally({ dives: 9 }), 10).career;
    const second = detectBadHabits(first, player(), tally({ dives: 20 }), 40);
    expect(second.news).toHaveLength(0);
    expect(second.career.badHabits!.length).toBe(1);
  });

  it('drags on exactly the moments it should, and referees stop trusting a diver', () => {
    const wasteful = career({ badHabits: [{ id: 'WASTEFUL', since: 1, trainingOut: false, progress: 0 }] });
    expect(habitFactor(wasteful, 'ONE_ON_ONE', 'GOAL')).toBeLessThan(1);
    expect(habitFactor(wasteful, 'MIDFIELD_TACKLE', 'TACKLE_WON')).toBe(1);
    const diver = career({ badHabits: [{ id: 'DIVES', since: 1, trainingOut: false, progress: 0 }] });
    expect(refereeTrust(diver)).toBeLessThan(1);
    expect(refereeTrust(career())).toBe(1);
  });

  it('can be trained out over weeks of work', () => {
    let c = career({ badHabits: [{ id: 'BALL_HOG', since: 1, trainingOut: false, progress: 0 }] });
    const started = trainOutHabit(c, 'BALL_HOG');
    expect(started.ok).toBe(true);
    c = started.career;
    let broken = false;
    for (let i = 0; i < 12 && !broken; i++) {
      const r = advanceHabits(c, player(), 20 + i * 7);
      c = r.career;
      if (r.news.some((n) => /habit broken/i.test(n.title))) broken = true;
    }
    expect(broken).toBe(true);
    expect(c.badHabits).toHaveLength(0);
  });

  it('every habit definition is well-formed', () => {
    for (const h of BAD_HABITS) { expect(h.label.length).toBeGreaterThan(0); expect(h.coachNote.length).toBeGreaterThan(0); }
  });
});

describe('video analysis', () => {
  it('buys a small permanent edge with diminishing returns', () => {
    let c = career();
    c = studyMoment(c, 'ONE_ON_ONE', 10, player()).career;
    const one = analysisFactor(c, 'ONE_ON_ONE');
    expect(one).toBeGreaterThan(1);
    c = studyMoment(c, 'ONE_ON_ONE', 20, player()).career;
    const two = analysisFactor(c, 'ONE_ON_ONE');
    expect(two).toBeGreaterThan(one);
    // Diminishing, and capped.
    expect(two - one).toBeLessThan(one - 1);
    for (let i = 0; i < 20; i++) c = studyMoment(c, 'ONE_ON_ONE', 30 + i, player()).career;
    expect(analysisFactor(c, 'ONE_ON_ONE')).toBeLessThanOrEqual(1 + MAX_ANALYSIS_BONUS + 1e-9);
  });

  it('only helps the moment actually studied', () => {
    const c = studyMoment(career(), 'HEADER', 10, player()).career;
    expect(analysisFactor(c, 'HEADER')).toBeGreaterThan(1);
    expect(analysisFactor(c, 'LONG_SHOT')).toBe(1);
  });
});

describe('body composition', () => {
  it('trades pace against strength and injury resistance', () => {
    const base = player();
    const lean = setBodyType(career(), base, 'LEAN');
    expect((lean.player.attributes.physical as Record<string, number>).sprintSpeed).toBeGreaterThan(80);
    expect((lean.player.attributes.physical as Record<string, number>).strength).toBeLessThan(70);
    expect(lean.player.hidden.injuryProneness).toBeGreaterThan(40);

    const powerful = setBodyType(career(), base, 'POWERFUL');
    expect((powerful.player.attributes.physical as Record<string, number>).sprintSpeed).toBeLessThan(80);
    expect((powerful.player.attributes.physical as Record<string, number>).strength).toBeGreaterThan(70);
    expect(powerful.player.hidden.injuryProneness).toBeLessThan(40);
    expect(bodyOf(powerful.career)).toBe('POWERFUL');
  });

  it('switching back and forth does not drift the attributes', () => {
    const base = player();
    const lean = setBodyType(career(), base, 'LEAN');
    const back = setBodyType(lean.career, lean.player, 'BALANCED');
    const physA = base.attributes.physical as Record<string, number>;
    const physB = back.player.attributes.physical as Record<string, number>;
    expect(physB.sprintSpeed).toBe(physA.sprintSpeed);
    expect(physB.strength).toBe(physA.strength);
    expect(BODY.BALANCED.pace).toBe(0);
  });
});

describe('coaching badges', () => {
  it('unlocks in order and only at the right age', () => {
    expect(availableBadges(career(), 22)).toHaveLength(0);
    const atC = availableBadges(career(), 27);
    expect(atC.map((b) => b.id)).toEqual(['C']);
    // B only opens once C is done.
    const withC = career({ badges: ['C'] });
    expect(availableBadges(withC, 29).map((b) => b.id)).toEqual(['B']);
  });

  it('completes after the required weeks of study', () => {
    const started = startBadge(career(), 'C', 100);
    expect(started.ok).toBe(true);
    const badge = BADGES.find((b) => b.id === 'C')!;
    // Not yet.
    expect(advanceBadge(started.career, player(), 100 + badge.weeks * 7 - 14).news).toHaveLength(0);
    const done = advanceBadge(started.career, player(), 100 + badge.weeks * 7 + 1);
    expect(done.career.badges).toContain('C');
    expect(done.career.badgeStudy).toBeNull();
    expect(done.news[0].title).toMatch(/licence earned/i);
  });

  it('refuses to study two at once', () => {
    const c = startBadge(career(), 'C', 100).career;
    expect(startBadge(c, 'B', 110).ok).toBe(false);
  });
});

describe('off-season camps', () => {
  it('each buys something different', () => {
    const trainer = attendCamp(career(), player(), 'trainer', 10);
    expect(trainer.career.matchSharpness!).toBeGreaterThan(80);
    expect(trainer.moraleDelta).toBeLessThan(0); // brutal work

    const holiday = attendCamp(career(), player(), 'holiday', 10);
    expect(holiday.moraleDelta).toBeGreaterThan(0);
    expect(holiday.career.matchSharpness!).toBeLessThan(80);

    const specialist = attendCamp(career(), player(), 'specialist', 10);
    expect(specialist.career.developmentPoints!).toBeGreaterThan(0);
  });

  it('every camp is well-formed', () => {
    for (const c of CAMPS) expect(c.label.length).toBeGreaterThan(0);
    expect(attendCamp(career(), player(), 'nope', 10).ok).toBe(false);
  });
});

describe('versatility', () => {
  it('rewards genuinely multi-position players', () => {
    expect(versatilityRating(player({ positions: ['ST'] } as never))).toBeLessThan(versatilityRating(player({ positions: ['ST', 'CAM'] } as never)));
    expect(versatilityBias(player({ positions: ['ST', 'CAM', 'RW'] } as never))).toBeGreaterThan(versatilityBias(player({ positions: ['ST'] } as never)));
  });
});
