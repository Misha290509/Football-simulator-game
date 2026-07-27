// ---------------------------------------------------------------------------
// Player Career — squad & dressing-room life (§ The group). The rungs and
// textures of belonging to a squad, beyond the standing meter:
//
//   • Leadership — the leadership group, then the vice-captaincy, then the
//     armband. Real rungs, each earned.
//   • The captain's team talk — when he wears it, the room is his to lift.
//   • Marquee signings — a big-money arrival in his position shifts the whole
//     pecking order under his feet, whether he's ready or not.
//   • The language barrier — move abroad and relationships grow at half speed
//     until he puts the hours in and learns to speak to the room.
//   • Cliques — the nationality and age groups inside every dressing room, which
//     he can belong to, bridge, or find himself outside of.
//
// Pure & deterministic: hashes stable ids, never the sim's RNG stream.
// ---------------------------------------------------------------------------

import type { Player } from '../types/player';
import type { Club } from '../types/club';
import type { NewsItem } from '../types/league';
import type { PlayerCareer, SquadStatus } from '../types/playerCareer';
import { hashSeed, clamp } from '../engine/rng';
import { traitsOf } from '../engine/traits';

let _seq = 0;
const feed = (day: number, category: NewsItem['category'], title: string, body: string): NewsItem =>
  ({ id: `news_pc_squad_${day}_${_seq++}`, day, category, title, body, read: false });
const nameOf = (p: Player) => `${p.name.first} ${p.name.last}`;
const pick = <T>(arr: T[], key: string): T => arr[hashSeed(key) % arr.length];

// --- Leadership ladder ---------------------------------------------------------

export type LeadershipRung = 'NONE' | 'LEADERSHIP_GROUP' | 'VICE_CAPTAIN' | 'CAPTAIN';

export const LEADERSHIP_LABEL: Record<LeadershipRung, string> = {
  NONE: '', LEADERSHIP_GROUP: 'Leadership group', VICE_CAPTAIN: 'Vice-captain', CAPTAIN: 'Captain',
};

/**
 * Where he sits in the club's leadership. A rung below the armband matters:
 * being trusted in the leadership group, then made vice-captain, is the arc that
 * makes eventually being handed the captaincy feel earned.
 */
export function deriveLeadership(career: PlayerCareer, avatar: Player, standing: number): LeadershipRung {
  if (career.status === 'CAPTAIN') return 'CAPTAIN';
  const leader = traitsOf(avatar).includes('LEADER');
  const trust = career.managerTrust ?? 50;
  const senior = career.status === 'STAR' || career.status === 'KEY';
  if (senior && standing >= 72 && trust >= 68 && leader) return 'VICE_CAPTAIN';
  if (senior && standing >= 60 && trust >= 58) return 'LEADERSHIP_GROUP';
  return 'NONE';
}

/** A beat when he climbs a rung — earned, and worth marking. */
export function leadershipNews(rung: LeadershipRung, avatar: Player, day: number): NewsItem | null {
  if (rung === 'LEADERSHIP_GROUP') {
    return feed(day, 'MILESTONE', 'Into the leadership group',
      `The manager has brought ${nameOf(avatar)} into the club's leadership group. Not the armband — but a seat at the table, and a say in how this dressing room runs.`);
  }
  if (rung === 'VICE_CAPTAIN') {
    return feed(day, 'MILESTONE', 'Named vice-captain',
      `${nameOf(avatar)} is the club's new vice-captain. One rung from the armband, and the room already looks to him when it goes quiet.`);
  }
  return null;
}

// --- The captain's team talk ----------------------------------------------------

export interface TeamTalkOption { id: string; text: string; blurb: string; morale: number; standing: number; risky?: boolean }

/** The options a captain has when the room needs him. Deterministic per context. */
export function captainTeamTalkOptions(losing: boolean): TeamTalkOption[] {
  return losing
    ? [
      { id: 'rally', text: 'Rally them — “There’s time. We go again, right now.”', blurb: 'Belief over blame.', morale: 5, standing: 3 },
      { id: 'blast', text: 'Blast them — “That’s not good enough and you know it.”', blurb: 'High risk: lights a fire, or splits the room.', morale: 2, standing: 2, risky: true },
      { id: 'calm', text: 'Calm it — “Stop panicking. Play the way we know.”', blurb: 'Steady hands.', morale: 3, standing: 2 },
    ]
    : [
      { id: 'focus', text: 'Keep them honest — “It’s not done. Concentrate.”', blurb: 'No complacency.', morale: 3, standing: 3 },
      { id: 'enjoy', text: 'Let them enjoy it — “Express yourselves out there.”', blurb: 'Freedom, and a little risk.', morale: 5, standing: 2 },
      { id: 'quiet', text: 'Say nothing — let the football talk.', blurb: 'Some captains lead by doing.', morale: 1, standing: 1 },
    ];
}

/** Deliver the talk: lifts the squad, and shapes how the room sees him. */
export function deliverTeamTalk(
  career: PlayerCareer, avatar: Player, optionId: string, losing: boolean, day: number,
): { career: PlayerCareer; squadMorale: number; news: NewsItem[] } {
  const opt = captainTeamTalkOptions(losing).find((o) => o.id === optionId) ?? captainTeamTalkOptions(losing)[0];
  // A blast is a gamble: it works on a room that already respects him.
  const standing = career.dressingRoom?.standing ?? 50;
  const backfires = !!opt.risky && standing < 55;
  const squadMorale = backfires ? -2 : opt.morale;
  const standingDelta = backfires ? -4 : opt.standing;
  const dr = career.dressingRoom ?? { standing: 50, bonds: [] };
  return {
    career: { ...career, dressingRoom: { ...dr, standing: clamp(dr.standing + standingDelta, 0, 100) as number } },
    squadMorale,
    news: [feed(day, 'GENERAL', backfires ? 'The talk fell flat' : 'The captain spoke',
      backfires
        ? `${nameOf(avatar)} tore into the group — and it landed badly. This room isn't his to shout at yet.`
        : `${nameOf(avatar)} pulled the squad together before they went out. Whatever he said, they walked out taller.`)],
  };
}

// --- Marquee signings ------------------------------------------------------------

/**
 * A big new arrival in his position: the ladder shifts under him. Detects a
 * newly-arrived teammate who is clearly better and plays where he plays.
 */
export function detectMarqueeSignal(
  career: PlayerCareer, avatar: Player, squad: Player[], knownIds: string[], day: number,
): { career: PlayerCareer; news: NewsItem[]; moraleDelta: number } {
  const known = new Set(knownIds);
  const arrivals = squad.filter((p) =>
    p.id !== avatar.id && !known.has(p.id)
    && p.position === avatar.position
    && p.overall >= avatar.overall + 3);
  if (arrivals.length === 0) return { career, news: [], moraleDelta: 0 };
  const big = arrivals.sort((a, b) => b.overall - a.overall)[0];
  return {
    career,
    news: [feed(day, 'TRANSFER', `${nameOf(big)} signs — in your position`,
      `The club have gone out and signed a ${big.overall}-rated ${big.position}. ${nameOf(avatar)} now has a serious fight on his hands for the shirt he thought was his.`)],
    moraleDelta: -5,
  };
}

// --- Language barrier -------------------------------------------------------------

export interface LanguageState { countryId: string; fluency: number; since: number }

/**
 * Moving abroad: until he learns the language, relationships grow at half speed.
 * Fluency climbs steadily with time at the club, faster for a professional.
 */
export function updateLanguage(
  career: PlayerCareer, avatar: Player, club: Club | undefined, day: number,
): { career: PlayerCareer; news: NewsItem[] } {
  const news: NewsItem[] = [];
  if (!club) return { career, news };
  const home = avatar.nationality;
  const abroad = club.countryId !== home;
  const cur = career.language;

  if (!abroad) return { career: cur ? { ...career, language: null } : career, news };

  if (!cur || cur.countryId !== club.countryId) {
    return {
      career: { ...career, language: { countryId: club.countryId, fluency: 15, since: day } },
      news: [feed(day, 'GENERAL', 'A new country, a new language',
        `${nameOf(avatar)} has moved abroad. Until he can speak to the room properly, building relationships here will be slow going.`)],
    };
  }
  if (cur.fluency >= 100) return { career, news };
  const professional = (career.personality?.professionalism ?? 55) >= 65;
  const fluency = clamp(cur.fluency + (professional ? 9 : 6), 0, 100);
  if (cur.fluency < 100 && fluency >= 100) {
    news.push(feed(day, 'MILESTONE', 'Fluent',
      `${nameOf(avatar)} did his first interview in the local language today. The dressing room noticed — you're one of them now.`));
  }
  return { career: { ...career, language: { ...cur, fluency } }, news };
}

/** Relationship growth multiplier while he can't speak the language. */
export function languageFactor(career: PlayerCareer): number {
  const l = career.language;
  if (!l || l.fluency >= 100) return 1;
  return 0.5 + (l.fluency / 100) * 0.5; // 0.5 at zero fluency → 1.0 when fluent
}

// --- Cliques ---------------------------------------------------------------------

export type CliqueKind = 'NATIONALITY' | 'AGE' | 'SENIOR_PROS';
export interface Clique { kind: CliqueKind; label: string; members: string[]; belongs: boolean }

/**
 * The groups inside a dressing room: the countrymen who stick together, the
 * young lads, the senior pros. Where he sits shapes how easily the room opens up.
 */
export function detectCliques(avatar: Player, squad: Player[], year: number): Clique[] {
  const out: Clique[] = [];
  const age = year - avatar.born.year;

  const sameNation = squad.filter((p) => p.id !== avatar.id && p.nationality === avatar.nationality);
  if (sameNation.length >= 2) {
    out.push({ kind: 'NATIONALITY', label: `The ${avatar.nationality} contingent`, members: sameNation.slice(0, 4).map(nameOf), belongs: true });
  }
  const young = squad.filter((p) => p.id !== avatar.id && year - p.born.year <= 22);
  if (young.length >= 3) {
    out.push({ kind: 'AGE', label: 'The young lads', members: young.slice(0, 4).map(nameOf), belongs: age <= 22 });
  }
  const seniors = squad.filter((p) => p.id !== avatar.id && year - p.born.year >= 30);
  if (seniors.length >= 2) {
    out.push({ kind: 'SENIOR_PROS', label: 'The senior pros', members: seniors.slice(0, 4).map(nameOf), belongs: age >= 29 });
  }
  return out;
}

/** Belonging to more of the room's groups makes standing easier to build. */
export function cliqueStandingBonus(cliques: Clique[]): number {
  const belong = cliques.filter((c) => c.belongs).length;
  return belong >= 2 ? 1 : belong === 1 ? 0.5 : -0.5;
}

const OUTSIDER_LINES = [
  'He eats alone more often than he\'d like. It takes time.',
  'The room splits into its groups after training, and he isn\'t quite in one yet.',
];
export function outsiderLine(key: string): string { return pick(OUTSIDER_LINES, key); }

/** Statuses that make the group listen. */
export const SENIOR_STATUSES: SquadStatus[] = ['KEY', 'STAR', 'CAPTAIN'];
