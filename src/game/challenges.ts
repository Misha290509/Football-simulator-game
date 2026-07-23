// ---------------------------------------------------------------------------
// Challenge scenarios (§ Goals, not sandbox). Curated starts with explicit win
// conditions, evaluated once per season at rollover. A challenge pins the
// country, club and difficulty at new-game time; some add a standing rule
// (e.g. no incoming transfers). Leaving the club fails the challenge.
//
// Because worlds are deterministic per seed, a challenge + a shared seed is a
// race: two friends entering the same seed play the identical world.
// ---------------------------------------------------------------------------

import type { Dataset, DatasetClub } from '../types/dataset';
import type { StandingRow, NewsItem } from '../types/league';
import type { Competition } from '../types/competition';

export type ChallengeWin = 'SURVIVE_S1' | 'WIN_LEAGUE' | 'WIN_ANY_TROPHY' | 'WIN_DOMESTIC_CUP';
export type ChallengeRule = 'NO_SIGNINGS';

export interface ChallengeDef {
  id: string;
  name: string;
  tagline: string;
  /** The win condition, spelled out for the player. */
  brief: string;
  countryId: string;
  /** How the club is chosen inside that country's top flight / second tier. */
  clubPick: 'WEAKEST_T1' | 'BEST_T2' | { abbrev: string };
  difficulty: 'RELAXED' | 'NORMAL' | 'HARD';
  /** Deadline in seasons (1 = the first season decides it). */
  seasons: number;
  win: ChallengeWin;
  rule?: ChallengeRule;
}

export interface ChallengeState {
  id: string;
  clubId: string;
  startYear: number;
  status: 'ACTIVE' | 'WON' | 'FAILED';
  note: string;
}

export const CHALLENGES: ChallengeDef[] = [
  {
    id: 'great-escape',
    name: 'The Great Escape',
    tagline: 'You are the underdog of your league.',
    brief: 'Prove everyone wrong by taking the weakest club in Laliga to glory.',
    countryId: 'ES',
    clubPick: 'WEAKEST_T1',
    difficulty: 'HARD',
    seasons: 1,
    win: 'SURVIVE_S1',
  },
  {
    id: 'cantera-code',
    name: 'La Cantera',
    tagline: 'No signings. Only your youngsters.',
    brief: 'Manage Athletic Club with incoming transfers banned and win a major trophy within 5 seasons using homegrown talent.',
    countryId: 'ES',
    clubPick: { abbrev: 'ATH' },
    difficulty: 'NORMAL',
    seasons: 5,
    win: 'WIN_ANY_TROPHY',
    rule: 'NO_SIGNINGS',
  },
  {
    id: 'giant-killers',
    name: 'Second Tier',
    tagline: 'A second division team. Shock the world',
    brief: 'Take the strongest club in the English second tier and win a domestic cup within 4 seasons.',
    countryId: 'GB',
    clubPick: 'BEST_T2',
    difficulty: 'NORMAL',
    seasons: 4,
    win: 'WIN_DOMESTIC_CUP',
  },
  {
    id: 'long-climb',
    name: 'The Long Climb',
    tagline: 'From the second tier to the top.',
    brief: 'Start in the German second tier and win the Bundesliga within 8 seasons.',
    countryId: 'DE',
    clubPick: 'BEST_T2',
    difficulty: 'NORMAL',
    seasons: 8,
    win: 'WIN_LEAGUE',
  },
  {
    id: 'desert-gold',
    name: 'Desert Gold',
    tagline: 'The money is coming. Get there first.',
    brief: 'Take a Saudi Pro League minnow to the title within 4 seasons as the league reshapes world football.',
    countryId: 'SA',
    clubPick: 'WEAKEST_T1',
    difficulty: 'HARD',
    seasons: 4,
    win: 'WIN_LEAGUE',
  },
  {
    id: 'mls-cup-dream',
    name: 'For the Cup',
    tagline: 'No relegation — only the playoffs matter.',
    brief: 'Guide a modest MLS club to MLS Cup glory within 3 seasons through the conference playoffs.',
    countryId: 'US',
    clubPick: 'WEAKEST_T1',
    difficulty: 'NORMAL',
    seasons: 3,
    win: 'WIN_LEAGUE',
  },
  {
    id: 'samba-revolution',
    name: 'Samba Revolution',
    tagline: 'Silverware in the land of joga bonito.',
    brief: 'Win any major trophy with a mid-table Brasileirão side within 4 seasons.',
    countryId: 'BR',
    clubPick: 'WEAKEST_T1',
    difficulty: 'HARD',
    seasons: 4,
    win: 'WIN_ANY_TROPHY',
  },
  {
    id: 'total-football',
    name: 'The Academy Way',
    tagline: 'Trust the youth. Sign no one.',
    brief: 'Win a trophy in the Netherlands within 5 seasons with incoming transfers banned — homegrown only.',
    countryId: 'NL',
    clubPick: 'WEAKEST_T1',
    difficulty: 'HARD',
    seasons: 5,
    win: 'WIN_ANY_TROPHY',
    rule: 'NO_SIGNINGS',
  },
  {
    id: 'azzurri-restoration',
    name: 'Restoration',
    tagline: 'A fallen giant of Serie B.',
    brief: 'Take the best club in Serie B to a Serie A title within 6 seasons.',
    countryId: 'IT',
    clubPick: 'BEST_T2',
    difficulty: 'NORMAL',
    seasons: 6,
    win: 'WIN_LEAGUE',
  },
  {
    id: 'coupe-run',
    name: 'Cup Run',
    tagline: 'A Ligue 2 side with a giant-killing dream.',
    brief: 'Win a domestic cup with a French second-tier club within 4 seasons.',
    countryId: 'FR',
    clubPick: 'BEST_T2',
    difficulty: 'NORMAL',
    seasons: 4,
    win: 'WIN_DOMESTIC_CUP',
  },
  {
    id: 'lusitano-underdog',
    name: 'Breaking the Three',
    tagline: 'Beyond Benfica, Porto and Sporting.',
    brief: 'Win any major trophy with a Primeira Liga underdog within 5 seasons.',
    countryId: 'PT',
    clubPick: 'WEAKEST_T1',
    difficulty: 'HARD',
    seasons: 5,
    win: 'WIN_ANY_TROPHY',
  },
  {
    id: 'bosphorus-survival',
    name: 'Survive the Bosphorus',
    tagline: 'One season. Stay up.',
    brief: 'Keep the weakest side in the Turkish Süper Lig from relegation in your first season.',
    countryId: 'TR',
    clubPick: 'WEAKEST_T1',
    difficulty: 'HARD',
    seasons: 1,
    win: 'SURVIVE_S1',
  },
  {
    id: 'efl-fairytale',
    name: 'EFL Fairytale',
    tagline: 'From the Championship to the summit.',
    brief: 'Take the best club in the English Championship to a Premier League title within 7 seasons.',
    countryId: 'GB',
    clubPick: 'BEST_T2',
    difficulty: 'NORMAL',
    seasons: 7,
    win: 'WIN_LEAGUE',
  },
];

export const challengeById = (id: string | undefined): ChallengeDef | undefined =>
  CHALLENGES.find((c) => c.id === id);

/** Resolve which dataset club a challenge starts at. */
export function pickChallengeClub(def: ChallengeDef, dataset: Dataset): DatasetClub | null {
  const country = dataset.countries.find((c) => c.id === def.countryId);
  if (!country) return null;
  if (typeof def.clubPick === 'object') {
    const wanted = def.clubPick.abbrev;
    for (const lg of country.leagues) {
      const hit = lg.clubs.find((c) => c.abbrev === wanted);
      if (hit) return hit;
    }
    return null;
  }
  const tier = def.clubPick === 'WEAKEST_T1' ? 1 : 2;
  const league = country.leagues.find((l) => l.tier === tier);
  if (!league || league.clubs.length === 0) return null;
  const sorted = [...league.clubs].sort((a, b) => a.reputation - b.reputation);
  return def.clubPick === 'WEAKEST_T1' ? sorted[0] : sorted[sorted.length - 1];
}

export interface ChallengeSeasonCtx {
  managerClubId: string;
  finalStandings: Record<string, StandingRow[]>;
  competitions: Record<string, Competition>;
  /** Cup competitions the manager's club won in the season just finished. */
  wonCupThisSeason: boolean;
  /** Seasons completed since the challenge began (1 after the first rollover). */
  seasonsElapsed: number;
  day: number;
}

let _seq = 0;
const mk = (day: number, title: string, body: string): NewsItem => ({
  id: `news_chal_${day}_${_seq++}`, day, category: 'BOARD', title, body, read: false,
});

/** Evaluate a challenge at season rollover. Returns the next state + any news. */
export function evaluateChallenge(
  state: ChallengeState,
  def: ChallengeDef,
  ctx: ChallengeSeasonCtx,
): { state: ChallengeState; news: NewsItem[] } {
  if (state.status !== 'ACTIVE') return { state, news: [] };

  // Leaving (or losing) the club ends the run.
  if (ctx.managerClubId !== state.clubId) {
    const next = { ...state, status: 'FAILED' as const, note: 'You left the club — the challenge ends with it.' };
    return { state: next, news: [mk(ctx.day, `Challenge failed: ${def.name}`, next.note)] };
  }

  // Where did the club finish in its league?
  let position = 0;
  let leagueRows: StandingRow[] = [];
  for (const [compId, rows] of Object.entries(ctx.finalStandings)) {
    const idx = rows.findIndex((r) => r.clubId === state.clubId);
    if (idx >= 0 && ctx.competitions[compId]) { position = idx + 1; leagueRows = rows; break; }
  }
  const comp = Object.values(ctx.competitions).find((c) => c.clubIds.includes(state.clubId));
  const relegated = position > 0 && leagueRows.length > 0 &&
    position > leagueRows.length - (comp?.promotion?.autoRelegate ?? 3);
  const wonLeague = position === 1 && comp?.tier === 1;

  const met =
    def.win === 'SURVIVE_S1' ? !relegated :
    def.win === 'WIN_LEAGUE' ? wonLeague :
    def.win === 'WIN_DOMESTIC_CUP' ? ctx.wonCupThisSeason :
    /* WIN_ANY_TROPHY */ (wonLeague || ctx.wonCupThisSeason);

  if (def.win === 'SURVIVE_S1') {
    const next = met
      ? { ...state, status: 'WON' as const, note: `Safe. ${position}${ord(position)} place — the great escape is complete.` }
      : { ...state, status: 'FAILED' as const, note: 'Relegated. The escape never came.' };
    return { state: next, news: [mk(ctx.day, `${met ? 'CHALLENGE COMPLETE' : 'Challenge failed'}: ${def.name}`, next.note)] };
  }

  if (met) {
    const next = { ...state, status: 'WON' as const, note: `Done in ${ctx.seasonsElapsed} season${ctx.seasonsElapsed > 1 ? 's' : ''}. ${def.brief}` };
    return { state: next, news: [mk(ctx.day, `CHALLENGE COMPLETE: ${def.name}`, next.note)] };
  }
  if (ctx.seasonsElapsed >= def.seasons) {
    const next = { ...state, status: 'FAILED' as const, note: `Time's up — ${def.seasons} season${def.seasons > 1 ? 's' : ''} gone without the win condition.` };
    return { state: next, news: [mk(ctx.day, `Challenge failed: ${def.name}`, next.note)] };
  }
  const left = def.seasons - ctx.seasonsElapsed;
  return {
    state: { ...state, note: `${left} season${left > 1 ? 's' : ''} remaining.` },
    news: [mk(ctx.day, `Challenge update: ${def.name}`, `Not yet. ${left} season${left > 1 ? 's' : ''} left to get it done.`)],
  };
}

const ord = (n: number): string => {
  const v = n % 100;
  if (v >= 11 && v <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
};
