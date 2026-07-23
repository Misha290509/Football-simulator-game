import { describe, it, expect } from 'vitest';
import { loadDataset } from '../../data/datasetLoader';
import { ENGLAND_DATASET } from '../../data/england';
import { advanceRumours } from '../rumours';
import type { Rumour, TransferOffer } from '../../types/league';

const world = loadDataset(ENGLAND_DATASET, 9, 2024);
const managerClubId = Object.keys(world.clubs)[0];

function step(existing: Rumour[], pending: TransferOffer[], day: number, prevDay: number) {
  return advanceRumours(managerClubId, world.clubs, world.players, existing, pending, 12345, day, prevDay, 2024);
}

describe('transfer rumour mill (#30)', () => {
  it('is deterministic for a given seed and day', () => {
    const a = step([], [], 30, 23);
    const b = step([], [], 30, 23);
    expect(a.rumours).toEqual(b.rumours);
    expect(a.news.map((n) => n.id)).toEqual(b.news.map((n) => n.id));
  });

  it('spawns rumours with news, and rumours reference real players and clubs', () => {
    // Run several advances to accumulate rumours.
    let rumours: Rumour[] = [];
    for (let d = 10; d <= 120; d += 10) rumours = step(rumours, [], d, d - 10).rumours;
    expect(rumours.length).toBeGreaterThan(0);
    for (const r of rumours) {
      expect(world.players[r.playerId]).toBeTruthy();
      expect(world.clubs[r.fromClubId]).toBeTruthy();
      expect(r.heat).toBeGreaterThan(0);
      expect(r.heat).toBeLessThanOrEqual(100);
      expect(['INTEREST', 'PRICE', 'BID_LOOMING']).toContain(r.stage);
      // A club is never linked with poaching its own player.
      expect(world.players[r.playerId].contract.clubId).not.toBe(r.fromClubId);
    }
  });

  it('escalates a manager-player rumour into a real bid, then retires the rumour', () => {
    // Seed a boiling rumour about one of the manager's players.
    const mgrPlayer = Object.values(world.players).find((p) => p.contract.clubId === managerClubId)!;
    const suitor = Object.values(world.clubs).find((c) => c.id !== managerClubId && c.finances.transferBudget > 50_000_000)!;
    const hot: Rumour = { id: `rumour_${mgrPlayer.id}_${suitor.id}`, playerId: mgrPlayer.id, fromClubId: suitor.id, day: 40, heat: 95, stage: 'BID_LOOMING', aboutManagerPlayer: true };

    // Advance until it converts (escalation is probabilistic; a few tries suffice).
    let rumours: Rumour[] = [hot];
    let gotBid = false;
    for (let d = 45; d <= 200 && !gotBid; d += 5) {
      const res = advanceRumours(managerClubId, world.clubs, world.players, rumours, [], 777, d, d - 5, 2024);
      rumours = res.rumours;
      if (res.bids.length) {
        gotBid = true;
        const bid = res.bids[0];
        expect(bid.type).toBe('BUY');
        expect(bid.playerId).toBe(mgrPlayer.id);
        expect(bid.fromClubId).toBe(suitor.id);
        expect(bid.fee).toBeGreaterThan(0);
        // The rumour is spent once it becomes an offer.
        expect(rumours.some((r) => r.playerId === mgrPlayer.id)).toBe(false);
      }
    }
    expect(gotBid).toBe(true);
  });

  it('does not double-bid when an offer for the player is already pending', () => {
    const mgrPlayer = Object.values(world.players).find((p) => p.contract.clubId === managerClubId)!;
    const suitor = Object.values(world.clubs).find((c) => c.id !== managerClubId && c.finances.transferBudget > 50_000_000)!;
    const hot: Rumour = { id: `rumour_${mgrPlayer.id}_${suitor.id}`, playerId: mgrPlayer.id, fromClubId: suitor.id, day: 40, heat: 95, stage: 'BID_LOOMING', aboutManagerPlayer: true };
    const pending: TransferOffer[] = [{ id: 'x', type: 'BUY', playerId: mgrPlayer.id, fromClubId: suitor.id, fee: 1, wage: 1, day: 40 }];
    const res = advanceRumours(managerClubId, world.clubs, world.players, [hot], pending, 777, 45, 40, 2024);
    expect(res.bids.length).toBe(0);
  });
});
