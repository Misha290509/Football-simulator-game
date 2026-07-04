// ---------------------------------------------------------------------------
// Continental club competitions (§ Continental). The Champions League, Europa
// League and Conference League (UEFA, Swiss league phase → knockout) and the
// Club World Cup (FIFA, groups → knockout). Their matches live on the club
// calendar as ordinary (non-neutral) fixtures; this state tracks each
// competition's progress so the knockout rounds can be drawn mid-season once
// the earlier phase finishes.
// ---------------------------------------------------------------------------

export type ContinentalId = 'UEFA_CL' | 'UEFA_EL' | 'UEFA_CONF' | 'FIFA_CWC';

export type ContinentalStage =
  | 'LEAGUE'      // Swiss league phase (CL/EL/Conf)
  | 'GROUPS'      // group stage (Club World Cup)
  | 'KO_PLAYOFF'  // knockout play-off round (league-phase 9th–24th)
  | 'KO'          // main knockout bracket (round derived from survivor count)
  | 'DONE';

export interface ContinentalState {
  id: ContinentalId;
  name: string;
  seasonId: string;
  year: number;
  format: 'swiss' | 'groups';
  /** Every participating club id. */
  clubIds: string[];
  /** Games each club plays in the league phase (8 CL/EL, 6 Conf); 0 for groups. */
  leaguePhaseGames: number;
  /** Group membership for the groups format (Club World Cup). */
  groups?: string[][];
  /** Current phase. */
  stage: ContinentalStage;
  /** League-phase top seeds held back for the Round of 16 (after the play-off). */
  alive?: string[];
  /** Teams given a bye in the current knockout round (carry to the next round). */
  byes?: string[];
  /** Stage label of the current knockout round (e.g. "Quarter-final"). */
  roundLabel?: string;
  /** Reserved calendar days for knockout rounds, spread through the back half. */
  koDays?: number[];
  /** Winner once the final is played. */
  championId?: string | null;
  /** Runner-up (final loser). */
  runnerUpId?: string | null;
  /** Prize money already credited, per club (avoids double payment). */
  prizePaid?: Record<string, number>;
}
