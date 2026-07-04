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

  const band = sacked
    ? { lo: managerReputation - 28, hi: managerReputation + 2 }
    : { lo: managerReputation - 18, hi: managerReputation + (managerReputation >= 72 ? 14 : 8) };

  const candidates = Object.values(clubs).filter((c) =>
    c.id !== managerClubId && vacancy.has(c.id) && c.reputation >= band.lo && c.reputation <= band.hi,
  );
  candidates.sort((a, b) => b.reputation - a.reputation);

  // Sacked managers are guaranteed at least one option a rung down.
  if (sacked && candidates.length === 0) {
    const fallback = Object.values(clubs)
      .filter((c) => c.id !== managerClubId && c.reputation <= managerReputation)
      .sort((a, b) => b.reputation - a.reputation)[0];
    if (fallback) candidates.push(fallback);
  }

  const picks = candidates.slice(0, sacked ? 3 : 2);
  return picks.map((c) => {
    const pool = sacked ? REASONS_REBUILD : c.reputation > managerReputation ? REASONS_HEADHUNT : REASONS_VACANCY;
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
