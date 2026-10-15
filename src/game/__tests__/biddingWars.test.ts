import { describe, it, expect } from 'vitest';
import {
  pickInterestedClub, generateOffers, rollRivalBid, advanceRival, floorWithRival, outbidMargin,
  MAX_COMPETING_BIDS, type RivalBid,
} from '../transfers';
import { Rng } from '../../engine/rng';
import type { Player } from '../../types/player';
import type { Club } from '../../types/club';
import type { TransferOffer } from '../../types/league';

const player = (over: Partial<Player> & { ovr?: number } = {}): Player => {
  const { ovr, ...rest } = over;
  return {
    id: 'p1', name: { first: 'Sam', last: 'Reid' }, position: 'ST', positions: ['ST'],
    overall: ovr ?? 75, nationality: 'eng', morale: 60, fitness: 100, value: 10_000_000, potential: 78,
    born: { year: 2000, month: 1, day: 1 },
    contract: { clubId: 'MGR', wage: 30_000, expiresYear: 2032 },
    squadRole: 'ROTATION',
    attributes: { technical: {}, mental: {}, physical: {}, goalkeeping: {} },
    hidden: { professionalism: 60, bigGame: 60, consistency: 60, injuryProneness: 40, ambition: 60, versatility: 60 },
    ...rest,
  } as unknown as Player;
};
const club = (id: string, reputation: number, budget = 60_000_000): Club => ({
  id, name: `${id} FC`, shortName: id, reputation, countryId: 'eng',
  finances: { balance: 50_000_000, transferBudget: budget, wageBudget: 1_500_000 },
  playerIds: [],
} as unknown as Club);

// Twenty clubs all at the player's level, so every one of them is a fair fit.
const field = Array.from({ length: 20 }, (_, i) => club(`C${i}`, 73 + (i % 5)));

describe('who comes in for your players', () => {
  it('is not the same club every time', () => {
    const p = player();
    const picked = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      const c = pickInterestedClub(p, field, new Rng(seed), { minBudget: 1, exclude: new Set() });
      if (c) picked.add(c.id);
    }
    // Taking the first club that fitted gave exactly one name here.
    expect(picked.size).toBeGreaterThanOrEqual(15);
  });

  it('only picks clubs that can pay and are around his level', () => {
    const p = player({ ovr: 75 });
    const clubs = [club('POOR', 75, 100_000), club('TINY', 40), club('FIT', 76)];
    for (let seed = 1; seed <= 50; seed++) {
      expect(pickInterestedClub(p, clubs, new Rng(seed), { minBudget: 5_000_000, exclude: new Set() })?.id).toBe('FIT');
    }
  });

  it('never picks an excluded club or his own', () => {
    const p = player();
    const clubs = [club('MGR', 75), club('A', 75), club('B', 75)];
    for (let seed = 1; seed <= 50; seed++) {
      const c = pickInterestedClub(p, clubs, new Rng(seed), { minBudget: 1, exclude: new Set(['A']) });
      expect(c?.id).toBe('B');
    }
  });
});

describe('bidding wars for players you sell', () => {
  const listed = player({ transferListed: true });
  const clubs = Object.fromEntries([club('MGR', 75), ...field].map((c) => [c.id, c]));

  it('a second club can top an existing bid', () => {
    const existing: TransferOffer[] = [{ id: 'o1', type: 'BUY', playerId: 'p1', fromClubId: 'C0', fee: 8_000_000, wage: 30_000, day: 1 }];
    let topping: TransferOffer | undefined;
    for (let seed = 1; seed <= 200 && !topping; seed++) {
      topping = generateOffers('MGR', clubs, { p1: listed }, existing, new Rng(seed), 2, 2026)
        .find((o) => o.type === 'BUY');
    }
    expect(topping).toBeDefined();
    expect(topping!.fromClubId).not.toBe('C0');
    expect(topping!.fee).toBeGreaterThan(8_000_000);
    expect(topping!.topsClubId).toBe('C0');
  });

  it('stops at the cap on competing bids', () => {
    const existing: TransferOffer[] = Array.from({ length: MAX_COMPETING_BIDS }, (_, i) => (
      { id: `o${i}`, type: 'BUY', playerId: 'p1', fromClubId: `C${i}`, fee: 8_000_000 + i, wage: 30_000, day: 1 }
    ));
    for (let seed = 1; seed <= 100; seed++) {
      const fresh = generateOffers('MGR', clubs, { p1: listed }, existing, new Rng(seed), 2, 2026);
      expect(fresh.filter((o) => o.type === 'BUY')).toHaveLength(0);
    }
  });
});

describe('bidding wars for players you buy', () => {
  const target = player({ ovr: 82, contract: { clubId: 'SELL', wage: 50_000, expiresYear: 2032 } as Player['contract'] });
  const clubs = [club('SELL', 80), club('MGR', 78), ...Array.from({ length: 10 }, (_, i) => club(`R${i}`, 80 + (i % 4)))];

  it('sometimes a rival is already in, never the seller or you', () => {
    let rivals = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const r = rollRivalBid(target, 'SELL', 'MGR', 20_000_000, clubs, new Rng(seed));
      if (!r) continue;
      rivals++;
      expect(['SELL', 'MGR']).not.toContain(r.clubId);
      expect(r.bid).toBeGreaterThan(20_000_000);
      expect(r.ceiling).toBeGreaterThanOrEqual(r.bid);
    }
    // A good player draws competition often, but not always.
    expect(rivals).toBeGreaterThan(60);
    expect(rivals).toBeLessThan(200);
  });

  it('you must beat the rival, not just match them', () => {
    const rival: RivalBid = { clubId: 'R0', bid: 25_000_000, ceiling: 30_000_000, rounds: 0 };
    expect(floorWithRival(20_000_000, rival)).toBe(25_000_000 + outbidMargin(25_000_000));
    expect(floorWithRival(20_000_000)).toBe(20_000_000);
    // A rival below the club's own floor changes nothing.
    expect(floorWithRival(30_000_000, rival)).toBe(30_000_000);
  });

  it('a rival you have outbid tops you, or pulls out at their limit', () => {
    const rival: RivalBid = { clubId: 'R0', bid: 25_000_000, ceiling: 30_000_000, rounds: 0 };
    const raised = advanceRival(rival, 26_000_000, new Rng(1));
    expect(raised.kind).toBe('RAISED');
    if (raised.kind === 'RAISED') expect(raised.rival.bid).toBeGreaterThan(26_000_000);
    expect(advanceRival(rival, 31_000_000, new Rng(1)).kind).toBe('WITHDREW');
  });

  it('the longer you haggle behind a rival, the likelier you lose him', () => {
    const lossRate = (rounds: number) => {
      let sold = 0;
      for (let seed = 1; seed <= 2000; seed++) {
        const rival: RivalBid = { clubId: 'R0', bid: 25_000_000, ceiling: 25_000_000, rounds };
        if (advanceRival(rival, 20_000_000, new Rng(seed)).kind === 'SOLD') sold++;
      }
      return sold / 2000;
    };
    expect(lossRate(0)).toBeGreaterThan(0.05);
    expect(lossRate(4)).toBeGreaterThan(lossRate(0) + 0.15);
  });
});
