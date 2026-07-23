// ---------------------------------------------------------------------------
// Match commentary (§ Match presentation). Turns the terse event descriptions
// the batch sim emits ("Goal", "Yellow card") into varied, readable lines for
// the match timeline. Pure & deterministic: the variant is chosen from the match
// seed + the event, so a given match always reads the same and re-reads the same
// on reload. Display-only — no gameplay effect.
// ---------------------------------------------------------------------------

import type { MatchEvent } from '../types/match';
import { hashSeed } from '../engine/rng';

const GOAL = [
  'buries it!', 'makes no mistake — goal!', 'fires it into the net!', 'slots it home!',
  'finishes coolly!', 'smashes it in!', 'tucks it away!', 'leaves the keeper no chance!',
];
const BIG_CHANCE = [
  'spurns a golden chance!', 'really should have scored!', 'drags it just wide!',
  'blazes it over!', 'is denied at the last!', 'sees it come back off the post!',
];
const SAVE = [
  'is denied by a fine save!', 'the keeper stands tall!', 'a brilliant stop!',
  'well kept out!', 'thwarted by the goalkeeper!',
];
const YELLOW = [
  'goes into the book.', 'is booked for the challenge.', 'is shown a yellow card.',
  'is cautioned by the referee.',
];
const RED = [
  'is sent off — down to ten!', 'is shown a second yellow, and he\'s off!',
  'gets his marching orders!', 'sees red — a huge blow!',
];

function pick(list: string[], seed: number, e: MatchEvent): string {
  const i = Math.abs(hashSeed(`${seed}_${e.minute}_${e.type}_${e.playerId ?? ''}`)) % list.length;
  return list[i];
}

/** A varied commentary line for one event (the descriptive part after the name).
 *  Returns null for events the timeline renders specially (GOAL/SUB). */
export function commentaryLine(e: MatchEvent, seed: number): string | null {
  switch (e.type) {
    case 'BIG_CHANCE': return pick(BIG_CHANCE, seed, e);
    case 'SAVE': return pick(SAVE, seed, e);
    case 'YELLOW': return pick(YELLOW, seed, e);
    case 'RED': return pick(RED, seed, e);
    default: return e.description || null;
  }
}

/** A flourish appended after a goalscorer's name, e.g. "— slots it home!". */
export function goalFlourish(e: MatchEvent, seed: number): string {
  return pick(GOAL, seed, e);
}
