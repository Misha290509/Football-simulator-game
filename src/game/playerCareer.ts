// ---------------------------------------------------------------------------
// Player Career mode — orchestration helpers (§ Player Career). Tier 1 seed:
// pure, read-only helpers for reasoning about which career mode a save is in.
// Later tiers grow this module with avatar creation, the selection model
// (playerSelectionWeight), the personal matchday loop and progression.
// ---------------------------------------------------------------------------

import type { SaveGame } from '../types/league';
import type { Dataset } from '../types/dataset';
import type { Player, Foot } from '../types/player';
import type { Position } from '../types/attributes';
import type { CareerMode, PlayerCareer, PlayerCareerOrigin } from '../types/playerCareer';
import type { WorldSnapshot } from '../db/db';
import { Rng, clamp, hashSeed } from '../engine/rng';
import { generatePlayer } from '../engine/generator';
import { createNewGame } from './newGame';

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
    objectives: [],
    traits: [],
    personality: {
      professionalism: avatar.hidden?.professionalism ?? 55,
      ambition: avatar.hidden?.ambition ?? 60,
      loyalty: 55,
      temperament: 50,
    },
    sponsorships: [],
    international: { capped: false, caps: 0, intlGoals: 0 },
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
  snapshot.meta.playerCareer = initialPlayerCareer(avatar, config.origin, config.archetype ?? 'Academy Graduate', club?.name ?? 'your club');
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
