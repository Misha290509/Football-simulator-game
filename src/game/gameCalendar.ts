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

/** Days from the opening weekend to the season's final weekend (~early-Aug→end-May). */
export const SEASON_SPAN_DAYS = 300;

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

/** The first Saturday on/after 2 August of the season's starting year (the
 *  opening weekend — "beginning of August"). */
export function seasonOpenDate(startYear: number): Date {
  const d = new Date(Date.UTC(startYear, 7, 2));
  while (d.getUTCDay() !== 6) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/**
 * Day-index → calendar date. Two linear segments joined at the opener:
 *   • [0, PRESEASON_DAYS] ramps through the off-season (early July → opener);
 *   • [PRESEASON_DAYS, maxDay] stretches the season across Aug → end of May.
 * Fixtures live in the second segment (they're shifted forward by PRESEASON_DAYS
 * at generation), so day 0 is a genuine off-season with no games.
 */
export function dateForDay(dayIndex: number, maxDay: number, startYear: number): Date {
  const open = seasonOpenDate(startYear);
  if (dayIndex <= PRESEASON_DAYS) {
    const frac = PRESEASON_DAYS > 0 ? Math.min(1, Math.max(0, dayIndex / PRESEASON_DAYS)) : 1;
    const offStart = open.getTime() - OFFSEASON_CAL_DAYS * MS_DAY;
    return new Date(offStart + Math.round(frac * OFFSEASON_CAL_DAYS) * MS_DAY);
  }
  const span = Math.max(1, maxDay - PRESEASON_DAYS);
  const frac = Math.min(1, Math.max(0, (dayIndex - PRESEASON_DAYS) / span));
  return new Date(open.getTime() + Math.round(frac * SEASON_SPAN_DAYS) * MS_DAY);
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
  return snapWeekday(dateForDay(match.day, maxDay, startYear), kind, hash(match.id));
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
