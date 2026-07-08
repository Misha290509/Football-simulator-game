// ---------------------------------------------------------------------------
// Story arcs (§ Drama). Multi-step narratives that persist across matchdays and
// seasons, layered on top of the one-shot streak narratives in narratives.ts:
//
//   • Wonderkid watch — the academy's brightest prospect gets press hype, a
//     mid-arc progress check, and eventually a resolution: legend or flame-out.
//   • Nemesis manager — lose repeatedly to the same AI manager and he becomes
//     a storyline, complete with smug quotes, until you finally beat him.
//   • Transfer saga — a player who hands in a transfer request becomes a
//     rolling story through the window, not a single news item.
//   • Objective memory — the media remember what the board asked for in
//     August and bring it up at the season's midpoint and run-in.
//
// Pure and deterministic: quote/variant selection hashes stable ids — it never
// consumes from the sim's RNG stream.
// ---------------------------------------------------------------------------

import type { Player } from '../types/player';
import type { NewsItem, SaveGame } from '../types/league';
import type { BoardState } from '../types/staff';
import { hashSeed } from '../engine/rng';

export interface NemesisRecord {
  name: string;
  losses: number;
  wins: number;
  isNemesis: boolean;
}

export interface StorylineState {
  wonderkid?: {
    playerId: string;
    name: string;
    startYear: number;
    startOvr: number;
    stage: 'HYPE' | 'RISING' | 'DONE';
    lastNewsYear: number;
  };
  /** Keyed by opposing manager name (stable per club+seed). */
  nemesis: Record<string, NemesisRecord>;
  /** Rolling transfer sagas keyed by playerId. */
  saga: Record<string, { stage: number; lastDay: number; name: string }>;
  /** Year the mid-season objective reminder fired (once per season). */
  remindedMidYear?: number;
  /** Year the run-in reminder fired (once per season). */
  remindedRunInYear?: number;
}

export const emptyStorylines = (): StorylineState => ({ nemesis: {}, saga: {} });

let _seq = 0;
const mk = (day: number, category: NewsItem['category'], title: string, body: string): NewsItem => ({
  id: `news_arc_${day}_${_seq++}`, day, category, title, body, read: false,
});

const pick = <T>(arr: T[], key: string): T => arr[hashSeed(key) % arr.length];

// --- Wonderkid watch ---------------------------------------------------------

const HYPE_LINES = [
  'Coaches say he is the best they have seen at that age.',
  'Agents are already circling — the club insists he is untouchable.',
  'Youth-team crowds have doubled since word got out.',
];

/**
 * Maintain the wonderkid arc for the manager's club. Adopts the most exciting
 * eligible youngster (potential ≥ 86, age ≤ 18) when no arc is running, posts a
 * hype piece, then one progress check per season, and resolves when he breaks
 * through (OVR ≥ 84) or stalls (potential collapses / turns 23 unfulfilled).
 */
export function advanceWonderkid(
  state: StorylineState,
  players: Record<string, Player>,
  candidateIds: string[],
  year: number,
  day: number,
): NewsItem[] {
  const news: NewsItem[] = [];
  const arc = state.wonderkid;

  if (!arc || arc.stage === 'DONE') {
    // Adopt a new prodigy (skip anyone we already covered).
    const doneId = arc?.playerId;
    const next = candidateIds
      .map((id) => players[id])
      .filter((p): p is Player => !!p && p.id !== doneId && p.potential >= 86 && year - p.born.year <= 18)
      .sort((a, b) => b.potential - a.potential)[0];
    if (next) {
      const name = `${next.name.first} ${next.name.last}`;
      state.wonderkid = { playerId: next.id, name, startYear: year, startOvr: next.overall, stage: 'HYPE', lastNewsYear: year };
      news.push(mk(day, 'MILESTONE', `The next big thing: ${name}`,
        `The press have crowned your ${next.position} (${year - next.born.year}) the country's brightest prospect. ${pick(HYPE_LINES, next.id)} Hype is not a guarantee — bring him through carefully.`));
    }
    return news;
  }

  const p = players[arc.playerId];
  if (!p) { state.wonderkid = { ...arc, stage: 'DONE' }; return news; }
  const age = year - p.born.year;

  // Resolution: breakthrough…
  if (p.overall >= 84) {
    state.wonderkid = { ...arc, stage: 'DONE' };
    news.push(mk(day, 'MILESTONE', `${arc.name} has arrived`,
      `Three words once whispered in the academy are now sung from the stands. From ${arc.startOvr} OVR to ${p.overall} — the wonderkid is a wonderkid no more. He is simply one of the best.`));
    return news;
  }
  // …or flame-out.
  if (p.potential < 82 || (age >= 23 && p.overall < 78)) {
    state.wonderkid = { ...arc, stage: 'DONE' };
    news.push(mk(day, 'MILESTONE', `Whatever happened to ${arc.name}?`,
      `A long read on the prospect the press anointed in ${arc.startYear} — and the weight of a label no teenager chooses. The hype has moved on. Perhaps now, so can he.`));
    return news;
  }
  // One progress check per season while the arc runs.
  if (arc.lastNewsYear < year) {
    state.wonderkid = { ...arc, stage: 'RISING', lastNewsYear: year };
    const grew = p.overall - arc.startOvr;
    news.push(mk(day, 'MILESTONE', `Wonderkid watch: ${arc.name}`,
      grew >= 6
        ? `${p.overall} OVR and climbing — the hype is starting to look conservative.`
        : `Progress has been steady rather than spectacular (${arc.startOvr} → ${p.overall}). The clock only matters if he stops.`));
  }
  return news;
}

// --- Nemesis manager ----------------------------------------------------------

const SMUG_QUOTES = [
  '“I always enjoy our meetings,” he smiled afterwards.',
  '“Some fixtures you just circle in the calendar,” he told reporters, not naming you. He didn\'t have to.',
  '“Tactically it went exactly as we planned. Again.”',
  '“Send my regards to their dressing room. They fought well.”',
];
const REDEMPTION_LINES = [
  'No quotes from the other dugout tonight.',
  'He left without speaking to the press. You didn\'t need to say anything either.',
];

/** Record a competitive result against a named AI manager; emit arc news. */
export function advanceNemesis(
  state: StorylineState,
  oppManagerName: string,
  won: boolean,
  drew: boolean,
  day: number,
): NewsItem[] {
  const news: NewsItem[] = [];
  if (!oppManagerName || drew) return news;
  const rec = state.nemesis[oppManagerName] ?? { name: oppManagerName, losses: 0, wins: 0, isNemesis: false };

  if (!won) {
    rec.losses += 1;
    if (!rec.isNemesis && rec.losses >= 3) {
      rec.isNemesis = true;
      news.push(mk(day, 'RESULT', `${oppManagerName} has your number`,
        `That is ${rec.losses} defeats to the same man. ${pick(SMUG_QUOTES, oppManagerName + rec.losses)} The papers have started calling him your nemesis.`));
    } else if (rec.isNemesis) {
      news.push(mk(day, 'RESULT', `${oppManagerName} again`,
        `${rec.losses} losses now. ${pick(SMUG_QUOTES, oppManagerName + rec.losses)}`));
    }
  } else {
    rec.wins += 1;
    if (rec.isNemesis) {
      rec.isNemesis = false;
      news.push(mk(day, 'RESULT', `The curse is broken`,
        `After ${rec.losses} defeats, you finally got ${oppManagerName}. ${pick(REDEMPTION_LINES, oppManagerName + rec.wins)}`));
    }
  }
  state.nemesis[oppManagerName] = rec;
  return news;
}

// --- Transfer saga -------------------------------------------------------------

const SAGA_BEATS = [
  (n: string) => [`${n} saga rumbles on`, `His agent was photographed at the airport. No comment from the player's camp — which, of course, is a comment.`] as const,
  (n: string) => [`Sources: ${n} “determined” to move`, `Friends of the player say his head has been turned. Your dressing room is watching how you handle this.`] as const,
  (n: string) => [`${n}: deadline looms`, `The window is ticking down and the stand-off continues. Someone has to blink.`] as const,
];

/**
 * Advance rolling transfer sagas: players at the manager's club with an open
 * transfer request get a story beat roughly every 15 days while unresolved, and
 * a closing piece when the request disappears (sold, or fences mended).
 */
export function advanceSagas(
  state: StorylineState,
  players: Record<string, Player>,
  managerClubId: string,
  day: number,
): NewsItem[] {
  const news: NewsItem[] = [];

  // Open/continue sagas for current requesters.
  for (const p of Object.values(players)) {
    if (p.contract.clubId !== managerClubId || !p.transferRequested) continue;
    const name = `${p.name.first} ${p.name.last}`;
    const s = state.saga[p.id];
    if (!s) {
      state.saga[p.id] = { stage: 0, lastDay: day, name };
      continue; // the request itself was already newsed when it happened
    }
    if (day - s.lastDay >= 15 && s.stage < SAGA_BEATS.length) {
      const [title, body] = SAGA_BEATS[s.stage](name);
      news.push(mk(day, 'TRANSFER', title, body));
      state.saga[p.id] = { ...s, stage: s.stage + 1, lastDay: day };
    }
  }

  // Close sagas whose request is gone.
  for (const [pid, s] of Object.entries(state.saga)) {
    const p = players[pid];
    const stillOpen = p && p.contract.clubId === managerClubId && p.transferRequested;
    if (stillOpen) continue;
    if (p && p.contract.clubId === managerClubId) {
      news.push(mk(day, 'TRANSFER', `${s.name} saga ends — he stays`,
        'The request is withdrawn. Whether the fences are mended or merely painted over, only the next team-talk will tell.'));
    } else {
      news.push(mk(day, 'TRANSFER', `${s.name} saga ends`,
        'The long goodbye is over. The dressing room can finally talk about something else.'));
    }
    delete state.saga[pid];
  }
  return news;
}

// --- Objective memory ------------------------------------------------------------

/**
 * The media remember the board's August target. Fires at most twice a season:
 * once around the midpoint if the club is well short, once in the run-in if
 * the target is within reach.
 */
export function advanceObjectiveMemory(
  state: StorylineState,
  board: BoardState | undefined,
  position: number,
  day: number,
  maxDay: number,
  year: number,
): NewsItem[] {
  const news: NewsItem[] = [];
  if (!board || position <= 0 || maxDay <= 0) return news;
  const frac = day / maxDay;

  if (frac >= 0.45 && frac <= 0.62 && state.remindedMidYear !== year && position - board.targetPosition >= 4) {
    state.remindedMidYear = year;
    news.push(mk(day, 'BOARD', 'Remember the target?',
      `In August the board asked for ${board.targetPosition}${ord(board.targetPosition)}. At the halfway mark you sit ${position}${ord(position)}. Nobody upstairs has said anything yet. That is not the same as nobody noticing.`));
  }
  if (frac >= 0.82 && state.remindedRunInYear !== year && Math.abs(position - board.targetPosition) <= 2) {
    state.remindedRunInYear = year;
    news.push(mk(day, 'BOARD', 'The run-in',
      `${board.targetPosition}${ord(board.targetPosition)} was the ask; ${position}${ord(position)} is where you stand with the finish line in sight. Every point is a season now.`));
  }
  return news;
}

const ord = (n: number): string => {
  const v = n % 100;
  if (v >= 11 && v <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][Math.min(n % 10, 4) % 4] ?? 'th';
};

/** Read the state off a save, always working on a fresh copy. */
export function storylinesOf(meta: Pick<SaveGame, 'storylines'>): StorylineState {
  const s = meta.storylines;
  return s ? { ...s, nemesis: { ...s.nemesis }, saga: { ...s.saga } } : emptyStorylines();
}
