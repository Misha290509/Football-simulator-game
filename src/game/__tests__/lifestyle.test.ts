import { describe, it, expect } from 'vitest';
import { buyLifestyleItem, itemById, LIFESTYLE_ITEMS } from '../lifestyle';
import type { Player } from '../../types/player';
import type { PlayerCareer } from '../../types/playerCareer';

const avatar = { id: 'a', name: { first: 'Alex', last: 'Hunter' }, morale: 60 } as unknown as Player;
const career = (over: Partial<PlayerCareer> = {}): PlayerCareer => ({
  bankBalance: 5_000_000, following: 100_000, fanRating: 50,
  publicImage: { persona: 'Unknown', controversy: 10 }, possessions: [],
  ...over,
} as unknown as PlayerCareer);

describe('buyLifestyleItem', () => {
  it('deducts the price, marks it owned, and applies following/morale effects', () => {
    const r = buyLifestyleItem(career(), avatar, 'supercar', 10);
    const item = itemById('supercar')!;
    expect(r.ok).toBe(true);
    expect(r.career.bankBalance).toBe(5_000_000 - item.price);
    expect(r.career.possessions).toContain('supercar');
    expect(r.career.following!).toBeGreaterThan(100_000);
    expect(r.moraleDelta).toBe(item.effects.morale);
    expect(r.news.length).toBe(1);
  });

  it('a charity foundation lifts fans and cuts controversy', () => {
    const r = buyLifestyleItem(career({ bankBalance: 3_000_000 }), avatar, 'foundation', 10);
    expect(r.ok).toBe(true);
    expect(r.career.fanRating!).toBeGreaterThan(50);
    expect(r.career.publicImage!.controversy).toBeLessThan(10);
  });

  it('refuses when the balance is short', () => {
    const r = buyLifestyleItem(career({ bankBalance: 50_000 }), avatar, 'yacht', 10);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/balance/i);
  });

  it('refuses to buy the same item twice', () => {
    const r = buyLifestyleItem(career({ possessions: ['watch'] }), avatar, 'watch', 10);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/already own/i);
  });

  it('every catalogue item is well-formed', () => {
    for (const it of LIFESTYLE_ITEMS) {
      expect(it.price).toBeGreaterThan(0);
      expect(it.name.length).toBeGreaterThan(0);
      expect(Object.keys(it.effects).length).toBeGreaterThan(0);
    }
  });
});
