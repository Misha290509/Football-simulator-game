import { describe, it, expect } from 'vitest';
import { buildInteractiveInput } from '../interactivePlay';
import { generatePlayer } from '../../engine/generator';
import { Rng } from '../../engine/rng';
import type { Player } from '../../types/player';
import type { Club } from '../../types/club';
import type { Match } from '../../types/match';
import type { PlayerCareer } from '../../types/playerCareer';

function squad(clubId: string, seedBase: number): Player[] {
  const positions: Player['position'][] = ['GK', 'RB', 'RCB', 'LCB', 'LB', 'CDM', 'CM', 'CAM', 'RM', 'LM', 'ST'];
  return positions.map((pos, i) => {
    const p = generatePlayer({ rng: new Rng(seedBase + i), currentYear: 2025, target: 74, position: pos, ageRange: [24, 24], ratingCap: 90 });
    p.contract.clubId = clubId;
    return p;
  });
}

const club = (id: string, name: string, shortName: string): Club =>
  ({ id, name, shortName, formation: '4-3-3', reputation: 75 } as unknown as Club);

const career = (): PlayerCareer => ({
  playerId: 'av', origin: {} as PlayerCareer['origin'], archetype: 'x',
  status: 'KEY', managerTrust: 70, confidence: 60,
} as unknown as PlayerCareer);

function setup(homeName: string, awayName: string) {
  const home = squad('H', 100); const away = squad('A', 500);
  const avatar = home[10]; avatar.id = 'av'; avatar.overall = 82; avatar.fitness = 100;
  const players: Record<string, Player> = {};
  for (const p of [...home, ...away]) players[p.id] = p;
  const clubs: Record<string, Club> = { H: club('H', homeName, homeName), A: club('A', awayName, awayName) };
  const match = { id: 'm1', homeClubId: 'H', awayClubId: 'A', competitionId: 'LEAGUE', day: 10 } as unknown as Match;
  return { players, clubs, match, avatar };
}

describe('buildInteractiveInput — occasion framing', () => {
  it('flags a derby and raises the stakes when the two clubs are traditional rivals', () => {
    const { players, clubs, match, avatar } = setup('Arsenal', 'Tottenham Hotspur');
    const r = buildInteractiveInput({ seed: 1, competitions: {} }, players, clubs, match, avatar, career());
    expect(r.input.occasion?.kind).toBe('DERBY');
    expect(r.input.importance).toBeGreaterThanOrEqual(0.78);
  });

  it('a non-rivalry fixture is not a derby', () => {
    const { players, clubs, match, avatar } = setup('Arsenal', 'Everton');
    const r = buildInteractiveInput({ seed: 1, competitions: {} }, players, clubs, match, avatar, career());
    expect(r.input.occasion?.kind).not.toBe('DERBY');
  });

  it('assigns a personal duel marker — an attacker draws an opposing defender', () => {
    const { players, clubs, match, avatar } = setup('Arsenal', 'Everton');
    const r = buildInteractiveInput({ seed: 1, competitions: {} }, players, clubs, match, avatar, career());
    expect(r.input.marker).toBeTruthy();
    expect(['RCB', 'LCB', 'RB', 'LB']).toContain(r.input.marker!.role);
    expect(r.input.marker!.rating).toBeGreaterThan(0);
  });

  it('flags a reunion when the opponent is a club the avatar used to play for', () => {
    const { players, clubs, match, avatar } = setup('Arsenal', 'Everton');
    const c = { ...career(), seasonHistory: [{ season: '2023/24', club: 'Everton', apps: 30, goals: 5, assists: 3, avgRating: 7, honours: [] }] } as unknown as PlayerCareer;
    const r = buildInteractiveInput({ seed: 1, competitions: {} }, players, clubs, match, avatar, c);
    expect(r.input.occasion?.kind).toBe('FORMER_CLUB');
    expect(r.input.importance).toBeGreaterThanOrEqual(0.72);
  });
});
