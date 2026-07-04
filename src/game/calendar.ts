// ---------------------------------------------------------------------------
// Shared season calendar (§ Calendar). The sim-day axis is strided so different
// competition types never land a club in two matches on the same day:
//   • class 0 → domestic league rounds
//   • class 1 → continental (Champions/Europa/Conference League, Club World Cup)
//   • class 2 → domestic cups (+ the Super Cup)
// A league round `r` sits on day `r * STRIDE` (class 0); cup and European ties
// take the class-1 / class-2 days between them.
// ---------------------------------------------------------------------------

export const CALENDAR_STRIDE = 3;

export const DAY_CLASS = { LEAGUE: 0, CONTINENTAL: 1, CUP: 2 } as const;
export type DayClass = (typeof DAY_CLASS)[keyof typeof DAY_CLASS];

/** The next day strictly after `after` whose class matches `cls`. */
export function nextDayInClass(after: number, cls: DayClass): number {
  let d = after + 1;
  while (((d % CALENDAR_STRIDE) + CALENDAR_STRIDE) % CALENDAR_STRIDE !== cls) d++;
  return d;
}

/**
 * `count` distinct ascending days of class `cls` spread across (lo, hi]. Used to
 * reserve midweek slots for a competition's rounds.
 */
export function slotsInClass(lo: number, hi: number, count: number, cls: DayClass): number[] {
  const out: number[] = [];
  const span = Math.max(1, hi - lo);
  for (let m = 0; m < count; m++) {
    let d = lo + Math.round(((m + 1) * span) / (count + 1));
    while (((d % CALENDAR_STRIDE) + CALENDAR_STRIDE) % CALENDAR_STRIDE !== cls) d++;
    while (out.includes(d)) d += CALENDAR_STRIDE;
    out.push(d);
  }
  return out.sort((a, b) => a - b);
}
