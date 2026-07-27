import { describe, it, expect } from 'vitest';
import {
  updateBurnout, burnoutFormPenalty, resolveBurnout,
  maybeChronic, maybeIncident, updateSpiral,
} from '../adversity';
import type { Player } from '../../types/player';
import type { PlayerCareer } from '../../types/playerCareer';

const player = (over: Partial<Player> = {}): Player => ({
  id: 'me', name: { first: 'Alex', last: 'Hunter' }, position: 'ST', positions: ['ST'], overall: 80, fitness: 90,
  attributes: {
    technical: {}, mental: {},
    physical: { sprintSpeed: 85, acceleration: 84, strength: 70, agility: 75, balance: 70, jumping: 70, stamina: 75 },
    goalkeeping: {},
  },
  hidden: { professionalism: 70, bigGame: 60, consistency: 60, injuryProneness: 40, ambition: 70, versatility: 60 },
  ...over,
} as unknown as Player);

const career = (over: Partial<PlayerCareer> = {}): PlayerCareer =>
  ({ playerId: 'me', managerTrust: 60, confidence: 60, fanRating: 60, clubRelationship: 60,
     personality: { professionalism: 70 }, publicImage: { persona: 'Unknown', controversy: 10 },
     bankBalance: 5_000_000, recentRatings: [6.8, 6.9, 7.0], ...over } as unknown as PlayerCareer);

describe('burnout', () => {
  it('builds with relentless minutes and recovers with rest', () => {
    const heavy = updateBurnout(career(), player(), 4, 10);
    expect(heavy.career.burnout!.level).toBeGreaterThan(0);
    const rested = updateBurnout(heavy.career, player(), 0, 20);
    expect(rested.career.burnout!.level).toBeLessThan(heavy.career.burnout!.level);
  });

  it('surfaces a real choice when it crosses into trouble', () => {
    let c = career({ burnout: { level: 66, since: 1, addressed: false } });
    const r = updateBurnout(c, player({ fitness: 50 }), 4, 30);
    expect(r.career.burnout!.level).toBeGreaterThanOrEqual(70);
    expect(r.conversation?.trigger).toBe('BURNOUT');
    expect(r.conversation!.choices.length).toBe(3);
    expect(r.news.some((n) => /running on empty/i.test(n.title))).toBe(true);
  });

  it('drags on form until addressed, then lifts', () => {
    const bad = career({ burnout: { level: 80, since: 1, addressed: false } });
    expect(burnoutFormPenalty(bad)).toBeLessThan(0);
    const fixed = resolveBurnout(bad);
    expect(fixed.burnout!.level).toBeLessThan(80);
    expect(fixed.burnout!.addressed).toBe(true);
    expect(burnoutFormPenalty(fixed)).toBeGreaterThanOrEqual(burnoutFormPenalty(bad));
  });

  it('a fresh, rested player has no penalty', () => {
    expect(burnoutFormPenalty(career())).toBe(0);
  });
});

describe('chronic injury', () => {
  it('only ever comes from a genuinely serious lay-off', () => {
    expect(maybeChronic(career(), player(), 4, 10, 7).news).toHaveLength(0);
  });

  it('permanently caps pace and raises injury-proneness when it lands', () => {
    let landed = null as null | ReturnType<typeof maybeChronic>;
    for (let d = 0; d < 100 && !landed; d++) {
      const r = maybeChronic(career(), player(), 16, d, 7);
      if (r.news.length) landed = r;
    }
    expect(landed).not.toBeNull();
    const phys = landed!.player.attributes.physical as Record<string, number>;
    expect(phys.sprintSpeed).toBeLessThan(85);
    expect(landed!.player.hidden.injuryProneness).toBeGreaterThan(40);
    expect(landed!.career.chronic).toBeTruthy();
    // Never fires twice.
    expect(maybeChronic(landed!.career, landed!.player, 20, 200, 7).news).toHaveLength(0);
  });
});

describe('off-field incidents', () => {
  it('a model professional is essentially safe', () => {
    const pro = career({ personality: { professionalism: 95 } as never, publicImage: { persona: 'Model Professional', controversy: 0 } });
    let hits = 0;
    for (let d = 0; d < 300; d++) if (maybeIncident(pro, player(), d, 7).news.length) hits++;
    expect(hits).toBe(0);
  });

  it('a reckless, controversial player eventually gets caught out', () => {
    const wild = career({ personality: { professionalism: 30 } as never, publicImage: { persona: 'Bad Boy', controversy: 80 } });
    let hit = null as null | ReturnType<typeof maybeIncident>;
    for (let d = 0; d < 400 && !hit; d++) {
      const r = maybeIncident(wild, player(), d, 7);
      if (r.news.length) hit = r;
    }
    expect(hit).not.toBeNull();
    expect(hit!.career.bankBalance!).toBeLessThan(5_000_000); // fined
    expect(hit!.career.fanRating!).toBeLessThan(60);
    expect(hit!.moraleDelta).toBeLessThan(0);
    expect(hit!.conversation?.trigger).toBe('INCIDENT');
    expect(hit!.career.incidents!.length).toBe(1);
  });
});

describe('the spiral', () => {
  it('starts when form, trust and confidence all collapse together', () => {
    const bad = career({ recentRatings: [5.8, 5.9, 6.0], managerTrust: 35, confidence: 30 });
    const r = updateSpiral(bad, player(), 10);
    expect(r.career.spiral).toBeTruthy();
    expect(r.formDelta).toBeLessThan(0);
    expect(r.news.some((n) => /going against him/i.test(n.title))).toBe(true);
  });

  it('deepens while it lasts and ends with a beat when he climbs out', () => {
    let c = career({ recentRatings: [5.8, 5.9, 6.0], managerTrust: 35, confidence: 30 });
    let deep = 0;
    for (let i = 0; i < 4; i++) { const r = updateSpiral(c, player(), 10 + i); c = r.career; deep = c.spiral!.depth; }
    expect(deep).toBeGreaterThan(1);
    // Form recovers → out of the hole.
    const recovered = { ...c, recentRatings: [7.4, 7.5, 7.2], managerTrust: 65, confidence: 70 } as PlayerCareer;
    const out = updateSpiral(recovered, player(), 50);
    expect(out.career.spiral).toBeNull();
    expect(out.news.some((n) => /out of the hole/i.test(n.title))).toBe(true);
  });

  it('a player going along fine is never in one', () => {
    const r = updateSpiral(career(), player(), 10);
    expect(r.career.spiral ?? null).toBeNull();
    expect(r.formDelta).toBe(0);
  });
});
