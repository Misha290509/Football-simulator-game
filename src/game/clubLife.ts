// ---------------------------------------------------------------------------
// Player Career — the club as a living thing (§ Around him). A footballer does
// not exist in a vacuum: the institution he plays for has its own fortunes, and
// they land on him whether he likes it or not.
//
//   • Relegation & promotion — wage clauses bite, fire-sales start, and he must
//     decide whether to stay loyal or jump ship.
//   • Takeovers — sudden money changes everything, or a new owner guts the place.
//   • Financial crisis — deferred wages, the training ground sold, a fan protest
//     he can publicly join or stay well out of.
//   • Shirt sales — his popularity is worth real money to the club, and they
//     notice.
//   • Cup runs & continental nights — the away days, the giant-killings, and the
//     nights under the lights that a league season can't give him.
//
// Pure & deterministic: hashes stable ids, never the sim's RNG stream.
// ---------------------------------------------------------------------------

import type { Player } from '../types/player';
import type { Club } from '../types/club';
import type { NewsItem } from '../types/league';
import type { PlayerCareer, Conversation } from '../types/playerCareer';
import { hashSeed, clamp } from '../engine/rng';

let _seq = 0;
const feed = (day: number, category: NewsItem['category'], title: string, body: string): NewsItem =>
  ({ id: `news_pc_club_${day}_${_seq++}`, day, category, title, body, read: false });
const nameOf = (p: Player) => `${p.name.first} ${p.name.last}`;
const pick = <T>(arr: T[], key: string): T => arr[hashSeed(key) % arr.length];

// --- Relegation & promotion ---------------------------------------------------

export type DivisionMove = 'RELEGATED' | 'PROMOTED';

/**
 * The club goes down (or up), and it lands on his contract. Relegation triggers
 * a wage cut and a decision: stay loyal to a club in trouble, or get out.
 */
export function divisionMove(
  career: PlayerCareer, avatar: Player, club: Club | undefined, move: DivisionMove, day: number,
): { career: PlayerCareer; player: Player; news: NewsItem[]; moraleDelta: number; conversation: Conversation | null } {
  const name = club?.name ?? 'The club';
  if (move === 'PROMOTED') {
    return {
      career: {
        ...career,
        fanRating: clamp((career.fanRating ?? 50) + 8, 0, 100) as number,
        clubRelationship: clamp((career.clubRelationship ?? 50) + 6, 0, 100) as number,
      },
      player: avatar,
      news: [feed(day, 'MILESTONE', 'Promoted!',
        `${name} are going up, and ${nameOf(avatar)} was part of it. A summer of bigger fixtures, better opponents, and a chance to prove he belongs at the level.`)],
      moraleDelta: 10,
      conversation: null,
    };
  }
  // Relegation: a real wage cut, and a real decision.
  const cutWage = Math.round((avatar.contract.wage ?? 0) * 0.75);
  return {
    career: {
      ...career,
      relegationClause: { triggeredDay: day, oldWage: avatar.contract.wage ?? 0, newWage: cutWage },
      clubRelationship: clamp((career.clubRelationship ?? 50) - 4, 0, 100) as number,
    },
    player: { ...avatar, contract: { ...avatar.contract, wage: cutWage } },
    news: [feed(day, 'BOARD', 'Relegated — and the wage clause bites',
      `${name} are down. ${nameOf(avatar)}'s relegation clause has cut his wage by a quarter, and the phone will start ringing before the week is out.`)],
    moraleDelta: -12,
    conversation: {
      id: `conv_relegation_${day}`,
      trigger: 'RELEGATION',
      prompt: `${name} have gone down. Everyone with an agent is leaving. What do you do?`,
      choices: [
        { text: 'Stay. You help get them back up.', fanRating: 14, relationship: 12, morale: 3 },
        { text: 'Stay for now — but tell them you want out in January.', fanRating: -3, relationship: -6, morale: 1 },
        { text: 'Get out. This isn’t where your career ends.', fanRating: -16, relationship: -18, morale: 2 },
      ],
    },
  };
}

// --- Takeovers ------------------------------------------------------------------

export type OwnerKind = 'BILLIONAIRE' | 'ASSET_STRIPPER' | 'STEADY';

export interface OwnerState { kind: OwnerKind; since: number; name: string }

const OWNER_NAMES = ['a Gulf investment fund', 'an American consortium', 'a local millionaire', 'a private-equity group', 'a mysterious offshore trust'];

/**
 * A takeover changes everything about the place, for better or worse.
 * Deterministic per season.
 */
export function maybeTakeover(
  career: PlayerCareer, avatar: Player, club: Club | undefined, year: number, day: number, seed: number,
): { career: PlayerCareer; news: NewsItem[]; moraleDelta: number } {
  if (!club) return { career, news: [], moraleDelta: 0 };
  if ((hashSeed(`takeover_${seed}_${club.id}_${year}`) % 100) >= 8) return { career, news: [], moraleDelta: 0 };

  const roll = hashSeed(`ownerkind_${seed}_${club.id}_${year}`) % 100;
  const kind: OwnerKind = roll < 40 ? 'BILLIONAIRE' : roll < 65 ? 'ASSET_STRIPPER' : 'STEADY';
  const who = pick(OWNER_NAMES, `owner_${seed}_${club.id}_${year}`);

  const text: Record<OwnerKind, { title: string; body: string; morale: number }> = {
    BILLIONAIRE: {
      title: 'The club has been bought',
      body: `${club.name} have been taken over by ${who} with more money than sense. Everything is about to change — the squad, the wages, the expectations. ${nameOf(avatar)} may be about to find out whether he's part of the plan.`,
      morale: 6,
    },
    ASSET_STRIPPER: {
      title: 'A worrying takeover',
      body: `${who} have bought ${club.name}, and the supporters are already asking hard questions about where the money is coming from. Nobody at the training ground looks comfortable.`,
      morale: -7,
    },
    STEADY: {
      title: 'New ownership',
      body: `${club.name} have new owners in ${who}. Steady hands, by all accounts. No fireworks — just a promise to run the place properly.`,
      morale: 1,
    },
  };
  const t = text[kind];
  return {
    career: { ...career, owner: { kind, since: day, name: who } },
    news: [feed(day, 'BOARD', t.title, t.body)],
    moraleDelta: t.morale,
  };
}

// --- Financial crisis -------------------------------------------------------------

export interface CrisisState { since: number; wagesDeferred: boolean; severity: number }

/**
 * The money runs out. Wages get deferred, assets get sold, and the supporters
 * take to the streets — a protest he can join or stay out of.
 */
export function maybeCrisis(
  career: PlayerCareer, club: Club | undefined, day: number, seed: number,
): { career: PlayerCareer; news: NewsItem[]; moraleDelta: number; conversation: Conversation | null } {
  if (!club || career.crisis) return { career, news: [], moraleDelta: 0, conversation: null };
  // Asset-stripping owners cause them; so does simple financial trouble.
  const stripper = career.owner?.kind === 'ASSET_STRIPPER';
  const broke = (club.finances?.balance ?? 0) < 0;
  if (!stripper && !broke) return { career, news: [], moraleDelta: 0, conversation: null };
  if ((hashSeed(`crisis_${seed}_${day}`) % 100) >= (stripper ? 10 : 5)) {
    return { career, news: [], moraleDelta: 0, conversation: null };
  }
  return {
    career: { ...career, crisis: { since: day, wagesDeferred: true, severity: stripper ? 2 : 1 } },
    news: [feed(day, 'BOARD', 'The wages are late',
      `${club.name} have deferred this month's wages and quietly put the training ground up for sale. The supporters are organising a protest for the weekend.`)],
    moraleDelta: -8,
    conversation: {
      id: `conv_protest_${day}`,
      trigger: 'PROTEST',
      prompt: 'The supporters are protesting against the owners this weekend. Reporters want to know where you stand.',
      choices: [
        { text: 'Stand with the fans — say it publicly.', fanRating: 15, relationship: -14, following: 30_000, morale: 2 },
        { text: 'Stay out of it. You’re an employee.', fanRating: -6, relationship: 4 },
        { text: 'Back the club publicly.', fanRating: -12, relationship: 12, trust: 4 },
      ],
    },
  };
}

/** A crisis grinds on until the club is stabilised. */
export function crisisDrip(career: PlayerCareer, day: number): { career: PlayerCareer; news: NewsItem[]; moraleDelta: number } {
  const c = career.crisis;
  if (!c) return { career, news: [], moraleDelta: 0 };
  const weeks = Math.round((day - c.since) / 7);
  // It resolves eventually — someone always steps in, one way or another.
  if (weeks >= 20) {
    return {
      career: { ...career, crisis: null },
      news: [feed(day, 'BOARD', 'The club is stable again',
        'The back wages have been paid and the training ground is off the market. It was closer than anybody outside the building knows.')],
      moraleDelta: 5,
    };
  }
  return { career, news: [], moraleDelta: -1 };
}

// --- Shirt sales ---------------------------------------------------------------------

/**
 * His popularity is worth real money — and once he's shifting shirts, the club
 * knows exactly how much he's worth to them beyond the football.
 */
export function shirtSales(career: PlayerCareer, avatar: Player, day: number): { career: PlayerCareer; news: NewsItem[] } {
  const following = career.following ?? 0;
  const fame = following + (career.fanRating ?? 50) * 2000;
  if (fame < 300_000 || career.topShirtSeller) return { career, news: [] };
  return {
    career: { ...career, topShirtSeller: true },
    news: [feed(day, 'GENERAL', 'The best-selling shirt at the club',
      `More supporters walk out of the club shop with ${nameOf(avatar)}'s name on their back than anyone else's. The commercial department have noticed — and so, quietly, has the board.`)],
  };
}

// --- Cup runs & continental nights ------------------------------------------------------

export type BigNightKind = 'CUP_AWAY_DAY' | 'GIANT_KILLING' | 'CUP_FINAL' | 'EUROPEAN_NIGHT' | 'EUROPEAN_FINAL';

export interface BigNight { kind: BigNightKind; label: string; blurb: string; importance: number }

/**
 * Frame the occasions a league season can't provide: a filthy away day in the
 * lower leagues, a giant-killing, a final. Presentation + real stakes.
 */
export function classifyBigNight(
  competitionName: string | undefined, oppReputation: number, myReputation: number, isFinal: boolean,
): BigNight | null {
  if (!competitionName) return null;
  const european = /champions|europa|conference|continental|european/i.test(competitionName);
  const cup = /cup|trophy|shield/i.test(competitionName);
  if (!european && !cup) return null;

  if (isFinal) {
    return european
      ? { kind: 'EUROPEAN_FINAL', label: `${competitionName} Final`, blurb: 'One night. Everything you have worked for, in ninety minutes.', importance: 1 }
      : { kind: 'CUP_FINAL', label: `${competitionName} Final`, blurb: 'A final. Whatever else happens in this career, they can never take this day away.', importance: 0.95 };
  }
  if (european) {
    return { kind: 'EUROPEAN_NIGHT', label: `${competitionName} — under the lights`, blurb: 'A European night. Different noise, different pressure, a different kind of football.', importance: 0.85 };
  }
  // Domestic cup: is it a trip to a much smaller club, or a shot at a giant?
  if (oppReputation <= myReputation - 15) {
    return { kind: 'CUP_AWAY_DAY', label: 'A cup away day', blurb: 'Four thousand people, a pitch like a ploughed field, and absolutely nothing to gain. Lose here and you will never hear the end of it.', importance: 0.6 };
  }
  if (oppReputation >= myReputation + 15) {
    return { kind: 'GIANT_KILLING', label: 'A shot at a giant', blurb: 'Nobody expects a thing. That is exactly what makes it dangerous for them.', importance: 0.8 };
  }
  return null;
}

/** Losing a cup tie to a much smaller club is a humiliation that follows you. */
export function giantKillingShame(avatar: Player, oppName: string, day: number): NewsItem {
  return feed(day, 'RESULT', 'Humiliated',
    `Out of the cup, to ${oppName}. ${nameOf(avatar)} and his teammates will be reminded of this for years, by everyone, forever.`);
}

/** A cup final won is a landmark, whatever else the career holds. */
export function finalNews(avatar: Player, competition: string, won: boolean, day: number): NewsItem {
  return won
    ? feed(day, 'MILESTONE', `${competition} winner`,
      `${nameOf(avatar)} has a winner's medal. Whatever comes next, this is a day that belongs to him.`)
    : feed(day, 'RESULT', `Beaten in the ${competition} final`,
      `So close. ${nameOf(avatar)} collected a runners-up medal and took it off before he reached the tunnel.`);
}
