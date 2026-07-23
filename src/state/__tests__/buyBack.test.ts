import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { useGameStore } from '../store';
import { createNewGame } from '../../game/newGame';
import { loadDataset } from '../../data/datasetLoader';
import { ENGLAND_DATASET } from '../../data/england';
import { createSave } from '../../db/db';
import type { ContractOffer } from '../../game/contracts';
import type { TransferOffer } from '../../types/league';

function managerClubId(): string {
  const world = loadDataset(ENGLAND_DATASET, 71, 2024);
  const comp = Object.values(world.competitions).find((c) => c.tier === 1)!;
  return comp.clubIds[0];
}

async function freshGame() {
  const snap = createNewGame({
    saveName: 'BuyBack — Test', managerName: 'M', dataset: ENGLAND_DATASET,
    managerClubId: managerClubId(), startYear: 2024, seed: 9,
  });
  await createSave(snap);
  await useGameStore.getState().load(snap.meta.id);
}

const terms = (): ContractOffer => ({ wage: 30_000, years: 3, signingBonus: 0, releaseClause: null, squadRole: 'FIRST', loyaltyBonus: 0, appearanceBonus: 0, goalBonus: 0 });

describe('buy-back clauses (#33)', () => {
  beforeEach(() => {
    useGameStore.setState({ loaded: false, meta: null, clubs: {}, players: {}, matches: {} });
  });

  it('sells with a buy-back clause and lets the manager re-sign at the fixed fee', async () => {
    await freshGame();
    const s = () => useGameStore.getState();
    const mgrId = s().meta!.managerClubId;

    // Pick one of the manager's own players and stage an incoming AI bid.
    const mine = Object.values(s().players).find((p) => p.contract.clubId === mgrId && !p.loan)!;
    const aiClub = Object.values(s().clubs).find((c) => c.id !== mgrId && c.finances.transferBudget > 30_000_000)!;
    // Give the manager plenty of budget to buy him back.
    useGameStore.setState((st) => ({
      clubs: { ...st.clubs, [mgrId]: { ...st.clubs[mgrId], finances: { ...st.clubs[mgrId].finances, transferBudget: 200_000_000, wageBudget: 5_000_000 } } },
    }));
    const offer: TransferOffer = { id: 'ob1', type: 'BUY', playerId: mine.id, fromClubId: aiClub.id, fee: 10_000_000, wage: mine.contract.wage, day: s().meta!.currentDay };
    useGameStore.setState((st) => ({ meta: { ...st.meta!, pendingOffers: [offer] } }));

    // Accept with a buy-back clause.
    await s().acceptOffer('ob1', { price: 16_000_000, years: 3 });
    const sold = s().players[mine.id];
    expect(sold.contract.clubId).toBe(aiClub.id);
    expect(sold.buyBack).toEqual({ clubId: mgrId, price: 16_000_000, untilYear: 2024 + 3 });

    // Trigger the buy-back (window is open at season start).
    const res = await s().triggerBuyBack(mine.id, terms());
    expect(res.ok).toBe(true);
    const back = s().players[mine.id];
    expect(back.contract.clubId).toBe(mgrId);
    expect(back.buyBack == null).toBe(true);
  });

  it('refuses a buy-back the manager does not hold', async () => {
    await freshGame();
    const s = () => useGameStore.getState();
    const mgrId = s().meta!.managerClubId;
    const other = Object.values(s().players).find((p) => p.contract.clubId && p.contract.clubId !== mgrId)!;
    const res = await s().triggerBuyBack(other.id, terms());
    expect(res.ok).toBe(false);
  });
});
