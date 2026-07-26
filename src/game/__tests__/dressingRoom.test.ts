import { describe, it, expect } from 'vitest';
import { advanceDressingRoom } from '../dressingRoom';
import { resolveConversation } from '../playerConversations';
import type { Player } from '../../types/player';
import type { PlayerCareer } from '../../types/playerCareer';

function player(id: string, over: Partial<Player> & { bornYear?: number } = {}): Player {
  return {
    id, name: { first: id, last: id.toUpperCase() }, position: 'ST', positions: ['ST'],
    overall: 72, potential: 85, form: 0,
    born: { year: over.bornYear ?? 2004, month: 1, day: 1 },
    contract: { clubId: 'C', expiresYear: 2030, wage: 1000 },
    attributes: {} as Player['attributes'],
    ...over,
  } as unknown as Player;
}

const career = (over: Partial<PlayerCareer> = {}): PlayerCareer => ({
  playerId: 'me', origin: {} as PlayerCareer['origin'], archetype: 'x',
  seasonApps: 8, status: 'ROTATION', managerTrust: 55, recentRatings: [6.8, 6.9, 6.8],
  ...over,
} as unknown as PlayerCareer);

const me = player('me', { bornYear: 2004 });
const buddy = player('buddy', { bornYear: 2004 });
const squad = [me, buddy];

describe('advanceDressingRoom', () => {
  it('is deterministic — same inputs reproduce exactly', () => {
    const a = advanceDressingRoom(career(), me, squad, 2024, 130, 9);
    const b = advanceDressingRoom(career(), me, squad, 2024, 130, 9);
    expect(a.career.dressingRoom).toEqual(b.career.dressingRoom);
    expect(a.news.map((n) => n.title)).toEqual(b.news.map((n) => n.title));
  });

  it('seeds a named ally of similar age across a run of matchdays', () => {
    let seeded = false;
    for (let day = 100; day < 300 && !seeded; day += 7) {
      const r = advanceDressingRoom(career(), me, squad, 2024, day, 9);
      if ((r.career.dressingRoom?.bonds ?? []).some((b) => b.playerId === 'buddy')) seeded = true;
    }
    expect(seeded).toBe(true);
  });

  it('prunes bonds for team-mates who have left the club', () => {
    const c = career({ dressingRoom: { standing: 60, bonds: [{ playerId: 'gone', name: 'Gone', kind: 'ALLY', bond: 60 }] } });
    const r = advanceDressingRoom(c, me, [me], 2024, 200, 9); // 'gone' not in squad
    expect((r.career.dressingRoom?.bonds ?? []).some((b) => b.playerId === 'gone')).toBe(false);
  });

  it('hands a senior player a dressing-room dilemma that trades standing for trust', () => {
    const c = career({ status: 'STAR', dressingRoom: { standing: 60, bonds: [] } });
    let conv;
    for (let day = 100; day < 900; day += 7) {
      const r = advanceDressingRoom(c, me, squad, 2024, day, 9);
      const q = (r.career.pendingConversations ?? [])[0];
      if (q?.trigger === 'DRESSING_ROOM') { conv = { q, career: r.career, day }; break; }
    }
    expect(conv).toBeTruthy();
    // Back the group: standing up, trust down.
    const backed = resolveConversation(conv!.career, conv!.q, 0, conv!.day);
    expect(backed.career.dressingRoom!.standing).toBeGreaterThan(60);
    expect(backed.career.managerTrust!).toBeLessThan(career().managerTrust!);
    // Side with the manager: the reverse.
    const sided = resolveConversation(conv!.career, conv!.q, 2, conv!.day);
    expect(sided.career.dressingRoom!.standing).toBeLessThan(60);
    expect(sided.career.managerTrust!).toBeGreaterThan(career({ status: 'STAR' }).managerTrust!);
  });
});
