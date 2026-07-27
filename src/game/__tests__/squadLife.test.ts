import { describe, it, expect } from 'vitest';
import {
  deriveLeadership, leadershipNews, captainTeamTalkOptions, deliverTeamTalk,
  detectMarqueeSignal, updateLanguage, languageFactor, detectCliques, cliqueStandingBonus,
} from '../squadLife';
import type { Player } from '../../types/player';
import type { Club } from '../../types/club';
import type { PlayerCareer, SquadStatus } from '../../types/playerCareer';

function player(id: string, over: Partial<Player> & { bornYear?: number; overall?: number; nat?: string } = {}): Player {
  return {
    id, name: { first: 'A', last: id.toUpperCase() }, position: 'ST', positions: ['ST'],
    overall: over.overall ?? 75, nationality: over.nat ?? 'eng', morale: 60,
    born: { year: over.bornYear ?? 2000, month: 1, day: 1 },
    contract: { clubId: 'C' },
    attributes: { technical: { finishing: 70 }, mental: { composure: 70 }, physical: {}, goalkeeping: {} },
    hidden: { professionalism: 60, bigGame: 60, consistency: 60, injuryProneness: 40, ambition: 60, versatility: 60 },
    ...over,
  } as unknown as Player;
}
const career = (status: SquadStatus, over: Partial<PlayerCareer> = {}): PlayerCareer =>
  ({ playerId: 'me', status, managerTrust: 70, personality: { professionalism: 60 }, ...over } as unknown as PlayerCareer);
const club = (countryId: string): Club => ({ id: 'C', name: 'City', shortName: 'CTY', countryId } as unknown as Club);

describe('leadership ladder', () => {
  it('is a real progression: nobody → group → vice-captain → captain', () => {
    const junior = player('me');
    expect(deriveLeadership(career('ROTATION'), junior, 80)).toBe('NONE');
    expect(deriveLeadership(career('KEY'), junior, 65)).toBe('LEADERSHIP_GROUP');
    expect(deriveLeadership(career('CAPTAIN'), junior, 90)).toBe('CAPTAIN');
  });

  it('reserves the vice-captaincy for a natural leader with the room behind him', () => {
    const leader = player('me', {
      attributes: { technical: {}, mental: { composure: 90, aggression: 70 }, physical: {}, goalkeeping: {} },
      hidden: { professionalism: 90, bigGame: 70, consistency: 70, injuryProneness: 30, ambition: 70, versatility: 60 },
    } as never);
    const rung = deriveLeadership(career('STAR', { managerTrust: 80 }), leader, 80);
    expect(['VICE_CAPTAIN', 'LEADERSHIP_GROUP']).toContain(rung);
  });

  it('raises a beat when a rung is climbed', () => {
    expect(leadershipNews('VICE_CAPTAIN', player('me'), 10)!.title).toMatch(/vice-captain/i);
    expect(leadershipNews('LEADERSHIP_GROUP', player('me'), 10)!.title).toMatch(/leadership group/i);
    expect(leadershipNews('NONE', player('me'), 10)).toBeNull();
  });
});

describe('captain team talk', () => {
  it('offers different options depending on the scoreline', () => {
    expect(captainTeamTalkOptions(true).some((o) => o.id === 'rally')).toBe(true);
    expect(captainTeamTalkOptions(false).some((o) => o.id === 'focus')).toBe(true);
  });

  it('a rally lifts the squad and his standing', () => {
    const c = career('CAPTAIN', { dressingRoom: { standing: 70, bonds: [] } });
    const r = deliverTeamTalk(c, player('me'), 'rally', true, 10);
    expect(r.squadMorale).toBeGreaterThan(0);
    expect(r.career.dressingRoom!.standing).toBeGreaterThan(70);
  });

  it('blasting a room that does not respect you yet backfires', () => {
    const weak = career('CAPTAIN', { dressingRoom: { standing: 40, bonds: [] } });
    const r = deliverTeamTalk(weak, player('me'), 'blast', true, 10);
    expect(r.squadMorale).toBeLessThan(0);
    expect(r.career.dressingRoom!.standing).toBeLessThan(40);
    expect(r.news[0].title).toMatch(/fell flat/i);

    // The same blast from a respected captain works.
    const strong = career('CAPTAIN', { dressingRoom: { standing: 80, bonds: [] } });
    expect(deliverTeamTalk(strong, player('me'), 'blast', true, 10).squadMorale).toBeGreaterThan(0);
  });
});

describe('marquee signings', () => {
  it('flags a better new arrival in his position and dents morale', () => {
    const me = player('me', { overall: 74 });
    const star = player('star', { overall: 84 });
    const r = detectMarqueeSignal(career('KEY'), me, [me, star], ['me'], 20);
    expect(r.news.some((n) => /in your position/i.test(n.title))).toBe(true);
    expect(r.moraleDelta).toBeLessThan(0);
  });

  it('ignores an arrival who is worse, or in another position, or already known', () => {
    const me = player('me', { overall: 80 });
    const worse = player('sub', { overall: 70 });
    expect(detectMarqueeSignal(career('KEY'), me, [me, worse], ['me'], 20).news).toHaveLength(0);
    const gk = player('gk', { overall: 88, position: 'GK', positions: ['GK'] } as never);
    expect(detectMarqueeSignal(career('KEY'), me, [me, gk], ['me'], 20).news).toHaveLength(0);
    const star = player('star', { overall: 88 });
    expect(detectMarqueeSignal(career('KEY'), me, [me, star], ['me', 'star'], 20).news).toHaveLength(0);
  });
});

describe('language barrier', () => {
  it('starts on a move abroad and halves relationship growth', () => {
    const me = player('me', { nat: 'eng' });
    const r = updateLanguage(career('KEY'), me, club('esp'), 10);
    expect(r.career.language!.countryId).toBe('esp');
    expect(r.news.some((n) => /language/i.test(n.title))).toBe(true);
    expect(languageFactor(r.career)).toBeLessThan(1);
    expect(languageFactor(r.career)).toBeGreaterThanOrEqual(0.5);
  });

  it('does not apply at home, and clears when he returns', () => {
    const me = player('me', { nat: 'eng' });
    const home = updateLanguage(career('KEY', { language: { countryId: 'esp', fluency: 40, since: 1 } }), me, club('eng'), 10);
    expect(home.career.language).toBeNull();
    expect(languageFactor(home.career)).toBe(1);
  });

  it('climbs to fluency over time and raises a beat', () => {
    const me = player('me', { nat: 'eng' });
    let c = career('KEY', { language: { countryId: 'esp', fluency: 95, since: 1 } });
    const r = updateLanguage(c, me, club('esp'), 50);
    expect(r.career.language!.fluency).toBe(100);
    expect(r.news.some((n) => /fluent/i.test(n.title))).toBe(true);
    expect(languageFactor(r.career)).toBe(1);
  });
});

describe('cliques', () => {
  it('detects the groups in a room and where he belongs', () => {
    const me = player('me', { bornYear: 2005, nat: 'eng' }); // 20 in 2025
    const squad = [
      me,
      player('a', { bornYear: 2005, nat: 'eng' }), player('b', { bornYear: 2004, nat: 'eng' }),
      player('c', { bornYear: 2004 }), player('d', { bornYear: 1993 }), player('e', { bornYear: 1992 }),
    ];
    const cliques = detectCliques(me, squad, 2025);
    expect(cliques.some((c) => c.kind === 'NATIONALITY' && c.belongs)).toBe(true);
    expect(cliques.some((c) => c.kind === 'AGE' && c.belongs)).toBe(true);
    // He's 20 — not one of the senior pros.
    expect(cliques.find((c) => c.kind === 'SENIOR_PROS')?.belongs).toBe(false);
  });

  it('belonging to more groups makes standing easier to build', () => {
    expect(cliqueStandingBonus([{ kind: 'AGE', label: '', members: [], belongs: true }, { kind: 'NATIONALITY', label: '', members: [], belongs: true }])).toBeGreaterThan(0);
    expect(cliqueStandingBonus([{ kind: 'AGE', label: '', members: [], belongs: false }])).toBeLessThan(0);
  });
});
