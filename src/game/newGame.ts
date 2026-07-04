// ---------------------------------------------------------------------------
// New Game orchestration (§3, §11-M1). Loads a dataset, builds the world and
// the first Season, and returns a persistable WorldSnapshot.
// ---------------------------------------------------------------------------

import type { Dataset } from '../types/dataset';
import type { Season, SaveGame } from '../types/league';
import type { Match } from '../types/match';
import { loadDataset } from '../data/datasetLoader';
import type { WorldSnapshot } from '../db/db';
import { hashSeed, Rng, clamp } from '../engine/rng';
import { generateSchedule } from '../engine/schedule';
import { generateStaffFor } from '../engine/staff';
import { facilityLevelFor } from '../engine/academy';
import { setObjective } from './board';
import { installNewGameAcademies, fillAcademyBands } from './academy';
import { injectSpecialPlayers } from './specialPlayers';
import { initialManagerReputation } from './careers';
import { installContinental } from './continental/install';
import { LEAGUE_STRIDE } from './continental/competition';
import { createDomesticCups } from './cups/domesticCups';
import { lastMatchday } from '../engine/schedule';
import { applyPreseasonOffset } from './gameCalendar';
import { CURRENT_SCHEMA_VERSION } from '../db/migrations';

export interface NewGameConfig {
  saveName: string;
  managerName: string;
  dataset: Dataset;
  managerClubId: string;
  startYear: number;
  seed?: number;
  difficulty?: import('../types/league').Difficulty;
}

function seasonLabel(year: number): string {
  const next = (year + 1) % 100;
  return `${year}/${next.toString().padStart(2, '0')}`;
}

export function createNewGame(config: NewGameConfig): WorldSnapshot {
  const seed = config.seed ?? hashSeed(config.saveName + Date.now());
  const world = loadDataset(config.dataset, seed, config.startYear);

  const seasonId = `season_${config.startYear}`;
  const season: Season = {
    id: seasonId,
    year: config.startYear,
    label: seasonLabel(config.startYear),
    competitionIds: Object.keys(world.competitions),
    current: true,
    finished: false,
  };

  // Equip every club with staff, facilities and a training focus (§M5).
  const staffRng = new Rng(seed ^ 0x1234abcd);
  for (const club of Object.values(world.clubs)) {
    club.staff = generateStaffFor(club.id, club.reputation, staffRng);
    // Realistic: based on reputation + finances + stadium. Only elite clubs
    // reach 5; modest top-flight sides land ~2; lower divisions 1.
    const lvl = facilityLevelFor(club.reputation, club.finances.transferBudget, club.stadium.capacity);
    club.facilities = { academy: lvl, training: clamp(lvl + staffRng.int(-1, 0), 1, 5) };
    club.trainingFocus = 'BALANCED';
    club.tactics = { defensive: 'BALANCED', offensive: 'POSSESSION' };
    club.autoMode = true;
    club.lockFormation = false;
    club.lineup = undefined;
  }

  // Install a tailored academy for every club + seed initial youth rosters
  // (parallel roster — these players are owned by the academy, not the squad).
  const academyInstall = installNewGameAcademies(
    world.clubs, world.players, config.startYear, world.ratingCap, seed,
  );
  for (const youth of academyInstall.newPlayers) world.players[youth.id] = youth;

  // Hand-authored cameo players who join a specific club's academy.
  injectSpecialPlayers(
    world.clubs, world.players, academyInstall.academyPlayers,
    config.startYear, world.ratingCap, seed,
  );

  // Fill the manager's own academy to a full team in each age band (U16/U18/U21).
  const mgrClub = world.clubs[config.managerClubId];
  const mgrAcademy = mgrClub ? academyInstall.academies[config.managerClubId] : undefined;
  if (mgrClub && mgrAcademy) {
    fillAcademyBands(
      mgrClub, mgrAcademy, world.players, academyInstall.academyPlayers,
      config.startYear, world.ratingCap, new Rng((seed ^ 0xba0df11) >>> 0),
    );
  }

  // Generate the opening season's fixtures for every competition. League rounds
  // are strided so continental midweek fixtures interleave on the odd days.
  const scheduleRng = new Rng(seed ^ 0x5f3759df);
  const matches: Record<string, Match> = {};
  for (const comp of Object.values(world.competitions)) {
    for (const m of generateSchedule(comp, seasonId, scheduleRng.seedValue(), LEAGUE_STRIDE)) {
      matches[m.id] = m;
    }
  }

  // Continental competitions (Champions/Europa/Conference League; Club World Cup
  // on its four-year cycle). Qualification for the opening season is by
  // reputation (no prior standings yet).
  const maxLeagueDay = lastMatchday(Object.values(matches));
  const continental = installContinental({
    competitions: world.competitions,
    clubs: world.clubs,
    seasonId,
    seasonYear: config.startYear,
    maxLeagueDay,
    seed: seed ^ 0x0c0ffee1,
  });
  for (const m of continental.matches) matches[m.id] = m;

  // Domestic cups (a major cup + a League Cup per nation). No Super Cup in the
  // opening season — it needs a prior league champion and cup winner.
  const cups = createDomesticCups(
    world.competitions, world.clubs, seasonId, config.startYear, maxLeagueDay, seed ^ 0x0dcc0114,
  );
  for (const m of cups.matches) matches[m.id] = m;

  // Push every fixture back by the pre-season so day 0 is a genuine off-season
  // (early July) and the opening round lands on the August opener.
  applyPreseasonOffset(Object.values(matches), continental.states, cups.states);

  const managerClub = world.clubs[config.managerClubId];
  const managerComp = Object.values(world.competitions).find((c) =>
    c.clubIds.includes(config.managerClubId),
  )!;

  // Challenge/difficulty: scale the manager's starting funds + board patience.
  const difficulty = config.difficulty ?? 'NORMAL';
  const budgetMult = difficulty === 'RELAXED' ? 1.6 : difficulty === 'HARD' ? 0.55 : 1;
  const startConfidence = difficulty === 'RELAXED' ? 75 : difficulty === 'HARD' ? 45 : 60;
  if (budgetMult !== 1) {
    const f = managerClub.finances;
    managerClub.finances = {
      ...f,
      transferBudget: Math.round(f.transferBudget * budgetMult),
      wageBudget: Math.round(f.wageBudget * budgetMult),
      balance: Math.round(f.balance * budgetMult),
    };
  }
  const boardState = { ...setObjective(managerClub, managerComp), confidence: startConfidence };

  const meta: SaveGame = {
    id: `save_${seed.toString(36)}_${Date.now().toString(36)}`,
    name: config.saveName,
    seed,
    createdAt: Date.now(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    managerClubId: config.managerClubId,
    managerName: config.managerName,
    currentDay: 0,
    startYear: config.startYear,
    ratingCap: world.ratingCap,
    competitions: world.competitions,
    seasons: { [seasonId]: season },
    scouting: {},
    academies: academyInstall.academies,
    academyPlayers: academyInstall.academyPlayers,
    scoutAssignments: [],
    youthProspects: [],
    youthCompetitions: {},
    board: boardState,
    difficulty,
    sacked: false,
    managerReputation: initialManagerReputation(managerClub),
    managerStints: [{ clubId: managerClub.id, clubName: managerClub.name, fromYear: config.startYear, seasons: 0, trophies: 0 }],
    jobOffers: [],
    continental: continental.states,
    continentalChampions: {},
    continentalHistory: [],
    domesticCups: cups.states,
    cupHolders: {},
    news: [
      {
        id: 'news_welcome',
        day: 0,
        category: 'BOARD',
        title: `Welcome to ${config.saveName.split('—')[1]?.trim() ?? 'the club'}`,
        body: `The board welcomes ${config.managerName}. Lead the club through the ${season.label} season.`,
        read: false,
      },
    ],
  };

  return { meta, clubs: world.clubs, players: world.players, matches };
}