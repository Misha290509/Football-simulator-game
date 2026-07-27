// ---------------------------------------------------------------------------
// Player Career — adversity (§ The hard years). The things that happen to a
// career that nobody puts on a highlight reel:
//
//   • Burnout — relentless minutes and pressure grind a player down. He can take
//     a break, get help, or push through, and each costs something different.
//   • Chronic injury — some knocks never fully heal. A permanent cap on his pace
//     that reshapes the player he gets to be.
//   • Off-field incidents — a nightclub photo, a driving ban, a hearing. Club
//     fines, public fallout, and a road back if he wants it.
//   • The spiral — bad form, falling trust, sinking confidence and a hostile
//     crowd compound into a hole he has to actively climb out of.
//
// Pure & deterministic: hashes stable ids, never the sim's RNG stream.
// ---------------------------------------------------------------------------

import type { Player } from '../types/player';
import type { NewsItem } from '../types/league';
import type { PlayerCareer, Conversation } from '../types/playerCareer';
import { hashSeed, clamp } from '../engine/rng';

let _seq = 0;
const feed = (day: number, category: NewsItem['category'], title: string, body: string): NewsItem =>
  ({ id: `news_pc_adv_${day}_${_seq++}`, day, category, title, body, read: false });
const nameOf = (p: Player) => `${p.name.first} ${p.name.last}`;
const pick = <T>(arr: T[], key: string): T => arr[hashSeed(key) % arr.length];

// --- Burnout & mental health ------------------------------------------------

export interface BurnoutState { level: number; since: number; addressed: boolean }

/**
 * Fatigue of the mind, not the legs. Builds with relentless minutes, poor form
 * under pressure, and a career lived in public. Bleeds away with rest.
 */
export function updateBurnout(
  career: PlayerCareer, avatar: Player, appearances: number, day: number,
): { career: PlayerCareer; news: NewsItem[]; conversation: Conversation | null } {
  const cur = career.burnout ?? { level: 0, since: day, addressed: false };
  const rr = career.recentRatings ?? [];
  const avg = rr.length ? rr.reduce((a, b) => a + b, 0) / rr.length : 6.7;

  let level = cur.level;
  // Heavy minutes and low fitness grind him down; a break lets him recover.
  level += appearances >= 3 ? 4 : appearances >= 1 ? 2 : -6;
  if ((avatar.fitness ?? 100) < 60) level += 3;
  if (avg < 6.2) level += 2;
  if ((career.publicImage?.controversy ?? 0) > 50) level += 1;
  if ((career.exile)) level += 3;
  level = clamp(level, 0, 100);

  const next: BurnoutState = { ...cur, level };
  const news: NewsItem[] = [];
  let conversation: Conversation | null = null;

  // Crossing into real trouble surfaces a genuine choice.
  if (cur.level < 70 && level >= 70 && !cur.addressed) {
    news.push(feed(day, 'GENERAL', 'Running on empty',
      `${nameOf(avatar)} isn't sleeping. The football has stopped being fun and everyone around him can see it. This needs addressing before it takes the season.`));
    conversation = {
      id: `conv_burnout_${day}`,
      trigger: 'BURNOUT',
      prompt: 'You’re burnt out. The club doctor has offered to step in. What do you do?',
      choices: [
        { text: 'Take a proper break — step away for a few weeks.', morale: 8, confidence: 10, trust: -4 },
        { text: 'Speak to someone. Get help properly.', morale: 6, confidence: 12, relationship: 3 },
        { text: 'Push through. You’ll play your way out of it.', morale: -2, confidence: -6, trust: 3 },
      ],
    };
  }
  return { career: { ...career, burnout: next }, news, conversation };
}

/** Burnout quietly drags on everything until it's dealt with. */
export function burnoutFormPenalty(career: PlayerCareer): number {
  const l = career.burnout?.level ?? 0;
  return l >= 70 ? -3 : l >= 45 ? -1 : 0;
}

/** Addressing it (however he chose) clears the worst of it. */
export function resolveBurnout(career: PlayerCareer): PlayerCareer {
  const b = career.burnout;
  if (!b) return career;
  return { ...career, burnout: { ...b, level: clamp(b.level - 45, 0, 100), addressed: true } };
}

// --- Chronic injury -------------------------------------------------------------

export interface ChronicState { kind: 'KNEE' | 'HAMSTRING' | 'ANKLE'; since: number; paceCap: number }

const CHRONIC_TEXT: Record<ChronicState['kind'], string> = {
  KNEE: 'The knee is never going to be what it was. He’ll manage it for the rest of his career.',
  HAMSTRING: 'A hamstring that keeps going. Every sprint now carries a question.',
  ANKLE: 'The ankle has been rebuilt once already. It won’t take another.',
};

/**
 * A long lay-off can leave permanent damage — a hard cap on his pace that
 * reshapes the player he becomes. Only ever from a genuinely serious injury.
 */
export function maybeChronic(
  career: PlayerCareer, avatar: Player, weeksOut: number, day: number, seed: number,
): { career: PlayerCareer; player: Player; news: NewsItem[] } {
  if (career.chronic || weeksOut < 12) return { career, player: avatar, news: [] };
  if ((hashSeed(`chronic_${seed}_${day}`) % 100) >= 30) return { career, player: avatar, news: [] };

  const kinds: ChronicState['kind'][] = ['KNEE', 'HAMSTRING', 'ANKLE'];
  const kind = pick(kinds, `chronickind_${seed}_${day}`);
  const phys = avatar.attributes.physical as Record<string, number>;
  const paceCap = clamp(Math.round(phys.sprintSpeed - 6), 1, 99);
  const player: Player = {
    ...avatar,
    attributes: {
      ...avatar.attributes,
      physical: {
        ...avatar.attributes.physical,
        sprintSpeed: paceCap,
        acceleration: clamp(phys.acceleration - 5, 1, 99),
      } as typeof avatar.attributes.physical,
    },
    hidden: { ...avatar.hidden, injuryProneness: clamp(avatar.hidden.injuryProneness + 15, 5, 95) },
  };
  return {
    career: { ...career, chronic: { kind, since: day, paceCap } },
    player,
    news: [feed(day, 'INJURY', 'It won’t fully heal',
      `The specialists have been honest with ${nameOf(avatar)}. ${CHRONIC_TEXT[kind]} He can still be a footballer — just a different one.`)],
  };
}

// --- Off-field incidents -----------------------------------------------------------

export type IncidentKind = 'NIGHTCLUB' | 'DRIVING_BAN' | 'HEARING' | 'TRAINING_BUST_UP';

export interface IncidentDef { kind: IncidentKind; headline: string; body: string; fine: number; controversy: number; fanRating: number }

const INCIDENTS: IncidentDef[] = [
  { kind: 'NIGHTCLUB', headline: 'Pictured out at 4am', body: 'Two days before a match. The pictures are everywhere by breakfast.', fine: 120_000, controversy: 18, fanRating: -6 },
  { kind: 'DRIVING_BAN', headline: 'Banned from driving', body: 'Caught well over the limit on the ring road. The club statement is already written.', fine: 250_000, controversy: 25, fanRating: -10 },
  { kind: 'HEARING', headline: 'Charged by the FA', body: 'A comment to an official, picked up by a microphone nobody knew was there.', fine: 80_000, controversy: 14, fanRating: -3 },
  { kind: 'TRAINING_BUST_UP', headline: 'Training-ground bust-up', body: 'It got physical with a teammate. The pictures got out before the club could contain it.', fine: 60_000, controversy: 12, fanRating: -4 },
];

/**
 * An off-field incident. Likelier for a controversial, low-professionalism
 * player — and never out of nowhere for a model pro.
 */
export function maybeIncident(
  career: PlayerCareer, avatar: Player, day: number, seed: number,
): { career: PlayerCareer; news: NewsItem[]; moraleDelta: number; conversation: Conversation | null } {
  const pro = career.personality?.professionalism ?? 55;
  const controversy = career.publicImage?.controversy ?? 0;
  // Base risk is tiny; recklessness and a taste for the spotlight raise it.
  const risk = clamp((70 - pro) * 0.12 + controversy * 0.06, 0, 9);
  if ((hashSeed(`incident_${seed}_${day}`) % 1000) >= risk * 10) {
    return { career, news: [], moraleDelta: 0, conversation: null };
  }
  const inc = pick(INCIDENTS, `incidentkind_${seed}_${day}`);
  const image = career.publicImage ?? { persona: 'Unknown', controversy: 0 };
  const next: PlayerCareer = {
    ...career,
    bankBalance: Math.max(0, (career.bankBalance ?? 0) - inc.fine),
    fanRating: clamp((career.fanRating ?? 50) + inc.fanRating, 0, 100) as number,
    clubRelationship: clamp((career.clubRelationship ?? 50) - 8, 0, 100) as number,
    publicImage: { ...image, controversy: clamp(image.controversy + inc.controversy, 0, 100) as number },
    incidents: [...(career.incidents ?? []), { kind: inc.kind, day }],
  };
  return {
    career: next,
    news: [feed(day, 'GENERAL', inc.headline, `${inc.body} ${nameOf(avatar)} has been fined two weeks' wages by the club.`)],
    moraleDelta: -6,
    conversation: {
      id: `conv_incident_${day}`,
      trigger: 'INCIDENT',
      prompt: `${inc.headline}. The club want a response, and so does everyone else.`,
      choices: [
        { text: 'Apologise publicly and take the punishment.', fanRating: 5, trust: 4, morale: 1, confidence: -1 },
        { text: 'Say nothing and let it blow over.', fanRating: -1, morale: 0 },
        { text: 'Deny everything.', following: 20_000, fanRating: -5, trust: -5, morale: 2 },
      ],
    },
  };
}

// --- The spiral ---------------------------------------------------------------------

export interface SpiralState { since: number; depth: number }

/**
 * When bad form, falling trust and sinking confidence start feeding each other,
 * the hole gets deeper on its own. Detect it, name it, and make climbing out a
 * thing the player has to actually do.
 */
export function updateSpiral(
  career: PlayerCareer, avatar: Player, day: number,
): { career: PlayerCareer; news: NewsItem[]; formDelta: number } {
  const rr = career.recentRatings ?? [];
  const avg = rr.length >= 3 ? rr.reduce((a, b) => a + b, 0) / rr.length : 6.7;
  const trust = career.managerTrust ?? 50;
  const conf = career.confidence ?? 60;
  const spiralling = avg <= 6.1 && trust < 45 && conf < 40;
  const cur = career.spiral ?? null;
  const news: NewsItem[] = [];

  if (spiralling) {
    const depth = clamp((cur?.depth ?? 0) + 1, 0, 5);
    if (!cur) {
      news.push(feed(day, 'GENERAL', 'It’s all going against him',
        `Poor form, a manager losing patience and confidence on the floor. ${nameOf(avatar)} is in a genuine spiral — and the only way out is through.`));
    }
    return {
      career: { ...career, spiral: { since: cur?.since ?? day, depth } },
      news,
      formDelta: -depth * 0.6,
    };
  }
  if (cur) {
    news.push(feed(day, 'MILESTONE', 'Out of the hole',
      `${nameOf(avatar)} has climbed out. Form back, head up, and the manager watching for the right reasons again.`));
    return { career: { ...career, spiral: null }, news, formDelta: 0 };
  }
  return { career, news, formDelta: 0 };
}
