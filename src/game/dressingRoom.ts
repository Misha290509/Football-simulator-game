// ---------------------------------------------------------------------------
// Player Career — the dressing room (story / relationships). Beyond the single
// mentor and rival, a career is lived among a group. This tracks the avatar's
// standing in that group and a few named bonds (allies he clicks with, the odd
// pocket of tension), fires the beats that make it feel alive — the lads taking
// to him, the captain backing him, senior pros questioning his attitude — and
// occasionally hands him a real bit of dressing-room politics to navigate.
//
// Pure & deterministic: candidate choice and beat selection hash stable ids and
// never draw from the sim's RNG stream. Mirrors playerMentor.ts.
// ---------------------------------------------------------------------------

import type { Player } from '../types/player';
import type { NewsItem } from '../types/league';
import type { PlayerCareer, DressingRoomState, DressingRoomBond, Conversation } from '../types/playerCareer';
import { clamp, hashSeed } from '../engine/rng';
import { dressingRoomDilemma } from './playerConversations';

let _seq = 0;
const feed = (day: number, category: NewsItem['category'], title: string, body: string): NewsItem =>
  ({ id: `news_pc_dr_${day}_${_seq++}`, day, category, title, body, read: false });

const nameOf = (p: Player): string => `${p.name.first} ${p.name.last}`;
const lastOf = (n: string): string => n.split(' ').slice(-1)[0];
const pick = <T>(arr: T[], key: string): T => arr[hashSeed(key) % arr.length];

const ALLY_LINES = [
  'thick as thieves at the training ground now',
  'always paired up in the rondos, and it shows',
  'the two of you have hit it off — a proper ally in there',
];
const CAPTAIN_LINES = [
  'The skipper singled you out in front of the group. That means something.',
  '“This lad’s the future of this club,” the captain told the room. You stood a little taller.',
  'The armband’s owner has taken you under his wing publicly. The rest fall in line.',
];
const TENSION_LINES = [
  'A couple of the senior pros have muttered about your attitude. Best answer it on the grass.',
  'Not everyone in there is a fan yet. Win them over the only way that lasts — performances.',
];

const STAR_STATUSES = new Set(['KEY', 'STAR', 'CAPTAIN']);

export interface DressingRoomResult { career: PlayerCareer; news: NewsItem[]; moraleDelta: number }

/**
 * Advance the dressing-room relationship for one matchday batch. Drifts standing
 * with status + form, seeds the odd named ally, prunes bonds for players who've
 * left, and fires at most one beat (ally struck up, captain backing, tension, a
 * standing milestone, or an interactive politics dilemma). Deterministic.
 */
export function advanceDressingRoom(
  career: PlayerCareer,
  avatar: Player,
  squad: Player[],
  year: number,
  day: number,
  seed: number,
): DressingRoomResult {
  const news: NewsItem[] = [];
  let moraleDelta = 0;
  const roll = hashSeed(`dr:${seed}:${day}`) % 100;
  const rr = career.recentRatings ?? [];
  const avg = rr.length ? rr.reduce((a, b) => a + b, 0) / rr.length : 6.7;
  const senior = STAR_STATUSES.has(career.status);

  const prev: DressingRoomState = career.dressingRoom ?? { standing: 50, bonds: [] };

  // Prune bonds for team-mates who have left the club (quietly).
  let bonds: DressingRoomBond[] = prev.bonds.filter((b) => squad.some((p) => p.id === b.playerId && p.contract.clubId === avatar.contract.clubId));

  // Drift standing with recent form + seniority (bounded, gentle).
  let standing = clamp(
    prev.standing + (avg >= 7.2 ? 2 : avg >= 6.6 ? 0 : -1) + (senior ? 1 : 0),
    0, 100,
  );

  let pendingConv: Conversation | null = null;

  // --- Seed a named ally over time -------------------------------------------
  if (bonds.length < 2 && roll < 28) {
    const age = year - avatar.born.year;
    const cand = squad
      .filter((p) => p.id !== avatar.id
        && p.id !== career.rival?.playerId
        && p.id !== career.mentor?.playerId
        && !bonds.some((b) => b.playerId === p.id)
        && Math.abs((year - p.born.year) - age) <= 3)
      .sort((a, b) => (hashSeed(`${seed}:${a.id}`) % 100) - (hashSeed(`${seed}:${b.id}`) % 100))[0];
    if (cand) {
      bonds = [...bonds, { playerId: cand.id, name: nameOf(cand), kind: 'ALLY', bond: 58 }];
      news.push(feed(day, 'GENERAL', `A friend in the squad`, `You and ${nameOf(cand)} are ${pick(ALLY_LINES, cand.id)}.`));
      moraleDelta += 1;
      return { career: { ...career, dressingRoom: { standing, bonds } }, news, moraleDelta };
    }
  }

  // --- At most one beat per advance ------------------------------------------
  if (senior && avg >= 7.2 && roll >= 30 && roll < 45) {
    // The captain backs him publicly.
    standing = clamp(standing + 4, 0, 100);
    news.push(feed(day, 'GENERAL', 'The captain backs you', pick(CAPTAIN_LINES, `${seed}:${day}`)));
    moraleDelta += 2;
  } else if (!senior && rr.length >= 3 && avg <= 6.0 && roll >= 45 && roll < 60) {
    // Senior pros question a struggling newcomer.
    standing = clamp(standing - 3, 0, 100);
    news.push(feed(day, 'GENERAL', 'Winning the room', pick(TENSION_LINES, `${seed}:${day}`)));
    moraleDelta -= 1;
  } else if (prev.standing < 78 && standing >= 78 && roll >= 60) {
    // A standing milestone — one of the group's leaders now.
    news.push(feed(day, 'GENERAL', 'One of the leaders now', `The dressing room looks to you these days — a voice that carries. Standing like this is earned, not given.`));
    moraleDelta += 1;
  } else if (senior && standing >= 55 && roll >= 82 && (career.pendingConversations ?? []).length === 0) {
    // Dressing-room politics: the lads want you to carry their message.
    const inst = bonds[0]?.name ?? nameOf(squad.find((p) => p.id !== avatar.id && year - p.born.year >= 30) ?? avatar);
    pendingConv = dressingRoomDilemma(lastOf(inst), day);
  }

  const dressingRoom: DressingRoomState = { standing, bonds };
  const nextCareer: PlayerCareer = {
    ...career,
    dressingRoom,
    ...(pendingConv ? { pendingConversations: [...(career.pendingConversations ?? []), pendingConv] } : {}),
  };
  return { career: nextCareer, news, moraleDelta };
}
