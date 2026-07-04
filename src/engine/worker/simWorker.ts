// ---------------------------------------------------------------------------
// Simulation Web Worker (§4). Receives pre-built LineupProfiles + match stubs
// and runs the pure match engine off the main thread so the UI never freezes.
// ---------------------------------------------------------------------------

/// <reference lib="webworker" />

import type { LineupProfile } from '../../types/match';
import { simulateMatch, type MatchOutcome } from '../match';

export interface SimMatchRequest {
  matchId: string;
  homeClubId: string;
  awayClubId: string;
  seed: number;
  /** Club-DNA strength multipliers for this match (default 1). */
  homeMod?: number;
  awayMod?: number;
}

/** Scale a profile's outfield + GK strength by a Club-DNA multiplier. */
function scaleProfile(p: LineupProfile, mod: number): LineupProfile {
  if (!mod || mod === 1) return p;
  return {
    ...p,
    attack: p.attack * mod,
    midfield: p.midfield * mod,
    defense: p.defense * mod,
    gk: p.gk * mod,
  };
}

export interface SimRequest {
  id: number;
  profiles: Record<string, LineupProfile>;
  matches: SimMatchRequest[];
}

export interface SimResult {
  id: number;
  results: { matchId: string; outcome: MatchOutcome }[];
}

self.onmessage = (e: MessageEvent<SimRequest>) => {
  const { id, profiles, matches } = e.data;
  const results = matches.map((m) => ({
    matchId: m.matchId,
    outcome: simulateMatch(
      scaleProfile(profiles[m.homeClubId], m.homeMod ?? 1),
      scaleProfile(profiles[m.awayClubId], m.awayMod ?? 1),
      m.seed,
    ),
  }));
  const response: SimResult = { id, results };
  (self as unknown as Worker).postMessage(response);
};
