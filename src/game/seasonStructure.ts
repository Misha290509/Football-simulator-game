// ---------------------------------------------------------------------------
// Player Career — season structure (§ The shape of a year). A season is not a
// flat list of forty fixtures. It has a shape, and a footballer feels it:
//
//   • Pre-season — a commercial tour on the other side of the world, or a
//     brutal fortnight in the mountains, or staying behind to get fit.
//   • The Christmas pile-up — four games in eleven days, in the cold, with no
//     recovery, in the leagues that don't stop. Others get a winter break.
//   • The run-in — the last two months, when the table stops being a curiosity
//     and starts being the only thing anyone can talk about.
//
// Everything here is a pure function of the calendar and the table. No RNG
// stream is touched; the tour is hash-seeded off the club and year.
// ---------------------------------------------------------------------------

import type { Player } from '../types/player';
import type { Club } from '../types/club';
import type { Match } from '../types/match';
import type { NewsItem, StandingRow } from '../types/league';
import type { Conversation } from '../types/playerCareer';
import { hashSeed, clamp } from '../engine/rng';

let _seq = 0;
const feed = (day: number, category: NewsItem['category'], title: string, body: string): NewsItem =>
  ({ id: `news_pc_season_${day}_${_seq++}`, day, category, title, body, read: false });
const nameOf = (p: Player) => `${p.name.first} ${p.name.last}`;

// --- The shape of the year ------------------------------------------------------

export type SeasonPhase = 'PRESEASON' | 'EARLY' | 'AUTUMN' | 'CHRISTMAS' | 'WINTER_BREAK' | 'SPRING' | 'RUN_IN';

export interface PhaseInfo {
  phase: SeasonPhase;
  label: string;
  blurb: string;
}

/** Leagues that play straight through the festive period rather than stopping. */
const NO_WINTER_BREAK = new Set(['eng', 'sco', 'wal', 'nir', 'ire']);

/**
 * Where in the year we are, as a fraction of the league season. The Christmas
 * window is the same slice of the calendar either way — what differs is whether
 * the country plays through it.
 */
export function seasonPhase(day: number, maxDay: number, countryId?: string): PhaseInfo {
  if (maxDay <= 0) return { phase: 'PRESEASON', label: 'Pre-season', blurb: 'The season has not started yet.' };
  const t = day / maxDay;
  if (t < 0.02) return { phase: 'PRESEASON', label: 'Pre-season', blurb: 'Friendlies, fitness work, and everybody still thinks this is their year.' };
  if (t < 0.18) return { phase: 'EARLY', label: 'Early season', blurb: 'Nobody wins anything in August, but you can certainly lose your place.' };
  if (t < 0.38) return { phase: 'AUTUMN', label: 'Autumn', blurb: 'The table starts to mean something. So does the treatment room.' };
  if (t < 0.48) {
    const plays = !countryId || NO_WINTER_BREAK.has(countryId);
    return plays
      ? { phase: 'CHRISTMAS', label: 'The Christmas pile-up', blurb: 'Four games in eleven days, frozen pitches, no recovery. This is where seasons are won and hamstrings are lost.' }
      : { phase: 'WINTER_BREAK', label: 'Winter break', blurb: 'The league stops. Legs recover, minds clear, and the second half of the season starts fresh.' };
  }
  if (t < 0.78) return { phase: 'SPRING', label: 'Spring', blurb: 'The business end approaches. Everything from here is worth double.' };
  return { phase: 'RUN_IN', label: 'The run-in', blurb: 'Ten games left. Nobody talks about anything else.' };
}

/** Extra physical cost of the phase — multiplies the usual fatigue drain. */
export function phaseFatigueFactor(phase: SeasonPhase): number {
  switch (phase) {
    case 'CHRISTMAS': return 1.45;
    case 'WINTER_BREAK': return 0.55;
    case 'RUN_IN': return 1.15;
    case 'PRESEASON': return 0.8;
    default: return 1;
  }
}

/** Extra injury risk multiplier for the phase. */
export function phaseInjuryFactor(phase: SeasonPhase): number {
  return phase === 'CHRISTMAS' ? 1.5 : phase === 'WINTER_BREAK' ? 0.6 : 1;
}

// --- Fixture congestion -------------------------------------------------------------

export interface Congestion {
  /** Matches for this club in the next fortnight. */
  count: number;
  /** 0–1: how brutal the schedule is right now. */
  severity: number;
  note?: string;
}

/** How many games are coming, and how quickly. Drives rotation and tiredness. */
export function congestion(matches: Match[], clubId: string, day: number): Congestion {
  const window = matches.filter((m) =>
    !m.played && m.day >= day && m.day < day + 14 && (m.homeClubId === clubId || m.awayClubId === clubId));
  const count = window.length;
  const severity = clamp((count - 2) / 3, 0, 1);
  const note = count >= 5 ? 'Five games in a fortnight. Something has to give.'
    : count === 4 ? 'Four games in two weeks — the squad will be shuffled.'
    : count <= 1 ? 'A quiet couple of weeks. A chance to get properly fit.'
    : undefined;
  return { count, severity, note };
}

// --- Pre-season tours ---------------------------------------------------------------

export type TourKind = 'ASIA' | 'USA' | 'GULF' | 'MOUNTAIN_CAMP' | 'HOME';

export interface PreSeasonTour {
  kind: TourKind;
  year: number;
  destination: string;
  /** Sharpness/fitness effect at the end of pre-season. */
  fitness: number;
  /** Social following the trip generates. */
  following: number;
  /** Trust the manager takes from how he handled it. */
  trust: number;
}

const TOURS: Record<Exclude<TourKind, 'HOME'>, { where: string[]; fitness: number; following: number; blurb: string }> = {
  ASIA: {
    where: ['Tokyo', 'Seoul', 'Singapore', 'Jakarta', 'Bangkok'],
    fitness: -6, following: 90_000,
    blurb: 'Eleven time zones, three friendlies, a sponsor event every morning and about four hours of actual football coaching.',
  },
  USA: {
    where: ['Los Angeles', 'New York', 'Miami', 'Chicago', 'Dallas'],
    fitness: -4, following: 70_000,
    blurb: 'Enormous stadiums two-thirds empty, brutal humidity, and a commercial department that could not be happier.',
  },
  GULF: {
    where: ['Dubai', 'Doha', 'Riyadh', 'Abu Dhabi'],
    fitness: -2, following: 55_000,
    blurb: 'Perfect pitches, forty degrees, and training moved to eleven at night.',
  },
  MOUNTAIN_CAMP: {
    where: ['the Austrian Alps', 'the Bavarian foothills', 'a Swiss altitude camp', 'a Pyrenean training base'],
    fitness: 10, following: 3_000,
    blurb: 'No sponsors, no cameras, no mercy. Two sessions a day and a hill that everybody will remember in April.',
  },
};

/**
 * Where the club goes in July — the big names chase the money, everybody else
 * goes somewhere cold and runs up a mountain.
 */
export function preSeasonTour(
  avatar: Player, club: Club | undefined, year: number, seed: number,
): { tour: PreSeasonTour; news: NewsItem[]; conversation: Conversation | null } {
  const rep = club?.reputation ?? 60;
  const roll = hashSeed(`tour_${seed}_${club?.id ?? 'none'}_${year}`) % 100;
  const kind: Exclude<TourKind, 'HOME'> = rep >= 78
    ? (roll < 45 ? 'ASIA' : roll < 75 ? 'USA' : roll < 88 ? 'GULF' : 'MOUNTAIN_CAMP')
    : rep >= 62
    ? (roll < 25 ? 'USA' : roll < 40 ? 'GULF' : 'MOUNTAIN_CAMP')
    : 'MOUNTAIN_CAMP';
  const cfg = TOURS[kind];
  const destination = cfg.where[hashSeed(`tourwhere_${seed}_${club?.id ?? 'none'}_${year}`) % cfg.where.length];

  const tour: PreSeasonTour = { kind, year, destination, fitness: cfg.fitness, following: cfg.following, trust: 0 };
  const commercial = kind !== 'MOUNTAIN_CAMP';
  return {
    tour,
    news: [feed(0, 'GENERAL', `Pre-season: ${destination}`,
      `${club?.name ?? 'The club'} head to ${destination}. ${cfg.blurb} ${nameOf(avatar)} is on the plane.`)],
    // The tour is the first thing a new season asks of him, and he gets a say.
    conversation: {
      id: `conv_tour_${year}`,
      trigger: 'PRESEASON_TOUR',
      prompt: commercial
        ? `The tour of ${destination} is as much a commercial exercise as a football one. How do you approach it?`
        : `A fortnight at ${destination}. No cameras, just work. How do you approach it?`,
      choices: commercial ? [
        { text: 'Do every appearance with a smile. It all counts.', following: cfg.following, fanRating: 5, trust: 3 },
        { text: 'Football first — train hard, skip what you can.', trust: 8, morale: -2, following: Math.round(cfg.following * 0.2) },
        { text: 'Treat it as a holiday. Nobody remembers July.', trust: -12, morale: 5, following: Math.round(cfg.following * 0.5) },
      ] : [
        { text: 'Lead from the front on every run.', trust: 10, standing: 6, morale: -3 },
        { text: 'Do exactly what is asked, nothing more.', trust: 2 },
        { text: 'Coast. Save yourself for the games that matter.', trust: -10, morale: 4 },
      ],
    },
  };
}

/** The physical payoff (or price) of pre-season, applied when the season opens. */
export function applyTour(avatar: Player, tour: PreSeasonTour): Player {
  return { ...avatar, fitness: clamp((avatar.fitness ?? 100) + tour.fitness, 40, 100) };
}

// --- The run-in ------------------------------------------------------------------------

export type RaceKind = 'TITLE' | 'EUROPE' | 'PROMOTION' | 'SURVIVAL' | 'NOTHING';

export interface RaceContext {
  kind: RaceKind;
  position: number;
  gamesLeft: number;
  /** Points between the club and the thing it is chasing (or running from). */
  gap: number;
  label: string;
  blurb: string;
  /** How much this raises the stakes of every remaining fixture (0–1). */
  importance: number;
}

/**
 * What the club is actually playing for in the closing weeks — and how close it
 * is. A four-point gap with six to play is a different season from a
 * twenty-point gap with six to play, and the match screen should say so.
 */
export function raceContext(
  rows: StandingRow[], clubId: string, gamesLeft: number, opts: { promotionPlaces?: number; europePlaces?: number; relegationPlaces?: number; tier?: number } = {},
): RaceContext | null {
  if (rows.length === 0 || gamesLeft <= 0 || gamesLeft > 10) return null;
  const idx = rows.findIndex((r) => r.clubId === clubId);
  if (idx < 0) return null;
  const position = idx + 1;
  const me = rows[idx];
  const europePlaces = opts.europePlaces ?? 4;
  const relegationPlaces = opts.relegationPlaces ?? 3;
  const promotionPlaces = opts.promotionPlaces ?? 2;
  const secondTier = (opts.tier ?? 1) > 1;
  const maxSwing = gamesLeft * 3;

  const gapTo = (i: number) => Math.abs((rows[i]?.points ?? me.points) - me.points);

  // Title / promotion first: is the top (or the promotion cut) still reachable?
  const topGap = gapTo(0);
  if (position === 1 || topGap <= maxSwing) {
    if (secondTier) {
      if (position <= promotionPlaces || topGap <= maxSwing) {
        return {
          kind: 'PROMOTION', position, gamesLeft, gap: topGap,
          label: position <= promotionPlaces ? 'Going up — if they hold on' : 'Chasing promotion',
          blurb: `${gamesLeft} to play and ${topGap === 0 ? 'level at the top' : `${topGap} point${topGap === 1 ? '' : 's'} in it`}. Promotion changes everything about this club, and about him.`,
          importance: clamp(0.72 + (maxSwing - topGap) / (maxSwing * 5), 0.72, 0.95),
        };
      }
    } else {
      return {
        kind: 'TITLE', position, gamesLeft, gap: topGap,
        label: position === 1 ? 'Top of the league' : 'In the title race',
        blurb: `${gamesLeft} games left and ${topGap === 0 ? 'nothing between them' : `${topGap} point${topGap === 1 ? '' : 's'} in it`}. He will not sleep properly again until May.`,
        importance: clamp(0.8 + (maxSwing - topGap) / (maxSwing * 4), 0.8, 1),
      };
    }
  }

  // Survival: is the drop still mathematically live?
  const dropIdx = rows.length - relegationPlaces;
  if (dropIdx > 0) {
    const dropGap = Math.abs((rows[dropIdx]?.points ?? me.points) - me.points);
    const inTrouble = position > dropIdx;
    if (inTrouble || dropGap <= maxSwing) {
      return {
        kind: 'SURVIVAL', position, gamesLeft, gap: dropGap,
        label: inTrouble ? 'In the relegation zone' : 'Fighting to stay up',
        blurb: inTrouble
          ? `${position}th with ${gamesLeft} to play, ${dropGap} point${dropGap === 1 ? '' : 's'} from safety. Careers get rewritten in weeks like these.`
          : `Only ${dropGap} point${dropGap === 1 ? '' : 's'} above the drop with ${gamesLeft} left. Nobody at the training ground is pretending otherwise.`,
        importance: clamp(0.78 + (maxSwing - dropGap) / (maxSwing * 4), 0.78, 1),
      };
    }
  }

  // Europe: the quiet, unglamorous, financially enormous race.
  if (!secondTier) {
    const euroGap = Math.abs((rows[europePlaces - 1]?.points ?? me.points) - me.points);
    if (Math.abs(position - europePlaces) <= 4 && euroGap <= maxSwing) {
      return {
        kind: 'EUROPE', position, gamesLeft, gap: euroGap,
        label: position <= europePlaces ? 'Holding a European place' : 'Chasing Europe',
        blurb: `${euroGap} point${euroGap === 1 ? '' : 's'} decides whether there are Thursday nights or Tuesday nights next season — and whether the good players stay.`,
        importance: 0.7,
      };
    }
  }

  return { kind: 'NOTHING', position, gamesLeft, gap: 0, label: 'Playing for pride', blurb: 'Nothing left to win, nothing left to lose. A good time to remember why he started.', importance: 0.4 };
}

/** A one-off beat when the run-in begins and there is something real at stake. */
export function runInNews(race: RaceContext, club: Club | undefined, day: number): NewsItem | null {
  if (race.kind === 'NOTHING') return null;
  return feed(day, 'GENERAL', `${club?.name ?? 'The club'}: ${race.label}`, race.blurb);
}

// --- Calendar ----------------------------------------------------------------------------

export interface CalendarEntry {
  day: number;
  opponent: string;
  home: boolean;
  competition: string;
  played: boolean;
  score?: string;
  phase: SeasonPhase;
}

/** The avatar's season, laid out fixture by fixture with the shape of the year. */
export function buildCalendar(
  matches: Match[], clubId: string, clubNames: Record<string, string>, compNames: Record<string, string>,
  maxDay: number, countryId?: string,
): CalendarEntry[] {
  return matches
    .filter((m) => m.homeClubId === clubId || m.awayClubId === clubId)
    .sort((a, b) => a.day - b.day || a.id.localeCompare(b.id))
    .map((m) => {
      const home = m.homeClubId === clubId;
      const oppId = home ? m.awayClubId : m.homeClubId;
      return {
        day: m.day,
        opponent: clubNames[oppId] ?? 'Opposition',
        home,
        competition: compNames[m.competitionId] ?? 'League',
        played: m.played,
        score: m.played ? `${m.homeGoals}–${m.awayGoals}` : undefined,
        phase: seasonPhase(m.day, maxDay, countryId).phase,
      };
    });
}
