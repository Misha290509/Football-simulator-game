// ---------------------------------------------------------------------------
// Dynasty & all-time records (§ #53). Accumulates club honours across the
// decades as a running aggregate (never re-scanning raw history), so a
// long-lived save can show the most-decorated clubs cheaply. Pure helpers.
// ---------------------------------------------------------------------------

import type { Award, ClubHonours } from '../types/league';

const empty = (): ClubHonours => ({ league: 0, cup: 0, continental: 0 });

export const honoursTotal = (h: ClubHonours): number => h.league + h.cup + h.continental;

/**
 * Fold one season's awards into the all-time club-honours tally. Only the three
 * club trophies count toward a dynasty; individual gongs are ignored here.
 */
export function accrueHonours(
  existing: Record<string, ClubHonours> | undefined,
  awards: Award[],
): Record<string, ClubHonours> {
  const tally: Record<string, ClubHonours> = { ...(existing ?? {}) };
  for (const a of awards) {
    if (!a.clubId) continue;
    const key = a.type === 'LEAGUE_CHAMPION' ? 'league' : a.type === 'DOMESTIC_CUP' ? 'cup' : a.type === 'CONTINENTAL' ? 'continental' : null;
    if (!key) continue;
    const cur = tally[a.clubId] ? { ...tally[a.clubId] } : empty();
    cur[key] += 1;
    tally[a.clubId] = cur;
  }
  return tally;
}

export interface DynastyRow {
  clubId: string;
  honours: ClubHonours;
  total: number;
}

/** The most-decorated clubs, most honours first (ties broken by league titles). */
export function dynastyBoard(honours: Record<string, ClubHonours> | undefined, limit = 12): DynastyRow[] {
  return Object.entries(honours ?? {})
    .map(([clubId, h]) => ({ clubId, honours: h, total: honoursTotal(h) }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total || b.honours.league - a.honours.league || b.honours.continental - a.honours.continental)
    .slice(0, limit);
}
