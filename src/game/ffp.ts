// ---------------------------------------------------------------------------
// Financial Fair Play (§ Structure). Enforced spending rules tied to revenue.
// A club whose wage bill runs too hot relative to income accumulates strikes;
// sanctions escalate from a warning to a transfer embargo, then to a forced sale
// and a league points deduction. Healthy seasons burn strikes back down.
// ---------------------------------------------------------------------------

import type { StandingRow } from '../types/league';

/** Wage bill above this share of income is an FFP breach. */
export const FFP_WAGE_RATIO = 0.75;

export interface FfpVerdict {
  breach: boolean;
  strikes: number;
  embargo: boolean;
  pointsPenalty: number; // deducted next season
  forceSale: boolean;
  message: string;
}

/**
 * Assess a club's FFP position after a season.
 * @param annualWages total wages paid over the season
 * @param income total season income
 * @param prev previous strikes/embargo state
 */
export function assessFfp(
  annualWages: number,
  income: number,
  prev: { strikes: number; embargo: boolean } | undefined,
): FfpVerdict {
  const ratio = income > 0 ? annualWages / income : 2;
  const breach = ratio > FFP_WAGE_RATIO;
  let strikes = prev?.strikes ?? 0;

  if (!breach) {
    strikes = Math.max(0, strikes - 1);
    return { breach: false, strikes, embargo: false, pointsPenalty: 0, forceSale: false, message: '' };
  }

  strikes += 1;
  const pct = Math.round(ratio * 100);
  if (strikes === 1) {
    return { breach, strikes, embargo: false, pointsPenalty: 0, forceSale: false,
      message: `Financial Fair Play warning: wages are ${pct}% of revenue. Bring spending under control or the board will face sanctions.` };
  }
  if (strikes === 2) {
    return { breach, strikes, embargo: true, pointsPenalty: 0, forceSale: false,
      message: `FFP sanction: a transfer embargo is imposed for next season (wages ${pct}% of revenue).` };
  }
  // Persistent breach: embargo + forced sale + points deduction.
  return { breach, strikes, embargo: true, pointsPenalty: 6, forceSale: true,
    message: `Severe FFP breach (wages ${pct}% of revenue): transfer embargo, a forced sale, and a 6-point deduction next season.` };
}

/** Subtract any FFP points penalties from a computed table and re-sort. */
export function applyPointsPenalties(rows: StandingRow[], penalties: Record<string, number> | undefined): StandingRow[] {
  if (!penalties || Object.keys(penalties).length === 0) return rows;
  const adjusted = rows.map((r) => penalties[r.clubId] ? { ...r, points: r.points - penalties[r.clubId] } : r);
  return [...adjusted].sort((a, b) =>
    b.points - a.points || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst) || b.goalsFor - a.goalsFor);
}
