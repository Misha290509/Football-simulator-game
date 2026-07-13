// ---------------------------------------------------------------------------
// Manager career + job market (§ Manager career). Pure & deterministic. Tracks
// the manager's own reputation, generates job vacancies + headhunting offers at
// season rollover, and helps switch clubs. A strong season at an overachieving
// club attracts bigger jobs; a sacking triggers rebuild offers a rung down.
// ---------------------------------------------------------------------------

import type { Club } from '../types/club';
import type { Competition } from '../types/competition';
import type { StandingRow, JobOffer, ManagerStint } from '../types/league';
import { Rng, clamp } from '../engine/rng';

/** A new manager's starting reputation, loosely tied to the club they take. */
export function initialManagerReputation(club: Club): number {
  return clamp(Math.round(club.reputation * 0.5 + 20), 30, 74) as number;
}

/** Update reputation after a season from finish-vs-target, trophies and sackings. */
export function updateManagerReputation(
  current: number,
  finishPos: number,
  targetPos: number,
  trophies: number,
  sacked: boolean,
): number {
  let delta = (targetPos - finishPos) * 1.4 + trophies * 5;
  if (sacked) delta -= 12;
  delta = clamp(delta, -18, 22);
  return clamp(Math.round(current + delta), 5, 99) as number;
}

/**
 * The club-reputation level a manager is realistically worth right now — the
 * anchor for which clubs come calling. Career reputation (5–99) is on its own
 * compressed scale, so it's mapped back onto the club-reputation scale and
 * blended with the reputation of the club they were last at (a manager at Elche
 * is an "Elche-level" manager, whatever their abstract number). A sacking knocks
 * them down a rung.
 */
export function managerLevel(managerReputation: number, lastClubRep: number | undefined, sacked: boolean): number {
  const career = clamp((managerReputation - 20) * 2, 25, 99);
  let level = lastClubRep != null ? 0.55 * lastClubRep + 0.45 * career : career;
  if (sacked) level -= 8;
  return level;
}

/**
 * How good a fit a club is for a manager at `level` (higher = better). Clubs near
 * or a touch below the manager's level fit best; clubs above are a stretch —
 * steeply so after a sacking, so an out-of-work small-club boss is courted by
 * modest clubs, never by Real Madrid. A shared country adds familiarity pull.
 */
export function clubFitScore(club: Club, level: number, sacked: boolean, homeCountry?: string): number {
  const gap = club.reputation - level; // + = club sits above the manager's level
  let score = gap <= 0 ? gap * 0.5 : -gap * (sacked ? 2.2 : 1.0);
  if (homeCountry && club.countryId === homeCountry) score += 8;
  return score;
}

const REASONS_HEADHUNT = [
  'have been impressed by your work and want you to take charge',
  'see you as the ideal candidate to lead their project',
  'have made you their number one target after a strong campaign',
];
const REASONS_VACANCY = [
  'have parted ways with their manager and are sounding you out',
  'are looking for a fresh start and admire your approach',
  'need a steady hand after a turbulent season',
];
const REASONS_REBUILD = [
  'are willing to give you a platform to rebuild your reputation',
  'believe you can turn their fortunes around',
  'are offering you a route back into management',
];

let _offerSeq = 0;

/**
 * Generate job offers for the manager at rollover. `finishByClub` maps clubId →
 * { actualPos, expectedPos, leagueName }. Clubs that underperformed have a
 * vacancy; those within the manager's reputation band may headhunt. When sacked,
 * offers come from clubs a rung down so the career can continue.
 */
export function generateJobOffers(
  managerReputation: number,
  managerClubId: string,
  clubs: Record<string, Club>,
  competitions: Record<string, Competition>,
  standings: Record<string, StandingRow[]>,
  rng: Rng,
  sacked: boolean,
  day: number,
): JobOffer[] {
  // Per-club actual vs reputation-expected finish → vacancy signal. Derived from
  // the finished season's standings (not post-rollover competition membership).
  const vacancy = new Set<string>();
  const leagueOf: Record<string, string> = {};
  for (const [compId, rows] of Object.entries(standings)) {
    if (!rows || rows.length === 0) continue;
    const name = competitions[compId]?.name ?? '';
    const ids = rows.map((r) => r.clubId);
    const byRep = [...ids].sort((a, b) => (clubs[b]?.reputation ?? 0) - (clubs[a]?.reputation ?? 0));
    rows.forEach((row, i) => {
      leagueOf[row.clubId] = name;
      const underperformed = (i + 1) - (byRep.indexOf(row.clubId) + 1) >= 4;
      if ((underperformed && rng.chance(0.55)) || rng.chance(0.05)) vacancy.add(row.clubId);
    });
  }

  const homeCountry = clubs[managerClubId]?.countryId;
  const level = managerLevel(managerReputation, clubs[managerClubId]?.reputation, sacked);
  // A hard ceiling on how far above their level a club will look at them: barely
  // any after a sacking, a real step up when headhunted off a strong season.
  const ceiling = level + (sacked ? 6 : 18);

  // Clubs with a vacancy come calling, ranked by fit to the manager's level. A
  // sacked manager always gets a route back (widening below the ceiling, then to
  // anyone if their level is beneath every club) so the career never dead-ends.
  let candidates = Object.values(clubs).filter((c) => c.id !== managerClubId && vacancy.has(c.id) && c.reputation <= ceiling);
  if (candidates.length === 0 && sacked) {
    candidates = Object.values(clubs).filter((c) => c.id !== managerClubId && c.reputation <= ceiling);
    if (candidates.length === 0) candidates = Object.values(clubs).filter((c) => c.id !== managerClubId);
  }
  candidates.sort((a, b) => clubFitScore(b, level, sacked, homeCountry) - clubFitScore(a, level, sacked, homeCountry));

  const picks = candidates.slice(0, sacked ? 3 : 2);
  return picks.map((c) => {
    const pool = sacked ? REASONS_REBUILD : c.reputation > level ? REASONS_HEADHUNT : REASONS_VACANCY;
    return {
      id: `job_${day}_${_offerSeq++}`,
      clubId: c.id,
      clubName: c.name,
      clubReputation: c.reputation,
      leagueName: leagueOf[c.id] ?? '',
      reason: `${c.shortName} ${pool[rng.int(0, pool.length - 1)]}.`,
      day,
    };
  });
}

/**
 * Emergency approaches for a sacked manager whose offer list has run dry —
 * declining every offer must never dead-end the career (play stays blocked
 * until a new job is taken). Widens the search until employers appear: clubs
 * at or below the manager's level first, then anyone. `exclude` skips clubs
 * just declined so fresh names appear. Deterministic given the RNG.
 */
export function fallbackJobOffers(
  managerReputation: number,
  managerClubId: string,
  clubs: Record<string, Club>,
  competitions: Record<string, Competition>,
  rng: Rng,
  day: number,
  exclude: Set<string> = new Set(),
): JobOffer[] {
  const leagueOf: Record<string, string> = {};
  for (const comp of Object.values(competitions)) {
    for (const id of comp.clubIds) leagueOf[id] ??= comp.name;
  }
  const homeCountry = clubs[managerClubId]?.countryId;
  // Emergency search: rank everyone by fit to the manager's (sack-discounted)
  // level. Clubs at or below their level come first, the elite dead last — so an
  // out-of-work small-club boss is offered modest clubs, never Real Madrid.
  const level = managerLevel(managerReputation, clubs[managerClubId]?.reputation, true);
  const ceiling = level + 6;
  let pool = Object.values(clubs).filter((c) => c.id !== managerClubId && !exclude.has(c.id) && c.reputation <= ceiling);
  // Level beneath every club (a badly-out-of-favour boss) → offer the weakest
  // available clubs rather than, absurdly, the biggest.
  if (pool.length === 0) pool = Object.values(clubs).filter((c) => c.id !== managerClubId && !exclude.has(c.id));
  const candidates = pool.sort((a, b) => clubFitScore(b, level, true, homeCountry) - clubFitScore(a, level, true, homeCountry));
  return candidates.slice(0, 3).map((c) => ({
    id: `job_${day}_${_offerSeq++}`,
    clubId: c.id,
    clubName: c.name,
    clubReputation: c.reputation,
    leagueName: leagueOf[c.id] ?? '',
    reason: `${c.shortName} ${REASONS_REBUILD[rng.int(0, REASONS_REBUILD.length - 1)]}.`,
    day,
  }));
}

/** Close the manager's current (open) stint and open a new one at `club`. */
export function switchClub(
  stints: ManagerStint[],
  club: Club,
  year: number,
  reason: ManagerStint['reasonLeft'],
): ManagerStint[] {
  const closed = stints.map((s) =>
    s.toYear === undefined ? { ...s, toYear: year, reasonLeft: reason } : s,
  );
  return [...closed, { clubId: club.id, clubName: club.name, fromYear: year, seasons: 0, trophies: 0 }];
}
