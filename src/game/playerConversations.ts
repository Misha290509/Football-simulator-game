// ---------------------------------------------------------------------------
// Player Career — manager conversations & promises (Tier 2 · Step 3). Pure &
// deterministic, lightweight pick-a-line dialogs surfaced through the feed. Each
// choice moves trust / morale / relationship, and some lock a promise the
// manager must honour by a deadline — a broken promise bites.
// ---------------------------------------------------------------------------

import type { Player } from '../types/player';
import type { NewsItem } from '../types/league';
import type { PlayerCareer, Conversation, CareerPromise, SquadStatus } from '../types/playerCareer';
import { clamp, Rng, hashSeed } from '../engine/rng';

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

/** After a promotion / strong run — the manager praises the avatar. */
export function praiseConversation(day: number): Conversation {
  return {
    id: `conv_praise_${day}`,
    trigger: 'PRAISE',
    prompt: 'The manager pulls you aside to say he’s been impressed lately. What do you say?',
    choices: [
      { text: 'Thank him and keep the head down.', trust: 2, morale: 2, relationship: 2 },
      { text: 'Push for a bigger role now.', morale: 2, promise: 'PLAYING_TIME' },
      { text: 'Say it’s time to talk about a new deal.', relationship: 1, promise: 'NEW_DEAL' },
    ],
  };
}

/** A sit-down after a poor run or a disciplinary flashpoint. */
export function warningConversation(day: number): Conversation {
  return {
    id: `conv_warn_${day}`,
    trigger: 'WARNING',
    prompt: 'The manager isn’t happy with your recent form and attitude. How do you take it?',
    choices: [
      { text: 'Own it — “I’ll put it right.”', trust: 3, morale: -1 },
      { text: 'Point to the service you’re getting.', trust: -2, morale: 1, relationship: -2 },
      { text: 'Bite back — “play me in my position.”', trust: -3, morale: 2, relationship: -3, promise: 'NATURAL_POSITION' },
    ],
  };
}

/** The manager offers the armband. */
export function captaincyConversation(day: number): Conversation {
  return {
    id: `conv_captain_${day}`,
    trigger: 'CAPTAINCY',
    prompt: 'The manager wants to make you captain. Do you take the armband?',
    choices: [
      { text: 'Lead from the front — it’d be an honour.', trust: 4, morale: 4, relationship: 4, promise: 'CAPTAINCY' },
      { text: 'Not yet — let a senior head keep it.', trust: -1, morale: -1, relationship: 1 },
    ],
  };
}

/** Contract talks the avatar can open when he’s wanted. */
export function contractTalkConversation(day: number): Conversation {
  return {
    id: `conv_deal_${day}`,
    trigger: 'CONTRACT',
    prompt: 'The manager asks about your future at the club. What’s your line?',
    choices: [
      { text: 'I’m happy here — let’s talk terms.', trust: 2, relationship: 3, promise: 'NEW_DEAL' },
      { text: 'I want to see the club’s ambition first.', relationship: -1, morale: 1 },
      { text: 'I’m keeping my options open.', trust: -2, relationship: -3, morale: 2 },
    ],
  };
}

/** The press corner the avatar when his rival takes the shirt and talks it up.
 *  How he answers shapes his public image and the rivalry itself. */
export function rivalJabConversation(rivalLast: string, day: number): Conversation {
  return {
    id: `conv_rivaljab_${day}`,
    trigger: 'RIVAL_PRESS',
    prompt: `${rivalLast} has the shirt and made sure the press knew it. A reporter turns to you: your response?`,
    choices: [
      { text: 'Fire back — “I’ll take his shirt, and his quotes with it.”', following: 4000, fanRating: 1, rivalRelationship: -12, morale: 2 },
      { text: 'Stay classy — “He’s a top player. I’ll keep working.”', fanRating: 3, rivalRelationship: 8, morale: 0 },
      { text: 'Let my football talk — say nothing, smile, walk on.', confidence: 4, trust: 2, morale: 1 },
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
  // Public-image / peer ripples (press & rival flashpoints).
  if (c.fanRating != null) next = { ...next, fanRating: clamp((next.fanRating ?? 50) + c.fanRating, 0, 100) as number };
  if (c.following != null) next = { ...next, following: Math.max(0, (next.following ?? 0) + c.following) };
  if (c.confidence != null) next = { ...next, confidence: clamp((next.confidence ?? 60) + c.confidence, 0, 100) as number };
  if (c.rivalRelationship != null && next.rival) next = { ...next, rival: { ...next.rival, relationship: clamp((next.rival.relationship ?? 0) + c.rivalRelationship, -100, 100) as number } };
  const news: NewsItem[] = [];
  if (c.promise) {
    const promise: CareerPromise = { text: `The manager promised to ${promiseText(c.promise)}.`, kind: c.promise, deadline: day + PROMISE_WINDOW_DAYS };
    next = { ...next, promises: [...(next.promises ?? []), promise] };
    news.push(feed(day, 'BOARD', 'The manager made you a promise', promise.text));
  }
  return { career: next, news, moraleDelta: c.morale ?? 0 };
}

/**
 * Occasionally surface a state-driven conversation (praise on a hot run, a
 * warning on a cold one, contract talks when he's wanted). Event-driven and
 * low-frequency: at most one, and only when nothing else is pending. Pure &
 * deterministic under the seed + day.
 */
export function maybeSurfaceConversation(
  career: PlayerCareer, avatar: Player, year: number, day: number, seed: number,
): Conversation | null {
  if ((career.pendingConversations ?? []).length > 0) return null;
  const rng = new Rng((seed ^ hashSeed(`conv_${day}`)) >>> 0);
  const age = year - avatar.born.year;
  const trust = career.managerTrust ?? 50;
  const rr = career.recentRatings ?? [];
  const avg = rr.length ? rr.reduce((a, b) => a + b, 0) / rr.length : 6.7;

  // Contract talks: within the last two years of the deal and wanted.
  if (avatar.contract.expiresYear - year <= 2 && trust >= 55 && rng.chance(0.16)) return contractTalkConversation(day);
  // Praise: a genuinely hot streak.
  if (rr.length >= 3 && avg >= 7.4 && rng.chance(0.35)) return praiseConversation(day);
  // Warning: a cold streak while still playing.
  if (rr.length >= 3 && avg <= 6.0 && career.seasonApps >= 4 && rng.chance(0.3)) return warningConversation(day);
  void age;
  return null;
}

// --- Player-initiated meeting ------------------------------------------------

export type MeetingTopic = 'MINUTES' | 'ROLE' | 'NEW_DEAL';

/** A player-initiated sit-down on a chosen topic. Trust + form decide how it
 *  lands; a warm reception can lock a promise the manager must then honour. */
export function requestMeetingOutcome(career: PlayerCareer, avatar: Player, topic: MeetingTopic, day: number): TalkResult {
  if (topic === 'MINUTES') return requestMinutesOutcome(career, avatar, day);
  const trust = career.managerTrust ?? 50;
  if (topic === 'NEW_DEAL') {
    if (trust >= 60) {
      const promise: CareerPromise = { text: 'The manager agreed to open contract talks.', kind: 'NEW_DEAL', deadline: day + PROMISE_WINDOW_DAYS };
      return {
        career: { ...career, clubRelationship: clamp((career.clubRelationship ?? 50) + 3, 0, 100) as number, promises: [...(career.promises ?? []), promise] },
        news: [feed(day, 'BOARD', 'The club want to keep you', promise.text)],
        moraleDelta: 4,
      };
    }
    return {
      career: { ...career, clubRelationship: clamp((career.clubRelationship ?? 50) - 1, 0, 100) as number },
      news: [feed(day, 'BOARD', 'Not yet', `“Show me more and we'll talk about a new deal.” The club aren't ready to commit.`)],
      moraleDelta: -2,
    };
  }
  // ROLE — honest feedback pinned to where he stands, no promise.
  const good = trust >= 55;
  return {
    career: { ...career, clubRelationship: clamp((career.clubRelationship ?? 50) + (good ? 2 : -1), 0, 100) as number },
    news: [feed(day, 'BOARD', 'A frank chat about your role', good
      ? `“You're important to how we play — keep it up and the minutes will come.”`
      : `“Right now you're a squad option. It's on you to change my mind on the pitch.”`)],
    moraleDelta: good ? 2 : -1,
  };
}

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
      const soured = relationship < 35;
      news.push(feed(day, 'BOARD', 'Promise broken', `The manager went back on his word to ${name}. The relationship has soured${soured ? ' — it may be time to consider your future here.' : '.'}`));
    }
  }
  return { career: { ...career, promises: still, clubRelationship: relationship }, news, moraleDelta };
}
