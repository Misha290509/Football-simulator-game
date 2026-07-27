// ---------------------------------------------------------------------------
// Player Career — conditions, scouting & pressure (§ Deeper match mechanics).
// Three layers that stop every match feeling the same:
//
//   • Conditions — weather, pitch and stadium. Rain kills the first touch, a
//     rutted January pitch skews control, altitude drains the legs, and a
//     hostile away end suppresses a player's flow unless he's built for it.
//   • Scouting — a pre-match dossier on the opponent with real, exploitable
//     intelligence: a keeper who dives early, a booked centre-back who can't
//     dive in, a full-back slow to turn. Reading it changes which choice is right.
//   • Pressure — under real heat the information itself gets fuzzy. A player
//     with big-game temperament keeps his clarity; a nervy one is left guessing.
//
// Pure & deterministic: everything hashes stable ids (fixture, seed), so a match
// re-runs identically and none of it consumes the sim's RNG stream.
// ---------------------------------------------------------------------------

import type { Player } from '../types/player';
import type { Club } from '../types/club';
import type { MomentType, MomentChoice } from '../types/interactiveMatch';
import { hashSeed, clamp } from '../engine/rng';

// --- Conditions ---------------------------------------------------------------

export type Weather = 'CLEAR' | 'RAIN' | 'HEAVY_RAIN' | 'WIND' | 'SNOW' | 'HEAT';
export type PitchState = 'PRISTINE' | 'DRY' | 'SLICK' | 'RUTTED';

export interface MatchConditions {
  weather: Weather;
  pitch: PitchState;
  /** Crowd hostility 0–1 (away end at a big, loud ground). */
  hostility: number;
  /** Thin air saps the legs (a famous altitude venue). */
  altitude: boolean;
  attendance: number;
  label: string;
}

const WEATHER_LABEL: Record<Weather, string> = {
  CLEAR: 'Clear', RAIN: 'Rain', HEAVY_RAIN: 'Driving rain', WIND: 'Swirling wind', SNOW: 'Snow', HEAT: 'Fierce heat',
};
const PITCH_LABEL: Record<PitchState, string> = {
  PRISTINE: 'a perfect surface', DRY: 'a dry, quick pitch', SLICK: 'a slick, greasy surface', RUTTED: 'a heavy, rutted pitch',
};

/**
 * Derive the day's conditions from the fixture. Deterministic and seasonal — a
 * mid-winter game is far likelier to be wet and the pitch cut up; a summer one
 * hot and true.
 */
export function deriveConditions(
  matchId: string, seed: number, day: number, maxDay: number, homeClub: Club | undefined, isAvatarHome: boolean,
): MatchConditions {
  const h = hashSeed(`cond_${seed}_${matchId}`);
  // Season phase: 0 = August … 1 = May. Deep winter sits around the middle.
  const phase = maxDay > 0 ? clamp(day / maxDay, 0, 1) : 0.5;
  const winter = phase > 0.28 && phase < 0.62;
  const roll = h % 100;

  let weather: Weather = 'CLEAR';
  if (winter) {
    weather = roll < 30 ? 'RAIN' : roll < 42 ? 'HEAVY_RAIN' : roll < 52 ? 'WIND' : roll < 58 ? 'SNOW' : 'CLEAR';
  } else if (phase < 0.15 || phase > 0.9) {
    weather = roll < 14 ? 'HEAT' : roll < 24 ? 'RAIN' : roll < 32 ? 'WIND' : 'CLEAR';
  } else {
    weather = roll < 20 ? 'RAIN' : roll < 28 ? 'WIND' : 'CLEAR';
  }

  const rep = homeClub?.reputation ?? 60;
  // Rich clubs keep immaculate pitches; winter and rain chew up modest ones.
  const pitchRoll = (h >> 7) % 100;
  let pitch: PitchState = 'PRISTINE';
  if (rep >= 78) pitch = weather === 'HEAVY_RAIN' || weather === 'SNOW' ? 'SLICK' : 'PRISTINE';
  else if (winter && rep < 66) pitch = pitchRoll < 45 ? 'RUTTED' : 'SLICK';
  else if (weather === 'RAIN' || weather === 'HEAVY_RAIN' || weather === 'SNOW') pitch = 'SLICK';
  else pitch = pitchRoll < 30 ? 'DRY' : 'PRISTINE';

  const attendance = Math.round((8_000 + rep * 700) * (1 + ((h >> 13) % 20) / 100));
  // Only the away side faces a hostile crowd, and only somewhere genuinely loud.
  const hostility = !isAvatarHome ? clamp((rep - 60) / 40, 0, 1) : 0;
  const altitude = !!homeClub && ((hashSeed(`alt_${homeClub.id}`) % 100) < 6);

  const bits = [WEATHER_LABEL[weather], PITCH_LABEL[pitch]];
  if (altitude) bits.push('thin air');
  return { weather, pitch, hostility, altitude, attendance, label: bits.join(' · ') };
}

/** Conditions multiplier on a moment's success chance (control, power, aerial). */
export function conditionsFactor(c: MatchConditions | undefined, type: MomentType, reward: MomentChoice['reward']): number {
  if (!c) return 1;
  let f = 1;
  const control = reward === 'KEY_PASS' || reward === 'ASSIST' || reward === 'RETAIN' || type === 'TAKE_ON' || type === 'DRIVE_FORWARD';
  const shooting = reward === 'GOAL' || reward === 'SHOT_ON';
  const aerial = type === 'HEADER' || type === 'AERIAL_DUEL' || type === 'CLAIM_CROSS';
  const keeping = reward === 'SAVE';

  switch (c.weather) {
    case 'RAIN': if (control) f *= 0.95; if (keeping) f *= 0.96; break;
    case 'HEAVY_RAIN': if (control) f *= 0.88; if (shooting) f *= 0.94; if (keeping) f *= 0.9; break;
    case 'WIND': if (aerial) f *= 0.9; if (shooting) f *= 0.93; break;
    case 'SNOW': if (control) f *= 0.85; if (shooting) f *= 0.9; break;
    case 'HEAT': break; // handled as stamina drain
    case 'CLEAR': break;
  }
  if (c.pitch === 'SLICK' && control) f *= 0.94;
  if (c.pitch === 'RUTTED' && control) f *= 0.88;
  if (c.pitch === 'DRY' && control) f *= 1.02;
  return f;
}

/** Extra fatigue the conditions impose over a match (0–1 added to fatigue). */
export function conditionsFatigue(c: MatchConditions | undefined): number {
  if (!c) return 0;
  let f = 0;
  if (c.altitude) f += 0.18;
  if (c.weather === 'HEAT') f += 0.12;
  if (c.pitch === 'RUTTED') f += 0.08;
  if (c.weather === 'SNOW') f += 0.06;
  return f;
}

/** How much a hostile crowd suppresses flow — unless he thrives on the big stage. */
export function crowdFlowPenalty(c: MatchConditions | undefined, bigGame: number): number {
  if (!c || c.hostility <= 0) return 0;
  const resilience = clamp((bigGame - 50) / 50, 0, 1); // 50 → 0, 100 → fully immune
  return c.hostility * 10 * (1 - resilience);
}

// --- Scouting report -----------------------------------------------------------

export type ScoutTag =
  | 'KEEPER_DIVES_EARLY' | 'KEEPER_WEAK_NEAR_POST' | 'KEEPER_COMMANDS_AIR'
  | 'CB_ON_YELLOW' | 'CB_SLOW_TURNING' | 'CB_DOMINANT_AIR'
  | 'FB_SLOW_TURNING' | 'FB_PUSHES_HIGH'
  | 'HIGH_LINE' | 'DEEP_BLOCK' | 'PRESSES_HARD' | 'TIRING_LEGS';

export interface ScoutNote { tag: ScoutTag; text: string; hint: string }

const NOTE_TEXT: Record<ScoutTag, { text: string; hint: string }> = {
  KEEPER_DIVES_EARLY: { text: 'Their keeper commits early and goes to ground.', hint: 'Dinks and chips are on.' },
  KEEPER_WEAK_NEAR_POST: { text: 'Their keeper is beatable at his near post.', hint: 'Low, hard, near post.' },
  KEEPER_COMMANDS_AIR: { text: 'Their keeper dominates his box in the air.', hint: 'Crosses will be gobbled up — go low.' },
  CB_ON_YELLOW: { text: 'Their centre-half is on a yellow already.', hint: 'Run at him — he daren’t dive in.' },
  CB_SLOW_TURNING: { text: 'Their centre-half is slow turning.', hint: 'Balls in behind will hurt him.' },
  CB_DOMINANT_AIR: { text: 'Their centre-half wins everything in the air.', hint: 'Don’t feed him headers.' },
  FB_SLOW_TURNING: { text: 'Their full-back struggles when he has to turn.', hint: 'Take him on the outside.' },
  FB_PUSHES_HIGH: { text: 'Their full-back pushes very high up.', hint: 'The space behind him is yours.' },
  HIGH_LINE: { text: 'They hold a dangerously high line.', hint: 'Time your runs in behind.' },
  DEEP_BLOCK: { text: 'They’ll sit in a deep, compact block.', hint: 'Patience — or shoot from range.' },
  PRESSES_HARD: { text: 'They press hard and high from the front.', hint: 'Keep it simple under pressure.' },
  TIRING_LEGS: { text: 'They played midweek — legs will go late.', hint: 'The last twenty minutes are yours.' },
};

/**
 * Build a short opponent dossier. Deterministic from the fixture, and grounded
 * in the actual opposition players where possible (their keeper's real ability,
 * their weakest defender), so the intelligence is honest rather than decorative.
 */
export function buildScoutReport(matchId: string, seed: number, oppSquad: Player[]): ScoutNote[] {
  const h = hashSeed(`scout_${seed}_${matchId}`);
  const tags: ScoutTag[] = [];

  const gk = oppSquad.filter((p) => p.position === 'GK').sort((a, b) => b.overall - a.overall)[0];
  if (gk) {
    const reflexes = (gk.attributes.goalkeeping as Record<string, number>)?.gkReflexes ?? 60;
    const positioning = (gk.attributes.goalkeeping as Record<string, number>)?.gkPositioning ?? 60;
    if (positioning < 68) tags.push('KEEPER_DIVES_EARLY');
    else if (reflexes < 70) tags.push('KEEPER_WEAK_NEAR_POST');
    else if (reflexes >= 80) tags.push('KEEPER_COMMANDS_AIR');
  }

  const backs = oppSquad.filter((p) => ['LCB', 'RCB', 'LB', 'RB'].includes(p.position));
  const weakest = backs.sort((a, b) => a.overall - b.overall)[0];
  if (weakest) {
    const phys = weakest.attributes.physical as Record<string, number>;
    const isCb = weakest.position === 'LCB' || weakest.position === 'RCB';
    if ((phys?.sprintSpeed ?? 60) < 68) tags.push(isCb ? 'CB_SLOW_TURNING' : 'FB_SLOW_TURNING');
    else if ((weakest.cards?.yellow ?? 0) > 0 && isCb) tags.push('CB_ON_YELLOW');
    else if (isCb && ((weakest.attributes.technical as Record<string, number>)?.headingAccuracy ?? 60) >= 78) tags.push('CB_DOMINANT_AIR');
    else tags.push('FB_PUSHES_HIGH');
  }

  // One tactical read, hashed so it varies fixture to fixture.
  const tactical: ScoutTag[] = ['HIGH_LINE', 'DEEP_BLOCK', 'PRESSES_HARD', 'TIRING_LEGS'];
  tags.push(tactical[h % tactical.length]);

  return tags.slice(0, 3).map((tag) => ({ tag, ...NOTE_TEXT[tag] }));
}

/** The edge (or trap) a scouted weakness gives a specific choice. */
export function scoutFactor(notes: ScoutNote[] | undefined, type: MomentType, choiceId: string, reward: MomentChoice['reward']): number {
  if (!notes?.length) return 1;
  let f = 1;
  for (const n of notes) {
    switch (n.tag) {
      case 'KEEPER_DIVES_EARLY': if (choiceId === 'dink' || choiceId === 'panenka') f *= 1.3; break;
      case 'KEEPER_WEAK_NEAR_POST': if (choiceId === 'slot' || choiceId === 'power') f *= 1.2; break;
      case 'KEEPER_COMMANDS_AIR': if (type === 'CROSS_OR_CUT' && reward === 'ASSIST') f *= 0.82; break;
      case 'CB_ON_YELLOW': if (type === 'TAKE_ON' || type === 'DRIVE_FORWARD') f *= 1.25; break;
      case 'CB_SLOW_TURNING': if (type === 'RUN_IN_BEHIND' || type === 'THROUGH_BALL') f *= 1.22; break;
      case 'CB_DOMINANT_AIR': if (type === 'HEADER') f *= 0.8; break;
      case 'FB_SLOW_TURNING': if (type === 'TAKE_ON') f *= 1.25; break;
      case 'FB_PUSHES_HIGH': if (type === 'RUN_IN_BEHIND') f *= 1.2; break;
      case 'HIGH_LINE': if (type === 'RUN_IN_BEHIND' || type === 'THROUGH_BALL') f *= 1.15; break;
      case 'DEEP_BLOCK': if (type === 'LONG_SHOT') f *= 1.15; if (type === 'RUN_IN_BEHIND') f *= 0.88; break;
      case 'PRESSES_HARD': if (reward === 'RETAIN') f *= 0.9; break;
      case 'TIRING_LEGS': break; // handled as a late-game bonus below
    }
  }
  return f;
}

/** Tired opponents fade — a late-game edge when the dossier flagged it. */
export function lateLegsFactor(notes: ScoutNote[] | undefined, minute: number): number {
  if (!notes?.some((n) => n.tag === 'TIRING_LEGS')) return 1;
  return minute >= 70 ? 1.14 : 1;
}

// --- Fatigue gating & pressure fog ----------------------------------------------

/** Choices that cost real physical output — the ones that desert you late. */
export function isExplosiveChoice(type: MomentType, choice: MomentChoice): boolean {
  if (choice.signature) return true;
  if (type === 'RUN_IN_BEHIND' || type === 'DRIVE_FORWARD' || type === 'TAKE_ON') return true;
  if (type === 'LONG_SHOT' && choice.reward === 'GOAL') return true;
  if (type === 'SLIDE_TACKLE') return true;
  return false;
}

/** How gassed he is right now (0–1): fitness, the minute, and the conditions. */
export function fatigueLevel(fitness: number, minute: number, conditions?: MatchConditions): number {
  return clamp((1 - fitness / 100) + minute / 320 + conditionsFatigue(conditions), 0, 1);
}

/** Above this, explosive options are visibly draining and skew toward failure. */
export const FATIGUE_GATE = 0.62;

/** The multiplier a gassed player pays for going for an explosive option. */
export function fatigueGateFactor(fatigue: number, explosive: boolean): number {
  if (!explosive || fatigue < FATIGUE_GATE) return 1;
  return clamp(1 - (fatigue - FATIGUE_GATE) * 1.3, 0.55, 1);
}

/**
 * Under real pressure the picture gets fuzzy. Returns 0–1: how much clarity he
 * keeps. Big-game temperament (and composure) protect it; a nervy player in a
 * cauldron sees only vague impressions of his options.
 */
export function clarityLevel(pressure: number, bigGame: number, composure: number, hostility: number): number {
  const heat = clamp(pressure + hostility * 0.35, 0, 1.3);
  const nerve = clamp(((bigGame - 40) / 60) * 0.7 + ((composure - 40) / 60) * 0.3, 0, 1);
  return clamp(1 - heat * (1 - nerve) * 0.9, 0, 1);
}

/** Vague descriptors shown in place of exact risk when clarity is low. */
const FUZZY = ['Feels on', 'Hard to read', 'Looks risky', 'Instinct says yes', 'Something’s not right'];
export function fuzzyDescriptor(choiceId: string, momentId: string): string {
  return FUZZY[hashSeed(`fuzz_${momentId}_${choiceId}`) % FUZZY.length];
}
