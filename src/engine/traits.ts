// ---------------------------------------------------------------------------
// Player traits / preferred moves (§ Depth). Derived deterministically from a
// player's attributes + hidden mentals, so they need no storage and appear on
// every save automatically. Traits are surfaced on the profile and give a gentle
// nudge to the match sim (goal / assist share) via buildLineupProfile.
// ---------------------------------------------------------------------------

import type { Player } from '../types/player';

export type PlayerTrait =
  | 'CLINICAL' | 'POACHER' | 'SHOOTS_FROM_DISTANCE' | 'PLAYMAKER' | 'DRIBBLER'
  | 'SET_PIECE_SPECIALIST' | 'AERIAL_THREAT' | 'PACE_MERCHANT' | 'TENACIOUS'
  | 'LEADER' | 'BIG_GAME_PLAYER' | 'CONSISTENT' | 'INJURY_PRONE' | 'DURABLE';

export const TRAIT_LABEL: Record<PlayerTrait, string> = {
  CLINICAL: 'Clinical finisher',
  POACHER: 'Poacher',
  SHOOTS_FROM_DISTANCE: 'Shoots from distance',
  PLAYMAKER: 'Playmaker',
  DRIBBLER: 'Dribbler',
  SET_PIECE_SPECIALIST: 'Set-piece specialist',
  AERIAL_THREAT: 'Aerial threat',
  PACE_MERCHANT: 'Pace merchant',
  TENACIOUS: 'Tenacious',
  LEADER: 'Leader',
  BIG_GAME_PLAYER: 'Big-game player',
  CONSISTENT: 'Consistent',
  INJURY_PRONE: 'Injury prone',
  DURABLE: 'Durable',
};

/** All traits a player has, in priority order (max 5). */
export function traitsOf(p: Player): PlayerTrait[] {
  const t = p.attributes.technical, m = p.attributes.mental, ph = p.attributes.physical, h = p.hidden;
  const out: PlayerTrait[] = [];
  const add = (cond: boolean, tr: PlayerTrait) => { if (cond && !out.includes(tr)) out.push(tr); };

  add(t.finishing >= 86, 'CLINICAL');
  add(t.finishing >= 80 && m.positioning >= 80, 'POACHER');
  add(t.longShots >= 82 && t.shotPower >= 80, 'SHOOTS_FROM_DISTANCE');
  add(m.vision >= 84 && t.shortPassing >= 82, 'PLAYMAKER');
  add(t.dribbling >= 85 && ph.agility >= 80, 'DRIBBLER');
  add(t.fkAccuracy >= 82 || t.penalties >= 86, 'SET_PIECE_SPECIALIST');
  add(t.headingAccuracy >= 84 && ph.jumping >= 80, 'AERIAL_THREAT');
  add(ph.sprintSpeed >= 88 && ph.acceleration >= 86, 'PACE_MERCHANT');
  add(m.aggression >= 82 && (m.standingTackle >= 80 || m.interceptions >= 80), 'TENACIOUS');
  add(m.composure >= 82 && h.professionalism >= 80, 'LEADER');
  add(h.bigGame >= 82, 'BIG_GAME_PLAYER');
  add(h.consistency >= 84, 'CONSISTENT');
  add(h.injuryProneness >= 68, 'INJURY_PRONE');
  add(h.injuryProneness <= 22, 'DURABLE');

  return out.slice(0, 5);
}

/** Multipliers a player's traits apply to their goal / assist share in the sim. */
export function traitSimBoost(p: Player): { scorer: number; creator: number } {
  const traits = traitsOf(p);
  let scorer = 1, creator = 1;
  if (traits.includes('CLINICAL')) scorer += 0.18;
  if (traits.includes('POACHER')) scorer += 0.12;
  if (traits.includes('SHOOTS_FROM_DISTANCE')) scorer += 0.1;
  if (traits.includes('PLAYMAKER')) creator += 0.2;
  if (traits.includes('SET_PIECE_SPECIALIST')) { scorer += 0.08; creator += 0.1; }
  return { scorer, creator };
}
