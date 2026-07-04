// ---------------------------------------------------------------------------
// Sim client: builds LineupProfiles from the live squad and dispatches matches
// to the Web Worker, returning completed outcomes. Falls back to synchronous
// simulation if Workers are unavailable (e.g. the test/harness environment).
// ---------------------------------------------------------------------------

import type { Club } from '../types/club';
import type { Player } from '../types/player';
import type { Match, LineupProfile } from '../types/match';
import { buildLineupProfile } from './lineup';
import { simulateMatch } from './match';
import { traitStrengthMod, type MatchContext } from '../game/clubTraits';
import type {
  SimRequest,
  SimResult,
  SimMatchRequest,
} from './worker/simWorker';

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (r: SimResult) => void>();

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (!worker) {
    try {
      worker = new Worker(new URL('./worker/simWorker.ts', import.meta.url), {
        type: 'module',
      });
      worker.onmessage = (e: MessageEvent<SimResult>) => {
        const resolve = pending.get(e.data.id);
        if (resolve) {
          pending.delete(e.data.id);
          resolve(e.data);
        }
      };
    } catch {
      worker = null;
    }
  }
  return worker;
}

/** Build profiles for every club appearing in the given matches. */
function buildProfiles(
  matches: Match[],
  clubs: Record<string, Club>,
  players: Record<string, Player>,
): Record<string, LineupProfile> {
  const needed = new Set<string>();
  for (const m of matches) {
    needed.add(m.homeClubId);
    needed.add(m.awayClubId);
  }
  const byClub: Record<string, Player[]> = {};
  for (const p of Object.values(players)) {
    const cid = p.contract.clubId;
    if (cid && needed.has(cid)) (byClub[cid] ??= []).push(p);
  }
  const profiles: Record<string, LineupProfile> = {};
  for (const clubId of needed) {
    const club = clubs[clubId];
    profiles[clubId] = buildLineupProfile(
      clubId,
      byClub[clubId] ?? [],
      club?.formation ?? '4-3-3',
      {
        tactics: club?.tactics, lineup: club?.lineup, bench: club?.bench, autoMode: club?.autoMode,
        setPieces: { penaltyTakerId: club?.penaltyTakerId, freeKickTakerId: club?.freeKickTakerId, cornerTakerId: club?.cornerTakerId },
      },
    );
  }
  return profiles;
}

/**
 * Simulate the given matches, returning new (played) Match objects.
 *
 * `contextByMatch` optionally supplies the Club-DNA match context per match id
 * (continental / cup / league run-in). When present, each club's personality
 * traits scale its strength for that single match.
 */
export async function simulateMatches(
  matches: Match[],
  clubs: Record<string, Club>,
  players: Record<string, Player>,
  contextByMatch?: Record<string, MatchContext>,
): Promise<Match[]> {
  if (matches.length === 0) return [];
  const profiles = buildProfiles(matches, clubs, players);
  const reqMatches: SimMatchRequest[] = matches.map((m) => {
    const ctx = contextByMatch?.[m.id];
    return {
      matchId: m.id,
      homeClubId: m.homeClubId,
      awayClubId: m.awayClubId,
      seed: m.seed,
      homeMod: ctx ? traitStrengthMod(clubs[m.homeClubId]?.traits, ctx) : 1,
      awayMod: ctx ? traitStrengthMod(clubs[m.awayClubId]?.traits, ctx) : 1,
    };
  });

  const w = getWorker();
  let results: SimResult['results'];

  if (w) {
    const id = nextId++;
    const request: SimRequest = { id, profiles, matches: reqMatches };
    results = await new Promise<SimResult>((resolve) => {
      pending.set(id, resolve);
      w.postMessage(request);
    }).then((r) => r.results);
  } else {
    // Synchronous fallback (no Worker, e.g. Node test/harness).
    const scale = (p: LineupProfile, mod: number | undefined): LineupProfile =>
      !mod || mod === 1 ? p : { ...p, attack: p.attack * mod, midfield: p.midfield * mod, defense: p.defense * mod, gk: p.gk * mod };
    results = reqMatches.map((m) => ({
      matchId: m.matchId,
      outcome: simulateMatch(scale(profiles[m.homeClubId], m.homeMod), scale(profiles[m.awayClubId], m.awayMod), m.seed),
    }));
  }

  const byId = new Map(matches.map((m) => [m.id, m]));
  return results.map(({ matchId, outcome }) => {
    const base = byId.get(matchId)!;
    return {
      ...base,
      played: true,
      homeGoals: outcome.homeGoals,
      awayGoals: outcome.awayGoals,
      homeXg: outcome.homeXg,
      awayXg: outcome.awayXg,
      events: outcome.events,
      playerStats: outcome.playerStats,
    };
  });
}
