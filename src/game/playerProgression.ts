// ---------------------------------------------------------------------------
// Player Career — progression (Tier 2 · Steps 2, 4, 5, 6, 7). Pure &
// deterministic. Layered on top of the objectives/trust matchday loop, this
// derives squad status, maintains the positional rival, surfaces earned traits
// and drifts personality, runs injury/sharpness/confidence adversity, and fires
// the first international call-up. Reuses the existing attribute-derived trait
// system (traitsOf) and morale/form/fitness/injury fields — nothing forked.
// ---------------------------------------------------------------------------

import type { Player } from '../types/player';
import type { NewsItem } from '../types/league';
import { POSITION_GROUP } from '../types/attributes';
import type { PlayerCareer, SquadStatus, StatusChange } from '../types/playerCareer';
import { clamp } from '../engine/rng';
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

/** Maintain the avatar's rival for the shirt and drift the relationship. */
export function updateRival(career: PlayerCareer, avatar: Player, squad: Player[], day: number): { career: PlayerCareer; news: NewsItem[] } {
  const grp = POSITION_GROUP[avatar.position];
  const samePos = squad.filter((p) => p.id !== avatar.id && p.position === avatar.position);
  const sameGrp = squad.filter((p) => p.id !== avatar.id && POSITION_GROUP[p.position] === grp);
  const pool = samePos.length ? samePos : sameGrp;
  const pick = [...pool].sort((a, b) => b.overall - a.overall)[0];
  if (!pick) return { career: { ...career, rival: null }, news: [] };

  const news: NewsItem[] = [];
  const prev = career.rival;
  let relationship = prev?.playerId === pick.id ? prev.relationship : 0;
  // Outplaying your rival warms/cools the rivalry (their overall vs your form).
  relationship = clamp(relationship + (avatar.form > 15 ? 3 : avatar.form < -15 ? -3 : 0), -100, 100);
  // The rival picking up an injury throws the shirt open.
  if (pick.injury && (!prev || prev.playerId !== pick.id || relationship >= 0)) {
    // (light touch — only when the rival is currently sidelined)
  }
  if (prev && prev.playerId !== pick.id) {
    news.push(feed(day, 'GENERAL', 'A new rival for the shirt', `${nameOf(pick)} is now your main competition for the ${avatar.position} role.`));
  }
  return { career: { ...career, rival: { playerId: pick.id, relationship } }, news };
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

  return { career: { ...career, matchSharpness: sharpness, confidence }, news, formDelta };
}

// --- International call-up (Step 7) ------------------------------------------

/** Fire the avatar's first senior call-up once club form/standing crosses a
 *  threshold. Caps/goals then accrue at the season rollover (see the store). */
export function updateInternational(career: PlayerCareer, avatar: Player, day: number): { career: PlayerCareer; news: NewsItem[] } {
  const intl = career.international;
  if (intl.capped) return { career, news: [] };
  const seniorStatus = career.status === 'KEY' || career.status === 'STAR' || career.status === 'CAPTAIN';
  const eligible = avatar.overall >= 76 && seniorStatus && career.seasonApps >= 8 && career.seasonAvgRating >= 6.8;
  if (!eligible) return { career, news: [] };
  return {
    career: {
      ...career,
      international: { capped: true, caps: 1, intlGoals: 0 },
      intlManagerTrust: 50,
      milestones: [...career.milestones, { day, text: `Earned a first senior international cap.` }],
    },
    news: [feed(day, 'MILESTONE', 'International call-up!', `${nameOf(avatar)} has been called up to the senior national team and won a first cap.`)],
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
): ProgressionResult {
  let career = careerIn;
  const news: NewsItem[] = [];

  const s = updateStatus(career, avatar, year, day); career = s.career; news.push(...s.news);
  const r = updateRival(career, avatar, squad, day); career = r.career; news.push(...r.news);
  const t = updateTraits(career, avatar, day); career = t.career; news.push(...t.news);
  const a = updateAdversity(career, avatar, prevInjured, day); career = a.career; news.push(...a.news);
  const i = updateInternational(career, avatar, day); career = i.career; news.push(...i.news);

  return { career, news, formDelta: a.formDelta };
}
