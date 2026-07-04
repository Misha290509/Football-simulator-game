// ---------------------------------------------------------------------------
// Boardroom & media (§ Board requests + press conferences). Pure &
// deterministic. Board requests let the manager ask for backing (budgets,
// facility funding) — granted based on board confidence, reputation and the
// club's means. Press conferences pose context-aware questions whose answers
// nudge squad morale and board confidence.
// ---------------------------------------------------------------------------

import type { Club } from '../types/club';
import type { BoardState } from '../types/staff';
import type { PressTone, PressQuestion, ResultContext } from '../types/league';
import { Rng } from '../engine/rng';

export type BoardRequestKind = 'TRANSFER_BUDGET' | 'WAGE_BUDGET' | 'FACILITIES';
export const BOARD_REQUEST_LABEL: Record<BoardRequestKind, string> = {
  TRANSFER_BUDGET: 'Ask for more transfer budget',
  WAGE_BUDGET: 'Ask for a bigger wage budget',
  FACILITIES: 'Ask the board to fund facilities',
};

export interface BoardRequestResult {
  granted: boolean;
  transferBudgetDelta: number;
  wageBudgetDelta: number;
  fundFacilities: boolean;
  message: string;
}

/** Evaluate a request to the board. Goodwill = confidence + reputation. */
export function evaluateBoardRequest(
  kind: BoardRequestKind,
  club: Club,
  board: BoardState | undefined,
  managerReputation: number,
): BoardRequestResult {
  const confidence = board?.confidence ?? 50;
  const goodwill = confidence * 0.6 + managerReputation * 0.4; // 0–100
  const deny = (why: string): BoardRequestResult => ({ granted: false, transferBudgetDelta: 0, wageBudgetDelta: 0, fundFacilities: false, message: why });

  if (kind === 'TRANSFER_BUDGET') {
    if (goodwill < 52) return deny('The board feel the current budget is sufficient. Show them more first.');
    const inject = Math.round((club.reputation * 200_000 + club.finances.balance * 0.12) * (goodwill / 100));
    return { granted: true, transferBudgetDelta: inject, wageBudgetDelta: 0, fundFacilities: false, message: `The board back you with an extra ${inject.toLocaleString()} in transfer funds.` };
  }
  if (kind === 'WAGE_BUDGET') {
    if (goodwill < 56) return deny('The board are wary of the wage bill and decline for now.');
    const inject = Math.round(club.reputation * 900 * (goodwill / 100));
    return { granted: true, transferBudgetDelta: 0, wageBudgetDelta: inject, fundFacilities: false, message: `The board raise your wage budget by ${inject.toLocaleString()}/wk.` };
  }
  // FACILITIES
  if (goodwill < 60) return deny('The board are not ready to invest in facilities just yet.');
  return { granted: true, transferBudgetDelta: 0, wageBudgetDelta: 0, fundFacilities: true, message: 'The board agree to fund a facility upgrade.' };
}

// --- Press conferences ------------------------------------------------------

const OPTION_LABELS: Record<PressTone, string> = {
  HUMBLE: 'Stay humble and level-headed',
  CONFIDENT: 'Talk up your team',
  DEFIANT: 'Hit back at the doubters',
  CRITICAL: 'Publicly criticise the performance',
  DEFLECT: 'Deflect and move on',
};

/** Build a press question from the last result. Deterministic per seed. */
export function generatePressQuestion(ctx: ResultContext, day: number, rng: Rng): PressQuestion {
  let prompt: string;
  let tones: PressTone[];
  if (ctx.outcome === 'WIN') {
    prompt = ctx.margin >= 3
      ? `A resounding win over ${ctx.opponentName}. Is this a statement of intent?`
      : `A hard-fought win against ${ctx.opponentName}. Pleased?`;
    tones = ['HUMBLE', 'CONFIDENT', 'DEFIANT'];
  } else if (ctx.outcome === 'LOSS') {
    prompt = ctx.margin >= 3
      ? `A heavy defeat to ${ctx.opponentName}. What went wrong?`
      : `A narrow loss to ${ctx.opponentName}. Where was it lost?`;
    tones = ['HUMBLE', 'CRITICAL', 'DEFLECT'];
  } else {
    prompt = `A draw with ${ctx.opponentName}. Two points dropped or one gained?`;
    tones = ['HUMBLE', 'CONFIDENT', 'DEFLECT'];
  }
  return {
    id: `press_${day}_${rng.int(0, 1e6).toString(36)}`,
    prompt,
    options: tones.map((tone) => ({ tone, label: OPTION_LABELS[tone] })),
  };
}

export interface PressAnswerResult {
  squadMoraleDelta: number;
  confidenceDelta: number;
  message: string;
}

/** Resolve a press answer given the tone and the result it followed. */
export function evaluatePressAnswer(tone: PressTone, ctx: ResultContext): PressAnswerResult {
  const won = ctx.outcome === 'WIN';
  const lost = ctx.outcome === 'LOSS';
  switch (tone) {
    case 'HUMBLE':
      return { squadMoraleDelta: 2, confidenceDelta: 1, message: 'A measured, professional answer. Nobody could take issue with it.' };
    case 'CONFIDENT':
      return won
        ? { squadMoraleDelta: 5, confidenceDelta: 2, message: 'The players love hearing you back them publicly.' }
        : { squadMoraleDelta: -2, confidenceDelta: -2, message: 'Bold talk after a poor result raises a few eyebrows.' };
    case 'DEFIANT':
      return { squadMoraleDelta: won ? 4 : 1, confidenceDelta: won ? 0 : -1, message: 'You send a message to the doubters — the dressing room stands taller.' };
    case 'CRITICAL':
      return { squadMoraleDelta: lost ? -7 : -3, confidenceDelta: lost ? 2 : 0, message: 'Calling your players out in public stings the dressing room, but the board like the accountability.' };
    case 'DEFLECT':
      return { squadMoraleDelta: 0, confidenceDelta: -1, message: 'You bat the question away. The press aren\'t satisfied.' };
  }
}
