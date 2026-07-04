import { describe, it, expect } from 'vitest';
import { Rng } from '../rng';
import { generatePlayer, generateSquad } from '../generator';
import { developPlayer, shouldRetire, generateYouthIntake } from '../development';
import { processMatchday } from '../progression';
import type { Player } from '../../types/player';
import type { Match } from '../../types/match';

describe('Development & aging', () => {
  it('young high-potential players tend to improve with minutes', () => {
    const young = generatePlayer({ rng: new Rng(3), currentYear: 2024, target: 60, position: 'CM', ageRange: [17, 18] });
    young.potential = Math.max(young.potential, young.overall + 15);
    const before = young.overall;
    const dev = developPlayer(young, 2025, new Rng(11), {
      perf: { minutes: 2800, avgRating: 7.5, goals: 8, assists: 6, cleanSheets: 0, appearances: 34 },
    });
    expect(dev.overall).toBeGreaterThanOrEqual(before);
    expect(dev.developmentLog.length).toBe(young.developmentLog.length + 1);
  });

  it('old players decline', () => {
    const vet = generatePlayer({ rng: new Rng(8), currentYear: 2024, target: 80, position: 'ST', ageRange: [35, 35] });
    const dev = developPlayer(vet, 2025, new Rng(9), {
      perf: { minutes: 1500, avgRating: 6.6, goals: 6, assists: 2, cleanSheets: 0, appearances: 20 },
    });
    expect(dev.overall).toBeLessThanOrEqual(vet.overall);
  });

  it('resets transient state at season start', () => {
    const p = generatePlayer({ rng: new Rng(2), currentYear: 2024, target: 70, position: 'RCB' });
    p.fitness = 50; p.form = -40; p.fatigueLoad = 70; p.cards.yellow = 3;
    const dev = developPlayer(p, 2025, new Rng(1), {});
    expect(dev.fitness).toBe(100);
    expect(dev.form).toBe(0);
    expect(dev.fatigueLoad).toBe(0);
    expect(dev.cards.yellow).toBe(0);
  });

  it('retires very old players and never the young', () => {
    const old = generatePlayer({ rng: new Rng(1), currentYear: 2024, target: 70, position: 'GK', ageRange: [41, 41] });
    expect(shouldRetire(old, 2024, new Rng(1))).toBe(true);
    const kid = generatePlayer({ rng: new Rng(1), currentYear: 2024, target: 70, position: 'GK', ageRange: [20, 20] });
    expect(shouldRetire(kid, 2024, new Rng(1))).toBe(false);
  });

  it('generates youth prospects tied to the club', () => {
    const youth = generateYouthIntake('club_x', 80, 'GB', 2025, new Rng(5));
    expect(youth.length).toBeGreaterThanOrEqual(1);
    for (const y of youth) {
      expect(y.contract.clubId).toBe('club_x');
      expect(2025 - y.born.year).toBeLessThanOrEqual(18);
      expect(y.squadRole).toBe('PROSPECT');
    }
  });
});

describe('Match-day aftermath', () => {
  const squad = generateSquad({ rng: new Rng(7), currentYear: 2024, reputation: 70, clubId: 'A', nationality: 'GB' });
  const squadB = generateSquad({ rng: new Rng(8), currentYear: 2024, reputation: 70, clubId: 'B', nationality: 'GB' });
  const playersById: Record<string, Player> = {};
  for (const p of [...squad, ...squadB]) playersById[p.id] = p;

  const match: Match = {
    id: 'm1', competitionId: 'c', seasonId: 's', round: 1, day: 0,
    homeClubId: 'A', awayClubId: 'B', played: true,
    homeGoals: 2, awayGoals: 0, homeXg: 1.9, awayXg: 0.4,
    events: [], seed: 1,
    playerStats: [
      { playerId: squad[0].id, minutes: 90, goals: 1, assists: 0, shots: 3, rating: 8.1, yellow: false, red: false },
      { playerId: squad[1].id, minutes: 90, goals: 0, assists: 0, shots: 0, rating: 6.5, yellow: true, red: false },
      { playerId: squadB[0].id, minutes: 90, goals: 0, assists: 0, shots: 2, rating: 5.2, yellow: false, red: true },
    ],
  };

  it('is deterministic for a given seed', () => {
    const a = processMatchday([match], playersById, 2024, 999);
    const b = processMatchday([match], playersById, 2024, 999);
    expect(a.changedPlayers.map((p) => p.id).sort()).toEqual(b.changedPlayers.map((p) => p.id).sort());
  });

  it('reduces fitness for players who featured and accrues a card', () => {
    const res = processMatchday([match], playersById, 2024, 1);
    const changed = new Map(res.changedPlayers.map((p) => [p.id, p]));
    expect(changed.get(squad[0].id)!.fitness).toBeLessThan(playersById[squad[0].id].fitness);
    expect(changed.get(squad[1].id)!.cards.yellow).toBe(1);
    // Straight red → suspension.
    expect(changed.get(squadB[0].id)!.cards.suspendedFor).toBeGreaterThanOrEqual(1);
  });

  it('boosts morale for winners and dents it for losers', () => {
    const res = processMatchday([match], playersById, 2024, 2);
    const changed = new Map(res.changedPlayers.map((p) => [p.id, p]));
    expect(changed.get(squad[0].id)!.morale).toBeGreaterThan(playersById[squad[0].id].morale);
    expect(changed.get(squadB[0].id)!.morale).toBeLessThan(playersById[squadB[0].id].morale);
  });
});
