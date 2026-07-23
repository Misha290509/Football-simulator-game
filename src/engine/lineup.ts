// ---------------------------------------------------------------------------
// Best-XI selection, manual lineups, formations and tactics (§8, §11-M2/M5).
// Pure: builds the serializable strength profile the match engine consumes.
// ---------------------------------------------------------------------------

import type { Player } from '../types/player';
import type { Position } from '../types/attributes';
import type { LineupProfile } from '../types/match';
import type { Tactics, DefensiveTactic, OffensiveTactic } from '../types/club';
import { overallAt } from './ratings';
import { traitSimBoost } from './traits';
import { egoOf } from './morale';
import { chemistryMod } from './chemistry';
import { roleModFor, type RoleMod } from './roles';
import { POSITION_GROUP, MIRROR_POSITION } from '../types/attributes';

// Formation → ordered slot positions (GK first, then by pitch row). All use a
// back four (LB, LCB, RCB, RB) — the only defensive shape the engine supports.
export const FORMATIONS: Record<string, Position[]> = {
  '4-1-2-1-2': ['GK', 'LB', 'LCB', 'RCB', 'RB', 'CDM', 'CM', 'CM', 'CAM', 'ST', 'ST'],
  '4-1-4-1': ['GK', 'LB', 'LCB', 'RCB', 'RB', 'CDM', 'LM', 'CM', 'CM', 'RM', 'ST'],
  '4-2-3-1': ['GK', 'LB', 'LCB', 'RCB', 'RB', 'CDM', 'CDM', 'LW', 'CAM', 'RW', 'ST'],
  '4-5-1': ['GK', 'LB', 'LCB', 'RCB', 'RB', 'LM', 'CM', 'CM', 'CM', 'RM', 'ST'],
  '4-2-4': ['GK', 'LB', 'LCB', 'RCB', 'RB', 'CM', 'CM', 'LW', 'ST', 'ST', 'RW'],
  '4-3-3': ['GK', 'LB', 'LCB', 'RCB', 'RB', 'CM', 'CM', 'CM', 'LW', 'ST', 'RW'],
  '4-4-1-1': ['GK', 'LB', 'LCB', 'RCB', 'RB', 'LM', 'CM', 'CM', 'RM', 'CAM', 'ST'],
  '4-4-2': ['GK', 'LB', 'LCB', 'RCB', 'RB', 'LM', 'CM', 'CM', 'RM', 'ST', 'ST'],
};

export const FORMATION_NAMES = Object.keys(FORMATIONS);

/** Outfield row sizes from the formation name (e.g. '4-2-3-1' → [4,2,3,1]). */
export function formationRows(name: string): number[] {
  return name.split('-').map(Number);
}

/** Friendly display label for a slot position (codes are already FIFA-style). */
export const POSITION_LABEL: Record<Position, string> = {
  GK: 'GK', LB: 'LB', LCB: 'LCB', RCB: 'RCB', RB: 'RB', CDM: 'CDM', CM: 'CM',
  CAM: 'CAM', LM: 'LM', RM: 'RM', LW: 'LW', RW: 'RW', ST: 'ST',
};

const slotsOf = (formation: string) => FORMATIONS[formation] ?? FORMATIONS['4-3-3'];
const isAvailable = (p: Player) => !p.injury && p.cards.suspendedFor === 0;

/**
 * How far a player is fielded from his natural position(s), as an OVR penalty.
 * Playing a player on his wrong side costs a little for centre-backs (−1) but a
 * lot for full-backs, wingers and wide midfielders (−4); a fully out-of-role
 * outing costs more still.
 */
export function slotPenalty(p: Player, slot: Position): number {
  if (p.positions.includes(slot)) return 0;
  const mirror = MIRROR_POSITION[slot];
  if (mirror && p.positions.includes(mirror)) {
    return slot === 'LCB' || slot === 'RCB' ? 1 : 4;
  }
  // Adjacent roles that overlap heavily across formations: a wide forward and a
  // wide midfielder on the same flank are effectively the same job (a natural
  // RW slots into RM, and vice-versa), and the central-midfield band shades into
  // itself. Without this, a winger at a club that plays a winger-less shape
  // (4-4-2 / 4-5-1) takes the full cross-group hit and never gets picked.
  if (ADJACENT_SLOTS[slot]?.some((pos) => p.positions.includes(pos))) return 3;
  const sameGroup = POSITION_GROUP[p.position] === POSITION_GROUP[slot];
  return sameGroup ? 6 : 14;
}

/** For a formation SLOT, the natural positions that fill it near-natively. */
const ADJACENT_SLOTS: Partial<Record<Position, Position[]>> = {
  RM: ['RW'], RW: ['RM'],
  LM: ['LW'], LW: ['LM'],
  CAM: ['CM'], CM: ['CAM', 'CDM'], CDM: ['CM'],
  ST: ['CAM'],
};

/** Effective OVR at a slot, folding in the wrong-position penalty. */
export const effectiveOverall = (p: Player, slot: Position): number =>
  overallAt(p.attributes, slot) - slotPenalty(p, slot);

function fitScore(p: Player, slot: Position): number {
  return effectiveOverall(p, slot);
}

export interface SelectOptions {
  lineup?: (string | null)[];
  autoMode?: boolean;
  /**
   * Per-player additive nudge to the auto-selection score, keyed by playerId
   * (Player Career: a manager who trusts the avatar pushes them up the pecking
   * order; distrust pushes them down). Small — it flips borderline calls, it
   * doesn't let a raw prospect leapfrog a clearly better player.
   */
  selectionBias?: Record<string, number>;
}

export type SlotAssignment = { slot: Position; player: Player } | null;

/**
 * Assign players to formation slots, index-aligned (one entry per slot, null if
 * unfilled). Auto mode greedily fills every slot; manual mode honors valid
 * lineup choices then auto-fills the rest.
 */
export function assignXI(
  players: Player[],
  formation: string,
  opts: SelectOptions = {},
): SlotAssignment[] {
  const slots = slotsOf(formation);
  const byId = new Map(players.map((p) => [p.id, p]));
  const used = new Set<string>();
  const result: SlotAssignment[] = slots.map(() => null);
  const manual = opts.autoMode === false && !!opts.lineup;

  if (manual) {
    slots.forEach((slot, i) => {
      const pid = opts.lineup![i];
      const p = pid ? byId.get(pid) : undefined;
      if (p && isAvailable(p) && !used.has(p.id)) {
        used.add(p.id);
        result[i] = { slot, player: p };
      }
    });
  }

  const bias = opts.selectionBias;
  const available = players.filter(isAvailable);
  slots.forEach((slot, i) => {
    if (result[i]) return;
    let best: Player | null = null;
    let bestScore = -Infinity;
    for (const p of available) {
      if (used.has(p.id)) continue;
      const score = fitScore(p, slot) + (bias?.[p.id] ?? 0);
      if (score > bestScore) { bestScore = score; best = p; }
    }
    if (best) { used.add(best.id); result[i] = { slot, player: best }; }
  });

  return result;
}

const nonNull = (x: SlotAssignment): x is { slot: Position; player: Player } => x !== null;

/** Greedily pick the best available XI for a formation (compact, no gaps). */
export function pickBestXI(
  players: Player[],
  formation: string,
): { slot: Position; player: Player }[] {
  return assignXI(players, formation, { autoMode: true }).filter(nonNull);
}

/** Resolve the starting XI honoring a manual lineup when present (compact). */
export function selectXI(
  players: Player[],
  formation: string,
  opts: SelectOptions = {},
): { slot: Position; player: Player }[] {
  return assignXI(players, formation, opts).filter(nonNull);
}

/** Mean XI strength for a formation — used by Auto-Mode formation optimization. */
export function formationStrength(players: Player[], formation: string): number {
  const xi = pickBestXI(players, formation);
  if (xi.length === 0) return 0;
  return xi.reduce((s, x) => s + effectiveOverall(x.player, x.slot), 0) / xi.length;
}

/** Average OVR (at assigned slot) of the resolved starting XI, rounded. */
export function lineupAverage(
  players: Player[],
  formation: string,
  opts: SelectOptions = {},
): number {
  const xi = selectXI(players, formation, opts);
  if (xi.length === 0) return 0;
  return Math.round(xi.reduce((s, x) => s + effectiveOverall(x.player, x.slot), 0) / xi.length);
}

/** The substitutes' bench: chosen (manual) or the best non-starters (auto). */
export function resolveBench(
  players: Player[],
  formation: string,
  opts: SelectOptions & { bench?: (string | null)[] } = {},
): Player[] {
  const starterIds = new Set(selectXI(players, formation, opts).map((x) => x.player.id));
  const byId = new Map(players.map((p) => [p.id, p]));
  if (opts.autoMode === false && opts.bench) {
    return opts.bench
      .filter((id): id is string => !!id)
      .map((id) => byId.get(id))
      .filter((p): p is Player => !!p && isAvailable(p) && !starterIds.has(p.id))
      .slice(0, 9);
  }
  return players
    .filter((p) => isAvailable(p) && !starterIds.has(p.id))
    .sort((a, b) => b.overall - a.overall)
    .slice(0, 9);
}

const groupScorerBase = (g: string) => (g === 'ATT' ? 1.0 : g === 'MID' ? 0.45 : g === 'DEF' ? 0.12 : 0.02);
const groupCreatorBase = (g: string) => (g === 'MID' ? 1.0 : g === 'ATT' ? 0.8 : g === 'DEF' ? 0.25 : 0.05);
const scorerWeight = (g: string, finishing: number) => groupScorerBase(g) * (0.4 + finishing / 100);
const creatorWeight = (g: string, vision: number, crossing: number) =>
  groupCreatorBase(g) * (0.3 + (vision + crossing) / 200);

/** Pick the back-four formation that best suits the available squad. */
export function bestFormation(players: Player[]): string {
  let best = FORMATION_NAMES[0];
  let bestScore = -Infinity;
  for (const f of FORMATION_NAMES) {
    const score = formationStrength(players, f);
    if (score > bestScore) { bestScore = score; best = f; }
  }
  return best;
}

// --- Tactics → match modifiers ---------------------------------------------

const DEF_MODS: Record<DefensiveTactic, { atk: number; def: number; vol: number }> = {
  DEEP: { atk: 0.96, def: 1.05, vol: 0.95 },
  BALANCED: { atk: 1.0, def: 1.0, vol: 1.0 },
  PRESSING: { atk: 1.04, def: 0.97, vol: 1.06 },
};
// Offensive choices trade volume for quality, kept ~xG-neutral (style, not power).
const OFF_MODS: Record<OffensiveTactic, { vol: number; qual: number }> = {
  POSSESSION: { vol: 0.95, qual: 1.06 },
  COUNTER: { vol: 0.9, qual: 1.12 },
  DIRECT: { vol: 1.1, qual: 0.92 },
};

const DEFAULT_TACTICS: Tactics = { defensive: 'BALANCED', offensive: 'POSSESSION' };

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const clampCond = (n: number) => (n < 0.7 ? 0.7 : n > 1.05 ? 1.05 : n);

export interface ProfileOptions extends SelectOptions {
  tactics?: Tactics;
  bench?: (string | null)[];
  /** Designated set-piece takers — get a share of goals/assists. */
  setPieces?: { penaltyTakerId?: string | null; freeKickTakerId?: string | null; cornerTakerId?: string | null };
  /** Per-formation-slot player roles (§ Tactics depth), index-aligned to the
   *  formation's slots. Absent slots default to the position's neutral role. */
  roles?: (string | null)[];
}

export function buildLineupProfile(
  clubId: string,
  players: Player[],
  formation: string,
  opts: ProfileOptions = {},
): LineupProfile {
  // Index-aligned assignment so each starter keeps its formation-slot index —
  // needed to look up the per-slot role (§ Tactics depth). selectXI == this
  // filtered, so behaviour is identical when no roles are set.
  const assigned = assignXI(players, formation, opts);
  const xi = assigned
    .map((a, i) => (a ? { slot: a.slot, player: a.player, role: roleModFor(a.slot, opts.roles?.[i]) } : null))
    .filter((x): x is { slot: Position; player: Player; role: RoleMod } => x !== null);

  // Effective ability folds in match condition: fitness matters a lot, morale a
  // lot, form only a little (ego doesn't change ability — it shifts selfishness,
  // applied to the scorer/creator split below).
  const condition = (p: Player) =>
    clampCond(0.80 + 0.20 * (p.fitness / 100) + p.form / 1500 + (p.morale - 55) / 500);
  const ratingAt = (slot: Position, p: Player) => effectiveOverall(p, slot) * condition(p);

  const gk = xi.find((s) => s.slot === 'GK');
  const defenders = xi.filter((s) => POSITION_GROUP[s.slot] === 'DEF');
  const mids = xi.filter((s) => POSITION_GROUP[s.slot] === 'MID');
  const atts = xi.filter((s) => POSITION_GROUP[s.slot] === 'ATT');

  let attack = mean([
    ...atts.map((s) => ratingAt(s.slot, s.player)),
    ...mids.map((s) => ratingAt(s.slot, s.player) * 0.6),
  ]) || 50;
  let defense = mean([
    ...defenders.map((s) => ratingAt(s.slot, s.player)),
    ...mids.map((s) => ratingAt(s.slot, s.player) * 0.5),
  ]) || 50;
  let midfield = mean(mids.map((s) => ratingAt(s.slot, s.player))) || 50;

  // Roles reshape HOW ability is spent, across position groups: a wing-back
  // pushes his rating toward attack (and off defence); a false 9 drops into
  // midfield; a ball-playing CB adds to build-up. An additive nudge scaled by
  // the player's rating — neutral roles contribute exactly zero, so a team with
  // no roles set plays identically.
  const roleAdj = (key: 'atk' | 'def' | 'mid'): number =>
    mean(xi.map((e) => ratingAt(e.slot, e.player) * (e.role[key] - 1))) || 0;
  attack += roleAdj('atk');
  defense += roleAdj('def');
  midfield += roleAdj('mid');

  const gkRating = gk ? ratingAt('GK', gk.player) : 45;
  let aggression = mean(xi.map((s) => s.player.attributes.mental.aggression)) || 50;

  // Dressing-room chemistry: a gelled XI plays a touch above the sum of its
  // parts, a fractured one below (±4% team-wide).
  const chem = chemistryMod(xi.map((s) => s.player));

  // Apply tactic modifiers.
  const tactics = opts.tactics ?? DEFAULT_TACTICS;
  const dm = DEF_MODS[tactics.defensive];
  const om = OFF_MODS[tactics.offensive];
  attack *= dm.atk * chem;
  defense *= dm.def * chem;
  midfield *= chem;
  // Roles add team-level texture: wing-backs and inside-forwards raise the shot
  // count/quality, a false 9 trades box presence for better chances, etc.
  const roleShotVol = xi.reduce((s, e) => s + e.role.shotVol, 0);
  const roleChanceQual = xi.reduce((s, e) => s + e.role.chanceQual, 0);

  // Fine-tuning sliders (0–100, 50 = neutral): tempo trades chance quality for
  // volume; width trades a little central quality for wide volume; pressing
  // lifts aggression and nicks the ball higher (small attack gain, defensive
  // risk). All no-ops at 50, so a default team is unchanged.
  const tempo = ((tactics.tempo ?? 50) - 50) / 50;     // −1 … +1
  const width = ((tactics.width ?? 50) - 50) / 50;
  const pressing = ((tactics.pressing ?? 50) - 50) / 50;
  const shotVolumeMod = dm.vol * om.vol * (1 + roleShotVol) * (1 + tempo * 0.16 + width * 0.06);
  const chanceQualityMod = om.qual * (1 + roleChanceQual) * (1 - tempo * 0.08 - Math.abs(width) * 0.03);
  attack *= 1 + pressing * 0.04;
  defense *= 1 - pressing * 0.04;
  aggression *= 1 + pressing * 0.15;

  // Designated set-piece takers claim a share of goals (penalties, free-kicks)
  // and assists (free-kicks, corners) when they're on the pitch.
  const sp = opts.setPieces ?? {};
  const inXi = new Set(xi.map((s) => s.player.id));
  const scorerBoost = (id: string) =>
    (sp.penaltyTakerId === id && inXi.has(id) ? 0.5 : 0) + (sp.freeKickTakerId === id && inXi.has(id) ? 0.3 : 0);
  const creatorBoost = (id: string) =>
    (sp.cornerTakerId === id && inXi.has(id) ? 0.5 : 0) + (sp.freeKickTakerId === id && inXi.has(id) ? 0.3 : 0);

  // Ego shifts the selfishness split: a high-ego player shoots more and creates
  // less; a low-ego player is more of a team player. Ability is unchanged.
  const egoScorer = (p: Player) => 1 + (egoOf(p) - 50) / 200;   // ±0.25 at the extremes
  const egoCreator = (p: Player) => 1 - (egoOf(p) - 50) / 260;

  const scorers = xi.map((s) => {
    const tb = traitSimBoost(s.player);
    return {
      playerId: s.player.id,
      weight: scorerWeight(POSITION_GROUP[s.slot], s.player.attributes.technical.finishing) * (1 + scorerBoost(s.player.id)) * tb.scorer * egoScorer(s.player) * s.role.scorer,
    };
  });
  const creators = xi.map((s) => {
    const tb = traitSimBoost(s.player);
    return {
      playerId: s.player.id,
      weight: creatorWeight(POSITION_GROUP[s.slot], s.player.attributes.mental.vision, s.player.attributes.technical.crossing) * (1 + creatorBoost(s.player.id)) * tb.creator * egoCreator(s.player) * s.role.creator,
    };
  });

  // Bench: substitutes, ranked best-first, with their scoring/creating weights
  // computed at their natural position.
  const bench = resolveBench(players, formation, opts)
    .sort((a, b) => b.overall - a.overall)
    .map((p) => {
      const grp = POSITION_GROUP[p.position];
      return {
        playerId: p.id,
        ovr: p.overall,
        scorerWeight: scorerWeight(grp, p.attributes.technical.finishing),
        creatorWeight: creatorWeight(grp, p.attributes.mental.vision, p.attributes.technical.crossing),
      };
    });

  return {
    clubId, formation, attack, defense, midfield, gk: gkRating, aggression,
    scorers, creators,
    starters: xi.map((s) => s.player.id),
    gkId: gk?.player.id ?? null,
    defenderIds: defenders.map((s) => s.player.id),
    shotVolumeMod, chanceQualityMod, bench,
  };
}