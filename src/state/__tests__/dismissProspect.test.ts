import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { useGameStore } from '../store';
import { createNewGame } from '../../game/newGame';
import { loadDataset } from '../../data/datasetLoader';
import { ENGLAND_DATASET } from '../../data/england';
import { createSave } from '../../db/db';

function managerClubId(): string {
  const world = loadDataset(ENGLAND_DATASET, 99, 2024);
  const comp = Object.values(world.competitions).find((c) => c.tier === 1)!;
  return comp.clubIds[0];
}

async function freshGame() {
  const snap = createNewGame({
    saveName: 'Dismiss Prospect — Test', managerName: 'M', dataset: ENGLAND_DATASET,
    managerClubId: managerClubId(), startYear: 2024, seed: 7,
  });
  await createSave(snap);
  await useGameStore.getState().load(snap.meta.id);
}

describe('Dismiss youth prospects', () => {
  beforeEach(() => {
    useGameStore.setState({ loaded: false, meta: null, clubs: {}, players: {}, matches: {} });
  });

  it('rejects a single prospect and can clear them all', async () => {
    await freshGame();
    const s = () => useGameStore.getState();
    const myId = s().meta!.managerClubId;

    // Build three fake prospect reports discovered by our club.
    const mk = (id: string) => ({
      player: { id, name: { first: 'Yo', last: id }, position: 'CM', contract: { clubId: null }, overall: 55, potential: 70, nationality: 'GB' } as never,
      academy: { clubId: myId, isProdigy: false } as never,
      knowledgePct: 40,
      trialled: false,
      discoveredByClubId: myId,
    });
    useGameStore.setState({ meta: { ...s().meta!, youthProspects: [mk('a'), mk('b'), mk('c')] } as never });
    expect((s().meta!.youthProspects ?? []).length).toBe(3);

    // Reject one → two remain, and it's the right two.
    const r1 = await s().dismissYouthProspect('b');
    expect(r1.ok).toBe(true);
    const after = (s().meta!.youthProspects ?? []).map((p) => p.player.id);
    expect(after).toEqual(['a', 'c']);

    // Rejecting a non-existent report fails cleanly.
    const r2 = await s().dismissYouthProspect('zzz');
    expect(r2.ok).toBe(false);

    // Dismiss all clears the rest.
    const r3 = await s().dismissAllProspects();
    expect(r3.ok).toBe(true);
    expect((s().meta!.youthProspects ?? []).length).toBe(0);

    // Nothing left to clear → not ok.
    const r4 = await s().dismissAllProspects();
    expect(r4.ok).toBe(false);
  });

  it('leaves another club\'s reports untouched when dismissing all', async () => {
    await freshGame();
    const s = () => useGameStore.getState();
    const myId = s().meta!.managerClubId;
    const mk = (id: string, club: string) => ({
      player: { id, name: { first: 'Yo', last: id }, position: 'CM', contract: { clubId: null }, overall: 55, potential: 70, nationality: 'GB' } as never,
      academy: { clubId: club, isProdigy: false } as never,
      knowledgePct: 40, trialled: false, discoveredByClubId: club,
    });
    useGameStore.setState({ meta: { ...s().meta!, youthProspects: [mk('mine', myId), mk('theirs', 'other_club')] } as never });

    await s().dismissAllProspects();
    const left = (s().meta!.youthProspects ?? []).map((p) => p.player.id);
    expect(left).toEqual(['theirs']);
  });
});
