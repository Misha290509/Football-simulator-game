import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { useGameStore } from '../store';
import { createNewGame } from '../../game/newGame';
import { loadDataset } from '../../data/datasetLoader';
import { ENGLAND_DATASET } from '../../data/england';
import { createSave } from '../../db/db';
import type { Player } from '../../types/player';

function managerClubId(): string {
  const world = loadDataset(ENGLAND_DATASET, 99, 2024);
  const comp = Object.values(world.competitions).find((c) => c.tier === 1)!;
  return comp.clubIds[0];
}

async function freshGame() {
  const snap = createNewGame({
    saveName: 'Enquire Loan Buy — Test', managerName: 'M', dataset: ENGLAND_DATASET,
    managerClubId: managerClubId(), startYear: 2024, seed: 7,
  });
  await createSave(snap);
  await useGameStore.getState().load(snap.meta.id);
}

/** Turn a squad player into a loanee from another club, with a big buyer budget. */
function injectLoanee(): { id: string; parentId: string } {
  const s = useGameStore.getState();
  const myId = s.meta!.managerClubId;
  const squad = s.getClubPlayers(myId);
  const parent = Object.values(s.clubs).find((c) => c.id !== myId)!;
  const p = squad[0];
  const year = s.currentSeason()?.year ?? s.meta!.startYear;
  const loaned: Player = { ...p, loan: { parentClubId: parent.id, untilYear: year + 1, wageSplitParent: 0.5, optionToBuy: null } };
  const buyer = { ...s.clubs[myId], finances: { ...s.clubs[myId].finances, transferBudget: 900_000_000 } };
  useGameStore.setState({
    players: { ...s.players, [p.id]: loaned },
    clubs: { ...s.clubs, [myId]: buyer },
  });
  return { id: p.id, parentId: parent.id };
}

describe('Enquire to buy a loanee', () => {
  beforeEach(() => {
    useGameStore.setState({ loaded: false, meta: null, clubs: {}, players: {}, matches: {} });
  });

  it('counters a lowball and completes a permanent signing when the fee is met', async () => {
    await freshGame();
    const { id } = injectLoanee();
    const s = () => useGameStore.getState();

    // A derisory bid doesn't buy the player — the parent counters (still loaned).
    const low = await s().enquireLoanBuy(id, 1);
    expect(low.ok).toBe(false);
    expect(low.outcome === 'COUNTER' || low.outcome === 'REFUSE').toBe(true);
    expect(s().players[id].loan).toBeTruthy();

    // A fee that clears their floor completes the deal.
    const myId = s().meta!.managerClubId;
    const budgetBefore = s().clubs[myId].finances.transferBudget;
    const big = await s().enquireLoanBuy(id, 400_000_000);
    expect(big.ok).toBe(true);
    expect(big.outcome).toBe('ACCEPT');

    // The player is now owned outright: loan cleared, contract at our club.
    const bought = s().players[id];
    expect(bought.loan == null).toBe(true);
    expect(bought.contract.clubId).toBe(myId);
    // Fee was actually paid.
    expect(s().clubs[myId].finances.transferBudget).toBeLessThan(budgetBefore);
    // He shows in the squad without a loan flag.
    expect(s().getClubPlayers(myId).some((p) => p.id === id && !p.loan)).toBe(true);
  });

  it('refuses to buy a player who is not on loan at your club', async () => {
    await freshGame();
    const s = () => useGameStore.getState();
    const myId = s().meta!.managerClubId;
    const owned = s().getClubPlayers(myId)[0]; // not a loanee
    const r = await s().enquireLoanBuy(owned.id, 5_000_000);
    expect(r.ok).toBe(false);
  });
});
