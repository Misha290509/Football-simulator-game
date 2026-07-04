// ---------------------------------------------------------------------------
// Club finances (§8, §11-M4). Pure, deterministic season accounting: gate
// receipts, broadcast/prize money (tier + final position), sponsorship, minus
// wages and running costs. Drives next season's transfer & wage budgets.
// Wealth scales with reputation so league tiers feel distinct.
// ---------------------------------------------------------------------------

import type { Club } from '../types/club';

// ---------------------------------------------------------------------------
// Realistic money curves (§ player feedback). Reputation in the loaded world
// ranges ~52 (lower divisions) to ~85 (Madrid/City). These exponential curves
// give Madrid ~€180M / Girona ~€25M / lower-league sides almost nothing, rather
// than everyone starting filthy rich.
// ---------------------------------------------------------------------------

const round100k = (n: number) => Math.round(n / 100_000) * 100_000;
const round100 = (n: number) => Math.round(n / 100) * 100;

/** Pre-season transfer kitty from club reputation (~€50k … €250M). */
export function transferBudgetFor(reputation: number): number {
  const v = 50_000 * Math.exp(0.247 * (reputation - 52));
  return round100k(Math.max(50_000, Math.min(250_000_000, v)));
}

/** A realistic weekly wage for a player of a given overall (~€0.5k … €900k). */
export function marketWage(overall: number): number {
  const v = 0.0123 * Math.exp(0.2 * overall);
  return Math.max(500, round100(v));
}

/** Cash reserves seed. */
export function startingBalanceFor(reputation: number): number {
  return round100k(transferBudgetFor(reputation) * 1.3);
}

export interface SeasonFinances {
  gate: number;
  broadcast: number;
  prize: number;
  sponsorship: number;
  income: number;
  wages: number;
  running: number;
  expenses: number;
  net: number;
}

const HOME_LEAGUE_GAMES = 19;

/**
 * @param position 1-based final league position
 * @param numClubs clubs in the competition
 * @param tier 1 = top division (richer TV deals)
 * @param weeklyWageBill sum of player weekly wages
 */
export function computeSeasonFinances(
  club: Club,
  position: number,
  numClubs: number,
  tier: number,
  weeklyWageBill: number,
  staffWeeklyWage = 0,
): SeasonFinances {
  const rep = club.reputation;

  // Gate: attendance scales with reputation; price with tier & reputation.
  const fillRate = Math.min(1, 0.55 + rep / 220);
  const ticket = (tier === 1 ? 38 : 22) + rep * 0.4;
  const gate = Math.round(club.stadium.capacity * fillRate * ticket * HOME_LEAGUE_GAMES);

  // Broadcast: large flat tier pool; merit by finishing position.
  const tierPool = tier === 1 ? 90_000_000 : 12_000_000;
  const meritShare = (numClubs - position + 1) / numClubs; // 1.0 for champions
  const broadcast = Math.round(tierPool * (0.5 + 0.5 * meritShare));

  // Prize money for the final standing.
  const prize = Math.round((tier === 1 ? 30_000_000 : 6_000_000) * meritShare);

  // Sponsorship & commercial.
  const sponsorship = Math.round(rep * rep * (tier === 1 ? 5_200 : 1_400));

  const income = gate + broadcast + prize + sponsorship;

  const wages = Math.round((weeklyWageBill + staffWeeklyWage) * 52);
  const running = Math.round(income * 0.12 + 4_000_000); // facilities, ops
  const expenses = wages + running;

  return { gate, broadcast, prize, sponsorship, income, wages, running, expenses, net: income - expenses };
}

/** Derive next season's budgets from the post-accounting balance & wage room. */
export function deriveBudgets(
  balance: number,
  weeklyWageBill: number,
  reputation: number,
  _tier: number,
): { transferBudget: number; wageBudget: number } {
  // Wage budget = current bill plus headroom, never below the club's standing.
  const wageBudget = round100(Math.max(weeklyWageBill * 1.12, marketWage(reputation - 6) * 16));
  // Transfer kitty: a slice of cash, floored by the club's reputation tier.
  const fromCash = Math.max(0, balance) * 0.35;
  const transferBudget = round100k(Math.max(fromCash, transferBudgetFor(reputation) * 0.5));
  return { transferBudget, wageBudget };
}
