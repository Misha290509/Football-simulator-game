import { useNavigate, useParams } from 'react-router-dom';
import { useGameStore } from '../../state/store';
import { CrestBadge } from '../components/Rating';
import { ratingColor, fullName } from '../format';
import type { MatchEvent, MatchShot, Match } from '../../types/match';
import type { Club } from '../../types/club';

import { commentaryLine, goalFlourish } from '../../game/commentary';

const SHOT_FILL: Record<MatchShot['outcome'], string> = {
  GOAL: '#34d399', // emerald
  SAVED: '#38bdf8', // sky
  OFF: '#64748b', // slate
};

/**
 * Post-match shot map (§ Match visualisation). Home attacks the right goal, away
 * the left; each dot is a shot, sized by xG and coloured by outcome. Positions
 * are the deterministic locations the engine recorded at simulation time.
 */
function ShotMap({ match, home, away }: { match: Match; home?: Club; away?: Club }) {
  const shots = match.shots ?? [];
  if (shots.length === 0) return null;
  const W = 100, H = 64;
  const r = (xg: number) => 0.9 + Math.min(1, xg / 0.5) * 2.8;
  // Home shoots toward x=100 (right); away is mirrored toward x=0 (left).
  const place = (s: MatchShot) => (s.side === 'home' ? { cx: s.x, cy: s.y * H / 100 } : { cx: W - s.x, cy: H - s.y * H / 100 });
  const count = (side: 'home' | 'away', o: MatchShot['outcome']) => shots.filter((s) => s.side === side && s.outcome === o).length;
  const Line = ({ side }: { side: 'home' | 'away' }) => (
    <span className="flex items-center gap-2 text-[11px] text-slate-500">
      <CrestBadge abbrev={(side === 'home' ? home : away)?.abbrev ?? '?'} color={(side === 'home' ? home : away)?.primaryColor ?? '#888'} size={16} />
      <span>{shots.filter((s) => s.side === side).length} shots</span>
      <span className="text-emerald-400">{count(side, 'GOAL')} goals</span>
      <span className="text-sky-400">{count(side, 'SAVED')} on target</span>
    </span>
  );

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-400">Shot map</h2>
        <span className="text-[11px] text-slate-500">dot size = xG</span>
      </div>
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-2xl mx-auto block" style={{ background: '#0f2417', borderRadius: 8 }}>
          {/* Pitch markings */}
          <g stroke="#2f6f47" strokeWidth={0.4} fill="none">
            <rect x={1} y={1} width={W - 2} height={H - 2} rx={1} />
            <line x1={W / 2} y1={1} x2={W / 2} y2={H - 1} />
            <circle cx={W / 2} cy={H / 2} r={7} />
            <rect x={1} y={H / 2 - 12} width={13} height={24} />
            <rect x={W - 14} y={H / 2 - 12} width={13} height={24} />
            <rect x={1} y={H / 2 - 5} width={5} height={10} />
            <rect x={W - 6} y={H / 2 - 5} width={5} height={10} />
          </g>
          {shots.map((s, i) => {
            const { cx, cy } = place(s);
            const isGoal = s.outcome === 'GOAL';
            return (
              <circle
                key={i} cx={cx} cy={cy} r={r(s.xg)}
                fill={SHOT_FILL[s.outcome]} fillOpacity={isGoal ? 0.95 : 0.55}
                stroke={isGoal ? '#ecfdf5' : 'none'} strokeWidth={isGoal ? 0.5 : 0}
              >
                <title>{`${s.minute}' · xG ${s.xg.toFixed(2)} · ${s.outcome === 'OFF' ? 'off target' : s.outcome.toLowerCase()}`}</title>
              </circle>
            );
          })}
        </svg>
      </div>
      <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
        <Line side="home" />
        <Line side="away" />
      </div>
    </div>
  );
}

const WEATHER_ICON: Record<string, string> = { CLEAR: '☀️', RAIN: '🌧️', WIND: '💨', SNOW: '❄️', HOT: '🔥' };

const EVENT_ICON: Record<string, string> = {
  GOAL: '⚽',
  YELLOW: '🟨',
  RED: '🟥',
  SAVE: '🧤',
  BIG_CHANCE: '⚠️',
  INJURY: '➕',
  SUB: '🔁',
  PENALTY: '🎯',
};

export function MatchDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const match = useGameStore((s) => (id ? s.matches[id] : undefined));
  const clubs = useGameStore((s) => s.clubs);
  const players = useGameStore((s) => s.players);

  if (!match) {
    return (
      <div className="space-y-4">
        <p className="text-slate-400">Match not found (it may be from a past season).</p>
        <button className="btn-ghost" onClick={() => navigate(-1)}>Back</button>
      </div>
    );
  }

  const home = clubs[match.homeClubId];
  const away = clubs[match.awayClubId];
  const nameOf = (pid?: string) => (pid && players[pid] ? fullName(players[pid]) : 'Unknown');

  const timeline = [...match.events].filter(
    (e) => !['KICKOFF', 'FULLTIME'].includes(e.type),
  );

  const topRatings = [...match.playerStats]
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <button className="btn-ghost" onClick={() => navigate(-1)}>← Back</button>

      <div className="card p-6">
        <div className="flex items-center justify-center gap-6">
          <div className="flex-1 flex items-center justify-end gap-3">
            <span className="text-lg font-semibold text-right">{home.name}</span>
            <CrestBadge abbrev={home.abbrev} color={home.primaryColor} size={40} />
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold font-mono">
              {match.homeGoals} – {match.awayGoals}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              xG {match.homeXg.toFixed(2)} – {match.awayXg.toFixed(2)}
            </div>
            {(match.weather || match.referee) && (
              <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-center gap-2">
                {match.weather && <span title="Weather">{WEATHER_ICON[match.weather]} {match.weather.charAt(0) + match.weather.slice(1).toLowerCase()}</span>}
                {match.referee && <span title="Referee">· 🧑‍⚖️ {match.referee}</span>}
              </div>
            )}
          </div>
          <div className="flex-1 flex items-center gap-3">
            <CrestBadge abbrev={away.abbrev} color={away.primaryColor} size={40} />
            <span className="text-lg font-semibold">{away.name}</span>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-3">Timeline</h2>
          <div className="space-y-1">
            {timeline.length === 0 && (
              <p className="text-sm text-slate-500">A quiet, goalless affair.</p>
            )}
            {timeline.map((e: MatchEvent, idx) => (
              <div
                key={idx}
                className={`flex items-center gap-2 text-sm ${
                  e.side === 'away' ? 'flex-row-reverse text-right' : ''
                }`}
              >
                <span className="text-xs text-slate-500 w-8">{e.minute}'</span>
                <span>{EVENT_ICON[e.type] ?? '•'}</span>
                <span className="flex-1">
                  {e.type === 'GOAL' ? (
                    <>
                      <strong>{nameOf(e.playerId)}</strong>
                      <span className="text-slate-400"> {goalFlourish(e, match.seed)}</span>
                      {e.assistPlayerId && (
                        <span className="text-slate-500"> (assist {nameOf(e.assistPlayerId)})</span>
                      )}
                    </>
                  ) : e.type === 'SUB' ? (
                    <>
                      <span className="text-emerald-400">▲ {nameOf(e.playerId)}</span>
                      <span className="text-slate-500"> for </span>
                      <span className="text-red-400">▼ {nameOf(e.assistPlayerId)}</span>
                    </>
                  ) : (
                    <>
                      {nameOf(e.playerId)} <span className="text-slate-500">— {commentaryLine(e, match.seed)}</span>
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-3">Top ratings</h2>
          <div className="space-y-1">
            {topRatings.map((s) => (
              <div key={s.playerId} className="flex items-center justify-between text-sm">
                <span>{nameOf(s.playerId)}</span>
                <span className="flex items-center gap-3 text-slate-500 text-xs">
                  {s.goals > 0 && <span>{s.goals}⚽</span>}
                  {s.assists > 0 && <span>{s.assists}🅰️</span>}
                  <span className={`font-mono font-semibold ${ratingColor(s.rating * 10)}`}>
                    {s.rating.toFixed(1)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ShotMap match={match} home={home} away={away} />
    </div>
  );
}
