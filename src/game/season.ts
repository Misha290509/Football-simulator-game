// ---------------------------------------------------------------------------
// Season-end resolution + rollover (§3, §7B, §11-M2). Computes final standings,
// resolves promotion/relegation (auto slots + promotion playoffs via the match
// engine), swaps tier memberships, then generates the next season's schedule.
// Rule-driven by Competition.promotion config — no league-specific branches.
// ---------------------------------------------------------------------------

import type { Club } from '../types/club';
import type { Player, SeasonStats } from '../types/player';
import type { Match } from '../types/match';
import type { Competition } from '../types/competition';
import type {
  Season, SaveGame, StandingRow, NewsItem, Award, SeasonHistory, HallOfFameEntry,
} from '../types/league';
import { POSITION_GROUP } from '../types/attributes';
import { computeStandings } from '../engine/standings';
import { generateSchedule } from '../engine/schedule';
import { simulateMatches } from '../engine/simClient';
import { Rng } from '../engine/rng';
import { developPlayer, shouldRetire, type SeasonPerf } from '../engine/development';
import { computeSeasonFinances, deriveBudgets } from '../engine/finances';
import { coachingFactor, trainingBias } from '../engine/staff';
import { evaluateObjective, setObjective, SACK_THRESHOLD } from './board';
import type { BoardState } from '../types/staff';
import { runAiTransferWindow, weeklyWageBill } from './transfers';
import { runAiToAiTransfers } from './aiTransfers';
import { rolloverAiManagers } from './aiManagers';
import { resolveSeasonCompetitions } from './competitions';
import { computeSeasonAwards, buildCompMeta } from './awards';
import { scheduleGala } from './gala';
import { processAcademyRollover } from './academy';
import { runYouthCompetitions } from './youthCompetitions';
import { updateManagerReputation, generateJobOffers } from './careers';
import {
  runWorldCup, runEuros, runCopaAmerica, isTournamentYear, isEurosOrCopaYear,
  type TournamentResult,
} from './internationals';
import { installContinental } from './continental/install';
import { reputationBaseline } from './continental/qualification';
import { LEAGUE_STRIDE } from './continental/competition';
import { createDomesticCups, createSuperCup } from './cups/domesticCups';
import { assessFfp, applyPointsPenalties } from './ffp';
import { checkAchievements } from './achievements';
import { lastMatchday } from '../engine/schedule';
import { applyPreseasonOffset } from './gameCalendar';
import type { Academy, AcademyPlayer, YouthCompetition } from '../types/academy';
import type { ManagerStint, JobOffer } from '../types/league';
import type { ContinentalState } from '../types/continental';
import type { DomesticCupState } from '../types/cup';

export interface RolloverResult {
  competitions: Record<string, Competition>;
  newSeason: Season;
  newMatches: Match[];
  playoffMatches: Match[];
  news: NewsItem[];
  finalStandings: Record<string, StandingRow[]>;
  /** Full updated player set (developed + youth, excluding retirees). */
  players: Record<string, Player>;
  /** Updated clubs (refreshed squads / captains). */
  clubs: Record<string, Club>;
  retiredIds: string[];
  /** Next-season board objective for the manager + job-security verdict. */
  board?: BoardState;
  sacked?: boolean;
  /** Honours archive entry for the season just completed (§M6). */
  historyEntry?: SeasonHistory;
  hallOfFameAdds?: HallOfFameEntry[];
  /** Cup/continental knockout matches to persist as history. */
  extraMatches?: Match[];
  /** Updated academies + per-player academy overlay after the rollover. */
  academies?: Record<string, Academy>;
  academyPlayers?: Record<string, AcademyPlayer>;
  /** This season's youth competitions with their champions. */
  youthCompetitions?: Record<string, YouthCompetition>;
  /** Updated manager reputation, career stints and any new job offers. */
  managerReputation?: number;
  managerStints?: ManagerStint[];
  jobOffers?: JobOffer[];
  /** World Cup result, on World Cup years. */
  worldCup?: TournamentResult | null;
  /** All international tournaments resolved this rollover (WC, or Euros+Copa). */
  tournaments?: TournamentResult[];
  /** Next season's fresh continental competitions (states). */
  continental?: Record<string, ContinentalState>;
  /** Updated reigning continental champions after the finished season. */
  continentalChampions?: Record<string, { clubId: string; year: number }>;
  /** Appended continental roll-of-honour entries. */
  continentalHistory?: { id: string; name: string; year: number; clubId: string }[];
  /** Next season's fresh domestic cups (+ Super Cups). */
  domesticCups?: Record<string, DomesticCupState>;
  /** Updated reigning domestic cup holders after the finished season. */
  cupHolders?: Record<string, { clubId: string; year: number }>;
  /** Updated FFP standing for the manager's club. */
  ffp?: { strikes: number; embargo: boolean };
  /** Points penalties active next season (FFP), keyed by clubId. */
  pointsPenalties?: Record<string, number>;
  /** Evolving UEFA country coefficients after the finished season. */
  countryCoefficients?: Record<string, number>;
  /** Achievements unlocked this rollover (id → year). */
  achievements?: Record<string, number>;
  /** Deferred autumn awards gala, to be announced in October of the new season. */
  pendingGala?: import('../types/league').GalaCeremony | null;
  /** Updated AI-manager records after season-end churn. */
  aiManagers?: Record<string, import('./aiManagers').AiManager>;
}

/** Aggregate per-player, per-competition season stats from played matches. */
function aggregateSeasonStats(
  seasonId: string,
  matches: Match[],
  playersById: Record<string, Player>,
): { stats: Map<string, SeasonStats[]>; minutes: Map<string, number>; perf: Map<string, SeasonPerf> } {
  const stats = new Map<string, SeasonStats[]>();
  const minutes = new Map<string, number>();
  const perf = new Map<string, SeasonPerf>();
  const key = (pid: string, comp: string) => `${pid}|${comp}`;
  const byKey = new Map<string, SeasonStats>();

  const bump = (pid: string, fn: (x: SeasonPerf) => void) => {
    let x = perf.get(pid);
    if (!x) { x = { minutes: 0, avgRating: 0, goals: 0, assists: 0, cleanSheets: 0, appearances: 0 }; perf.set(pid, x); }
    fn(x);
  };
  const ratingAcc = new Map<string, { sum: number; n: number }>();

  for (const m of matches) {
    if (!m.played || m.neutral) continue;
    for (const ps of m.playerStats) {
      const player = playersById[ps.playerId];
      if (!player) continue;
      const k = key(ps.playerId, m.competitionId);
      let s = byKey.get(k);
      if (!s) {
        s = {
          seasonId,
          competitionId: m.competitionId,
          clubId: player.contract.clubId ?? '',
          appearances: 0, starts: 0, minutes: 0, goals: 0, assists: 0,
          cleanSheets: 0, saves: 0, yellowCards: 0, redCards: 0,
          avgRating: 0, ratingSum: 0, ratingCount: 0,
        };
        byKey.set(k, s);
      }
      s.appearances += 1;
      s.starts += 1;
      s.minutes += ps.minutes;
      s.goals += ps.goals;
      s.assists += ps.assists;
      s.saves = (s.saves ?? 0) + (ps.saves ?? 0);
      s.yellowCards += ps.yellow ? 1 : 0;
      s.redCards += ps.red ? 1 : 0;
      s.ratingSum += ps.rating;
      s.ratingCount += 1;
      const grp = POSITION_GROUP[player.position];
      const conceded = player.contract.clubId === m.homeClubId ? m.awayGoals : m.homeGoals;
      const cs = (grp === 'GK' || grp === 'DEF') && conceded === 0;
      if (cs) s.cleanSheets += 1;
      minutes.set(ps.playerId, (minutes.get(ps.playerId) ?? 0) + ps.minutes);
      // Season-wide performance summary (across all competitions).
      bump(ps.playerId, (x) => {
        x.minutes += ps.minutes;
        x.goals += ps.goals;
        x.assists += ps.assists;
        x.appearances += 1;
        if (cs) x.cleanSheets += 1;
      });
      const ra = ratingAcc.get(ps.playerId) ?? { sum: 0, n: 0 };
      ra.sum += ps.rating; ra.n += 1;
      ratingAcc.set(ps.playerId, ra);
    }
  }

  for (const [k, s] of byKey) {
    s.avgRating = s.ratingCount ? Math.round((s.ratingSum / s.ratingCount) * 10) / 10 : 0;
    const pid = k.split('|')[0];
    (stats.get(pid) ?? stats.set(pid, []).get(pid)!).push(s);
  }
  for (const [pid, ra] of ratingAcc) {
    const x = perf.get(pid);
    if (x) x.avgRating = ra.n ? ra.sum / ra.n : 0;
  }
  return { stats, minutes, perf };
}

function seasonLabel(year: number): string {
  return `${year}/${((year + 1) % 100).toString().padStart(2, '0')}`;
}

/** Resolve a single promotion playoff bracket; returns the promoted club id. */
async function runPromotionPlayoff(
  seeds: string[], // ordered: 3rd, 4th, 5th, 6th (best first)
  comp: Competition,
  seasonId: string,
  clubs: Record<string, Club>,
  players: Record<string, Player>,
  rng: Rng,
): Promise<{ winner: string; matches: Match[] }> {
  const matches: Match[] = [];
  const tie = async (homeSeed: number, awaySeed: number, label: string): Promise<string> => {
    const home = seeds[homeSeed];
    const away = seeds[awaySeed];
    const stub: Match = {
      id: `m_playoff_${comp.id}_${seasonId}_${label}`,
      competitionId: comp.id,
      seasonId,
      round: 9000,
      day: 9000,
      homeClubId: home,
      awayClubId: away,
      played: false,
      homeGoals: 0,
      awayGoals: 0,
      homeXg: 0,
      awayXg: 0,
      events: [],
      playerStats: [],
      seed: rng.seedValue(),
      neutral: true,
    };
    const [played] = await simulateMatches([stub], clubs, players);
    matches.push(played);
    // Higher seed (lower index) advances on a draw.
    if (played.homeGoals === played.awayGoals) return home;
    return played.homeGoals > played.awayGoals ? home : away;
  };

  const sf1 = await tie(0, 3, 'SF1'); // 3rd v 6th
  const sf2 = await tie(1, 2, 'SF2'); // 4th v 5th
  // Final: the better league seed hosts.
  const finalHome = seeds.indexOf(sf1) < seeds.indexOf(sf2) ? sf1 : sf2;
  const finalAway = finalHome === sf1 ? sf2 : sf1;
  const finalStub: Match = {
    id: `m_playoff_${comp.id}_${seasonId}_FINAL`,
    competitionId: comp.id,
    seasonId,
    round: 9001,
    day: 9001,
    homeClubId: finalHome,
    awayClubId: finalAway,
    played: false,
    homeGoals: 0,
    awayGoals: 0,
    homeXg: 0,
    awayXg: 0,
    events: [],
    playerStats: [],
    seed: rng.seedValue(),
    neutral: true,
  };
  const [finalPlayed] = await simulateMatches([finalStub], clubs, players);
  matches.push(finalPlayed);
  const winner =
    finalPlayed.homeGoals === finalPlayed.awayGoals
      ? finalHome
      : finalPlayed.homeGoals > finalPlayed.awayGoals
        ? finalHome
        : finalAway;
  return { winner, matches };
}

export async function resolveAndRollover(
  meta: SaveGame,
  clubs: Record<string, Club>,
  players: Record<string, Player>,
  seasonMatches: Match[],
): Promise<RolloverResult> {
  const rng = new Rng(meta.seed ^ (meta.startYear + meta.currentDay));
  const competitions: Record<string, Competition> = structuredClone(meta.competitions);
  const comps = Object.values(competitions).sort((a, b) => a.tier - b.tier);

  const finalStandings: Record<string, StandingRow[]> = {};
  for (const comp of comps) {
    // Apply any FFP points deduction active this season before deciding places.
    finalStandings[comp.id] = applyPointsPenalties(computeStandings(comp, seasonMatches), meta.pointsPenalties);
  }

  const seasonId = Object.values(meta.seasons).find((s) => s.current)?.id ?? 'season';
  const seasonYear = meta.startYear + Object.keys(meta.seasons).length - 1;

  // --- Cups, continental comps, MLS playoff & awards (§M6) ----------------
  const comp1 = await resolveSeasonCompetitions(
    competitions, clubs, players, finalStandings, seasonId, seasonYear, meta.seed,
  );
  const allAwards: Award[] = [...comp1.awards];
  const extraMatches: Match[] = comp1.matches;

  const news: NewsItem[] = [];
  const playoffMatches: Match[] = [];
  const promotedTo: Record<string, string[]> = {}; // compId -> clubs entering it
  const removedFrom: Record<string, Set<string>> = {};
  for (const comp of comps) {
    promotedTo[comp.id] = [];
    removedFrom[comp.id] = new Set();
  }

  // Walk each adjacent tier boundary WITHIN each country (pro/rel never crosses
  // national borders).
  const tiersByCountry = new Map<string, Competition[]>();
  for (const c of comps) (tiersByCountry.get(c.countryId) ?? tiersByCountry.set(c.countryId, []).get(c.countryId)!).push(c);

  for (const countryTiers of tiersByCountry.values()) {
    countryTiers.sort((a, b) => a.tier - b.tier);
    for (let i = 0; i < countryTiers.length - 1; i++) {
    const upper = countryTiers[i];
    const lower = countryTiers[i + 1];
    if (!upper.promotion || !lower.promotion) continue;

    const upperTable = finalStandings[upper.id];
    const lowerTable = finalStandings[lower.id];

    // Auto-relegated from upper = bottom N.
    const relegated = upperTable.slice(upperTable.length - upper.promotion.autoRelegate);
    // Auto-promoted from lower = top M.
    const autoUp = lowerTable.slice(0, lower.promotion.autoPromote);

    const promotedClubs: string[] = autoUp.map((r) => r.clubId);

    // Promotion playoff among the next `slots` clubs (best 4 typical).
    if (lower.promotion.promotionPlayoffSlots >= 4) {
      const start = lower.promotion.autoPromote;
      const seeds = lowerTable
        .slice(start, start + 4)
        .map((r) => r.clubId);
      if (seeds.length === 4) {
        const { winner, matches } = await runPromotionPlayoff(
          seeds, lower, meta.currentDay > 0 ? `S${meta.startYear}` : 'S', clubs, players, rng,
        );
        playoffMatches.push(...matches);
        promotedClubs.push(winner);
        news.push(mkNews(meta.currentDay, 'RESULT',
          `${clubs[winner]?.name} win the play-offs`,
          `${clubs[winner]?.name} are promoted to ${upper.name} via the play-off final.`));
      }
    }

    // Apply membership swaps.
    for (const r of relegated) {
      removedFrom[upper.id].add(r.clubId);
      promotedTo[lower.id].push(r.clubId);
      news.push(mkNews(meta.currentDay, 'RESULT',
        `${clubs[r.clubId]?.name} relegated`,
        `${clubs[r.clubId]?.name} drop to ${lower.name}.`));
    }
    for (const clubId of promotedClubs) {
      removedFrom[lower.id].add(clubId);
      promotedTo[upper.id].push(clubId);
    }
    for (const r of autoUp) {
      news.push(mkNews(meta.currentDay, 'RESULT',
        `${clubs[r.clubId]?.name} promoted`,
        `${clubs[r.clubId]?.name} are promoted to ${upper.name}.`));
    }
    }
  }

  // Champions news + league-title awards.
  for (const comp of comps) {
    if (comp.format === 'conference_playoff') continue; // crowned via playoff
    const champ = finalStandings[comp.id][0];
    if (champ) {
      allAwards.push({ type: 'LEAGUE_CHAMPION', label: comp.name, seasonId, competitionId: comp.id, clubId: champ.clubId });
      news.push(mkNews(meta.currentDay, 'AWARD',
        `${clubs[champ.clubId]?.name} win ${comp.name}`,
        `${clubs[champ.clubId]?.name} are crowned ${comp.name} champions.`));
      // Manager of the Year if the human's club wins its division.
      if (champ.clubId === meta.managerClubId) {
        allAwards.push({ type: 'MANAGER_OF_YEAR', label: 'Manager of the Year', seasonId, clubId: champ.clubId });
      }
    }
  }
  news.push(...comp1.news);

  // Rebuild each competition's membership.
  for (const comp of comps) {
    const kept = comp.clubIds.filter((id) => !removedFrom[comp.id].has(id));
    comp.clubIds = [...kept, ...promotedTo[comp.id]];
  }

  const nextYear = meta.startYear + Object.keys(meta.seasons).length; // simple increment

  // --- Progression: season stats, development, retirement, youth (§11-M3) ---
  const currentSeason = Object.values(meta.seasons).find((s) => s.current);
  const { stats, perf } = aggregateSeasonStats(
    currentSeason?.id ?? 'season', seasonMatches, players,
  );

  // Career award tallies (for Hall of Fame eligibility).
  const awardCount = new Map<string, number>();
  for (const a of [...(meta.history ?? []).flatMap((h) => h.awards), ...allAwards]) {
    if (a.playerId) awardCount.set(a.playerId, (awardCount.get(a.playerId) ?? 0) + 1);
  }

  // This season's trophies (per club) and individual awards (per player) feed
  // performance-based development.
  const trophiesByClub = new Map<string, number>();
  const awardsByPlayer = new Map<string, number>();
  for (const a of allAwards) {
    if ((a.type === 'LEAGUE_CHAMPION' || a.type === 'DOMESTIC_CUP' || a.type === 'CONTINENTAL') && a.clubId) {
      trophiesByClub.set(a.clubId, (trophiesByClub.get(a.clubId) ?? 0) + 1);
    }
    if (a.playerId) awardsByPlayer.set(a.playerId, (awardsByPlayer.get(a.playerId) ?? 0) + 1);
  }
  const ratingCap = meta.ratingCap ?? 90;
  const hallOfFameAdds: HallOfFameEntry[] = [];

  const updatedPlayers: Record<string, Player> = {};
  const retiredIds: string[] = [];
  // Parallel-roster academy players (owned via academyClubId, no first-team
  // contract) bypass senior development and the AI transfer window; carried
  // through untouched so they survive rollover. Aged/developed in Phase 2.
  const academyCarry: Record<string, Player> = {};
  for (const baseRaw of Object.values(players)) {
    if (!baseRaw.contract.clubId) {
      if (baseRaw.academyClubId) academyCarry[baseRaw.id] = baseRaw;
      continue; // skip free agents/retirees
    }
    // Expired loans return to the parent club. If the player's parent contract
    // lapsed while he was away, extend it a year so he actually rejoins the
    // squad instead of being released as a free agent the same rollover.
    let base = baseRaw;
    if (base.loan && base.loan.untilYear <= nextYear) {
      const parentId = base.loan.parentClubId;
      const expiresYear = base.contract.expiresYear <= nextYear ? nextYear + 1 : base.contract.expiresYear;
      base = {
        ...base,
        contract: { ...base.contract, clubId: parentId, expiresYear },
        loan: null,
        squadRole: 'ROTATION',
      };
      if (parentId === meta.managerClubId) {
        news.push(mkNews(meta.currentDay, 'TRANSFER',
          `${base.name.first} ${base.name.last} returns from loan`,
          `The ${base.position} is back at ${clubs[parentId]?.shortName ?? 'the club'} after his loan spell ended.`));
      }
    }
    const cId = base.contract.clubId as string;
    // Attach this season's stats to history before aging.
    const withStats: Player = {
      ...base,
      stats: [...base.stats, ...(stats.get(base.id) ?? [])],
    };
    if (shouldRetire(withStats, nextYear, rng)) {
      retiredIds.push(base.id);
      const peakOvr = Math.max(base.overall, ...base.developmentLog.map((d) => d.ovr));
      const awards = awardCount.get(base.id) ?? 0;
      if (peakOvr >= 82 || awards >= 1) {
        hallOfFameAdds.push({
          playerId: base.id,
          name: `${base.name.first} ${base.name.last}`,
          nationality: base.nationality,
          peakOvr,
          inductedYear: nextYear,
          lastClubName: clubs[cId]?.name ?? '',
          awardCount: awards,
        });
      }
      news.push(mkNews(meta.currentDay, 'GENERAL',
        `${base.name.first} ${base.name.last} retires`,
        `${clubs[cId]?.shortName ?? ''} ${base.position} hangs up his boots at ${nextYear - base.born.year}.`));
      continue;
    }
    const club = clubs[cId];
    const growth = coachingFactor(club?.staff, club?.facilities) * trainingBias(club?.trainingFocus);
    const dev = developPlayer(withStats, nextYear, rng, {
      growthFactor: growth,
      ratingCap,
      perf: perf.get(base.id) as SeasonPerf | undefined,
      trophies: trophiesByClub.get(cId) ?? 0,
      awards: awardsByPlayer.get(base.id) ?? 0,
    });
    updatedPlayers[dev.id] = dev;
  }

  // --- Academy rollover (§ Academy): develop/age prospects, graduate or
  // release the over-age, take a fresh philosophy-biased intake. Replaces the
  // old first-team youth dump; graduates feed the senior squads below.
  const firstTeamAvgByClub: Record<string, number> = {};
  {
    const sums: Record<string, { s: number; n: number }> = {};
    for (const p of Object.values(updatedPlayers)) {
      const cid = p.contract.clubId;
      if (!cid || nextYear - p.born.year <= 18) continue;
      (sums[cid] ??= { s: 0, n: 0 });
      sums[cid].s += p.overall; sums[cid].n += 1;
    }
    for (const [cid, { s, n }] of Object.entries(sums)) firstTeamAvgByClub[cid] = s / n;
  }
  // Youth competitions for the season just finished: trophies + a performance
  // boost for successful academies, fed into the rollover below.
  const youthSquadsByClub: Record<string, Player[]> = {};
  for (const p of Object.values(academyCarry)) {
    if (p.academyClubId) (youthSquadsByClub[p.academyClubId] ??= []).push(p);
  }
  const youth = runYouthCompetitions(
    meta.academies ?? {}, youthSquadsByClub, clubs, competitions, finalStandings,
    seasonId, seasonYear, rng, meta.managerClubId,
  );
  news.push(...youth.news);

  const academyResult = processAcademyRollover(
    youth.academies, meta.academyPlayers ?? {}, Object.values(academyCarry),
    clubs, firstTeamAvgByClub, nextYear, ratingCap, rng, meta.managerClubId, meta.currentDay,
    updatedPlayers, youth.perfBoostByClub,
  );
  // Graduates join the senior pool; released prospects become free agents;
  // poached/lost prospects leave the world entirely.
  for (const g of academyResult.graduates) updatedPlayers[g.id] = g;
  for (const r of academyResult.released) updatedPlayers[r.id] = r;
  for (const lostId of academyResult.lostPlayerIds) retiredIds.push(lostId);
  news.push(...academyResult.news);

  // Index players by club once (avoids O(clubs × players) scans globally).
  const squadIndex = new Map<string, Player[]>();
  for (const p of Object.values(updatedPlayers)) {
    if (p.contract.clubId) (squadIndex.get(p.contract.clubId) ?? squadIndex.set(p.contract.clubId, []).get(p.contract.clubId)!).push(p);
  }

  // Cap squad sizes by releasing surplus low-value players (keeps rosters
  // stable until deeper transfer activity fills the gap).
  const MAX_SQUAD = 30;
  for (const squad of squadIndex.values()) {
    if (squad.length <= MAX_SQUAD) continue;
    squad.sort((a, b) => b.overall + b.potential * 0.3 - (a.overall + a.potential * 0.3));
    for (const p of squad.splice(MAX_SQUAD)) {
      delete updatedPlayers[p.id];
      retiredIds.push(p.id);
    }
  }

  // Refresh club squads & captains from the indexed player set.
  const updatedClubs: Record<string, Club> = {};
  for (const club of Object.values(clubs)) {
    const squad = squadIndex.get(club.id) ?? [];
    const captain = [...squad].sort(
      (a, b) => b.attributes.mental.composure - a.attributes.mental.composure,
    )[0];
    updatedClubs[club.id] = {
      ...club,
      playerIds: squad.map((p) => p.id),
      captainId: captain?.id ?? null,
    };
  }

  // --- AI transfer window + season finances (§11-M4) ---------------------
  const window = runAiTransferWindow(updatedClubs, updatedPlayers, meta.managerClubId, nextYear, rng);
  const finalPlayers: Record<string, Player> = {};
  for (const p of window.changedPlayers) {
    if (!p.contract.clubId) {
      retiredIds.push(p.id); // unsigned free agents leave the game
    } else {
      finalPlayers[p.id] = p;
    }
  }
  // Re-add academy prospects (developed + aged) so they persist across rollover.
  for (const p of Object.values(academyResult.carriedPlayers)) finalPlayers[p.id] = p;
  const finalClubs = window.changedClubs;

  // AI clubs also trade with each other in the summer window, so squads move
  // worldwide without the manager's involvement (§ Living world). Players the
  // human has pre-agreed for the summer are reserved so the AI leaves them.
  const reserved = new Set((meta.pendingArrivals ?? []).map((a) => a.playerId));
  const aiMarket = runAiToAiTransfers(finalClubs, finalPlayers, meta.managerClubId, nextYear,
    new Rng((meta.seed ^ (nextYear * 0x51ed2701)) >>> 0), { maxDeals: 36, day: meta.currentDay, reserved });
  Object.assign(finalPlayers, aiMarket.players);
  Object.assign(finalClubs, aiMarket.clubs);
  news.push(mkNews(meta.currentDay, 'TRANSFER', '⏰ Transfer Deadline Day',
    `The window slams shut after ${window.news.length + aiMarket.deals.length} completed deals across the leagues.`));
  news.push(...aiMarket.news);
  news.push(...window.news);

  // Locate each club's just-finished position from the final standings.
  const positionOf = (clubId: string): { compId: string; pos: number } | null => {
    for (const [cid, rows] of Object.entries(finalStandings)) {
      const idx = rows.findIndex((r) => r.clubId === clubId);
      if (idx >= 0) return { compId: cid, pos: idx + 1 };
    }
    return null;
  };

  // FFP state carried forward (updated for the manager's club below).
  let ffp = meta.ffp;
  const pointsPenalties: Record<string, number> = {};

  const finalSquadIndex = new Map<string, Player[]>();
  for (const p of Object.values(finalPlayers)) {
    if (p.contract.clubId) (finalSquadIndex.get(p.contract.clubId) ?? finalSquadIndex.set(p.contract.clubId, []).get(p.contract.clubId)!).push(p);
  }
  for (const club of Object.values(finalClubs)) {
    const where = positionOf(club.id);
    if (!where) continue;
    const comp = competitions[where.compId];
    const squad = finalSquadIndex.get(club.id) ?? [];
    const bill = weeklyWageBill(squad);
    const staffBill = (club.staff ?? []).reduce((s, x) => s + (x.wage ?? 0), 0);
    const fin = computeSeasonFinances(club, where.pos, comp.numClubs, comp.tier, bill, staffBill);
    const balance = club.finances.balance + fin.net;
    const budgets = deriveBudgets(balance, bill, club.reputation, comp.tier);
    club.finances = { balance, wageBudgetUsed: bill, ...budgets };
    club.financeHistory = [
      ...(club.financeHistory ?? []),
      { year: meta.startYear + Object.keys(meta.seasons).length - 1, income: fin.income, expenses: fin.expenses, balance },
    ].slice(-12);

    if (club.id === meta.managerClubId) {
      news.push(mkNews(meta.currentDay, 'BOARD', 'End-of-season accounts',
        `Income ${fmt(fin.income)}, expenses ${fmt(fin.expenses)}, net ${fmt(fin.net)}. ` +
        `New transfer budget ${fmt(budgets.transferBudget)}, wage budget ${fmt(budgets.wageBudget)}/wk.`));
      // Financial Fair Play: assess the manager's club and apply any sanction.
      const verdict = assessFfp(fin.wages, fin.income, meta.ffp);
      ffp = { strikes: verdict.strikes, embargo: verdict.embargo };
      if (verdict.pointsPenalty > 0) pointsPenalties[club.id] = verdict.pointsPenalty;
      if (verdict.message) news.push(mkNews(meta.currentDay, 'BOARD', 'Financial Fair Play', verdict.message));
      if (verdict.forceSale) {
        const topEarner = [...squad].sort((a, b) => b.contract.wage - a.contract.wage)[0];
        if (topEarner) {
          finalPlayers[topEarner.id] = { ...finalPlayers[topEarner.id] ?? topEarner, transferListed: true };
          news.push(mkNews(meta.currentDay, 'BOARD', 'Forced sale',
            `${topEarner.name.first} ${topEarner.name.last} has been transfer-listed to satisfy FFP.`));
        }
      }
      // A tighter budget when spending is being reined in.
      if (verdict.embargo) club.finances = { ...club.finances, transferBudget: Math.round(club.finances.transferBudget * 0.4) };
    }
  }

  // --- Board objective evaluation & job security (§M5) -------------------
  let board: BoardState | undefined = meta.board;
  let sacked = false;
  if (meta.board) {
    const where = positionOf(meta.managerClubId);
    if (where) {
      const outcome = evaluateObjective(where.pos, meta.board);
      const confidence = Math.max(0, Math.min(100, meta.board.confidence + outcome.confidenceDelta));
      news.push(mkNews(meta.currentDay, 'BOARD', `Season review: objective ${outcome.verdict}`,
        `${outcome.summary} Finished ${where.pos} (target ${meta.board.targetPosition}). Board confidence: ${confidence}%.`));
      if (confidence < SACK_THRESHOLD) {
        sacked = true;
        news.push(mkNews(meta.currentDay, 'BOARD', 'You have been dismissed',
          'The board has terminated your contract after a disappointing campaign.'));
      } else {
        // Set the next season's objective in the manager's (possibly new) division.
        const managerComp = Object.values(competitions).find((c) =>
          c.clubIds.includes(meta.managerClubId));
        board = managerComp
          ? { ...setObjective(finalClubs[meta.managerClubId] ?? clubs[meta.managerClubId], managerComp), confidence }
          : { ...meta.board, confidence };
      }
    }
  }

  // --- Manager career (§ Manager career): reputation, stints, job offers -----
  const mgrClubId = meta.managerClubId;
  const mgrWhere = positionOf(mgrClubId);
  const managerTrophies = allAwards.filter(
    (a) => a.clubId === mgrClubId && (a.type === 'LEAGUE_CHAMPION' || a.type === 'DOMESTIC_CUP' || a.type === 'CONTINENTAL'),
  ).length;
  const finishPos = mgrWhere?.pos ?? meta.board?.targetPosition ?? 10;
  const targetPos = meta.board?.targetPosition ?? finishPos;
  const managerReputation = updateManagerReputation(meta.managerReputation ?? 50, finishPos, targetPos, managerTrophies, sacked);
  const managerStints: ManagerStint[] = (meta.managerStints ?? []).map((st) =>
    st.toYear === undefined ? { ...st, seasons: st.seasons + 1, trophies: st.trophies + managerTrophies } : st,
  );
  const jobOffers: JobOffer[] = generateJobOffers(
    managerReputation, mgrClubId, finalClubs, competitions, finalStandings, rng, sacked, meta.currentDay,
  );

  // --- International tournaments (§ Internationals) --------------------------
  // World Cup every 4 years (2026, 2030…); Euros + Copa América on the offset
  // years (2028, 2032…). Played in the summer after the club season, so they
  // never touch the club fixture calendar.
  const tournaments: TournamentResult[] = [];
  let worldCup: TournamentResult | null = null;
  const intlSeed = (salt: number) => new Rng((meta.seed ^ (seasonYear * 0x9e3779b1) ^ salt) >>> 0);
  if (isTournamentYear(seasonYear)) {
    worldCup = runWorldCup(finalPlayers, seasonYear, intlSeed(0x11));
    if (worldCup) tournaments.push(worldCup);
  } else if (isEurosOrCopaYear(seasonYear)) {
    const euros = runEuros(finalPlayers, seasonYear, intlSeed(0x22));
    const copa = runCopaAmerica(finalPlayers, seasonYear, intlSeed(0x33));
    if (euros) tournaments.push(euros);
    if (copa) tournaments.push(copa);
  }
  for (const t of tournaments) {
    news.push(...t.news);
    // Honour the winning nation's real-player XI.
    for (const pid of t.honouredPlayerIds) {
      const p = finalPlayers[pid];
      if (p) p.awards = [...p.awards, { awardId: t.kind, seasonId, label: `${t.name} winner` }];
    }
  }

  // --- Continental competitions: record the finished season's champions,
  // pay the manager's club its European prize money, then install next season's
  // Champions/Europa/Conference League (and Club World Cup on its cycle).
  const continentalChampions: Record<string, { clubId: string; year: number }> = { ...(meta.continentalChampions ?? {}) };
  const continentalHistory: { id: string; name: string; year: number; clubId: string }[] = [];
  let continentalPrizeTotal = 0;
  for (const state of Object.values(meta.continental ?? {})) {
    if (state.stage === 'DONE' && state.championId) {
      continentalChampions[state.id] = { clubId: state.championId, year: seasonYear };
      continentalHistory.push({ id: state.id, name: state.name, year: seasonYear, clubId: state.championId });
      allAwards.push({ type: 'CONTINENTAL', label: state.name, seasonId, clubId: state.championId });
      const champName = finalClubs[state.championId]?.name ?? clubs[state.championId]?.name ?? 'A club';
      news.push(mkNews(meta.currentDay, 'AWARD', `${champName} win the ${state.name}`,
        `${champName} are crowned champions of the ${state.name}.`));
    }
    continentalPrizeTotal += continentalPrize(state, seasonMatches, meta.managerClubId);
  }
  if (continentalPrizeTotal > 0 && finalClubs[meta.managerClubId]) {
    const c = finalClubs[meta.managerClubId];
    c.finances = {
      ...c.finances,
      balance: c.finances.balance + continentalPrizeTotal,
      transferBudget: c.finances.transferBudget + Math.round(continentalPrizeTotal * 0.5),
    };
    news.push(mkNews(meta.currentDay, 'BOARD', 'European prize money',
      `Your European campaign earned ${fmt(continentalPrizeTotal)} in prize money.`));
  }

  // Build next season + schedules (league rounds strided for midweek Europe).
  const newSeasonId = `season_${nextYear}`;
  const newMatches: Match[] = [];
  for (const comp of Object.values(competitions)) {
    const sched = generateSchedule(comp, newSeasonId, rng.seedValue(), LEAGUE_STRIDE);
    newMatches.push(...sched);
  }
  // Evolving league coefficients: drift each country's coefficient toward its
  // reputation baseline, boosted when its clubs win/reach European finals — so
  // strong leagues earn more berths over the decades and weak ones slip.
  const baseline = reputationBaseline(competitions, finalClubs);
  const prevCoef = meta.countryCoefficients ?? baseline;
  const perfBonus: Record<string, number> = {};
  for (const st of Object.values(meta.continental ?? {})) {
    if (st.stage !== 'DONE' || !st.championId) continue;
    const w = st.id === 'UEFA_CL' ? 4 : st.id === 'UEFA_EL' ? 2 : st.id === 'UEFA_CONF' ? 1 : 0;
    const cc = finalClubs[st.championId]?.countryId ?? clubs[st.championId]?.countryId;
    if (cc && w) perfBonus[cc] = (perfBonus[cc] ?? 0) + w;
    const rc = st.runnerUpId ? (finalClubs[st.runnerUpId]?.countryId ?? clubs[st.runnerUpId]?.countryId) : undefined;
    if (rc && w) perfBonus[rc] = (perfBonus[rc] ?? 0) + w / 2;
  }
  const countryCoefficients: Record<string, number> = {};
  for (const country of Object.keys(baseline)) {
    countryCoefficients[country] = 0.8 * (prevCoef[country] ?? baseline[country]) + 0.2 * baseline[country] + (perfBonus[country] ?? 0);
  }

  const continentalInstall = installContinental({
    competitions, clubs: finalClubs, seasonId: newSeasonId, seasonYear: nextYear,
    maxLeagueDay: lastMatchday(newMatches), seed: (meta.seed ^ (nextYear * 0x27d4eb2f)) >>> 0,
    finalStandings, continentalChampions, countryCoefficients,
  });
  newMatches.push(...continentalInstall.matches);

  // --- Domestic cups: record the finished season's winners, pay prize money,
  // then install next season's cups + a Super Cup per nation (league champion vs
  // major-cup winner).
  const cupHolders: Record<string, { clubId: string; year: number }> = { ...(meta.cupHolders ?? {}) };
  let cupPrizeTotal = 0;
  const majorWinnerByCountry: Record<string, string> = {};
  for (const cup of Object.values(meta.domesticCups ?? {})) {
    if (cup.stage === 'DONE' && cup.championId) {
      cupHolders[cup.id] = { clubId: cup.championId, year: seasonYear };
      if (cup.kind === 'MAJOR') majorWinnerByCountry[cup.countryId] = cup.championId;
      if (cup.kind !== 'SUPER') {
        allAwards.push({ type: 'DOMESTIC_CUP', label: cup.name, seasonId, clubId: cup.championId });
        const nm = finalClubs[cup.championId]?.name ?? clubs[cup.championId]?.name ?? 'A club';
        news.push(mkNews(meta.currentDay, 'AWARD', `${nm} win the ${cup.name}`, `${nm} lift the ${cup.name}.`));
      }
    }
    cupPrizeTotal += cupPrize(cup, seasonMatches, meta.managerClubId);
  }
  if (cupPrizeTotal > 0 && finalClubs[meta.managerClubId]) {
    const c = finalClubs[meta.managerClubId];
    c.finances = { ...c.finances, balance: c.finances.balance + cupPrizeTotal, transferBudget: c.finances.transferBudget + Math.round(cupPrizeTotal * 0.5) };
    news.push(mkNews(meta.currentDay, 'BOARD', 'Cup prize money', `Your cup runs earned ${fmt(cupPrizeTotal)}.`));
  }

  // Next season's cups + Super Cups.
  const cupInstall = createDomesticCups(
    competitions, finalClubs, newSeasonId, nextYear, lastMatchday(newMatches), (meta.seed ^ (nextYear * 0x9e3779b9)) >>> 0,
  );
  const nextCups: Record<string, DomesticCupState> = { ...cupInstall.states };
  newMatches.push(...cupInstall.matches);
  for (const [compId, rows] of Object.entries(finalStandings)) {
    const comp = competitions[compId];
    if (!comp || comp.tier !== 1) continue;
    const champ = rows[0]?.clubId;
    const cupWinner = majorWinnerByCountry[comp.countryId];
    if (champ && cupWinner) {
      const sc = createSuperCup(comp.countryId, champ, cupWinner, newSeasonId, nextYear, (meta.seed ^ hashStr(comp.countryId)) >>> 0);
      Object.assign(nextCups, sc.states);
      newMatches.push(...sc.matches);
    }
  }

  // Shift next season's fixtures back by the pre-season, so it too opens with an
  // off-season (day 0) before the August opener — matching the new-game calendar.
  applyPreseasonOffset(newMatches, continentalInstall.states, nextCups);

  // --- Individual awards (§ Awards) --------------------------------------
  // Computed from the finished season's matches + this year's international
  // tournaments. Season-end honours join `allAwards` now; the gala trophies
  // (Ballon d'Or, Kopa, Yashin, Puskás) are deferred to a late-October ceremony.
  const leagueChampionClubs = new Set<string>();
  const clubLeague: Record<string, string> = {};
  for (const comp of Object.values(meta.competitions)) {
    if (comp.tier !== 1) continue;
    const ch = finalStandings[comp.id]?.[0]?.clubId;
    if (ch) leagueChampionClubs.add(ch);
    for (const cid of comp.clubIds) clubLeague[cid] = comp.id;
  }
  const continentalChampionClubs = new Set<string>();
  for (const st of Object.values(meta.continental ?? {})) if (st.stage === 'DONE' && st.championId) continentalChampionClubs.add(st.championId);
  const awardsRes = computeSeasonAwards({
    seasonId, year: seasonYear, matches: seasonMatches, players,
    comps: buildCompMeta(meta.competitions, meta.continental, clubs),
    clubs, clubLeague, tournaments, leagueChampionClubs, continentalChampionClubs,
  });
  allAwards.push(...awardsRes.seasonEnd);
  // Stamp every honour onto the players who earned it — individual awards on the
  // winner, team trophies on the whole title-winning squad — so each profile
  // carries a permanent trophy cabinet.
  const TEAM_TROPHY = new Set(['LEAGUE_CHAMPION', 'DOMESTIC_CUP', 'CONTINENTAL']);
  const stamp = (pid: string, awardId: string, label?: string) => {
    const p = finalPlayers[pid];
    if (p) finalPlayers[pid] = { ...p, awards: [...p.awards, { awardId, seasonId, label }] };
  };
  for (const a of allAwards) {
    if (a.playerId) stamp(a.playerId, a.type, a.label);
    else if (a.clubId && TEAM_TROPHY.has(a.type)) {
      for (const p of Object.values(finalPlayers)) if (p.contract.clubId === a.clubId) stamp(p.id, a.type, a.label);
    }
  }
  const pendingGala = awardsRes.gala.length ? scheduleGala(seasonId, seasonYear, awardsRes.gala, newMatches) : null;

  // --- Rival managers: reputations move with results; strugglers get sacked.
  const managerChurn = rolloverAiManagers(
    meta.aiManagers, finalClubs, finalStandings, meta.managerClubId, seasonYear, meta.seed,
  );
  news.push(...managerChurn.news);

  // --- Achievements: check the manager's milestones for the finished season.
  const mgrRowWhere = positionOf(meta.managerClubId);
  const managerLeagueRow = mgrRowWhere ? finalStandings[mgrRowWhere.compId]?.[mgrRowWhere.pos - 1] : undefined;
  const wonWorldCupAsManager = !!meta.nationalJob && tournaments.some((t) => t.kind === 'WORLD_CUP' && t.championNation === meta.nationalJob);
  const newAchievements = checkAchievements({
    managerClubId: meta.managerClubId, year: seasonYear, seasonAwards: allAwards,
    managerLeagueRow, managerStints, history: meta.history ?? [],
    wonWorldCupAsManager, unlocked: meta.achievements ?? {},
  });

  const newSeason: Season = {
    id: newSeasonId,
    year: nextYear,
    label: seasonLabel(nextYear),
    competitionIds: Object.keys(competitions),
    current: true,
    finished: false,
  };

  const historyEntry: SeasonHistory = {
    seasonId, year: seasonYear, label: seasonLabel(seasonYear), awards: allAwards,
  };

  return {
    competitions, newSeason, newMatches, playoffMatches, news, finalStandings,
    players: finalPlayers, clubs: finalClubs, retiredIds, board, sacked,
    historyEntry, hallOfFameAdds, extraMatches,
    academies: academyResult.academies, academyPlayers: academyResult.overlay,
    youthCompetitions: youth.youthCompetitions,
    managerReputation, managerStints, jobOffers, worldCup, tournaments,
    continental: continentalInstall.states,
    continentalChampions,
    continentalHistory,
    domesticCups: nextCups,
    cupHolders,
    ffp,
    pointsPenalties,
    countryCoefficients,
    achievements: newAchievements,
    pendingGala,
    aiManagers: managerChurn.managers,
  };
}

/** Manager's prize money from a finished cup run (per win + a winner's bonus). */
function cupPrize(cup: DomesticCupState, seasonMatches: Match[], clubId: string): number {
  const scale = cup.kind === 'MAJOR' ? 1 : cup.kind === 'SUPER' ? 0.3 : 0.4;
  const mine = seasonMatches.filter(
    (m) => m.competitionId === cup.id && m.played && (m.homeClubId === clubId || m.awayClubId === clubId),
  );
  if (mine.length === 0) return 0;
  let wins = 0;
  for (const m of mine) {
    const home = m.homeClubId === clubId;
    const gf = home ? m.homeGoals : m.awayGoals;
    const ga = home ? m.awayGoals : m.homeGoals;
    const pen = m.events.find((e) => e.type === 'PENALTY');
    if (gf > ga || (gf === ga && pen && (pen.side === 'home') === home)) wins++;
  }
  const champ = cup.championId === clubId ? 8_000_000 : 0;
  return Math.round((wins * 1_500_000 + champ) * scale);
}

function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** Manager's European prize money from a finished continental campaign. */
function continentalPrize(
  state: ContinentalState,
  seasonMatches: Match[],
  clubId: string,
): number {
  const scale = state.id === 'UEFA_CL' ? 1 : state.id === 'UEFA_EL' ? 0.45
    : state.id === 'UEFA_CONF' ? 0.22 : state.id === 'FIFA_CWC' ? 0.8 : 0.3;
  const mine = seasonMatches.filter(
    (m) => m.competitionId === state.id && m.played && (m.homeClubId === clubId || m.awayClubId === clubId),
  );
  if (mine.length === 0) return 0;
  let wins = 0;
  for (const m of mine) {
    const home = m.homeClubId === clubId;
    const gf = home ? m.homeGoals : m.awayGoals;
    const ga = home ? m.awayGoals : m.homeGoals;
    if (gf > ga) wins++;
  }
  const champ = state.championId === clubId ? 25_000_000 : 0;
  return Math.round((18_000_000 + wins * 2_800_000 + champ) * scale);
}

function fmt(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `£${(n / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `£${(n / 1_000).toFixed(0)}K`;
  return `£${n}`;
}

let _newsSeq = 0;
function mkNews(day: number, category: NewsItem['category'], title: string, body: string): NewsItem {
  return { id: `news_${day}_${_newsSeq++}`, day, category, title, body, read: false };
}
