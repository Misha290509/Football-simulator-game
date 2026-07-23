import { describe, it, expect } from 'vitest';
import { tickFanConfidence, fanBand, fanConfidenceOf, attackingScore, applyFanPressure } from '../board';
import type { BoardState } from '../../types/staff';

const board = (fan?: number): BoardState => ({ targetPosition: 6, objectiveText: 'top half', confidence: 60, fanConfidence: fan });

describe('supporter confidence (#42)', () => {
  it('defaults an unset meter to a neutral 60', () => {
    expect(fanConfidenceOf(board(undefined))).toBe(60);
    expect(fanConfidenceOf(board(42))).toBe(42);
  });

  it('rewards winning, entertaining football and punishes dour losing', () => {
    const b = board(60);
    const winningAttacking = tickFanConfidence(b, 3, 4, 0, 0, { attacking: 0.9, goalsFor: 10, games: 4 });
    const losingDour = tickFanConfidence(b, 12, 0, 0, 4, { attacking: 0.2, goalsFor: 1, games: 4 });
    expect(winningAttacking).toBeGreaterThan(60);
    expect(losingDour).toBeLessThan(60);
    expect(winningAttacking).toBeGreaterThan(losingDour);
  });

  it('rates adventurous tactics as more attacking than negative ones', () => {
    const bold = attackingScore({ defensive: 'PRESSING', offensive: 'DIRECT', tempo: 80, pressing: 80 });
    const cautious = attackingScore({ defensive: 'DEEP', offensive: 'COUNTER', tempo: 20, pressing: 20 });
    expect(bold).toBeGreaterThan(cautious);
    expect(attackingScore(undefined)).toBe(0.5);
  });

  it('bands the mood and lets an angry crowd press on the boardroom', () => {
    expect(fanBand(10)).toBe(2);
    expect(fanBand(30)).toBe(1);
    expect(fanBand(70)).toBe(0);
    // A mutinous crowd drags board confidence down; a jubilant one lifts it.
    expect(applyFanPressure(60, 10)).toBeLessThan(60);
    expect(applyFanPressure(60, 90)).toBeGreaterThan(60);
    expect(applyFanPressure(60, 55)).toBe(60);
  });
});
