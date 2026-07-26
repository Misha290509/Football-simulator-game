import { describe, it, expect } from 'vitest';
import { seasonReportCard } from '../playerCareer';

describe('seasonReportCard', () => {
  it('grades a stellar, trophy-laden striker season near the top', () => {
    const c = seasonReportCard({ apps: 40, goals: 28, assists: 10, avgRating: 7.8, ovrDelta: 4, honours: ['Golden Boot'], position: 'ST', year: 2025 });
    expect(['A+', 'A']).toContain(c.grade);
    expect(c.headline.length).toBeGreaterThan(0);
  });

  it('grades a barely-played, low-rated season at the bottom', () => {
    const c = seasonReportCard({ apps: 4, goals: 0, assists: 0, avgRating: 6.1, ovrDelta: 0, honours: [], position: 'ST', year: 2025 });
    expect(['C', 'D']).toContain(c.grade);
  });

  it('judges defenders on rating rather than goals (a clean-sheet season still grades well)', () => {
    const cb = seasonReportCard({ apps: 38, goals: 2, assists: 1, avgRating: 7.4, ovrDelta: 2, honours: [], position: 'RCB', year: 2025 });
    expect(['A+', 'A', 'B+']).toContain(cb.grade);
  });

  it('is deterministic — same inputs give the same card', () => {
    const a = seasonReportCard({ apps: 30, goals: 12, assists: 6, avgRating: 7.1, ovrDelta: 1, honours: [], position: 'CM', year: 2027 });
    const b = seasonReportCard({ apps: 30, goals: 12, assists: 6, avgRating: 7.1, ovrDelta: 1, honours: [], position: 'CM', year: 2027 });
    expect(a).toEqual(b);
  });
});
