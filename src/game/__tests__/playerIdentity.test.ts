import { describe, it, expect } from 'vitest';
import {
  assignShirtNumber, canRequestNumber, isMarqueeNumber, updateShirt, takenNumbers,
  checkBoyhoodMove, betrayalPenalty, maybeAllegianceChoice, commitAllegiance,
  ritualIntact, CELEBRATIONS, RITUALS,
} from '../playerIdentity';
import type { Player } from '../../types/player';
import type { Club } from '../../types/club';
import type { PlayerCareer } from '../../types/playerCareer';

const player = (id: string, pos: Player['position'] = 'ST', over: Partial<Player> = {}): Player =>
  ({ id, name: { first: 'A', last: id.toUpperCase() }, position: pos, positions: [pos], overall: 75, nationality: 'eng',
    contract: { clubId: 'C' }, ...over } as unknown as Player);

const career = (over: Partial<PlayerCareer> = {}): PlayerCareer =>
  ({ playerId: 'me', status: 'ROTATION', fanRating: 50, international: { capped: false, caps: 0, intlGoals: 0 }, ...over } as unknown as PlayerCareer);

const club = (name: string): Club => ({ id: 'C', name, shortName: name } as unknown as Club);

describe('shirt numbers', () => {
  it('gives a youngster a squad number and a senior player a marquee one', () => {
    const av = player('me');
    const junior = assignShirtNumber(av, 'YOUTH', new Set());
    const senior = assignShirtNumber(av, 'STAR', new Set());
    expect(isMarqueeNumber(junior)).toBe(false);
    expect(isMarqueeNumber(senior)).toBe(true);
  });

  it('never assigns a number a teammate already wears', () => {
    const n = assignShirtNumber(player('me'), 'STAR', new Set([9, 10, 7]));
    expect([9, 10, 7]).not.toContain(n);
  });

  it('gates marquee numbers behind status when requested', () => {
    expect(canRequestNumber('ROTATION', 10, new Set()).ok).toBe(false);
    expect(canRequestNumber('STAR', 10, new Set()).ok).toBe(true);
    expect(canRequestNumber('STAR', 10, new Set([10])).ok).toBe(false); // taken
    expect(canRequestNumber('STAR', 99, new Set()).ok).toBe(false); // out of range
  });

  it('strips the marquee shirt when he slips down the pecking order', () => {
    const c = career({ status: 'ROTATION', shirt: { number: 10, marquee: true } });
    const r = updateShirt(c, player('me'), [player('me')], 100, 5);
    expect(r.career.shirt!.marquee).toBe(false);
    expect(r.news.some((n) => /shirt/i.test(n.title))).toBe(true);
  });

  it('reads taken numbers off the squad', () => {
    const mate = { ...player('mate'), shirtNumber: 9 } as unknown as Player;
    expect(takenNumbers(career(), [mate]).has(9)).toBe(true);
  });
});

describe('boyhood club', () => {
  it('a homecoming lifts the fans and morale, once', () => {
    const c = career({ identity: { hometown: 'Salford', boyhoodClub: 'Everton' } });
    const r = checkBoyhoodMove(c, player('me'), club('Everton'), 10);
    expect(r.career.identity!.homecoming).toBeTruthy();
    expect(r.career.fanRating!).toBeGreaterThan(50);
    expect(r.moraleDelta).toBeGreaterThan(0);
    // Doesn't fire twice.
    expect(checkBoyhoodMove(r.career, player('me'), club('Everton'), 20).news).toHaveLength(0);
  });

  it('signing for the boyhood club’s great rivals is a betrayal that costs standing', () => {
    const c = career({ identity: { hometown: 'Liverpool', boyhoodClub: 'Everton' } });
    const r = checkBoyhoodMove(c, player('me'), club('Liverpool'), 10); // Everton–Liverpool are rivals
    expect(r.career.identity!.betrayal).toBeTruthy();
    expect(r.career.fanRating!).toBeLessThan(50);
    expect(r.moraleDelta).toBeLessThan(0);
    expect(betrayalPenalty(r.career)).toBeLessThan(0);
  });

  it('an unrelated club triggers neither', () => {
    const c = career({ identity: { hometown: 'x', boyhoodClub: 'Everton' } });
    const r = checkBoyhoodMove(c, player('me'), club('Arsenal'), 10);
    expect(r.news).toHaveLength(0);
    expect(r.moraleDelta).toBe(0);
  });
});

describe('dual nationality', () => {
  it('only courts a dual-national who has become good enough', () => {
    const id = { hometown: 'x', secondNationality: 'irl' };
    // Not yet established → no choice.
    expect(maybeAllegianceChoice(career({ identity: id, status: 'ROTATION' }), player('me', 'ST', { overall: 68 }), 10)).toBeNull();
    // Established and good → the choice arrives.
    const r = maybeAllegianceChoice(career({ identity: id, status: 'STAR' }), player('me', 'ST', { overall: 78 }), 10);
    expect(r).not.toBeNull();
    expect(r!.career.pendingAllegiance!.nations).toContain('irl');
  });

  it('a single-nationality player is never courted twice', () => {
    expect(maybeAllegianceChoice(career({ identity: { hometown: 'x' } }), player('me'), 10)).toBeNull();
  });

  it('committing closes the other door for good', () => {
    const c = career({ identity: { hometown: 'x', secondNationality: 'irl' }, pendingAllegiance: { nations: ['eng', 'irl'], day: 5 } });
    const r = commitAllegiance(c, player('me'), 'irl', 10);
    expect(r.career.identity!.allegiance).toBe('irl');
    expect(r.career.pendingAllegiance).toBeNull();
    expect(r.news[0].title).toMatch(/irl/i);
  });
});

describe('rituals', () => {
  it('a player with no superstitions is never disrupted', () => {
    expect(ritualIntact({ hometown: 'x', rituals: [] }, 'm1', 7)).toBe(true);
  });

  it('is deterministic and disrupts only a minority of matches', () => {
    const id = { hometown: 'x', rituals: ['lucky_boots'] };
    expect(ritualIntact(id, 'm1', 7)).toBe(ritualIntact(id, 'm1', 7));
    let broken = 0;
    for (let i = 0; i < 200; i++) if (!ritualIntact(id, `m${i}`, 7)) broken++;
    expect(broken).toBeGreaterThan(0);
    expect(broken).toBeLessThan(60); // rare, not constant
  });
});

describe('catalogues', () => {
  it('celebrations and rituals are well-formed', () => {
    for (const c of CELEBRATIONS) { expect(c.name.length).toBeGreaterThan(0); expect(c.emoji.length).toBeGreaterThan(0); }
    for (const r of RITUALS) expect(r.name.length).toBeGreaterThan(0);
  });
});
