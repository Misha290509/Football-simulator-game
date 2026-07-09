// ---------------------------------------------------------------------------
// International tournaments (§ International management). Data-driven fields drawn
// from the fixed NATIONS table (top ~64 FIFA nations), enriched by real dataset
// players where a nation has them. Every tournament is simulated at season
// rollover, in the summer after the club season, via a cheap seeded group stage
// + knockout — fully deterministic (thread the Rng) and additive to the club
// calendar (it never touches club fixtures).
//
//   • World Cup  — every 4 years (2026, 2030, …): 48 teams, 12 groups of 4.
//                  Top 2 of each group + the 8 best 3rd-placed teams → Round of 32.
//   • Euros      — every 4 years, offset (2028, 2032, …): 24 UEFA teams,
//                  6 groups of 4. Top 2 + 4 best thirds → Round of 16.
//   • Copa América — same years as the Euros: 16 teams (CONMEBOL + CONCACAF
//                  invitees), 4 groups of 4. Top 2 → Quarter-finals.
//
// Knockout seeding never pits two group winners against each other in the first
// knockout round (a winner always draws a runner-up or a third-placed team).
// ---------------------------------------------------------------------------

import type { Player } from '../types/player';
import type {
  NewsItem, TournamentKind, TournamentSummary, IntlGroup, IntlGroupRow, IntlTie, IntlScorer,
} from '../types/league';
import { POSITION_GROUP, type PositionGroup } from '../types/attributes';
import { Rng, hashSeed, clamp } from '../engine/rng';
import { buildNationSquads, nationStrength, type NationSquad } from '../engine/nationalTeam';
import { NATIONS, NATION_BY_NAME, nationsInConfederation } from '../data/nations';
import { FIRST_NAMES, LAST_NAMES } from '../data/names';

/** A tournament result = the serializable summary plus generated news. */
export interface TournamentResult extends TournamentSummary {
  honouredPlayerIds: string[]; // champion nation's real-player XI (may be empty)
  news: NewsItem[];
}
/** Back-compat alias — the World Cup shape callers used previously. */
export type WorldCupResult = TournamentResult;

/** World Cup years: 2026, 2030, 2034, … */
export function isTournamentYear(year: number): boolean {
  return year % 4 === 2;
}
/** Euros + Copa América years: 2028, 2032, 2036, … */
export function isEurosOrCopaYear(year: number): boolean {
  return year % 4 === 0;
}

// --- Fields ----------------------------------------------------------------

/** The 48 strongest nations overall. */
export function worldCupField(): string[] {
  return [...NATIONS].sort((a, b) => b.strength - a.strength).slice(0, 48).map((n) => n.name);
}
/** The 24 strongest UEFA nations. */
export function eurosField(): string[] {
  return nationsInConfederation('UEFA').slice(0, 24).map((n) => n.name);
}
/** All 10 CONMEBOL nations + the 6 strongest CONCACAF invitees = 16. */
export function copaField(): string[] {
  const conmebol = nationsInConfederation('CONMEBOL').map((n) => n.name);
  const invitees = nationsInConfederation('CONCACAF').slice(0, 16 - conmebol.length).map((n) => n.name);
  return [...conmebol, ...invitees];
}

// --- Entrants (strength + weighted scorer pool) ----------------------------

interface Scorer { name: string; playerId?: string; weight: number; }
interface Entrant {
  nation: string;
  strength: number;
  scorers: Scorer[]; // weighted goal/assist contributors (attackers dominate)
  xiIds: string[]; // real-player ids for honours (may be empty)
}

const POS_WEIGHT: Record<PositionGroup, number> = { GK: 0.03, DEF: 0.35, MID: 1.0, ATT: 1.7 };

function buildEntrant(nation: string, squads: Record<string, NationSquad>, seed: number): Entrant {
  const info = NATION_BY_NAME[nation];
  const base = info?.strength ?? 68;
  const squad = squads[nation];
  const strength = nationStrength(nation, squads);

  const scorers: Scorer[] = [];
  if (squad && squad.players.length > 0) {
    for (const p of squad.players) {
      const grp = POSITION_GROUP[p.position];
      scorers.push({ name: `${p.name.first} ${p.name.last}`, playerId: p.id, weight: p.overall * POS_WEIGHT[grp] });
    }
  }
  // Ensure every nation fields a full spread of named contributors even without
  // real players — generated deterministically from the nation name so a given
  // save always shows the same players.
  if (scorers.length < 11) {
    const rng = new Rng(hashSeed(nation) ^ seed);
    const layout: PositionGroup[] = ['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'ATT', 'ATT', 'ATT'];
    for (let i = scorers.length; i < 11; i++) {
      const grp = layout[i] ?? 'MID';
      const ovr = clamp(base + rng.normal(0, 5), 45, 95);
      scorers.push({ name: `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`, weight: ovr * POS_WEIGHT[grp] });
    }
  }
  return { nation, strength, scorers, xiIds: squad ? squad.xi.map((p) => p.id) : [] };
}

// --- Match simulation ------------------------------------------------------

interface GoalTally { name: string; nation: string; playerId?: string; goals: number; assists: number; }
type TallyMap = Map<string, GoalTally>;

function tallyKey(nation: string, s: Scorer): string {
  return `${nation}|${s.playerId ?? s.name}`;
}
function bump(tally: TallyMap, nation: string, s: Scorer, goals: number, assists: number) {
  const k = tallyKey(nation, s);
  let t = tally.get(k);
  if (!t) { t = { name: s.name, nation, playerId: s.playerId, goals: 0, assists: 0 }; tally.set(k, t); }
  t.goals += goals; t.assists += assists;
}

/** Weighted pick of a scorer from an entrant's pool. */
function pickScorer(e: Entrant, rng: Rng): Scorer {
  const total = e.scorers.reduce((s, x) => s + x.weight, 0);
  let r = rng.float(0, total);
  for (const s of e.scorers) { r -= s.weight; if (r <= 0) return s; }
  return e.scorers[e.scorers.length - 1];
}

/** Attribute `goals` to scorers (with ~70% assisted by a different team-mate). */
function attribute(e: Entrant, goals: number, tally: TallyMap, rng: Rng) {
  for (let g = 0; g < goals; g++) {
    const scorer = pickScorer(e, rng);
    bump(tally, e.nation, scorer, 1, 0);
    if (rng.chance(0.7)) {
      let assister = pickScorer(e, rng);
      let guard = 0;
      while (assister === scorer && guard++ < 4) assister = pickScorer(e, rng);
      if (assister !== scorer) bump(tally, e.nation, assister, 0, 1);
    }
  }
}

interface PlayedMatch { ga: number; gb: number; }

function playMatch(a: Entrant, b: Entrant, tally: TallyMap, rng: Rng): PlayedMatch {
  const diff = a.strength - b.strength;
  const muA = clamp(1.25 + diff * 0.035, 0.15, 4.2);
  const muB = clamp(1.25 - diff * 0.035, 0.15, 4.2);
  const ga = Math.max(0, Math.round(rng.normal(muA, 1.05)));
  const gb = Math.max(0, Math.round(rng.normal(muB, 1.05)));
  attribute(a, ga, tally, rng);
  attribute(b, gb, tally, rng);
  return { ga, gb };
}

/** Penalty shootout when a knockout tie is level — strength gives a small edge. */
function shootout(a: Entrant, b: Entrant, rng: Rng): { winner: Entrant; score: [number, number] } {
  let sa = 0, sb = 0;
  const pa = clamp(0.72 + (a.strength - b.strength) * 0.004, 0.55, 0.9);
  const pb = clamp(0.72 - (a.strength - b.strength) * 0.004, 0.55, 0.9);
  for (let i = 0; i < 5; i++) { if (rng.chance(pa)) sa++; if (rng.chance(pb)) sb++; }
  while (sa === sb) { const x = rng.chance(pa) ? 1 : 0; const y = rng.chance(pb) ? 1 : 0; sa += x; sb += y; }
  return sa > sb ? { winner: a, score: [sa, sb] } : { winner: b, score: [sa, sb] };
}

// --- Group stage -----------------------------------------------------------

interface Qualifier { entrant: Entrant; groupIndex: number; rank: number; row: IntlGroupRow; }

const GROUP_LETTERS = 'ABCDEFGHIJKL';
const ROUND_ROBIN: [number, number][] = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]];

function emptyRow(nation: string): IntlGroupRow {
  return { nation, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 };
}
function applyResult(row: IntlGroupRow, gf: number, ga: number) {
  row.played++; row.gf += gf; row.ga += ga; row.gd = row.gf - row.ga;
  if (gf > ga) { row.won++; row.points += 3; }
  else if (gf === ga) { row.drawn++; row.points += 1; }
  else row.lost++;
}
function rankRows(rows: IntlGroupRow[], strengthOf: (n: string) => number): IntlGroupRow[] {
  return [...rows].sort((a, b) =>
    b.points - a.points || b.gd - a.gd || b.gf - a.gf || strengthOf(b.nation) - strengthOf(a.nation));
}

/** Snake the sorted entrants into balanced pots, then draw one per pot per group. */
function drawGroups(sorted: Entrant[], nGroups: number, rng: Rng): Entrant[][] {
  const pots: Entrant[][] = [];
  for (let k = 0; k < 4; k++) pots.push(rng.shuffle(sorted.slice(k * nGroups, (k + 1) * nGroups)));
  const groups: Entrant[][] = [];
  for (let g = 0; g < nGroups; g++) groups.push([pots[0][g], pots[1][g], pots[2][g], pots[3][g]]);
  return groups;
}

// --- Knockout --------------------------------------------------------------

function roundName(teams: number): string {
  switch (teams) {
    case 32: return 'Round of 32';
    case 16: return 'Round of 16';
    case 8: return 'Quarter-final';
    case 4: return 'Semi-final';
    case 2: return 'Final';
    default: return `Last ${teams}`;
  }
}

/**
 * Seed the first knockout round so no two group winners meet: every winner is
 * paired with a runner-up or third-placed team (from a different group where
 * possible); leftover non-winners are paired among themselves.
 */
function seedFirstRound(quals: Qualifier[], rng: Rng): [Entrant, Entrant][] {
  const winners = quals.filter((q) => q.rank === 1);
  const nonWinners = rng.shuffle(quals.filter((q) => q.rank !== 1));
  const used = new Set<Qualifier>();
  const ties: [Entrant, Entrant][] = [];
  for (const w of winners) {
    let opp = nonWinners.find((n) => !used.has(n) && n.groupIndex !== w.groupIndex);
    if (!opp) opp = nonWinners.find((n) => !used.has(n));
    if (!opp) break;
    used.add(opp);
    ties.push([w.entrant, opp.entrant]);
  }
  const rest = nonWinners.filter((n) => !used.has(n));
  for (let i = 0; i + 1 < rest.length; i += 2) ties.push([rest[i].entrant, rest[i + 1].entrant]);
  return ties;
}

function playKnockoutTie(round: string, a: Entrant, b: Entrant, tally: TallyMap, rng: Rng): { tie: IntlTie; winner: Entrant } {
  const { ga, gb } = playMatch(a, b, tally, rng);
  let winner: Entrant;
  let pens: [number, number] | undefined;
  if (ga > gb) winner = a;
  else if (gb > ga) winner = b;
  else { const s = shootout(a, b, rng); winner = s.winner; pens = s.score; }
  return {
    tie: { round, homeNation: a.nation, awayNation: b.nation, homeGoals: ga, awayGoals: gb, winner: winner.nation, pens },
    winner,
  };
}

// --- Tournament runner -----------------------------------------------------

function runTournament(
  kind: TournamentKind,
  displayName: string,
  year: number,
  fieldNames: string[],
  nGroups: number,
  thirdsNeeded: number,
  players: Record<string, Player> | Player[],
  rng: Rng,
): TournamentResult | null {
  if (fieldNames.length < nGroups * 4) return null;

  const squads = buildNationSquads(players);
  const entrants = fieldNames.map((n) => buildEntrant(n, squads, year));
  const strengthOf = (n: string) => NATION_BY_NAME[n]?.strength ?? 68;
  const byNation = new Map(entrants.map((e) => [e.nation, e]));

  const sorted = [...entrants].sort((a, b) => b.strength - a.strength);
  const drawn = drawGroups(sorted, nGroups, rng);
  const tally: TallyMap = new Map();

  const groups: IntlGroup[] = [];
  const winnersAndRunners: Qualifier[] = [];
  const thirdRows: { groupIndex: number; row: IntlGroupRow }[] = [];

  drawn.forEach((group, gi) => {
    const rows = group.map((e) => emptyRow(e.nation));
    const rowOf = new Map(rows.map((r) => [r.nation, r]));
    for (const [i, j] of ROUND_ROBIN) {
      const { ga, gb } = playMatch(group[i], group[j], tally, rng);
      applyResult(rowOf.get(group[i].nation)!, ga, gb);
      applyResult(rowOf.get(group[j].nation)!, gb, ga);
    }
    const ranked = rankRows(rows, strengthOf);
    groups.push({ name: `Group ${GROUP_LETTERS[gi]}`, rows: ranked });
    winnersAndRunners.push(
      { entrant: byNation.get(ranked[0].nation)!, groupIndex: gi, rank: 1, row: ranked[0] },
      { entrant: byNation.get(ranked[1].nation)!, groupIndex: gi, rank: 2, row: ranked[1] },
    );
    if (thirdsNeeded > 0 && ranked[2]) thirdRows.push({ groupIndex: gi, row: ranked[2] });
  });

  // Best third-placed teams: rank across groups by points, then goal difference.
  const bestThirds: Qualifier[] = [];
  if (thirdsNeeded > 0) {
    const ranked = [...thirdRows].sort((a, b) =>
      b.row.points - a.row.points || b.row.gd - a.row.gd || b.row.gf - a.row.gf ||
      strengthOf(b.row.nation) - strengthOf(a.row.nation));
    for (const t of ranked.slice(0, thirdsNeeded)) {
      bestThirds.push({ entrant: byNation.get(t.row.nation)!, groupIndex: t.groupIndex, rank: 3, row: t.row });
    }
  }

  const qualifiers = [...winnersAndRunners, ...bestThirds];
  // Knockout bracket size must be a power of two.
  const bracket = 1 << Math.floor(Math.log2(qualifiers.length));

  const knockout: IntlTie[] = [];
  let ties = seedFirstRound(qualifiers, rng);
  // Play the first round.
  let round = roundName(bracket);
  let advancers: Entrant[] = [];
  for (const [a, b] of ties) {
    const r = playKnockoutTie(round, a, b, tally, rng);
    knockout.push(r.tie);
    advancers.push(r.winner);
  }
  // Subsequent rounds: straight bracket down to the final.
  while (advancers.length > 1) {
    round = roundName(advancers.length);
    const next: Entrant[] = [];
    for (let i = 0; i + 1 < advancers.length; i += 2) {
      const r = playKnockoutTie(round, advancers[i], advancers[i + 1], tally, rng);
      knockout.push(r.tie);
      next.push(r.winner);
    }
    advancers = next;
  }

  const finalTie = knockout[knockout.length - 1];
  const championNation = finalTie.winner;
  const runnerUpNation = finalTie.homeNation === championNation ? finalTie.awayNation : finalTie.homeNation;
  const champion = byNation.get(championNation)!;

  const scorers = [...tally.values()];
  const topScorers: IntlScorer[] = scorers
    .filter((t) => t.goals > 0)
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists)
    .slice(0, 10)
    .map((t) => ({ name: t.name, nation: t.nation, count: t.goals, playerId: t.playerId }));
  const topAssisters: IntlScorer[] = scorers
    .filter((t) => t.assists > 0)
    .sort((a, b) => b.assists - a.assists || b.goals - a.goals)
    .slice(0, 10)
    .map((t) => ({ name: t.name, nation: t.nation, count: t.assists, playerId: t.playerId }));

  const boot = topScorers[0];
  const news: NewsItem[] = [{
    id: `news_${kind}_${year}`, day: 0, category: 'AWARD',
    title: `${championNation} win the ${displayName}!`,
    body: `${championNation} are crowned champions, beating ${runnerUpNation} in the final.` +
      (boot ? ` ${boot.name} (${boot.nation}) took the Golden Boot with ${boot.count} goals.` : ''),
    read: false,
  }];

  return {
    kind, name: displayName, year,
    championNation, runnerUpNation,
    groups, knockout, topScorers, topAssisters,
    participants: fieldNames,
    honouredPlayerIds: champion.xiIds,
    news,
  };
}

// --- Public wrappers -------------------------------------------------------

export function runWorldCup(
  players: Record<string, Player> | Player[], year: number, rng: Rng,
): TournamentResult | null {
  return runTournament('WORLD_CUP', `World Cup ${year}`, year, worldCupField(), 12, 8, players, rng);
}

export function runEuros(
  players: Record<string, Player> | Player[], year: number, rng: Rng,
): TournamentResult | null {
  return runTournament('EUROS', `European Championship ${year}`, year, eurosField(), 6, 4, players, rng);
}

export function runCopaAmerica(
  players: Record<string, Player> | Player[], year: number, rng: Rng,
): TournamentResult | null {
  return runTournament('COPA', `Copa América ${year}`, year, copaField(), 4, 0, players, rng);
}

// --- Manager campaign summary ------------------------------------------------

export interface CampaignFinish {
  /** e.g. "champions", "runners-up", "semi-finalists", "quarter-finalists",
   *  "eliminated in the Round of 16", "out at the group stage". */
  label: string;
  /** Manager-reputation swing for a national coach with this finish. */
  repDelta: number;
  /** True when the nation lifted the trophy. */
  champion: boolean;
}

/** How deep a nation went in a finished tournament (for its manager's story). */
export function nationFinish(t: TournamentSummary, nation: string): CampaignFinish | null {
  if (!t.participants.includes(nation)) return null;
  if (t.championNation === nation) return { label: 'champions', repDelta: 12, champion: true };
  if (t.runnerUpNation === nation) return { label: 'runners-up', repDelta: 6, champion: false };

  // Deepest knockout round the nation appeared in.
  const rounds = t.knockout.filter((k) => k.homeNation === nation || k.awayNation === nation);
  if (rounds.length === 0) return { label: 'out at the group stage', repDelta: -4, champion: false };
  const last = rounds[rounds.length - 1];
  const r = last.round.toLowerCase();
  if (r.includes('semi')) return { label: 'semi-finalists', repDelta: 3, champion: false };
  if (r.includes('quarter')) return { label: 'quarter-finalists', repDelta: 1, champion: false };
  return { label: `eliminated in the ${last.round}`, repDelta: -2, champion: false };
}
