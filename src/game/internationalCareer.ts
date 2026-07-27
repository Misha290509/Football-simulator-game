// ---------------------------------------------------------------------------
// Player Career — international depth (§ Playing for your country). The world
// tournaments already run as a background sim; this is the avatar's *personal*
// international career, which is a different and much crueller story:
//
//   • Qualifying campaigns — two years of wet Tuesday nights in places nobody
//     wants to go, and a nation that either makes it or doesn't.
//   • Squad selection — the phone call, the standby list, and being cut.
//   • Captaining your country — the armband, and what it costs to lose it.
//   • A rival for your shirt who trains beside you every day at your club.
//   • The young pretender — a nineteen-year-old with your position and more
//     time than you have left.
//   • Shootouts — the walk from the halfway line.
//
// Pure & deterministic: hashes stable ids, never the sim's RNG stream.
// ---------------------------------------------------------------------------

import type { Player } from '../types/player';
import type { NewsItem } from '../types/league';
import type { PlayerCareer, Conversation } from '../types/playerCareer';
import { hashSeed, clamp } from '../engine/rng';
import { canonicalNation } from '../engine/nationalTeam';
import { NATION_BY_NAME } from '../data/nations';
import { FIRST_NAMES, LAST_NAMES } from '../data/names';
import { POSITION_GROUP } from '../types/attributes';

let _seq = 0;
const feed = (day: number, category: NewsItem['category'], title: string, body: string): NewsItem =>
  ({ id: `news_pc_intl_${day}_${_seq++}`, day, category, title, body, read: false });
const nameOf = (p: Player) => `${p.name.first} ${p.name.last}`;
const ageOf = (p: Player, year: number) => year - p.born.year;

/** The avatar's nation as the tournament engine knows it. */
export function nationOf(avatar: Player): string {
  return canonicalNation(avatar.nationality ?? '') || 'his country';
}
const strengthOf = (nation: string) => NATION_BY_NAME[nation]?.strength ?? 68;

// --- Qualifying campaigns -----------------------------------------------------

export interface QualifyingCampaign {
  competition: string;
  year: number;
  played: number; won: number; drawn: number; lost: number; points: number;
  /** Finishing position in the qualifying group (1–5). */
  position: number;
  qualified: boolean;
  /** The avatar's own contribution across the campaign. */
  caps: number; goals: number;
}

const QUALIFYING_MATCHES = 8;

/**
 * A whole qualifying group, resolved in one go at the summer rollover. The
 * nation's own strength does most of the work; the avatar's involvement depends
 * on whether he was in the squad at all.
 */
export function runQualifying(
  avatar: Player, nation: string, competition: string, year: number, involved: boolean, seed: number,
): { campaign: QualifyingCampaign; news: NewsItem[]; moraleDelta: number } {
  const s = strengthOf(nation);
  let won = 0, drawn = 0, lost = 0;
  for (let i = 0; i < QUALIFYING_MATCHES; i++) {
    // Roll each match against a notional group opponent ~10 weaker on average.
    const roll = hashSeed(`qual_${seed}_${nation}_${year}_${i}`) % 100;
    const winChance = clamp(28 + (s - 68) * 2.1, 15, 82);
    const drawChance = clamp(100 - winChance - Math.max(6, (95 - s) * 0.55), 8, 40);
    if (roll < winChance) won++;
    else if (roll < winChance + drawChance) drawn++;
    else lost++;
  }
  const points = won * 3 + drawn;
  // Position in a group of five: points map onto a plausible finish.
  const position = points >= 19 ? 1 : points >= 15 ? 2 : points >= 11 ? 3 : points >= 7 ? 4 : 5;
  const qualified = position <= 2;

  const caps = involved ? 3 + (hashSeed(`qcaps_${seed}_${nation}_${year}`) % 5) : 0;
  const goals = involved && POSITION_GROUP[avatar.position] === 'ATT'
    ? hashSeed(`qgoals_${seed}_${nation}_${year}`) % 4
    : involved ? hashSeed(`qgoals_${seed}_${nation}_${year}`) % 2 : 0;

  const record = `${won}W ${drawn}D ${lost}L`;
  const news: NewsItem[] = [qualified
    ? feed(0, 'MILESTONE', `${nation} qualify for the ${competition}`,
      `${record} from eight, ${points} points, ${position === 1 ? 'group winners' : 'second and through'}. ${involved ? `${nameOf(avatar)} played his part with ${caps} caps${goals ? ` and ${goals} goals` : ''}.` : `${nameOf(avatar)} watched it from the outside.`}`)
    : feed(0, 'RESULT', `${nation} miss out on the ${competition}`,
      `${record} from eight was not enough — ${nation} finish ${position}${position === 3 ? 'rd' : 'th'} and there will be no tournament this summer. ${involved ? 'A long, quiet flight home.' : ''}`)];

  return {
    campaign: { competition, year, played: QUALIFYING_MATCHES, won, drawn, lost, points, position, qualified, caps, goals },
    news,
    moraleDelta: qualified ? (involved ? 10 : 2) : (involved ? -10 : -3),
  };
}

// --- Squad selection ------------------------------------------------------------

export type IntlRole = 'CAPTAIN' | 'STARTER' | 'SQUAD' | 'STANDBY' | 'CUT';

const ROLE_RANK: Record<IntlRole, number> = { CUT: 0, STANDBY: 1, SQUAD: 2, STARTER: 3, CAPTAIN: 4 };

/**
 * The squad announcement. Being left out of a tournament squad after a season
 * of playing every week is one of the worst things that happens to a footballer,
 * so it is modelled properly rather than assumed away.
 */
export function tournamentSelection(
  career: PlayerCareer, avatar: Player, nation: string, competition: string, year: number, seed: number,
): { role: IntlRole; career: PlayerCareer; news: NewsItem[]; moraleDelta: number; conversation: Conversation | null } {
  const age = ageOf(avatar, year);
  const trust = career.intlManagerTrust ?? 50;
  // How he compares to what the nation can otherwise call on.
  let score = (avatar.overall - strengthOf(nation)) * 2.2 + (trust - 50) * 0.5;
  if (age >= 33) score -= (age - 32) * 4;
  if (age <= 19) score -= 6;
  if (career.intlPretender?.tookShirt) score -= 14;
  if ((career.seasonAvgRating ?? 0) >= 7.2) score += 6;
  if ((career.international?.caps ?? 0) >= 50) score += 4;
  // Managers have their own ideas; a marginal call can go either way.
  score += (hashSeed(`intlsel_${seed}_${avatar.id}_${year}`) % 7) - 3;

  const role: IntlRole =
    score >= 26 && (career.international?.caps ?? 0) >= 30 ? 'CAPTAIN'
    : score >= 8 ? 'STARTER'
    : score >= -6 ? 'SQUAD'
    : score >= -16 ? 'STANDBY'
    : 'CUT';

  const who = nameOf(avatar);
  const wasCaptain = career.intlRole === 'CAPTAIN';
  const news: NewsItem[] = [];
  let moraleDelta = 0;
  let conversation: Conversation | null = null;

  switch (role) {
    case 'CAPTAIN':
      moraleDelta = wasCaptain ? 4 : 16;
      news.push(feed(0, 'MILESTONE', wasCaptain ? `Leading ${nation} again` : `Captain of ${nation}`,
        wasCaptain
          ? `${who} keeps the armband for the ${competition}. His country, his team.`
          : `${who} will lead his country at the ${competition}. There is no higher honour in the game, and no heavier one.`));
      break;
    case 'STARTER':
      moraleDelta = wasCaptain ? -6 : 9;
      news.push(feed(0, 'MILESTONE', `Named in the ${nation} squad`,
        `${who} is in, and he is in the team. ${wasCaptain ? 'The armband has gone to somebody else, which stings more than he will admit.' : `A ${competition} to look forward to.`}`));
      break;
    case 'SQUAD':
      moraleDelta = 3;
      news.push(feed(0, 'GENERAL', `In the ${nation} squad`,
        `${who} makes the ${competition} squad, though the manager has been careful not to promise him minutes.`));
      break;
    case 'STANDBY':
      moraleDelta = -9;
      news.push(feed(0, 'GENERAL', `On standby for ${nation}`,
        `${who} is on the standby list. He will spend the next fortnight hoping somebody else gets injured, and hating himself a little for it.`));
      conversation = {
        id: `conv_intl_standby_${year}`,
        trigger: 'INTL_STANDBY',
        prompt: `You are on standby for the ${competition}. A reporter asks whether you feel you have been treated fairly.`,
        choices: [
          { text: 'Say the right things. Wish the lads well.', trust: 6, fanRating: 3 },
          { text: 'Admit you are devastated but you respect the call.', fanRating: 8, morale: 2 },
          { text: 'Say you should be on the plane and everyone knows it.', trust: -14, fanRating: 6, following: 25_000, morale: 4 },
        ],
      };
      break;
    case 'CUT':
      moraleDelta = -18;
      news.push(feed(0, 'RESULT', `Left out of the ${nation} squad`,
        `${who} is not going to the ${competition}. No call, no explanation — just a name missing from a list read out on television.`));
      conversation = {
        id: `conv_intl_cut_${year}`,
        trigger: 'INTL_CUT',
        prompt: `You have been cut from the ${competition} squad. Your phone has not stopped.`,
        choices: [
          { text: 'Say nothing publicly. Come back next season and make it impossible.', trust: 4, morale: 3, confidence: 5 },
          { text: 'Call the manager and ask him to his face why.', trust: -6, morale: 6 },
          { text: 'Announce you are done with international football.', trust: -30, fanRating: -10, following: 40_000 },
        ],
      };
      break;
  }

  return {
    role,
    career: { ...career, intlRole: role, intlSnub: role === 'CUT' ? { year, competition } : career.intlSnub },
    news, moraleDelta, conversation,
  };
}

/** Did he move up or down the pecking order since last time? */
export function roleMoved(from: IntlRole | undefined, to: IntlRole): 'UP' | 'DOWN' | 'SAME' {
  if (!from) return 'SAME';
  return ROLE_RANK[to] > ROLE_RANK[from] ? 'UP' : ROLE_RANK[to] < ROLE_RANK[from] ? 'DOWN' : 'SAME';
}

// --- The rival for your shirt ----------------------------------------------------

export interface IntlRival {
  name: string;
  playerId?: string;
  /** The worst version: he plays for your club too, and you see him every day. */
  clubmate: boolean;
  rating: number;
  /** 0–100 — how civil the two of them manage to be about it. */
  relationship: number;
}

/**
 * Somebody else wants the shirt. If a compatriot in the same position happens to
 * be at his own club, that's who it is — and training becomes a very long week.
 */
export function maybeIntlRival(
  career: PlayerCareer, avatar: Player, pool: Player[], nation: string, day: number, seed: number,
): { career: PlayerCareer; news: NewsItem[]; conversation: Conversation | null } {
  if (career.intlRival || !career.international?.capped) return { career, news: [], conversation: null };
  if ((hashSeed(`intlrival_${seed}_${avatar.id}_${day}`) % 100) >= 6) return { career, news: [], conversation: null };

  const group = POSITION_GROUP[avatar.position];
  const clubId = avatar.contract.clubId;
  const candidates = pool.filter((p) =>
    p.id !== avatar.id &&
    canonicalNation(p.nationality ?? '') === nation &&
    POSITION_GROUP[p.position] === group &&
    Math.abs(p.overall - avatar.overall) <= 8);
  if (candidates.length === 0) return { career, news: [], conversation: null };

  // A clubmate is far more interesting than a stranger, so prefer one.
  const clubmates = candidates.filter((p) => p.contract.clubId === clubId);
  const chosen = (clubmates.length > 0 ? clubmates : candidates)
    .reduce((a, b) => (b.overall > a.overall || (b.overall === a.overall && b.id < a.id) ? b : a));
  const clubmate = chosen.contract.clubId === clubId;

  const rival: IntlRival = { name: nameOf(chosen), playerId: chosen.id, clubmate, rating: chosen.overall, relationship: clubmate ? 55 : 45 };
  return {
    career: { ...career, intlRival: rival },
    news: [feed(day, 'GENERAL', `A rival for the ${nation} shirt`,
      clubmate
        ? `${rival.name} is the other man the ${nation} manager is choosing between — and he sits three pegs down in the same dressing room. They will train together every morning until one of them wins.`
        : `${rival.name} has emerged as the direct competition for ${nameOf(avatar)}'s place in the ${nation} side. Every weekend is now a comparison.`)],
    conversation: clubmate ? {
      id: `conv_intlrival_${day}`,
      trigger: 'INTL_RIVAL',
      prompt: `${rival.name} is your competition for the ${nation} shirt — and your teammate. How do you handle it?`,
      choices: [
        { text: 'Be genuinely good about it. Football is long.', relationship: 8, morale: 3 },
        { text: 'Stay professional and say nothing at all.', morale: 1 },
        { text: 'Make it obvious that the shirt is yours.', confidence: 8, relationship: -10, standing: -4 },
      ],
    } : null,
  };
}

/** Head-to-head form nudges the bond between two men after the same shirt. */
export function intlRivalDrift(career: PlayerCareer, avatarRating: number): PlayerCareer {
  const r = career.intlRival;
  if (!r) return career;
  const drift = avatarRating >= 7.2 ? -2 : avatarRating <= 6.2 ? 1 : 0;
  if (drift === 0) return career;
  return { ...career, intlRival: { ...r, relationship: clamp(r.relationship + drift, 0, 100) } };
}

// --- The young pretender ----------------------------------------------------------

export interface IntlPretender {
  name: string;
  bornYear: number;
  since: number; // day he first appeared
  /** Set once he has actually taken the shirt. */
  tookShirt?: boolean;
}

/**
 * Nobody keeps an international shirt forever. Once the avatar is the wrong side
 * of thirty, a teenager arrives with his position and a great deal more time.
 */
export function maybePretender(
  career: PlayerCareer, avatar: Player, year: number, day: number, seed: number,
): { career: PlayerCareer; news: NewsItem[]; moraleDelta: number } {
  if (career.intlPretender || !career.international?.capped) return { career, news: [], moraleDelta: 0 };
  if (ageOf(avatar, year) < 29) return { career, news: [], moraleDelta: 0 };
  if ((hashSeed(`pretender_${seed}_${avatar.id}_${year}`) % 100) >= 30) return { career, news: [], moraleDelta: 0 };

  const first = FIRST_NAMES[hashSeed(`pfn_${seed}_${avatar.id}_${year}`) % FIRST_NAMES.length];
  const last = LAST_NAMES[hashSeed(`pln_${seed}_${avatar.id}_${year}`) % LAST_NAMES.length];
  const pretender: IntlPretender = { name: `${first} ${last}`, bornYear: year - 19, since: day };
  return {
    career: { ...career, intlPretender: pretender },
    news: [feed(day, 'GENERAL', 'The next one',
      `A nineteen-year-old called ${pretender.name} has been called up in ${nameOf(avatar)}'s position. Everybody is very excited about him. Everybody was very excited about ${avatar.name.last} once, too.`)],
    moraleDelta: -3,
  };
}

/**
 * Each summer the pretender either takes the shirt or waits another year. Keep
 * performing and you hold him off; drop below it and the shirt is gone.
 */
export function pretenderPressure(
  career: PlayerCareer, avatar: Player, year: number, seasonRating: number, day: number,
): { career: PlayerCareer; news: NewsItem[]; moraleDelta: number; trustDelta: number } {
  const p = career.intlPretender;
  if (!p || p.tookShirt) return { career, news: [], moraleDelta: 0, trustDelta: 0 };
  const age = ageOf(avatar, year);
  const kidAge = year - p.bornYear;
  // He holds on with real form; time does the rest.
  const holdsOn = seasonRating >= 7.0 && age <= 34;
  if (holdsOn) {
    return {
      career, moraleDelta: 4, trustDelta: 3,
      news: [feed(day, 'GENERAL', 'Not yet',
        `${p.name} is ${kidAge} now and still waiting. ${nameOf(avatar)} played too well this season for the conversation to even start.`)],
    };
  }
  return {
    career: { ...career, intlPretender: { ...p, tookShirt: true }, intlRole: 'SQUAD' },
    moraleDelta: -14, trustDelta: -8,
    news: [feed(day, 'RESULT', 'The shirt has gone',
      `${p.name} starts for his country now. ${nameOf(avatar)} is on the bench beside him, and there is no way back from this one — only a decision about how it ends.`)],
  };
}

// --- Shootouts ---------------------------------------------------------------------

export interface ShootoutBeat {
  /** Did the avatar walk up and take one? */
  took: boolean;
  scored: boolean;
  won: boolean;
  news: NewsItem;
  moraleDelta: number;
  confidenceDelta: number;
}

/**
 * The walk from the halfway line. Whether he takes one at all depends on
 * bottle — and whether he scores depends on composure and technique, not luck
 * alone.
 */
export function shootoutBeat(
  avatar: Player, nation: string, opponent: string, round: string, won: boolean, day: number, seed: number,
): ShootoutBeat {
  const composure = avatar.attributes.mental?.composure ?? 60;
  const bigGame = avatar.hidden?.bigGame ?? 60;
  const penalty = avatar.attributes.technical?.penalties ?? avatar.attributes.technical?.finishing ?? 60;
  const keeper = POSITION_GROUP[avatar.position] === 'GK';

  const bottle = clamp((composure + bigGame) / 2, 0, 100);
  const took = !keeper && (hashSeed(`sotake_${seed}_${avatar.id}_${day}`) % 100) < bottle;
  const scoreChance = clamp(52 + penalty * 0.28 + composure * 0.12, 40, 92);
  const scored = took && (hashSeed(`soscore_${seed}_${avatar.id}_${day}`) % 100) < scoreChance;

  const who = nameOf(avatar);
  let title: string, body: string, moraleDelta: number, confidenceDelta: number;
  if (!took) {
    title = won ? `${nation} survive the shootout` : `${nation} go out on penalties`;
    body = keeper
      ? `${who} could only stand on the edge of the box and watch five men he trusts decide the ${round}. ${won ? 'They held their nerve.' : 'They did not.'}`
      : `${who} was not on the list of five. ${won ? `${nation} won it anyway.` : `${nation} lost it, and he will always wonder.`}`;
    moraleDelta = won ? 8 : -12;
    confidenceDelta = won ? 3 : -4;
  } else if (scored) {
    title = won ? `${who} scores in the shootout — ${nation} through` : `${who} scores, but ${nation} go out`;
    body = won
      ? `The longest walk of his life, and he put it in the corner without a flicker. ${nation} beat ${opponent} on penalties in the ${round}.`
      : `He did his bit. Somebody else didn't. ${nation} are out of the ${round} to ${opponent}, and being blameless is worth nothing at all tonight.`;
    moraleDelta = won ? 16 : -6;
    confidenceDelta = won ? 12 : 4;
  } else {
    title = won ? `${who} misses — but ${nation} survive` : `${who} misses the penalty that ends it`;
    body = won
      ? `He put it over the bar and could not look up. Then the goalkeeper saved one, and ${nation} went through anyway, and he has never been so grateful to anybody.`
      : `Fifty million people watched ${who} miss. ${nation} are out of the ${round} to ${opponent}. This will follow him for a very long time.`;
    moraleDelta = won ? -4 : -22;
    confidenceDelta = won ? -8 : -18;
  }
  return { took, scored, won, moraleDelta, confidenceDelta, news: feed(day, won ? 'RESULT' : 'RESULT', title, body) };
}
