// ---------------------------------------------------------------------------
// Player Career — meta & replayability (§ Playing it again). One career is a
// story; a career mode is the reason you start a second one.
//
//   • Challenge scenarios — a deliberately hard starting hand with a stated
//     win condition, checked against the real career record.
//   • Difficulty & realism dials — injuries, form swings, how patient managers
//     are, how much the market wants you, how fast you grow.
//   • Achievements — a long list of things that are genuinely hard to do,
//     earned across every save.
//   • The era rival — a peer generated at creation whose career runs alongside
//     yours for twenty years, so there is always somebody to be measured against.
//
// Pure & deterministic. No RNG stream is touched.
// ---------------------------------------------------------------------------

import type { Player } from '../types/player';
import type { PlayerCareer } from '../types/playerCareer';
import { clamp } from '../engine/rng';

// --- Difficulty & realism -----------------------------------------------------------

export interface Dials {
  /** How often bodies break. 1 = normal. */
  injuries: number;
  /** How violently form swings from week to week. */
  formSwing: number;
  /** How long a manager sticks with a player who isn't delivering. */
  managerPatience: number;
  /** How readily other clubs come calling. */
  marketInterest: number;
  /** How fast attributes actually improve. */
  growth: number;
}

export const DEFAULT_DIALS: Dials = { injuries: 1, formSwing: 1, managerPatience: 1, marketInterest: 1, growth: 1 };

export type Difficulty = 'FORGIVING' | 'REALISTIC' | 'BRUTAL';

export const DIFFICULTY_PRESETS: Record<Difficulty, { label: string; blurb: string; dials: Dials }> = {
  FORGIVING: {
    label: 'Forgiving',
    blurb: 'Bodies hold up, managers wait, clubs keep calling. For playing the story rather than fighting the game.',
    dials: { injuries: 0.6, formSwing: 0.75, managerPatience: 1.4, marketInterest: 1.3, growth: 1.25 },
  },
  REALISTIC: {
    label: 'Realistic',
    blurb: 'The game as it actually is. Most careers do not go the way anybody planned.',
    dials: DEFAULT_DIALS,
  },
  BRUTAL: {
    label: 'Brutal',
    blurb: 'Fragile, forgotten quickly, and nobody is coming to rescue you. Very few careers survive this intact.',
    dials: { injuries: 1.6, formSwing: 1.35, managerPatience: 0.6, marketInterest: 0.6, growth: 0.75 },
  },
};

/** Clamp a hand-tuned set of dials into a sane, playable range. */
export function normaliseDials(d: Partial<Dials> | undefined): Dials {
  const base = { ...DEFAULT_DIALS, ...(d ?? {}) };
  return {
    injuries: clamp(base.injuries, 0.3, 2.5),
    formSwing: clamp(base.formSwing, 0.4, 2),
    managerPatience: clamp(base.managerPatience, 0.4, 2),
    marketInterest: clamp(base.marketInterest, 0.3, 2),
    growth: clamp(base.growth, 0.4, 2),
  };
}

/**
 * A single number describing how hard the save is, for the achievement rules —
 * so a legend built on Forgiving is not counted the same as one built on Brutal.
 */
export function difficultyScore(d: Dials): number {
  const n = normaliseDials(d);
  return Math.round(
    (n.injuries - 1) * 30 + (1 - n.formSwing) * -20 + (1 - n.managerPatience) * 25 +
    (1 - n.marketInterest) * 25 + (1 - n.growth) * 30,
  );
}

// --- Challenge scenarios ---------------------------------------------------------------

export type ChallengeId =
  | 'NON_LEAGUE' | 'ONE_CLUB' | 'JOURNEYMAN' | 'LATE_BLOOMER' | 'SMALL_NATION' | 'NO_SECOND_CHANCES';

export interface Challenge {
  id: ChallengeId;
  label: string;
  blurb: string;
  /** What the save is forced to start with. */
  setup: string;
  /** Stated in plain words, so the player knows exactly what they're chasing. */
  goal: string;
  /** Dials the scenario forces on top of the chosen difficulty. */
  dials?: Partial<Dials>;
  /** Minimum club reputation allowed at creation (challenge-enforced). */
  maxClubReputation?: number;
}

export const CHALLENGES: Challenge[] = [
  {
    id: 'NON_LEAGUE', label: 'The long way up', maxClubReputation: 52,
    setup: 'Start at the smallest club in the world with nothing but time.',
    goal: 'Play a top-division match and win a major trophy.',
    blurb: 'Nobody is scouting you. Nobody is writing about you. Every division you climb, you climb on your own.',
  },
  {
    id: 'ONE_CLUB', label: 'One club, one shirt',
    setup: 'Sign for one club and never leave it.',
    goal: 'Retire with 400 appearances, all at the same club.',
    blurb: 'You will be offered more money and better football, repeatedly, for twenty years. The whole challenge is saying no.',
    dials: { marketInterest: 1.4 },
  },
  {
    id: 'JOURNEYMAN', label: 'The journeyman',
    setup: 'Never spend more than three seasons anywhere.',
    goal: 'Play for eight clubs in five different countries.',
    blurb: 'A new league, a new language, a new dressing room, over and over. You will never be anybody\'s favourite.',
  },
  {
    id: 'LATE_BLOOMER', label: 'Late bloomer',
    setup: 'Start with almost nothing and grow slowly.',
    goal: 'Reach 85 overall after your 28th birthday.',
    blurb: 'Everybody your age is already established. You will spend your twenties being told you left it too late.',
    dials: { growth: 0.7, marketInterest: 0.7 },
  },
  {
    id: 'SMALL_NATION', label: 'Carrying a country',
    setup: 'Play for a nation nobody expects anything from.',
    goal: 'Win 75 caps and take your country to a major tournament.',
    blurb: 'Two good players and nine who try very hard. Every qualifying campaign comes down to one night in the rain.',
  },
  {
    id: 'NO_SECOND_CHANCES', label: 'No second chances',
    setup: 'Fragile body, impatient managers, a market that forgets quickly.',
    goal: 'Play 300 matches without your career collapsing.',
    blurb: 'One bad run and you are out of the team. One bad injury and you are out of the plans. Most players do not survive this.',
    dials: { injuries: 1.8, managerPatience: 0.5, marketInterest: 0.5 },
  },
];

export const CHALLENGE_BY_ID: Record<ChallengeId, Challenge> =
  Object.fromEntries(CHALLENGES.map((c) => [c.id, c])) as Record<ChallengeId, Challenge>;

export interface ChallengeProgress {
  done: boolean;
  /** 0–1 toward the goal, for a progress bar. */
  progress: number;
  note: string;
}

/** How the challenge is going, measured against the actual career record. */
export function challengeProgress(id: ChallengeId, career: PlayerCareer, avatar: Player | undefined, year: number): ChallengeProgress {
  const history = career.seasonHistory ?? [];
  const apps = history.reduce((s, x) => s + x.apps, 0) + (career.seasonApps ?? 0);
  const clubs = new Set(history.map((h) => h.club).filter(Boolean));
  const honours = history.reduce((s, x) => s + (x.honours?.length ?? 0), 0);
  const caps = career.international?.caps ?? 0;

  switch (id) {
    case 'NON_LEAGUE': {
      const topFlight = career.reachedTopTier ?? false;
      return {
        done: topFlight && honours > 0, progress: clamp(honours > 0 ? 1 : topFlight ? 0.6 : 0.2, 0, 1),
        note: honours > 0 ? 'Made it, and won something.' : topFlight ? 'In the top division. Now win something.' : 'Still climbing.',
      };
    }
    case 'ONE_CLUB': {
      const single = clubs.size <= 1;
      return {
        done: single && apps >= 400, progress: clamp(single ? apps / 400 : 0, 0, 1),
        note: !single ? `Broken — ${clubs.size} clubs.` : `${apps} of 400 appearances, all in the one shirt.`,
      };
    }
    case 'JOURNEYMAN': {
      const countries = new Set((career.countriesPlayedIn ?? []).filter(Boolean));
      const done = clubs.size >= 8 && countries.size >= 5;
      return {
        done, progress: clamp((clubs.size / 8 + countries.size / 5) / 2, 0, 1),
        note: `${clubs.size} of 8 clubs, ${countries.size} of 5 countries.`,
      };
    }
    case 'LATE_BLOOMER': {
      const age = avatar ? year - avatar.born.year : 0;
      const ovr = avatar?.overall ?? 0;
      return {
        done: age >= 28 && ovr >= 85, progress: clamp(ovr / 85, 0, 1),
        note: age < 28 ? `${ovr} overall at ${age}. The clock is the point.` : `${ovr} of 85, and you're ${age}.`,
      };
    }
    case 'SMALL_NATION': {
      const tournaments = (career.tournamentSquads ?? []).length;
      return {
        done: caps >= 75 && tournaments > 0, progress: clamp((caps / 75 + (tournaments > 0 ? 1 : 0)) / 2, 0, 1),
        note: `${caps} of 75 caps${tournaments > 0 ? ', and you got them there.' : '. No tournament yet.'}`,
      };
    }
    case 'NO_SECOND_CHANCES': {
      return {
        done: apps >= 300, progress: clamp(apps / 300, 0, 1),
        note: `${apps} of 300 matches, still standing.`,
      };
    }
  }
}

// --- Achievements ----------------------------------------------------------------------

export interface PlayerAchievement {
  id: string;
  label: string;
  blurb: string;
  /** Roughly how hard, 1 (most players manage it) to 5 (almost nobody does). */
  tier: 1 | 2 | 3 | 4 | 5;
  earned: (c: PlayerCareer, p: Player | undefined, year: number) => boolean;
}

const totalApps = (c: PlayerCareer) => (c.seasonHistory ?? []).reduce((s, x) => s + x.apps, 0) + (c.seasonApps ?? 0);
const totalGoals = (c: PlayerCareer) => (c.seasonHistory ?? []).reduce((s, x) => s + x.goals, 0) + (c.seasonGoals ?? 0);
const totalHonours = (c: PlayerCareer) => (c.seasonHistory ?? []).reduce((s, x) => s + (x.honours?.length ?? 0), 0);

export const PLAYER_ACHIEVEMENTS: PlayerAchievement[] = [
  { id: 'debut', label: 'First of many', tier: 1, blurb: 'Make a senior appearance.', earned: (c) => totalApps(c) >= 1 },
  { id: 'hundred_apps', label: 'A hundred games', tier: 2, blurb: '100 senior appearances.', earned: (c) => totalApps(c) >= 100 },
  { id: 'five_hundred', label: 'Five hundred', tier: 5, blurb: '500 senior appearances. Almost nobody lasts this long.', earned: (c) => totalApps(c) >= 500 },
  { id: 'century', label: 'The century', tier: 3, blurb: '100 career goals.', earned: (c) => totalGoals(c) >= 100 },
  { id: 'three_hundred_goals', label: 'Three hundred', tier: 5, blurb: '300 career goals.', earned: (c) => totalGoals(c) >= 300 },
  { id: 'first_trophy', label: 'Something in the cabinet', tier: 2, blurb: 'Win a trophy.', earned: (c) => totalHonours(c) >= 1 },
  { id: 'serial_winner', label: 'Serial winner', tier: 4, blurb: 'Win ten trophies.', earned: (c) => totalHonours(c) >= 10 },
  { id: 'capped', label: 'Full international', tier: 2, blurb: 'Win a senior cap.', earned: (c) => (c.international?.caps ?? 0) >= 1 },
  { id: 'centurion', label: 'A hundred caps', tier: 5, blurb: '100 caps for your country.', earned: (c) => (c.international?.caps ?? 0) >= 100 },
  { id: 'captain_country', label: 'Your country’s captain', tier: 4, blurb: 'Captain your national team at a tournament.', earned: (c) => c.intlRole === 'CAPTAIN' },
  { id: 'club_legend', label: 'Club legend', tier: 3, blurb: 'Become a legend at a club.', earned: (c) => (c.legacy?.legendAtClubs?.length ?? 0) >= 1 },
  { id: 'statue', label: 'Cast in bronze', tier: 5, blurb: 'Have a statue put up outside a ground.', earned: (c) => !!c.statue },
  { id: 'hall_of_fame', label: 'Hall of Fame', tier: 5, blurb: 'Be inducted after you retire.', earned: (c) => !!c.hallOfFame },
  { id: 'ninety', label: 'World class', tier: 4, blurb: 'Reach 90 overall.', earned: (_c, p) => (p?.overall ?? 0) >= 90 },
  { id: 'comeback', label: 'All the way back', tier: 3, blurb: 'Come back from a serious injury.', earned: (c) => !!c.comeback?.returned },
  { id: 'own_chant', label: 'They sing your name', tier: 3, blurb: 'Get your own terrace chant.', earned: (c) => !!c.hasChant },
  { id: 'shirt_seller', label: 'On every back', tier: 3, blurb: 'Become the club’s best-selling shirt.', earned: (c) => !!c.topShirtSeller },
  { id: 'loyal', label: 'One-club man', tier: 4, blurb: 'Play 300 games for a single club.', earned: (c) => {
    const byClub = new Map<string, number>();
    for (const s of c.seasonHistory ?? []) byClub.set(s.club, (byClub.get(s.club) ?? 0) + s.apps);
    return [...byClub.values()].some((n) => n >= 300);
  } },
  { id: 'globetrotter', label: 'Five passports', tier: 4, blurb: 'Play in five different countries.', earned: (c) => new Set((c.countriesPlayedIn ?? []).filter(Boolean)).size >= 5 },
  { id: 'survived', label: 'Still here', tier: 4, blurb: 'Play a senior match after your 38th birthday.', earned: (_c, p, y) => !!p && (y - p.born.year) >= 38 },
  { id: 'father_son', label: 'The next one', tier: 5, blurb: 'See your son establish himself as a professional.', earned: (c) => c.child?.stage === 'ESTABLISHED' },
];

export interface AchievementState { id: string; earned: boolean }

/** Everything earned so far, in a stable order. */
export function evaluateAchievements(career: PlayerCareer, avatar: Player | undefined, year: number): AchievementState[] {
  return PLAYER_ACHIEVEMENTS.map((a) => ({ id: a.id, earned: a.earned(career, avatar, year) }));
}

/** Newly-earned achievement ids since the last check (for a feed beat). */
export function newlyEarned(previous: string[] | undefined, current: AchievementState[]): string[] {
  const before = new Set(previous ?? []);
  return current.filter((a) => a.earned && !before.has(a.id)).map((a) => a.id);
}

/** A completion score that weights the hard ones properly. */
export function achievementScore(states: AchievementState[]): { earned: number; total: number; points: number; maxPoints: number } {
  let points = 0, maxPoints = 0, earned = 0;
  for (const a of PLAYER_ACHIEVEMENTS) {
    maxPoints += a.tier;
    const got = states.find((s) => s.id === a.id)?.earned;
    if (got) { points += a.tier; earned++; }
  }
  return { earned, total: PLAYER_ACHIEVEMENTS.length, points, maxPoints };
}

// --- The era rival ------------------------------------------------------------------------

export interface RivalComparison {
  name: string;
  /** Positive = the avatar is ahead. */
  appsEdge: number;
  goalsEdge: number;
  trophiesEdge: number;
  verdict: string;
}

/**
 * The peer generated at creation, twenty years on. The comparison is the whole
 * point of him — a career means something relative to somebody.
 */
export function compareEraRival(career: PlayerCareer, avatar: Player | undefined, rival: Player | undefined): RivalComparison | null {
  const er = career.eraRival;
  if (!er) return null;
  const name = er.name;
  if (!rival || !avatar) return { name, appsEdge: 0, goalsEdge: 0, trophiesEdge: 0, verdict: 'You have lost track of him entirely.' };

  const myApps = totalApps(career);
  const myGoals = totalGoals(career);
  const myTrophies = totalHonours(career);
  const hisApps = rival.stats.reduce((s, x) => s + x.appearances, 0);
  const hisGoals = rival.stats.reduce((s, x) => s + x.goals, 0);
  const hisTrophies = rival.awards.length;

  const appsEdge = myApps - hisApps;
  const goalsEdge = myGoals - hisGoals;
  const trophiesEdge = myTrophies - hisTrophies;
  const score = Math.sign(appsEdge) + Math.sign(goalsEdge) * 1.5 + Math.sign(trophiesEdge) * 2;

  const verdict = score >= 3
    ? `History will remember you and struggle to place ${name}.`
    : score >= 1
    ? `You are ahead, but not so far ahead that anybody has stopped arguing about it.`
    : score <= -3
    ? `${name} has had the better career, and everybody knows it, including you.`
    : score <= -1
    ? `${name} is ahead. There is still time, and there is less of it every year.`
    : `Nobody can separate you. They will still be arguing about it in thirty years.`;

  return { name, appsEdge, goalsEdge, trophiesEdge, verdict };
}
