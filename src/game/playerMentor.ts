// ---------------------------------------------------------------------------
// Player Career — the mentor (story / relationships). Early in a career a senior
// team-mate takes the avatar under his wing: a named person, not a number. The
// bond grows through shared success, he has a quiet word on the hard days (a
// morale lift), backs the avatar publicly on the good ones, and gets a send-off
// when he finally moves on — the bond remembered for the legacy.
//
// Pure & deterministic: candidate choice and beat/quote selection hash stable
// ids (day, playerId) and never draw from the sim's RNG stream. Mirrors the
// storylines.ts pattern so it composes with the rest of the narrative layer.
// ---------------------------------------------------------------------------

import type { Player } from '../types/player';
import type { NewsItem } from '../types/league';
import type { PlayerCareer, CareerMentor } from '../types/playerCareer';
import { clamp, hashSeed } from '../engine/rng';

let _seq = 0;
const feed = (day: number, category: NewsItem['category'], title: string, body: string): NewsItem =>
  ({ id: `news_pc_mentor_${day}_${_seq++}`, day, category, title, body, read: false });

const nameOf = (p: Player): string => `${p.name.first} ${p.name.last}`;
const pick = <T>(arr: T[], key: string): T => arr[hashSeed(key) % arr.length];

const positionGroup = (pos: string): string =>
  pos === 'GK' ? 'GK'
  : ['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(pos) ? 'DEF'
  : ['CDM', 'CM', 'CAM', 'LM', 'RM'].includes(pos) ? 'MID' : 'ATT';

const ADOPT_LINES = [
  'first at the training ground, last to leave — and he’s made a point of looking out for the new kid',
  'a proper old pro who’s seen it all, and he’s decided you’re worth his time',
  'quiet, uncompromising, respected in that dressing room — and now, in your corner',
];
const WORD_LINES = [
  '“Chin up. I’ve had months like this. You’re a player — go and be one.”',
  'He didn’t say much. He didn’t need to. Just enough to remind you why you started.',
  '“Forget the last one. The next one’s the only one that matters.”',
];
const BACK_LINES = [
  '“Best young player at this club, no question,” he told the press, unprompted.',
  'Asked about the team’s form, he steered the answer straight to you. Some things you don’t forget.',
  '“I was that age once. He’s better than I was — and he’ll go further.”',
];

/**
 * Pick a mentor for the avatar: a senior team-mate (30+), clearly the more
 * established player, ideally in the same part of the pitch. Deterministic —
 * returns the strongest candidate, hashing to break ties. Null if none fits.
 */
export function pickMentorCandidate(avatar: Player, squad: Player[], year: number, seed: number): Player | null {
  const grp = positionGroup(avatar.position);
  const pool = squad.filter((p) =>
    p.id !== avatar.id &&
    year - p.born.year >= 30 &&
    p.overall >= avatar.overall + 2);
  if (pool.length === 0) return null;
  // Prefer same-group seniors; score by seniority + standing, stable tie-break.
  const scored = pool.map((p) => ({
    p,
    s: (positionGroup(p.position) === grp ? 20 : 0) + p.overall + (year - p.born.year) + (hashSeed(`${seed}:${p.id}`) % 5),
  }));
  scored.sort((a, b) => b.s - a.s);
  return scored[0].p;
}

export interface MentorResult { career: PlayerCareer; news: NewsItem[]; moraleDelta: number }

/**
 * Advance the mentor relationship for one matchday batch. Seeds a mentor if the
 * avatar is young and unmentored and a fitting senior exists; otherwise drifts
 * the bond with recent form and fires at most one low-frequency beat (a quiet
 * word on a rough patch, public backing on a good one, a send-off when he
 * leaves). Pure & deterministic under (seed, day).
 */
export function advanceMentor(
  career: PlayerCareer,
  avatar: Player,
  squad: Player[],
  year: number,
  day: number,
  seed: number,
): MentorResult {
  const news: NewsItem[] = [];
  let moraleDelta = 0;
  const age = year - avatar.born.year;
  const rr = career.recentRatings ?? [];
  const avg = rr.length ? rr.reduce((a, b) => a + b, 0) / rr.length : 6.7;
  const roll = hashSeed(`mentor:${seed}:${day}`) % 100;

  const cur = career.mentor;

  // --- Seed a mentor (young, unmentored, a fitting senior on the books) ------
  if (!cur && age <= 24 && (career.seasonApps ?? 0) >= 3) {
    // Organic, not instant: a modest chance each advance once eligible.
    if (roll < 35) {
      const cand = pickMentorCandidate(avatar, squad, year, seed);
      if (cand) {
        const mentor: CareerMentor = { playerId: cand.id, name: nameOf(cand), bond: 45, since: year, words: 0 };
        news.push(feed(day, 'GENERAL', `${cand.name.last} takes you under his wing`,
          `${nameOf(cand)} — ${pick(ADOPT_LINES, cand.id)}. Every young career needs one of these.`));
        return { career: { ...career, mentor }, news, moraleDelta: 2 };
      }
    }
    return { career, news, moraleDelta };
  }
  if (!cur) return { career, news, moraleDelta };
  if (cur.departed) return { career, news, moraleDelta };

  // --- He's moved on / retired: a send-off, bond remembered ------------------
  const stillHere = squad.some((p) => p.id === cur.playerId && p.contract.clubId === avatar.contract.clubId);
  if (!stillHere) {
    news.push(feed(day, 'GENERAL', `${cur.name.split(' ').slice(-1)[0]} moves on`,
      `${cur.name} has left the club. He passed on more than he’ll ever know — the kind of debt you only repay by doing the same for someone else one day.`));
    return { career: { ...career, mentor: { ...cur, departed: true } }, news, moraleDelta: -1 };
  }

  // --- Drift the bond with recent form ---------------------------------------
  let bond = cur.bond;
  if (rr.length >= 2) bond = clamp(bond + (avg >= 7.2 ? 3 : avg >= 6.6 ? 1 : avg <= 6.0 ? -1 : 0), 0, 100);
  let mentor: CareerMentor = { ...cur, bond };

  // --- At most one beat per advance, low-frequency ---------------------------
  if (rr.length >= 3 && avg <= 6.1 && roll < 45) {
    // A quiet word on a rough patch — a genuine morale lift.
    mentor = { ...mentor, words: (mentor.words ?? 0) + 1, bond: clamp(mentor.bond + 2, 0, 100) };
    news.push(feed(day, 'GENERAL', `A word from ${cur.name.split(' ').slice(-1)[0]}`, pick(WORD_LINES, `${cur.playerId}:${day}`)));
    moraleDelta += 3;
  } else if (rr.length >= 3 && avg >= 7.3 && mentor.bond >= 70 && roll >= 55 && roll < 80) {
    // He backs the avatar publicly.
    mentor = { ...mentor, words: (mentor.words ?? 0) + 1 };
    news.push(feed(day, 'GENERAL', `${cur.name.split(' ').slice(-1)[0]} backs you publicly`, pick(BACK_LINES, `${cur.playerId}:${day}`)));
    moraleDelta += 2;
  } else if (cur.bond < 85 && mentor.bond >= 85 && roll >= 80) {
    // Bond milestone.
    news.push(feed(day, 'GENERAL', `More than a team-mate`,
      `Whatever happens on the pitch, ${cur.name} has become one of the most important people in your career. Football gives you a few of these, if you’re lucky.`));
    moraleDelta += 1;
  }

  return { career: { ...career, mentor }, news, moraleDelta };
}
