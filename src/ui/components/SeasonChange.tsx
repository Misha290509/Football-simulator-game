// Shared UI for a player's season-over-season movement: the OVR swing badge and
// the per-attribute change panel. Fed by Player.lastSeasonChange, captured at the
// season rollover in engine/development.ts. Used on the Squad table (expandable
// row) and the Player Profile.

import type { Player } from '../../types/player';
import {
  TECHNICAL_KEYS, MENTAL_KEYS, PHYSICAL_KEYS, GOALKEEPING_KEYS,
} from '../../types/attributes';

const ORDERED_KEYS = [...TECHNICAL_KEYS, ...MENTAL_KEYS, ...PHYSICAL_KEYS, ...GOALKEEPING_KEYS];

/** camelCase attribute key → spaced label (rendered with `capitalize`). */
export function attrLabel(k: string): string {
  return k.replace(/([A-Z])/g, ' $1').trim();
}

/**
 * OVR movement over the most recent completed season, or null if there is no
 * baseline yet (a brand-new signing or youth who hasn't lived through a
 * rollover). Prefers the recorded change; falls back to the OVR history so the
 * badge works on saves created before per-attribute tracking existed.
 */
export function seasonOvrDelta(p: Player): number | null {
  if (p.lastSeasonChange) return p.lastSeasonChange.ovrTo - p.lastSeasonChange.ovrFrom;
  const log = p.developmentLog;
  if (log && log.length >= 2) return log[log.length - 1].ovr - log[log.length - 2].ovr;
  return null;
}

/** A small green ▲+n / red ▼-n chip. Renders nothing for a zero/absent delta. */
export function DeltaBadge({ delta, className = '' }: { delta: number | null; className?: string }) {
  if (delta == null || delta === 0) return null;
  const up = delta > 0;
  return (
    <span className={`font-mono text-xs font-semibold ${up ? 'text-emerald-400' : 'text-rose-400'} ${className}`}>
      {up ? '▲+' : '▼'}{delta}
    </span>
  );
}

/** The OVR-change badge for a player (season just completed). */
export function OvrDeltaBadge({ player, className }: { player: Player; className?: string }) {
  return <DeltaBadge delta={seasonOvrDelta(player)} className={className} />;
}

/**
 * The expandable detail for the squad view: OVR line plus a chip per individual
 * attribute that moved last season. Returns null when there is nothing recorded
 * yet, so callers can decide whether to show an affordance at all.
 */
export function StatChangePanel({ player }: { player: Player }) {
  const change = player.lastSeasonChange;
  if (!change) return null;
  const keys = ORDERED_KEYS.filter((k) => change.attrs[k]);
  return (
    <div className="space-y-2">
      <div className="text-xs text-slate-400">
        Last season · OVR {change.ovrFrom} → {change.ovrTo}
        <DeltaBadge delta={change.ovrTo - change.ovrFrom} className="ml-1.5" />
      </div>
      {keys.length === 0 ? (
        <p className="text-xs text-slate-500">No individual attributes moved last season.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {keys.map((k) => {
            const d = change.attrs[k];
            const up = d > 0;
            return (
              <span
                key={k}
                className={`text-[11px] px-2 py-0.5 rounded-full border capitalize ${
                  up ? 'border-emerald-500/30 text-emerald-300' : 'border-rose-500/30 text-rose-300'
                }`}
              >
                {attrLabel(k)} {up ? '+' : ''}{d}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
