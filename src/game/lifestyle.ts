// ---------------------------------------------------------------------------
// Player Career — the good life (§ Off-pitch). Wages pile up; this is what makes
// them mean something. The avatar spends his bank balance on status symbols,
// homes, giving and toys — each with a real effect on his following, his public
// image and his morale. A supercar goes viral (and courts controversy); a
// charity foundation wins the public back; a mansion is simply the reward for
// making it. Pure & deterministic — the store just applies the result.
// ---------------------------------------------------------------------------

import type { Player } from '../types/player';
import type { NewsItem } from '../types/league';
import type { PlayerCareer } from '../types/playerCareer';
import { clamp } from '../engine/rng';

export type LifestyleCategory = 'CAR' | 'HOME' | 'STYLE' | 'GIVING' | 'TOYS';

export interface LifestyleItem {
  id: string;
  name: string;
  emoji: string;
  category: LifestyleCategory;
  price: number;
  blurb: string;
  /** One-off effects applied on purchase. Following is persistent brand reach. */
  effects: { following?: number; fanRating?: number; controversy?: number; morale?: number };
}

/** The catalogue, cheapest first within sensible tiers. Prices in currency units
 *  (same scale as wages/fees), reachable over a season or two of earnings. */
export const LIFESTYLE_ITEMS: LifestyleItem[] = [
  { id: 'watch', name: 'Luxury watch', emoji: '⌚', category: 'STYLE', price: 120_000, blurb: 'A statement on the wrist.', effects: { following: 15_000, controversy: 1, morale: 2 } },
  { id: 'sportscar', name: 'Sports car', emoji: '🚗', category: 'CAR', price: 250_000, blurb: 'The first thing every young pro buys.', effects: { following: 30_000, controversy: 3, morale: 3 } },
  { id: 'wardrobe', name: 'Designer wardrobe', emoji: '🕶️', category: 'STYLE', price: 300_000, blurb: 'Tunnel fits that trend before kickoff.', effects: { following: 28_000, controversy: 2, morale: 2 } },
  { id: 'penthouse', name: 'City penthouse', emoji: '🏙️', category: 'HOME', price: 3_000_000, blurb: 'Floor-to-ceiling glass over the skyline.', effects: { following: 20_000, morale: 6 } },
  { id: 'boyhood', name: 'Give back to your boyhood club', emoji: '⚽', category: 'GIVING', price: 1_000_000, blurb: 'Refit the academy that made you.', effects: { fanRating: 6, morale: 5, controversy: -3 } },
  { id: 'foundation', name: 'Launch a charity foundation', emoji: '❤️', category: 'GIVING', price: 1_500_000, blurb: 'Put your name to something that lasts.', effects: { fanRating: 9, controversy: -12, following: 30_000, morale: 4 } },
  { id: 'supercar', name: 'Supercar', emoji: '🏎️', category: 'CAR', price: 2_000_000, blurb: 'Zero to sixty in the time it takes to nutmeg a full-back.', effects: { following: 120_000, controversy: 6, morale: 5 } },
  { id: 'esports', name: 'Buy an esports team', emoji: '🎮', category: 'TOYS', price: 2_500_000, blurb: 'A second brand, a new audience.', effects: { following: 60_000, morale: 3 } },
  { id: 'mansion', name: 'Country mansion', emoji: '🏰', category: 'HOME', price: 9_000_000, blurb: 'Gates, grounds, and a five-a-side pitch out back.', effects: { following: 40_000, fanRating: 1, morale: 8 } },
  { id: 'yacht', name: 'Superyacht', emoji: '🛥️', category: 'TOYS', price: 15_000_000, blurb: 'Summer breaks the whole feed will talk about.', effects: { following: 200_000, controversy: 8, morale: 6 } },
];

export const itemById = (id: string): LifestyleItem | undefined => LIFESTYLE_ITEMS.find((i) => i.id === id);

export interface BuyResult { ok: boolean; career: PlayerCareer; moraleDelta: number; news: NewsItem[]; message: string }

/** Buy a lifestyle item: deduct the balance, mark it owned, apply its effects to
 *  following / fan rating / controversy, and return the morale lift for the
 *  player. Owned items can't be bought twice. */
export function buyLifestyleItem(career: PlayerCareer, avatar: Player, itemId: string, day: number): BuyResult {
  const item = itemById(itemId);
  if (!item) return { ok: false, career, moraleDelta: 0, news: [], message: 'No such item.' };
  const owned = career.possessions ?? [];
  if (owned.includes(item.id)) return { ok: false, career, moraleDelta: 0, news: [], message: 'You already own that.' };
  const balance = career.bankBalance ?? 0;
  if (balance < item.price) return { ok: false, career, moraleDelta: 0, news: [], message: 'Your bank balance won’t cover that yet.' };

  const e = item.effects;
  const image = career.publicImage ?? { persona: 'Unknown', controversy: 0 };
  const next: PlayerCareer = {
    ...career,
    bankBalance: balance - item.price,
    possessions: [...owned, item.id],
    following: Math.max(0, (career.following ?? 0) + (e.following ?? 0)),
    fanRating: clamp((career.fanRating ?? 50) + (e.fanRating ?? 0), 0, 100) as number,
    publicImage: { ...image, controversy: clamp(image.controversy + (e.controversy ?? 0), 0, 100) as number },
  };
  const name = `${avatar.name.first} ${avatar.name.last}`;
  const news: NewsItem[] = [{
    id: `news_pc_buy_${item.id}_${day}`, day, category: item.category === 'GIVING' ? 'GENERAL' : 'GENERAL',
    title: `${item.emoji} ${item.category === 'GIVING' ? 'A classy gesture' : 'Living the dream'}`,
    body: item.category === 'GIVING'
      ? `${name} has ${item.name.toLowerCase()} — the kind of thing that stays with a community long after the football.`
      : `${name} treated himself: ${item.name.toLowerCase()}. The feed lit up.`,
    read: false,
  }];
  return { ok: true, career: next, moraleDelta: e.morale ?? 0, news, message: `Bought ${item.name}.` };
}
