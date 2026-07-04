// ---------------------------------------------------------------------------
// Academy engine (§ Academy, Ideas 1–2, 10). Pure & deterministic. Derives a
// club's academy quality from a transparent, tunable formula, resolves its
// philosophy, builds the Academy structure, and provides age-group + readiness
// helpers reused across intake, development and the UI.
// ---------------------------------------------------------------------------

import type { Club } from '../types/club';
import type { Player } from '../types/player';
import type { Staff } from '../types/staff';
import type { Academy, AgeGroup } from '../types/academy';
import type { Position } from '../types/attributes';
import { POSITION_GROUP } from '../types/attributes';
import { Rng, clamp } from './rng';
import { overallAt, bestOverall } from './ratings';
import { FIRST_NAMES, LAST_NAMES } from '../data/names';
import {
  youthIndexFor,
  ELITE_ACADEMIES,
  COUNTRY_PHILOSOPHY,
  DEFAULT_PHILOSOPHY,
  PHILOSOPHIES,
  type EliteAcademy,
} from '../data/academyData';

/** Positions a youth prospect can be generated into. */
export const YOUTH_POSITIONS: Position[] = [
  'GK', 'LB', 'LCB', 'RCB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST',
];

/** Strip accents + lowercase for resilient club-name matching (mirrors clubTraits). */
export function normClubName(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export const eliteAcademyFor = (name: string): EliteAcademy | undefined =>
  ELITE_ACADEMIES[normClubName(name)];

/** 0–100 wealth score from a club's transfer budget (log-scaled). */
function wealthScore(club: Club): number {
  const tb = club.finances?.transferBudget ?? 0;
  return clamp(Math.log10(Math.max(1, tb)) * 12.5, 0, 100) as number;
}

/**
 * Composite 0–100 academy quality before the star/elite floor. Transparent and
 * tunable: reputation + country youth index + wealth, plus the academy's own
 * reputation (the flywheel) once it exists.
 */
export function academyComposite(club: Club, academyReputation?: number): number {
  const repFlywheel = academyReputation ?? 0;
  return clamp(
    0.42 * club.reputation +
      0.28 * youthIndexFor(club.countryId) +
      0.18 * wealthScore(club) +
      0.12 * repFlywheel,
    0,
    100,
  ) as number;
}

/** Star rating 1–5 from the composite, lifted to any elite-academy floor. */
export function academyRatingFor(club: Club, academyReputation?: number): number {
  const composite = academyComposite(club, academyReputation);
  let stars = clamp(Math.round(composite / 20), 1, 5);
  const elite = eliteAcademyFor(club.name);
  if (elite) stars = Math.max(stars, elite.rating);
  return stars;
}

/** Resolve a club's philosophy: elite override → country default → balanced. */
export function philosophyFor(club: Club): string {
  const elite = eliteAcademyFor(club.name);
  if (elite?.philosophyId) return elite.philosophyId;
  return COUNTRY_PHILOSOPHY[club.countryId] ?? DEFAULT_PHILOSOPHY;
}

/** Cost to upgrade an academy facility track from its current level. */
export const ACADEMY_UPGRADE_COST = (level: number): number => level * 4_000_000;

/**
 * Realistic facility / academy level (1–5) from a club's standing. Driven mainly
 * by reputation (prestige) with a finance modifier (rich clubs invest more, poor
 * clubs less) and a small bonus for the biggest stadiums (infrastructure proxy).
 * Steep, so only genuinely elite clubs reach 5 and modest top-flight sides like
 * Girona land around 2 rather than 4.
 */
export function facilityLevelFor(reputation: number, transferBudget: number, stadiumCapacity = 25_000): number {
  const repScore = (reputation - 60) / 6; // ~0 at rep 60, ~4.7 at 88
  const budgetM = transferBudget / 1_000_000;
  const financeAdj =
    budgetM >= 100 ? 1 : budgetM >= 50 ? 0.5 : budgetM >= 20 ? 0 : budgetM >= 6 ? -0.5 : -1;
  const stadiumAdj = stadiumCapacity >= 60_000 ? 0.3 : 0;
  return clamp(Math.round(repScore + financeAdj + stadiumAdj), 1, 5) as number;
}

/** A hireable pool of youth coaches for the academy staff market. Ids are
 *  deterministic per RNG seed so a hired coach stays identifiable (and can be
 *  filtered out of the candidate list) across re-renders. */
export function generateYouthCoachPool(count: number, rng: Rng): Staff[] {
  return Array.from({ length: count }, (_, i) => {
    const rating = clamp(Math.round(rng.normal(58, 16)), 30, 92);
    return {
      id: `staff_yc_${i}_${rng.int(0, 1e9).toString(36)}`,
      name: { first: rng.pick(FIRST_NAMES), last: rng.pick(LAST_NAMES) },
      role: 'YOUTH_COACH' as const,
      rating,
      wage: Math.round((rating * rating) / 6 / 50) * 50,
      clubId: null,
    };
  });
}

/** Generate youth coaches whose quality is anchored to the academy rating. */
export function makeYouthCoaches(clubId: string, stars: number, rng: Rng): Staff[] {
  const count = clamp(stars - 1, 1, 4);
  const baseline = 30 + stars * 11; // 5★ → ~85, 3★ → ~63, 1★ → ~41
  return Array.from({ length: count }, (_, i) => {
    const rating = clamp(Math.round(rng.normal(baseline, 7)), 25, 92);
    return {
      id: `staff_yc_${clubId}_${i}_${rng.int(0, 1e9).toString(36)}`,
      name: { first: rng.pick(FIRST_NAMES), last: rng.pick(LAST_NAMES) },
      role: 'YOUTH_COACH' as const,
      rating,
      wage: Math.round((rating * rating) / 6 / 50) * 50,
      clubId,
    };
  });
}

/** Build a fresh Academy for a club (used by new games + save migration). */
export function buildAcademy(club: Club, rng: Rng): { academy: Academy; coaches: Staff[] } {
  const composite = academyComposite(club);
  const elite = eliteAcademyFor(club.name);
  const stars = academyRatingFor(club);
  const reputation = clamp(Math.round(composite * 0.8 + (elite?.repBonus ?? 0) + rng.normal(0, 3)), 0, 100);
  const coaches = makeYouthCoaches(club.id, stars, rng);
  // Seed the four facility tracks around the club's realistic facility level
  // (reputation + finances + stadium), not the old reputation-only formula.
  const seed = facilityLevelFor(club.reputation, club.finances?.transferBudget ?? 0, club.stadium?.capacity);
  const jitter = () => clamp(seed + rng.int(-1, 1), 1, 5);
  const academy: Academy = {
    clubId: club.id,
    rating: stars,
    reputation,
    philosophyId: philosophyFor(club),
    facilities: { training: jitter(), coaching: jitter(), medical: jitter(), recruitment: jitter() },
    youthCoachIds: coaches.map((c) => c.id),
    graduates: [],
    cohorts: [],
    trophies: [],
  };
  return { academy, coaches };
}

/**
 * Bias a youth's attributes toward the academy philosophy (Idea 3) and recompute
 * OVR/POT. Gentle multipliers nudge the profile without breaking the rating model.
 */
export function applyPhilosophy(p: Player, philosophyId: string, cap: number): void {
  const phil = PHILOSOPHIES[philosophyId];
  if (!phil) return;
  const a = p.attributes;
  for (const [key, mult] of Object.entries(phil.attrBias)) {
    for (const g of [a.technical, a.mental, a.physical, a.goalkeeping]) {
      if (key in g) {
        g[key] = clamp(Math.round(g[key] * mult), 1, cap);
        break;
      }
    }
  }
  const best = bestOverall(a, p.positions);
  p.overall = Math.min(cap, Math.max(overallAt(a, p.position), best.ovr));
  if (p.overall > p.potential) p.potential = Math.min(cap, p.overall);
}

/** Pick a youth position weighted by the academy philosophy's position bias. */
export function pickYouthPosition(rng: Rng, philosophyId: string): Position {
  const phil = PHILOSOPHIES[philosophyId];
  const weights = YOUTH_POSITIONS.map((pos) => phil?.positionBias?.[POSITION_GROUP[pos]] ?? 1);
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rng.next() * total;
  for (let i = 0; i < YOUTH_POSITIONS.length; i++) {
    r -= weights[i];
    if (r <= 0) return YOUTH_POSITIONS[i];
  }
  return YOUTH_POSITIONS[YOUTH_POSITIONS.length - 1];
}

/** Average rating of a club's youth coaches (falls back to a modest 50). */
export function youthCoachQuality(academy: Academy, staff: Staff[] | undefined): number {
  const coaches = (staff ?? []).filter((s) => academy.youthCoachIds.includes(s.id));
  if (coaches.length === 0) return 45;
  return coaches.reduce((s, c) => s + c.rating, 0) / coaches.length;
}

/**
 * Youth development growth factor (≈0.85–1.45). Driven by youth-coach quality and
 * the training + coaching facility tracks; a played-up prospect grows faster.
 */
export function youthGrowthFactor(academy: Academy, coachQuality: number, playedUp: boolean): number {
  const coach = (coachQuality - 50) / 200; // ±0.25
  const fac = (academy.facilities.training + academy.facilities.coaching) / 10; // 0.2–1.0
  const base = clamp(0.92 + coach + fac * 0.18, 0.85, 1.4) as number;
  return playedUp ? base * 1.12 : base;
}

/** Potential at/above which a youngster is a "once in a generation" prodigy. */
export const PRODIGY_POTENTIAL = 90;

/**
 * Roll a realistic youth POTENTIAL. The bulk lands near `baseCeil` (a typical
 * prospect), and high ceilings get progressively rarer via three independent,
 * increasingly-unlikely "talent spikes". Generational talent is uncapped (up to
 * 99) but extremely rare — even at elite academies. `qualityLvl` (0–1) lifts the
 * spike odds for stronger academies. Deterministic given the RNG.
 */
export function rollSkewedPotential(baseCeil: number, qualityLvl: number, rng: Rng): number {
  let potential = baseCeil + rng.normal(0, 4);
  const lvl = clamp(qualityLvl, 0, 1) as number;
  if (rng.chance(0.09 * (0.4 + lvl))) potential += rng.int(3, 6); // promising (uncommon)
  if (rng.chance(0.022 * (0.3 + lvl))) potential += rng.int(4, 8); // star quality (rare)
  if (rng.chance(0.004 * (0.3 + lvl))) potential += rng.int(6, 14); // generational (very rare)
  return clamp(Math.round(potential), 45, 99) as number;
}

/** Youth potential tailored to an academy's star rating + own reputation. */
export function academyPotential(stars: number, academyReputation: number, rng: Rng): number {
  const baseCeil = 69 + stars * 1.7 + academyReputation * 0.05; // ~3★ club ≈ 76, elite ≈ 81
  const qualityLvl = (stars - 1) / 4 + academyReputation / 200;
  return rollSkewedPotential(baseCeil, qualityLvl, rng);
}

/** Map a player's age to an academy age group. */
export function ageGroupForAge(age: number): AgeGroup {
  if (age <= 16) return 'U16';
  if (age <= 18) return 'U18';
  return 'U21';
}

export const ageOfPlayer = (p: Player, currentYear: number): number => currentYear - p.born.year;

/**
 * Age-group performance 0–100: a prospect's standing vs his cohort, blending his
 * percentile rank within the group with his ceiling. Drives the play-up
 * recommendation (Idea 4) and feeds the readiness gauge.
 */
export function ageGroupPerformanceFor(player: Player, cohortOvrs: number[]): number {
  const n = cohortOvrs.length;
  const pct = n <= 1 ? 60 : (cohortOvrs.filter((o) => o < player.overall).length / (n - 1)) * 100;
  const ceiling = clamp((player.potential - 55) * 2, 0, 100) as number;
  return clamp(Math.round(0.7 * pct + 0.3 * ceiling), 0, 100) as number;
}

/** A standout for his age group who isn't already at the top → recommend playing up. */
export function recommendsPlayUp(ageGroupPerformance: number, ageGroup: AgeGroup, playedUp: boolean): boolean {
  return !playedUp && ageGroup !== 'U21' && ageGroupPerformance >= 82;
}

/**
 * Promotion readiness gauge 0–100 (Idea 10). Combines current ability vs the
 * first-team bar, ceiling, age-group form and a coaching nudge. Informative —
 * the manager still makes the call.
 */
export function computeReadiness(
  ovr: number,
  potential: number,
  ageGroupPerformance: number,
  firstTeamAvgOvr: number,
  coachQuality = 60,
): number {
  const bar = Math.max(40, firstTeamAvgOvr);
  const abilityVsBar = clamp((ovr / bar) * 100, 0, 100) as number;
  const ceiling = clamp(((potential - ovr) <= 6 ? 100 : 60 + (potential - bar) * 2), 0, 100) as number;
  const coachRec = clamp(40 + (coachQuality - 50) + (ageGroupPerformance - 50) * 0.4, 0, 100) as number;
  return clamp(
    Math.round(0.5 * abilityVsBar + 0.22 * ageGroupPerformance + 0.18 * ceiling + 0.1 * coachRec),
    0,
    100,
  ) as number;
}
