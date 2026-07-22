import { describe, it, expect } from 'vitest';
import {
  deriveSquadStatus, updateStatus, updateRival, updateTraits, updateAdversity, updateInternational, statusRank,
} from '../playerProgression';
import { resolveConversation, evaluatePromises, requestMinutesOutcome, roleMeetingConversation } from '../playerConversations';
import { generatePlayer } from '../../engine/generator';
import { Rng } from '../../engine/rng';
import type { Player } from '../../types/player';
import type { PlayerCareer } from '../../types/playerCareer';

function mk(overall: number, opts: { age?: number; position?: Player['position'] } = {}): Player {
  const p = generatePlayer({ rng: new Rng(overall * 7 + 1), currentYear: 2025, target: overall, position: opts.position ?? 'ST', ageRange: [opts.age ?? 24, opts.age ?? 24], ratingCap: 95 });
  p.overall = overall;
  p.contract.clubId = 'C';
  return p;
}
function career(over: Partial<PlayerCareer> = {}): PlayerCareer {
  return {
    playerId: 'av', origin: 'CREATED', archetype: 'Academy Graduate',
    managerTrust: 50, status: 'YOUTH', clubRelationship: 55, fanRating: 50, following: 0,
    seasonGoals: 0, seasonApps: 0, seasonAvgRating: 0, objectives: [], traits: [],
    personality: { professionalism: 55, ambition: 60, loyalty: 55, temperament: 50 },
    sponsorships: [], international: { capped: false, caps: 0, intlGoals: 0 },
    milestones: [], seasonHistory: [], ...over,
  };
}

describe('squad-status ladder', () => {
  it('a raw teenager sits low; a trusted, high-rated regular rises', () => {
    const youth = mk(58, { age: 17 });
    const lowStatus = deriveSquadStatus(career({ managerTrust: 40, seasonApps: 1, seasonAvgRating: 6.4 }), youth, 2025);
    expect(['YOUTH', 'PROSPECT']).toContain(lowStatus);

    const star = mk(84, { age: 26 });
    const highStatus = deriveSquadStatus(career({ managerTrust: 85, seasonApps: 30, seasonAvgRating: 7.4 }), star, 2025);
    expect(statusRank(highStatus)).toBeGreaterThanOrEqual(statusRank('KEY'));
  });

  it('a change fires a narrative news item + records the arc', () => {
    const p = mk(82, { age: 25 });
    const c = career({ status: 'ROTATION', managerTrust: 88, seasonApps: 30, seasonAvgRating: 7.5 });
    const res = updateStatus(c, p, 2025, 100);
    expect(res.career.status).not.toBe('ROTATION');
    expect(res.news.length).toBe(1);
    expect(res.career.statusHistory!.length).toBe(1);
  });
});

describe('positional rival', () => {
  it('picks the strongest teammate in the same position', () => {
    const avatar = mk(70, { position: 'ST' });
    const rivalST = mk(80, { position: 'ST' });
    const otherCB = mk(85, { position: 'RCB' });
    const res = updateRival(career(), avatar, [avatar, rivalST, otherCB], 50);
    expect(res.career.rival!.playerId).toBe(rivalST.id);
  });
});

describe('traits', () => {
  it('detects a newly-earned trait and fires a milestone', () => {
    const p = mk(84, { position: 'ST' });
    p.attributes.technical.finishing = 90; // → CLINICAL
    const res = updateTraits(career(), p, 60);
    expect(res.career.traits).toContain('CLINICAL');
    expect(res.news.some((n) => /trait/i.test(n.title))).toBe(true);
  });
});

describe('adversity', () => {
  it('a fresh injury drops sharpness and raises a news item', () => {
    const p = mk(75);
    p.injury = { type: 'Knock', weeksOut: 3 } as never;
    const res = updateAdversity(career({ matchSharpness: 100 }), p, false, 30);
    expect(res.career.matchSharpness).toBeLessThan(60);
    expect(res.news.some((n) => n.category === 'INJURY')).toBe(true);
  });

  it('confidence tracks the last rating and a slump worsens form (escapably)', () => {
    const p = mk(75);
    const good = updateAdversity(career({ confidence: 40, lastMatch: { rating: 8.5 } as never }), p, false, 30);
    expect(good.career.confidence).toBeGreaterThan(40);
    const bad = updateAdversity(career({ confidence: 40, lastMatch: { rating: 5.0 } as never }), p, false, 30);
    expect(bad.career.confidence).toBeLessThan(40);
    expect(bad.formDelta).toBeLessThanOrEqual(0);
  });
});

describe('international call-up', () => {
  it('fires the first cap once form + standing cross the threshold', () => {
    const p = mk(80);
    const res = updateInternational(career({ status: 'KEY', seasonApps: 12, seasonAvgRating: 7.1 }), p, 200);
    expect(res.career.international.capped).toBe(true);
    expect(res.career.international.caps).toBe(1);
    expect(res.news.some((n) => /call-up/i.test(n.title))).toBe(true);
  });
  it('does not call up a fringe player', () => {
    const p = mk(70);
    const res = updateInternational(career({ status: 'ROTATION', seasonApps: 3, seasonAvgRating: 6.6 }), p, 200);
    expect(res.career.international.capped).toBe(false);
  });
});

describe('conversations & promises', () => {
  it('a choice moves trust/relationship and can lock a promise', () => {
    const conv = roleMeetingConversation(0);
    const res = resolveConversation(career({ managerTrust: 50 }), conv, 1, 0); // "want to be a regular" → PLAYING_TIME promise
    expect(res.career.promises!.length).toBe(1);
    expect(res.career.pendingConversations ?? []).toHaveLength(0);
  });

  it('promises are kept or broken at the deadline with consequences', () => {
    const p = mk(72);
    const withPromise = career({ promises: [{ text: 'play you regularly', kind: 'PLAYING_TIME', deadline: 100 }], seasonApps: 2, clubRelationship: 60 });
    const broken = evaluatePromises(withPromise, p, 120); // past deadline, only 2 apps → broken
    expect(broken.career.promises).toHaveLength(0);
    expect(broken.moraleDelta).toBeLessThan(0);
    expect(broken.career.clubRelationship).toBeLessThan(60);

    const kept = evaluatePromises(career({ promises: [{ text: 'x', kind: 'PLAYING_TIME', deadline: 100 }], seasonApps: 15, clubRelationship: 60 }), p, 120);
    expect(kept.moraleDelta).toBeGreaterThan(0);
  });

  it('asking for minutes depends on standing', () => {
    const p = mk(75); p.form = 40;
    const happy = requestMinutesOutcome(career({ managerTrust: 70 }), p, 10);
    expect(happy.career.promises!.length).toBe(1);
    const rebuffed = requestMinutesOutcome(career({ managerTrust: 35 }), p, 10);
    expect(rebuffed.moraleDelta).toBeLessThan(0);
  });
});
