import { describe, it, expect } from 'vitest';
import { advanceMentor, pickMentorCandidate } from '../playerMentor';
import { resolveConversation } from '../playerConversations';
import type { Player } from '../../types/player';
import type { PlayerCareer } from '../../types/playerCareer';

function player(id: string, over: Partial<Player> & { bornYear?: number; overall?: number }): Player {
  return {
    id, name: { first: id, last: id.toUpperCase() }, position: 'ST', positions: ['ST'],
    overall: over.overall ?? 70, potential: 85, form: 0,
    born: { year: over.bornYear ?? 2004, month: 1, day: 1 },
    contract: { clubId: 'C', expiresYear: 2030, wage: 1000 },
    attributes: {} as Player['attributes'],
    ...over,
  } as unknown as Player;
}

const career = (over: Partial<PlayerCareer> = {}): PlayerCareer => ({
  playerId: 'me', origin: {} as PlayerCareer['origin'], archetype: 'x',
  seasonApps: 6, status: 'ROTATION', recentRatings: [6.8, 7.0, 6.9],
  ...over,
} as unknown as PlayerCareer);

describe('pickMentorCandidate', () => {
  it('picks a fitting senior team-mate (older, better) and none when there is no fit', () => {
    const me = player('me', { overall: 68, bornYear: 2006 });
    const senior = player('vet', { overall: 80, bornYear: 1990 });
    const kid = player('kid', { overall: 60, bornYear: 2006 });
    expect(pickMentorCandidate(me, [me, senior, kid], 2024, 42)?.id).toBe('vet');
    // Nobody senior enough → no mentor.
    expect(pickMentorCandidate(me, [me, kid], 2024, 42)).toBeNull();
  });
});

describe('advanceMentor', () => {
  const me = player('me', { overall: 68, bornYear: 2006 });
  const senior = player('vet', { overall: 80, bornYear: 1990 });
  const squad = [me, senior];

  it('is deterministic — same inputs reproduce exactly', () => {
    const a = advanceMentor(career(), me, squad, 2024, 100, 7);
    const b = advanceMentor(career(), me, squad, 2024, 100, 7);
    expect(a.career.mentor).toEqual(b.career.mentor);
    expect(a.news.map((n) => n.title)).toEqual(b.news.map((n) => n.title));
  });

  it('eventually seeds a mentor across a run of matchdays, then keeps it', () => {
    let c = career();
    let seeded = false;
    for (let day = 100; day < 200 && !seeded; day += 7) {
      const r = advanceMentor(c, me, squad, 2024, day, 7);
      c = r.career;
      if (c.mentor) seeded = true;
    }
    expect(seeded).toBe(true);
    expect(c.mentor?.playerId).toBe('vet');
  });

  it('pays it forward: a veteran, once-mentored avatar gets a one-time full-circle beat', () => {
    const vet = player('me', { overall: 78, bornYear: 1990 }); // 34 in 2024
    const c = career({ status: 'STAR', mentor: { playerId: 'vet', name: 'Old Hand', bond: 80, since: 2010 } });
    const r = advanceMentor(c, vet, [vet, senior], 2024, 150, 7);
    expect(r.career.mentor?.paidForward).toBe(true);
    expect(r.news.some((n) => /circle turns/i.test(n.title))).toBe(true);
    // Fires only once.
    const again = advanceMentor(r.career, vet, [vet, senior], 2024, 157, 7);
    expect(again.news.some((n) => /circle turns/i.test(n.title))).toBe(false);
  });

  it('a mentor who leaves the club gets a send-off and the bond is remembered', () => {
    const c = career({ mentor: { playerId: 'vet', name: 'vet VET', bond: 70, since: 2023 } });
    const r = advanceMentor(c, me, [me], 2024, 300, 7); // 'vet' no longer in squad
    expect(r.career.mentor?.departed).toBe(true);
    expect(r.news.some((n) => /moves on/i.test(n.title))).toBe(true);
  });

  it('corners the avatar for a heart-to-heart on a cold streak (an interactive choice)', () => {
    const cold = career({ mentor: { playerId: 'vet', name: 'vet VET', bond: 60, since: 2023 }, recentRatings: [5.8, 5.9, 5.7] });
    // Scan days for the deterministic beat: it queues a MENTOR_WORD conversation.
    let fired = false;
    for (let day = 100; day < 400; day += 7) {
      const r = advanceMentor(cold, me, squad, 2024, day, 7);
      const conv = (r.career.pendingConversations ?? [])[0];
      if (conv?.trigger === 'MENTOR_WORD') {
        const answered = resolveConversation(r.career, conv, 0, day); // take his advice
        expect(answered.moraleDelta).toBeGreaterThan(0);
        expect((answered.career.confidence ?? 60)).toBeGreaterThan(cold.confidence ?? 60);
        fired = true; break;
      }
    }
    expect(fired).toBe(true);
  });

  it('falls back to an auto morale lift when a conversation is already pending', () => {
    const cold = career({
      mentor: { playerId: 'vet', name: 'vet VET', bond: 60, since: 2023 },
      recentRatings: [5.8, 5.9, 5.7],
      pendingConversations: [{ id: 'busy', trigger: 'X', prompt: '', choices: [] }],
    });
    let fired = false;
    for (let day = 100; day < 400; day += 7) {
      const r = advanceMentor(cold, me, squad, 2024, day, 7);
      if (r.news.some((n) => /word from/i.test(n.title))) { expect(r.moraleDelta).toBeGreaterThan(0); fired = true; break; }
    }
    expect(fired).toBe(true);
  });
});
