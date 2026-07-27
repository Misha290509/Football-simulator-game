// ---------------------------------------------------------------------------
// Player Career — the endgame and after (§ What's left when it stops). The
// hardest part of a footballer's life is the part after football, and a career
// mode that ends at the final whistle throws away its best material.
//
//   • An epilogue you actually play: punditry, an ambassador's role, coaching
//     the academy, the dugout, or walking away entirely. Each year brings its
//     own beats, its own money, and its own regrets.
//   • Your kid — born somewhere in the middle of the career, signed by an
//     academy while you were still playing, and eventually judged against you.
//   • A statue outside the ground, which is the strangest honour in sport.
//   • The Hall of Fame, and the man who inducts you.
//
// Pure & deterministic: hashes stable ids, never the sim's RNG stream.
// ---------------------------------------------------------------------------

import type { Player } from '../types/player';
import type { Club } from '../types/club';
import type { NewsItem } from '../types/league';
import type { PlayerCareer } from '../types/playerCareer';
import { hashSeed, clamp } from '../engine/rng';
import { FIRST_NAMES } from '../data/names';

let _seq = 0;
const feed = (day: number, category: NewsItem['category'], title: string, body: string): NewsItem =>
  ({ id: `news_pc_after_${day}_${_seq++}`, day, category, title, body, read: false });
const nameOf = (p: Player) => `${p.name.first} ${p.name.last}`;

// --- The paths ------------------------------------------------------------------

export type EpiloguePath = 'PUNDITRY' | 'AMBASSADOR' | 'ACADEMY' | 'MANAGEMENT' | 'AWAY';

export interface PathInfo {
  id: EpiloguePath;
  label: string;
  blurb: string;
  /** Rough annual income from the role. */
  income: number;
  /** What it does to how the public remembers him, per year. */
  fame: number;
  /** Whether it keeps him inside the game. */
  inGame: boolean;
}

export const EPILOGUE_PATHS: PathInfo[] = [
  {
    id: 'PUNDITRY', label: 'The panel', income: 450_000, fame: 4, inGame: false,
    blurb: 'Saturday afternoons in a studio, being asked what the manager should have done. The money is good, the work is easy, and after a while you notice you have not been inside a dressing room in three years.',
  },
  {
    id: 'AMBASSADOR', label: 'Club ambassador', income: 180_000, fame: 2, inGame: false,
    blurb: 'Sponsor lunches, hospitality boxes, a hand to shake before every home game. The club looks after you, and you never have to leave.',
  },
  {
    id: 'ACADEMY', label: 'The academy', income: 90_000, fame: -1, inGame: true,
    blurb: 'Cold Tuesday mornings on a training ground with sixteen-year-olds who have never heard of you. Nobody watches. Every so often, one of them becomes somebody.',
  },
  {
    id: 'MANAGEMENT', label: 'The dugout', income: 900_000, fame: 6, inGame: true,
    blurb: 'The only job in football harder than playing it. It will take years off your life and you will not be able to stop.',
  },
  {
    id: 'AWAY', label: 'Walk away', income: 0, fame: -4, inGame: false,
    blurb: 'No cameras, no badges, no Saturday. Some of the happiest ex-footballers alive are the ones nobody hears from again.',
  },
];

export const PATH_BY_ID: Record<EpiloguePath, PathInfo> =
  Object.fromEntries(EPILOGUE_PATHS.map((p) => [p.id, p])) as Record<EpiloguePath, PathInfo>;

/** Which paths are actually open to him, given what he did as a player. */
export function availablePaths(career: PlayerCareer): EpiloguePath[] {
  const caps = career.international?.caps ?? 0;
  const fame = (career.following ?? 0) + (career.fanRating ?? 50) * 2000;
  const legendClubs = career.legacy?.legendAtClubs?.length ?? 0;
  const out: EpiloguePath[] = ['AWAY', 'MANAGEMENT'];
  // Television wants a name people recognise.
  if (fame >= 200_000 || caps >= 20) out.unshift('PUNDITRY');
  // An ambassador's role is only offered where they actually love you.
  if (legendClubs > 0) out.unshift('AMBASSADOR');
  // Anybody can coach kids, and that is rather the point.
  out.push('ACADEMY');
  return out;
}

export interface EpilogueState {
  path: EpiloguePath;
  since: number; // year
  years: number;
  earned: number;
  /** Beats already fired, so each lands once. */
  seen: string[];
}

/** A year of the life after. Each path has its own texture. */
export function epilogueYear(
  state: EpilogueState, avatar: Player, year: number, seed: number,
): { state: EpilogueState; news: NewsItem[] } {
  const info = PATH_BY_ID[state.path];
  const n = state.years + 1;
  const who = nameOf(avatar);
  const news: NewsItem[] = [];
  const seen = [...state.seen];

  const once = (key: string, item: NewsItem) => {
    if (seen.includes(key)) return;
    seen.push(key);
    news.push(item);
  };

  switch (state.path) {
    case 'PUNDITRY':
      if (n === 1) once('pundit_start', feed(0, 'GENERAL', `${who} joins the panel`,
        'The contract is signed, the suit is new, and the first time the red light comes on he finds it harder than any match he ever played.'));
      if (n === 3) once('pundit_edge', feed(0, 'GENERAL', 'He has found his voice',
        `${who} has stopped being careful. He said this week that a manager he played under "never had a plan in his life", and the clip has been everywhere since.`));
      if (n === 6) once('pundit_drift', feed(0, 'GENERAL', 'Further from the pitch every year',
        'Six years on television. He knows the game less well than he did, and everybody asks him about it more than ever.'));
      break;
    case 'AMBASSADOR':
      if (n === 1) once('amb_start', feed(0, 'GENERAL', `${who} stays at the club`,
        'An office, a title, and a seat in the directors box. The supporters like knowing he is still in the building.'));
      if (n === 4) once('amb_bridge', feed(0, 'GENERAL', 'The bridge between eras',
        `The young players do not remember watching ${who} play, but they know exactly who he is, because the older staff will not stop telling them.`));
      break;
    case 'ACADEMY':
      if (n === 1) once('acad_start', feed(0, 'GENERAL', `${who} takes the under-18s`,
        'A tracksuit, a bag of cones, and a Tuesday morning in the rain. He has not been this happy since he was twenty-two.'));
      if (n === 3) once('acad_first', feed(0, 'MILESTONE', 'One of his has come through',
        `A boy ${who} has coached for three years made his first-team debut on Saturday. Nobody mentioned the coach. That is rather the point.`));
      if (n === 7) once('acad_reputation', feed(0, 'MILESTONE', 'A reputation built quietly',
        `Clubs across the country now ring ${who} about young players. He is, it turns out, extremely good at this.`));
      break;
    case 'MANAGEMENT':
      if (n === 1) once('mgmt_start', feed(0, 'BOARD', `${who} takes his first job`,
        'Everybody warned him. He did it anyway. Within a fortnight he has stopped sleeping properly and could not be more alive.'));
      break;
    case 'AWAY':
      if (n === 1) once('away_start', feed(0, 'GENERAL', `${who} steps away entirely`,
        'No punditry, no badges, no Saturday. He has not been photographed in four months and the people close to him say he is the best he has been in years.'));
      if (n === 5) once('away_missed', feed(0, 'GENERAL', 'Where is he now?',
        `A newspaper ran a feature this week asking what became of ${who}. He did not reply to them, which the piece rather proved the point of.`));
      break;
  }

  // Every few years, somebody asks the one question nobody enjoys.
  if (n >= 2 && (hashSeed(`regret_${seed}_${avatar.id}_${year}`) % 100) < 18) {
    news.push(feed(0, 'GENERAL', 'The question again',
      `Somebody asked ${who} this week whether he would do anything differently. He gave the answer he always gives, and then thought about it for the rest of the night.`));
  }

  return {
    state: { ...state, years: n, earned: state.earned + info.income, seen },
    news,
  };
}

// --- The statue -------------------------------------------------------------------

/**
 * A statue outside the ground: the strangest honour in the sport, and only ever
 * for somebody the club genuinely could not replace.
 */
export function maybeStatue(
  career: PlayerCareer, avatar: Player, clubs: Record<string, Club>, yearsRetired: number, year: number,
): { career: PlayerCareer; news: NewsItem[] } | null {
  if (career.statue) return null;
  if (yearsRetired < 3) return null;
  const legendIds = career.legacy?.legendAtClubs ?? [];
  if (legendIds.length === 0) return null;
  // The club he gave the most seasons to, among those where he's a legend.
  const seasonsAt = new Map<string, number>();
  for (const s of career.seasonHistory) seasonsAt.set(s.club, (seasonsAt.get(s.club) ?? 0) + 1);
  const candidates = legendIds.map((id) => clubs[id]).filter((c): c is Club => !!c);
  if (candidates.length === 0) return null;
  const club = candidates.reduce((a, b) =>
    ((seasonsAt.get(b.name) ?? 0) > (seasonsAt.get(a.name) ?? 0) ||
     ((seasonsAt.get(b.name) ?? 0) === (seasonsAt.get(a.name) ?? 0) && b.id < a.id)) ? b : a);

  return {
    career: { ...career, statue: { clubId: club.id, clubName: club.name, year } },
    news: [feed(0, 'MILESTONE', `A statue at ${club.name}`,
      `${nameOf(avatar)} stood outside the ground today and looked at a bronze version of himself, ten feet tall, doing something he did on a Tuesday in a season he can barely remember. He said it was the strangest afternoon of his life.`)],
  };
}

// --- The Hall of Fame ------------------------------------------------------------------

/**
 * Induction. Whoever inducts you says more than the honour itself — a mentor
 * who took you under his wing thirty years ago, or an old rival, or nobody in
 * particular.
 */
export function hallOfFame(
  career: PlayerCareer, avatar: Player, yearsRetired: number, year: number, rivalName?: string,
): { career: PlayerCareer; news: NewsItem[] } | null {
  if (career.hallOfFame) return null;
  if (yearsRetired < 5) return null;
  const totalGoals = career.seasonHistory.reduce((s, x) => s + x.goals, 0);
  const trophies = career.seasonHistory.reduce((s, x) => s + (x.honours?.length ?? 0), 0);
  const caps = career.international?.caps ?? 0;
  const score = totalGoals * 0.4 + trophies * 6 + caps * 0.6 + (career.legacy?.legendAtClubs?.length ?? 0) * 10;
  if (score < 55) return null;

  const mentor = career.mentor?.name;
  const rival = career.rival ? (rivalName ?? career.intlRival?.name) : career.intlRival?.name;
  const inductor = mentor ?? rival ?? null;
  const kind: 'MENTOR' | 'RIVAL' | 'NOBODY' = mentor ? 'MENTOR' : rival ? 'RIVAL' : 'NOBODY';
  const body = kind === 'MENTOR'
    ? `${inductor} — who took a frightened teenager under his wing three decades ago and never once made him feel small — read the citation. ${nameOf(avatar)} did not get through it, and neither did anybody else in the room.`
    : kind === 'RIVAL'
    ? `${inductor}, who spent fifteen years trying to take everything ${nameOf(avatar)} had, read the citation and meant every word of it. That is what a rivalry is, in the end.`
    : `${nameOf(avatar)} was inducted alone, without ceremony, which is exactly how he would have wanted it.`;

  return {
    career: { ...career, hallOfFame: { year, inductedBy: inductor, kind } },
    news: [feed(0, 'MILESTONE', 'Inducted into the Hall of Fame', body)],
  };
}

// --- The kid ---------------------------------------------------------------------------

export interface ChildCareer {
  name: string;
  bornYear: number;
  /** The academy that took him. */
  clubName?: string;
  /** Stage of his own career. */
  stage: 'CHILD' | 'ACADEMY' | 'DEBUT' | 'ESTABLISHED' | 'FADED';
  /** How he measures up to his father, 0–100. */
  potential: number;
}

/**
 * A child, born somewhere in the middle of the career, who grows up to try the
 * same thing — under the worst surname in football to carry.
 */
export function maybeChild(
  career: PlayerCareer, avatar: Player, year: number, seed: number,
): { career: PlayerCareer; news: NewsItem[] } | null {
  if (career.child) return null;
  const age = year - avatar.born.year;
  if (age < 26 || age > 36) return null;
  if ((hashSeed(`child_${seed}_${avatar.id}_${year}`) % 100) >= 22) return null;

  const first = FIRST_NAMES[hashSeed(`cfn_${seed}_${avatar.id}`) % FIRST_NAMES.length];
  // He carries his father's surname, which is the whole problem.
  const child: ChildCareer = {
    name: `${first} ${avatar.name.last}`,
    bornYear: year,
    stage: 'CHILD',
    potential: 40 + (hashSeed(`cpot_${seed}_${avatar.id}`) % 55),
  };
  return {
    career: { ...career, child },
    news: [feed(0, 'GENERAL', 'A son',
      `${nameOf(avatar)} has become a father. ${child.name} will grow up with a surname that opens every door in the game and closes a few others behind him.`)],
  };
}

/** The kid's own career, advanced a year at a time alongside his father's life. */
export function advanceChild(
  career: PlayerCareer, avatar: Player, clubName: string | undefined, year: number,
): { career: PlayerCareer; news: NewsItem[] } {
  const c = career.child;
  if (!c) return { career, news: [] };
  const age = year - c.bornYear;
  const who = nameOf(avatar);

  if (c.stage === 'CHILD' && age >= 9) {
    // Talent shows, or it doesn't. A father's name gets you the trial, not the place.
    if (c.potential < 55) {
      return {
        career: { ...career, child: { ...c, stage: 'FADED' } },
        news: [feed(0, 'GENERAL', 'He is not going to be a footballer',
          `${c.name} has stopped playing. He was decent, and decent is nowhere near enough, and everybody comparing him to his father did not help. ${who} says he is relieved, and means it.`)],
      };
    }
    return {
      career: { ...career, child: { ...c, stage: 'ACADEMY', clubName } },
      news: [feed(0, 'MILESTONE', `${c.name} signs for an academy`,
        `${clubName ?? 'A professional club'} have taken ${who}'s son into their academy. Every coach who watches him will be watching for his father, and he knows it.`)],
    };
  }
  if (c.stage === 'ACADEMY' && age >= 18) {
    if (c.potential < 72) {
      return {
        career: { ...career, child: { ...c, stage: 'FADED' } },
        news: [feed(0, 'RESULT', `${c.name} released`,
          `The academy have let him go at eighteen. It happens to almost all of them; it is just that almost none of them have to read about it. ${who} drove him home.`)],
      };
    }
    return {
      career: { ...career, child: { ...c, stage: 'DEBUT' } },
      news: [feed(0, 'MILESTONE', `${c.name} makes his debut`,
        `The name went up on the team sheet and a stadium made a noise that was not entirely for him. ${who} watched from the stand and was, by every account, unable to speak afterwards.`)],
    };
  }
  if (c.stage === 'DEBUT' && age >= 22) {
    const madeIt = c.potential >= 82;
    return {
      career: { ...career, child: { ...c, stage: madeIt ? 'ESTABLISHED' : 'FADED' } },
      news: [madeIt
        ? feed(0, 'MILESTONE', `${c.name} is his own player now`,
          `Nobody introduces him as ${who}'s son any more. It took four years and it is the only thing either of them ever wanted.`)
        : feed(0, 'GENERAL', 'A perfectly good career',
          `${c.name} has dropped down a division and will have a long, decent, unremarkable career. It is more than almost anybody manages, and it will never quite be enough for the people who watched his father.`)],
    };
  }
  return { career, news: [] };
}

/** A one-line summary of where the kid is up to, for the epilogue screen. */
export function childSummary(c: ChildCareer, year: number): string {
  const age = year - c.bornYear;
  switch (c.stage) {
    case 'CHILD': return `${age} years old.`;
    case 'ACADEMY': return `${age}, in the academy at ${c.clubName ?? 'a professional club'}.`;
    case 'DEBUT': return `${age}, a first-team player, and still introduced as somebody's son.`;
    case 'ESTABLISHED': return `${age}, and his own man.`;
    case 'FADED': return `${age}. Football did not work out, and he is fine.`;
  }
}

/** Total money the epilogue has brought in, for the screen. */
export function epilogueEarnings(state: EpilogueState | undefined): number {
  return clamp(state?.earned ?? 0, 0, Number.MAX_SAFE_INTEGER);
}
