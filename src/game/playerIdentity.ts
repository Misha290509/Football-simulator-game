// ---------------------------------------------------------------------------
// Player Career — identity & backstory (§ Who you are). Attributes say what a
// player can do; this says who he is. Where he's from and the club he grew up
// supporting follow him for a whole career — coming home is a homecoming, and
// signing for that club's great rivals is a betrayal the fans never quite
// forgive. Some players are eligible for two countries and must one day pick
// one, closing the other door for good. The shirt on his back is a status
// object, won and lost. And the celebration he's known for and the superstitions
// he swears by are the texture that makes him *him*.
//
// Pure & deterministic: every roll hashes stable ids, never the sim's RNG stream.
// ---------------------------------------------------------------------------

import type { Player } from '../types/player';
import type { Club } from '../types/club';
import type { NewsItem } from '../types/league';
import type { PlayerCareer, CareerIdentity, SquadStatus } from '../types/playerCareer';
import { POSITION_GROUP } from '../types/attributes';
import { hashSeed, clamp } from '../engine/rng';
import { areRivals } from './rivalries';

let _seq = 0;
const feed = (day: number, category: NewsItem['category'], title: string, body: string): NewsItem =>
  ({ id: `news_pc_id_${day}_${_seq++}`, day, category, title, body, read: false });

const nameOf = (p: Player) => `${p.name.first} ${p.name.last}`;
const pick = <T>(arr: T[], key: string): T => arr[hashSeed(key) % arr.length];

// --- Celebrations ------------------------------------------------------------

export interface Celebration { id: string; name: string; emoji: string; blurb: string; persona: 'HUMBLE' | 'SHOWMAN' | 'INTENSE' }

export const CELEBRATIONS: Celebration[] = [
  { id: 'knee_slide', name: 'The knee slide', emoji: '🛝', blurb: 'Corner flag, knees, grass stains. Never gets old.', persona: 'SHOWMAN' },
  { id: 'arms_wide', name: 'Arms wide', emoji: '🕊️', blurb: 'Wheel away, arms out, let the noise hit you.', persona: 'SHOWMAN' },
  { id: 'point_to_sky', name: 'Point to the sky', emoji: '☝️', blurb: 'For someone who isn’t here to see it.', persona: 'HUMBLE' },
  { id: 'shush', name: 'The shush', emoji: '🤫', blurb: 'Finger to the lips. For the away end, obviously.', persona: 'INTENSE' },
  { id: 'badge_kiss', name: 'Kiss the badge', emoji: '💋', blurb: 'Straight to the fans who sing your name.', persona: 'INTENSE' },
  { id: 'no_celebration', name: 'Refuse to celebrate', emoji: '🙅', blurb: 'Respect to a former club. Class, or cowardice — they’ll argue.', persona: 'HUMBLE' },
  { id: 'calm', name: 'Ice cold', emoji: '🧊', blurb: 'Pick the ball out, jog back. Like you’ve done it before.', persona: 'HUMBLE' },
];
export const celebrationById = (id?: string) => CELEBRATIONS.find((c) => c.id === id);

// --- Rituals & superstitions ---------------------------------------------------

export interface Ritual { id: string; name: string; blurb: string }
export const RITUALS: Ritual[] = [
  { id: 'lucky_boots', name: 'Lucky boots', blurb: 'The same pair, re-studded a hundred times.' },
  { id: 'right_foot_first', name: 'Right foot onto the pitch first', blurb: 'Every single time. Don’t ask.' },
  { id: 'same_meal', name: 'The same pre-match meal', blurb: 'Chicken and rice at exactly the same hour.' },
  { id: 'last_out', name: 'Last one out of the tunnel', blurb: 'You need those extra three seconds.' },
  { id: 'music', name: 'The same song in the headphones', blurb: 'Track one, every warm-up, since you were fifteen.' },
];
export const MAX_RITUALS = 2;

/**
 * Did his routine survive the build-up? Rare and deterministic (hashed on the
 * fixture): a delayed coach, a lost boot bag, a late kit change. When it breaks
 * he starts the match a touch off — the cost of being superstitious.
 */
export function ritualIntact(identity: CareerIdentity | undefined, matchId: string, seed: number): boolean {
  const rituals = identity?.rituals ?? [];
  if (rituals.length === 0) return true;
  return (hashSeed(`ritual_${seed}_${matchId}`) % 100) >= 12; // ~12% of matches disrupt it
}

const RITUAL_BREAK_LINES = [
  'The coach was stuck in traffic — no time for the usual routine.',
  'Someone else had your peg. Small thing. Feels big.',
  'The boot bag went missing until twenty minutes before kickoff.',
  'A late kit change threw the whole build-up out.',
];
export function ritualBreakLine(matchId: string): string { return pick(RITUAL_BREAK_LINES, matchId); }

// --- Shirt numbers -------------------------------------------------------------

const MARQUEE: Record<string, number[]> = { GK: [1], DEF: [4, 5, 6], MID: [8, 10], ATT: [9, 10, 7] };
const SQUAD_POOL: Record<string, number[]> = {
  GK: [13, 21, 25, 31], DEF: [2, 3, 12, 15, 16, 18, 22], MID: [14, 17, 20, 23, 24, 26], ATT: [11, 19, 27, 28, 29, 30],
};
export const isMarqueeNumber = (n: number) => n === 1 || n === 7 || n === 9 || n === 10;

/** The numbers already worn at the club (so we never double-assign). */
export function takenNumbers(career: PlayerCareer, squad: Player[]): Set<number> {
  const taken = new Set<number>();
  for (const p of squad) {
    if (p.id === career.playerId) continue;
    const n = (p as unknown as { shirtNumber?: number }).shirtNumber;
    if (typeof n === 'number') taken.add(n);
  }
  return taken;
}

/**
 * Assign a shirt number appropriate to his standing. A youngster gets a high
 * squad number; a Key/Star player is entitled to a marquee one. Deterministic.
 */
export function assignShirtNumber(
  avatar: Player, status: SquadStatus, taken: Set<number>,
): number {
  const grp = POSITION_GROUP[avatar.position];
  const senior = status === 'KEY' || status === 'STAR' || status === 'CAPTAIN';
  const prefer = senior ? [...(MARQUEE[grp] ?? []), ...(SQUAD_POOL[grp] ?? [])] : [...(SQUAD_POOL[grp] ?? []), ...(MARQUEE[grp] ?? [])];
  for (const n of prefer) if (!taken.has(n)) return n;
  for (let n = 2; n <= 45; n++) if (!taken.has(n)) return n;
  return 45;
}

/** Can he ask for this number right now? Marquee shirts must be earned. */
export function canRequestNumber(status: SquadStatus, n: number, taken: Set<number>): { ok: boolean; why: string } {
  if (n < 1 || n > 45) return { ok: false, why: 'Pick a number between 1 and 45.' };
  if (taken.has(n)) return { ok: false, why: 'A teammate already wears that number.' };
  const senior = status === 'KEY' || status === 'STAR' || status === 'CAPTAIN';
  if (isMarqueeNumber(n) && !senior) return { ok: false, why: 'That shirt has to be earned — establish yourself in the side first.' };
  return { ok: true, why: '' };
}

const LEGEND_WEIGHT = [
  'A club great wore it for a decade. Every touch will be measured against him.',
  'The last man in that shirt has a stand named after him. No pressure.',
  'They retired the songs, not the number. You’ll hear his name until you make it yours.',
];

/** He takes a marquee number — with the weight of expectation attached. */
export function inheritNumberNews(avatar: Player, n: number, from: string | null, day: number): NewsItem {
  return feed(day, 'MILESTONE', `The number ${n}`,
    from ? `${nameOf(avatar)} takes the ${n} shirt from ${from}. ${pick(LEGEND_WEIGHT, `${n}${from}`)}`
      : `${nameOf(avatar)} will wear the number ${n} this season — a shirt with a weight of its own.`);
}

/** He's slipped down the pecking order and loses the marquee shirt. */
export function strippedNumberNews(avatar: Player, from: number, to: number, day: number): NewsItem {
  return feed(day, 'GENERAL', `Handed the ${to} shirt`,
    `${nameOf(avatar)} loses the number ${from} — the club have given it to someone the manager trusts more. Nothing stings quite like a squad-number email.`);
}

/**
 * Keep the shirt in step with his standing: hand him a marquee number when he
 * establishes himself, take it back when he slips to the fringes.
 */
export function updateShirt(
  career: PlayerCareer, avatar: Player, squad: Player[], day: number, seed: number,
): { career: PlayerCareer; news: NewsItem[] } {
  const news: NewsItem[] = [];
  const taken = takenNumbers(career, squad);
  const cur = career.shirt ?? null;
  const senior = career.status === 'KEY' || career.status === 'STAR' || career.status === 'CAPTAIN';

  if (!cur) {
    const n = assignShirtNumber(avatar, career.status, taken);
    return { career: { ...career, shirt: { number: n, marquee: isMarqueeNumber(n) } }, news };
  }
  // Earned a marquee shirt.
  if (senior && !cur.marquee) {
    const grp = POSITION_GROUP[avatar.position];
    const want = (MARQUEE[grp] ?? []).find((n) => !taken.has(n));
    if (want != null && (hashSeed(`shirtup_${seed}_${day}`) % 100) < 55) {
      news.push(inheritNumberNews(avatar, want, null, day));
      return { career: { ...career, shirt: { number: want, marquee: true } }, news };
    }
  }
  // Slipped down — the marquee shirt goes to someone else.
  if (!senior && cur.marquee && (career.status === 'ROTATION' || career.status === 'PROSPECT' || career.status === 'YOUTH')) {
    const grp = POSITION_GROUP[avatar.position];
    const fallback = (SQUAD_POOL[grp] ?? [22]).find((n) => !taken.has(n)) ?? 22;
    news.push(strippedNumberNews(avatar, cur.number, fallback, day));
    return { career: { ...career, shirt: { number: fallback, marquee: false } }, news };
  }
  return { career, news };
}

// --- Boyhood club: homecoming & betrayal ----------------------------------------

/**
 * React to the club he now plays for. Joining the club he grew up supporting is
 * a homecoming the fans adore; joining their great rivals is a betrayal that
 * costs him standing with those supporters permanently. Fires once per club.
 */
export function checkBoyhoodMove(
  career: PlayerCareer, avatar: Player, club: Club | undefined, day: number,
): { career: PlayerCareer; news: NewsItem[]; moraleDelta: number } {
  const id = career.identity;
  const news: NewsItem[] = [];
  if (!id?.boyhoodClub || !club) return { career, news, moraleDelta: 0 };

  // Homecoming.
  if (club.name === id.boyhoodClub && !id.homecoming) {
    news.push(feed(day, 'MILESTONE', 'Home at last',
      `${nameOf(avatar)} pulls on the shirt he wore as a kid in the stands. ${club.name} have signed one of their own — and he'll run through walls for them.`));
    return {
      career: { ...career, identity: { ...id, homecoming: { clubName: club.name, day } }, fanRating: clamp((career.fanRating ?? 50) + 12, 0, 100) as number },
      news, moraleDelta: 10,
    };
  }
  // Betrayal — signing for the boyhood club's great rivals.
  if (club.name !== id.boyhoodClub && areRivals(club.name, id.boyhoodClub) && !id.betrayal) {
    news.push(feed(day, 'GENERAL', 'Judas',
      `${nameOf(avatar)} — a ${id.boyhoodClub} boy — has signed for ${club.name}. The club he grew up loving will never look at him the same way, and they'll let him know it every time he goes back.`));
    return {
      career: { ...career, identity: { ...id, betrayal: { clubName: club.name, day } }, fanRating: clamp((career.fanRating ?? 50) - 10, 0, 100) as number },
      news, moraleDelta: -6,
    };
  }
  return { career, news, moraleDelta: 0 };
}

/** A betrayal never fully heals: a permanent edge of hostility on the road. */
export function betrayalPenalty(career: PlayerCareer): number {
  return career.identity?.betrayal ? -4 : 0;
}

// --- Dual nationality: the choice that closes a door ----------------------------

/**
 * Some players are eligible for two countries. Once he's good enough that both
 * come calling, he must commit — and the other door shuts for good. Only a
 * minority of careers carry this (set at creation), and the courting only starts
 * once he's genuinely wanted.
 */
export function maybeAllegianceChoice(career: PlayerCareer, avatar: Player, day: number): { career: PlayerCareer; news: NewsItem[] } | null {
  const id = career.identity;
  if (!id?.secondNationality || id.allegiance) return null;
  if (career.international?.capped) return null; // already tied to one
  const good = avatar.overall >= 72 && (career.status === 'KEY' || career.status === 'STAR' || career.status === 'CAPTAIN');
  if (!good || career.pendingAllegiance) return null;
  return {
    career: { ...career, pendingAllegiance: { nations: [avatar.nationality, id.secondNationality], day } },
    news: [feed(day, 'MILESTONE', 'Two countries come calling',
      `Both ${avatar.nationality} and ${id.secondNationality} want ${nameOf(avatar)} to commit to them. Once he plays a competitive senior match for one, the other door closes forever. (Choose in your inbox.)`)],
  };
}

/** Commit to a nation for good. */
export function commitAllegiance(career: PlayerCareer, avatar: Player, nation: string, day: number): { career: PlayerCareer; news: NewsItem[] } {
  const id = career.identity ?? { hometown: '' };
  const other = [avatar.nationality, id.secondNationality].find((n) => n && n !== nation);
  return {
    career: { ...career, identity: { ...id, allegiance: nation }, pendingAllegiance: null },
    news: [feed(day, 'MILESTONE', `Committed to ${nation}`,
      `${nameOf(avatar)} has chosen ${nation}${other ? ` over ${other}` : ''}. There's no going back now — one anthem, for the rest of his career.`)],
  };
}
