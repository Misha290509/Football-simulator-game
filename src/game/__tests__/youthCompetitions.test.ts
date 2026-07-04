import { describe, it, expect } from 'vitest';
import { loadDataset } from '../../data/datasetLoader';
import { ENGLAND_DATASET } from '../../data/england';
import { buildAcademy } from '../../engine/academy';
import { runYouthCompetitions } from '../youthCompetitions';
import { Rng } from '../../engine/rng';
import type { Player } from '../../types/player';
import type { Academy } from '../../types/academy';

const world = loadDataset(ENGLAND_DATASET, 21, 2024);
const comp = Object.values(world.competitions).find((c) => c.tier === 1)!;
const clubIds = comp.clubIds;

function academies(): Record<string, Academy> {
  const out: Record<string, Academy> = {};
  for (const id of Object.keys(world.clubs)) out[id] = buildAcademy(world.clubs[id], new Rng(1)).academy;
  return out;
}

// Build youth squads where one club is clearly the strongest.
function squads(strongClub: string): Record<string, Player[]> {
  const out: Record<string, Player[]> = {};
  const tmpl = Object.values(world.players)[0];
  for (const id of clubIds) {
    const ovr = id === strongClub ? 80 : 50;
    out[id] = Array.from({ length: 13 }, (_, i) => ({ ...structuredClone(tmpl), id: `${id}_y${i}`, overall: ovr, academyClubId: id }));
  }
  return out;
}

const standings = { [comp.id]: clubIds.map((clubId, i) => ({ clubId, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: clubIds.length - i })) };

describe('Youth competitions (Phase 5)', () => {
  it('awards a youth-league title that favours the strongest academy', () => {
    const strong = clubIds[3];
    let strongTitles = 0;
    for (let t = 0; t < 12; t++) {
      const res = runYouthCompetitions(academies(), squads(strong), world.clubs, world.competitions, standings, 'season_2024', 2024, new Rng(50 + t), strong);
      const league = Object.values(res.youthCompetitions).find((y) => y.type === 'youth_league');
      if (league?.championClubId === strong) strongTitles++;
    }
    // The overwhelmingly strongest youth side should win most league titles.
    expect(strongTitles).toBeGreaterThan(8);
  });

  it('records trophies into the winning academy cabinet and boosts performance', () => {
    const strong = clubIds[2];
    const res = runYouthCompetitions(academies(), squads(strong), world.clubs, world.competitions, standings, 'season_2024', 2024, new Rng(7), strong);
    expect(res.academies[strong].trophies.length).toBeGreaterThan(0);
    expect(res.perfBoostByClub[strong] ?? 0).toBeGreaterThan(0);
  });

  it('is deterministic for a fixed seed', () => {
    const strong = clubIds[1];
    const run = () => {
      const r = runYouthCompetitions(academies(), squads(strong), world.clubs, world.competitions, standings, 'season_2024', 2024, new Rng(99), strong);
      return Object.values(r.youthCompetitions).map((y) => `${y.id}:${y.championClubId}`).sort().join('|');
    };
    expect(run()).toBe(run());
  });
});
