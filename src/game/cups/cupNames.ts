// ---------------------------------------------------------------------------
// Real domestic-cup names (§ #18). Maps each modelled country to the real names
// of its primary cup, secondary (league) cup and super cup. The formats are the
// existing single-elimination knockouts; only the identity changes. Countries
// without an entry fall back to the generic "<country> Cup".
// ---------------------------------------------------------------------------

export interface CupNames {
  major: string;
  league?: string; // secondary/league cup, where one exists
  super?: string;  // curtain-raiser super cup, where one exists
}

export const CUP_NAMES: Record<string, CupNames> = {
  AR: { major: 'Copa Argentina', super: 'Supercopa Argentina' },
  AU: { major: 'Australia Cup' },
  AT: { major: 'ÖFB-Cup' },
  BE: { major: 'Belgian Cup', super: 'Belgian Super Cup' },
  BR: { major: 'Copa do Brasil', super: 'Supercopa do Brasil' },
  CN: { major: 'Chinese FA Cup', super: 'Chinese Super Cup' },
  DK: { major: 'Danish Cup' },
  GB: { major: 'FA Cup', league: 'EFL Cup', super: 'Community Shield' },
  FR: { major: 'Coupe de France', super: 'Trophée des Champions' },
  DE: { major: 'DFB-Pokal', super: 'DFL-Supercup' },
  IN: { major: 'Super Cup' },
  IE: { major: 'FAI Cup' },
  IT: { major: 'Coppa Italia', super: 'Supercoppa Italiana' },
  NL: { major: 'KNVB Cup', super: 'Johan Cruyff Shield' },
  NO: { major: 'Norwegian Cup' },
  PL: { major: 'Polish Cup', super: 'Polish Super Cup' },
  PT: { major: 'Taça de Portugal', league: 'Taça da Liga', super: 'Supertaça' },
  RO: { major: 'Cupa României', super: 'Supercupa României' },
  SA: { major: "King's Cup", super: 'Saudi Super Cup' },
  SCO: { major: 'Scottish Cup', league: 'Scottish League Cup' },
  KR: { major: 'Korean FA Cup' },
  ES: { major: 'Copa del Rey', super: 'Supercopa de España' },
  SE: { major: 'Svenska Cupen' },
  CH: { major: 'Swiss Cup' },
  TR: { major: 'Turkish Cup', super: 'Turkish Super Cup' },
  US: { major: 'US Open Cup' },
};

/** The real major/league cup name for a country, or a sensible generic. */
export function cupName(countryId: string, kind: 'MAJOR' | 'LEAGUE'): string {
  const names = CUP_NAMES[countryId];
  if (kind === 'MAJOR') return names?.major ?? `${countryId} Cup`;
  return names?.league ?? `${countryId} League Cup`;
}

/** The real super-cup name for a country, or a sensible generic. */
export const superCupName = (countryId: string): string => CUP_NAMES[countryId]?.super ?? `${countryId} Super Cup`;

/** Whether a country actually runs a secondary league cup (only a few do). */
export const hasLeagueCup = (countryId: string): boolean => !!CUP_NAMES[countryId]?.league;
