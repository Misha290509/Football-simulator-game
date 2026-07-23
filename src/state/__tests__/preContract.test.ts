import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { useGameStore } from '../store';
import { createNewGame } from '../../game/newGame';
import { loadDataset } from '../../data/datasetLoader';
import { ENGLAND_DATASET } from '../../data/england';
import { createSave } from '../../db/db';
import { canAgreePreContract } from '../../game/transfers';
import type { ContractOffer } from '../../game/contracts';

function managerClubId(): string {
  const world = loadDataset(ENGLAND_DATASET, 55, 2024);
  const comp = Object.values(world.competitions).find((c) => c.tier === 1)!;
  return comp.clubIds[0];
}

async function freshGame() {
  const snap = createNewGame({
    saveName: 'Bosman — Test', managerName: 'M', dataset: ENGLAND_DATASET,
    managerClubId: managerClubId(), startYear: 2024, seed: 5,
  });
  await createSave(snap);
  await useGameStore.getState().load(snap.meta.id);
}

const terms = (): ContractOffer => ({ wage: 20_000, years: 3, signingBonus: 0, releaseClause: null, squadRole: 'ROTATION' });

describe('Bosman pre-contracts (#34)', () => {
  beforeEach(() => {
    useGameStore.setState({ loaded: false, meta: null, clubs: {}, players: {}, matches: {} });
  });

  it('eligibility: only an expiring player at another club, in Jan–May', () => {
    const seasonYear = 2024;
    const base = { contract: { clubId: 'OTHER', expiresYear: 2024 }, loan: null } as never;
    // Expiring this summer, in March → eligible.
    expect(canAgreePreContract({ ...base } as never, 'ME', seasonYear, 2).ok).toBe(true);
    // Contract runs beyond this season → not eligible.
    expect(canAgreePreContract({ contract: { clubId: 'OTHER', expiresYear: 2026 } } as never, 'ME', seasonYear, 2).ok).toBe(false);
    // Autumn (September) → outside the window.
    expect(canAgreePreContract({ ...base } as never, 'ME', seasonYear, 8).ok).toBe(false);
    // Already at the manager's club → renewal, not a Bosman.
    expect(canAgreePreContract({ contract: { clubId: 'ME', expiresYear: 2024 } } as never, 'ME', seasonYear, 2).ok).toBe(false);
    // Free agent → sign outright, not a pre-contract.
    expect(canAgreePreContract({ contract: { clubId: null, expiresYear: 2024 } } as never, 'ME', seasonYear, 2).ok).toBe(false);
  });

  it('agreeing a pre-contract stages a free arrival and flags the player', async () => {
    await freshGame();
    const s = () => useGameStore.getState();
    const mgrId = s().meta!.managerClubId;

    // Find an expiring player at another club and force the calendar into the window.
    const seasonYear = s().currentSeason()?.year ?? 2024;
    const target = Object.values(s().players).find(
      (p) => p.contract.clubId && p.contract.clubId !== mgrId && !p.loan,
    )!;
    // Make him a free-transfer candidate this summer.
    useGameStore.setState((st) => ({
      players: { ...st.players, [target.id]: { ...target, contract: { ...target.contract, expiresYear: seasonYear } } },
    }));

    // Stub the calendar month into the pre-contract window (March).
    const realCtx = s().preContractContext;
    useGameStore.setState({ preContractContext: () => ({ seasonYear, month: 2 }) } as never);

    const res = await s().agreePreContract(target.id, terms());
    expect(res.ok).toBe(true);

    // Player is flagged, and a free (fee 0) arrival is staged.
    expect(s().players[target.id].preContract?.toClubId).toBe(mgrId);
    const arrival = (s().meta!.pendingArrivals ?? []).find((a) => a.playerId === target.id);
    expect(arrival).toBeTruthy();
    expect(arrival!.fee).toBe(0);
    expect(arrival!.toClubId).toBe(mgrId);
    // He still belongs to his old club until the summer.
    expect(s().players[target.id].contract.clubId).not.toBe(mgrId);

    // A second attempt is rejected — already pre-agreed.
    const again = await s().agreePreContract(target.id, terms());
    expect(again.ok).toBe(false);

    useGameStore.setState({ preContractContext: realCtx } as never);
  });
});
