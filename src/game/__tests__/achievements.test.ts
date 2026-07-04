import { describe, it, expect } from 'vitest';
import { checkAchievements } from '../achievements';
import type { Award, StandingRow, ManagerStint } from '../../types/league';

const stint = (clubId: string, trophies = 0): ManagerStint => ({ clubId, clubName: clubId, fromYear: 2020, seasons: 1, trophies });
const row = (lost: number): StandingRow => ({ clubId: 'me', played: 38, won: 30, drawn: 8 - lost, lost, goalsFor: 90, goalsAgainst: 20, points: 98 });

describe('Achievements', () => {
  const base = { managerClubId: 'me', year: 2025, managerStints: [stint('me')], history: [], wonWorldCupAsManager: false, unlocked: {} };

  it('awards the league title and an unbeaten Invincible season', () => {
    const awards: Award[] = [{ type: 'LEAGUE_CHAMPION', label: 'Premier League', seasonId: 's', clubId: 'me' }];
    const got = checkAchievements({ ...base, seasonAwards: awards, managerLeagueRow: row(0) });
    expect(got.LEAGUE_TITLE).toBe(2025);
    expect(got.INVINCIBLE).toBe(2025);
  });

  it('awards the Treble for league + major cup + Champions League', () => {
    const awards: Award[] = [
      { type: 'LEAGUE_CHAMPION', label: 'Premier League', seasonId: 's', clubId: 'me' },
      { type: 'DOMESTIC_CUP', label: 'GB Cup', seasonId: 's', clubId: 'me' },
      { type: 'CONTINENTAL', label: 'Champions League', seasonId: 's', clubId: 'me' },
    ];
    const got = checkAchievements({ ...base, seasonAwards: awards, managerLeagueRow: row(2) });
    expect(got.TREBLE).toBe(2025);
    expect(got.DOMESTIC_DOUBLE).toBe(2025);
    expect(got.CONTINENTAL_GLORY).toBe(2025);
  });

  it('does not re-award something already unlocked', () => {
    const awards: Award[] = [{ type: 'LEAGUE_CHAMPION', label: 'PL', seasonId: 's', clubId: 'me' }];
    const got = checkAchievements({ ...base, seasonAwards: awards, managerLeagueRow: row(3), unlocked: { LEAGUE_TITLE: 2024 } });
    expect(got.LEAGUE_TITLE).toBeUndefined();
  });

  it('awards Journeyman at five clubs', () => {
    const got = checkAchievements({ ...base, seasonAwards: [], managerStints: ['a', 'b', 'c', 'd', 'e'].map((c) => stint(c)) });
    expect(got.JOURNEYMAN).toBe(2025);
  });
});
