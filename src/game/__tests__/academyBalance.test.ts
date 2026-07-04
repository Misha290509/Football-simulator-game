import { describe, it, expect } from 'vitest';
import { loadDataset } from '../../data/datasetLoader';
import { ENGLAND_DATASET } from '../../data/england';
import { installNewGameAcademies, processAcademyRollover } from '../academy';
import { Rng } from '../../engine/rng';
import type { Club } from '../../types/club';
import type { Player } from '../../types/player';

const world = loadDataset(ENGLAND_DATASET, 61, 2024);
const base = Object.values(world.clubs)[0];

function makeClub(id: string, reputation: number, transferBudget: number): Club {
  return { ...structuredClone(base), id, name: id, reputation, finances: { ...base.finances, transferBudget }, staff: [], playerIds: [] };
}

/** Run a club's academy headlessly for N seasons; report graduate output. */
function runAcademy(club: Club, seed: number, seasons: number) {
  const c = structuredClone(club);
  const install = installNewGameAcademies({ [c.id]: c }, {}, 2024, 91, seed);
  let academies = install.academies;
  let overlay = install.academyPlayers;
  let objs: Player[] = install.newPlayers;
  const rng = new Rng(seed ^ 0x5eed);
  let totalGraduates = 0;
  let qualityGraduates = 0; // first-team-quality (OVR >= 68)
  let peakSum = 0;
  for (let y = 0; y < seasons; y++) {
    const nextYear = 2025 + y;
    const res = processAcademyRollover(
      academies, overlay, objs, { [c.id]: c }, { [c.id]: c.reputation * 0.9 }, nextYear, 91, rng, c.id, 0,
    );
    academies = res.academies;
    overlay = res.overlay;
    objs = Object.values(res.carriedPlayers);
    totalGraduates += res.graduates.length;
    for (const g of res.graduates) { peakSum += g.overall; if (g.overall >= 68) qualityGraduates++; }
  }
  return { totalGraduates, qualityGraduates, avgPeak: totalGraduates ? peakSum / totalGraduates : 0, rating: academies[c.id].rating, rep: academies[c.id].reputation };
}

describe('Academy balance + determinism (Phase 8)', () => {
  const elite = makeClub('Elite', 88, 150_000_000);
  const small = makeClub('Small', 45, 400_000);

  it('elite academies demonstrably out-produce small ones in quality over a decade', () => {
    // Every academy now carries a full squad (18+), so any single season's raw
    // graduate count is noisy — a small club can get a lucky high-roller. The
    // robust signals are graduate quality (avg peak, star rating) per seed and
    // the aggregate volume of first-team-quality talent across many seeds.
    let eQuality = 0;
    let sQuality = 0;
    for (const seed of [123, 777, 61, 9, 42]) {
      const e = runAcademy(elite, seed, 12);
      const s = runAcademy(small, seed, 12);
      eQuality += e.qualityGraduates;
      sQuality += s.qualityGraduates;
      // Elite graduates are better on average and the academy holds a higher rating.
      expect(e.avgPeak).toBeGreaterThan(s.avgPeak);
      expect(e.rating).toBeGreaterThan(s.rating);
    }
    // Across seeds, elite churns out far more first-team-quality talent.
    expect(eQuality).toBeGreaterThan(sQuality);
  });

  it('a fixed seed reproduces the same multi-season output exactly', () => {
    const a = runAcademy(elite, 777, 10);
    const b = runAcademy(elite, 777, 10);
    expect(a).toEqual(b);
  });

  it('the academy keeps a self-sustaining roster across seasons (no collapse)', () => {
    // After many seasons the academy should still hold prospects (intake replaces graduates).
    const c = structuredClone(elite);
    const install = installNewGameAcademies({ [c.id]: c }, {}, 2024, 91, 9);
    let academies = install.academies, overlay = install.academyPlayers;
    let objs: Player[] = install.newPlayers;
    const rng = new Rng(9 ^ 0x5eed);
    for (let y = 0; y < 15; y++) {
      const res = processAcademyRollover(academies, overlay, objs, { [c.id]: c }, { [c.id]: 75 }, 2025 + y, 91, rng, c.id, 0);
      academies = res.academies; overlay = res.overlay; objs = Object.values(res.carriedPlayers);
    }
    expect(objs.length).toBeGreaterThan(3);
  });
});
