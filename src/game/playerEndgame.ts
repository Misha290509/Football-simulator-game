// ---------------------------------------------------------------------------
// Player Career — endgame engine (Tier 5, steps 3–4, 6). Pure & deterministic.
// The twilight paths (surfaced as Tier-4 contract offers with a late-career
// flavour), the retirement decision + farewell season, the send-off
// (testimonial, shirt retirement, club-legend recording, Hall of Fame), and the
// player→manager transition seeding. Reuses Tier-4's ContractOffer + executor,
// the world's Hall of Fame + club history, and the manager career helpers.
//
// GOVERNING RULE: decline is poignant, not punishing. Every late path is a
// meaningful next chapter; retirement is always the player's choice when it's
// available, and even forced endings get a dignified farewell.
// ---------------------------------------------------------------------------

import type { Player } from '../types/player';
import type { Club } from '../types/club';
import type { NewsItem, HallOfFameEntry } from '../types/league';
import type { PlayerCareer } from '../types/playerCareer';
import type { ContractOffer } from '../types/playerOffPitch';
import type { LateCareerKind, LegacyState } from '../types/playerLegacy';
import { Rng, hashSeed } from '../engine/rng';
import { marketWage } from '../engine/finances';
import { statusRank } from './playerProgression';
import { careerTotals, computeLegacy, HALL_OF_FAME_BAR, legendClubs } from './playerLegacy';

const nameOf = (p: Player) => `${p.name.first} ${p.name.last}`;
let _seq = 0;
const feed = (day: number, category: NewsItem['category'], title: string, body: string): NewsItem =>
  ({ id: `news_pc_end_${day}_${_seq++}`, day, category, title, body, read: false });

// --- Late-career paths (twilight offers via the agent) ----------------------

const LATE_LABEL: Record<LateCareerKind, string> = {
  TWILIGHT_ABROAD: 'Twilight move abroad',
  HOMECOMING: 'Homecoming',
  DROP_DOWN: 'Drop down for game time',
  THE_CHASE: 'One last trophy',
  ONE_CLUB: 'One-club legend',
};

/** Tag a contract offer with its late-career flavour (stored in the note). */
export function lateKindOf(offer: ContractOffer): LateCareerKind | null {
  const m = /^\[(TWILIGHT_ABROAD|HOMECOMING|DROP_DOWN|THE_CHASE|ONE_CLUB)\]/.exec(offer.note ?? '');
  return m ? (m[1] as LateCareerKind) : null;
}
export function lateLabel(kind: LateCareerKind): string { return LATE_LABEL[kind]; }

/**
 * Generate distinct twilight offers for a high-reputation veteran (~31+). Each
 * is a real, viable route — a lucrative Saudi/MLS move, a homecoming, a drop
 * down for a hero role, or a title chase at a contender. Deterministic; surfaces
 * at most one fresh route at a time so it never becomes a menu.
 */
export function lateCareerOffers(
  career: PlayerCareer, avatar: Player, clubs: Record<string, Club>, year: number, day: number, seed: number,
): { offers: ContractOffer[]; news: NewsItem[] } {
  const age = year - avatar.born.year;
  const news: NewsItem[] = [];
  if (age < 31 || career.retirement?.retiredDay != null) return { offers: [], news };
  // Don't stack late offers on top of live ones.
  if ((career.contractOffers ?? []).some((o) => lateKindOf(o))) return { offers: [], news };

  const rng = new Rng((seed ^ hashSeed(`late_${day}`)) >>> 0);
  if (!rng.chance(0.32)) return { offers: [], news };

  const parent = clubs[avatar.contract.clubId ?? ''];
  const parentRep = parent?.reputation ?? 60;
  const rep = avatar.overall; // reputation proxy
  const wage = Math.max(marketWage(avatar.overall), avatar.contract.wage);

  // Pick a route that fits the player's standing.
  const routes: LateCareerKind[] = [];
  if (rep >= 76) routes.push('TWILIGHT_ABROAD');
  routes.push('HOMECOMING');
  if (statusRank(career.status) <= statusRank('ROTATION') || age >= 34) routes.push('DROP_DOWN');
  if (rep >= 74) routes.push('THE_CHASE');
  const kind = routes[rng.int(0, routes.length - 1)];

  const all = Object.values(clubs).filter((c) => c.id !== avatar.contract.clubId);
  let target: Club | undefined; let wageMult = 1; let role: ContractOffer['rolePromise'] = 'KEY';
  switch (kind) {
    case 'TWILIGHT_ABROAD': {
      // Big wages, lower intensity — a rich club a rung or two below elite Europe.
      const abroad = all.filter((c) => c.countryId !== parent?.countryId && c.reputation >= 58 && c.reputation <= parentRep + 4)
        .sort((a, b) => b.finances.wageBudget - a.finances.wageBudget);
      target = abroad[rng.int(0, Math.min(4, Math.max(0, abroad.length - 1)))];
      wageMult = 1.8; role = 'STAR';
      break;
    }
    case 'HOMECOMING': {
      const home = all.filter((c) => c.countryId === avatar.nationality);
      const boyhood = career.seasonHistory[0]?.club;
      target = home.find((c) => c.name === boyhood) ?? home.sort((a, b) => Math.abs(a.reputation - rep) - Math.abs(b.reputation - rep))[0];
      wageMult = 0.85;
      break;
    }
    case 'DROP_DOWN': {
      const lower = all.filter((c) => c.reputation >= parentRep - 28 && c.reputation <= parentRep - 8)
        .sort((a, b) => b.reputation - a.reputation);
      target = lower[rng.int(0, Math.min(5, Math.max(0, lower.length - 1)))];
      wageMult = 0.7; role = 'STAR';
      break;
    }
    case 'THE_CHASE': {
      // A genuine contender missing from the cabinet — a top-reputation club.
      const contenders = all.filter((c) => c.reputation >= Math.max(80, parentRep)).sort((a, b) => b.reputation - a.reputation);
      target = contenders[rng.int(0, Math.min(3, Math.max(0, contenders.length - 1)))];
      wageMult = 1.1; role = 'ROTATION';
      break;
    }
    default: break;
  }
  if (!target) return { offers: [], news };

  const offer: ContractOffer = {
    id: `late_${kind}_${target.id}_${day}`,
    clubId: target.id, kind: 'TRANSFER',
    wage: Math.round((wage * wageMult) / 100) * 100,
    length: kind === 'TWILIGHT_ABROAD' ? 2 : kind === 'DROP_DOWN' ? 2 : 3,
    signingBonus: Math.round(wage * wageMult * 4),
    goalBonus: Math.round(wage * 0.04),
    releaseClause: null,
    rolePromise: role,
    deadline: day + 21,
    fee: 0, // free/nominal late-career move
    note: `[${kind}] ${flavour(kind, target)}`,
  };
  news.push(feed(day, 'TRANSFER', `${lateLabel(kind)}: ${target.shortName}`, `${flavour(kind, target)} (Check your offers.)`));
  return { offers: [offer], news };
}

function flavour(kind: LateCareerKind, club: Club): string {
  switch (kind) {
    case 'TWILIGHT_ABROAD': return `${club.name} offer a lucrative twilight contract — big wages, a new league to conquer, a softer week-to-week grind.`;
    case 'HOMECOMING': return `${club.name} want to bring you home for the final chapter.`;
    case 'DROP_DOWN': return `${club.name} offer regular football and a hero's role for your last act.`;
    case 'THE_CHASE': return `${club.name}, genuine contenders, want you for one last tilt at the trophy that's eluded you.`;
    default: return `${club.name} come calling.`;
  }
}

// --- Retirement decision ----------------------------------------------------

/** Is retirement available (the player may hang up his boots by choice)? */
export function retirementAvailable(career: PlayerCareer, avatar: Player, year: number): boolean {
  if (career.retirement?.retiredDay != null) return false;
  const age = year - avatar.born.year;
  return age >= 33 || (career.decline?.started === true && age >= 31);
}

/** Detect a *forced* retirement — career-ending injury or genuinely no club —
 *  still to be delivered as a dignified arc, never an abrupt cutoff. */
export function forcedRetirement(
  career: PlayerCareer, avatar: Player, year: number,
): { forced: boolean; reason?: 'INJURY' | 'NO_CLUB' } {
  if (career.retirement?.retiredDay != null) return { forced: false };
  const age = year - avatar.born.year;
  // Career-ending injury: a severe injury at an advanced age.
  if (avatar.injury && (avatar.injury.weeksOut ?? 0) >= 30 && age >= 34) return { forced: true, reason: 'INJURY' };
  // No club will sign a steeply-declined free agent.
  if (!avatar.contract.clubId && age >= 35 && avatar.overall < 64) return { forced: true, reason: 'NO_CLUB' };
  return { forced: false };
}

// --- Send-off: testimonial, shirt retirement, Hall of Fame ------------------

/** A deterministic shirt number for the avatar (used for shirt retirement). */
function shirtNumber(avatar: Player): number {
  return (Math.abs(hashSeed(`shirt_${avatar.id}`)) % 26) + 1;
}

export interface SendOff {
  career: PlayerCareer;
  news: NewsItem[];
  hallOfFameAdd?: HallOfFameEntry;
  clubHistory: { clubId: string; entry: string }[];
}

/**
 * Assemble the send-off at retirement: record club-legend status + shirt
 * retirements at legend clubs (persisted in club history), and induct into the
 * Hall of Fame if the legacy clears the bar. Pure; the store applies the world
 * changes. `legacy` should already be freshly computed for retirement.
 */
export function buildSendOff(
  career: PlayerCareer, avatar: Player, clubs: Record<string, Club>,
  year: number, day: number, legacy: LegacyState,
): SendOff {
  const news: NewsItem[] = [];
  const clubHistory: { clubId: string; entry: string }[] = [];
  const legends = legendClubs(career, clubs);
  const num = shirtNumber(avatar);

  const shirtRetiredAt: { clubId: number }[] = [];
  const shirts: { clubId: string; number: number }[] = [];
  for (const clubId of legends) {
    const club = clubs[clubId];
    if (!club) continue;
    clubHistory.push({ clubId, entry: `${nameOf(avatar)} — club legend (retired ${year}).` });
    // Elite legends (big legacy) get the number retired too.
    if (legacy.score >= HALL_OF_FAME_BAR * 0.85) {
      shirts.push({ clubId, number: num });
      clubHistory.push({ clubId, entry: `The No.${num} shirt is retired in honour of ${nameOf(avatar)}.` });
      news.push(feed(day, 'MILESTONE', `${club.shortName} retire the No.${num}`, `${club.name} will never issue the No.${num} again — a permanent tribute to ${nameOf(avatar)}.`));
    } else {
      news.push(feed(day, 'MILESTONE', `${club.shortName} salute a legend`, `${nameOf(avatar)} takes his place in ${club.name}'s history books.`));
    }
  }
  void shirtRetiredAt;

  const hof = legacy.score >= HALL_OF_FAME_BAR;
  let hallOfFameAdd: HallOfFameEntry | undefined;
  if (hof) {
    const t = careerTotals(career, avatar, avatar.born.year);
    hallOfFameAdd = {
      playerId: avatar.id,
      name: nameOf(avatar),
      nationality: avatar.nationality,
      peakOvr: t.peakOvr,
      inductedYear: year,
      lastClubName: clubs[avatar.contract.clubId ?? '']?.name ?? career.seasonHistory[career.seasonHistory.length - 1]?.club ?? '',
      awardCount: t.individualAwards,
    };
    news.push(feed(day, 'AWARD', `Hall of Fame: ${nameOf(avatar)} inducted`, `A career for the ages is enshrined among the greats.`));
  }

  const nextCareer: PlayerCareer = {
    ...career,
    legacy: { ...legacy, hallOfFame: hof, hofInductionSeason: hof ? year : undefined },
    retirement: {
      ...(career.retirement ?? { announced: false, forced: false }),
      shirtRetiredAt: shirts,
    },
  };
  return { career: nextCareer, news, hallOfFameAdd, clubHistory };
}

/** Build a celebratory testimonial fixture for a club legend (a real Match the
 *  sim can play). Returns the match + a news item, or null if no legend club. */
export function buildTestimonial(
  career: PlayerCareer, avatar: Player, clubs: Record<string, Club>, seasonId: string, day: number,
): { match: import('../types/match').Match; news: NewsItem } | null {
  const legendId = legendClubs(career, clubs)[0] ?? avatar.contract.clubId ?? undefined;
  const club = legendId ? clubs[legendId] : undefined;
  if (!club) return null;
  // An exhibition vs a friendly opponent — pick another club deterministically.
  const others = Object.values(clubs).filter((c) => c.id !== club.id).sort((a, b) => b.reputation - a.reputation);
  const opp = others[Math.abs(hashSeed(`test_${avatar.id}`)) % Math.max(1, Math.min(10, others.length))];
  if (!opp) return null;
  const match: import('../types/match').Match = {
    id: `testimonial_${avatar.id}`,
    competitionId: 'FRIENDLY',
    seasonId,
    round: 0,
    day,
    homeClubId: club.id,
    awayClubId: opp.id,
    neutral: true,
    played: false,
    homeGoals: 0,
    awayGoals: 0,
    homeXg: 0,
    awayXg: 0,
    events: [],
    playerStats: [],
    seed: (hashSeed(`testimonial_${avatar.id}`)) >>> 0,
  };
  const news = feed(day, 'MILESTONE', `${nameOf(avatar)}'s testimonial`, `A packed ${club.name} turns out to salute a one-club great against ${opp.shortName}.`);
  return { match, news };
}

// --- Player → Manager transition seeding ------------------------------------

/**
 * Where an ex-player starts his managerial career, from his legacy. A decorated
 * legend is courted by a big club (or offered his former club); a journeyman
 * starts lower or at a former club. Returns the hiring club + a seeded rep.
 */
export function managerStartClub(
  career: PlayerCareer, clubs: Record<string, Club>, repSeed: number,
): { club: Club; reason: string } | null {
  const former = career.seasonHistory.map((s) => s.club);
  const formerClubs = Object.values(clubs).filter((c) => former.includes(c.name));
  const legendClubIds = new Set(career.legacy?.legendAtClubs ?? []);

  // A legend: a former legend-club offers the job, or a big club takes a punt.
  const legendClub = formerClubs.find((c) => legendClubIds.has(c.id));
  if (legendClub && repSeed >= 50) return { club: legendClub, reason: `${legendClub.name}, where you are a legend, hand you the reins.` };

  // Otherwise pick a club near the manager's seeded level.
  const targetRep = 30 + repSeed * 0.7; // rep 20→44, 78→85
  const pool = Object.values(clubs).filter((c) => Math.abs(c.reputation - targetRep) <= 12);
  // Prefer a former club if one fits — a homecoming into the dugout.
  const formerFit = formerClubs.filter((c) => Math.abs(c.reputation - targetRep) <= 15).sort((a, b) => Math.abs(a.reputation - targetRep) - Math.abs(b.reputation - targetRep))[0];
  if (formerFit) return { club: formerFit, reason: `${formerFit.name}, one of your old clubs, give you your first job in management.` };
  const pick = pool.sort((a, b) => Math.abs(a.reputation - targetRep) - Math.abs(b.reputation - targetRep))[0];
  if (pick) return { club: pick, reason: `${pick.name} appoint you as their new manager.` };
  return null;
}

// Re-export for the store's convenience.
export { computeLegacy };
