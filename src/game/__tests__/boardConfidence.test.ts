import { describe, it, expect } from 'vitest';
import { tickBoardConfidence, confidenceBand } from '../board';
import type { BoardState } from '../../types/staff';

const board = (confidence: number, targetPosition = 10): BoardState =>
  ({ confidence, targetPosition, objectiveText: 'Finish 10th' });

describe('Dynamic board confidence', () => {
  it('rises with wins and falls with defeats', () => {
    expect(tickBoardConfidence(board(50), 10, 2, 0, 0)).toBeGreaterThan(50);
    expect(tickBoardConfidence(board(50), 10, 0, 0, 2)).toBeLessThan(50);
  });

  it('weights results by standing vs the promised finish', () => {
    // Same single win, but sitting well above target beats sitting well below it.
    const above = tickBoardConfidence(board(50), 4, 1, 0, 0);
    const below = tickBoardConfidence(board(50), 18, 1, 0, 0);
    expect(above).toBeGreaterThan(below);
  });

  it('stays within 0–100', () => {
    expect(tickBoardConfidence(board(2), 20, 0, 0, 5)).toBeGreaterThanOrEqual(0);
    expect(tickBoardConfidence(board(99), 1, 5, 0, 0)).toBeLessThanOrEqual(100);
  });

  it('bands worsen as confidence drops', () => {
    expect(confidenceBand(60)).toBe(0);
    expect(confidenceBand(25)).toBe(1);
    expect(confidenceBand(10)).toBe(2);
  });
});
