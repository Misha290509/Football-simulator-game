import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { useGameStore } from '../store';
import { createNewGame } from '../../game/newGame';
import { loadDataset } from '../../data/datasetLoader';
import { ENGLAND_DATASET } from '../../data/england';
import { createSave } from '../../db/db';
import type { SaveMeta } from '../../db/db';
import { ageGroupForAge } from '../../engine/academy';

// Being dismissed blocks play until a new job is taken, so the sacked flow must
// never dead-end: offers always exist, declining regenerates them, and
// accepting one actually moves the manager (with a stocked academy waiting).

function managerClubId(): string {
  const world = loadDataset(ENGLAND_DATASET, 99, 2024);
  const comp = Object.values(world.competitions).find((c) => c.tier === 1)!;
  return comp.clubIds[0];
}

async function sackedGame(): Promise<SaveMeta> {
  const snap = createNewGame({
    saveName: 'T — Sacked', managerName: 'M', dataset: ENGLAND_DATASET,
    managerClubId: managerClubId(), startYear: 2024, seed: 123,
  });
  await createSave(snap);
  await useGameStore.getState().load(snap.meta.id);
  // Simulate a dismissal that (as in stuck saves) left no offers behind.
  const meta = { ...useGameStore.getState().meta!, sacked: true, jobOffers: [] };
  useGameStore.setState({ meta });
  return meta;
}

describe('Sacked-manager flow never dead-ends', () => {
  beforeEach(() => {
    useGameStore.setState({ loaded: false, meta: null, clubs: {}, players: {}, matches: {} });
  });

  it('ensureJobOffers heals a stuck save with an empty offer list', async () => {
    await sackedGame();
    await useGameStore.getState().ensureJobOffers();
    const offers = useGameStore.getState().meta!.jobOffers ?? [];
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.every((o) => o.clubId !== useGameStore.getState().meta!.managerClubId)).toBe(true);
  });

  it('declining every offer regenerates fresh ones from other clubs', async () => {
    await sackedGame();
    await useGameStore.getState().ensureJobOffers();
    const first = (useGameStore.getState().meta!.jobOffers ?? []).map((o) => o.clubId);
    for (const o of [...(useGameStore.getState().meta!.jobOffers ?? [])]) {
      await useGameStore.getState().declineJobOffer(o.id);
    }
    const after = useGameStore.getState().meta!.jobOffers ?? [];
    expect(after.length).toBeGreaterThan(0); // never runs dry
    // The regenerated batch skips the clubs just declined.
    expect(after.every((o) => !first.includes(o.clubId))).toBe(true);
  });

  it('accepting an offer unblocks the career and stocks the new academy', async () => {
    await sackedGame();
    await useGameStore.getState().ensureJobOffers();
    const offer = (useGameStore.getState().meta!.jobOffers ?? [])[0];
    const res = await useGameStore.getState().acceptJobOffer(offer.id);
    expect(res.ok).toBe(true);

    const st = useGameStore.getState();
    expect(st.meta!.sacked).toBe(false);
    expect(st.meta!.managerClubId).toBe(offer.clubId);
    expect(st.meta!.jobOffers).toEqual([]);

    // The new club's academy was filled to a full team per age band.
    const year = st.currentSeason()!.year;
    const bands: Record<string, number> = { U16: 0, U18: 0, U21: 0 };
    for (const ap of Object.values(st.meta!.academyPlayers ?? {})) {
      const p = st.players[ap.playerId];
      if (ap.clubId === offer.clubId && p) bands[ageGroupForAge(year - p.born.year)]++;
    }
    expect(bands.U16).toBeGreaterThanOrEqual(18);
    expect(bands.U18).toBeGreaterThanOrEqual(18);
    expect(bands.U21).toBeGreaterThanOrEqual(18);
  });
});
