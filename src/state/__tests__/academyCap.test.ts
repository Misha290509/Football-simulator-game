import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { useGameStore } from '../store';
import { createNewGame } from '../../game/newGame';
import { loadDataset } from '../../data/datasetLoader';
import { ENGLAND_DATASET } from '../../data/england';
import { createSave } from '../../db/db';
import { ACADEMY_MAX_PER_GROUP } from '../../game/academy';

function managerClubId(): string {
  const world = loadDataset(ENGLAND_DATASET, 99, 2024);
  const comp = Object.values(world.competitions).find((c) => c.tier === 1)!;
  return comp.clubIds[0];
}

async function freshGame() {
  const snap = createNewGame({
    saveName: 'Academy Cap — Test', managerName: 'M', dataset: ENGLAND_DATASET,
    managerClubId: managerClubId(), startYear: 2024, seed: 7,
  });
  await createSave(snap);
  await useGameStore.getState().load(snap.meta.id);
}

describe('Academy age-band signing cap (25 per band)', () => {
  beforeEach(() => {
    useGameStore.setState({ loaded: false, meta: null, clubs: {}, players: {}, matches: {} });
  });

  it('blocks signing a prospect when the target band is full', async () => {
    await freshGame();
    const s = () => useGameStore.getState();
    const myId = s().meta!.managerClubId;

    // Fill the U16 band (14–15yos) to the cap with fake academy players.
    const academyPlayers: Record<string, unknown> = { ...s().meta!.academyPlayers };
    let u16 = 0;
    for (const ap of Object.values(academyPlayers) as { clubId: string; ageGroup: string }[]) {
      if (ap.clubId === myId && ap.ageGroup === 'U16') u16++;
    }
    for (let i = u16; i < ACADEMY_MAX_PER_GROUP; i++) {
      academyPlayers[`cap_u16_${i}`] = { playerId: `cap_u16_${i}`, clubId: myId, ageGroup: 'U16', playedUp: false, heldBack: false, ageGroupPerformance: 50, readiness: 0, contractStatus: 'schoolboy', dualRegistered: false, personality: { determination: 50, professionalism: 50, ambition: 50 }, flameOutRisk: 0.2, isProdigy: false };
    }

    // A 15-year-old prospect report → lands in the (now full) U16 band.
    const prospect = {
      player: { id: 'want', name: { first: 'Kid', last: 'Fifteen' }, position: 'CM', born: { year: 2009 }, contract: { clubId: null }, overall: 55, potential: 80, nationality: 'GB', squadRole: 'PROSPECT' } as never,
      academy: { playerId: 'want', clubId: myId, ageGroup: 'U16', isProdigy: false, personality: { determination: 50, professionalism: 50, ambition: 50 } } as never,
      knowledgePct: 40, trialled: false, discoveredByClubId: myId,
    };
    useGameStore.setState({ meta: { ...s().meta!, academyPlayers, youthProspects: [prospect] } as never });

    const res = await s().signYouthProspect('want');
    expect(res.ok).toBe(false);
    expect(res.message).toContain('Maximum squad size reached for U16');
    // The prospect is still on the report list (not consumed).
    expect((s().meta!.youthProspects ?? []).some((p) => p.player.id === 'want')).toBe(true);
  });

  it('allows the sign when the target band still has room', async () => {
    await freshGame();
    const s = () => useGameStore.getState();
    const myId = s().meta!.managerClubId;

    // A 15-year-old prospect; U16 band is not artificially filled here.
    const prospect = {
      player: { id: 'ok', name: { first: 'Kid', last: 'Room' }, position: 'CM', born: { year: 2009 }, contract: { clubId: null }, overall: 55, potential: 80, nationality: 'GB', squadRole: 'PROSPECT' } as never,
      academy: { playerId: 'ok', clubId: myId, ageGroup: 'U16', isProdigy: false, personality: { determination: 50, professionalism: 50, ambition: 50 } } as never,
      knowledgePct: 40, trialled: false, discoveredByClubId: myId,
    };
    useGameStore.setState({ meta: { ...s().meta!, youthProspects: [prospect] } as never });

    const res = await s().signYouthProspect('ok');
    expect(res.ok).toBe(true);
    expect(s().players['ok']).toBeTruthy();
    expect(s().meta!.academyPlayers!['ok']).toBeTruthy();
  });
});
