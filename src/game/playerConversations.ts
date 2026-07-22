// ---------------------------------------------------------------------------
// Player Career — manager conversations & promises (Tier 2 · Step 3). Pure &
// deterministic, lightweight pick-a-line dialogs surfaced through the feed. Each
// choice moves trust / morale / relationship, and some lock a promise the
// manager must honour by a deadline — a broken promise bites.
// ---------------------------------------------------------------------------

import type { Player } from '../types/player';
import type { NewsItem } from '../types/league';
import type { PlayerCareer, Conversation, CareerPromise, SquadStatus } from '../types/playerCareer';
import { clamp } from '../engine/rng';

const PROMISE_WINDOW_DAYS = 130;
let _seq = 0;
const feed = (day: number, category: NewsItem['category'], title: string, body: string): NewsItem =>
  ({ id: `news_pc_talk_${day}_${_seq++}`, day, category, title, body, read: false });

const promiseText = (k: CareerPromise['kind']): string =>
  k === 'PLAYING_TIME' ? 'play you regularly' :
  k === 'NATURAL_POSITION' ? 'play you in your natural position' :
  k === 'CAPTAINCY' ? 'give you the armband' : 'open contract talks';

// --- Conversation generators ------------------------------------------------

/** Pre-season sit-down about the coming campaign. */
export function roleMeetingConversation(day: number): Conversation {
  return {
    id: `conv_role_${day}`,
    trigger: 'PRESEASON',
    prompt: 'The manager calls you in for a pre-season chat about your role. What do you tell him?',
    choices: [
      { text: 'I’ll do whatever the team needs.', trust: 2, morale: 1, relationship: 3 },
      { text: 'I want to be a regular starter this season.', trust: -1, morale: 3, promise: 'PLAYING_TIME' },
      { text: 'I want to play in my best position.', relationship: 1, promise: 'NATURAL_POSITION' },
    ],
  };
}

/** After being dropped down the pecking order. */
export function postDropConversation(status: SquadStatus, day: number): Conversation {
  return {
    id: `conv_drop_${day}`,
    trigger: 'DROPPED',
    prompt: `You’ve slipped to the ${status.toLowerCase()} of the squad. How do you respond?`,
    choices: [
      { text: 'Knuckle down and prove him wrong.', trust: 3, morale: -1 },
      { text: 'Ask what you need to do to get back in.', trust: 1, morale: 1, relationship: 2 },
      { text: 'Tell him you deserve better.', trust: -3, morale: 2, relationship: -4 },
    ],
  };
}

// --- Resolution -------------------------------------------------------------

export interface TalkResult { career: PlayerCareer; news: NewsItem[]; moraleDelta: number }

/** Apply the chosen line: move trust/relationship on the career, return the
 *  morale delta for the avatar, and lock any promise the choice carried. */
export function resolveConversation(career: PlayerCareer, conv: Conversation, choiceIdx: number, day: number): TalkResult {
  const c = conv.choices[choiceIdx];
  if (!c) return { career, news: [], moraleDelta: 0 };
  let next: PlayerCareer = {
    ...career,
    managerTrust: clamp((career.managerTrust ?? 50) + (c.trust ?? 0), 0, 100) as number,
    clubRelationship: clamp((career.clubRelationship ?? 50) + (c.relationship ?? 0), 0, 100) as number,
    pendingConversations: (career.pendingConversations ?? []).filter((x) => x.id !== conv.id),
  };
  const news: NewsItem[] = [];
  if (c.promise) {
    const promise: CareerPromise = { text: `The manager promised to ${promiseText(c.promise)}.`, kind: c.promise, deadline: day + PROMISE_WINDOW_DAYS };
    next = { ...next, promises: [...(next.promises ?? []), promise] };
    news.push(feed(day, 'BOARD', 'The manager made you a promise', promise.text));
  }
  return { career: next, news, moraleDelta: c.morale ?? 0 };
}

// --- Player-initiated meeting ------------------------------------------------

/** The avatar asks for more minutes. Trust + form decide how it lands. */
export function requestMinutesOutcome(career: PlayerCareer, avatar: Player, day: number): TalkResult {
  const favour = (career.managerTrust ?? 50) + avatar.form * 0.2;
  if (favour >= 58) {
    const promise: CareerPromise = { text: 'The manager promised to play you regularly.', kind: 'PLAYING_TIME', deadline: day + PROMISE_WINDOW_DAYS };
    return {
      career: { ...career, clubRelationship: clamp((career.clubRelationship ?? 50) + 3, 0, 100) as number, promises: [...(career.promises ?? []), promise] },
      news: [feed(day, 'BOARD', 'The manager likes what he sees', promise.text)],
      moraleDelta: 4,
    };
  }
  return {
    career: { ...career, managerTrust: clamp((career.managerTrust ?? 50) - 1, 0, 100) as number, clubRelationship: clamp((career.clubRelationship ?? 50) - 2, 0, 100) as number },
    news: [feed(day, 'BOARD', 'The manager isn’t convinced', `“Earn it on the pitch.” You’ll need to force your way in.`)],
    moraleDelta: -3,
  };
}

// --- Promise evaluation ------------------------------------------------------

/** Evaluate any promises now past their deadline against reality. Kept ones
 *  reassure; broken ones sting morale + relationship and set up a Tier-4 move. */
export function evaluatePromises(career: PlayerCareer, avatar: Player, day: number): TalkResult {
  const promises = career.promises ?? [];
  if (promises.length === 0) return { career, news: [], moraleDelta: 0 };

  const still: CareerPromise[] = [];
  const news: NewsItem[] = [];
  let moraleDelta = 0;
  let relationship = career.clubRelationship ?? 50;
  const name = `${avatar.name.first} ${avatar.name.last}`;

  for (const pr of promises) {
    if (day < pr.deadline) { still.push(pr); continue; }
    let kept = false;
    if (pr.kind === 'PLAYING_TIME') kept = career.seasonApps >= 8;
    else if (pr.kind === 'NATURAL_POSITION') kept = career.seasonApps >= 5;
    else kept = true; // captaincy/new-deal handled elsewhere
    if (kept) {
      moraleDelta += 2; relationship = clamp(relationship + 2, 0, 100);
      news.push(feed(day, 'BOARD', 'Promise kept', `The manager was good to his word — ${name} is happy with how it’s gone.`));
    } else {
      moraleDelta -= 8; relationship = clamp(relationship - 12, 0, 100);
      news.push(feed(day, 'BOARD', 'Promise broken', `The manager went back on his word to ${name}. The relationship has soured.`));
    }
  }
  return { career: { ...career, promises: still, clubRelationship: relationship }, news, moraleDelta };
}
