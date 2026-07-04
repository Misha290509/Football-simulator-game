import { describe, it, expect } from 'vitest';
import { loadDataset } from '../../data/datasetLoader';
import { ENGLAND_DATASET } from '../../data/england';
import { computeSeasonFinances, deriveBudgets } from '../finances';
import { evaluateBid, applyTransfer, askingPrice, wageDemand } from '../../game/transfers';
import type { Player } from '../../types/player';

const world = loadDataset(ENGLAND_DATASET, 555, 2024);
const clubs = Object.values(world.clubs);

describe('Finances', () => {
  it('top-tier champions earn more than mid-table', () => {
    const club = clubs[0];
    const champ = computeSeasonFinances(club, 1, 20, 1, 2_000_000);
    const mid = computeSeasonFinances(club, 10, 20, 1, 2_000_000);
    expect(champ.income).toBeGreaterThan(mid.income);
  });

  it('derives non-negative budgets', () => {
    const b = deriveBudgets(50_000_000, 1_500_000, 85, 1);
    expect(b.transferBudget).toBeGreaterThan(0);
    expect(b.wageBudget).toBeGreaterThanOrEqual(1_500_000);
  });
});

describe('Bidding', () => {
  const buyer = { ...clubs[0], finances: { balance: 200_000_000, transferBudget: 100_000_000, wageBudget: 5_000_000, wageBudgetUsed: 0 } };
  const seller = clubs[1];
  const target: Player = Object.values(world.players).find((p) => p.contract.clubId === seller.id)!;

  it('rejects a lowball fee', () => {
    const res = evaluateBid(buyer, seller, target, askingPrice(target) - 1_000_000, wageDemand(target), 0);
    expect(res.ok).toBe(false);
  });

  it('rejects an underpaid wage', () => {
    const res = evaluateBid(buyer, seller, target, askingPrice(target), wageDemand(target) - 5_000, 0);
    expect(res.ok).toBe(false);
  });

  it('accepts a fair bid and moves the player + money', () => {
    const fee = askingPrice(target);
    const wage = wageDemand(target);
    const res = evaluateBid(buyer, seller, target, fee, wage, 0);
    expect(res.ok).toBe(true);
    const upd = applyTransfer(buyer, seller, target, fee, wage, 2024);
    expect(upd.player.contract.clubId).toBe(buyer.id);
    expect(upd.buyer.playerIds).toContain(target.id);
    expect(upd.seller!.playerIds).not.toContain(target.id);
    expect(upd.buyer.finances.balance).toBe(buyer.finances.balance - fee);
    expect(upd.seller!.finances.balance).toBe(seller.finances.balance + fee);
  });

  it('blocks bids beyond the transfer budget', () => {
    const poor = { ...buyer, finances: { ...buyer.finances, transferBudget: 100_000 } };
    const res = evaluateBid(poor, seller, target, askingPrice(target), wageDemand(target), 0);
    expect(res.ok).toBe(false);
  });
});
