import { describe, it, expect } from 'vitest';
import {
  seasonOpenDate, dateForDay, matchDate, matchKind, windowOnDate, isWindowOpen, windowKey, formatShort,
} from '../gameCalendar';

const meta = { domesticCups: { cup_x: {} } } as never;

describe('Game calendar', () => {
  it('opens the season on a Saturday in mid-August', () => {
    const d = seasonOpenDate(2024);
    expect(d.getUTCDay()).toBe(6); // Saturday
    expect(d.getUTCMonth()).toBe(7); // August
    expect(d.getUTCDate()).toBeGreaterThanOrEqual(12);
    expect(d.getUTCDate()).toBeLessThanOrEqual(18);
  });

  it('stretches the day range from August to the end of May', () => {
    const start = dateForDay(0, 300, 2024);
    const end = dateForDay(300, 300, 2024);
    expect(start.getUTCMonth()).toBe(7); // August
    expect(end.getUTCFullYear()).toBe(2025);
    expect(end.getUTCMonth()).toBe(4); // May
  });

  it('places league games on weekends and European nights midweek', () => {
    const maxDay = 300;
    const league = matchDate({ id: 'm_comp_EN_t1_10_a_b', day: 90, competitionId: 'comp_EN_t1' }, maxDay, 2024, meta);
    expect([0, 6]).toContain(league.getUTCDay()); // Sat/Sun
    const cl = matchDate({ id: 'm_UEFA_CL_x_1', day: 90, competitionId: 'UEFA_CL' }, maxDay, 2024, meta);
    expect([2, 3]).toContain(cl.getUTCDay()); // Tue/Wed
    const el = matchDate({ id: 'm_UEFA_EL_x_1', day: 90, competitionId: 'UEFA_EL' }, maxDay, 2024, meta);
    expect(el.getUTCDay()).toBe(4); // Thursday
    const conf = matchDate({ id: 'm_UEFA_CONF_x_1', day: 90, competitionId: 'UEFA_CONF' }, maxDay, 2024, meta);
    expect(conf.getUTCDay()).toBe(4); // Thursday
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
    const maxDay = 300;
    const augMeta = { currentDay: 0, startYear: 2024, seasons: { s: { year: 2024, current: true } } } as never;
    expect(isWindowOpen(augMeta, maxDay)).toBe(true);
    expect(windowKey(augMeta, maxDay)).toBe('SUMMER-2024');
    // Mid-season (≈ half way) lands outside a window (spring).
    const springMeta = { currentDay: 200, startYear: 2024, seasons: { s: { year: 2024, current: true } } } as never;
    expect(isWindowOpen(springMeta, maxDay)).toBe(false);
  });

  it('formats a friendly short date', () => {
    expect(formatShort(new Date(Date.UTC(2024, 7, 17)))).toMatch(/\d+ Aug/);
  });
});
