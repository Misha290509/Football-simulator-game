import { describe, it, expect } from 'vitest';
import { areRivals, derbyResultBonus } from '../rivalries';
import { generateNarratives } from '../narratives';
import type { Match } from '../../types/match';

function match(id: string, day: number, home: string, away: string, hg: number, ag: number): Match {
  return { id, competitionId: 'c', seasonId: 's', round: day, day, homeClubId: home, awayClubId: away, played: true, homeGoals: hg, awayGoals: ag, homeXg: 0, awayXg: 0, events: [], playerStats: [], seed: 0 };
}

describe('Rivalries', () => {
  it('recognises famous derbies both ways, accents and all', () => {
    expect(areRivals('Real Madrid', 'Atlético Madrid')).toBe(true);
    expect(areRivals('Atlético Madrid', 'Real Madrid')).toBe(true);
    expect(areRivals('Arsenal', 'Tottenham Hotspur')).toBe(true);
    expect(areRivals('Arsenal', 'Chelsea')).toBe(false);
  });

  it('derby results carry an extra swing (none for a draw)', () => {
    expect(derbyResultBonus(true, false).morale).toBeGreaterThan(0);
    expect(derbyResultBonus(false, false).morale).toBeLessThan(0);
    expect(derbyResultBonus(false, true)).toEqual({ morale: 0, confidence: 0 });
  });
});

describe('Narratives', () => {
  const CLUB = 'us';
  it('celebrates a winning run at the right thresholds', () => {
    const played = [1, 2, 3].map((d) => match(`m${d}`, d, CLUB, `o${d}`, 2, 0));
    const news = generateNarratives(CLUB, played, played[2], 'Them', 3);
    expect(news.some((n) => n.title.includes('3 wins'))).toBe(true);
  });

  it('warns of a losing run', () => {
    const played = [1, 2, 3].map((d) => match(`m${d}`, d, CLUB, `o${d}`, 0, 2));
    const news = generateNarratives(CLUB, played, played[2], 'Them', 3);
    expect(news.some((n) => n.title.includes('3 straight defeats'))).toBe(true);
  });

  it('flags the season\'s biggest win', () => {
    const played = [match('a', 1, CLUB, 'o1', 1, 0), match('b', 2, CLUB, 'o2', 5, 0)];
    const news = generateNarratives(CLUB, played, played[1], 'Minnows', 2);
    expect(news.some((n) => n.title.includes('Emphatic win'))).toBe(true);
  });

  it('stays quiet on an unremarkable result', () => {
    const played = [match('a', 1, CLUB, 'o1', 1, 1), match('b', 2, CLUB, 'o2', 1, 0)];
    const news = generateNarratives(CLUB, played, played[1], 'Them', 2);
    expect(news.length).toBe(0);
  });
});
