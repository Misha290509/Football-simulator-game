// ---------------------------------------------------------------------------
// Rivalries & derbies (§ Rivalries). Famous rivalries are data; a derby carries
// extra weight — bigger morale/board swings and a badge in the UI. Matched by
// normalized club name so it works across datasets.
// ---------------------------------------------------------------------------

import { normClubName } from '../engine/academy';

/** Well-known rivalries (normalized club-name pairs). Editable data. */
const RIVALRIES: [string, string][] = [
  ['real madrid', 'atletico madrid'],
  ['real madrid', 'fc barcelona'],
  ['fc barcelona', 'espanyol'],
  ['sevilla fc', 'real betis'],
  ['manchester city', 'manchester united'],
  ['liverpool', 'everton'],
  ['liverpool', 'manchester united'],
  ['arsenal', 'tottenham hotspur'],
  ['chelsea', 'tottenham hotspur'],
  ['inter', 'ac milan'],
  ['juventus', 'inter'],
  ['as roma', 'lazio'],
  ['napoli', 'juventus'],
  ['borussia dortmund', 'fc schalke 04'],
  ['fc bayern munchen', 'borussia dortmund'],
  ['paris saint-germain', 'olympique de marseille'],
  ['olympique lyonnais', 'saint-etienne'],
  ['celtic', 'rangers'],
  ['sl benfica', 'fc porto'],
  ['sl benfica', 'sporting cp'],
  ['ajax', 'feyenoord'],
  ['boca juniors', 'river plate'],
  ['flamengo', 'fluminense'],
  ['sao paulo', 'corinthians'],
];

const KEY = new Set(RIVALRIES.map(([a, b]) => [a, b].sort().join('|')));

/** Are these two clubs (by name) traditional rivals? */
export function areRivals(nameA: string, nameB: string): boolean {
  return KEY.has([normClubName(nameA), normClubName(nameB)].sort().join('|'));
}

/** Extra morale/board swing for a derby result (added on top of the normal effect). */
export function derbyResultBonus(won: boolean, drew: boolean): { morale: number; confidence: number } {
  if (drew) return { morale: 0, confidence: 0 };
  return won ? { morale: 6, confidence: 4 } : { morale: -6, confidence: -4 };
}
