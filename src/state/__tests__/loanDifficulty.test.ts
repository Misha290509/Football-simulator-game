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
    saveName: 'Loan diff — Test', managerName: 'M', dataset: ENGLAND_DATASET,
    managerClubId: managerClubId(), startYear: 2024, seed: 7,
  });
  await createSave(snap);
  await useGameStore.getState().load(snap.meta.id);
}

describe('Loan difficulty', () => {
  beforeEach(() => {
    useGameStore.setState({ loaded: false, meta: null, clubs: {}, players: {}, matches: {} });
  });

  it('caps loanees at 3, blocks league rivals and first-teamers, and charges a fee', async () => {
    await freshGame();
    const s = () => useGameStore.getState();
    const myId = s().meta!.managerClubId;
    const club = () => s().clubs[myId];
    // Give a comfortable budget so the fee itself isn't the blocker.
    useGameStore.setState({ clubs: { ...s().clubs, [myId]: { ...club(), finances: { ...club().finances, transferBudget: 500_000_000 } } } });
    expect(s().transferWindow().open).toBe(true); // pre-season summer window

    const myComp = Object.values(s().meta!.competitions).find((c) => c.clubIds.includes(myId))!;
    const squadOf = (clubId: string) => [...s().getClubPlayers(clubId)].sort((a, b) => b.overall - a.overall);

    // A league rival's player can't be loaned.
    const rivalClub = myComp.clubIds.find((id) => id !== myId)!;
    const rivalFringe = squadOf(rivalClub).slice(11).find((p) => p.overall < club().reputation && p.squadRole !== 'KEY') as Player | undefined;
    if (rivalFringe) {
      const r = await s().loanIn(rivalFringe.id, 1);
      expect(r.ok).toBe(false);
      expect(r.message).toMatch(/rival/i);
    }

    // Pick loan-eligible fringe players from FOREIGN clubs (not our league).
    const foreignClubs = Object.values(s().clubs).filter((c) => c.id !== myId && !myComp.clubIds.includes(c.id));
    const targets: Player[] = [];
    const firstTeamers: Player[] = [];
    for (const c of foreignClubs) {
      const sq = squadOf(c.id);
      const starter = sq[0];
      if (starter && starter.overall < club().reputation && starter.overall < 72 && starter.squadRole !== 'KEY' && firstTeamers.length < 1) firstTeamers.push(starter);
      const fringe = sq.slice(11).find((p) => p.overall < club().reputation && p.overall < 72 && p.squadRole !== 'KEY' && !p.loan);
      if (fringe) targets.push(fringe);
      if (targets.length >= 4) break;
    }
    expect(targets.length).toBeGreaterThanOrEqual(4); // loans are still possible

    // A parent's first-team man (top of their squad) is refused.
    if (firstTeamers[0]) {
      const r = await s().loanIn(firstTeamers[0].id, 1);
      expect(r.ok).toBe(false);
      expect(r.message).toMatch(/first-team/i);
    }

    // Three loans go through, each charging a fee to the budget.
    const budgetBefore = club().finances.transferBudget;
    for (let i = 0; i < 3; i++) {
      const r = await s().loanIn(targets[i].id, 1);
      expect(r.ok).toBe(true);
    }
    expect(club().finances.transferBudget).toBeLessThan(budgetBefore); // fees paid
    expect(s().getClubPlayers(myId).filter((p) => p.loan).length).toBe(3);

    // The fourth is blocked by the cap.
    const fourth = await s().loanIn(targets[3].id, 1);
    expect(fourth.ok).toBe(false);
    expect(fourth.message).toMatch(/limit/i);
  });
});
