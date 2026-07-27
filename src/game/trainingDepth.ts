// ---------------------------------------------------------------------------
// Player Career — training & development depth (§ The work). What a footballer
// actually does between matches, and what it does to him:
//
//   • Bad habits — repeated behaviour hardens into a reputation. Dive enough and
//     referees stop believing you; waste enough chances and the coaches notice.
//     Each one can be trained out, but it takes weeks of the right work.
//   • Video analysis — sit down with the analyst and study the moments you keep
//     getting wrong. A small permanent edge on exactly that situation.
//   • Body composition — leaner and quicker, or heavier and stronger. A real
//     trade-off across pace, strength and how easily he breaks down.
//   • Coaching badges — the qualifications he takes while still playing, which
//     open the dugout after he hangs them up.
//   • Off-season camps — a personal trainer, a specialist legend, or an actual
//     holiday. Each buys something different for the season ahead.
//
// Pure & deterministic: hashes stable ids, never the sim's RNG stream.
// ---------------------------------------------------------------------------

import type { Player } from '../types/player';
import type { NewsItem } from '../types/league';
import type { PlayerCareer } from '../types/playerCareer';
import type { MomentType } from '../types/interactiveMatch';
import { clamp } from '../engine/rng';

let _seq = 0;
const feed = (day: number, category: NewsItem['category'], title: string, body: string): NewsItem =>
  ({ id: `news_pc_train_${day}_${_seq++}`, day, category, title, body, read: false });
const nameOf = (p: Player) => `${p.name.first} ${p.name.last}`;

// --- Bad habits ------------------------------------------------------------------

export type BadHabitId = 'DIVES' | 'HOT_HEADED' | 'WASTEFUL' | 'BALL_HOG' | 'LAZY_TRACKING';

export interface BadHabitDef { id: BadHabitId; label: string; blurb: string; coachNote: string }

export const BAD_HABITS: BadHabitDef[] = [
  { id: 'DIVES', label: 'Goes down easily', blurb: 'Referees have stopped giving him the benefit of the doubt.', coachNote: 'Stay on your feet. You’re costing us free-kicks.' },
  { id: 'HOT_HEADED', label: 'Hot-headed', blurb: 'One word from a defender and he’s in the referee’s notebook.', coachNote: 'Walk away. Every time.' },
  { id: 'WASTEFUL', label: 'Wasteful', blurb: 'Shoots from anywhere, and it shows in the numbers.', coachNote: 'Pick your moments. The right pass is a goal too.' },
  { id: 'BALL_HOG', label: 'Ball hog', blurb: 'Teammates have stopped making runs for him.', coachNote: 'Look up. There’s always someone better placed.' },
  { id: 'LAZY_TRACKING', label: 'Doesn’t track back', blurb: 'The full-back behind him is getting exposed every week.', coachNote: 'Your job doesn’t stop when we lose it.' },
];
export const habitById = (id: BadHabitId) => BAD_HABITS.find((h) => h.id === id);

export interface HabitState { id: BadHabitId; since: number; trainingOut: boolean; progress: number }

/** Behaviour that, repeated, hardens into a habit. Counted from real actions. */
export interface HabitTally { dives: number; cards: number; wastedShots: number; hoggedChances: number; missedTracks: number }

const THRESHOLD = 5;

/**
 * Fold a match's decisions into the habit tally. Behaviour, not outcomes: going
 * down under contact counts whether or not the referee buys it; backing yourself
 * instead of squaring only counts when it doesn't come off; and diving in or
 * stepping out and being wrong is what "doesn't track back" looks like from the
 * touchline. Auto-resolved moments aren't his choices, so they don't count.
 */
export function tallyFromDecisions(
  tally: HabitTally,
  decisions: { choiceId: string; success: boolean; autoResolved: boolean }[],
): HabitTally {
  const out = { ...tally };
  for (const d of decisions) {
    if (d.autoResolved) continue;
    if (d.choiceId === 'godown') out.dives += 1;
    else if (d.choiceId === 'shoot' && !d.success) out.hoggedChances += 1;
    else if ((d.choiceId === 'slide' || d.choiceId === 'step') && !d.success) out.missedTracks += 1;
  }
  return out;
}

/**
 * Harden repeated behaviour into a named bad habit. Deterministic and honest —
 * it only ever fires off things he actually did.
 */
export function detectBadHabits(
  career: PlayerCareer, avatar: Player, tally: HabitTally, day: number,
): { career: PlayerCareer; news: NewsItem[] } {
  const have = new Set((career.badHabits ?? []).map((h) => h.id));
  const news: NewsItem[] = [];
  const add: HabitState[] = [];
  const consider = (id: BadHabitId, count: number) => {
    if (have.has(id) || count < THRESHOLD) return;
    add.push({ id, since: day, trainingOut: false, progress: 0 });
    const def = habitById(id)!;
    news.push(feed(day, 'GENERAL', `A habit is forming: ${def.label.toLowerCase()}`,
      `${def.blurb} The coaching staff have had a word with ${nameOf(avatar)} — “${def.coachNote}” You can train it out, but it'll take weeks.`));
  };
  consider('DIVES', tally.dives);
  consider('HOT_HEADED', tally.cards);
  consider('WASTEFUL', tally.wastedShots);
  consider('BALL_HOG', tally.hoggedChances);
  consider('LAZY_TRACKING', tally.missedTracks);
  if (add.length === 0) return { career, news };
  return { career: { ...career, badHabits: [...(career.badHabits ?? []), ...add] }, news };
}

/** Work on shedding a habit. Weeks of the right training, then it's gone. */
export function trainOutHabit(career: PlayerCareer, id: BadHabitId): { ok: boolean; career: PlayerCareer; message: string } {
  const habits = career.badHabits ?? [];
  const h = habits.find((x) => x.id === id);
  if (!h) return { ok: false, career, message: 'You don’t have that habit.' };
  if (h.trainingOut) return { ok: false, career, message: 'Already working on that one.' };
  return {
    ok: true,
    career: { ...career, badHabits: habits.map((x) => x.id === id ? { ...x, trainingOut: true } : x) },
    message: `Working on it: ${habitById(id)?.label.toLowerCase()}.`,
  };
}

/** Advance any habit being trained out; shed it when the work is done. */
export function advanceHabits(career: PlayerCareer, avatar: Player, day: number): { career: PlayerCareer; news: NewsItem[] } {
  const habits = career.badHabits ?? [];
  if (habits.length === 0) return { career, news: [] };
  const news: NewsItem[] = [];
  const kept: HabitState[] = [];
  const professional = (career.personality?.professionalism ?? 55) >= 65;
  for (const h of habits) {
    if (!h.trainingOut) { kept.push(h); continue; }
    const progress = clamp(h.progress + (professional ? 18 : 12), 0, 100);
    if (progress >= 100) {
      news.push(feed(day, 'MILESTONE', `Habit broken: ${habitById(h.id)?.label.toLowerCase()}`,
        `Weeks of unglamorous work, and it's gone. ${nameOf(avatar)} has trained the ${habitById(h.id)?.label.toLowerCase()} out of his game.`));
    } else kept.push({ ...h, progress });
  }
  return { career: { ...career, badHabits: kept }, news };
}

/** The in-match cost of a habit on the relevant moments. */
export function habitFactor(career: PlayerCareer, type: MomentType, reward: string): number {
  const ids = new Set((career.badHabits ?? []).map((h) => h.id));
  let f = 1;
  if (ids.has('WASTEFUL') && reward === 'GOAL') f *= 0.94;
  if (ids.has('BALL_HOG') && (reward === 'ASSIST' || reward === 'KEY_PASS')) f *= 0.92;
  if (ids.has('LAZY_TRACKING') && (reward === 'TACKLE_WON' || reward === 'DUEL_WON')) f *= 0.92;
  if (ids.has('HOT_HEADED') && (type === 'SLIDE_TACKLE' || type === 'MIDFIELD_TACKLE')) f *= 0.95;
  return f;
}

/** Referees stop believing a diver — he wins fewer soft decisions. */
export function refereeTrust(career: PlayerCareer): number {
  return (career.badHabits ?? []).some((h) => h.id === 'DIVES') ? 0.9 : 1;
}

// --- Video analysis ----------------------------------------------------------------

export interface AnalysisState { type: MomentType; sessions: number; bonus: number }

export const MAX_ANALYSIS_BONUS = 0.12;

/**
 * Study the moments he keeps getting wrong. Each session buys a small permanent
 * edge on exactly that situation, with diminishing returns.
 */
export function studyMoment(career: PlayerCareer, type: MomentType, day: number, avatar: Player): { career: PlayerCareer; news: NewsItem[]; message: string } {
  const all = career.analysis ?? [];
  const cur = all.find((a) => a.type === type);
  const sessions = (cur?.sessions ?? 0) + 1;
  const bonus = clamp(MAX_ANALYSIS_BONUS * (1 - Math.exp(-sessions / 2.5)), 0, MAX_ANALYSIS_BONUS);
  const next: AnalysisState = { type, sessions, bonus };
  const label = type.toLowerCase().replace(/_/g, ' ');
  return {
    career: { ...career, analysis: [...all.filter((a) => a.type !== type), next] },
    news: [feed(day, 'GENERAL', 'Video session', `${nameOf(avatar)} sat down with the analyst and went through every ${label} of the season. Small margins, but they add up.`)],
    message: `Studied ${label} (+${Math.round(bonus * 100)}%).`,
  };
}

/** The edge his study has bought on this moment type. */
export function analysisFactor(career: PlayerCareer, type: MomentType): number {
  const a = (career.analysis ?? []).find((x) => x.type === type);
  return 1 + (a?.bonus ?? 0);
}

// --- Body composition -----------------------------------------------------------

export type BodyType = 'LEAN' | 'BALANCED' | 'POWERFUL';

export interface BodyEffect { pace: number; strength: number; injuryRisk: number; label: string; blurb: string }
export const BODY: Record<BodyType, BodyEffect> = {
  LEAN: { pace: 3, strength: -3, injuryRisk: 4, label: 'Lean', blurb: 'Quicker over the ground, easier to knock off it, and a touch more fragile.' },
  BALANCED: { pace: 0, strength: 0, injuryRisk: 0, label: 'Balanced', blurb: 'No trade-offs. What you were built as.' },
  POWERFUL: { pace: -3, strength: 4, injuryRisk: -3, label: 'Powerful', blurb: 'Harder to move, harder to hurt, half a yard slower.' },
};
export const bodyOf = (c: PlayerCareer): BodyType => c.bodyType ?? 'BALANCED';

/** Reshape the body over an off-season. Applies to the real attributes. */
export function setBodyType(career: PlayerCareer, avatar: Player, next: BodyType): { career: PlayerCareer; player: Player; news: NewsItem[] } {
  const from = BODY[bodyOf(career)];
  const to = BODY[next];
  const phys = avatar.attributes.physical as Record<string, number>;
  const player: Player = {
    ...avatar,
    attributes: {
      ...avatar.attributes,
      physical: {
        ...avatar.attributes.physical,
        sprintSpeed: clamp(phys.sprintSpeed - from.pace + to.pace, 1, 99),
        acceleration: clamp(phys.acceleration - from.pace + to.pace, 1, 99),
        strength: clamp(phys.strength - from.strength + to.strength, 1, 99),
      } as typeof avatar.attributes.physical,
    },
    hidden: { ...avatar.hidden, injuryProneness: clamp(avatar.hidden.injuryProneness - from.injuryRisk + to.injuryRisk, 5, 95) },
  };
  return {
    career: { ...career, bodyType: next },
    player,
    news: [feed(0, 'GENERAL', `A different shape`, `${nameOf(avatar)} has come back ${to.label.toLowerCase()}. ${to.blurb}`)],
  };
}

// --- Coaching badges --------------------------------------------------------------

export interface BadgeDef { id: string; label: string; blurb: string; minAge: number; weeks: number }
export const BADGES: BadgeDef[] = [
  { id: 'C', label: 'C Licence', blurb: 'The first rung. Evenings and weekends around training.', minAge: 26, weeks: 8 },
  { id: 'B', label: 'B Licence', blurb: 'Serious study now — the coaching starts to make sense.', minAge: 28, weeks: 12 },
  { id: 'A', label: 'A Licence', blurb: 'You could take a team tomorrow, and some clubs know it.', minAge: 30, weeks: 16 },
  { id: 'PRO', label: 'Pro Licence', blurb: 'The badge that lets you manage at the very top.', minAge: 32, weeks: 24 },
];

export function availableBadges(career: PlayerCareer, age: number): BadgeDef[] {
  const done = new Set(career.badges ?? []);
  return BADGES.filter((b) => age >= b.minAge && !done.has(b.id) && (b.id === 'C' || done.has(prevBadge(b.id))));
}
const prevBadge = (id: string) => (id === 'B' ? 'C' : id === 'A' ? 'B' : id === 'PRO' ? 'A' : '');

export function startBadge(career: PlayerCareer, id: string, day: number): { ok: boolean; career: PlayerCareer; message: string } {
  const badge = BADGES.find((b) => b.id === id);
  if (!badge) return { ok: false, career, message: 'No such badge.' };
  if (career.badgeStudy) return { ok: false, career, message: 'You’re already studying one.' };
  return { ok: true, career: { ...career, badgeStudy: { id, startedDay: day, weeks: badge.weeks } }, message: `Enrolled: ${badge.label}.` };
}

export function advanceBadge(career: PlayerCareer, avatar: Player, day: number): { career: PlayerCareer; news: NewsItem[] } {
  const study = career.badgeStudy;
  if (!study) return { career, news: [] };
  const weeksDone = (day - study.startedDay) / 7;
  if (weeksDone < study.weeks) return { career, news: [] };
  const badge = BADGES.find((b) => b.id === study.id)!;
  return {
    career: { ...career, badges: [...(career.badges ?? []), study.id], badgeStudy: null },
    news: [feed(day, 'MILESTONE', `${badge.label} earned`,
      `${nameOf(avatar)} has his ${badge.label}. ${badge.blurb} Whatever comes after playing, the door is a little more open.`)],
  };
}

// --- Off-season camps ----------------------------------------------------------------

export interface CampDef { id: string; label: string; blurb: string; sharpness: number; fitness: number; morale: number; dp: number }
export const CAMPS: CampDef[] = [
  { id: 'trainer', label: 'Hire a personal trainer', blurb: 'Six weeks of brutal, individual work.', sharpness: 15, fitness: 12, morale: -2, dp: 25 },
  { id: 'specialist', label: 'Train with a specialist', blurb: 'A retired great teaches you his finishing.', sharpness: 8, fitness: 4, morale: 2, dp: 45 },
  { id: 'holiday', label: 'Take a real holiday', blurb: 'Switch off completely. Come back hungry.', sharpness: -5, fitness: 6, morale: 12, dp: 0 },
];

export function attendCamp(career: PlayerCareer, avatar: Player, id: string, day: number): { ok: boolean; career: PlayerCareer; moraleDelta: number; news: NewsItem[]; message: string } {
  const camp = CAMPS.find((c) => c.id === id);
  if (!camp) return { ok: false, career, moraleDelta: 0, news: [], message: 'No such camp.' };
  return {
    ok: true,
    career: {
      ...career,
      matchSharpness: clamp((career.matchSharpness ?? 100) + camp.sharpness, 0, 100) as number,
      developmentPoints: (career.developmentPoints ?? 0) + camp.dp,
      lastCamp: id,
    },
    moraleDelta: camp.morale,
    news: [feed(day, 'GENERAL', `Off-season: ${camp.label.toLowerCase()}`,
      `${nameOf(avatar)} spent the summer on it. ${camp.blurb}`)],
    message: camp.label,
  };
}

// --- Position versatility ----------------------------------------------------------

/** How genuinely two-footed-in-roles he is — real versatility makes him harder
 *  to drop, because there's always somewhere to put him. */
export function versatilityRating(avatar: Player): number {
  return clamp(avatar.positions.length >= 3 ? 85 : avatar.positions.length === 2 ? 65 : 35, 0, 100);
}

/** The selection nudge genuine versatility earns. */
export function versatilityBias(avatar: Player): number {
  return avatar.positions.length >= 3 ? 2 : avatar.positions.length === 2 ? 1 : 0;
}
