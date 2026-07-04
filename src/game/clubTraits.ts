// ---------------------------------------------------------------------------
// Club DNA — real-club personalities that bias results in specific contexts.
//
// These are deliberately NOT scripted outcomes. Each trait is a small strength
// multiplier (±6–10%) applied to a club's lineup in a particular kind of match,
// so tendencies emerge over a season without any single game being predetermined:
//   • Real Madrid / Liverpool rise in European knockouts.
//   • Barcelona / PSG flatter to deceive in Europe.
//   • Atlético freeze when a trophy is on the line.
//   • Arsenal, Spurs and Dortmund fade in the run-in.
//   • PSG, Bayern, City and Celtic bully their own league.
//   • Sevilla turn into a different animal in a cup tie.
// ---------------------------------------------------------------------------

import type { ClubTrait } from '../types/club';

/** What kind of match this is, for trait resolution. */
export interface MatchContext {
  kind: 'league' | 'continental' | 'cup';
  /** League run-in: the final stretch of the domestic season. */
  runIn?: boolean;
}

/** Human-readable name + blurb for each trait (UI). */
export const TRAIT_INFO: Record<ClubTrait, { label: string; blurb: string }> = {
  CONTINENTAL_KINGS: { label: 'Kings of Europe', blurb: 'Rises to the occasion in continental knockouts.' },
  CONTINENTAL_CHOKER: { label: 'European Frailty', blurb: 'Flatters to deceive on the continental stage.' },
  DOMESTIC_FORTRESS: { label: 'Domestic Juggernaut', blurb: 'Bullies its own league week in, week out.' },
  TROPHY_SHY: { label: 'Big-Game Nerves', blurb: 'Tightens up when silverware is on the line.' },
  BOTTLER: { label: 'Run-In Wobbles', blurb: 'Tends to fade when the title race heats up.' },
  CUP_SPECIALIST: { label: 'Cup Fighters', blurb: 'A different animal in knockout football.' },
};

/**
 * Strength multiplier for a club with `traits` in a given match context.
 * Multipliers stack multiplicatively; the neutral value is 1.
 */
export function traitStrengthMod(traits: ClubTrait[] | undefined, ctx: MatchContext): number {
  if (!traits || traits.length === 0) return 1;
  let m = 1;
  for (const t of traits) {
    switch (t) {
      case 'CONTINENTAL_KINGS':
        if (ctx.kind === 'continental') m *= 1.08;
        break;
      case 'CONTINENTAL_CHOKER':
        if (ctx.kind === 'continental') m *= 0.9;
        break;
      case 'DOMESTIC_FORTRESS':
        if (ctx.kind === 'league') m *= 1.06;
        break;
      case 'TROPHY_SHY':
        if (ctx.kind === 'cup' || ctx.kind === 'continental') m *= 0.9;
        break;
      case 'CUP_SPECIALIST':
        if (ctx.kind === 'cup') m *= 1.09;
        break;
      case 'BOTTLER':
        if (ctx.kind === 'league' && ctx.runIn) m *= 0.91;
        break;
    }
  }
  return m;
}

/** Strip accents + lowercase for resilient name matching across datasets. */
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

// Exact (normalized) club names → personality. Kept conservative: only clubs
// whose real-life reputation for these traits is well established.
const TRAITS_BY_NAME: Record<string, ClubTrait[]> = {
  'real madrid': ['CONTINENTAL_KINGS', 'DOMESTIC_FORTRESS'],
  'liverpool': ['CONTINENTAL_KINGS'],
  'fc barcelona': ['CONTINENTAL_CHOKER'],
  'atletico madrid': ['TROPHY_SHY'],
  'paris saint-germain': ['DOMESTIC_FORTRESS', 'CONTINENTAL_CHOKER'],
  'arsenal': ['BOTTLER'],
  'tottenham hotspur': ['BOTTLER', 'TROPHY_SHY'],
  'borussia dortmund': ['BOTTLER'],
  'fc bayern munchen': ['DOMESTIC_FORTRESS'],
  'manchester city': ['DOMESTIC_FORTRESS'],
  'celtic': ['DOMESTIC_FORTRESS'],
  'sevilla fc': ['CUP_SPECIALIST'],
};

/** Look up the real-club personality for a club name (empty if none). */
export function traitsForClub(name: string): ClubTrait[] {
  return TRAITS_BY_NAME[norm(name)] ?? [];
}
