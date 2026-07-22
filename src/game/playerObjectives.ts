// ---------------------------------------------------------------------------
// Player Career — objectives (Tier 2 · Step 1). Pure & deterministic. The
// manager sets 1–3 position-tailored objectives before each of the avatar's
// matches, and a handful of season-long targets; both are evaluated from the
// stats we already record (match playerStats + accumulated season stats) and
// feed the trust → selection loop Tier 1 owns.
// ---------------------------------------------------------------------------

import type { Player } from '../types/player';
import type { Match } from '../types/match';
import type { Position } from '../types/attributes';
import { POSITION_GROUP } from '../types/attributes';
import type {
  CareerObjective, MatchObjective, MatchObjectiveKind, SeasonObjectiveKind,
} from '../types/playerCareer';
import { Rng, clamp, hashSeed } from '../engine/rng';

type Group = 'GK' | 'DEF' | 'MID' | 'ATT';
const groupOf = (pos: Position): Group => POSITION_GROUP[pos] as Group;
const isAttackingMid = (pos: Position) => pos === 'CAM' || pos === 'LM' || pos === 'RM' || pos === 'LW' || pos === 'RW';

// --- Per-match objectives ---------------------------------------------------

function matchObjectiveText(kind: MatchObjectiveKind, target: number): string {
  switch (kind) {
    case 'GOAL': return target > 1 ? `Score ${target} goals` : 'Get on the scoresheet';
    case 'ASSIST': return target > 1 ? `Set up ${target} goals` : 'Provide an assist';
    case 'SHOTS': return `Get ${target} shots away`;
    case 'RATING': return `Earn a match rating of ${target.toFixed(1)}+`;
    case 'CLEAN_SHEET': return 'Keep a clean sheet';
    case 'SAVES': return `Make ${target}+ saves`;
    case 'WIN': return 'Win the match';
    case 'MINUTES': return `Get ${target}+ minutes`;
  }
}

/** A deterministic 1–3 objective set for one of the avatar's matches. */
export function generateMatchObjectives(avatar: Player, match: Match, seed: number): MatchObjective[] {
  const rng = new Rng((seed ^ hashSeed(`mobj_${match.id}_${avatar.id}`)) >>> 0);
  const g = groupOf(avatar.position);
  const pool: { kind: MatchObjectiveKind; target: number }[] = [];

  if (g === 'ATT') {
    pool.push({ kind: 'GOAL', target: 1 });
    pool.push({ kind: 'SHOTS', target: rng.int(2, 3) });
    pool.push({ kind: 'RATING', target: 7.0 });
  } else if (g === 'MID') {
    pool.push({ kind: 'ASSIST', target: 1 });
    pool.push({ kind: 'RATING', target: 7.0 });
    if (isAttackingMid(avatar.position)) pool.push({ kind: 'SHOTS', target: rng.int(1, 2) });
    else pool.push({ kind: 'WIN', target: 1 });
  } else if (g === 'DEF') {
    pool.push({ kind: 'CLEAN_SHEET', target: 1 });
    pool.push({ kind: 'RATING', target: 6.8 });
    pool.push({ kind: 'WIN', target: 1 });
  } else { // GK
    pool.push({ kind: 'CLEAN_SHEET', target: 1 });
    pool.push({ kind: 'SAVES', target: rng.int(3, 5) });
    pool.push({ kind: 'RATING', target: 6.8 });
  }

  // Take 1–3, keeping the first (the headline) and a random rest.
  const count = rng.int(1, Math.min(3, pool.length));
  const chosen = [pool[0], ...rng.shuffle(pool.slice(1)).slice(0, count - 1)];
  return chosen.map((o) => ({
    matchId: match.id, kind: o.kind, target: o.target, text: matchObjectiveText(o.kind, o.target),
  }));
}

export interface MatchObjectiveOutcome {
  objectives: MatchObjective[]; // with `met` set
  trustDelta: number;
  moraleDelta: number;
}

/** Evaluate a match's objectives against how the avatar actually played. */
export function evaluateMatchObjectives(
  objectives: MatchObjective[],
  ps: NonNullable<Match['playerStats']>[number],
  teamGoals: number,
  oppGoals: number,
): MatchObjectiveOutcome {
  let trust = 0, morale = 0;
  const evaluated = objectives.map((o) => {
    let met = false;
    switch (o.kind) {
      case 'GOAL': met = ps.goals >= o.target; break;
      case 'ASSIST': met = ps.assists >= o.target; break;
      case 'SHOTS': met = ps.shots >= o.target; break;
      case 'RATING': met = ps.rating >= o.target; break;
      case 'CLEAN_SHEET': met = oppGoals === 0; break;
      case 'SAVES': met = (ps.saves ?? 0) >= o.target; break;
      case 'WIN': met = teamGoals > oppGoals; break;
      case 'MINUTES': met = ps.minutes >= o.target; break;
    }
    trust += met ? 0.8 : -0.5;
    morale += met ? 2 : -1;
    return { ...o, met };
  });
  // Cap the per-match swing so a single game never dominates the relationship.
  return { objectives: evaluated, trustDelta: clamp(trust, -3, 3), moraleDelta: clamp(morale, -6, 6) };
}

// --- Season objectives ------------------------------------------------------

function seasonObjectiveText(kind: SeasonObjectiveKind, target: number): string {
  switch (kind) {
    case 'GOALS': return `Score ${target} goals this season`;
    case 'ASSISTS': return `Register ${target} assists this season`;
    case 'APPS': return `Make ${target} appearances`;
    case 'AVG_RATING': return `Hold an average rating of ${target.toFixed(1)}`;
  }
}

/** 2–3 season targets, tuned to the avatar's role and current level. */
export function generateSeasonObjectives(avatar: Player, seed: number): CareerObjective[] {
  const rng = new Rng((seed ^ hashSeed(`sobj_${avatar.id}_${avatar.born.year}`)) >>> 0);
  const g = groupOf(avatar.position);
  const out: { kind: SeasonObjectiveKind; target: number }[] = [];

  if (g === 'ATT') out.push({ kind: 'GOALS', target: rng.int(8, 14) });
  else if (g === 'MID') { out.push({ kind: 'GOALS', target: rng.int(3, 6) }); out.push({ kind: 'ASSISTS', target: rng.int(4, 8) }); }
  else if (g === 'DEF') out.push({ kind: 'ASSISTS', target: rng.int(1, 3) });
  // Everyone gets an appearances target and a rating floor.
  out.push({ kind: 'APPS', target: rng.int(15, 25) });
  out.push({ kind: 'AVG_RATING', target: 6.7 + rng.int(0, 3) / 10 });

  // Keep it to 3, headline first.
  return out.slice(0, 3).map((o) => ({
    kind: o.kind, target: o.target, progress: 0, met: false, text: seasonObjectiveText(o.kind, o.target),
  }));
}

/** Recompute season-objective progress from accumulated season totals. */
export function updateSeasonObjectives(
  objectives: CareerObjective[],
  totals: { apps: number; goals: number; assists: number; avgRating: number },
): CareerObjective[] {
  return objectives.map((o) => {
    if (!o.kind || o.target == null) return o; // legacy free-text objective
    const progress =
      o.kind === 'GOALS' ? totals.goals :
      o.kind === 'ASSISTS' ? totals.assists :
      o.kind === 'APPS' ? totals.apps :
      totals.avgRating;
    const met = o.kind === 'AVG_RATING' ? totals.apps >= 5 && progress >= o.target : progress >= o.target;
    return { ...o, progress, met };
  });
}
