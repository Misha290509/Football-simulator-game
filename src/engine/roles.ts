// ---------------------------------------------------------------------------
// Player roles (§ Tactics depth). Each formation slot can be given a role that
// shapes HOW that player contributes, not just how good he is: a false 9 drops
// in and creates rather than poaches; a wing-back bombs on at the cost of
// defensive cover; a deep-lying playmaker runs the game from in front of the
// back four. Roles apply small, deterministic modifiers to the lineup profile
// (attack/defence/midfield contribution + the scorer/creator split + a couple of
// team-level chance mods). The default role for every position is neutral, so an
// unassigned team plays exactly as before — additive and balance-preserving.
// ---------------------------------------------------------------------------

import type { Position } from '../types/attributes';

/** Multipliers on a player's contribution (1 = neutral) + additive team mods. */
export interface RoleMod {
  atk: number;
  def: number;
  mid: number;
  scorer: number;
  creator: number;
  /** Additive per-player team-level nudges, summed across the XI. */
  shotVol: number;
  chanceQual: number;
}

const NEUTRAL: RoleMod = { atk: 1, def: 1, mid: 1, scorer: 1, creator: 1, shotVol: 0, chanceQual: 0 };
const m = (o: Partial<RoleMod>): RoleMod => ({ ...NEUTRAL, ...o });

export interface RoleDef {
  id: string;
  label: string;
  blurb: string;
  mod: RoleMod;
}

// The first role for each position is its DEFAULT (neutral) — selecting it, or
// leaving a slot unassigned, changes nothing.
const GK_ROLES: RoleDef[] = [
  { id: 'GK', label: 'Goalkeeper', blurb: 'A conventional shot-stopper.', mod: NEUTRAL },
  { id: 'SWEEPER_KEEPER', label: 'Sweeper Keeper', blurb: 'Sweeps behind a high line and starts attacks.', mod: m({ chanceQual: 0.01 }) },
];

const CB_ROLES: RoleDef[] = [
  { id: 'CENTRE_BACK', label: 'Centre-Back', blurb: 'Defend first, keep it simple.', mod: NEUTRAL },
  { id: 'BALL_PLAYING', label: 'Ball-Playing Defender', blurb: 'Steps out and starts play from the back.', mod: m({ mid: 1.06, creator: 1.15, def: 0.98 }) },
  { id: 'STOPPER', label: 'Stopper', blurb: 'Aggressive, steps up to win it early.', mod: m({ def: 1.06 }) },
  { id: 'LIBERO', label: 'Libero', blurb: 'A sweeping defender who joins the play.', mod: m({ mid: 1.06, atk: 1.05, def: 0.96 }) },
];

const FB_ROLES: RoleDef[] = [
  { id: 'FULL_BACK', label: 'Full-Back', blurb: 'Balanced up-and-down defender.', mod: NEUTRAL },
  { id: 'WING_BACK', label: 'Wing-Back', blurb: 'Bombs forward — width and crosses, less cover.', mod: m({ atk: 1.12, creator: 1.15, def: 0.90, shotVol: 0.015 }) },
  { id: 'INVERTED_FB', label: 'Inverted Full-Back', blurb: 'Tucks into midfield to overload the centre.', mod: m({ mid: 1.10, creator: 1.08, atk: 0.96 }) },
  { id: 'DEFENSIVE_FB', label: 'Defensive Full-Back', blurb: 'Stays home, priority is the flank.', mod: m({ def: 1.07, atk: 0.90 }) },
];

const DM_ROLES: RoleDef[] = [
  { id: 'HOLDING', label: 'Holding Midfielder', blurb: 'Screens the back four.', mod: NEUTRAL },
  { id: 'DEEP_PLAYMAKER', label: 'Deep-Lying Playmaker', blurb: 'Dictates tempo from deep.', mod: m({ mid: 1.08, creator: 1.20, def: 0.97 }) },
  { id: 'BALL_WINNER', label: 'Ball-Winner', blurb: 'Aggressive, breaks up play.', mod: m({ def: 1.08, atk: 0.95 }) },
];

const CM_ROLES: RoleDef[] = [
  { id: 'CENTRAL_MID', label: 'Central Midfielder', blurb: 'A balanced all-rounder.', mod: NEUTRAL },
  { id: 'BOX_TO_BOX', label: 'Box-to-Box', blurb: 'Covers every blade of grass.', mod: m({ atk: 1.05, def: 1.05 }) },
  { id: 'MEZZALA', label: 'Mezzala', blurb: 'Drifts wide-and-forward to create.', mod: m({ atk: 1.10, creator: 1.12, def: 0.94 }) },
  { id: 'PLAYMAKER', label: 'Playmaker', blurb: 'The team plays through him.', mod: m({ creator: 1.20, mid: 1.05 }) },
];

const CAM_ROLES: RoleDef[] = [
  { id: 'ATTACKING_MID', label: 'Attacking Midfielder', blurb: 'The link between midfield and attack.', mod: NEUTRAL },
  { id: 'ADVANCED_PLAYMAKER', label: 'Advanced Playmaker', blurb: 'Threads the final ball.', mod: m({ creator: 1.20, atk: 1.05 }) },
  { id: 'SHADOW_STRIKER', label: 'Shadow Striker', blurb: 'Bursts beyond the striker to score.', mod: m({ atk: 1.10, scorer: 1.25, creator: 0.90, chanceQual: 0.01 }) },
];

const WIDE_ATT_ROLES: RoleDef[] = [
  { id: 'WINGER', label: 'Winger', blurb: 'Hugs the line, beats his man, crosses.', mod: NEUTRAL },
  { id: 'INSIDE_FORWARD', label: 'Inside Forward', blurb: 'Cuts inside to shoot.', mod: m({ atk: 1.06, scorer: 1.25, creator: 0.88, chanceQual: 0.02 }) },
  { id: 'WIDE_PLAYMAKER', label: 'Wide Playmaker', blurb: 'Drifts in to dictate from the flank.', mod: m({ creator: 1.18, mid: 1.05 }) },
];

const WIDE_MID_ROLES: RoleDef[] = [
  { id: 'WIDE_MID', label: 'Wide Midfielder', blurb: 'A two-way flank player.', mod: NEUTRAL },
  { id: 'WIDE_PLAYMAKER', label: 'Wide Playmaker', blurb: 'Drifts in to create.', mod: m({ creator: 1.15, mid: 1.05 }) },
  { id: 'DEFENSIVE_WINGER', label: 'Defensive Winger', blurb: 'Tracks back and protects the full-back.', mod: m({ def: 1.08, atk: 0.94 }) },
];

const ST_ROLES: RoleDef[] = [
  { id: 'STRIKER', label: 'Striker', blurb: 'A complete number nine.', mod: NEUTRAL },
  { id: 'POACHER', label: 'Poacher', blurb: 'Lives in the box, finishes chances.', mod: m({ scorer: 1.20, creator: 0.85, mid: 0.95, chanceQual: 0.02 }) },
  { id: 'TARGET_MAN', label: 'Target Man', blurb: 'Holds it up, wins everything in the air.', mod: m({ scorer: 1.10, atk: 1.05 }) },
  { id: 'FALSE_NINE', label: 'False Nine', blurb: 'Drops between the lines to create the overload.', mod: m({ mid: 1.12, creator: 1.20, atk: 0.94, scorer: 0.90, chanceQual: 0.02 }) },
  { id: 'COMPLETE_FORWARD', label: 'Complete Forward', blurb: 'Scores and creates in equal measure.', mod: m({ atk: 1.06, scorer: 1.08, creator: 1.06 }) },
];

export const ROLES_BY_POSITION: Record<Position, RoleDef[]> = {
  GK: GK_ROLES,
  LCB: CB_ROLES, RCB: CB_ROLES,
  LB: FB_ROLES, RB: FB_ROLES,
  CDM: DM_ROLES,
  CM: CM_ROLES,
  CAM: CAM_ROLES,
  LW: WIDE_ATT_ROLES, RW: WIDE_ATT_ROLES,
  LM: WIDE_MID_ROLES, RM: WIDE_MID_ROLES,
  ST: ST_ROLES,
};

/** The default (neutral) role id for a position. */
export function defaultRoleFor(slot: Position): string {
  return ROLES_BY_POSITION[slot]?.[0]?.id ?? 'CENTRAL_MID';
}

/** The modifier for a role at a slot; neutral if the role is absent/unknown. */
export function roleModFor(slot: Position, roleId: string | null | undefined): RoleMod {
  if (!roleId) return NEUTRAL;
  const def = ROLES_BY_POSITION[slot]?.find((r) => r.id === roleId);
  return def?.mod ?? NEUTRAL;
}

/** A role's display label (falls back to the id). */
export function roleLabel(slot: Position, roleId: string | null | undefined): string {
  if (!roleId) return '';
  return ROLES_BY_POSITION[slot]?.find((r) => r.id === roleId)?.label ?? roleId;
}
