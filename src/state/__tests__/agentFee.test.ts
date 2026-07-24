import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { useGameStore } from '../store';
import { createNewGame } from '../../game/newGame';
import { loadDataset } from '../../data/datasetLoader';
import { ENGLAND_DATASET } from '../../data/england';
import { createSave } from '../../db/db';
import type { ContractOffer } from '../../game/contracts';

function managerClubId(): string {
  const world = loadDataset(ENGLAND_DATASET, 44, 2024);
  const comp = Object.values(world.competitions).find((c) => c.tier === 1)!;
  return comp.clubIds[0];
}

async function freshGame() {
  const snap = createNewGame({
    saveName: 'Agent — Test', managerName: 'M', dataset: ENGLAND_DATASET,
    managerClubId: managerClubId(), startYear: 2024, seed: 6,
  });
  await createSave(snap);
  await useGameStore.getState().load(snap.meta.id);
}

const terms = (wage: number): ContractOffer => ({ wage, years: 4, signingBonus: 0, releaseClause: null, squadRole: 'FIRST', loyaltyBonus: 0, appearanceBonus: 0, goalBonus: 0 });

describe('agent fees on signings (#35)', () => {
  beforeEach(() => {
    useGameStore.setState({ loaded: false, meta: null, clubs: {}, players: {}, matches: {} });
  });

  it('charges an agent fee on top of the transfer fee', async () => {
    await freshGame();
    const s = () => useGameStore.getState();
    const mgrId = s().meta!.managerClubId;
    useGameStore.setState((st) => ({
      clubs: { ...st.clubs, [mgrId]: { ...st.clubs[mgrId], finances: { ...st.clubs[mgrId].finances, balance: 500_000_000, transferBudget: 500_000_000, wageBudget: 10_000_000 } } },
    }));

    const target = Object.values(s().players).find((p) => p.contract.clubId && p.contract.clubId !== mgrId && !p.loan)!;
    const balBefore = s().clubs[mgrId].finances.balance;
    const fee = 10_000_000;
    const wage = 60_000;

    const res = await s().completeSigning(target.id, fee, terms(wage), 1);
    expect(res.ok).toBe(true);

    const balAfter = s().clubs[mgrId].finances.balance;
    const drop = balBefore - balAfter;
    // Fee + agent fee (0.08*fee + 12*wage) leave the balance.
    const expectedAgent = Math.round(0.08 * fee + 12 * wage);
    expect(drop).toBe(fee + expectedAgent);
    // The signing news mentions the agent fee.
    expect(s().meta!.news.some((n) => /Agent fee/.test(n.body))).toBe(true);
  });
});
