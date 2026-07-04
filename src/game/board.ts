// ---------------------------------------------------------------------------
// Board objectives & job security (§8, §11-M5). The board sets a season finish
// target from club reputation vs the division; meeting/missing it moves the
// confidence meter, and confidence hitting bottom gets the manager sacked.
// ---------------------------------------------------------------------------

import type { BoardState } from '../types/staff';
import type { Club } from '../types/club';
import type { Competition } from '../types/competition';

/** The continental competition a given league finish qualifies for. */
function continentalTarget(comp: Competition, target: number): string {
  if (comp.confederation === 'UEFA') {
    if (target <= 4) return 'the Champions League';
    if (target <= 6) return 'the Europa League';
    return 'the Conference League';
  }
  const cup: Record<string, string> = {
    CONMEBOL: 'the Copa Libertadores', CONCACAF: 'the CONCACAF Champions Cup', AFC: 'the AFC Champions League',
  };
  return cup[comp.confederation] ?? 'continental competition';
}

/** Set the pre-season objective based on the club's standing in its division. */
export function setObjective(club: Club, comp: Competition): BoardState {
  // Rank clubs in the competition by reputation to gauge expectations.
  const n = comp.numClubs;
  // Without sibling reputations here, map reputation band → target band.
  const rep = club.reputation;
  let target: number;
  let text: string;
  if (rep >= 85) { target = Math.max(1, Math.round(n * 0.1)); text = `Win the title and qualify for ${continentalTarget(comp, target)}`; }
  else if (rep >= 75) { target = Math.round(n * 0.25); text = `Qualify for ${continentalTarget(comp, target)}`; }
  else if (rep >= 65) { target = Math.round(n * 0.45); text = 'Finish comfortably in the top half'; }
  else if (rep >= 55) { target = Math.round(n * 0.65); text = 'Achieve a solid mid-table finish'; }
  else { target = Math.max(1, n - (comp.promotion?.autoRelegate ?? 3) - 2); text = 'Avoid relegation'; }
  return { targetPosition: target, objectiveText: text, confidence: 60 };
}

export interface ObjectiveOutcome {
  confidenceDelta: number;
  verdict: 'exceeded' | 'met' | 'missed' | 'failed';
  summary: string;
}

export function evaluateObjective(finalPosition: number, board: BoardState): ObjectiveOutcome {
  const diff = board.targetPosition - finalPosition; // positive = better than asked
  if (diff >= 4) return { confidenceDelta: +28, verdict: 'exceeded', summary: 'Expectations smashed.' };
  if (diff >= 0) return { confidenceDelta: +12, verdict: 'met', summary: 'Objective met.' };
  if (diff >= -3) return { confidenceDelta: -18, verdict: 'missed', summary: 'Fell short of the target.' };
  return { confidenceDelta: -40, verdict: 'failed', summary: 'Well below expectations.' };
}

export const SACK_THRESHOLD = 15;
