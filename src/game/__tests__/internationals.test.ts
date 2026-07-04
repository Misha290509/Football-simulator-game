import { describe, it, expect } from 'vitest';
import { loadDataset } from '../../data/datasetLoader';
import { ENGLAND_DATASET } from '../../data/england';
import { buildNationSquads, rankedNations, canonicalNation } from '../../engine/nationalTeam';
import {
  runWorldCup, runEuros, runCopaAmerica,
  isTournamentYear, isEurosOrCopaYear,
  worldCupField, eurosField, copaField,
} from '../internationals';
import { NATION_BY_NAME } from '../../data/nations';
import { Rng } from '../../engine/rng';

const world = loadDataset(ENGLAND_DATASET, 5, 2024);

describe('National teams', () => {
  it('canonicalises country codes to names so nations do not split', () => {
    expect(canonicalNation('BR')).toBe('Brazil');
    expect(canonicalNation('England')).toBe('England'); // full names pass through
  });

  it('builds squads with a GK-led best XI and a strength rating', () => {
    const squads = buildNationSquads(world.players);
    const withSquad = rankedNations(squads);
    expect(withSquad.length).toBeGreaterThan(0);
    const top = withSquad[0];
    expect(top.xi.length).toBeLessThanOrEqual(11);
    expect(top.xi.some((p) => p.position === 'GK')).toBe(true);
    expect(top.strength).toBeGreaterThan(0);
  });
});

describe('Tournament cadence', () => {
  it('runs the World Cup every four years (…2026, 2030…)', () => {
    expect(isTournamentYear(2026)).toBe(true);
    expect(isTournamentYear(2030)).toBe(true);
    expect(isTournamentYear(2025)).toBe(false);
    expect(isTournamentYear(2028)).toBe(false);
  });
  it('runs the Euros/Copa on the offset years (…2028, 2032…)', () => {
    expect(isEurosOrCopaYear(2028)).toBe(true);
    expect(isEurosOrCopaYear(2032)).toBe(true);
    expect(isEurosOrCopaYear(2026)).toBe(false);
  });
});

describe('World Cup', () => {
  it('fields 48 teams in 12 groups of four', () => {
    expect(worldCupField().length).toBe(48);
    const wc = runWorldCup(world.players, 2026, new Rng(7))!;
    expect(wc.groups.length).toBe(12);
    for (const g of wc.groups) expect(g.rows.length).toBe(4);
  });

  it('produces a champion and runner-up, deterministically', () => {
    const a = runWorldCup(world.players, 2026, new Rng(7))!;
    const b = runWorldCup(world.players, 2026, new Rng(7))!;
    expect(a.championNation).toBeTruthy();
    expect(a.championNation).not.toBe(a.runnerUpNation);
    expect(a.championNation).toBe(b.championNation); // deterministic
  });

  it('advances 32 teams to the first knockout round: 24 top-two + 8 best thirds', () => {
    const wc = runWorldCup(world.players, 2026, new Rng(11))!;
    const r32 = wc.knockout.filter((t) => t.round === 'Round of 32');
    expect(r32.length).toBe(16); // 32 teams → 16 ties
  });

  it('never pits two group winners against each other in the Round of 32', () => {
    const wc = runWorldCup(world.players, 2026, new Rng(13))!;
    const winners = new Set(wc.groups.map((g) => g.rows[0].nation));
    for (const tie of wc.knockout.filter((t) => t.round === 'Round of 32')) {
      const bothWinners = winners.has(tie.homeNation) && winners.has(tie.awayNation);
      expect(bothWinners).toBe(false);
    }
  });

  it('tracks top scorers and top assisters', () => {
    const wc = runWorldCup(world.players, 2026, new Rng(9))!;
    expect(wc.topScorers.length).toBeGreaterThan(0);
    expect(wc.topScorers[0].count).toBeGreaterThan(0);
    expect(wc.topAssisters.length).toBeGreaterThan(0);
  });

  it('a strong nation reaches the final more often than a weak one', () => {
    let strongFinals = 0;
    let weakFinals = 0;
    for (let i = 0; i < 24; i++) {
      const wc = runWorldCup(world.players, 2026, new Rng(200 + i))!;
      const finalists = [wc.championNation, wc.runnerUpNation];
      if (finalists.some((n) => (NATION_BY_NAME[n]?.strength ?? 0) >= 88)) strongFinals++;
      if (finalists.some((n) => (NATION_BY_NAME[n]?.strength ?? 0) <= 70)) weakFinals++;
    }
    expect(strongFinals).toBeGreaterThan(weakFinals);
  });
});

describe('Euros', () => {
  it('fields 24 UEFA nations in 6 groups and crowns a European champion', () => {
    expect(eurosField().length).toBe(24);
    const e = runEuros(world.players, 2028, new Rng(3))!;
    expect(e.groups.length).toBe(6);
    expect(NATION_BY_NAME[e.championNation]?.confederation).toBe('UEFA');
  });
});

describe('Copa América', () => {
  it('fields 16 teams in 4 groups and crowns a champion from the Americas', () => {
    expect(copaField().length).toBe(16);
    const c = runCopaAmerica(world.players, 2028, new Rng(4))!;
    expect(c.groups.length).toBe(4);
    const conf = NATION_BY_NAME[c.championNation]?.confederation;
    expect(conf === 'CONMEBOL' || conf === 'CONCACAF').toBe(true);
  });
});
