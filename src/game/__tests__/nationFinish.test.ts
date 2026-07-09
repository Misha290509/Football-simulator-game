import { describe, it, expect } from 'vitest';
import { nationFinish } from '../internationals';
import type { TournamentSummary, IntlTie } from '../../types/league';

const tie = (round: string, home: string, away: string, winner: string): IntlTie =>
  ({ round, homeNation: home, awayNation: away, homeGoals: 1, awayGoals: 0, winner });

const base: TournamentSummary = {
  kind: 'WORLD_CUP', name: 'World Cup 2026', year: 2026,
  championNation: 'France', runnerUpNation: 'Brazil',
  groups: [], topScorers: [], topAssisters: [],
  participants: ['France', 'Brazil', 'Spain', 'Ghana', 'Japan'],
  knockout: [
    tie('Round of 32', 'Spain', 'Japan', 'Spain'),
    tie('Quarter-final', 'Spain', 'Ghana', 'Spain'),
    tie('Semi-final', 'France', 'Spain', 'France'),
    tie('Final', 'France', 'Brazil', 'France'),
  ],
};

describe('nationFinish', () => {
  it('grades champions, runners-up and semi-finalists', () => {
    expect(nationFinish(base, 'France')).toMatchObject({ label: 'champions', champion: true, repDelta: 12 });
    expect(nationFinish(base, 'Brazil')).toMatchObject({ label: 'runners-up', repDelta: 6 });
    expect(nationFinish(base, 'Spain')).toMatchObject({ label: 'semi-finalists', repDelta: 3 });
  });

  it('grades early knockout exits and group-stage exits', () => {
    expect(nationFinish(base, 'Ghana')?.label).toBe('quarter-finalists');
    expect(nationFinish(base, 'Japan')?.label).toContain('Round of 32');
    expect(nationFinish(base, 'Japan')?.repDelta).toBeLessThan(0);
    // Participant with no knockout appearance → group-stage exit.
    const withGroupOnly = { ...base, participants: [...base.participants, 'Canada'] };
    expect(nationFinish(withGroupOnly, 'Canada')).toMatchObject({ label: 'out at the group stage', repDelta: -4 });
  });

  it('returns null for nations that did not qualify', () => {
    expect(nationFinish(base, 'Iceland')).toBeNull();
  });
});
