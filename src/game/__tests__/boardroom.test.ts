import { describe, it, expect } from 'vitest';
import { loadDataset } from '../../data/datasetLoader';
import { ENGLAND_DATASET } from '../../data/england';
import { evaluateBoardRequest, generatePressQuestion, evaluatePressAnswer } from '../boardroom';
import { Rng } from '../../engine/rng';
import type { BoardState } from '../../types/staff';
import type { ResultContext } from '../../types/league';

const world = loadDataset(ENGLAND_DATASET, 5, 2024);
const club = Object.values(world.clubs)[0];
const board = (confidence: number): BoardState => ({ targetPosition: 6, objectiveText: '', confidence });

describe('Board requests', () => {
  it('a confident board with a respected manager grants a budget boost', () => {
    const res = evaluateBoardRequest('TRANSFER_BUDGET', club, board(85), 80);
    expect(res.granted).toBe(true);
    expect(res.transferBudgetDelta).toBeGreaterThan(0);
  });

  it('a nervous board with an unproven manager refuses', () => {
    const res = evaluateBoardRequest('TRANSFER_BUDGET', club, board(20), 30);
    expect(res.granted).toBe(false);
    expect(res.transferBudgetDelta).toBe(0);
  });

  it('facility funding needs high goodwill', () => {
    expect(evaluateBoardRequest('FACILITIES', club, board(90), 85).fundFacilities).toBe(true);
    expect(evaluateBoardRequest('FACILITIES', club, board(30), 30).granted).toBe(false);
  });
});

describe('Press conferences', () => {
  const win: ResultContext = { outcome: 'WIN', margin: 3, opponentName: 'Rivals' };
  const loss: ResultContext = { outcome: 'LOSS', margin: 2, opponentName: 'Rivals' };

  it('builds a question with sensible options and is deterministic', () => {
    const a = generatePressQuestion(win, 10, new Rng(3));
    const b = generatePressQuestion(win, 10, new Rng(3));
    expect(a.prompt).toBe(b.prompt);
    expect(a.options.length).toBeGreaterThan(0);
  });

  it('confidence after a win lifts morale; the same after a loss backfires', () => {
    expect(evaluatePressAnswer('CONFIDENT', win).squadMoraleDelta).toBeGreaterThan(0);
    expect(evaluatePressAnswer('CONFIDENT', loss).squadMoraleDelta).toBeLessThan(0);
  });

  it('publicly criticising the players after a loss hurts morale but pleases the board', () => {
    const r = evaluatePressAnswer('CRITICAL', loss);
    expect(r.squadMoraleDelta).toBeLessThan(0);
    expect(r.confidenceDelta).toBeGreaterThan(0);
  });

  it('a humble answer is always safe', () => {
    expect(evaluatePressAnswer('HUMBLE', loss).squadMoraleDelta).toBeGreaterThanOrEqual(0);
  });
});
