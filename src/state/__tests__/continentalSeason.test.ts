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
    saveName: 'Cont — Test', managerName: 'M', dataset: ENGLAND_DATASET,
    managerClubId: managerClubId(), startYear: 2024, seed: 42,
  });
  await createSave(snap);
  await useGameStore.getState().load(snap.meta.id);
  return useGameStore.getState();
}

describe('Continental competitions across a full season (store)', () => {
  beforeEach(() => {
    useGameStore.setState({ loaded: false, meta: null, clubs: {}, players: {}, matches: {} });
  });

  it('plays the league phase, draws the knockout mid-season, and crowns a champion', async () => {
    await freshGame();
    await useGameStore.getState().simToSeasonEnd();
    const st = useGameStore.getState();

    const cl = st.meta!.continental?.['UEFA_CL'];
    expect(cl).toBeTruthy();
    // The whole competition resolved to a champion during the season.
    expect(cl!.stage).toBe('DONE');
    expect(cl!.championId).toBeTruthy();

    // The final and at least one league-phase match were actually played.
    const clMatches = Object.values(st.matches).filter((m) => m.competitionId === 'UEFA_CL');
    expect(clMatches.some((m) => m.stageLabel === 'League Phase' && m.played)).toBe(true);
    expect(clMatches.some((m) => m.stageLabel === 'Final' && m.played)).toBe(true);

    // Interleaving: knockout ties fall within the domestic season window rather
    // than being appended after it. The final lands around the domestic finale.
    const maxDomesticDay = Object.values(st.matches)
      .filter((m) => st.meta!.competitions[m.competitionId])
      .reduce((mx, m) => Math.max(mx, m.day), 0);
    const koDays = clMatches.filter((m) => m.stageLabel !== 'League Phase').map((m) => m.day);
    expect(Math.min(...koDays)).toBeLessThan(maxDomesticDay); // at least one interleaved
    expect(Math.max(...koDays)).toBeLessThanOrEqual(Math.round(maxDomesticDay * 1.05));

    // Season is complete (every non-neutral fixture, continental included, played).
    expect(st.seasonComplete()).toBe(true);

    // Rolling over records the champion and installs a fresh league phase.
    const oldChampion = cl!.championId;
    await useGameStore.getState().startNextSeason();
    const next = useGameStore.getState();
    const nextCl = next.meta!.continental?.['UEFA_CL'];
    expect(nextCl?.stage).toBe('LEAGUE'); // reset for the new campaign
    expect(next.meta!.continentalChampions?.['UEFA_CL']?.clubId).toBe(oldChampion);
  }, 180_000);
});
