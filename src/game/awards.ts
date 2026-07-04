// ---------------------------------------------------------------------------
// Individual awards (§ Awards). A pure, deterministic layer over the season's
// matches and the year's international tournaments. It produces two batches:
//   • season-end awards, resolved at rollover (Golden Boots, Playmaker, per-
//     league / per-confederation / continental Player of the Season, the World
//     XI), and
//   • gala awards, computed now but deferred to a late-October ceremony that
//     honours the season just finished (Ballon d'Or, Kopa, Yashin, Puskás).
// International honours (World Cup Golden Ball / Glove / Young Player, plus a
// Player of the Tournament for the Euros & Copa) are derived from the tournament
// summaries and the national squads.
// ---------------------------------------------------------------------------

import type { Match } from '../types/match';
import type { Player } from '../types/player';
import type { Club } from '../types/club';
import type { Competition } from '../types/competition';
import type { Award, TournamentSummary } from '../types/league';
import type { ContinentalState } from '../types/continental';
import { POSITION_GROUP, type PositionGroup } from '../types/attributes';
import { flattenAttributes } from '../engine/ratings';
import { buildNationSquads } from '../engine/nationalTeam';

// --- Competition metadata (scope + strength coefficient) -------------------

export interface CompMeta {
  id: string;
  kind: 'LEAGUE' | 'CONTINENTAL' | 'CUP';
  confederation: string;
  name: string;
  coefficient: number; // strength multiplier for the global Golden Boot
  tier: number;
  continentalId?: string; // UEFA_CL / UEFA_EL / UEFA_CONF / FIFA_CWC
}

/**
 * Build the competition descriptor map. Domestic-league coefficients follow the
 * European Golden Shoe scheme adapted worldwide: the tier-1 leagues are ranked
 * by average club reputation, the top 5 weight ×2, the next band (6–22) ×1.5,
 * the rest ×1; lower divisions ×0.75. Continental and international goals carry
 * their own high coefficients.
 */
export function buildCompMeta(
  competitions: Record<string, Competition>,
  continental: Record<string, ContinentalState> | undefined,
  clubs: Record<string, Club>,
): Record<string, CompMeta> {
  const out: Record<string, CompMeta> = {};

  // Rank tier-1 leagues by average reputation to assign Golden-Shoe factors.
  const topLeagues = Object.values(competitions)
    .filter((c) => c.tier === 1)
    .map((c) => {
      const reps = c.clubIds.map((id) => clubs[id]?.reputation ?? 0);
      const avg = reps.length ? reps.reduce((a, b) => a + b, 0) / reps.length : 0;
      return { id: c.id, avg };
    })
    .sort((a, b) => b.avg - a.avg);
  const leagueRank = new Map<string, number>();
  topLeagues.forEach((l, i) => leagueRank.set(l.id, i + 1));

  const leagueCoeff = (compId: string, tier: number): number => {
    if (tier !== 1) return 0.75;
    const rank = leagueRank.get(compId) ?? 99;
    if (rank <= 5) return 2.0;
    if (rank <= 22) return 1.5;
    return 1.0;
  };

  for (const c of Object.values(competitions)) {
    out[c.id] = {
      id: c.id,
      kind: 'LEAGUE',
      confederation: c.confederation,
      name: c.name,
      coefficient: leagueCoeff(c.id, c.tier),
      tier: c.tier,
    };
  }

  const CONT_COEFF: Record<string, number> = { UEFA_CL: 2.0, UEFA_EL: 1.5, UEFA_CONF: 1.25, FIFA_CWC: 2.0 };
  for (const st of Object.values(continental ?? {})) {
    out[st.id] = {
      id: st.id, kind: 'CONTINENTAL', confederation: 'UEFA', name: st.name,
      coefficient: CONT_COEFF[st.id] ?? 1.5, tier: 1, continentalId: st.id,
    };
  }
  return out;
}

/** Goals scored in international tournaments carry this Golden-Boot weight. */
export const INTL_GOAL_COEFF = 2.0;

// --- Per-player aggregation ------------------------------------------------

interface Tally {
  pid: string;
  apps: number;
  minutes: number;
  goals: number;
  assists: number;
  ratingSum: number;
  ratingCount: number;
  cleanSheets: number;
  weightedGoals: number; // Σ league/continental goals × coefficient
}

function emptyTally(pid: string): Tally {
  return { pid, apps: 0, minutes: 0, goals: 0, assists: 0, ratingSum: 0, ratingCount: 0, cleanSheets: 0, weightedGoals: 0 };
}

const avgRating = (t: Tally) => (t.ratingCount ? t.ratingSum / t.ratingCount : 0);

/** Scan matches into per-player tallies, optionally restricted to a comp set. */
function scan(
  matches: Match[],
  players: Record<string, Player>,
  comps: Record<string, CompMeta>,
  only?: (compId: string) => boolean,
): Map<string, Tally> {
  const acc = new Map<string, Tally>();
  for (const m of matches) {
    if (!m.played || m.neutral) continue;
    if (only && !only(m.competitionId)) continue;
    const cm = comps[m.competitionId];
    const coeff = cm?.coefficient ?? 1;
    for (const ps of m.playerStats) {
      const player = players[ps.playerId];
      if (!player) continue;
      let t = acc.get(ps.playerId);
      if (!t) { t = emptyTally(ps.playerId); acc.set(ps.playerId, t); }
      t.apps += 1;
      t.minutes += ps.minutes;
      t.goals += ps.goals;
      t.assists += ps.assists;
      t.ratingSum += ps.rating;
      t.ratingCount += 1;
      t.weightedGoals += ps.goals * coeff;
      const grp = POSITION_GROUP[player.position];
      if (grp === 'GK' || grp === 'DEF') {
        const conceded = player.contract.clubId === m.homeClubId ? m.awayGoals : m.homeGoals;
        if (conceded === 0) t.cleanSheets += 1;
      }
    }
  }
  return acc;
}

// --- Scoring heuristics ----------------------------------------------------

/**
 * A player's overall award merit within a scope. Rewards a high match rating
 * (the dominant term), sustained availability, and end-product; the caller
 * layers competition strength and trophy weight on top for the global races.
 */
function meritScore(t: Tally, minApps: number): number {
  if (t.apps < Math.min(minApps, 6)) return -1;
  const appsFactor = Math.min(1, t.apps / minApps);
  const output = t.goals * 0.35 + t.assists * 0.25;
  return (avgRating(t) - 6) * (0.6 + 0.4 * appsFactor) * 10 + output;
}

function best<T>(items: T[], score: (x: T) => number): T | undefined {
  let bx: T | undefined; let bs = -Infinity;
  for (const it of items) { const s = score(it); if (s > bs) { bs = s; bx = it; } }
  return bx;
}

// --- The main entry point --------------------------------------------------

export interface AwardsInput {
  seasonId: string;
  year: number;
  matches: Match[];
  players: Record<string, Player>;
  comps: Record<string, CompMeta>;
  clubs: Record<string, Club>;
  /** clubId → the tier-1 league competition id it plays in. */
  clubLeague: Record<string, string>;
  tournaments: TournamentSummary[];
  /** Clubs that won a league / continental title this season (trophy weight). */
  leagueChampionClubs: Set<string>;
  continentalChampionClubs: Set<string>;
}

export interface AwardsResult {
  /** Resolved immediately at season rollover. */
  seasonEnd: Award[];
  /** Deferred to the autumn gala (Ballon d'Or, Kopa, Yashin, Puskás). */
  gala: Award[];
}

export function computeSeasonAwards(input: AwardsInput): AwardsResult {
  const { seasonId, players, comps, matches, tournaments } = input;
  const seasonEnd: Award[] = [];

  const globalT = scan(matches, players, comps);
  const leagueOnly = (id: string) => comps[id]?.kind === 'LEAGUE';
  // League-only tally drives the coefficient-weighted global Golden Boot, so
  // (as with the real European Golden Shoe) cup and continental goals don't
  // inflate it — only weighted domestic-league goals plus internationals.
  const leagueT = scan(matches, players, comps, leagueOnly);

  // International goals/assists per real player (from tournament top-N lists).
  const intlGoals = new Map<string, number>();
  const intlAssists = new Map<string, number>();
  for (const t of tournaments) {
    for (const s of t.topScorers) if (s.playerId) intlGoals.set(s.playerId, (intlGoals.get(s.playerId) ?? 0) + s.count);
    for (const s of t.topAssisters) if (s.playerId) intlAssists.set(s.playerId, (intlAssists.get(s.playerId) ?? 0) + s.count);
  }

  // --- Per-league Golden Boot & Player of the Season ---------------------
  const leagueComps = Object.values(comps).filter((c) => c.kind === 'LEAGUE' && c.tier === 1);
  for (const lc of leagueComps) {
    const t = scan(matches, players, comps, (id) => id === lc.id);
    const entries = [...t.values()];
    const boot = best(entries.filter((e) => e.goals > 0), (e) => e.goals * 1000 + avgRating(e));
    if (boot) {
      seasonEnd.push({ type: 'GOLDEN_BOOT', label: `${lc.name} Golden Boot`, seasonId, competitionId: lc.id, playerId: boot.pid, value: boot.goals });
    }
    const pots = best(entries.filter((e) => e.apps >= 15), (e) => meritScore(e, 25));
    if (pots) {
      seasonEnd.push({ type: 'PLAYER_OF_SEASON', label: `${lc.name} Player of the Season`, seasonId, competitionId: lc.id, playerId: pots.pid });
    }
  }

  // --- Global Golden Boot (coefficient-weighted, incl. internationals) ----
  const weightedTotal = (t: Tally) => t.weightedGoals + (intlGoals.get(t.pid) ?? 0) * INTL_GOAL_COEFF;
  const globalBoot = best([...leagueT.values()], weightedTotal);
  if (globalBoot && weightedTotal(globalBoot) > 0) {
    const raw = globalBoot.goals + (intlGoals.get(globalBoot.pid) ?? 0);
    seasonEnd.push({
      type: 'GLOBAL_GOLDEN_BOOT', label: 'Global Golden Boot', seasonId, playerId: globalBoot.pid,
      value: raw, note: `${Math.round(weightedTotal(globalBoot))} pts`,
    });
  }

  // --- Playmaker (top assister worldwide, club + country) ----------------
  const totalAssists = (t: Tally) => t.assists + (intlAssists.get(t.pid) ?? 0);
  const playmaker = best([...globalT.values()], totalAssists);
  if (playmaker && totalAssists(playmaker) > 0) {
    seasonEnd.push({ type: 'PLAYMAKER', label: 'Playmaker of the Season', seasonId, playerId: playmaker.pid, value: totalAssists(playmaker) });
  }

  // --- Trophy weighting for the elite individual races --------------------
  const trophyBonus = (pid: string): number => {
    const cid = players[pid]?.contract.clubId;
    let b = 0;
    if (cid && input.leagueChampionClubs.has(cid)) b += 6;
    if (cid && input.continentalChampionClubs.has(cid)) b += 8;
    return b;
  };
  const eliteScore = (t: Tally): number => {
    const cm = leagueComps.find((c) => c.id === input.clubLeague[players[t.pid]?.contract.clubId ?? '']);
    const strength = cm?.coefficient ?? 1;
    const intl = (intlGoals.get(t.pid) ?? 0) * 0.4 + (intlAssists.get(t.pid) ?? 0) * 0.3;
    return meritScore(t, 30) * strength + intl + trophyBonus(t.pid);
  };

  // --- Per-confederation Player of the Year -------------------------------
  const CONFEDS = ['UEFA', 'CONMEBOL', 'CONCACAF', 'AFC', 'CAF', 'OFC'];
  const confedLabel: Record<string, string> = {
    UEFA: 'European', CONMEBOL: 'South American', CONCACAF: 'North American',
    AFC: 'Asian', CAF: 'African', OFC: 'Oceanian',
  };
  for (const confed of CONFEDS) {
    const inConfed = [...globalT.values()].filter((t) => {
      const cid = players[t.pid]?.contract.clubId;
      const lg = cid ? input.clubLeague[cid] : undefined;
      return lg ? comps[lg]?.confederation === confed : false;
    });
    const winner = best(inConfed.filter((t) => t.apps >= 15), eliteScore);
    if (winner) {
      seasonEnd.push({ type: 'CONFED_POTY', label: `${confedLabel[confed] ?? confed} Footballer of the Year`, seasonId, playerId: winner.pid, competitionId: confed });
    }
  }

  // --- UEFA Player of the Year + per-competition best (CL/EL/Conf) --------
  const uefaIds = new Set(Object.values(comps).filter((c) => c.kind === 'CONTINENTAL' && c.confederation === 'UEFA').map((c) => c.id));
  if (uefaIds.size > 0) {
    const uefaT = scan(matches, players, comps, (id) => uefaIds.has(id));
    const poty = best([...uefaT.values()].filter((t) => t.apps >= 6), (t) => meritScore(t, 12) + trophyBonus(t.pid));
    if (poty) seasonEnd.push({ type: 'UEFA_POTY', label: 'UEFA Men’s Player of the Year', seasonId, playerId: poty.pid });

    for (const cid of uefaIds) {
      const compT = scan(matches, players, comps, (id) => id === cid);
      const bestP = best([...compT.values()].filter((t) => t.apps >= 5), (t) => meritScore(t, 10));
      if (bestP) seasonEnd.push({ type: 'CONTINENTAL_BEST', label: `${comps[cid].name} Player of the Season`, seasonId, competitionId: cid, playerId: bestP.pid });
    }
  }

  // --- Team of the Season (World XI, 4-3-3) -------------------------------
  seasonEnd.push(...worldXI(globalT, players, eliteScore, seasonId, leagueOnly, comps));

  // --- Gala awards (deferred): Ballon d'Or, Kopa, Yashin, Puskás ---------
  const gala: Award[] = [];
  const ballon = best([...globalT.values()].filter((t) => t.apps >= 20), eliteScore);
  if (ballon) gala.push({ type: 'GLOBAL_BEST', label: 'Ballon d’Or', seasonId, playerId: ballon.pid });

  const kopa = best(
    [...globalT.values()].filter((t) => t.apps >= 12 && (input.year - (players[t.pid]?.born.year ?? 0)) <= 21),
    eliteScore,
  );
  if (kopa) gala.push({ type: 'KOPA', label: 'Kopa Trophy', seasonId, playerId: kopa.pid, note: 'Best under-21' });

  const yashin = best(
    [...globalT.values()].filter((t) => players[t.pid] && POSITION_GROUP[players[t.pid].position] === 'GK' && t.apps >= 18),
    (t) => avgRating(t) * 10 + t.cleanSheets * 1.5,
  );
  if (yashin) gala.push({ type: 'YASHIN', label: 'Yashin Trophy', seasonId, playerId: yashin.pid, value: yashin.cleanSheets, note: `${yashin.cleanSheets} clean sheets` });

  const puskasWin = puskas([...globalT.values()], players);
  if (puskasWin) gala.push({ type: 'PUSKAS', label: 'Puskás Award', seasonId, playerId: puskasWin });

  // --- International tournament honours -----------------------------------
  seasonEnd.push(...tournamentAwards(tournaments, players, seasonId));

  // Attach human-readable notes to the boot/playmaker where useful.
  for (const a of seasonEnd) {
    if (a.type === 'GOLDEN_BOOT' && a.value != null) a.note = `${a.value} goals`;
    if (a.type === 'PLAYMAKER' && a.value != null) a.note = `${a.value} assists`;
  }

  return { seasonEnd, gala };
}

// --- Team of the Season ----------------------------------------------------

const XI_SHAPE: { group: PositionGroup; count: number }[] = [
  { group: 'GK', count: 1 }, { group: 'DEF', count: 4 }, { group: 'MID', count: 3 }, { group: 'ATT', count: 3 },
];

function worldXI(
  globalT: Map<string, Tally>,
  players: Record<string, Player>,
  score: (t: Tally) => number,
  seasonId: string,
  _leagueOnly: (id: string) => boolean,
  _comps: Record<string, CompMeta>,
): Award[] {
  const pool = [...globalT.values()].filter((t) => t.apps >= 15);
  const byGroup: Record<PositionGroup, Tally[]> = { GK: [], DEF: [], MID: [], ATT: [] };
  for (const t of pool) {
    const grp = POSITION_GROUP[players[t.pid]?.position ?? 'CM'];
    byGroup[grp].push(t);
  }
  for (const g of Object.keys(byGroup) as PositionGroup[]) byGroup[g].sort((a, b) => score(b) - score(a));

  const out: Award[] = [];
  for (const { group, count } of XI_SHAPE) {
    for (let i = 0; i < count && i < byGroup[group].length; i++) {
      const t = byGroup[group][i];
      out.push({ type: 'TEAM_OF_SEASON', label: 'Team of the Season', seasonId, playerId: t.pid, slot: players[t.pid]?.position });
    }
  }
  return out;
}

// --- Puskás (best goal) proxy ----------------------------------------------

/**
 * We don't model goal aesthetics, so approximate the Puskás with a "screamer"
 * score: long-shot and technique attributes weighted by how many goals the
 * player scored (a prolific long-range shooter is the likeliest wonder-goal
 * author). Fully deterministic.
 */
function puskas(tallies: Tally[], players: Record<string, Player>): string | undefined {
  const scorers = tallies.filter((t) => t.goals >= 3 && players[t.pid]);
  const screamer = (t: Tally): number => {
    const a = flattenAttributes(players[t.pid].attributes);
    const flair = (a.longShots ?? 0) * 0.5 + (a.curve ?? 0) * 0.25 + (a.volleys ?? 0) * 0.15 + (a.shotPower ?? 0) * 0.1;
    return flair * Math.min(1, t.goals / 12);
  };
  return best(scorers, screamer)?.pid;
}

// --- International tournament honours ---------------------------------------

function tournamentAwards(tournaments: TournamentSummary[], players: Record<string, Player>, seasonId: string): Award[] {
  const out: Award[] = [];
  for (const t of tournaments) {
    const squads = buildNationSquads(players);
    // Contribution = goals + assists across the tournament (top-N lists).
    const contrib = new Map<string, { pid: string; nation: string; name: string; g: number; a: number }>();
    const add = (pid: string | undefined, nation: string, name: string, g: number, a: number) => {
      if (!pid) return;
      const c = contrib.get(pid) ?? { pid, nation, name, g: 0, a: 0 };
      c.g += g; c.a += a; contrib.set(pid, c);
    };
    for (const s of t.topScorers) add(s.playerId, s.nation, s.name, s.count, 0);
    for (const s of t.topAssisters) add(s.playerId, s.nation, s.name, 0, s.count);
    const contribScore = (c: { g: number; a: number; nation: string }) =>
      c.g * 2 + c.a + (c.nation === t.championNation ? 3 : c.nation === t.runnerUpNation ? 1.5 : 0);

    const isWC = t.kind === 'WORLD_CUP';
    const ballon = best([...contrib.values()], contribScore);
    if (ballon) {
      out.push({
        type: isWC ? 'GOLDEN_BALL' : 'TOURNAMENT_BEST',
        label: isWC ? `${t.name} Golden Ball` : `${t.name} Player of the Tournament`,
        seasonId, playerId: ballon.pid, note: `${ballon.g}G ${ballon.a}A (${ballon.nation})`,
      });
    }

    if (isWC) {
      // Golden Glove: the #1 keeper of a deep-running nation (champion first).
      const glove = gkForNation(t.championNation, squads) ?? gkForNation(t.runnerUpNation, squads);
      if (glove) out.push({ type: 'GOLDEN_GLOVE', label: `${t.name} Golden Glove`, seasonId, playerId: glove });

      // Young Player: best U21 contributor.
      const young = best(
        [...contrib.values()].filter((c) => { const p = players[c.pid]; return p && t.year - p.born.year <= 21; }),
        contribScore,
      );
      if (young) out.push({ type: 'WC_YOUNG_PLAYER', label: `${t.name} Young Player`, seasonId, playerId: young.pid, note: `${young.g}G ${young.a}A` });
    }
  }
  return out;
}

function gkForNation(nation: string, squads: ReturnType<typeof buildNationSquads>): string | undefined {
  const squad = squads[nation];
  if (!squad) return undefined;
  const gk = squad.players.find((p) => POSITION_GROUP[p.position] === 'GK');
  return gk?.id;
}
