// ---------------------------------------------------------------------------
// Player Career mode — orchestration helpers (§ Player Career). Tier 1 seed:
// pure, read-only helpers for reasoning about which career mode a save is in.
// Later tiers grow this module with avatar creation, the selection model
// (playerSelectionWeight), the personal matchday loop and progression.
// ---------------------------------------------------------------------------

import type { SaveGame, NewsItem } from '../types/league';
import type { Dataset } from '../types/dataset';
import type { Player, Foot } from '../types/player';
import type { Position } from '../types/attributes';
import type { Club } from '../types/club';
import type { Competition } from '../types/competition';
import type { Match } from '../types/match';
import type { CareerMode, PlayerCareer, PlayerCareerOrigin, SquadStatus, AvatarMatchSummary } from '../types/playerCareer';
import type { WorldSnapshot } from '../db/db';
import { Rng, clamp, hashSeed } from '../engine/rng';
import { generatePlayer } from '../engine/generator';
import { createNewGame } from './newGame';
import {
  generateSeasonObjectives, generateMatchObjectives, evaluateMatchObjectives, updateSeasonObjectives,
} from './playerObjectives';
import { roleMeetingConversation } from './playerConversations';
import { DEFAULT_CAREER_SETTINGS, EMPTY_MOMENT_STATS } from '../types/interactiveMatch';
import { DEFAULT_LIFESTYLE, DEFAULT_PUBLIC_IMAGE } from '../types/playerOffPitch';

/** The career mode of a save. Absent flag ⇒ 'MANAGER' (every legacy save). */
export function careerModeOf(meta: Pick<SaveGame, 'careerMode'> | null | undefined): CareerMode {
  return meta?.careerMode ?? 'MANAGER';
}

/** True when the human is playing as a single footballer, not a manager. */
export function isPlayerCareer(meta: Pick<SaveGame, 'careerMode'> | null | undefined): boolean {
  return careerModeOf(meta) === 'PLAYER';
}

/**
 * The avatar's career block, if this is a Player save. Returns null in manager
 * mode (or if a Player save somehow lacks the block), so callers can branch
 * without repeating the mode check.
 */
export function playerCareerOf(
  meta: (Pick<SaveGame, 'careerMode'> & { playerCareer?: PlayerCareer }) | null | undefined,
): PlayerCareer | null {
  return isPlayerCareer(meta) ? meta?.playerCareer ?? null : null;
}

// --- Avatar creation & the Player new-game path (Tier 1 · Step 2) -----------

/**
 * Starting archetypes. Each biases the created avatar's current ability
 * (`targetBias`) and ceiling (`potBonus`) and carries a bit of narrative
 * flavor. Kept light for now; deeper attribute/trait bias arrives in Tier 2.
 */
export interface PlayerArchetype {
  id: string;
  blurb: string;
  targetBias: number; // nudges starting overall
  potBonus: number; // nudges the ceiling
}

export const PLAYER_ARCHETYPES: PlayerArchetype[] = [
  { id: 'Academy Graduate', blurb: 'A balanced product of the youth system.', targetBias: 0, potBonus: 6 },
  { id: 'Prodigy', blurb: 'Rare talent — a high ceiling and the hype to match.', targetBias: 4, potBonus: 15 },
  { id: 'Late Bloomer', blurb: 'Raw now, but real room to grow into something special.', targetBias: -4, potBonus: 12 },
  { id: 'Street Baller', blurb: 'Flair-first and self-taught — unpredictable, exciting.', targetBias: 2, potBonus: 8 },
  { id: 'Journeyman', blurb: 'A dependable pro who makes the most of solid tools.', targetBias: 1, potBonus: 3 },
];

export function archetypeById(id: string | undefined): PlayerArchetype {
  return PLAYER_ARCHETYPES.find((a) => a.id === id) ?? PLAYER_ARCHETYPES[0];
}

export interface NewPlayerCareerConfig {
  saveName: string;
  dataset: Dataset;
  /** The avatar's club. */
  clubId: string;
  startYear: number;
  seed?: number;
  origin: PlayerCareerOrigin; // 'CREATED' | 'ACADEMY' | 'EXISTING'
  // CREATED / ACADEMY:
  playerName?: { first: string; last: string };
  nationality?: string;
  position?: Position;
  preferredFoot?: Foot;
  archetype?: string;
  /**
   * EXISTING (inherit) — the id of a first-team player to become. Because the id
   * only exists in the built world, callers must pass a snapshot they already
   * built via `buildPlayerWorld` (below); rebuilding would mint fresh ids.
   */
  existingPlayerId?: string;
  /** Pre-built world to attach the career to (required for EXISTING; optional
   *  for CREATED). Lets a picker UI build once, then inherit a real player. */
  prebuiltWorld?: WorldSnapshot;
}

/** Build just the world for a Player career (no avatar yet), so a picker UI can
 *  list real players before the human inherits one. Same world a manager game
 *  gets; the avatar's club stands in as the "manager club". */
export function buildPlayerWorld(config: Pick<NewPlayerCareerConfig, 'saveName' | 'dataset' | 'clubId' | 'startYear' | 'seed'>): WorldSnapshot {
  return createNewGame({
    saveName: config.saveName,
    managerName: config.saveName,
    dataset: config.dataset,
    managerClubId: config.clubId,
    startYear: config.startYear,
    seed: config.seed,
  });
}

function displayName(avatar: Player): string {
  return `${avatar.name.first} ${avatar.name.last}`.trim();
}

/** Build the human's created avatar as a first-team-registered young player at
 *  their club (so the existing selection engine can actually pick them), with an
 *  academy backstory via dual registration. Deterministic given the save seed. */
function buildCreatedAvatar(snapshot: WorldSnapshot, config: NewPlayerCareerConfig): Player {
  const club = snapshot.clubs[config.clubId];
  const ratingCap = snapshot.meta.ratingCap ?? 90;
  const rng = new Rng((snapshot.meta.seed ^ hashSeed(`avatar_${config.clubId}`)) >>> 0);
  const arch = archetypeById(config.archetype);
  const position = config.position ?? 'ST';
  const target = clamp(52 + arch.targetBias + rng.int(-2, 3), 40, 66);

  const p = generatePlayer({
    rng, currentYear: config.startYear, target, position,
    ageRange: [16, 18], nationality: config.nationality ?? club.countryId,
    ratingCap, squadRole: 'PROSPECT',
  });
  if (config.playerName && (config.playerName.first || config.playerName.last)) {
    p.name = { first: config.playerName.first.trim() || p.name.first, last: config.playerName.last.trim() || p.name.last };
  }
  if (config.preferredFoot) p.preferredFoot = config.preferredFoot;
  p.id = `pc_${config.clubId}`; // one stable avatar id per save
  p.potential = clamp(Math.min(ratingCap, p.potential + arch.potBonus), p.overall + 3, ratingCap) as number;
  p.contract = {
    ...p.contract,
    clubId: config.clubId,
    startYear: config.startYear,
    expiresYear: config.startYear + 3,
    wage: Math.max(500, Math.round(p.overall * 40)),
  };
  p.academyClubId = config.clubId; // dual-registered academy backstory
  p.academyGraduateOf = config.clubId;
  p.squadRole = 'PROSPECT';
  p.developmentLog = [{ year: config.startYear, ovr: p.overall, pot: p.potential }];
  return p;
}

function originMilestone(origin: PlayerCareerOrigin, club: string): string {
  if (origin === 'EXISTING') return `Began the career at ${club}.`;
  return `Joined ${club} and set out to make it as a professional.`;
}

/** The starting player-career block for a freshly created avatar. */
export function initialPlayerCareer(
  avatar: Player,
  origin: PlayerCareerOrigin,
  archetype: string,
  clubName: string,
  seed = 0,
  startDay = 0,
): PlayerCareer {
  return {
    playerId: avatar.id,
    origin,
    archetype,
    managerTrust: 42,
    status: 'YOUTH',
    clubRelationship: 55,
    fanRating: 50,
    following: 0,
    seasonGoals: 0,
    seasonApps: 0,
    seasonAvgRating: 0,
    objectives: generateSeasonObjectives(avatar, seed),
    matchObjectives: [],
    traits: [],
    personality: {
      professionalism: avatar.hidden?.professionalism ?? 55,
      ambition: avatar.hidden?.ambition ?? 60,
      loyalty: 55,
      temperament: 50,
    },
    sponsorships: [],
    international: { capped: false, caps: 0, intlGoals: 0 },
    statusHistory: [],
    promises: [],
    pendingConversations: [roleMeetingConversation(startDay)],
    rival: null,
    confidence: 60,
    matchSharpness: 100,
    traitProgress: {},
    momentStats: { ...EMPTY_MOMENT_STATS },
    // Off-pitch (Tier 4) — starts self-represented, unknown, with a neutral routine.
    agent: null,
    transferInterest: [],
    activeSagas: [],
    contractOffers: [],
    transferRequestPending: false,
    loanSpell: null,
    loanOffers: [],
    publicImage: { ...DEFAULT_PUBLIC_IMAGE },
    pressHistory: [],
    pendingPress: [],
    pendingSponsorOffers: [],
    lifestyle: { routine: { ...DEFAULT_LIFESTYLE.routine }, autoManage: true },
    careerEarnings: 0,
    milestones: [{ day: startDay, text: originMilestone(origin, clubName) }],
    seasonHistory: [],
  };
}

/**
 * Build a full Player-career save: the same simulated world as a manager game,
 * but the human follows a single avatar. Reuses `createNewGame` for the world
 * (the avatar's club stands in as the "manager club" so board/objective code
 * keeps working; those screens are hidden in Player mode), then registers the
 * avatar and stamps `careerMode: 'PLAYER'` + the player-career block.
 */
export function createPlayerCareerGame(config: NewPlayerCareerConfig): WorldSnapshot {
  // Reuse a pre-built world if the caller supplied one (the inherit-a-player
  // flow), else build a fresh one. EXISTING requires a pre-built world because
  // its player id only exists inside that specific build.
  const snapshot = config.prebuiltWorld ?? createNewGame({
    saveName: config.saveName,
    managerName: config.saveName, // replaced below with the avatar's name
    dataset: config.dataset,
    managerClubId: config.clubId,
    startYear: config.startYear,
    seed: config.seed,
  });

  let avatar: Player;
  if (config.origin === 'EXISTING') {
    const chosen = config.existingPlayerId ? snapshot.players[config.existingPlayerId] : undefined;
    if (!chosen || chosen.contract.clubId !== config.clubId) {
      throw new Error('Cannot inherit that player — not a first-team member of the chosen club.');
    }
    avatar = chosen;
  } else {
    avatar = buildCreatedAvatar(snapshot, config);
    snapshot.players[avatar.id] = avatar;
  }

  const club = snapshot.clubs[config.clubId];
  const name = displayName(avatar);
  snapshot.meta.careerMode = 'PLAYER';
  snapshot.meta.managerName = name;
  snapshot.meta.careerSettings = { ...DEFAULT_CAREER_SETTINGS };
  let career = initialPlayerCareer(avatar, config.origin, config.archetype ?? 'Academy Graduate', club?.name ?? 'your club', snapshot.meta.seed);
  // Seed objectives for the avatar's opening fixture so they show from day one.
  const firstMatch = Object.values(snapshot.matches)
    .filter((m) => !m.neutral && (m.homeClubId === config.clubId || m.awayClubId === config.clubId))
    .sort((a, b) => a.day - b.day)[0];
  if (firstMatch) career = ensureAdvanceObjectives(career, avatar, [firstMatch], snapshot.meta.seed);
  snapshot.meta.playerCareer = career;
  snapshot.meta.news = [
    {
      id: 'news_welcome_player',
      day: 0,
      category: 'MILESTONE',
      title: `${name} joins ${club?.name ?? 'the club'}`,
      body: `A ${avatarAgeLabel(avatar, config.startYear)} ${avatar.position} with a point to prove. Break into the first team and make your name.`,
      read: false,
    },
  ];
  return snapshot;
}

function avatarAgeLabel(avatar: Player, year: number): string {
  const age = year - avatar.born.year;
  return `${age}-year-old`;
}

// --- Selection model & trust (Tier 1 · Step 3) ------------------------------

/** A small squad-status floor on selection priority (grows in Tier 2). */
const STATUS_SELECTION_BUMP: Record<SquadStatus, number> = {
  YOUTH: 0, PROSPECT: 0.5, ROTATION: 1, KEY: 2.5, STAR: 3.5, CAPTAIN: 4,
};

/**
 * How much the avatar's manager relationship nudges their auto-selection score.
 * Centred on 50 trust (no nudge); trusted players get a positive push, distrusted
 * ones a negative one. Deliberately small (~±8 at the extremes) so trust flips
 * borderline calls — it never lets a raw prospect leapfrog a clearly better pro.
 * The real route into the side is developing enough ability to be a close call.
 */
export function playerSelectionWeight(career: Pick<PlayerCareer, 'managerTrust' | 'status'>): number {
  const fromTrust = (clamp(career.managerTrust, 0, 100) - 50) * 0.16; // ±8
  return fromTrust + (STATUS_SELECTION_BUMP[career.status] ?? 0);
}

/** Average match rating that leaves trust unchanged (a par performance). */
export const PAR_MATCH_RATING = 6.7;

/**
 * Drift manager trust from a match performance. A par game (~6.7) barely moves
 * it; a strong display climbs it, a poor one dents it. Per-match swing is capped
 * so no single game makes or breaks the relationship, and trust always stays in
 * [0,100] — a slump is recoverable, never a death spiral.
 */
export function trustFromMatch(trust: number, rating: number): number {
  const delta = clamp((rating - PAR_MATCH_RATING) * 1.8, -3.5, 3.5);
  return clamp(Math.round((clamp(trust, 0, 100) + delta) * 10) / 10, 0, 100) as number;
}

/**
 * Apply an advance's worth of the avatar's appearances to their career: drift
 * trust from the mean match rating across games actually played. Returns an
 * updated career block (or the same one if the avatar didn't feature). Pure.
 */
export function applyMatchdayToCareer(
  career: PlayerCareer,
  ratings: number[],
): PlayerCareer {
  if (ratings.length === 0) return career;
  const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  return { ...career, managerTrust: trustFromMatch(career.managerTrust, avg) };
}

// --- The personal matchday loop (Tier 1 · Step 4) ---------------------------

const DEBUT_PHRASE = 'senior debut';
const FIRST_GOAL_PHRASE = 'first senior goal';
const hasMilestone = (c: PlayerCareer, phrase: string) =>
  c.milestones.some((m) => m.text.toLowerCase().includes(phrase));

/** Sum a player's season stats (across competitions) for one season. */
function seasonTotals(avatar: Player, seasonId: string | undefined): { apps: number; goals: number; assists: number; ratingSum: number; ratingCount: number } {
  let apps = 0, goals = 0, assists = 0, ratingSum = 0, ratingCount = 0;
  for (const s of avatar.stats) {
    if (seasonId && s.seasonId !== seasonId) continue;
    apps += s.appearances; goals += s.goals; assists += s.assists;
    ratingSum += s.ratingSum; ratingCount += s.ratingCount;
  }
  return { apps, goals, assists, ratingSum, ratingCount };
}

/**
 * Ensure the avatar has objectives for this advance: season targets (generated
 * once if missing) and pre-match objectives for each of their club's upcoming
 * fixtures that doesn't have them yet. Deterministic. Call before simulating.
 */
export function ensureAdvanceObjectives(
  career: PlayerCareer,
  avatar: Player | undefined,
  upcoming: Match[],
  seed: number,
): PlayerCareer {
  if (!avatar) return career;
  const clubId = avatar.contract.clubId;
  let objectives = career.objectives ?? [];
  if (objectives.length === 0) objectives = generateSeasonObjectives(avatar, seed);

  const matchObjectives = [...(career.matchObjectives ?? [])];
  const have = new Set(matchObjectives.map((o) => o.matchId));
  for (const m of upcoming) {
    if (m.neutral || !clubId) continue;
    if (m.homeClubId !== clubId && m.awayClubId !== clubId) continue;
    if (have.has(m.id)) continue;
    matchObjectives.push(...generateMatchObjectives(avatar, m, seed));
    have.add(m.id);
  }
  return { ...career, objectives, matchObjectives };
}

export interface AvatarMatchdayResult {
  career: PlayerCareer;
  news: NewsItem[];
  /** Morale change to apply to the avatar Player (objective outcomes). */
  moraleDelta: number;
}

/**
 * Fold one advance into the avatar's career: refresh season tallies, drift
 * manager trust from the games actually played, capture the latest match as a
 * summary, and raise personal milestones (debut, first goal) + a feed item.
 * Pure & deterministic. `avatar` must already carry this advance's stats.
 */
export function applyAvatarMatchday(
  career: PlayerCareer,
  avatar: Player,
  played: Match[],
  clubs: Record<string, Club>,
  competitions: Record<string, Competition>,
  seasonId: string | undefined,
  day: number,
): AvatarMatchdayResult {
  const clubId = avatar.contract.clubId;
  // The avatar's appearances this advance (chronological).
  const appearances: { m: Match; ps: NonNullable<Match['playerStats']>[number] }[] = [];
  for (const m of played) {
    if (m.neutral || !clubId) continue;
    if (m.homeClubId !== clubId && m.awayClubId !== clubId) continue;
    const ps = m.playerStats.find((s) => s.playerId === avatar.id);
    if (ps && ps.minutes > 0) appearances.push({ m, ps });
  }
  appearances.sort((a, b) => a.m.day - b.m.day);

  // Season tallies (auto-reset each season since they read the current season).
  const totals = seasonTotals(avatar, seasonId);
  const seasonAvgRating = totals.ratingCount > 0 ? Math.round((totals.ratingSum / totals.ratingCount) * 10) / 10 : 0;

  const trustStart = career.managerTrust;
  const playedIds = new Set(played.map((m) => m.id));
  const seasonTotalsForObj = { apps: totals.apps, goals: totals.goals, assists: totals.assists, avgRating: seasonAvgRating };

  let next: PlayerCareer = {
    ...career,
    seasonApps: totals.apps,
    seasonGoals: totals.goals,
    seasonAvgRating,
    objectives: updateSeasonObjectives(career.objectives ?? [], seasonTotalsForObj),
    // Drop objectives for matches now played (kept upcoming ones for display).
    matchObjectives: (career.matchObjectives ?? []).filter((o) => !playedIds.has(o.matchId)),
  };
  const news: NewsItem[] = [];

  // Newly-completed season objectives raise a small feed item.
  for (let i = 0; i < next.objectives.length; i++) {
    if (next.objectives[i].met && !(career.objectives?.[i]?.met)) {
      news.push(feed(`news_pc_sobj_${day}_${i}`, day, 'MILESTONE', 'Season objective met', `${next.objectives[i].text} — done.`));
    }
  }

  if (appearances.length === 0) {
    // Didn't feature — trust untouched; tallies/objectives refreshed only.
    return { career: next, news, moraleDelta: 0 };
  }

  // Trust drifts from the games played this advance — big games (cup/continental,
  // which aren't in the league competitions map) weigh a little heavier, and a
  // sending-off dents the relationship.
  let wSum = 0, wTot = 0, discipline = 0;
  for (const a of appearances) {
    const w = competitions[a.m.competitionId] ? 1 : 1.3;
    wSum += a.ps.rating * w; wTot += w;
    if (a.ps.red) discipline -= 1.5;
  }
  const weightedRating = wTot > 0 ? wSum / wTot : PAR_MATCH_RATING;
  next = { ...next, managerTrust: clamp(trustFromMatch(next.managerTrust, weightedRating) + discipline, 0, 100) as number };

  // Per-match objectives: evaluate each appearance's objectives against how the
  // avatar actually played, folding the outcome into trust + morale.
  let objTrust = 0, moraleDelta = 0;
  const lastObjectives: { text: string; met: boolean }[] = [];
  for (const a of appearances) {
    const objs = (career.matchObjectives ?? []).filter((o) => o.matchId === a.m.id);
    if (objs.length === 0) continue;
    const h = a.m.homeClubId === clubId;
    const out = evaluateMatchObjectives(objs, a.ps, h ? a.m.homeGoals : a.m.awayGoals, h ? a.m.awayGoals : a.m.homeGoals);
    objTrust += out.trustDelta;
    moraleDelta += out.moraleDelta;
    if (a.m.id === appearances[appearances.length - 1].m.id) {
      lastObjectives.push(...out.objectives.map((o) => ({ text: o.text, met: !!o.met })));
    }
  }
  next = { ...next, managerTrust: clamp(Math.round((next.managerTrust + objTrust) * 10) / 10, 0, 100) as number };

  // Latest appearance → match-summary card.
  const last = appearances[appearances.length - 1];
  const home = last.m.homeClubId === clubId;
  const teamGoals = home ? last.m.homeGoals : last.m.awayGoals;
  const oppGoals = home ? last.m.awayGoals : last.m.homeGoals;
  const oppId = home ? last.m.awayClubId : last.m.homeClubId;
  const summary: AvatarMatchSummary = {
    day: last.m.day,
    opponent: clubs[oppId]?.shortName ?? 'opponent',
    home,
    competition: competitions[last.m.competitionId]?.name,
    minutes: last.ps.minutes,
    rating: last.ps.rating,
    goals: last.ps.goals,
    assists: last.ps.assists,
    teamGoals, oppGoals,
    result: teamGoals > oppGoals ? 'W' : teamGoals === oppGoals ? 'D' : 'L',
    objectives: lastObjectives.length ? lastObjectives : undefined,
    trustDelta: Math.round((next.managerTrust - trustStart) * 10) / 10,
  };
  next = { ...next, lastMatch: summary };

  // Milestones — debut & first goal (career-wide, once).
  const milestones = [...next.milestones];
  const advGoals = appearances.reduce((n, a) => n + a.ps.goals, 0);
  const priorApps = totals.apps - appearances.length;
  const priorGoals = totals.goals - advGoals;

  if (priorApps <= 0 && !hasMilestone(next, DEBUT_PHRASE)) {
    const first = appearances[0];
    const oid = (first.m.homeClubId === clubId ? first.m.awayClubId : first.m.homeClubId);
    milestones.push({ day: first.m.day, text: `Made his senior debut against ${clubs[oid]?.shortName ?? 'the opposition'}.` });
    news.push(feed(`news_pc_debut_${first.m.day}`, first.m.day, 'MILESTONE', 'Senior debut!', `${nameOf(avatar)} made his first senior appearance.`));
  }
  if (priorGoals <= 0 && advGoals > 0 && !hasMilestone(next, FIRST_GOAL_PHRASE)) {
    const scored = appearances.find((a) => a.ps.goals > 0)!;
    milestones.push({ day: scored.m.day, text: 'Scored his first senior goal.' });
    news.push(feed(`news_pc_firstgoal_${scored.m.day}`, scored.m.day, 'MILESTONE', 'First senior goal!', `${nameOf(avatar)} is off the mark.`));
  }
  next = { ...next, milestones };

  // A personal feed line for the latest match.
  const line = matchFeedLine(summary, advGoals, appearances.reduce((n, a) => n + a.ps.assists, 0));
  news.push(feed(`news_pc_match_${last.m.day}`, day, 'RESULT', `${summary.result === 'W' ? 'Win' : summary.result === 'D' ? 'Draw' : 'Loss'} vs ${summary.opponent}`, line));

  return { career: next, news, moraleDelta };
}

function nameOf(p: Player): string { return `${p.name.first} ${p.name.last}`; }

function matchFeedLine(s: AvatarMatchSummary, goals: number, assists: number): string {
  const bits = [`${s.minutes}'`, `rated ${s.rating.toFixed(1)}`];
  if (goals > 0) bits.push(`${goals} goal${goals > 1 ? 's' : ''}`);
  if (assists > 0) bits.push(`${assists} assist${assists > 1 ? 's' : ''}`);
  return `${s.home ? 'Home' : 'Away'} ${s.teamGoals}-${s.oppGoals} vs ${s.opponent}${s.competition ? ` (${s.competition})` : ''} — ${bits.join(', ')}.`;
}

function feed(id: string, day: number, category: NewsItem['category'], title: string, body: string): NewsItem {
  return { id, day, category, title, body, read: false };
}
