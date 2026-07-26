import { describe, it, expect } from 'vitest';
import {
  deriveSquadStatus, updateStatus, updateRival, updateTraits, updateAdversity, updateInternational, resolveCallUp, statusRank,
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

  it('a rival who leaves the club triggers a "moved on" beat and a fresh challenger', () => {
    const avatar = mk(70, { position: 'ST' });
    const oldRival = mk(80, { position: 'ST' });
    const newRival = mk(74, { position: 'ST' });
    // Career already tracks oldRival, but the squad no longer contains him.
    const c = career({ rival: { playerId: oldRival.id, relationship: 0, edge: 0 } });
    const res = updateRival(c, avatar, [avatar, newRival], 120);
    expect(res.news.some((n) => /moved on/i.test(n.title))).toBe(true);
    expect(res.career.rival!.playerId).toBe(newRival.id);
  });

  it('the rival taking the shirt corners you for a press reaction (a queued choice)', () => {
    const avatar = mk(70, { position: 'ST' });
    avatar.form = -40; // out-formed → edge slides down
    const rivalST = mk(78, { position: 'ST' });
    rivalST.form = 40;
    const c = career({ rival: { playerId: rivalST.id, relationship: 0, edge: -5 } });
    const res = updateRival(c, avatar, [avatar, rivalST], 210);
    expect(res.career.rival!.edge).toBeLessThanOrEqual(-6);
    const conv = (res.career.pendingConversations ?? [])[0];
    expect(conv?.trigger).toBe('RIVAL_PRESS');
    // Firing back should cost the rival relationship but grow the following.
    const answered = resolveConversation(res.career, conv!, 0, 210);
    expect(answered.career.rival!.relationship).toBeLessThan(0);
    expect((answered.career.following ?? 0)).toBeGreaterThan(c.following ?? 0);
  });

  it('a decisive head-to-head edge fires "the shirt is yours"', () => {
    const avatar = mk(70, { position: 'ST' });
    avatar.form = 40; // out-forming him tips the edge up
    const rivalST = mk(72, { position: 'ST' });
    rivalST.form = -40;
    // Prior edge just below the decisive threshold, same rival.
    const c = career({ rival: { playerId: rivalST.id, relationship: 0, edge: 5 } });
    const res = updateRival(c, avatar, [avatar, rivalST], 200);
    expect(res.career.rival!.edge).toBeGreaterThanOrEqual(6);
    expect(res.news.some((n) => /shirt is yours/i.test(n.title))).toBe(true);
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

  it('a serious injury opens a comeback arc that returns and then completes', () => {
    const hurt = mk(78);
    hurt.injury = { type: 'Ligament', weeksOut: 12, description: 'A ruptured knee ligament', occurredOnDay: 30 } as never;
    const onset = updateAdversity(career({ matchSharpness: 100, confidence: 60 }), hurt, false, 30);
    expect(onset.career.comeback?.returned).toBe(false);
    expect(onset.news.some((n) => /serious blow/i.test(n.title))).toBe(true);

    const fit = mk(78); fit.injury = null;
    const back = updateAdversity({ ...onset.career, matchSharpness: 25 }, fit, true, 90);
    expect(back.career.comeback?.returned).toBe(true);
    expect(back.news.some((n) => /comeback/i.test(n.title))).toBe(true);

    const done = updateAdversity({ ...back.career, matchSharpness: 90 }, fit, false, 150);
    expect(done.news.some((n) => /all the way back/i.test(n.title))).toBe(true);
    expect(done.career.comeback).toBeNull();
  });

  it('a minor knock stays a simple sidelining, no comeback arc', () => {
    const p = mk(75);
    p.injury = { type: 'Knock', weeksOut: 2, description: 'A dead leg', occurredOnDay: 30 } as never;
    const res = updateAdversity(career({ matchSharpness: 100 }), p, false, 30);
    expect(res.career.comeback ?? null).toBeNull();
    expect(res.news.some((n) => /sidelined/i.test(n.title))).toBe(true);
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
  it('surfaces a call-up decision once form + standing cross the threshold, and accepting wins the cap', () => {
    const p = mk(80);
    const res = updateInternational(career({ status: 'KEY', seasonApps: 12, seasonAvgRating: 7.1 }), p, 200);
    // The call-up is now an accept/withdraw decision, not an automatic cap.
    expect(res.career.pendingCallUp).toBeTruthy();
    expect(res.career.international.capped).toBe(false);
    expect(res.news.some((n) => /call-up/i.test(n.title))).toBe(true);
    // Accepting wins the first cap and opens the national-team relationship.
    const accepted = resolveCallUp(res.career, p, true, 205);
    expect(accepted.career.international.capped).toBe(true);
    expect(accepted.career.international.caps).toBe(1);
    expect(accepted.career.pendingCallUp).toBeNull();
    // Withdrawing instead leaves him uncapped.
    const declined = resolveCallUp(res.career, p, false, 205);
    expect(declined.career.international.capped).toBe(false);
    expect(declined.career.pendingCallUp).toBeNull();
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
