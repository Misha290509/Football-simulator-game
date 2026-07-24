// ---------------------------------------------------------------------------
// Club debt, interest & administration (§ #39). A club in the red pays interest
// that deepens the hole; debt beyond a reputation-scaled ceiling forces it into
// administration, where creditors write the debt down (in exchange for a points
// deduction and a fire-sale handled by the caller). Pure/deterministic.
// ---------------------------------------------------------------------------

export interface DebtOutcome {
  /** The post-interest (or post-restructuring) balance to carry forward. */
  balance: number;
  /** True when the club has tipped into administration this season. */
  administration: boolean;
}

const INTEREST = 1.08;           // 8% on outstanding debt
const RESTRUCTURE_FRACTION = 0.4; // creditors write debt down to 40% of the ceiling

/** How deep a club can go before administration — bigger clubs carry more debt. */
export const debtCeiling = (reputation: number, inflation = 1): number =>
  -Math.round((20_000_000 + reputation * 1_500_000) * inflation);

/**
 * Apply a season's debt servicing. A healthy balance is untouched; a negative one
 * accrues interest, and if that pushes it past the ceiling the club enters
 * administration and its debt is restructured (written down).
 */
export function applyDebt(balance: number, reputation: number, inflation = 1): DebtOutcome {
  if (balance >= 0) return { balance, administration: false };
  const withInterest = Math.round(balance * INTEREST);
  const ceiling = debtCeiling(reputation, inflation);
  if (withInterest < ceiling) {
    return { balance: Math.round(ceiling * RESTRUCTURE_FRACTION), administration: true };
  }
  return { balance: withInterest, administration: false };
}
