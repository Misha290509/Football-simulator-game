// ---------------------------------------------------------------------------
// Dressing-room chemistry (§ Man-management). A pure, deterministic read of how
// well a squad gels: shared nationalities, time together, morale, ego friction
// and wage envy. Feeds a small (±4%) team-wide multiplier into the match
// profile, and a factor breakdown for the Squad screen. Not a player stat —
// it's an emergent property of the group, so signings reshape it.
// ---------------------------------------------------------------------------

import type { Player } from '../types/player';
import { clamp } from './rng';
import { egoOf } from './morale';

export interface ChemistryFactor { label: string; delta: number }
export interface ChemistryReport {
  score: number; // 0–100 (55 ≈ a normal, unremarkable dressing room)
  label: string;
  factors: ChemistryFactor[];
}

const median = (xs: number[]) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

export function chemistryLabel(score: number): string {
  if (score >= 78) return 'A band of brothers';
  if (score >= 66) return 'A tight-knit group';
  if (score >= 52) return 'Settled';
  if (score >= 40) return 'Some tension';
  return 'A fractured dressing room';
}

/**
 * Squad chemistry. `year` enables the tenure factor (omitted in the match path,
 * which has no calendar); everything else is derived from the players alone.
 */
export function squadChemistry(players: Player[], year?: number): ChemistryReport {
  const factors: ChemistryFactor[] = [];
  if (players.length === 0) return { score: 55, label: chemistryLabel(55), factors };

  // Shared nationalities: players with compatriots in the squad bond faster.
  const byNat = new Map<string, number>();
  for (const p of players) byNat.set(p.nationality, (byNat.get(p.nationality) ?? 0) + 1);
  const withCompatriots = players.filter((p) => (byNat.get(p.nationality) ?? 0) >= 3).length;
  const natFrac = withCompatriots / players.length;
  factors.push({ label: 'National blocs', delta: Math.round((natFrac - 0.35) * 14) });

  // Time together: a settled core beats a squad of strangers.
  if (year != null) {
    const avgTenure = players.reduce((s, p) => s + clamp(year - p.contract.startYear, 0, 8), 0) / players.length;
    factors.push({ label: 'Time together', delta: Math.round(clamp((avgTenure - 1.6) * 4, -8, 10)) });
  }

  // Mood of the group.
  const avgMorale = players.reduce((s, p) => s + p.morale, 0) / players.length;
  factors.push({ label: 'Squad morale', delta: Math.round((avgMorale - 58) * 0.3) });

  // Ego friction: one alpha is leadership; several is a power struggle.
  const bigEgos = players.filter((p) => egoOf(p) >= 70).length;
  factors.push({ label: 'Big egos', delta: bigEgos <= 1 ? 2 : -3 * (bigEgos - 1) });

  // Wage envy: a top earner far above the median breeds resentment.
  const wages = players.map((p) => p.contract.wage);
  const ratio = median(wages) > 0 ? Math.max(...wages) / median(wages) : 1;
  factors.push({ label: 'Wage gap', delta: ratio > 7 ? -8 : ratio > 4.5 ? -4 : 1 });

  const score = clamp(Math.round(55 + factors.reduce((s, f) => s + f.delta, 0)), 10, 95);
  return { score, label: chemistryLabel(score), factors };
}

/** Team-wide strength multiplier from chemistry — small but real (±4%). */
export function chemistryMod(players: Player[]): number {
  const { score } = squadChemistry(players);
  return 1 + (score - 55) / 1000;
}
