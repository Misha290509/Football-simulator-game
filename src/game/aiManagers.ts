// ---------------------------------------------------------------------------
// Manager identity (§ Living world). Two halves:
//  • Rival managers — every AI club has a persistent, named manager. Defaults
//    are derived deterministically from the club id + save seed (no storage
//    needed); only churn (sackings, new appointments, reputation drift) is
//    written into the save. They get sacked at struggling clubs and their
//    reputations rise with titles, so the same names weave through a career.
//  • Your tactical identity — win counters per tactic accumulate as you play,
//    and once a body of work exists they resolve into style tags ("counter
//    specialist", "high-press disciple") shown on the Manager screen.
// ---------------------------------------------------------------------------

import type { Club } from '../types/club';
import type { NewsItem, StandingRow } from '../types/league';
import { Rng, hashSeed, clamp } from '../engine/rng';
import { FIRST_NAMES, LAST_NAMES } from '../data/names';

export interface AiManager {
  name: string;
  reputation: number; // 0–100
  appointedYear: number;
  titles: number;
  /** True when a retired star stepped into the dugout (§ Legends, #52). */
  formerPlayer?: boolean;
}

/** A retired player available to take a managerial job (§ Legends, #52). */
export interface ManagerCandidate {
  name: string;
  peakOvr: number;
}

/** The (stored or deterministically derived) manager of an AI club. */
export function aiManagerOf(
  clubId: string,
  club: Club | undefined,
  seed: number,
  stored?: Record<string, AiManager>,
): AiManager {
  const existing = stored?.[clubId];
  if (existing) return existing;
  const rng = new Rng((hashSeed(`mgr_${clubId}`) ^ seed) >>> 0);
  return {
    name: `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`,
    reputation: clamp((club?.reputation ?? 55) + rng.int(-8, 6), 20, 92),
    appointedYear: 0,
    titles: 0,
  };
}

export interface ManagerChurnResult {
  managers: Record<string, AiManager>;
  news: NewsItem[];
}

/**
 * Season-end churn: champions' managers gain stature (and a title); managers of
 * clubs finishing in the bottom three risk the sack, replaced by a fresh name.
 */
export function rolloverAiManagers(
  stored: Record<string, AiManager> | undefined,
  clubs: Record<string, Club>,
  finalStandings: Record<string, StandingRow[]>,
  managerClubId: string,
  year: number,
  seed: number,
  /** Recently-retired stars who may step into the dugout (§ Legends, #52). */
  legendPool: ManagerCandidate[] = [],
): ManagerChurnResult {
  const rng = new Rng((seed ^ (year * 0x9e3779b1) ^ 0x5aca55) >>> 0);
  const managers: Record<string, AiManager> = { ...(stored ?? {}) };
  const news: NewsItem[] = [];
  const get = (clubId: string) => managers[clubId] ?? aiManagerOf(clubId, clubs[clubId], seed, managers);
  const legends = [...legendPool];

  for (const rows of Object.values(finalStandings)) {
    if (rows.length < 6) continue;
    // Glory: the champion's manager grows.
    const champId = rows[0].clubId;
    if (champId !== managerClubId) {
      const m = get(champId);
      managers[champId] = { ...m, reputation: clamp(m.reputation + 4, 20, 96), titles: m.titles + 1 };
    }
    // The chop: bottom three risk a sacking.
    for (const row of rows.slice(-3)) {
      if (row.clubId === managerClubId) continue;
      if (!rng.chance(0.45)) continue;
      const old = get(row.clubId);
      const club = clubs[row.clubId];
      // A recent legend sometimes steps in — a marquee appointment carrying the
      // stature (and expectation) of his playing days.
      const legendIdx = legends.length > 0 && rng.chance(0.4) ? rng.int(0, legends.length - 1) : -1;
      const legend = legendIdx >= 0 ? legends.splice(legendIdx, 1)[0] : null;
      const next: AiManager = legend
        ? { name: legend.name, reputation: clamp(Math.round(legend.peakOvr * 0.75) + rng.int(-4, 8), 30, 90), appointedYear: year, titles: 0, formerPlayer: true }
        : { name: `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`, reputation: clamp((club?.reputation ?? 50) + rng.int(-10, 4), 18, 88), appointedYear: year, titles: 0 };
      managers[row.clubId] = next;
      if (club) {
        news.push({
          id: `news_mgrsack_${row.clubId}_${year}`, day: 0, category: 'BOARD',
          title: legend ? `${club.shortName} appoint ${next.name}` : `${club.shortName} sack ${old.name}`,
          body: legend
            ? `${club.name} turn to the dugout newcomer ${next.name} — a decorated former player stepping into management for the first time.`
            : `A ${row.points}-point season costs ${old.name} his job. ${next.name} takes over at ${club.name}.`,
          read: false,
        });
      }
    }
  }
  return { managers, news };
}

// --- The human manager's tactical identity ----------------------------------

/** Win-counter keys: tactic codes plus 'wins' / 'matches'. */
export type StyleCounters = Record<string, number>;

export function recordStyleResult(
  counters: StyleCounters | undefined,
  tactics: { defensive?: string; offensive?: string } | undefined,
  won: boolean,
): StyleCounters {
  const c: StyleCounters = { ...(counters ?? {}) };
  c.matches = (c.matches ?? 0) + 1;
  if (won) {
    c.wins = (c.wins ?? 0) + 1;
    const def = tactics?.defensive ?? 'BALANCED';
    const off = tactics?.offensive ?? 'POSSESSION';
    c[def] = (c[def] ?? 0) + 1;
    c[off] = (c[off] ?? 0) + 1;
  }
  return c;
}

const STYLE_TAGS: { key: string; tag: string }[] = [
  { key: 'COUNTER', tag: 'Counter-attacking specialist' },
  { key: 'POSSESSION', tag: 'Possession purist' },
  { key: 'DIRECT', tag: 'Direct-football pragmatist' },
  { key: 'PRESSING', tag: 'High-press disciple' },
  { key: 'DEEP', tag: 'Defensive organiser' },
];

/** Style tags earned once a body of work exists (≥20 wins, ≥45% share). */
export function styleTags(counters: StyleCounters | undefined): string[] {
  const wins = counters?.wins ?? 0;
  if (!counters || wins < 20) return [];
  return STYLE_TAGS.filter(({ key }) => (counters[key] ?? 0) / wins >= 0.45).map(({ tag }) => tag);
}
