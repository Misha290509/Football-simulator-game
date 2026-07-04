// ---------------------------------------------------------------------------
// Dataset loader (§9, §11-M0). Converts a (swappable) Dataset into concrete
// Club / Player / Competition entities for a new save. Missing squads are
// filled by the fictional generator. Deterministic given a seed.
// ---------------------------------------------------------------------------

import type { Dataset, DatasetClub, DatasetPlayer } from '../types/dataset';
import type { Club, Finances } from '../types/club';
import type { Competition } from '../types/competition';
import type { Player } from '../types/player';
import { Rng, clamp } from '../engine/rng';
import { overallAt, bestOverall } from '../engine/ratings';
import { generateSquad } from '../engine/generator';
import { marketWage, transferBudgetFor, startingBalanceFor } from '../engine/finances';
import { traitsForClub } from '../game/clubTraits';
import { translateLegacyPosition } from '../types/attributes';
import { DEFAULT_ATTRIBUTES, DEFAULT_HIDDEN } from './defaults';

export interface LoadedWorld {
  clubs: Record<string, Club>;
  players: Record<string, Player>;
  competitions: Record<string, Competition>;
  ratingCap: number;
}

const competitionId = (countryId: string, tier: number) =>
  `comp_${countryId}_t${tier}`;
const clubId = (countryId: string, abbrev: string) =>
  `club_${countryId}_${abbrev}`;

// Distinct fallback crest colors when a club doesn't specify one.
const COLOR_PALETTE = [
  '#e11d48', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2',
  '#db2777', '#65a30d', '#ea580c', '#4f46e5', '#0d9488', '#b91c1c',
];
function colorFor(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return COLOR_PALETTE[(h >>> 0) % COLOR_PALETTE.length];
}

/** Reputation + actual squad wage bill → realistic club finances. */
function seedFinances(reputation: number, weeklyWageBill: number): Finances {
  // Wage budget covers the squad with modest headroom (bigger clubs get more).
  const wageBudget = Math.round(Math.max(weeklyWageBill * 1.12, marketWage(reputation - 6) * 16) / 100) * 100;
  return {
    balance: startingBalanceFor(reputation),
    transferBudget: transferBudgetFor(reputation),
    wageBudget,
    wageBudgetUsed: weeklyWageBill,
  };
}

/** Map an explicit dataset player (real data) into a full Player. */
function mapDatasetPlayer(
  dp: DatasetPlayer,
  cId: string,
  startYear: number,
  rng: Rng,
): Player {
  // Datasets (including the baked real-data bundle) still ship legacy position
  // tokens; translate them to current FIFA codes, splitting centre-backs by foot.
  const rawPos = dp.position ?? 'CM';
  const position = translateLegacyPosition(rawPos, dp.foot);
  const positions = (dp.positions ?? [rawPos])
    .map((p) => translateLegacyPosition(p, dp.foot))
    .filter((p, i, arr) => arr.indexOf(p) === i);
  const attributes = {
    technical: { ...DEFAULT_ATTRIBUTES.technical, ...dp.attributes?.technical },
    mental: { ...DEFAULT_ATTRIBUTES.mental, ...dp.attributes?.mental },
    physical: { ...DEFAULT_ATTRIBUTES.physical, ...dp.attributes?.physical },
    goalkeeping: { ...DEFAULT_ATTRIBUTES.goalkeeping, ...dp.attributes?.goalkeeping },
  };
  const overall = dp.overall ?? Math.max(
    overallAt(attributes, position),
    bestOverall(attributes, positions).ovr,
  );
  const bornYear = dp.bornYear ?? startYear - rng.int(19, 30);
  return {
    id: `p_${cId}_${(dp.dataSourceId ?? `${dp.lastName}_${rng.seedValue()}`)}`,
    name: { first: dp.firstName ?? 'Unknown', last: dp.lastName ?? 'Player' },
    nationality: dp.nationality ?? 'XX',
    born: { year: bornYear },
    position,
    positions,
    preferredFoot: dp.foot ?? 'R',
    height_cm: dp.height_cm ?? 180,
    weight_kg: dp.weight_kg ?? 75,
    attributes,
    hidden: { ...DEFAULT_HIDDEN, ...dp.hidden },
    potential: clamp(dp.potential ?? overall),
    overall,
    form: 0,
    morale: 75,
    fitness: 100,
    fatigueLoad: 0,
    injury: null,
    cards: { yellow: 0, red: 0, suspendedFor: 0 },
    contract: {
      clubId: cId,
      wage: marketWage(overall),
      startYear,
      expiresYear: startYear + rng.int(1, 5),
      signingBonus: 0,
      releaseClause: null,
      bonuses: [],
    },
    value: dp.value ?? Math.round(Math.pow(Math.max(0, overall - 40) / 10, 3.2) * 90_000),
    squadRole: 'FIRST',
    stats: [],
    awards: [],
    developmentLog: [{ year: startYear, ovr: overall, pot: clamp(dp.potential ?? overall) }],
    isReal: dp.isReal ?? true,
    dataSourceId: dp.dataSourceId,
  };
}

function buildClub(
  dc: DatasetClub,
  countryId: string,
  rng: Rng,
  startYear: number,
  ratingCap: number,
): { club: Club; players: Player[] } {
  const id = clubId(countryId, dc.abbrev);
  const players: Player[] = [];

  if (dc.players && dc.players.length > 0) {
    for (const dp of dc.players) {
      players.push(mapDatasetPlayer(dp, id, startYear, rng));
    }
  }
  // Fill the rest of the roster via the generator (or all of it if empty).
  if (players.length < 18) {
    const generated = generateSquad({
      rng,
      currentYear: startYear,
      reputation: dc.reputation,
      clubId: id,
      nationality: countryId,
      ratingCap,
    });
    players.push(...generated);
  }

  // Captain = highest-leadership senior player.
  const captain = [...players].sort(
    (a, b) =>
      b.attributes.mental.composure - a.attributes.mental.composure,
  )[0];

  const club: Club = {
    id,
    name: dc.name,
    shortName: dc.shortName ?? dc.name,
    abbrev: dc.abbrev,
    countryId,
    crestSeed: dc.abbrev, // generic recolorable crest keyed by abbrev
    primaryColor: dc.primaryColor ?? colorFor(dc.abbrev + dc.name),
    secondaryColor: dc.secondaryColor ?? '#ffffff',
    stadium: {
      name: dc.stadiumName ?? `${dc.shortName ?? dc.name} Stadium`,
      capacity: dc.stadiumCapacity ?? 20_000,
    },
    reputation: dc.reputation,
    finances: seedFinances(dc.reputation, players.reduce((s, p) => s + p.contract.wage, 0)),
    playerIds: players.map((p) => p.id),
    formation: '4-3-3',
    captainId: captain?.id ?? null,
    traits: traitsForClub(dc.name),
  };

  return { club, players };
}

export function loadDataset(
  dataset: Dataset,
  seed: number,
  startYear: number,
): LoadedWorld {
  const rng = new Rng(seed);
  // Per-save rating ceiling (~89–91), randomized so each world's elite differ.
  const ratingCap = 89 + rng.int(0, 2);
  const clubs: Record<string, Club> = {};
  const players: Record<string, Player> = {};
  const competitions: Record<string, Competition> = {};

  for (const country of dataset.countries) {
    for (const league of country.leagues) {
      const comp: Competition = {
        id: competitionId(country.id, league.tier),
        name: league.name,
        countryId: country.id,
        confederation: country.confederation,
        format: league.format,
        tier: league.tier,
        numClubs: league.numClubs,
        rounds: league.rounds,
        tiebreakers: league.tiebreakers,
        promotion: league.promotion,
        conferences: league.conferences,
        clubIds: [],
      };

      for (const dc of league.clubs) {
        const { club, players: squad } = buildClub(dc, country.id, rng, startYear, ratingCap);
        clubs[club.id] = club;
        comp.clubIds.push(club.id);
        for (const p of squad) players[p.id] = p;
      }

      competitions[comp.id] = comp;
    }
  }

  return { clubs, players, competitions, ratingCap };
}
