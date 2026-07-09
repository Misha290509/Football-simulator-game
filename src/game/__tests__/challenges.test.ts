import { describe, it, expect } from 'vitest';
import { CHALLENGES, challengeById, pickChallengeClub, evaluateChallenge, type ChallengeState } from '../challenges';
import { ENGLAND_DATASET } from '../../data/england';
import type { StandingRow } from '../../types/league';
import type { Competition } from '../../types/competition';

const rows = (ids: string[]): StandingRow[] =>
  ids.map((clubId) => ({ clubId, played: 38, won: 10, drawn: 10, lost: 18, goalsFor: 30, goalsAgainst: 40, points: 40 }));

const comp = (id: string, clubIds: string[], tier = 1): Competition => ({
  id, name: 'League', countryId: 'GB', tier, numClubs: clubIds.length, rounds: 2,
  clubIds, confederation: 'UEFA', promotion: { autoPromote: 0, autoRelegate: 3 },
} as unknown as Competition);

const active = (clubId: string, id = 'great-escape', startYear = 2025): ChallengeState =>
  ({ id, clubId, startYear, status: 'ACTIVE', note: '' });

describe('Challenge scenarios', () => {
  it('resolves a club for every defined challenge', () => {
    // England-only dataset covers GB picks; ES/DE picks resolve against the full dataset at runtime.
    const gb = CHALLENGES.filter((c) => c.countryId === 'GB');
    expect(gb.length).toBeGreaterThan(0);
    for (const def of gb) {
      expect(pickChallengeClub(def, ENGLAND_DATASET)).toBeTruthy();
    }
  });

  it('survival: staying up wins, relegation fails', () => {
    const def = challengeById('great-escape')!;
    const ids = Array.from({ length: 20 }, (_, i) => `c${i}`);
    const standings = { comp_1: rows(ids) };
    const comps = { comp_1: comp('comp_1', ids) };

    // 17th of 20 with 3 auto-relegated → safe.
    const safe = evaluateChallenge(active('c16'), def, {
      managerClubId: 'c16', finalStandings: standings, competitions: comps,
      wonCupThisSeason: false, seasonsElapsed: 1, day: 0,
    });
    expect(safe.state.status).toBe('WON');

    // 18th → relegated → failed.
    const down = evaluateChallenge(active('c17'), def, {
      managerClubId: 'c17', finalStandings: standings, competitions: comps,
      wonCupThisSeason: false, seasonsElapsed: 1, day: 0,
    });
    expect(down.state.status).toBe('FAILED');
  });

  it('trophy hunts: cup win completes, deadline expiry fails, mid-run continues', () => {
    const def = challengeById('giant-killers')!; // win a domestic cup within 4 seasons
    const ids = Array.from({ length: 20 }, (_, i) => `c${i}`);
    const ctxBase = {
      managerClubId: 'c5', finalStandings: { comp_1: rows(ids) }, competitions: { comp_1: comp('comp_1', ids) },
      day: 0,
    };

    const going = evaluateChallenge(active('c5', def.id), def, { ...ctxBase, wonCupThisSeason: false, seasonsElapsed: 2 });
    expect(going.state.status).toBe('ACTIVE');
    expect(going.state.note).toContain('remaining');

    const won = evaluateChallenge(active('c5', def.id), def, { ...ctxBase, wonCupThisSeason: true, seasonsElapsed: 3 });
    expect(won.state.status).toBe('WON');

    const out = evaluateChallenge(active('c5', def.id), def, { ...ctxBase, wonCupThisSeason: false, seasonsElapsed: 4 });
    expect(out.state.status).toBe('FAILED');
  });

  it('leaving the club fails the challenge', () => {
    const def = challengeById('great-escape')!;
    const res = evaluateChallenge(active('c1'), def, {
      managerClubId: 'c9', finalStandings: {}, competitions: {},
      wonCupThisSeason: false, seasonsElapsed: 1, day: 0,
    });
    expect(res.state.status).toBe('FAILED');
    expect(res.news[0].title).toContain('failed');
  });
});
