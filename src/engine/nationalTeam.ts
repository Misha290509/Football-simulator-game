// ---------------------------------------------------------------------------
// National teams (§ International management). Builds each nation's squad from
// the best players of that nationality across every club. Pure & deterministic.
// Real players carry full country names ("Brazil"); regens carry country codes
// ("BR") — canonicalNation merges the modeled nations so they don't split.
// ---------------------------------------------------------------------------

import type { Player } from '../types/player';
import { COUNTRY_NAMES } from '../data/academyData';
import { NATION_BY_NAME } from '../data/nations';

/** Merge country codes → full names for the modeled nations. */
export function canonicalNation(nat: string): string {
  return COUNTRY_NAMES[nat] ?? nat;
}

/**
 * A nation's international strength: its base rating from the NATIONS table,
 * blended with its real dataset squad when one exists. Shared by the tournament
 * engine and the UI so both agree on how strong a nation is.
 */
export function nationStrength(nation: string, squads: Record<string, NationSquad>): number {
  const base = NATION_BY_NAME[nation]?.strength ?? 68;
  const sq = squads[nation];
  return sq && sq.players.length >= 8 ? Math.round(0.55 * base + 0.45 * sq.strength) : base;
}

export interface NationSquad {
  nation: string;
  players: Player[]; // up to 23, best first
  xi: Player[]; // best 11 (GK + 10 outfield)
  strength: number; // average XI overall
}

/** Group all players into national squads keyed by canonical nation name. */
export function buildNationSquads(players: Record<string, Player> | Player[]): Record<string, NationSquad> {
  const list = Array.isArray(players) ? players : Object.values(players);
  const byNation: Record<string, Player[]> = {};
  for (const p of list) {
    if (!p.nationality || p.nationality === 'XX') continue;
    (byNation[canonicalNation(p.nationality)] ??= []).push(p);
  }
  const out: Record<string, NationSquad> = {};
  for (const [nation, group] of Object.entries(byNation)) {
    const sorted = [...group].sort((a, b) => b.overall - a.overall);
    const gk = sorted.find((p) => p.position === 'GK');
    const outfield = sorted.filter((p) => p.position !== 'GK').slice(0, 10);
    const xi = [...(gk ? [gk] : []), ...outfield].slice(0, 11);
    const strength = xi.length ? Math.round(xi.reduce((s, p) => s + p.overall, 0) / xi.length) : 0;
    out[nation] = { nation, players: sorted.slice(0, 23), xi, strength };
  }
  return out;
}

/** Nations with a credible squad, strongest first. */
export function rankedNations(squads: Record<string, NationSquad>, minSquad = 15): NationSquad[] {
  return Object.values(squads).filter((s) => s.players.length >= minSquad).sort((a, b) => b.strength - a.strength);
}
