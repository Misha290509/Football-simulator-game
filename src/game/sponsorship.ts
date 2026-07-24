// ---------------------------------------------------------------------------
// Shirt sponsorship (§ Living club, #37). Between the baseline commercial income
// every club earns, the manager can land a headline shirt sponsor: a few offers
// trading annual value against contract length, scaled by the club's stature and
// recent success. Pure and deterministic given its RNG. Brand names are invented
// so nothing real is imitated.
// ---------------------------------------------------------------------------

import type { Club } from '../types/club';
import type { SponsorOffer } from '../types/league';
import { Rng } from '../engine/rng';

const BRANDS = [
  'Zephyr Air', 'NovaBank', 'Volt Energy', 'Kestrel Motors', 'Lumen Telecom', 'Apex Logistics',
  'Meridian Bet', 'Solstice Watches', 'Ironclad Insurance', 'Vertex Airlines', 'Halcyon Bank',
  'Cobalt Mobile', 'Summit Tyres', 'Orbit Streaming', 'Granite Financial', 'Pinnacle Crypto',
];

const round = (n: number) => Math.round(n / 500_000) * 500_000;

/**
 * Generate a small slate of sponsorship offers for a club. Base value scales
 * with reputation (a bigger badge sells more shirts) and a recent-success
 * multiplier; the three offers trade a fat short deal against a steadier long one.
 */
export function generateSponsorOffers(club: Club, successMult: number, rng: Rng): SponsorOffer[] {
  const rep = club.reputation;
  const base = round(Math.max(1_500_000, rep * rep * 3_400 * (0.9 + successMult * 0.4)));
  const names = rng.shuffle([...BRANDS]).slice(0, 3);
  // Short/rich, balanced, and long/steady — each a distinct trade-off.
  const shapes: { years: number; mult: number }[] = [
    { years: 2, mult: 1.25 },
    { years: 3, mult: 1.0 },
    { years: 5, mult: 0.82 },
  ];
  return shapes.map((s, i) => ({
    id: `sponsor_${club.id}_${i}_${rng.int(1000, 9999)}`,
    name: names[i] ?? BRANDS[i],
    annual: round(base * s.mult * rng.float(0.94, 1.06)),
    years: s.years,
  }));
}

const VENUE_SUFFIX = ['Arena', 'Stadium', 'Park', 'Ground', 'Field'];

/**
 * Stadium naming-rights offers (§ #41). Longer-term, higher-value than a shirt
 * deal, scaled by reputation and ground size, each naming the venue after the
 * brand. The manager trades the club's traditional ground name for the income.
 */
export function generateStadiumOffers(club: Club, rng: Rng): SponsorOffer[] {
  const rep = club.reputation;
  const sizeFactor = 0.6 + Math.min(1, club.stadium.capacity / 60_000) * 0.8;
  const base = round(Math.max(2_000_000, rep * rep * 2_600 * sizeFactor));
  const names = rng.shuffle([...BRANDS]).slice(0, 3);
  const shapes: { years: number; mult: number }[] = [
    { years: 5, mult: 1.0 },
    { years: 8, mult: 0.9 },
    { years: 12, mult: 0.78 },
  ];
  return shapes.map((s, i) => ({
    id: `stadium_${club.id}_${i}_${rng.int(1000, 9999)}`,
    name: `${names[i] ?? BRANDS[i]} ${VENUE_SUFFIX[rng.int(0, VENUE_SUFFIX.length - 1)]}`,
    annual: round(base * s.mult * rng.float(0.95, 1.05)),
    years: s.years,
  }));
}
