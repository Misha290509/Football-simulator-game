// ---------------------------------------------------------------------------
// Player Career — interactive play orchestration (Tier 3). Builds the engine
// input for the avatar's fixture from the live world, and picks a sensible
// manager game plan. Pure helpers; the store owns the stateful flow.
// ---------------------------------------------------------------------------

import type { Player } from '../types/player';
import type { Club } from '../types/club';
import type { Match } from '../types/match';
import type { Competition } from '../types/competition';
import type { PlayerCareer } from '../types/playerCareer';
import type { GamePlan } from '../types/interactiveMatch';
import { buildLineupProfile, resolveBench } from '../engine/lineup';
import { momentRole, defaultPositioning } from './momentLibrary';
import { avatarSelectionBias } from './playerCareer';
import { areRivals } from './rivalries';
import { POSITION_GROUP } from '../types/attributes';
import type { MarkerInfo } from '../types/interactiveMatch';
import { ritualIntact, ritualBreakLine } from './playerIdentity';
import { deriveConditions, buildScoutReport } from './matchConditions';
import { buildOppositionPlan, bogeyFactor } from './opposition';
import { habitFactor, analysisFactor } from './trainingDepth';
import { classifyBigNight } from './clubLife';

/** The specific opponent the avatar will duel all match: an attacker draws the
 *  best opposing defender, a defender the best striker, a midfielder his
 *  opposite number. Deterministic (best overall, id tie-break). */
function pickMarker(avatar: Player, oppSquad: Player[]): MarkerInfo | undefined {
  const g = POSITION_GROUP[avatar.position];
  const want = g === 'ATT' ? 'DEF' : g === 'DEF' ? 'ATT' : g === 'GK' ? 'ATT' : 'MID';
  const pool = oppSquad.filter((p) => POSITION_GROUP[p.position] === want);
  if (pool.length === 0) return undefined;
  const best = pool.reduce((a, b) => (b.overall > a.overall || (b.overall === a.overall && b.id < a.id) ? b : a));
  return { name: `${best.name.first} ${best.name.last}`, rating: best.overall, role: best.position };
}
import type { InteractiveInput } from '../engine/interactiveMatch';

const squadOf = (players: Record<string, Player>, clubId: string) =>
  Object.values(players).filter((p) => p.contract.clubId === clubId);

/** A manager game plan derived from the two teams' relative strength + role. */
export function defaultGamePlan(avatarAttack: number, oppDefense: number, role: string): GamePlan {
  const edge = avatarAttack - oppDefense;
  if (role === 'GK' || role === 'CB' || role === 'FB') return edge < -6 ? 'CONTAIN' : 'BALANCED';
  if (edge > 8) return 'ATTACK';
  if (edge < -8) return 'CONTAIN';
  return role === 'ST' || role === 'WIDE' ? 'SUPPORT' : 'BALANCED';
}

export interface BuildInputResult { input: InteractiveInput; willStart: boolean; willComeOn: boolean }

/** Build the interactive-match input for the avatar's fixture. `willStart`
 *  reports whether the selection engine (with the avatar's trust bias) picks
 *  the avatar — the caller only goes interactive when true. */
export function buildInteractiveInput(
  meta: { seed: number; competitions: Record<string, Competition>; seasonMaxDay?: number },
  players: Record<string, Player>,
  clubs: Record<string, Club>,
  match: Match,
  avatar: Player,
  career: PlayerCareer,
  gamePlan?: GamePlan,
): BuildInputResult {
  const clubId = avatar.contract.clubId!;
  const isAvatarHome = match.homeClubId === clubId;
  const oppId = isAvatarHome ? match.awayClubId : match.homeClubId;

  const mySquad = squadOf(players, clubId);
  const oppSquad = squadOf(players, oppId);
  const bias = { [avatar.id]: avatarSelectionBias(career, avatar, mySquad) };
  const myProfile = buildLineupProfile(clubId, mySquad, clubs[clubId]?.formation ?? '4-3-3', { autoMode: true, selectionBias: bias });
  const oppProfile = buildLineupProfile(oppId, oppSquad, clubs[oppId]?.formation ?? '4-3-3', { autoMode: true });

  const willStart = myProfile.starters.includes(avatar.id);
  // If not starting, is he on the bench (and thus a candidate for a cameo)?
  const onBench = !willStart && resolveBench(mySquad, clubs[clubId]?.formation ?? '4-3-3', { autoMode: true })
    .some((b) => b.id === avatar.id);
  const role = momentRole(avatar.position);
  // Derby detection ties the rivalries system into the match: a derby raises the
  // stakes (importance → pressure/nerves in the moments) and frames the occasion.
  const myName = clubs[clubId]?.name, oppName = clubs[oppId]?.name;
  const derby = !!(myName && oppName && areRivals(myName, oppName));
  // A reunion with a club the avatar has played for before (by full club name,
  // excluding the current one) — a personal occasion of its own.
  const pastClubs = new Set((career.seasonHistory ?? []).map((s) => s.club));
  const formerClub = !!(oppName && oppName !== myName && pastClubs.has(oppName));
  let importance = meta.competitions[match.competitionId] ? 0.4 : 0.7; // cup/continental = bigger
  if (derby) importance = Math.max(importance, 0.78);
  else if (formerClub) importance = Math.max(importance, 0.72);
  // Cup runs and European nights carry their own weight.
  const compName = meta.competitions[match.competitionId]?.name;
  const bigNight = classifyBigNight(compName, clubs[oppId]?.reputation ?? 60, clubs[clubId]?.reputation ?? 60, false);
  if (bigNight) importance = Math.max(importance, bigNight.importance);
  // The run-in: a league game in April with the table this tight is a cup tie.
  const race = career.race && career.race.kind !== 'NOTHING' && meta.competitions[match.competitionId]
    ? career.race : null;
  if (race) importance = Math.max(importance, race.importance);
  const occasion: InteractiveInput['occasion'] = derby
    ? { kind: 'DERBY', label: `Derby day — ${clubs[oppId]?.shortName ?? 'your rivals'}` }
    : formerClub
    ? { kind: 'FORMER_CLUB', label: `Return to ${clubs[oppId]?.shortName ?? 'a former club'}` }
    : bigNight ? { kind: 'BIG_MATCH', label: bigNight.label, blurb: bigNight.blurb }
    : race ? { kind: 'BIG_MATCH', label: race.label, blurb: race.blurb }
    : importance >= 0.65 ? { kind: 'BIG_MATCH', label: 'A big occasion' } : undefined;
  const plan = gamePlan ?? defaultGamePlan(myProfile.attack, oppProfile.defense, role);

  const marker = pickMarker(avatar, oppSquad);
  const input: InteractiveInput = {
    matchId: match.id,
    seed: (meta.seed ^ hashId(match.id)) >>> 0,
    fixture: match,
    avatar,
    role,
    isAvatarHome,
    avatarProfile: myProfile,
    oppProfile,
    oppName: clubs[oppId]?.shortName ?? 'the opposition',
    importance,
    confidence: career.confidence ?? 60,
    fitness: avatar.fitness,
    status: career.status,
    gamePlan: plan,
    frequency: 'NORMAL', // overridden from settings by the store
    cameo: !willStart && onBench,
    intent: defaultPositioning(role),
    occasion,
    marker,
    // Superstition: when the pre-match routine is disrupted, he starts off-rhythm.
    ritualBroken: ritualIntact(career.identity, match.id, meta.seed) ? undefined : { line: ritualBreakLine(match.id) },
    celebration: career.identity?.celebration,
    conditions: deriveConditions(match.id, meta.seed, match.day, meta.seasonMaxDay ?? 0, clubs[isAvatarHome ? clubId : oppId], isAvatarHome),
    scout: buildScoutReport(match.id, meta.seed, oppSquad),
    // Fame has a price: once he's dangerous, they set up specifically to stop him.
    oppPlan: buildOppositionPlan(career, avatar, match.id, meta.seed, marker?.name),
    bogeyFactor: bogeyFactor(career, oppName ?? ''),
    habitFactorFn: (t, r) => habitFactor(career, t, r),
    analysisFactorFn: (t) => analysisFactor(career, t),
  };
  return { input, willStart, willComeOn: onBench };
}

function hashId(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
