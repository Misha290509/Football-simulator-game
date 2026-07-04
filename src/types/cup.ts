// ---------------------------------------------------------------------------
// Domestic cups & Super Cup (§ Cups). Calendar-integrated single-elimination
// knockouts, one MAJOR cup (all clubs of a nation) and one LEAGUE cup (top two
// tiers) per country, plus a one-off SUPER cup (league champion vs major-cup
// winner) as the season opener. Their ties are ordinary (non-neutral) fixtures
// on the class-2 calendar days; this state tracks each cup's progress so the
// next round can be drawn once the current one finishes.
// ---------------------------------------------------------------------------

export type CupKind = 'MAJOR' | 'LEAGUE' | 'SUPER';

export interface DomesticCupState {
  id: string;         // e.g. "cup_GB_MAJOR", "cup_GB_LEAGUE", "supercup_GB"
  name: string;       // "England Cup", "England League Cup", "England Super Cup"
  countryId: string;
  kind: CupKind;
  seasonId: string;
  year: number;
  clubIds: string[];  // entrants
  stage: 'KO' | 'DONE';
  /** Label of the round currently being played (e.g. "Quarter-final"). */
  roundLabel?: string;
  /** Clubs given a bye in the current round (carried to the next). */
  byes?: string[];
  /** Reserved calendar days for the remaining rounds. */
  koDays?: number[];
  championId?: string | null;
  runnerUpId?: string | null;
}
