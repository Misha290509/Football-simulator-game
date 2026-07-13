import { describe, it, expect } from 'vitest';
import {
  seasonOpenDate, dateForDay, matchDate, matchKind, windowOnDate, isWindowOpen, windowKey, formatShort, PRESEASON_DAYS,
} from '../gameCalendar';

const meta = { domesticCups: { cup_x: {} } } as never;
const REF = 129; // a 38-round league's last matchday (the calendar anchor)
const roundDay = (r: number) => PRESEASON_DAYS + r * 3; // 0-based league round → sim day

describe('Game calendar', () => {
  it('opens the season on a Saturday in mid-August', () => {
    const d = seasonOpenDate(2024);
    expect(d.getUTCDay()).toBe(6);   // Saturday
    expect(d.getUTCMonth()).toBe(7); // August
    expect(d.getUTCDate()).toBeGreaterThanOrEqual(15);
    expect(d.getUTCDate()).toBeLessThanOrEqual(21);
  });

  it('runs from the mid-August opener to a late-May finale, off-season before', () => {
    const preseason = dateForDay(0, REF, 2024);            // day 0 — off-season
    const opener = dateForDay(PRESEASON_DAYS, REF, 2024);  // first round
    const end = dateForDay(REF, REF, 2024);                // last round
    expect([5, 6]).toContain(preseason.getUTCMonth());     // Jun/Jul, no games
    expect(preseason.getTime()).toBeLessThan(opener.getTime());
    expect(opener.getUTCMonth()).toBe(7);                  // August
    expect(end.getUTCFullYear()).toBe(2025);
    expect(end.getUTCMonth()).toBe(4);                     // May
    expect(end.getUTCDate()).toBeGreaterThanOrEqual(18);   // late May
  });

  it('spaces league rounds ~weekly with fortnight gaps for breaks', () => {
    const dates = Array.from({ length: 38 }, (_, r) => dateForDay(roundDay(r), REF, 2024));
    let min = 99, max = 0;
    for (let i = 1; i < dates.length; i++) {
      const gap = Math.round((dates[i].getTime() - dates[i - 1].getTime()) / 86_400_000);
      min = Math.min(min, gap);
      max = Math.max(max, gap);
    }
    expect(min).toBeGreaterThanOrEqual(3);   // no pile-ups
    expect(max).toBeGreaterThanOrEqual(13);  // at least one break fortnight
    expect(max).toBeLessThanOrEqual(30);
  });

  it('places league games on weekends and European nights midweek', () => {
    const league = matchDate({ id: 'm_comp_EN_t1_0_a_b', day: roundDay(0), competitionId: 'comp_EN_t1' }, REF, 2024, meta);
    expect([0, 6]).toContain(league.getUTCDay()); // opening round → Sat/Sun
    const cl = matchDate({ id: 'm_UEFA_CL_x_1', day: 60, competitionId: 'UEFA_CL' }, REF, 2024, meta);
    expect([2, 3]).toContain(cl.getUTCDay()); // Tue/Wed
    const el = matchDate({ id: 'm_UEFA_EL_x_1', day: 60, competitionId: 'UEFA_EL' }, REF, 2024, meta);
    expect(el.getUTCDay()).toBe(4); // Thursday
    const conf = matchDate({ id: 'm_UEFA_CONF_x_1', day: 60, competitionId: 'UEFA_CONF' }, REF, 2024, meta);
    expect(conf.getUTCDay()).toBe(4); // Thursday
  });

  it('parks the Club World Cup in the following summer', () => {
    const cwc = matchDate({ id: 'm_FIFA_CWC_x_1', day: 190, competitionId: 'FIFA_CWC' }, REF, 2024, meta);
    expect([5, 6]).toContain(cwc.getUTCMonth()); // Jun/Jul
    expect(cwc.getUTCFullYear()).toBe(2025);
  });

  it('classifies competitions correctly', () => {
    expect(matchKind('UEFA_CL', meta)).toBe('CL');
    expect(matchKind('UEFA_EL', meta)).toBe('EL');
    expect(matchKind('cup_x', meta)).toBe('CUP');
    expect(matchKind('comp_EN_t1', meta)).toBe('LEAGUE');
  });

  it('opens the summer window (Aug) and winter window (Jan) only', () => {
    expect(windowOnDate(new Date(Date.UTC(2024, 7, 20)))).toBe('SUMMER'); // August
    expect(windowOnDate(new Date(Date.UTC(2025, 0, 15)))).toBe('WINTER'); // January
    expect(windowOnDate(new Date(Date.UTC(2024, 9, 1)))).toBe(null);      // October
    expect(windowOnDate(new Date(Date.UTC(2025, 2, 1)))).toBe(null);      // March
  });

  it('reports the live window from the season cursor', () => {
    const augMeta = { currentDay: 0, startYear: 2024, seasons: { s: { year: 2024, current: true } } } as never;
    expect(isWindowOpen(augMeta, REF)).toBe(true);
    expect(windowKey(augMeta, REF)).toBe('SUMMER-2024');
    const springMeta = { currentDay: 110, startYear: 2024, seasons: { s: { year: 2024, current: true } } } as never;
    expect(isWindowOpen(springMeta, REF)).toBe(false); // ~spring, outside a window
  });

  it('formats a friendly short date', () => {
    expect(formatShort(new Date(Date.UTC(2024, 7, 17)))).toMatch(/\d+ Aug/);
  });
});
