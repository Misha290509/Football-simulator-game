import { describe, it, expect } from 'vitest';
import { buildDeadlineFeed } from '../deadlineDay';
import type { AiDeal } from '../aiTransfers';
import type { Player } from '../../types/player';
import type { Club } from '../../types/club';

const club = (id: string, shortName: string): Club => ({
  id, name: shortName, shortName, abbrev: id.toUpperCase().slice(0, 3), countryId: 'EN',
  crestSeed: 'x', primaryColor: '#000', secondaryColor: '#fff',
  stadium: { name: 'G', capacity: 1 }, reputation: 70,
  finances: { balance: 0, transferBudget: 0, wageBudget: 0, wageBudgetUsed: 0 },
  playerIds: [], formation: '4-3-3', captainId: null,
});

const player = (id: string, first: string, last: string): Player => ({ id, name: { first, last } } as unknown as Player);

describe('deadline-day feed (#31)', () => {
  const clubs = { A: club('A', 'Alpha'), B: club('B', 'Beta'), C: club('C', 'Gamma') };
  const players = { p1: player('p1', 'John', 'Doe'), p2: player('p2', 'Max', 'Roe') };
  const deals: AiDeal[] = [
    { playerId: 'p1', playerName: 'J. Doe', fromClubId: 'B', toClubId: 'A', fee: 45_000_000, ovr: 85 },
    { playerId: 'p2', playerName: 'M. Roe', fromClubId: 'C', toClubId: 'B', fee: 8_000_000, ovr: 78 },
  ];

  it('formats deals newest/biggest first with a descending clock and flags big money', () => {
    const feed = buildDeadlineFeed(deals, [], players, clubs, 'Summer', 40);
    expect(feed.windowLabel).toBe('Summer');
    expect(feed.items.length).toBe(2);
    // The £45m deal ranks first and is flagged big.
    expect(feed.items[0].text).toContain('Alpha sign J. Doe from Beta');
    expect(feed.items[0].big).toBe(true);
    expect(feed.items[1].big).toBe(false);
    // Clock is descending (later time first).
    expect(feed.items[0].time >= feed.items[1].time).toBe(true);
    // Every clock reads HH:MM.
    for (const it of feed.items) expect(it.time).toMatch(/^\d{2}:\d{2}$/);
  });

  it('puts the manager’s own moves at the top, flagged as mine', () => {
    const feed = buildDeadlineFeed(deals, [{ playerName: 'Your Star', text: 'You sign Your Star' }], players, clubs, 'Winter', 200);
    expect(feed.items[0].mine).toBe(true);
    expect(feed.items[0].text).toBe('You sign Your Star');
    expect(feed.items.length).toBe(3);
  });

  it('handles an empty deadline with no deals', () => {
    const feed = buildDeadlineFeed([], [], players, clubs, 'Summer', 40);
    expect(feed.items).toEqual([]);
  });
});
