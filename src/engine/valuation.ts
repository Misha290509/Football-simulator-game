// ---------------------------------------------------------------------------
// Market valuation (§ Market). One canonical curve, used at player generation,
// at dataset load, and at every season-rollover revaluation — so a star's price
// never gets crushed the moment the formula and the baked data disagree.
//
// Calibrated against the real market values baked into the shipped dataset:
// value rises very steeply with ability (the top of the rating scale is worth
// exponentially more, matching modern transfer inflation), youth carries a
// premium for its long career and resale, and veterans are discounted. Squad
// players land a few million, solid starters €15–50M, and the very best
// €150–220M (a 90-rated worth far more than 3× a 78-rated).
// ---------------------------------------------------------------------------

export function estimateValue(ovr: number, age: number, potential: number): number {
  const baseline = Math.pow(Math.max(0, ovr - 40) / 10, 8.7) * 130;
  const ageFactor =
    age <= 18 ? 1.15 :
    age <= 20 ? 1.35 :
    age <= 22 ? 1.4 :
    age <= 23 ? 1.3 :
    age <= 25 ? 1.08 :
    age <= 27 ? 0.98 :
    age <= 29 ? 0.85 :
    age <= 31 ? 0.72 :
    age <= 33 ? 0.56 :
    age <= 35 ? 0.4 : 0.28;
  const potentialPremium = 1 + Math.max(0, potential - ovr) * 0.04;
  return Math.max(25_000, Math.round((baseline * ageFactor * potentialPremium) / 50_000) * 50_000);
}
