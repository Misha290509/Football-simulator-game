import { describe, it, expect } from 'vitest';
import { createNewGame } from '../../newGame';
import { ENGLAND_DATASET } from '../../../data/england';

describe('Continental — installed into a new game', () => {
  const snap = createNewGame({
    saveName: 'C', managerName: 'X', dataset: ENGLAND_DATASET,
    managerClubId: 'club_GB_ARS', startYear: 2024, seed: 3,
  });

  it('creates a Champions League with a Swiss league phase', () => {
    const cl = snap.meta.continental?.['UEFA_CL'];
    expect(cl).toBeTruthy();
    expect(cl!.stage).toBe('LEAGUE');
    expect(cl!.clubIds.length).toBeGreaterThanOrEqual(9);
  });

  it('puts league fixtures on even days and continental fixtures on odd days', () => {
    const all = Object.values(snap.matches);
    const league = all.filter((m) => snap.meta.competitions[m.competitionId]);
    const cont = all.filter((m) => m.competitionId === 'UEFA_CL');
    expect(league.length).toBeGreaterThan(0);
    expect(cont.length).toBeGreaterThan(0);
    expect(league.every((m) => m.day % 3 === 0)).toBe(true); // league day-class
    expect(cont.every((m) => m.day % 3 === 1)).toBe(true); // continental day-class
  });

  it('schedules continental fixtures that the qualified clubs actually play', () => {
    const cl = snap.meta.continental!['UEFA_CL'];
    const clMatches = Object.values(snap.matches).filter((m) => m.competitionId === 'UEFA_CL');
    // Every continental match is between two qualified clubs.
    const field = new Set(cl.clubIds);
    expect(clMatches.every((m) => field.has(m.homeClubId) && field.has(m.awayClubId))).toBe(true);
  });
});
