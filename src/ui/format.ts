import type { Player } from '../types/player';

export function ageOf(player: Player, currentYear: number): number {
  return currentYear - player.born.year;
}

export function fullName(player: Player): string {
  return `${player.name.first} ${player.name.last}`.trim();
}

const money = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 0,
});

export function formatMoney(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `£${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `£${(n / 1_000).toFixed(0)}K`;
  return money.format(n);
}

export function formatWage(n: number): string {
  return `${formatMoney(n)}/wk`;
}

export interface PlayerStatus {
  label: string;
  className: string;
}

/** Availability status for a player (injury / suspension / fit). */
export function playerStatus(player: Player): PlayerStatus {
  if (player.injury) {
    return {
      label: `Injured ~${player.injury.weeksOut}w`,
      className: 'bg-red-500/20 text-red-300',
    };
  }
  if (player.cards.suspendedFor > 0) {
    return {
      label: `Susp. ${player.cards.suspendedFor}m`,
      className: 'bg-amber-500/20 text-amber-300',
    };
  }
  if (player.fitness < 70) {
    return { label: `Tired ${player.fitness}%`, className: 'bg-orange-500/15 text-orange-300' };
  }
  return { label: 'Available', className: 'bg-emerald-500/15 text-emerald-300' };
}

/** Tailwind text color class for an OVR/POT value (0–100). */
export function ratingColor(v: number): string {
  if (v >= 85) return 'text-emerald-400';
  if (v >= 75) return 'text-green-400';
  if (v >= 65) return 'text-lime-400';
  if (v >= 55) return 'text-yellow-400';
  if (v >= 45) return 'text-orange-400';
  return 'text-red-400';
}
