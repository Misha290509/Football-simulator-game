// ---------------------------------------------------------------------------
// Achievements (§ Meta). Milestone challenges checked at each season rollover
// against the manager's results. Unlocked achievements are stamped with the year
// and surfaced in the Records hub. Pure — returns only the newly-unlocked ids.
// ---------------------------------------------------------------------------

import type { Award, StandingRow, ManagerStint, SeasonHistory } from '../types/league';

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'LEAGUE_TITLE', name: 'Champions', description: 'Win your domestic league.' },
  { id: 'DOMESTIC_DOUBLE', name: 'Domestic Double', description: 'Win the league and the major cup in one season.' },
  { id: 'INVINCIBLE', name: 'Invincible', description: 'Go a whole league season unbeaten.' },
  { id: 'CONTINENTAL_GLORY', name: 'Kings of Europe', description: 'Win the Champions League.' },
  { id: 'TREBLE', name: 'The Treble', description: 'League, major cup and Champions League in a single season.' },
  { id: 'WORLD_BEATER', name: 'World Beater', description: 'Win the World Cup as a national-team manager.' },
  { id: 'JOURNEYMAN', name: 'Journeyman', description: 'Manage five different clubs.' },
  { id: 'SERIAL_WINNER', name: 'Serial Winner', description: 'Win 10 trophies across your career.' },
  { id: 'DYNASTY', name: 'Dynasty', description: 'Win five league titles.' },
];

export interface AchievementContext {
  managerClubId: string;
  year: number;
  seasonAwards: Award[];
  managerLeagueRow?: StandingRow;
  managerStints: ManagerStint[];
  history: SeasonHistory[];
  wonWorldCupAsManager: boolean;
  unlocked: Record<string, number>;
}

/** Returns the achievements newly unlocked this rollover (id → year). */
export function checkAchievements(ctx: AchievementContext): Record<string, number> {
  const mine = ctx.seasonAwards.filter((a) => a.clubId === ctx.managerClubId);
  const wonLeague = mine.some((a) => a.type === 'LEAGUE_CHAMPION');
  const wonMajorCup = mine.some((a) => a.type === 'DOMESTIC_CUP' && !a.label.includes('League Cup'));
  const wonCl = mine.some((a) => a.type === 'CONTINENTAL' && a.label === 'Champions League');

  // Career league titles across archived seasons + this one.
  const leagueTitles = [...ctx.history.flatMap((h) => h.awards), ...ctx.seasonAwards]
    .filter((a) => a.type === 'LEAGUE_CHAMPION' && a.clubId === ctx.managerClubId).length;
  const careerTrophies = ctx.managerStints.reduce((s, st) => s + st.trophies, 0);

  const row = ctx.managerLeagueRow;
  const invincible = !!row && row.played >= 10 && row.lost === 0;

  const conditions: Record<string, boolean> = {
    LEAGUE_TITLE: wonLeague,
    DOMESTIC_DOUBLE: wonLeague && wonMajorCup,
    INVINCIBLE: invincible,
    CONTINENTAL_GLORY: wonCl,
    TREBLE: wonLeague && wonMajorCup && wonCl,
    WORLD_BEATER: ctx.wonWorldCupAsManager,
    JOURNEYMAN: ctx.managerStints.length >= 5,
    SERIAL_WINNER: careerTrophies >= 10,
    DYNASTY: leagueTitles >= 5,
  };

  const newly: Record<string, number> = {};
  for (const def of ACHIEVEMENTS) {
    if (conditions[def.id] && ctx.unlocked[def.id] === undefined) newly[def.id] = ctx.year;
  }
  return newly;
}
