// ---------------------------------------------------------------------------
// Player Career — media & fame (§ The noise). Being watched is its own career:
//
//   • A pundit nemesis — one ex-pro who makes a living picking him apart every
//     week. He can bite back (viral, divisive) or let it go (quietly classy),
//     and one day shut him up with a performance.
//   • Social media — posting is a real choice with real consequences. Humble,
//     hyped, funny, or a late-night post he'll regret. Followers compound into
//     bigger brand deals; a bad post resurfaces years later.
//   • Long-form projects — a documentary, an autobiography, a podcast. They pay
//     well and lock in a public image, for better or worse.
//   • The fans — the moment they invent a chant for him is a genuine milestone.
//
// Pure & deterministic: hashes stable ids, never the sim's RNG stream.
// ---------------------------------------------------------------------------

import type { Player } from '../types/player';
import type { NewsItem } from '../types/league';
import type { PlayerCareer, Conversation } from '../types/playerCareer';
import { hashSeed, clamp } from '../engine/rng';

let _seq = 0;
const feed = (day: number, category: NewsItem['category'], title: string, body: string): NewsItem =>
  ({ id: `news_pc_media_${day}_${_seq++}`, day, category, title, body, read: false });
const nameOf = (p: Player) => `${p.name.first} ${p.name.last}`;
const pick = <T>(arr: T[], key: string): T => arr[hashSeed(key) % arr.length];

// --- The pundit nemesis --------------------------------------------------------

export interface PunditState { name: string; jabs: number; silenced: boolean; feudLevel: number }

const PUNDIT_NAMES = ['Graeme Sutton', 'Roy Kearns', 'Alan Sherwood', 'Jamie Redgrave', 'Ian Wrightson'];
const JABS = [
  '“He goes missing in the big games. Always has.”',
  '“Lovely player on a Tuesday in the sunshine. I want to see it in November.”',
  '“All the ability in the world and none of the appetite. It’s a waste.”',
  '“I wouldn’t have him in my team. I’ll say it again next week too.”',
];

/** Assign a pundit who has decided this player is his subject. */
export function assignPundit(avatar: Player, seed: number): PunditState {
  return { name: pick(PUNDIT_NAMES, `pundit_${seed}_${avatar.id}`), jabs: 0, silenced: false, feudLevel: 0 };
}

/**
 * The pundit takes his weekly swing. Fires on a poor run once the avatar is
 * prominent enough to be worth criticising, and hands the human a choice.
 */
export function punditJab(
  career: PlayerCareer, avatar: Player, avgRating: number, day: number, seed: number,
): { career: PlayerCareer; news: NewsItem[]; conversation: Conversation | null } {
  const prominent = ['KEY', 'STAR', 'CAPTAIN'].includes(career.status);
  if (!prominent) return { career, news: [], conversation: null };
  const pundit = career.pundit ?? assignPundit(avatar, seed);
  const roll = hashSeed(`jab_${seed}_${day}`) % 100;

  // A good run shuts him up (temporarily, and satisfyingly).
  if (avgRating >= 7.4 && pundit.jabs > 0 && !pundit.silenced) {
    return {
      career: { ...career, pundit: { ...pundit, silenced: true, jabs: 0 } },
      news: [feed(day, 'GENERAL', `${pundit.name} has gone quiet`,
        `Three months of criticism, and tonight ${pundit.name} had nothing to say about ${nameOf(avatar)} at all. Some answers you give with your feet.`)],
      conversation: null,
    };
  }
  if (avgRating > 6.3 || roll >= 30) return { career: { ...career, pundit }, news: [], conversation: null };

  const next = { ...pundit, jabs: pundit.jabs + 1, silenced: false };
  const news = [feed(day, 'GENERAL', `${pundit.name} is at it again`,
    `On the panel tonight: ${pick(JABS, `${seed}_${day}`)} That's ${next.jabs} week${next.jabs === 1 ? '' : 's'} running he's made ${nameOf(avatar)} his subject.`)];

  const conversation: Conversation = {
    id: `conv_pundit_${day}`,
    trigger: 'PUNDIT',
    prompt: `${pundit.name} has taken another swing at you on national television. A reporter asks if you've seen it.`,
    choices: [
      { text: `Bite back — “He never did much himself, did he?”`, following: 25_000, fanRating: -2, morale: 2, confidence: -2 },
      { text: 'Rise above it — “He’s entitled to his opinion.”', fanRating: 3, trust: 2, morale: 0 },
      { text: 'Use it — pin the quote above your peg.', confidence: 6, morale: 3 },
    ],
  };
  return { career: { ...career, pundit: next }, news, conversation };
}

// --- Social media ---------------------------------------------------------------

export type PostTone = 'HUMBLE' | 'HYPE' | 'FUNNY' | 'CALLOUT' | 'LATE_NIGHT';

export interface PostOption {
  tone: PostTone; label: string; blurb: string;
  following: number; fanRating: number; controversy: number; morale: number;
  /** A viral multiplier applies on the good ones when he's already big. */
  viral?: boolean;
}

export const POST_OPTIONS: PostOption[] = [
  { tone: 'HUMBLE', label: 'Credit the team', blurb: 'Three points, that’s all that matters. 🙏', following: 4_000, fanRating: 3, controversy: 0, morale: 1 },
  { tone: 'HYPE', label: 'Let them know', blurb: 'Told you. 🔥', following: 18_000, fanRating: 1, controversy: 4, morale: 2, viral: true },
  { tone: 'FUNNY', label: 'Post something daft', blurb: 'A meme of your own miss. The internet loves it.', following: 26_000, fanRating: 4, controversy: 1, morale: 2, viral: true },
  { tone: 'CALLOUT', label: 'Call someone out', blurb: 'Name no names, but everyone knows.', following: 40_000, fanRating: -4, controversy: 16, morale: 1, viral: true },
  { tone: 'LATE_NIGHT', label: 'Post at 3am', blurb: 'You will regret this in the morning.', following: 30_000, fanRating: -7, controversy: 22, morale: -1, viral: true },
];

/** Post to your channels. Reach scales with the following you've already built. */
export function makePost(
  career: PlayerCareer, avatar: Player, tone: PostTone, day: number,
): { career: PlayerCareer; news: NewsItem[]; moraleDelta: number } {
  const opt = POST_OPTIONS.find((o) => o.tone === tone) ?? POST_OPTIONS[0];
  const base = career.following ?? 0;
  // The bigger you already are, the further everything travels.
  const reachMult = 1 + clamp(base / 1_000_000, 0, 2);
  const gained = Math.round(opt.following * reachMult);
  const image = career.publicImage ?? { persona: 'Unknown', controversy: 0 };
  const wentViral = !!opt.viral && base > 150_000 && (hashSeed(`viral_${day}`) % 100) < 35;

  const news: NewsItem[] = [feed(day, 'GENERAL',
    wentViral ? '📱 That post went everywhere' : '📱 You posted',
    wentViral
      ? `${nameOf(avatar)}'s post has been shared hundreds of thousands of times overnight. ${opt.tone === 'LATE_NIGHT' || opt.tone === 'CALLOUT' ? 'Not all of the attention is the good kind.' : 'The reach is enormous.'}`
      : `"${opt.blurb}" — ${(gained).toLocaleString()} new followers.`)];

  return {
    career: {
      ...career,
      following: Math.max(0, base + (wentViral ? gained * 3 : gained)),
      fanRating: clamp((career.fanRating ?? 50) + opt.fanRating, 0, 100) as number,
      publicImage: { ...image, controversy: clamp(image.controversy + opt.controversy, 0, 100) as number },
      posts: [...(career.posts ?? []), { tone, day }].slice(-40),
    },
    news, moraleDelta: opt.morale,
  };
}

/** An old post resurfaces — the internet never forgets. */
export function maybeOldPostResurfaces(career: PlayerCareer, avatar: Player, day: number, seed: number): { career: PlayerCareer; news: NewsItem[]; moraleDelta: number } {
  const risky = (career.posts ?? []).filter((p) => (p.tone === 'LATE_NIGHT' || p.tone === 'CALLOUT') && day - p.day > 300);
  if (risky.length === 0) return { career, news: [], moraleDelta: 0 };
  if ((hashSeed(`resurface_${seed}_${day}`) % 100) >= 6) return { career, news: [], moraleDelta: 0 };
  const image = career.publicImage ?? { persona: 'Unknown', controversy: 0 };
  return {
    career: {
      ...career,
      fanRating: clamp((career.fanRating ?? 50) - 5, 0, 100) as number,
      publicImage: { ...image, controversy: clamp(image.controversy + 10, 0, 100) as number },
    },
    news: [feed(day, 'GENERAL', 'An old post has resurfaced',
      `Something ${nameOf(avatar)} posted years ago is doing the rounds again, stripped of all its context. The club have asked him not to comment.`)],
    moraleDelta: -4,
  };
}

// --- Long-form media projects -----------------------------------------------------

export interface MediaProject { id: string; label: string; blurb: string; fee: number; following: number; fanRating: number; controversy: number; minFollowing: number }

export const MEDIA_PROJECTS: MediaProject[] = [
  { id: 'podcast', label: 'Start a podcast', blurb: 'Your voice, unfiltered, every week.', fee: 400_000, following: 80_000, fanRating: 2, controversy: 3, minFollowing: 100_000 },
  { id: 'documentary', label: 'A documentary crew', blurb: 'They follow you for a season. All of it.', fee: 2_000_000, following: 250_000, fanRating: 5, controversy: 5, minFollowing: 400_000 },
  { id: 'autobiography', label: 'Write your autobiography', blurb: 'Settle a few scores in print.', fee: 1_200_000, following: 120_000, fanRating: 3, controversy: 12, minFollowing: 250_000 },
  { id: 'cover', label: 'Video-game cover athlete', blurb: 'Your face on ten million boxes.', fee: 3_000_000, following: 400_000, fanRating: 6, controversy: 0, minFollowing: 800_000 },
];

export function availableProjects(career: PlayerCareer): MediaProject[] {
  const f = career.following ?? 0;
  const done = new Set(career.mediaProjects ?? []);
  return MEDIA_PROJECTS.filter((p) => f >= p.minFollowing && !done.has(p.id));
}

export function takeProject(career: PlayerCareer, avatar: Player, id: string, day: number): { ok: boolean; career: PlayerCareer; news: NewsItem[]; message: string } {
  const proj = MEDIA_PROJECTS.find((p) => p.id === id);
  if (!proj) return { ok: false, career, news: [], message: 'No such project.' };
  if ((career.following ?? 0) < proj.minFollowing) return { ok: false, career, news: [], message: 'You’re not big enough for that yet.' };
  if ((career.mediaProjects ?? []).includes(id)) return { ok: false, career, news: [], message: 'You’ve already done that.' };
  const image = career.publicImage ?? { persona: 'Unknown', controversy: 0 };
  return {
    ok: true,
    career: {
      ...career,
      mediaProjects: [...(career.mediaProjects ?? []), id],
      bankBalance: (career.bankBalance ?? 0) + proj.fee,
      careerEarnings: (career.careerEarnings ?? 0) + proj.fee,
      following: Math.max(0, (career.following ?? 0) + proj.following),
      fanRating: clamp((career.fanRating ?? 50) + proj.fanRating, 0, 100) as number,
      publicImage: { ...image, controversy: clamp(image.controversy + proj.controversy, 0, 100) as number },
    },
    news: [feed(day, 'GENERAL', `📺 ${proj.label}`,
      `${nameOf(avatar)} has signed up: ${proj.blurb} It pays handsomely — and it fixes how the public see him for years.`)],
    message: `${proj.label} — done.`,
  };
}

// --- The fans ---------------------------------------------------------------------

/** The moment the terraces invent a song for him — a genuine milestone. */
export function maybeChant(career: PlayerCareer, avatar: Player, day: number, seed: number): { career: PlayerCareer; news: NewsItem[]; moraleDelta: number } {
  if (career.hasChant) return { career, news: [], moraleDelta: 0 };
  const beloved = (career.fanRating ?? 50) >= 74 && ['KEY', 'STAR', 'CAPTAIN'].includes(career.status);
  if (!beloved || (hashSeed(`chant_${seed}_${day}`) % 100) >= 25) return { career, news: [], moraleDelta: 0 };
  return {
    career: { ...career, hasChant: true },
    news: [feed(day, 'MILESTONE', 'They’ve made up a song about you',
      `The away end started it, and by the end of the afternoon the whole ground had it. ${nameOf(avatar)} has his own chant — the surest sign a crowd has taken you as one of their own.`)],
    moraleDelta: 8,
  };
}
