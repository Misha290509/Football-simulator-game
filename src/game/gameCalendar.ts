// ---------------------------------------------------------------------------
// Real-date calendar (§ Calendar). The sim schedules on abstract day indices
// (league round r → day r*3); this layer maps those indices onto a real
// August→May season so fixtures show real dates and weekdays, and transfer
// windows / off-season can be gated by month:
//   • League games land on weekends, European nights midweek — Champions
//     League Tue/Wed, Europa & Conference League Thursdays, cups midweek.
//   • The season runs from mid-August to the end of May; June/July are the
//     off-season (reserved for international tournaments at rollover).
//   • Transfer windows: the summer window (Aug, closing 1 September) and the
//     winter window (all of January, closing 1 February).
// Pure and deterministic.
// ---------------------------------------------------------------------------

import type { SaveGame } from '../types/league';
import type { Match } from '../types/match';
import type { ContinentalState } from '../types/continental';
import type { DomesticCupState } from '../types/cup';
import { CALENDAR_STRIDE } from './calendar';

/**
 * Sim-day indices reserved as pre-season / off-season before the opening round.
 * A new season begins at day 0 in the off-season (early July); all fixtures are
 * shifted forward by this much so the first game lands on the August opener,
 * giving the manager a pre-season window to set up the squad and do transfers.
 */
export const PRESEASON_DAYS = 18;

/** Real calendar days shown for the off-season ramp (≈ early July → opener). */
const OFFSEASON_CAL_DAYS = 35;

const MS_DAY = 86_400_000;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The first Saturday on/after 15 August — a real mid-August opening weekend. */
export function seasonOpenDate(startYear: number): Date {
  const d = new Date(Date.UTC(startYear, 7, 15));
  while (d.getUTCDay() !== 6) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/**
 * Weekend intervals with no domestic league round — the five FIFA international
 * breaks and the Christmas / New-Year break — approximating the real calendar.
 * A weekend whose Saturday falls inside one of these is skipped when laying out
 * league rounds, producing the fortnight gaps real seasons have.
 */
function breakIntervals(startYear: number): Array<[number, number]> {
  const y = startYear, ny = startYear + 1;
  const U = (yr: number, m: number, d: number) => Date.UTC(yr, m, d);
  return [
    [U(y, 8, 1), U(y, 8, 10)],    // early September
    [U(y, 9, 6), U(y, 9, 15)],    // early October
    [U(y, 10, 10), U(y, 10, 19)], // mid-November
    [U(y, 11, 22), U(ny, 0, 3)],  // Christmas → New Year (~22 Dec – 3 Jan)
    [U(ny, 2, 23), U(ny, 2, 31)], // late March
  ];
}
const inBreak = (t: number, brks: Array<[number, number]>): boolean =>
  brks.some(([a, b]) => t >= a && t <= b);

/**
 * The real match-day dates for a league of `nRounds`, memoised per season. Games
 * fall on weekends from the mid-August opener toward a ~24 May finale, skipping
 * the international / Christmas break weekends. If a league has more rounds than
 * there are free weekends (so it would otherwise overrun May), the tightest gaps
 * absorb a few midweek (Wednesday) rounds — exactly how real fixture lists cope.
 */
const roundDateCache = new Map<string, number[]>();
function seasonRoundDates(startYear: number, nRounds: number): number[] {
  const key = `${startYear}:${nRounds}`;
  const cached = roundDateCache.get(key);
  if (cached) return cached;

  const opener = seasonOpenDate(startYear).getTime();
  const finale = Date.UTC(startYear + 1, 4, 24); // ~24 May
  const brks = breakIntervals(startYear);

  const weekends: number[] = [];
  for (let t = opener; t <= finale; t += 7 * MS_DAY) {
    if (!inBreak(t, brks)) weekends.push(t);
  }

  let dates = weekends.slice(0, Math.max(1, nRounds));
  // Not enough weekends for every round (a 38-round league only has ~34 free
  // weekends before overrunning May) → add a few midweek (Wednesday) rounds,
  // evenly spaced, each sitting three days before an anchor weekend so it forms a
  // clean weekend+midweek week. Never inside a break.
  const midweekNeeded = nRounds - weekends.length;
  if (midweekNeeded > 0) {
    const extra: number[] = [];
    const step = weekends.length / (midweekNeeded + 1);
    for (let m = 1; m <= midweekNeeded; m++) {
      const idx = Math.min(weekends.length - 1, Math.max(1, Math.round(step * m)));
      const wed = weekends[idx] - 3 * MS_DAY; // Wednesday of the anchor weekend's week
      if (!inBreak(wed, brks) && !extra.includes(wed)) extra.push(wed);
    }
    dates = [...weekends, ...extra].sort((a, b) => a - b);
  }
  dates = dates.slice(0, Math.max(1, nRounds));
  roundDateCache.set(key, dates);
  return dates;
}

/**
 * Day-index → calendar date, anchored to the manager's league schedule.
 *   • [0, PRESEASON_DAYS] ramps through the off-season (early July → opener);
 *   • beyond that, the sim-day maps to a fractional league-round position and
 *     interpolates into the real round-date list, so the season runs mid-August
 *     to late May with break gaps, and European/cup ties interleave on the right
 *     dates. `maxDay` is the manager league's last matchday — NOT the global max
 *     — so a 20-club league fills the whole calendar instead of ending mid-winter.
 */
export function dateForDay(dayIndex: number, maxDay: number, startYear: number): Date {
  const nRounds = Math.max(1, Math.round((maxDay - PRESEASON_DAYS) / CALENDAR_STRIDE) + 1);
  const rd = seasonRoundDates(startYear, nRounds);
  const opener = rd[0];
  if (dayIndex <= PRESEASON_DAYS) {
    const frac = PRESEASON_DAYS > 0 ? Math.min(1, Math.max(0, dayIndex / PRESEASON_DAYS)) : 1;
    const offStart = opener - OFFSEASON_CAL_DAYS * MS_DAY;
    return new Date(offStart + Math.round(frac * OFFSEASON_CAL_DAYS) * MS_DAY);
  }
  const roundPos = (dayIndex - PRESEASON_DAYS) / CALENDAR_STRIDE;
  const lo = Math.floor(roundPos);
  if (lo >= rd.length - 1) return new Date(rd[rd.length - 1]);
  if (lo < 0) return new Date(rd[0]);
  const frac = roundPos - lo;
  return new Date(Math.round(rd[lo] + frac * (rd[lo + 1] - rd[lo])));
}

/**
 * Shift a freshly-generated fixture set (and the competitions' reserved knockout
 * day-slots) forward by PRESEASON_DAYS, so day 0 is the off-season and the first
 * round lands on the August opener. Mutates in place. Call once, after all
 * league / continental / cup fixtures for a season have been assembled.
 */
export function applyPreseasonOffset(
  matches: Match[],
  continental?: Record<string, ContinentalState>,
  cups?: Record<string, DomesticCupState>,
): void {
  for (const m of matches) m.day += PRESEASON_DAYS;
  for (const st of Object.values(continental ?? {})) {
    if (st.koDays) st.koDays = st.koDays.map((d) => d + PRESEASON_DAYS);
  }
  for (const st of Object.values(cups ?? {})) {
    if (st.koDays) st.koDays = st.koDays.map((d) => d + PRESEASON_DAYS);
  }
}

export type MatchKind = 'LEAGUE' | 'CL' | 'EL' | 'CONF' | 'CWC' | 'CUP' | 'OTHER';

/** Classify a competition id into a scheduling kind (drives the weekday). */
export function matchKind(competitionId: string, meta: Pick<SaveGame, 'domesticCups'>): MatchKind {
  if (competitionId === 'UEFA_CL') return 'CL';
  if (competitionId === 'UEFA_EL') return 'EL';
  if (competitionId === 'UEFA_CONF') return 'CONF';
  if (competitionId === 'FIFA_CWC') return 'CWC';
  if (meta.domesticCups && meta.domesticCups[competitionId]) return 'CUP';
  return competitionId.startsWith('comp_') ? 'LEAGUE' : 'OTHER';
}

// Preferred weekdays per kind (0=Sun … 6=Sat).
const KIND_WEEKDAYS: Record<MatchKind, number[]> = {
  LEAGUE: [6, 0], // Saturday / Sunday
  CL: [2, 3],     // Tuesday / Wednesday
  EL: [4],        // Thursday
  CONF: [4],      // Thursday
  CWC: [0, 6],    // weekend (summer tournament, spaced)
  CUP: [3],       // midweek (Wednesday)
  OTHER: [6, 0],
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Snap a base date to the nearest preferred weekday for the kind (within ±3 days). */
function snapWeekday(base: Date, kind: MatchKind, seed: number): Date {
  const options = KIND_WEEKDAYS[kind];
  const target = options[seed % options.length];
  let best = base;
  let bestDist = 99;
  for (let off = -3; off <= 3; off++) {
    const t = new Date(base.getTime() + off * MS_DAY);
    if (t.getUTCDay() === target && Math.abs(off) < bestDist) { bestDist = Math.abs(off); best = t; }
  }
  return best;
}

/** The real calendar date a match is played on. */
export function matchDate(
  match: { id: string; day: number; competitionId: string; neutral?: boolean },
  maxDay: number,
  startYear: number,
  meta: Pick<SaveGame, 'domesticCups'>,
): Date {
  const kind = matchKind(match.competitionId, meta);
  // The Club World Cup is a summer tournament — park it in June/July of the
  // following off-season instead of letting it distort the Aug–May calendar.
  if (kind === 'CWC') {
    return new Date(Date.UTC(startYear + 1, 5, 15) + (hash(match.id) % 30) * MS_DAY);
  }
  const base = dateForDay(match.day, maxDay, startYear);
  // League rounds already sit on their scheduled day. Spread a weekend round
  // across Sat/Sun (nudge +1 for some games) but leave the occasional midweek
  // round on its Wednesday. European/cup ties snap to their midweek nights.
  if (kind === 'LEAGUE') {
    return base.getUTCDay() === 6 ? new Date(base.getTime() + (hash(match.id) % 2) * MS_DAY) : base;
  }
  return snapWeekday(base, kind, hash(match.id));
}

// --- Formatting ------------------------------------------------------------

export const monthName = (d: Date): string => MONTHS[d.getUTCMonth()];
export const monthShort = (d: Date): string => MONTHS_SHORT[d.getUTCMonth()];

/** "Sat 17 Aug" */
export function formatShort(d: Date): string {
  return `${WEEKDAYS_SHORT[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}
/** "Sat 17 Aug 2024" */
export function formatFull(d: Date): string {
  return `${formatShort(d)} ${d.getUTCFullYear()}`;
}

// --- Transfer windows ------------------------------------------------------

export type WindowKind = 'SUMMER' | 'WINTER' | null;

/** Which transfer window (if any) is open on a given calendar date. */
export function windowOnDate(d: Date): WindowKind {
  const m = d.getUTCMonth();
  if (m === 0) return 'WINTER';            // all of January (closes 1 Feb)
  if (m === 5 || m === 6 || m === 7) return 'SUMMER'; // Jun/Jul/Aug (closes 1 Sep)
  return null;
}

/** The manager's current date, from the season cursor. */
export function currentDate(meta: Pick<SaveGame, 'currentDay' | 'startYear' | 'seasons'>, maxDay: number): Date {
  const season = Object.values(meta.seasons ?? {}).find((s) => s.current);
  const year = season?.year ?? meta.startYear;
  return dateForDay(meta.currentDay, maxDay, year);
}

/** Is a transfer window open right now? */
export function isWindowOpen(meta: Pick<SaveGame, 'currentDay' | 'startYear' | 'seasons'>, maxDay: number): boolean {
  return windowOnDate(currentDate(meta, maxDay)) !== null;
}

/** A stable key for the current window (e.g. "SUMMER-2025"), or null when shut. */
export function windowKey(meta: Pick<SaveGame, 'currentDay' | 'startYear' | 'seasons'>, maxDay: number): string | null {
  const d = currentDate(meta, maxDay);
  const w = windowOnDate(d);
  return w ? `${w}-${d.getUTCFullYear()}` : null;
}
