import { useNavigate, useParams } from 'react-router-dom';
import { useGameStore } from '../../state/store';
import { CrestBadge } from '../components/Rating';
import { ratingColor, fullName } from '../format';
import type { MatchEvent } from '../../types/match';

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
                      {nameOf(e.playerId)} <span className="text-slate-500">— {e.description}</span>
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
    </div>
  );
}
