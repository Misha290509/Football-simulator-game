import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { useGameStore } from '../store';
import { createNewGame } from '../../game/newGame';
import { loadDataset } from '../../data/datasetLoader';
import { ENGLAND_DATASET } from '../../data/england';
import { createSave } from '../../db/db';
import type { ContractOffer } from '../../game/contracts';

function managerClubId(): string {
  const world = loadDataset(ENGLAND_DATASET, 33, 2024);
  const comp = Object.values(world.competitions).find((c) => c.tier === 1)!;
  return comp.clubIds[0];
}

async function freshGame() {
  const snap = createNewGame({
    saveName: 'Swap — Test', managerName: 'M', dataset: ENGLAND_DATASET,
    managerClubId: managerClubId(), startYear: 2024, seed: 4,
  });
  await createSave(snap);
  await useGameStore.getState().load(snap.meta.id);
}

const terms = (wage: number): ContractOffer => ({ wage, years: 4, signingBonus: 0, releaseClause: null, squadRole: 'FIRST', loyaltyBonus: 0, appearanceBonus: 0, goalBonus: 0 });

describe('part-exchange swaps (#32)', () => {
  beforeEach(() => {
    useGameStore.setState({ loaded: false, meta: null, clubs: {}, players: {}, matches: {} });
  });

  it('swaps a player + cash for a target and moves both players', async () => {
    await freshGame();
    const s = () => useGameStore.getState();
    const mgrId = s().meta!.managerClubId;

    // Give the manager a generous budget so the cash element clears.
    useGameStore.setState((st) => ({
      clubs: { ...st.clubs, [mgrId]: { ...st.clubs[mgrId], finances: { ...st.clubs[mgrId].finances, transferBudget: 300_000_000, wageBudget: 10_000_000 } } },
    }));

    const offered = Object.values(s().players).find((p) => p.contract.clubId === mgrId && !p.loan)!;
    // A target at another club.
    const seller = Object.values(s().clubs).find((c) => c.id !== mgrId)!;
    const target = Object.values(s().players).find((p) => p.contract.clubId === seller.id && !p.loan)!;
    const sellerId = seller.id;

    const res = await s().proposeSwap(target.id, offered.id, 60_000_000, terms(target.contract.wage + 50_000));
    expect(res.ok).toBe(true);

    // Players changed hands.
    expect(s().players[target.id].contract.clubId).toBe(mgrId);
    expect(s().players[offered.id].contract.clubId).toBe(sellerId);
    // Rosters updated on both clubs.
    expect(s().clubs[mgrId].playerIds).toContain(target.id);
    expect(s().clubs[mgrId].playerIds).not.toContain(offered.id);
    expect(s().clubs[sellerId].playerIds).toContain(offered.id);
    expect(s().clubs[sellerId].playerIds).not.toContain(target.id);
  });

  it('rejects a swap when the package falls short of the asking price', async () => {
    await freshGame();
    const s = () => useGameStore.getState();
    const mgrId = s().meta!.managerClubId;
    const offered = Object.values(s().players).filter((p) => p.contract.clubId === mgrId && !p.loan).sort((a, b) => a.overall - b.overall)[0];
    // Target = a strong player at another club; offer a weak player + no cash.
    const seller = Object.values(s().clubs).find((c) => c.id !== mgrId && c.reputation > 70)!;
    const target = Object.values(s().players).filter((p) => p.contract.clubId === seller.id && !p.loan).sort((a, b) => b.overall - a.overall)[0];
    const res = await s().proposeSwap(target.id, offered.id, 0, terms(target.contract.wage + 100_000));
    expect(res.ok).toBe(false);
  });
});
