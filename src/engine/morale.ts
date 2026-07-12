// ---------------------------------------------------------------------------
// Man-management (§ Man-management). Pure, deterministic reactions for team
// talks (pre-match + half-time) and one-to-one player interactions. Reactions
// are context- and personality-driven: the same tone lands very differently
// depending on the scoreline, the opponent, and the squad's temperament.
// ---------------------------------------------------------------------------

import type { Player } from '../types/player';

export type TalkTone = 'CALM' | 'FIRED_UP' | 'PLEASED' | 'FURIOUS' | 'RELAXED';
export const TALK_TONES: TalkTone[] = ['CALM', 'FIRED_UP', 'PLEASED', 'FURIOUS', 'RELAXED'];
export const TONE_LABEL: Record<TalkTone, string> = {
  CALM: 'Calm & focused',
  FIRED_UP: 'Demand more',
  PLEASED: 'Praise them',
  FURIOUS: 'Shout',
  RELAXED: 'No pressure',
};

export interface TalkContext {
  phase: 'PRE' | 'HALF';
  scoreDiff: number; // managed side goals − opponent goals
  weAreFavourite: boolean; // our side is the stronger team
}

export interface TalkResult {
  reception: number; // −1 … +1
  moraleDelta: number; // applied to the squad, persists
  formDelta: number;
  talkBoost: number; // match strength multiplier (~0.94 … 1.06)
  momentumSwing: number; // immediate momentum nudge (magnitude; sign applied by caller)
  message: string;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

const POSITIVE = [
  'The dressing room responds — heads up, chests out.',
  'They buy in; you can see the belief.',
  'Nods around the room. Message received.',
];
const NEUTRAL = [
  'A muted response — hard to read.',
  'They listen, but nothing much changes.',
];
const NEGATIVE = [
  'That did not land well — a few players look deflated.',
  'You sense the room switch off.',
  'Some frustrated glances. Not the reaction you wanted.',
];

function reactionText(r: number): string {
  const pool = r > 0.25 ? POSITIVE : r < -0.15 ? NEGATIVE : NEUTRAL;
  // Deterministic pick from the reception value so it doesn't jitter.
  return pool[Math.abs(Math.round(r * 100)) % pool.length];
}

/** Evaluate a team talk. `squadProfessionalism` is the squad's average (0–100). */
export function evaluateTeamTalk(tone: TalkTone, ctx: TalkContext, squadProfessionalism: number): TalkResult {
  const losing = ctx.scoreDiff < 0;
  const winningBig = ctx.scoreDiff >= 2;
  const level = ctx.scoreDiff === 0;
  let r: number;

  if (ctx.phase === 'PRE') {
    if (ctx.weAreFavourite) {
      r = tone === 'CALM' ? 0.5 : tone === 'FIRED_UP' ? 0.4 : tone === 'PLEASED' ? 0.1 : tone === 'FURIOUS' ? -0.2 : -0.4;
    } else {
      r = tone === 'RELAXED' ? 0.5 : tone === 'CALM' ? 0.4 : tone === 'FIRED_UP' ? 0.1 : tone === 'PLEASED' ? 0.0 : -0.4;
    }
  } else if (losing) {
    r = tone === 'FIRED_UP' ? 0.6 : tone === 'CALM' ? 0.3 : tone === 'FURIOUS' ? 0.1 : tone === 'PLEASED' ? -0.2 : -0.4;
  } else if (winningBig) {
    r = tone === 'RELAXED' ? 0.5 : tone === 'PLEASED' ? 0.4 : tone === 'CALM' ? 0.3 : tone === 'FIRED_UP' ? -0.1 : -0.4;
  } else if (level) {
    r = tone === 'FIRED_UP' ? 0.5 : tone === 'CALM' ? 0.4 : tone === 'PLEASED' ? 0.1 : tone === 'RELAXED' ? -0.2 : -0.1;
  } else {
    // winning by one
    r = tone === 'CALM' ? 0.5 : tone === 'PLEASED' ? 0.3 : tone === 'FIRED_UP' ? 0.2 : tone === 'RELAXED' ? 0.0 : -0.3;
  }

  // Strong tones land better with a professional squad, worse with a flaky one.
  if (tone === 'FURIOUS' || tone === 'FIRED_UP') r += (squadProfessionalism - 60) / 200;
  r = clamp(r, -1, 1);

  return {
    reception: r,
    moraleDelta: Math.round(r * 8),
    formDelta: Math.round(r * 12),
    talkBoost: 1 + r * 0.06,
    momentumSwing: Math.abs(r) * 25 * Math.sign(r),
    message: reactionText(r),
  };
}

export type InteractKind = 'PRAISE' | 'REASSURE' | 'WARN';
export const INTERACT_LABEL: Record<InteractKind, string> = {
  PRAISE: 'Praise', REASSURE: 'Reassure', WARN: 'Warn',
};
/** Tooltip copy explaining each option's effect. */
export const INTERACT_DESC: Record<InteractKind, string> = {
  PRAISE: 'Biggest morale boost — but it also feeds his ego.',
  REASSURE: 'A gentle morale lift, with no effect on his ego.',
  WARN: 'Knocks his morale, but takes his ego down a peg.',
};

/** A player's self-importance (0–100), defaulting from ambition on older saves. */
export function egoOf(player: Player): number {
  return clamp(player.ego ?? (40 + ((player.hidden?.ambition ?? 55) - 50) * 0.6), 15, 90);
}

export interface InteractResult {
  moraleDelta: number;
  formDelta: number;
  egoDelta: number;
  message: string;
}

/** Evaluate a one-to-one interaction. Reactions depend on form/morale/personality. */
export function evaluateInteraction(kind: InteractKind, player: Player): InteractResult {
  const prof = player.hidden?.professionalism ?? 55;
  const temperament = player.hidden?.consistency ?? 55; // used as a determination proxy
  const last = player.name.last;
  const form = player.form;
  const morale = player.morale;

  if (kind === 'PRAISE') {
    // Praise is the biggest morale lift, and it inflates the ego.
    if (form > 20) return { moraleDelta: 8, formDelta: 3, egoDelta: 6, message: `${last} is lifted by your praise.` };
    if (prof < 45) return { moraleDelta: 6, formDelta: -4, egoDelta: 10, message: `${last} looks a little too pleased with himself.` };
    if (form < -10) return { moraleDelta: 3, formDelta: 0, egoDelta: 3, message: `${last} accepts it, but knows he can do better.` };
    return { moraleDelta: 6, formDelta: 1, egoDelta: 5, message: `${last} appreciates the encouragement.` };
  }
  if (kind === 'REASSURE') {
    // A gentle lift with no ego effect.
    if (morale < 50) return { moraleDelta: 12, formDelta: 2, egoDelta: 0, message: `${last} is grateful for the reassurance.` };
    return { moraleDelta: 3, formDelta: 0, egoDelta: 0, message: `${last} nods along; he was fine anyway.` };
  }
  // WARN — dents morale, but also deflates the ego.
  if (temperament >= 65 || prof >= 65) return { moraleDelta: -2, formDelta: 8, egoDelta: -6, message: `${last} takes the criticism on the chin and vows to respond.` };
  if (temperament < 45) return { moraleDelta: -10, formDelta: -2, egoDelta: -8, message: `${last} does not react well to being singled out.` };
  return { moraleDelta: -4, formDelta: 3, egoDelta: -7, message: `${last} bristles, but gets the message.` };
}

/** A short mood label from a player's morale (for dressing-room UI). */
export function moodLabel(morale: number): { label: string; className: string } {
  if (morale >= 75) return { label: 'Delighted', className: 'text-emerald-400' };
  if (morale >= 60) return { label: 'Content', className: 'text-emerald-300' };
  if (morale >= 45) return { label: 'Settled', className: 'text-slate-300' };
  if (morale >= 30) return { label: 'Unhappy', className: 'text-orange-300' };
  return { label: 'Disgruntled', className: 'text-rose-400' };
}
