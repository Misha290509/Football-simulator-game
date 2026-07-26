// ---------------------------------------------------------------------------
// Player Career — PlayStyles (Tier 3, RPG identity). Signature abilities the
// avatar earns by pushing the right attributes over a threshold. Unlike raw
// traits, PlayStyles are evocative, visible on the player card, and give a
// modest, targeted edge on the moments they suit — so a Finesse forward really
// does bend in the spectacular ones, a Poacher really does gobble up the
// half-chances. Pure & deterministic: derived from attributes, so they grow
// with development and never need separate bookkeeping.
// ---------------------------------------------------------------------------

import type { Player } from '../types/player';
import type { MomentType, MomentReward } from '../types/interactiveMatch';

export type PlayStyle =
  | 'FINESSE' | 'POWER_HEADER' | 'POACHER' | 'INCISIVE' | 'RAPID'
  | 'PRESS_PROVEN' | 'DEAD_BALL' | 'AERIAL_WALL' | 'ANCHOR' | 'MAESTRO';

export const PLAYSTYLE_META: Record<PlayStyle, { label: string; blurb: string }> = {
  FINESSE: { label: 'Finesse Shot', blurb: 'Curls the spectacular ones into the far corner.' },
  POWER_HEADER: { label: 'Power Header', blurb: 'A genuine aerial threat in both boxes.' },
  POACHER: { label: 'Poacher', blurb: 'Lives on the shoulder and devours half-chances.' },
  INCISIVE: { label: 'Incisive Pass', blurb: 'Threads the pass others don’t see.' },
  RAPID: { label: 'Rapid', blurb: 'Explosive over the first five yards — gone in behind.' },
  PRESS_PROVEN: { label: 'Press Proven', blurb: 'Relentless out of possession, wins it back high.' },
  DEAD_BALL: { label: 'Dead-Ball', blurb: 'A specialist from set-pieces and the spot.' },
  AERIAL_WALL: { label: 'The Wall', blurb: 'Reflexes and reach that deny the undeniable.' },
  ANCHOR: { label: 'Anchor', blurb: 'Reads danger and snuffs it out before it starts.' },
  MAESTRO: { label: 'Maestro', blurb: 'Glides through pressure with the ball tied to his feet.' },
};

const g = (p: Player, grp: 'technical' | 'mental' | 'physical' | 'goalkeeping', key: string): number => {
  const v = (p.attributes as unknown as Record<string, Record<string, number>>)[grp]?.[key];
  return typeof v === 'number' ? v : 0;
};

/** The PlayStyles the avatar currently qualifies for, from his attributes. */
export function playStylesOf(p: Player): PlayStyle[] {
  const out: PlayStyle[] = [];
  if (g(p, 'technical', 'curve') >= 80 && g(p, 'technical', 'finishing') >= 78) out.push('FINESSE');
  if (g(p, 'technical', 'headingAccuracy') >= 80 && g(p, 'physical', 'jumping') >= 78 && g(p, 'physical', 'strength') >= 74) out.push('POWER_HEADER');
  if (g(p, 'mental', 'positioning') >= 82 && g(p, 'technical', 'finishing') >= 80) out.push('POACHER');
  if (g(p, 'mental', 'vision') >= 82 && g(p, 'technical', 'longPassing') >= 80) out.push('INCISIVE');
  if (g(p, 'physical', 'sprintSpeed') >= 88 && g(p, 'physical', 'acceleration') >= 86) out.push('RAPID');
  if (g(p, 'physical', 'stamina') >= 84 && g(p, 'mental', 'aggression') >= 72) out.push('PRESS_PROVEN');
  if (g(p, 'technical', 'fkAccuracy') >= 82 || g(p, 'technical', 'penalties') >= 84) out.push('DEAD_BALL');
  if (g(p, 'goalkeeping', 'gkReflexes') >= 82 && g(p, 'goalkeeping', 'gkDiving') >= 80) out.push('AERIAL_WALL');
  if (g(p, 'mental', 'interceptions') >= 82 && g(p, 'mental', 'standingTackle') >= 82) out.push('ANCHOR');
  if (g(p, 'technical', 'dribbling') >= 85 && g(p, 'mental', 'composure') >= 82) out.push('MAESTRO');
  return out;
}

/** The multiplier a set of PlayStyles applies to one moment's success chance.
 *  Modest and targeted — attributes still rule; the style tips the moments it
 *  suits. Returns a product of (1 + bonus) over every matching style. */
export function playStyleFactor(styles: PlayStyle[], type: MomentType, reward: MomentReward): number {
  let f = 1;
  for (const s of styles) {
    switch (s) {
      case 'FINESSE': if (reward === 'GOAL' && (type === 'LONG_SHOT' || type === 'CROSS_OR_CUT')) f *= 1.14; break;
      case 'POWER_HEADER': if (type === 'HEADER' || type === 'AERIAL_DUEL') f *= 1.15; break;
      case 'POACHER': if (reward === 'GOAL' && (type === 'ONE_ON_ONE' || type === 'FIRST_TIME_FINISH')) f *= 1.12; break;
      case 'INCISIVE': if (reward === 'ASSIST' || reward === 'KEY_PASS') f *= 1.12; break;
      case 'RAPID': if (reward === 'SHOT_ON' || type === 'RUN_IN_BEHIND') f *= 1.12; break;
      case 'PRESS_PROVEN': if (reward === 'TACKLE_WON') f *= 1.12; break;
      case 'DEAD_BALL': if (type === 'FREE_KICK' || type === 'PENALTY') f *= 1.15; break;
      case 'AERIAL_WALL': if (reward === 'SAVE') f *= 1.10; break;
      case 'ANCHOR': if (reward === 'DUEL_WON' || reward === 'CLEAN_CLEARANCE' || reward === 'TACKLE_WON') f *= 1.08; break;
      case 'MAESTRO': if (reward === 'KEY_PASS' || type === 'TAKE_ON') f *= 1.10; break;
    }
  }
  return f;
}
