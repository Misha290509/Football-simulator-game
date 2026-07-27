import { describe, it, expect } from 'vitest';
import {
  nationOf, runQualifying, tournamentSelection, roleMoved, maybeIntlRival,
  intlRivalDrift, maybePretender, pretenderPressure, shootoutBeat,
  type IntlRole,
} from '../internationalCareer';
import type { Player } from '../../types/player';
import type { PlayerCareer } from '../../types/playerCareer';

function player(over: Partial<Player> & { ovr?: number; bornYear?: number; nat?: string } = {}): Player {
  const { ovr, bornYear, nat, ...rest } = over;
  return {
    id: 'me', name: { first: 'Sam', last: 'Reid' }, position: 'ST', positions: ['ST'],
    overall: ovr ?? 80, nationality: nat ?? 'England', morale: 60, fitness: 100,
    born: { year: bornYear ?? 2000, month: 1, day: 1 },
    contract: { clubId: 'C', wage: 40_000 },
    attributes: {
      technical: { finishing: 78, penalties: 75 }, mental: { composure: 75 },
      physical: {}, goalkeeping: {},
    },
    hidden: { professionalism: 60, bigGame: 70, consistency: 60, injuryProneness: 40, ambition: 60, versatility: 60 },
    ...rest,
  } as unknown as Player;
}
const career = (over: Partial<PlayerCareer> = {}): PlayerCareer =>
  ({
    playerId: 'me', status: 'KEY', international: { capped: true, caps: 20, intlGoals: 4 },
    intlManagerTrust: 60, seasonAvgRating: 7.0, ...over,
  } as unknown as PlayerCareer);

describe('nation resolution', () => {
  it('canonicalises the avatar’s nationality for the tournament engine', () => {
    expect(nationOf(player({ nat: 'England' }))).toBe('England');
    expect(nationOf(player({ nat: '' } as never))).toBe('his country');
  });
});

describe('qualifying campaigns', () => {
  it('plays eight matches and adds up correctly', () => {
    const { campaign } = runQualifying(player(), 'England', 'World Cup 2030', 2029, true, 1);
    expect(campaign.played).toBe(8);
    expect(campaign.won + campaign.drawn + campaign.lost).toBe(8);
    expect(campaign.points).toBe(campaign.won * 3 + campaign.drawn);
    expect(campaign.position).toBeGreaterThanOrEqual(1);
    expect(campaign.position).toBeLessThanOrEqual(5);
    expect(campaign.qualified).toBe(campaign.position <= 2);
  });

  it('is far kinder to a strong nation than a weak one', () => {
    const rate = (nation: string) => {
      let q = 0;
      for (let s = 0; s < 200; s++) if (runQualifying(player(), nation, 'World Cup', 2029, true, s).campaign.qualified) q++;
      return q / 200;
    };
    expect(rate('France')).toBeGreaterThan(rate('Iceland'));
    expect(rate('France')).toBeGreaterThan(0.5);
  });

  it('gives him caps only when he was actually involved', () => {
    const inside = runQualifying(player(), 'England', 'Euros', 2029, true, 4).campaign;
    const outside = runQualifying(player(), 'England', 'Euros', 2029, false, 4).campaign;
    expect(inside.caps).toBeGreaterThan(0);
    expect(outside.caps).toBe(0);
    expect(outside.goals).toBe(0);
  });

  it('hurts far more to miss out when he was in the squad', () => {
    let missIn = 0, missOut = 0;
    for (let s = 0; s < 300; s++) {
      const a = runQualifying(player(), 'Wales', 'Euros', 2029, true, s);
      const b = runQualifying(player(), 'Wales', 'Euros', 2029, false, s);
      if (!a.campaign.qualified) { missIn = a.moraleDelta; missOut = b.moraleDelta; break; }
    }
    expect(missIn).toBeLessThan(missOut);
  });

  it('is deterministic for the same nation, year and seed', () => {
    const a = runQualifying(player(), 'Spain', 'Euros', 2029, true, 9).campaign;
    const b = runQualifying(player(), 'Spain', 'Euros', 2029, true, 9).campaign;
    expect(a).toEqual(b);
  });
});

describe('tournament selection', () => {
  const sel = (c: PlayerCareer, p: Player, seed = 3) =>
    tournamentSelection(c, p, 'England', 'World Cup 2030', 2030, seed);

  it('makes a world-class veteran with a long cap record the captain', () => {
    const r = sel(career({ international: { capped: true, caps: 80, intlGoals: 30 }, intlManagerTrust: 90, seasonAvgRating: 7.6 } as never),
      player({ ovr: 92 }));
    expect(r.role).toBe('CAPTAIN');
    expect(r.moraleDelta).toBeGreaterThan(0);
    expect(r.news[0].title).toMatch(/captain/i);
  });

  it('cuts a player who is nowhere near the level, and offers him a way to respond', () => {
    const r = sel(career({ intlManagerTrust: 20, seasonAvgRating: 6.0 }), player({ ovr: 62 }));
    expect(r.role).toBe('CUT');
    expect(r.career.intlSnub).toEqual({ year: 2030, competition: 'World Cup 2030' });
    expect(r.moraleDelta).toBeLessThan(-10);
    expect(r.conversation!.trigger).toBe('INTL_CUT');
    // Walking away from your country should cost you dearly with the manager.
    const quit = r.conversation!.choices[2];
    expect(quit.trust!).toBeLessThan(-20);
  });

  it('puts a borderline player on standby with a press question attached', () => {
    let standby: ReturnType<typeof sel> | null = null;
    for (let ovr = 60; ovr <= 92 && !standby; ovr++) {
      const r = sel(career({ intlManagerTrust: 45 }), player({ ovr }));
      if (r.role === 'STANDBY') standby = r;
    }
    expect(standby).not.toBeNull();
    expect(standby!.conversation!.trigger).toBe('INTL_STANDBY');
    expect(standby!.moraleDelta).toBeLessThan(0);
  });

  it('gets harder as he ages past 33', () => {
    const young = sel(career(), player({ ovr: 84, bornYear: 2000 }));
    const old = sel(career(), player({ ovr: 84, bornYear: 1994 }));
    const rank: IntlRole[] = ['CUT', 'STANDBY', 'SQUAD', 'STARTER', 'CAPTAIN'];
    expect(rank.indexOf(old.role)).toBeLessThanOrEqual(rank.indexOf(young.role));
  });

  it('punishes a player whose shirt has already been taken', () => {
    const base = career();
    const taken = career({ intlPretender: { name: 'Kid', bornYear: 2011, since: 0, tookShirt: true } } as never);
    const rank: IntlRole[] = ['CUT', 'STANDBY', 'SQUAD', 'STARTER', 'CAPTAIN'];
    const p = player({ ovr: 78 });
    expect(rank.indexOf(sel(taken, p).role)).toBeLessThanOrEqual(rank.indexOf(sel(base, p).role));
  });

  it('reads a change in the pecking order', () => {
    expect(roleMoved('SQUAD', 'CAPTAIN')).toBe('UP');
    expect(roleMoved('STARTER', 'STANDBY')).toBe('DOWN');
    expect(roleMoved('SQUAD', 'SQUAD')).toBe('SAME');
    expect(roleMoved(undefined, 'CUT')).toBe('SAME');
  });
});

describe('the rival for your shirt', () => {
  const pool = (over: Partial<Player>[] = []) => [
    player(),
    player({ id: 'mate', name: { first: 'Joe', last: 'Payne' }, ovr: 79, nat: 'England' } as never),
    player({ id: 'away', name: { first: 'Dan', last: 'Fox', }, ovr: 82, nat: 'England', contract: { clubId: 'OTHER' } } as never),
    player({ id: 'foreign', name: { first: 'Luc', last: 'Marchand' }, ovr: 84, nat: 'France' } as never),
    ...over.map((o) => player(o as never)),
  ];

  const firstHit = (c: PlayerCareer, ps: Player[]) => {
    for (let d = 0; d < 400; d++) {
      const r = maybeIntlRival(c, player(), ps, 'England', d, 5);
      if (r.career.intlRival) return r;
    }
    return null;
  };

  it('prefers a clubmate over an equally good stranger — it is a better story', () => {
    const hit = firstHit(career(), pool())!;
    expect(hit).not.toBeNull();
    expect(hit.career.intlRival!.clubmate).toBe(true);
    expect(hit.career.intlRival!.name).toBe('Joe Payne');
    expect(hit.conversation!.trigger).toBe('INTL_RIVAL');
  });

  it('falls back to a rival elsewhere when nobody at the club fits', () => {
    const noMates = pool().filter((p) => p.id !== 'mate');
    const hit = firstHit(career(), noMates)!;
    expect(hit.career.intlRival!.clubmate).toBe(false);
    expect(hit.career.intlRival!.name).toBe('Dan Fox');
    expect(hit.conversation).toBeNull();
  });

  it('never picks a player of another nationality', () => {
    const onlyForeign = pool().filter((p) => p.id === 'me' || p.id === 'foreign');
    expect(firstHit(career(), onlyForeign)).toBeNull();
  });

  it('does nothing for an uncapped player, or when a rival already exists', () => {
    const uncapped = career({ international: { capped: false, caps: 0, intlGoals: 0 } } as never);
    expect(firstHit(uncapped, pool())).toBeNull();
    const existing = career({ intlRival: { name: 'X', clubmate: false, rating: 80, relationship: 50 } } as never);
    for (let d = 0; d < 100; d++) {
      expect(maybeIntlRival(existing, player(), pool(), 'England', d, 5).career.intlRival!.name).toBe('X');
    }
  });

  it('cools the relationship when he outplays the rival, and warms it when he doesn’t', () => {
    const c = career({ intlRival: { name: 'X', clubmate: true, rating: 80, relationship: 50 } } as never);
    expect(intlRivalDrift(c, 7.5).intlRival!.relationship).toBeLessThan(50);
    expect(intlRivalDrift(c, 6.0).intlRival!.relationship).toBeGreaterThan(50);
    expect(intlRivalDrift(c, 6.7).intlRival!.relationship).toBe(50);
    expect(intlRivalDrift(career(), 7.5).intlRival).toBeUndefined();
  });
});

describe('the young pretender', () => {
  const firstHit = (c: PlayerCareer, p: Player) => {
    for (let y = 2029; y < 2060; y++) {
      const r = maybePretender(c, p, y, 0, y);
      if (r.career.intlPretender) return { r, y };
    }
    return null;
  };

  it('never appears while the player is still young', () => {
    for (let y = 2020; y < 2028; y++) {
      expect(maybePretender(career(), player({ bornYear: 2000 }), y, 0, y).career.intlPretender).toBeFalsy();
    }
  });

  it('arrives once he is the wrong side of thirty, aged nineteen', () => {
    const hit = firstHit(career(), player({ bornYear: 2000 }))!;
    expect(hit).not.toBeNull();
    expect(hit.r.career.intlPretender!.bornYear).toBe(hit.y - 19);
    expect(hit.r.moraleDelta).toBeLessThan(0);
    expect(hit.r.news[0].title).toMatch(/next one/i);
  });

  it('is held off by real form, and only for so long', () => {
    const c = career({ intlPretender: { name: 'Kid Jones', bornYear: 2012, since: 0 } } as never);
    const holds = pretenderPressure(c, player({ bornYear: 2000 }), 2031, 7.4, 10);
    expect(holds.career.intlPretender!.tookShirt).toBeFalsy();
    expect(holds.trustDelta).toBeGreaterThan(0);

    const slips = pretenderPressure(c, player({ bornYear: 2000 }), 2031, 6.4, 10);
    expect(slips.career.intlPretender!.tookShirt).toBe(true);
    expect(slips.career.intlRole).toBe('SQUAD');
    expect(slips.moraleDelta).toBeLessThan(-10);
    expect(slips.trustDelta).toBeLessThan(0);
  });

  it('cannot be held off at all past 34, however well he plays', () => {
    const c = career({ intlPretender: { name: 'Kid Jones', bornYear: 2016, since: 0 } } as never);
    expect(pretenderPressure(c, player({ bornYear: 2000 }), 2036, 7.9, 10).career.intlPretender!.tookShirt).toBe(true);
  });

  it('stops firing once the shirt is gone', () => {
    const gone = career({ intlPretender: { name: 'Kid', bornYear: 2012, since: 0, tookShirt: true } } as never);
    const r = pretenderPressure(gone, player({ bornYear: 2000 }), 2035, 6.0, 10);
    expect(r.news).toHaveLength(0);
    expect(r.moraleDelta).toBe(0);
  });
});

describe('shootouts', () => {
  it('a keeper never takes one', () => {
    const gk = player({ position: 'GK', positions: ['GK'] } as never);
    for (let s = 0; s < 60; s++) {
      expect(shootoutBeat(gk, 'England', 'Italy', 'Semi-final', true, 0, s).took).toBe(false);
    }
  });

  it('bottle decides who walks up: a cool head takes far more than a nervous one', () => {
    const cool = player({
      attributes: { technical: { finishing: 78, penalties: 85 }, mental: { composure: 95 }, physical: {}, goalkeeping: {} },
      hidden: { professionalism: 60, bigGame: 95, consistency: 60, injuryProneness: 40, ambition: 60, versatility: 60 },
    } as never);
    const nervous = player({
      attributes: { technical: { finishing: 78, penalties: 40 }, mental: { composure: 25 }, physical: {}, goalkeeping: {} },
      hidden: { professionalism: 60, bigGame: 20, consistency: 60, injuryProneness: 40, ambition: 60, versatility: 60 },
    } as never);
    const rate = (p: Player) => {
      let n = 0;
      for (let d = 0; d < 300; d++) if (shootoutBeat(p, 'England', 'Italy', 'Final', true, d, 1).took) n++;
      return n / 300;
    };
    expect(rate(cool)).toBeGreaterThan(rate(nervous) + 0.3);
  });

  it('the worst outcome in football is missing the one that loses it', () => {
    let worst: ReturnType<typeof shootoutBeat> | null = null;
    for (let d = 0; d < 500 && !worst; d++) {
      const r = shootoutBeat(player(), 'England', 'Italy', 'Quarter-final', false, d, 2);
      if (r.took && !r.scored) worst = r;
    }
    expect(worst).not.toBeNull();
    expect(worst!.moraleDelta).toBeLessThan(-15);
    expect(worst!.confidenceDelta).toBeLessThan(-15);
    expect(worst!.news.title).toMatch(/misses the penalty/i);
  });

  it('scoring the winner is worth more than being carried through', () => {
    const scored = (() => {
      for (let d = 0; d < 500; d++) {
        const r = shootoutBeat(player(), 'England', 'Italy', 'Final', true, d, 3);
        if (r.took && r.scored) return r;
      }
      return null;
    })();
    const watched = (() => {
      for (let d = 0; d < 500; d++) {
        const r = shootoutBeat(player(), 'England', 'Italy', 'Final', true, d, 3);
        if (!r.took) return r;
      }
      return null;
    })();
    expect(scored).not.toBeNull();
    expect(watched).not.toBeNull();
    expect(scored!.moraleDelta).toBeGreaterThan(watched!.moraleDelta);
    expect(scored!.confidenceDelta).toBeGreaterThan(watched!.confidenceDelta);
  });

  it('is deterministic for the same player, day and seed', () => {
    for (let d = 0; d < 30; d++) {
      const a = shootoutBeat(player(), 'England', 'Italy', 'Final', true, d, 7);
      const b = shootoutBeat(player(), 'England', 'Italy', 'Final', true, d, 7);
      expect([a.took, a.scored, a.moraleDelta]).toEqual([b.took, b.scored, b.moraleDelta]);
    }
  });
});
