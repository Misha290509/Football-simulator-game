// ---------------------------------------------------------------------------
// 2D live-match pitch view (§ Living Match Day). A pure renderer over the live
// match state: 22 dots laid out from each side's formation slots, a ball marker
// driven by momentum + the latest chance, per-player rating rings and card
// flags. No engine coupling — it just draws what the tick loop already emits.
// ---------------------------------------------------------------------------

import { useMemo } from 'react';
import { FORMATIONS, formationRows } from '../../engine/lineup';
import type { LiveMatchState, LiveSideState } from '../../engine/liveMatch';
import type { Player } from '../../types/player';
import type { Club } from '../../types/club';

const W = 100, H = 64;

/** Slot → pitch coordinates for the home half (away is mirrored). */
function slotCoords(formation: string): { x: number; y: number }[] {
  const rows = formationRows(FORMATIONS[formation] ? formation : '4-3-3');
  const coords: { x: number; y: number }[] = [{ x: 5.5, y: H / 2 }]; // GK
  const nRows = rows.length;
  rows.forEach((count, ri) => {
    const x = 14 + ((ri + 0.75) * 31) / nRows; // defence ~18 → attack ~45
    for (let j = 0; j < count; j++) {
      coords.push({ x, y: ((j + 0.5) * H) / count });
    }
  });
  return coords;
}

function ratingStroke(rating?: number): string {
  if (rating == null) return 'rgba(255,255,255,0.35)';
  if (rating >= 7.6) return '#34d399';
  if (rating <= 5.9) return '#fb7185';
  return 'rgba(255,255,255,0.35)';
}

interface SideDot { id: string; x: number; y: number; label: string; rating?: number; yellow?: boolean; red?: boolean; gk: boolean }

function sideDots(
  side: LiveSideState,
  players: Record<string, Player>,
  stats: LiveMatchState['stats'],
  mirror: boolean,
): SideDot[] {
  const formation = side.formation ?? '4-3-3';
  const slots = FORMATIONS[formation] ?? FORMATIONS['4-3-3'];
  const coords = slotCoords(formation);
  const dots: SideDot[] = [];
  // The on-pitch list is kept in formation-slot order by the live engine, so we
  // map it position-for-position — a substitution swaps the player in that exact
  // slot rather than reshuffling the whole XI.
  side.onPitch.forEach((pid, i) => {
    const p = players[pid];
    const c = coords[i];
    if (!p || !c) return;
    const slot = slots[i] ?? 'CM';
    const st = stats[pid];
    dots.push({
      id: pid,
      x: mirror ? W - c.x : c.x,
      y: mirror ? H - c.y : c.y,
      label: p.name.last.length > 11 ? `${p.name.last.slice(0, 10)}…` : p.name.last,
      rating: st?.rating,
      yellow: st?.yellow,
      red: st?.red,
      gk: slot === 'GK',
    });
  });
  return dots;
}

export function PitchView({ live, players, homeClub, awayClub }: {
  live: LiveMatchState;
  players: Record<string, Player>;
  homeClub?: Club;
  awayClub?: Club;
}) {
  const homeKey = live.home.onPitch.join(',') + (live.home.formation ?? '');
  const awayKey = live.away.onPitch.join(',') + (live.away.formation ?? '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const home = useMemo(() => sideDots(live.home, players, live.stats, false), [homeKey, players, live.stats]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const away = useMemo(() => sideDots(live.away, players, live.stats, true), [awayKey, players, live.stats]);

  // Ball position: latest chance snaps it to that goal mouth; otherwise it
  // drifts with momentum (+100 = home pressure = ball near the away goal).
  const lastAction = [...live.events].reverse().find((e) =>
    e.type === 'GOAL' || e.type === 'SAVE' || e.type === 'BIG_CHANCE' || e.type === 'SHOT');
  const actionFresh = lastAction && live.minute - lastAction.minute <= 1 && live.phase !== 'PREMATCH';
  const ballX = actionFresh ? (lastAction!.side === 'home' ? 92 : 8) : 50 + live.momentum * 0.34;
  const ballY = actionFresh ? H / 2 + ((lastAction!.minute % 3) - 1) * 9 : H / 2 + Math.sin(live.minute / 4) * 6;

  const lastEvent = live.events[live.events.length - 1];
  const goalFlash = lastEvent?.type === 'GOAL' && live.minute - lastEvent.minute <= 1;

  const homeColor = homeClub?.primaryColor ?? '#38bdf8';
  const awayColor = awayClub?.primaryColor ?? '#f43f5e';

  const dot = (d: SideDot, color: string) => (
    <g key={d.id} style={{ transform: `translate(${d.x}px, ${d.y}px)`, transition: 'transform 900ms ease' }}>
      <circle r={1.9} fill={color} stroke={ratingStroke(d.rating)} strokeWidth={0.45} opacity={d.red ? 0.35 : 1} />
      {d.gk && <circle r={2.6} fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth={0.25} />}
      {d.yellow && !d.red && <rect x={1.2} y={-3.1} width={1.1} height={1.6} rx={0.2} fill="#facc15" />}
      {d.red && <rect x={1.2} y={-3.1} width={1.1} height={1.6} rx={0.2} fill="#ef4444" />}
      <text y={4.4} textAnchor="middle" fontSize={2} fill="#cbd5e1" style={{ pointerEvents: 'none' }}>{d.label}</text>
    </g>
  );

  return (
    <div className="card p-3">
      <div className="flex items-center justify-between text-xs text-slate-400 mb-2 px-1">
        <span><span className="inline-block w-2.5 h-2.5 rounded-full align-middle mr-1.5" style={{ background: homeColor }} />{homeClub?.shortName} <span className="text-slate-600 font-mono">{live.home.formation ?? ''}</span></span>
        <span className="text-slate-600">{live.phase === 'PREMATCH' ? 'Line-ups' : `${live.minute}'`}</span>
        <span><span className="text-slate-600 font-mono">{live.away.formation ?? ''}</span> {awayClub?.shortName}<span className="inline-block w-2.5 h-2.5 rounded-full align-middle ml-1.5" style={{ background: awayColor }} /></span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded" role="img" aria-label="Live pitch view">
        {/* Turf with mown stripes */}
        {Array.from({ length: 8 }, (_, i) => (
          <rect key={i} x={(i * W) / 8} y={0} width={W / 8} height={H} fill={i % 2 ? '#14532d' : '#15803d'} opacity={0.55} />
        ))}
        {/* Markings */}
        <g stroke="rgba(255,255,255,0.35)" strokeWidth={0.3} fill="none">
          <rect x={1} y={1} width={W - 2} height={H - 2} rx={0.5} />
          <line x1={W / 2} y1={1} x2={W / 2} y2={H - 1} />
          <circle cx={W / 2} cy={H / 2} r={6.5} />
          <rect x={1} y={H / 2 - 13} width={12} height={26} />
          <rect x={W - 13} y={H / 2 - 13} width={12} height={26} />
          <rect x={1} y={H / 2 - 6} width={4.5} height={12} />
          <rect x={W - 5.5} y={H / 2 - 6} width={4.5} height={12} />
          <rect x={0.2} y={H / 2 - 3.6} width={0.8} height={7.2} stroke="rgba(255,255,255,0.6)" />
          <rect x={W - 1} y={H / 2 - 3.6} width={0.8} height={7.2} stroke="rgba(255,255,255,0.6)" />
        </g>

        {home.map((d) => dot(d, homeColor))}
        {away.map((d) => dot(d, awayColor))}

        {/* Ball */}
        {live.phase !== 'PREMATCH' && live.phase !== 'FULL_TIME' && (
          <g style={{ transform: `translate(${ballX}px, ${ballY}px)`, transition: 'transform 650ms ease' }}>
            <circle r={1} fill="#fff" stroke="#0f172a" strokeWidth={0.25} />
          </g>
        )}

        {goalFlash && (
          <text x={W / 2} y={H / 2 - 10} textAnchor="middle" fontSize={7} fontWeight={800} fill="#fbbf24" stroke="#78350f" strokeWidth={0.25} className="animate-pulse" style={{ pointerEvents: 'none' }}>
            GOAL!
          </text>
        )}
      </svg>
    </div>
  );
}
