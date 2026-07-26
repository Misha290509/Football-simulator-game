// ---------------------------------------------------------------------------
// Player Career — progression (Tier 2 · Steps 2, 4, 5, 6, 7). Pure &
// deterministic. Layered on top of the objectives/trust matchday loop, this
// derives squad status, maintains the positional rival, surfaces earned traits
// and drifts personality, runs injury/sharpness/confidence adversity, and fires
// the first international call-up. Reuses the existing attribute-derived trait
// system (traitsOf) and morale/form/fitness/injury fields — nothing forked.
// ---------------------------------------------------------------------------

import type { Player, PlayerTrainingFocus } from '../types/player';
import type { Club } from '../types/club';
import type { NewsItem } from '../types/league';
import { POSITION_GROUP } from '../types/attributes';
import type { PlayerCareer, SquadStatus, StatusChange, ManagerStyle } from '../types/playerCareer';
import { clamp, Rng, hashSeed } from '../engine/rng';
import { traitsOf, TRAIT_LABEL, type PlayerTrait } from '../engine/traits';

let _seq = 0;
const feed = (day: number, category: NewsItem['category'], title: string, body: string): NewsItem =>
  ({ id: `news_pc_prog_${day}_${_seq++}`, day, category, title, body, read: false });

const nameOf = (p: Player) => `${p.name.first} ${p.name.last}`;

// --- Squad-status ladder (Step 2) -------------------------------------------

const STATUS_ORDER: SquadStatus[] = ['YOUTH', 'PROSPECT', 'ROTATION', 'KEY', 'STAR', 'CAPTAIN'];
const rank = (s: SquadStatus) => STATUS_ORDER.indexOf(s);
/** Ordinal of a squad status (0 = YOUTH … 5 = CAPTAIN). */
export const statusRank = (s: SquadStatus): number => STATUS_ORDER.indexOf(s);

/** Derive the avatar's standing from trust + appearances + ability + form. */
export function deriveSquadStatus(career: PlayerCareer, avatar: Player, year: number): SquadStatus {
  const age = year - avatar.born.year;
  const totalApps = (career.seasonHistory?.reduce((n, s) => n + s.apps, 0) ?? 0) + career.seasonApps;
  const trust = clamp(career.managerTrust, 0, 100);
  const score = trust * 0.55 + Math.min(totalApps, 80) * 0.5 + (avatar.overall - 58) * 0.9 + (career.seasonAvgRating - 6.5) * 6;
  const isLeader = traitsOf(avatar).includes('LEADER');
  if (score >= 108 && isLeader && age >= 27 && (career.clubRelationship ?? 50) >= 70) return 'CAPTAIN';
  if (score >= 96) return 'STAR';
  if (score >= 72) return 'KEY';
  if (score >= 46) return 'ROTATION';
  if (score >= 24 || (age <= 20 && avatar.potential >= 78)) return 'PROSPECT';
  return 'YOUTH';
}

function statusNews(day: number, from: SquadStatus, to: SquadStatus, avatar: Player): NewsItem {
  const up = rank(to) > rank(from);
  if (to === 'CAPTAIN') return feed(day, 'MILESTONE', 'Handed the armband', `The manager has made ${nameOf(avatar)} club captain.`);
  if (up) return feed(day, 'MILESTONE', `Promoted to ${label(to)}`, `“You've forced your way into my plans.” ${nameOf(avatar)} steps up to ${label(to).toLowerCase()}.`);
  return feed(day, 'GENERAL', `Dropped to ${label(to)}`, `“You've slipped to the fringes — force your way back.” ${nameOf(avatar)} falls to ${label(to).toLowerCase()}.`);
}
const label = (s: SquadStatus) => s.charAt(0) + s.slice(1).toLowerCase();

/** Recompute status; on a change, record the arc and fire a manager reaction. */
export function updateStatus(career: PlayerCareer, avatar: Player, year: number, day: number): { career: PlayerCareer; news: NewsItem[] } {
  const to = deriveSquadStatus(career, avatar, year);
  if (to === career.status) return { career, news: [] };
  const change: StatusChange = { day, from: career.status, to, reason: 'form & standing' };
  return {
    career: { ...career, status: to, statusHistory: [...(career.statusHistory ?? []), change] },
    news: [statusNews(day, career.status, to, avatar)],
  };
}

// --- Positional rival (Step 4) ----------------------------------------------

/** Maintain the avatar's rival for the shirt, drift the relationship + head-to-
 *  head edge, and surface the beats that make the battle mean something: a new
 *  rival, the rival going down injured (your chance), and the rivalry turning
 *  bitter or into a mutual-respect thing. The specific rival feeds selection via
 *  `selectionMomentum` in playerCareer.ts — this is where he gets his teeth. */
const SHIRT_WON = [
  'The manager barely has a decision to make any more — the shirt is yours.',
  'You’ve won the head-to-head decisively; the pecking order isn’t close now.',
  'Week after week it’s been you. He knows it — and so does the manager.',
];
const RIVAL_JAB = [
  '“I’ve earned my spot,” he told reporters, with a glance you didn’t miss.',
  'He’s nailed down the shirt — and hasn’t been shy about letting everyone know.',
  'The manager’s made his call, and right now it isn’t you. Answer it on the pitch.',
];
const RIVAL_GONE = [
  'He’s been transferred out. The shirt is unarguably yours — until the next challenger arrives.',
  'Your great rival has left the club. Strange how quiet the dressing room feels without that edge.',
  'He got his move. The battle that defined these seasons is over — you won it by outlasting him.',
];
const pickQ = (arr: string[], key: string): string => arr[hashSeed(key) % arr.length];

export function updateRival(career: PlayerCareer, avatar: Player, squad: Player[], day: number): { career: PlayerCareer; news: NewsItem[] } {
  const grp = POSITION_GROUP[avatar.position];
  const samePos = squad.filter((p) => p.id !== avatar.id && p.position === avatar.position);
  const sameGrp = squad.filter((p) => p.id !== avatar.id && POSITION_GROUP[p.position] === grp);
  const pool = samePos.length ? samePos : sameGrp;
  const pick = [...pool].sort((a, b) => b.overall - a.overall)[0];
  if (!pick) return { career: { ...career, rival: null }, news: [] };

  const news: NewsItem[] = [];
  const prev = career.rival;
  const sameRival = prev?.playerId === pick.id;
  let relationship = sameRival ? prev!.relationship : 0;
  let edge = sameRival ? (prev!.edge ?? 0) : 0;
  const prevEdge = sameRival ? (prev!.edge ?? 0) : 0;
  const wasSidelined = sameRival ? !!prev!.sidelined : false;
  const prevGone = !!prev && !squad.some((p) => p.id === prev.playerId);

  // Head-to-head edge: out-forming your direct rival tips the pecking order your
  // way over time; being out-formed by him erodes it. Bounded.
  const formGap = avatar.form - pick.form;
  edge = clamp(edge + (formGap > 12 ? 1 : formGap < -12 ? -1 : 0), -8, 8);

  // The rivalry itself warms (mutual respect) or sours (bitter) with the battle.
  relationship = clamp(relationship + (avatar.form > 15 ? 2 : avatar.form < -15 ? -2 : 0) + (edge > 4 ? 1 : edge < -4 ? -1 : 0), -100, 100);

  const sidelined = !!pick.injury || (pick.cards?.suspendedFor ?? 0) > 0;

  // The old rival left the club — the shirt is (for now) unarguably yours.
  if (prevGone) news.push(feed(day, 'MILESTONE', 'Your rival has moved on', pickQ(RIVAL_GONE, `${prev!.playerId}:${day}`)));

  if (!sameRival) {
    if (prev) news.push(feed(day, 'GENERAL', 'A new rival for the shirt', `${nameOf(pick)} is now your main competition for the ${avatar.position} role.`));
  } else {
    // #4/#7 — the rival going down opens the door; announce it once.
    if (sidelined && !wasSidelined) {
      news.push(feed(day, 'GENERAL', 'Your chance', `${nameOf(pick)} is sidelined — the ${avatar.position} shirt is there for the taking. Force the manager's hand.`));
    } else if (!sidelined && wasSidelined) {
      news.push(feed(day, 'GENERAL', 'Your rival is back', `${nameOf(pick)} is fit again — the competition for the shirt is back on.`));
    }
    // A decisive turn in the head-to-head — the shirt battle is won or lost.
    if (edge >= 6 && prevEdge < 6) news.push(feed(day, 'MILESTONE', 'The shirt is yours', pickQ(SHIRT_WON, `${pick.id}:${day}`)));
    else if (edge <= -6 && prevEdge > -6) news.push(feed(day, 'GENERAL', `${pick.name.last} has the shirt`, pickQ(RIVAL_JAB, `${pick.id}:${day}`)));
    // #5 — the rivalry crosses into open enmity or grudging respect.
    if (relationship <= -60 && (prev!.relationship ?? 0) > -60) news.push(feed(day, 'GENERAL', 'No love lost', `Things have turned frosty between you and ${nameOf(pick)} — this is personal now.`));
    else if (relationship >= 60 && (prev!.relationship ?? 0) < 60) news.push(feed(day, 'GENERAL', 'Rivals and friends', `You and ${nameOf(pick)} push each other hard — but there's real respect there.`));
  }

  return { career: { ...career, rival: { playerId: pick.id, relationship, sidelined, edge } }, news };
}

// --- Manager style (Tier 2 depth) -------------------------------------------

const MANAGER_STYLES: ManagerStyle[] = ['LOYAL', 'RUTHLESS', 'ROTATOR', 'YOUTH_FOCUSED', 'BALANCED'];

/** A deterministic man-management style for a club's manager. Big clubs lean
 *  ruthless/rotator; smaller ones back their players (loyal) or blood youth. */
export function deriveManagerStyle(club: Club | undefined, seed: number): ManagerStyle {
  if (!club) return 'BALANCED';
  const r = new Rng((seed ^ hashSeed(`mstyle_${club.id}`)) >>> 0);
  const roll = r.next();
  if (club.reputation >= 80) return roll < 0.5 ? 'RUTHLESS' : 'ROTATOR';
  if (club.reputation <= 62) return roll < 0.5 ? 'LOYAL' : 'YOUTH_FOCUSED';
  return MANAGER_STYLES[r.int(0, MANAGER_STYLES.length - 1)];
}

export const MANAGER_STYLE_LABEL: Record<ManagerStyle, string> = {
  LOYAL: 'Loyal', RUTHLESS: 'Ruthless', ROTATOR: 'Rotator', YOUTH_FOCUSED: 'Youth-focused', BALANCED: 'Balanced',
};

// --- The training ground: coach, focus progress, breakthroughs (Steps 5b) ---

/** Map a position to the coach's default recommended training focus. */
function recommendFocus(avatar: Player): PlayerTrainingFocus {
  const g = POSITION_GROUP[avatar.position];
  if (avatar.position === 'GK') return 'GOALKEEPING';
  if (g === 'ATT') return 'SHOOTING';
  if (g === 'MID') return 'PASSING';
  if (g === 'DEF') return 'DEFENDING';
  return 'PHYSICAL';
}

/**
 * Fold one advance of training-ground life into the career: drift the coach
 * rapport, keep a recommended focus, fill a visible micro-progress meter toward
 * the next step, and — when it fills — fire a "breakthrough" beat that lifts
 * confidence (raw attributes still grow via the season development engine, so
 * this never double-counts). Pure feedback that makes the week matter.
 */
export function updateTrainingGround(career: PlayerCareer, avatar: Player, day: number): { career: PlayerCareer; news: NewsItem[] } {
  const news: NewsItem[] = [];
  const professional = (career.personality.professionalism ?? 55) >= 65;
  const coachRelationship = clamp((career.coachRelationship ?? 55) + (professional ? 0.8 : -0.2), 0, 100);
  const coachAdviceFocus = recommendFocus(avatar);
  const focus = avatar.training?.focus ?? null;

  let focusProgress = career.focusProgress ?? 0;
  let trainingReport: PlayerCareer['trainingReport'];
  const sharpNote = (career.matchSharpness ?? 100) < 80 ? 'Still shaking off the rust — sharpness is climbing back.' : undefined;

  if (focus) {
    const onAdvice = focus === coachAdviceFocus;
    const gain = 6 + Math.max(0, avatar.form) * 0.12 + (career.seasonApps > 0 ? 3 : 0) + (onAdvice ? 2 : 0);
    focusProgress = clamp(focusProgress + gain, 0, 100);
    trainingReport = { focus, note: `Poured your extra hours into ${focus.toLowerCase()}${onAdvice ? ' — just what the coach ordered.' : '.'}`, sharpnessNote: sharpNote };
    if (focusProgress >= 100) {
      focusProgress = 0;
      news.push(feed(day, 'MILESTONE', 'It clicked in training', `Something clicked for ${nameOf(avatar)} on the training pitch — a real step forward in ${focus.toLowerCase()}.`));
      return {
        career: { ...career, coachRelationship, coachAdviceFocus, focusProgress, trainingReport, confidence: clamp((career.confidence ?? 60) + 4, 0, 100) as number },
        news,
      };
    }
  } else {
    trainingReport = { note: 'No training focus set — pick one to sharpen a skill.', sharpnessNote: sharpNote };
  }
  return { career: { ...career, coachRelationship, coachAdviceFocus, focusProgress, trainingReport }, news };
}

// --- Traits & personality (Step 5) ------------------------------------------

/** Attribute-threshold progress toward the nearest not-yet-earned trait. */
function computeTraitProgress(avatar: Player, earned: string[]): Record<string, number> {
  const t = avatar.attributes.technical, m = avatar.attributes.mental, ph = avatar.attributes.physical;
  const cands: { id: PlayerTrait; pct: number }[] = [
    { id: 'CLINICAL', pct: (t.finishing / 86) * 100 },
    { id: 'PLAYMAKER', pct: (Math.min(m.vision / 84, t.shortPassing / 82)) * 100 },
    { id: 'DRIBBLER', pct: (Math.min(t.dribbling / 85, ph.agility / 80)) * 100 },
    { id: 'AERIAL_THREAT', pct: (Math.min(t.headingAccuracy / 84, ph.jumping / 80)) * 100 },
    { id: 'PACE_MERCHANT', pct: (Math.min(ph.sprintSpeed / 88, ph.acceleration / 86)) * 100 },
  ];
  const out: Record<string, number> = {};
  for (const c of cands) if (!earned.includes(c.id)) out[c.id] = Math.round(Math.min(99, c.pct));
  return out;
}

/** Detect newly-earned traits (attributes crossed a threshold) + refresh the
 *  progress panel. Personality drifts elsewhere (objectives/discipline/talks). */
export function updateTraits(career: PlayerCareer, avatar: Player, day: number): { career: PlayerCareer; news: NewsItem[] } {
  const current = traitsOf(avatar).map(String);
  const known = career.traits ?? [];
  const newly = current.filter((tr) => !known.includes(tr));
  const news = newly
    .filter((tr) => TRAIT_LABEL[tr as PlayerTrait])
    .map((tr) => feed(day, 'MILESTONE', `New trait: ${TRAIT_LABEL[tr as PlayerTrait]}`, `${nameOf(avatar)} has developed the “${TRAIT_LABEL[tr as PlayerTrait]}” trait.`));
  return {
    career: { ...career, traits: current, traitProgress: computeTraitProgress(avatar, current) },
    news,
  };
}

// --- Adversity: injuries, sharpness, confidence (Step 6) --------------------

export interface AdversityResult { career: PlayerCareer; news: NewsItem[]; formDelta: number }

/** Injury arcs + match sharpness + a confidence/slump dimension. Returns a
 *  small form nudge to apply to the avatar (reduced sharpness / low confidence
 *  slightly worsen displays; a good game breaks a slump). Always escapable. */
export function updateAdversity(career: PlayerCareer, avatar: Player, prevInjured: boolean, day: number): AdversityResult {
  const injuredNow = !!avatar.injury;
  let sharpness = career.matchSharpness ?? 100;
  let confidence = career.confidence ?? 60;
  let formDelta = 0;
  const news: NewsItem[] = [];

  if (injuredNow && !prevInjured) {
    sharpness = 35; // will return undercooked
    news.push(feed(day, 'INJURY', 'Sidelined by injury', `${nameOf(avatar)} picks up a knock and faces a spell out. Fight back to full sharpness on return.`));
  } else if (!injuredNow && prevInjured) {
    news.push(feed(day, 'INJURY', 'Back in training', `${nameOf(avatar)} is over the injury — but it'll take a few games to look fully sharp again.`));
  }
  if (!injuredNow) sharpness = clamp(sharpness + 9, 0, 100);
  if (sharpness < 80) formDelta -= (80 - sharpness) * 0.04;

  // Confidence tracks the most recent outing.
  const r = career.lastMatch?.rating;
  if (r != null) {
    const wasSlump = confidence < 35;
    confidence = clamp(confidence + (r - 6.7) * 4, 0, 100);
    if (wasSlump && confidence >= 45) news.push(feed(day, 'GENERAL', 'Confidence returning', `${nameOf(avatar)} looks to have shaken off the slump.`));
  }
  if (confidence < 35) formDelta -= 2;
  // #24 — heavy fatigue quietly saps displays; the opt-in REST routine in the
  // lifestyle block recovers fitness and lifts this. Always escapable.
  if (avatar.fitness < 55) formDelta -= 1;

  return { career: { ...career, matchSharpness: sharpness, confidence }, news, formDelta };
}

// --- International call-up (Step 7) ------------------------------------------

/** Surface the avatar's first senior call-up as a real accept/withdraw decision
 *  once club form/standing crosses a threshold. Accepting (a store action) wins
 *  the cap; caps/goals then accrue at the season rollover, weighted by the
 *  national-team manager's trust. */
export function updateInternational(career: PlayerCareer, avatar: Player, day: number): { career: PlayerCareer; news: NewsItem[] } {
  const intl = career.international;
  if (intl.capped || career.pendingCallUp) return { career, news: [] };
  const seniorStatus = career.status === 'KEY' || career.status === 'STAR' || career.status === 'CAPTAIN';
  const eligible = avatar.overall >= 76 && seniorStatus && career.seasonApps >= 8 && career.seasonAvgRating >= 6.8;
  if (!eligible) return { career, news: [] };
  const nation = avatar.nationality;
  return {
    career: { ...career, pendingCallUp: { nation, day } },
    news: [feed(day, 'MILESTONE', 'International call-up!', `${nameOf(avatar)} has been called up to the ${nation} senior squad for the first time. Accept the call to win your first cap — or withdraw.`)],
  };
}

/** Resolve a pending call-up. Accepting wins the first cap + opens the national-
 *  team relationship; withdrawing costs a little standing but is always allowed. */
export function resolveCallUp(career: PlayerCareer, avatar: Player, accept: boolean, day: number): { career: PlayerCareer; news: NewsItem[] } {
  const call = career.pendingCallUp;
  if (!call) return { career, news: [] };
  if (accept) {
    return {
      career: {
        ...career, pendingCallUp: null,
        international: { capped: true, caps: 1, intlGoals: 0 },
        intlManagerTrust: 55,
        milestones: [...career.milestones, { day, text: `Earned a first senior cap for ${call.nation}.` }],
      },
      news: [feed(day, 'MILESTONE', 'First senior cap!', `${nameOf(avatar)} pulls on the ${call.nation} shirt for the first time.`)],
    };
  }
  return {
    career: { ...career, pendingCallUp: null, intlManagerTrust: 40 },
    news: [feed(day, 'GENERAL', 'Call-up declined', `${nameOf(avatar)} has withdrawn from the ${call.nation} squad for now. The manager won't forget it.`)],
  };
}

// --- Orchestrator -----------------------------------------------------------

export interface ProgressionResult { career: PlayerCareer; news: NewsItem[]; formDelta: number }

/**
 * Run every per-advance progression system in order on top of the objectives/
 * trust result. Deterministic. `squad` is the avatar's club roster (for the
 * rival); `prevInjured` is the avatar's injury state before this advance.
 */
export function progressPlayerCareer(
  careerIn: PlayerCareer,
  avatar: Player,
  squad: Player[],
  year: number,
  day: number,
  prevInjured: boolean,
  club?: Club,
  seed = 0,
): ProgressionResult {
  let career = careerIn;
  const news: NewsItem[] = [];

  // The manager's man-management style (set once, refreshed if the club changed).
  if (club) career = { ...career, managerStyle: deriveManagerStyle(club, seed) };

  const s = updateStatus(career, avatar, year, day); career = s.career; news.push(...s.news);
  const r = updateRival(career, avatar, squad, day); career = r.career; news.push(...r.news);
  const tg = updateTrainingGround(career, avatar, day); career = tg.career; news.push(...tg.news);
  const t = updateTraits(career, avatar, day); career = t.career; news.push(...t.news);
  const a = updateAdversity(career, avatar, prevInjured, day); career = a.career; news.push(...a.news);
  const i = updateInternational(career, avatar, day); career = i.career; news.push(...i.news);

  return { career, news, formDelta: a.formDelta };
}
