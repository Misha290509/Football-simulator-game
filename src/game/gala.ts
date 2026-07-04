// ---------------------------------------------------------------------------
// The autumn awards gala (§ Awards). The Ballon d'Or and its companion trophies
// (Kopa, Yashin, Puskás) are computed at season rollover but announced in late
// October of the following season, honouring the campaign just finished. This
// module schedules the ceremony on the new season's calendar and, when the day
// arrives, produces the announcement news.
// ---------------------------------------------------------------------------

import type { Award, GalaCeremony } from '../types/league';
import type { Match } from '../types/match';
import type { Player } from '../types/player';
import type { NewsItem } from '../types/league';
import { CALENDAR_STRIDE } from './calendar';

/**
 * Late October sits roughly 22% into a season that runs August→May. Land the
 * gala on a league day near that point of the new season.
 */
export function scheduleGala(seasonId: string, year: number, awards: Award[], newMatches: Match[]): GalaCeremony {
  let maxDay = 0;
  for (const m of newMatches) if (m.day > maxDay) maxDay = m.day;
  const raw = Math.max(CALENDAR_STRIDE, Math.round(maxDay * 0.22));
  const announceDay = raw - (((raw % CALENDAR_STRIDE) + CALENDAR_STRIDE) % CALENDAR_STRIDE); // a league (class-0) day
  return { seasonId, year, announceDay, awards, announced: false };
}

const nameOf = (players: Record<string, Player>, pid?: string) =>
  pid && players[pid] ? `${players[pid].name.first} ${players[pid].name.last}` : 'a mystery winner';

/** The ceremony news item announcing the gala's winners. */
export function galaNews(gala: GalaCeremony, players: Record<string, Player>, day: number): NewsItem {
  const find = (type: string) => gala.awards.find((a) => a.type === type);
  const ballon = find('GLOBAL_BEST');
  const lines = gala.awards
    .map((a) => `${a.label}: ${nameOf(players, a.playerId)}`)
    .join(' · ');
  return {
    id: `news_gala_${gala.year}`,
    day,
    category: 'AWARD',
    title: `Ballon d’Or ${gala.year}: ${nameOf(players, ballon?.playerId)} crowned`,
    body: `The ${gala.year} awards gala honours the ${gala.year}/${((gala.year + 1) % 100).toString().padStart(2, '0')} season. ${lines}.`,
    read: false,
  };
}
