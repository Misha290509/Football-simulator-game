// ---------------------------------------------------------------------------
// Player Career — the world adapting to you (§ Opposition). Fame has a price.
// Once the avatar is genuinely dangerous, teams stop treating him like any other
// player: a dedicated man-marker follows him, a second body doubles up in the
// danger areas, and cynical fouls break up his rhythm before it starts. Card
// pressure cuts both ways — a defender already on a yellow daren't dive in, and
// that is exploitable information. And one opposing coach makes a career of
// nullifying him, until the day the pattern finally breaks.
//
// Pure & deterministic: every roll hashes stable ids (fixture, seed).
// ---------------------------------------------------------------------------

import type { Player } from '../types/player';
import type { NewsItem } from '../types/league';
import type { PlayerCareer, SquadStatus } from '../types/playerCareer';
import type { MomentType, MomentChoice, MatchTick } from '../types/interactiveMatch';
import { hashSeed, clamp } from '../engine/rng';

// --- Being targeted -------------------------------------------------------------

export interface OppositionPlan {
  /** A dedicated man-marker is glued to him all match. */
  manMarked: boolean;
  /** They double up whenever he takes possession in a dangerous area. */
  doubledUp: boolean;
  /** They'll break his rhythm with cynical fouls. */
  tacticalFouls: boolean;
  /** 0–1: how much of the plan is aimed squarely at him. */
  attention: number;
  /** The marker's name, when they've assigned one. */
  markerName?: string;
  label: string;
}

const STATUS_FAME: Record<SquadStatus, number> = {
  YOUTH: 0, PROSPECT: 0.05, ROTATION: 0.15, KEY: 0.45, STAR: 0.8, CAPTAIN: 0.85,
};

/**
 * How the opposition sets up against him. Reputation earns respect and respect
 * earns attention: a Star with real numbers gets man-marked, doubled up and
 * kicked; a squad player is ignored. Deterministic per fixture.
 */
export function buildOppositionPlan(
  career: PlayerCareer, avatar: Player, matchId: string, seed: number, markerName?: string,
): OppositionPlan {
  const fame = clamp(
    STATUS_FAME[career.status] * 0.6
    + clamp((avatar.overall - 68) / 22, 0, 1) * 0.3
    + clamp((career.seasonGoals ?? 0) / 20, 0, 1) * 0.1,
    0, 1);
  const h = hashSeed(`oppplan_${seed}_${matchId}`);
  const manMarked = fame >= 0.5 && (h % 100) < fame * 85;
  const doubledUp = fame >= 0.62 && ((h >> 5) % 100) < fame * 60;
  const tacticalFouls = fame >= 0.45 && ((h >> 11) % 100) < fame * 70;

  const bits: string[] = [];
  if (manMarked) bits.push('man-marked');
  if (doubledUp) bits.push('doubled up');
  if (tacticalFouls) bits.push('targeted for fouls');
  return {
    manMarked, doubledUp, tacticalFouls, attention: fame,
    markerName: manMarked ? markerName : undefined,
    label: bits.length ? bits.join(' · ') : 'no special attention',
  };
}

/** The difficulty a targeting plan adds to a moment (attackers feel it most). */
export function targetingFactor(plan: OppositionPlan | undefined, type: MomentType, reward: MomentChoice['reward']): number {
  if (!plan) return 1;
  let f = 1;
  const onTheBall = reward === 'GOAL' || reward === 'ASSIST' || reward === 'KEY_PASS' || reward === 'SHOT_ON';
  if (plan.manMarked && onTheBall) f *= 0.9;
  if (plan.doubledUp && (type === 'TAKE_ON' || type === 'DRIVE_FORWARD' || type === 'ONE_ON_ONE')) f *= 0.86;
  return f;
}

/** A cynical foul that stops him in his tracks — deterministic, rhythm-breaking. */
export function tacticalFoulAt(plan: OppositionPlan | undefined, matchId: string, index: number): boolean {
  if (!plan?.tacticalFouls) return false;
  return (hashSeed(`tfoul_${matchId}_${index}`) % 100) < 18;
}

const FOUL_LINES = [
  'is hauled down the moment he turns — cynical, and effective.',
  'gets clipped from behind before he can build up speed. The referee has a word, nothing more.',
  'is bundled over as he tries to break. They’ve clearly been told to stop him however they can.',
];
export function tacticalFoulTick(avatar: Player, minute: number, matchId: string, index: number): MatchTick {
  const line = FOUL_LINES[hashSeed(`tfoulline_${matchId}_${index}`) % FOUL_LINES.length];
  return { minute, text: `🟨 ${avatar.name.last} ${line}`, kind: 'INFO' };
}

/** Being kicked all afternoon is draining and frustrating. */
export function foulFlowPenalty(): number { return 6; }

// --- Nemesis coach ---------------------------------------------------------------

/**
 * One opposing manager has his number. After repeated poor personal returns
 * against the same club, they become a bogey side — a small extra difficulty and
 * a story — until he finally produces against them and breaks the pattern.
 */
export interface BogeyRecord { clubName: string; poorGames: number; isBogey: boolean }

const BOGEY_THRESHOLD = 3;

export function updateBogeyTeams(
  career: PlayerCareer, avatar: Player, oppClubName: string, rating: number, day: number,
): { career: PlayerCareer; news: NewsItem[] } {
  const news: NewsItem[] = [];
  const all = { ...(career.bogeyTeams ?? {}) };
  const rec: BogeyRecord = all[oppClubName] ?? { clubName: oppClubName, poorGames: 0, isBogey: false };
  const name = `${avatar.name.first} ${avatar.name.last}`;

  if (rating < 6.4) {
    rec.poorGames += 1;
    if (!rec.isBogey && rec.poorGames >= BOGEY_THRESHOLD) {
      rec.isBogey = true;
      news.push({
        id: `news_pc_bogey_${oppClubName}_${day}`, day, category: 'GENERAL',
        title: `${oppClubName} have your number`,
        body: `That's ${rec.poorGames} quiet games in a row against ${oppClubName}. Their manager clearly knows exactly how to nullify ${name} — and the pundits have noticed.`,
        read: false,
      });
    }
  } else if (rating >= 7.2 && rec.isBogey) {
    rec.isBogey = false;
    rec.poorGames = 0;
    news.push({
      id: `news_pc_bogeybreak_${oppClubName}_${day}`, day, category: 'MILESTONE',
      title: `The ${oppClubName} hoodoo is over`,
      body: `${name} finally produced against the one side that had him worked out. Whatever their plan was, it doesn't work any more.`,
      read: false,
    });
  } else if (rating >= 7.2) {
    rec.poorGames = 0;
  }

  all[oppClubName] = rec;
  return { career: { ...career, bogeyTeams: all }, news };
}

/** The extra difficulty a bogey side imposes (they've worked him out). */
export function bogeyFactor(career: PlayerCareer, oppClubName: string): number {
  return career.bogeyTeams?.[oppClubName]?.isBogey ? 0.93 : 1;
}
