// ---------------------------------------------------------------------------
// International nations table (§ International management). A fixed roster of the
// top ~64 FIFA nations with their confederation and a base strength (0–100,
// loosely derived from the FIFA world ranking). Tournaments (World Cup, Euros,
// Copa America) draw their fields from this table; real players of a nationality
// enrich the squad but the field itself is data-driven so it works on any
// dataset. Purely data — no logic.
// ---------------------------------------------------------------------------

export type Confederation = 'UEFA' | 'CONMEBOL' | 'CONCACAF' | 'CAF' | 'AFC';

export interface NationInfo {
  /** Canonical display name (matches full nationality strings in the dataset). */
  name: string;
  confederation: Confederation;
  /** Base international strength 0–100 (blended with real players at run time). */
  strength: number;
}

/**
 * Top ~64 nations, ordered roughly by FIFA ranking. Base strength tapers from
 * the elite (~90) to the fringe (~62). Names use the same spellings the dataset
 * uses for real players so real squads merge onto the right nation.
 */
export const NATIONS: NationInfo[] = [
  { name: 'Argentina', confederation: 'CONMEBOL', strength: 91 },
  { name: 'France', confederation: 'UEFA', strength: 90 },
  { name: 'Spain', confederation: 'UEFA', strength: 90 },
  { name: 'England', confederation: 'UEFA', strength: 89 },
  { name: 'Brazil', confederation: 'CONMEBOL', strength: 89 },
  { name: 'Portugal', confederation: 'UEFA', strength: 88 },
  { name: 'Netherlands', confederation: 'UEFA', strength: 87 },
  { name: 'Belgium', confederation: 'UEFA', strength: 86 },
  { name: 'Italy', confederation: 'UEFA', strength: 86 },
  { name: 'Germany', confederation: 'UEFA', strength: 86 },
  { name: 'Croatia', confederation: 'UEFA', strength: 84 },
  { name: 'Morocco', confederation: 'CAF', strength: 83 },
  { name: 'Colombia', confederation: 'CONMEBOL', strength: 83 },
  { name: 'Uruguay', confederation: 'CONMEBOL', strength: 83 },
  { name: 'USA', confederation: 'CONCACAF', strength: 81 },
  { name: 'Mexico', confederation: 'CONCACAF', strength: 81 },
  { name: 'Switzerland', confederation: 'UEFA', strength: 81 },
  { name: 'Senegal', confederation: 'CAF', strength: 81 },
  { name: 'Japan', confederation: 'AFC', strength: 80 },
  { name: 'Denmark', confederation: 'UEFA', strength: 80 },
  { name: 'Iran', confederation: 'AFC', strength: 79 },
  { name: 'South Korea', confederation: 'AFC', strength: 79 },
  { name: 'Austria', confederation: 'UEFA', strength: 79 },
  { name: 'Ukraine', confederation: 'UEFA', strength: 78 },
  { name: 'Australia', confederation: 'AFC', strength: 78 },
  { name: 'Ecuador', confederation: 'CONMEBOL', strength: 78 },
  { name: 'Turkey', confederation: 'UEFA', strength: 78 },
  { name: 'Sweden', confederation: 'UEFA', strength: 77 },
  { name: 'Wales', confederation: 'UEFA', strength: 77 },
  { name: 'Poland', confederation: 'UEFA', strength: 77 },
  { name: 'Serbia', confederation: 'UEFA', strength: 76 },
  { name: 'Egypt', confederation: 'CAF', strength: 76 },
  { name: 'Nigeria', confederation: 'CAF', strength: 76 },
  { name: 'Peru', confederation: 'CONMEBOL', strength: 75 },
  { name: 'Algeria', confederation: 'CAF', strength: 75 },
  { name: 'Czechia', confederation: 'UEFA', strength: 75 },
  { name: 'Scotland', confederation: 'UEFA', strength: 74 },
  { name: 'Hungary', confederation: 'UEFA', strength: 74 },
  { name: 'Norway', confederation: 'UEFA', strength: 74 },
  { name: 'Tunisia', confederation: 'CAF', strength: 73 },
  { name: 'Costa Rica', confederation: 'CONCACAF', strength: 73 },
  { name: 'Cameroon', confederation: 'CAF', strength: 73 },
  { name: 'Greece', confederation: 'UEFA', strength: 72 },
  { name: 'Slovakia', confederation: 'UEFA', strength: 72 },
  { name: 'Chile', confederation: 'CONMEBOL', strength: 72 },
  { name: 'Paraguay', confederation: 'CONMEBOL', strength: 71 },
  { name: 'Ivory Coast', confederation: 'CAF', strength: 71 },
  { name: 'Qatar', confederation: 'AFC', strength: 71 },
  { name: 'Saudi Arabia', confederation: 'AFC', strength: 70 },
  { name: 'Romania', confederation: 'UEFA', strength: 70 },
  { name: 'Ghana', confederation: 'CAF', strength: 70 },
  { name: 'Mali', confederation: 'CAF', strength: 69 },
  { name: 'Republic of Ireland', confederation: 'UEFA', strength: 69 },
  { name: 'Venezuela', confederation: 'CONMEBOL', strength: 69 },
  { name: 'Bolivia', confederation: 'CONMEBOL', strength: 66 },
  { name: 'Panama', confederation: 'CONCACAF', strength: 68 },
  { name: 'Slovenia', confederation: 'UEFA', strength: 68 },
  { name: 'Iraq', confederation: 'AFC', strength: 68 },
  { name: 'Jamaica', confederation: 'CONCACAF', strength: 67 },
  { name: 'Finland', confederation: 'UEFA', strength: 67 },
  { name: 'Canada', confederation: 'CONCACAF', strength: 72 },
  { name: 'South Africa', confederation: 'CAF', strength: 67 },
  { name: 'Honduras', confederation: 'CONCACAF', strength: 65 },
  { name: 'United Arab Emirates', confederation: 'AFC', strength: 65 },
];

/** Fast lookup by canonical nation name. */
export const NATION_BY_NAME: Record<string, NationInfo> = Object.fromEntries(
  NATIONS.map((n) => [n.name, n]),
);

/** All nations of a confederation, strongest first. */
export function nationsInConfederation(conf: Confederation): NationInfo[] {
  return NATIONS.filter((n) => n.confederation === conf).sort((a, b) => b.strength - a.strength);
}
