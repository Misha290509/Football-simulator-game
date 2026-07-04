// ---------------------------------------------------------------------------
// Headless balance harness (§7, §12). Loads the England dataset, simulates a
// full season, and reports balance metrics: goals-per-game, scoreline spread,
// and league competitiveness. Run: npm run sim:harness
// Uses the synchronous sim path (no Worker in Node).
// ---------------------------------------------------------------------------

import { ENGLAND_DATASET } from '../../data/england';
import { loadDataset } from '../../data/datasetLoader';
import { generateSchedule } from '../schedule';
import { simulateMatches } from '../simClient';
import { computeStandings } from '../standings';
import { resolveAndRollover } from '../../game/season';
import type { Match } from '../../types/match';
import type { Club } from '../../types/club';
import type { Player } from '../../types/player';
import type { SaveGame, Season } from '../../types/league';

const SEED = 20240101;
const START_YEAR = 2024;
const N_SEASONS = 6;

async function main() {
  const world = loadDataset(ENGLAND_DATASET, SEED, START_YEAR);
  const clubs = world.clubs;
  const players = world.players;

  console.log(`Dataset: ${ENGLAND_DATASET.name}`);
  console.log(`Clubs: ${Object.keys(clubs).length}  Players: ${Object.keys(players).length}\n`);

  for (const comp of Object.values(world.competitions)) {
    const fixtures = generateSchedule(comp, 'harness_season', SEED ^ comp.tier);
    const played: Match[] = await simulateMatches(fixtures, clubs, players);

    const totalGoals = played.reduce((s, m) => s + m.homeGoals + m.awayGoals, 0);
    const homeWins = played.filter((m) => m.homeGoals > m.awayGoals).length;
    const draws = played.filter((m) => m.homeGoals === m.awayGoals).length;
    const awayWins = played.length - homeWins - draws;
    const totalXg = played.reduce((s, m) => s + m.homeXg + m.awayXg, 0);

    const table = computeStandings(comp, played);
    const champPts = table[0].points;
    const bottomPts = table[table.length - 1].points;

    console.log(`── ${comp.name} (${played.length} matches) ──`);
    console.log(`  Goals/game:   ${(totalGoals / played.length).toFixed(2)}  (xG ${(totalXg / played.length).toFixed(2)})`);
    console.log(`  Home/Draw/Away: ${pct(homeWins, played.length)} / ${pct(draws, played.length)} / ${pct(awayWins, played.length)}`);
    console.log(`  Champion: ${clubs[table[0].clubId].shortName} (${champPts} pts)  ·  Bottom: ${bottomPts} pts`);
    console.log('');
  }

  console.log('Targets: ~2.5–3.0 goals/game, home win share ~43–48%, clear points spread.\n');

  await multiSeasonAgeReport();
}

const pct = (n: number, total: number) => `${Math.round((100 * n) / total)}%`;

/** Run several full seasons through the M3 pipeline and report aging health. */
async function multiSeasonAgeReport() {
  console.log(`══ ${N_SEASONS}-season progression (aging / retirement / youth) ══`);
  const world = loadDataset(ENGLAND_DATASET, SEED ^ 0xa5a5, START_YEAR);
  let clubs: Record<string, Club> = world.clubs;
  let players: Record<string, Player> = world.players;

  const firstSeason: Season = {
    id: `season_${START_YEAR}`, year: START_YEAR, label: `${START_YEAR}`,
    competitionIds: Object.keys(world.competitions), current: true, finished: false,
  };
  let meta: SaveGame = {
    id: 'h', name: 'harness', seed: SEED, createdAt: 0, schemaVersion: 1,
    managerClubId: Object.keys(world.clubs)[0], managerName: 'H',
    currentDay: 1, startYear: START_YEAR,
    competitions: world.competitions, seasons: { [firstSeason.id]: firstSeason }, news: [],
  };

  for (let i = 0; i < N_SEASONS; i++) {
    const season = Object.values(meta.seasons).find((s) => s.current)!;
    const fixtures: Match[] = [];
    for (const comp of Object.values(meta.competitions)) {
      fixtures.push(...generateSchedule(comp, season.id, SEED ^ (comp.tier + i * 7)));
    }
    const played = await simulateMatches(fixtures, clubs, players);
    const result = await resolveAndRollover(meta, clubs, players, played);

    const ages = Object.values(result.players).map((p) => result.newSeason.year - p.born.year);
    const avgAge = (ages.reduce((s, a) => s + a, 0) / ages.length).toFixed(1);
    const u21 = ages.filter((a) => a <= 21).length;
    console.log(
      `  ${season.year}: players=${Object.keys(result.players).length}  retired=${result.retiredIds.length}  avgAge=${avgAge}  U21=${u21}`,
    );

    players = result.players;
    clubs = result.clubs;
    const seasons: Record<string, Season> = {};
    for (const s of Object.values(meta.seasons)) seasons[s.id] = { ...s, current: false, finished: true };
    seasons[result.newSeason.id] = result.newSeason;
    meta = { ...meta, competitions: result.competitions, seasons };
  }
  console.log('  Expect: stable squad sizes, avg age ~25–27, steady retirements & youth.');
}

void main();
