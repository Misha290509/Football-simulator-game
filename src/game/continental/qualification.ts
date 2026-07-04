// ---------------------------------------------------------------------------
// European qualification (§ Continental). Decides which clubs enter the
// Champions League, Europa League and Conference League, using a coefficient
// model: each country gets a coefficient from its clubs' reputations, and each
// club a berth score = coefficient − position penalty. The strongest 36 scores
// fill the Champions League, the next 36 the Europa League, the next 36 the
// Conference League — with a per-country cap per tier so no single league
// dominates. Deterministic and dataset-agnostic.
// ---------------------------------------------------------------------------

import type { Club } from '../../types/club';
import type { Competition } from '../../types/competition';
import type { StandingRow } from '../../types/league';

export interface EuropeanQualification {
  championsLeague: string[];
  europaLeague: string[];
  conferenceLeague: string[];
}

/** Reputation-baseline coefficient per UEFA country (avg top-flight reputation). */
export function reputationBaseline(
  competitions: Record<string, Competition>,
  clubs: Record<string, Club>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const comp of Object.values(competitions)) {
    if (comp.confederation !== 'UEFA' || comp.tier !== 1) continue;
    const reps = comp.clubIds.map((id) => clubs[id]?.reputation ?? 0);
    out[comp.countryId] = reps.length ? reps.reduce((s, r) => s + r, 0) / reps.length : 0;
  }
  return out;
}

export const CL_SIZE = 36;
export const EL_SIZE = 36;
export const CONF_SIZE = 36;

/** Per-country cap in each tier (keeps distributions realistic). */
const CAP = { cl: 5, el: 4, conf: 4 };
/** How much each finishing place below 1st lowers a club's berth score. */
const POSITION_PENALTY = 2.0;

interface Berth { clubId: string; countryId: string; score: number }

/**
 * Build the three European fields from the current world. When `finalStandings`
 * is supplied (season rollover) berths follow league position; at a fresh new
 * game it falls back to club reputation order.
 */
export function buildEuropeanQualification(
  competitions: Record<string, Competition>,
  clubs: Record<string, Club>,
  finalStandings?: Record<string, StandingRow[]>,
  /** Persistent, evolving country coefficients (override the reputation baseline). */
  coefficientOverride?: Record<string, number>,
): EuropeanQualification {
  // UEFA top divisions only feed the European competitions.
  const uefaTier1 = Object.values(competitions).filter((c) => c.confederation === 'UEFA' && c.tier === 1);

  // Per-country coefficient: the evolving value if we have one, else the
  // reputation baseline (average top-flight reputation).
  const coefficient: Record<string, number> = {};
  for (const comp of uefaTier1) {
    const reps = comp.clubIds.map((id) => clubs[id]?.reputation ?? 0);
    const baseline = reps.length ? reps.reduce((s, r) => s + r, 0) / reps.length : 0;
    coefficient[comp.countryId] = coefficientOverride?.[comp.countryId] ?? baseline;
  }

  // Ordered club list per country: by final league position, else by reputation.
  const berths: Berth[] = [];
  for (const comp of uefaTier1) {
    const rows = finalStandings?.[comp.id];
    const ordered = rows
      ? rows.map((r) => r.clubId)
      : [...comp.clubIds].sort((a, b) => (clubs[b]?.reputation ?? 0) - (clubs[a]?.reputation ?? 0));
    ordered.forEach((clubId, i) => {
      if (!clubs[clubId]) return;
      berths.push({ clubId, countryId: comp.countryId, score: coefficient[comp.countryId] - i * POSITION_PENALTY });
    });
  }

  berths.sort((a, b) => b.score - a.score || (clubs[b.clubId].reputation - clubs[a.clubId].reputation));

  const used = new Set<string>();
  const fill = (size: number, cap: number): string[] => {
    const out: string[] = [];
    const perCountry: Record<string, number> = {};
    for (const b of berths) {
      if (out.length >= size) break;
      if (used.has(b.clubId)) continue;
      if ((perCountry[b.countryId] ?? 0) >= cap) continue;
      out.push(b.clubId);
      used.add(b.clubId);
      perCountry[b.countryId] = (perCountry[b.countryId] ?? 0) + 1;
    }
    // If caps starved the field (tiny worlds), relax them to guarantee the size.
    if (out.length < size) {
      for (const b of berths) {
        if (out.length >= size) break;
        if (used.has(b.clubId)) continue;
        out.push(b.clubId);
        used.add(b.clubId);
      }
    }
    return out;
  };

  return {
    championsLeague: fill(CL_SIZE, CAP.cl),
    europaLeague: fill(EL_SIZE, CAP.el),
    conferenceLeague: fill(CONF_SIZE, CAP.conf),
  };
}
