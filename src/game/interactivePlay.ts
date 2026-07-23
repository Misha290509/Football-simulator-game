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
import { buildLineupProfile } from '../engine/lineup';
import { momentRole } from './momentLibrary';
import { playerSelectionWeight } from './playerCareer';
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

export interface BuildInputResult { input: InteractiveInput; willStart: boolean }

/** Build the interactive-match input for the avatar's fixture. `willStart`
 *  reports whether the selection engine (with the avatar's trust bias) picks
 *  the avatar — the caller only goes interactive when true. */
export function buildInteractiveInput(
  meta: { seed: number; competitions: Record<string, Competition> },
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
  const bias = { [avatar.id]: playerSelectionWeight(career) };
  const myProfile = buildLineupProfile(clubId, mySquad, clubs[clubId]?.formation ?? '4-3-3', { autoMode: true, selectionBias: bias });
  const oppProfile = buildLineupProfile(oppId, oppSquad, clubs[oppId]?.formation ?? '4-3-3', { autoMode: true });

  const willStart = myProfile.starters.includes(avatar.id);
  const role = momentRole(avatar.position);
  const importance = meta.competitions[match.competitionId] ? 0.4 : 0.7; // cup/continental = bigger
  const plan = gamePlan ?? defaultGamePlan(myProfile.attack, oppProfile.defense, role);

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
  };
  return { input, willStart };
}

function hashId(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
