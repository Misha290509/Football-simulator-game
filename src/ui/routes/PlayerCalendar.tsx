import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../state/store';
import { playerCareerOf } from '../../game/playerCareer';
import { seasonPhase, congestion, buildCalendar, type SeasonPhase } from '../../game/seasonStructure';

const PHASE_TONE: Record<SeasonPhase, string> = {
  PRESEASON: 'bg-slate-500/10 text-slate-300 border-slate-500/25',
  EARLY: 'bg-sky-500/10 text-sky-300 border-sky-500/25',
  AUTUMN: 'bg-amber-500/10 text-amber-300 border-amber-500/25',
  CHRISTMAS: 'bg-rose-500/10 text-rose-300 border-rose-500/25',
  WINTER_BREAK: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/25',
  SPRING: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
  RUN_IN: 'bg-violet-500/10 text-violet-300 border-violet-500/25',
};
const PHASE_SHORT: Record<SeasonPhase, string> = {
  PRESEASON: 'Pre-season', EARLY: 'Early', AUTUMN: 'Autumn', CHRISTMAS: 'Christmas',
  WINTER_BREAK: 'Break', SPRING: 'Spring', RUN_IN: 'Run-in',
};

/**
 * The season laid out as a shape rather than a list — where he is in the year,
 * how many games are coming at him, what the club is playing for, and every
 * fixture with the phase it falls in.
 */
export function PlayerCalendar() {
  const navigate = useNavigate();
  const meta = useGameStore((s) => s.meta);
  const clubs = useGameStore((s) => s.clubs);
  const matches = useGameStore((s) => s.matches);
  const seasonMatches = useGameStore((s) => s.currentSeasonMatches());
  const maxDay = useGameStore((s) => s.seasonRefMaxDay());
  const players = useGameStore((s) => s.players);
  const career = playerCareerOf(meta);
  const avatar = career ? players[career.playerId] : undefined;
  const clubId = avatar?.contract.clubId;

  const entries = useMemo(() => {
    if (!clubId || !meta) return [];
    const clubNames = Object.fromEntries(Object.values(clubs).map((c) => [c.id, c.shortName ?? c.name]));
    const compNames = Object.fromEntries(Object.values(meta.competitions).map((c) => [c.id, c.name]));
    return buildCalendar(seasonMatches, clubId, clubNames, compNames, maxDay, clubs[clubId]?.countryId);
  }, [seasonMatches, clubId, clubs, meta, maxDay]);

  if (!meta || !career || !avatar || !clubId) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-slate-400">This save isn’t a player career.</p>
        <button className="btn-primary" onClick={() => navigate('/dashboard')}>Go to dashboard</button>
      </div>
    );
  }

  const phase = seasonPhase(meta.currentDay, maxDay, clubs[clubId]?.countryId);
  const con = congestion(Object.values(matches), clubId, meta.currentDay);
  const race = career.race;
  const tour = career.tour;
  const played = entries.filter((e) => e.played).length;

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl font-bold">The season</h1>
        <p className="text-xs text-slate-500">{played} of {entries.length} played · day {meta.currentDay} of {maxDay}</p>
      </div>

      {/* Where we are */}
      <div className="card p-4 space-y-2">
        <div className="flex items-center gap-2">
          <span className={`text-[11px] px-2 py-0.5 rounded-full border ${PHASE_TONE[phase.phase]}`}>{phase.label}</span>
          <div className="flex-1 h-1.5 rounded-full bg-slate-700/60 overflow-hidden">
            <div className="h-full bg-emerald-400" style={{ width: `${maxDay ? Math.min(100, (meta.currentDay / maxDay) * 100) : 0}%` }} />
          </div>
        </div>
        <p className="text-sm text-slate-300">{phase.blurb}</p>
        {con.note && <p className="text-xs text-amber-300/90">📅 {con.count} game{con.count === 1 ? '' : 's'} in the next fortnight — {con.note}</p>}
      </div>

      {/* What we're playing for */}
      {race && race.kind !== 'NOTHING' && (
        <div className="card p-4 space-y-1 border-violet-500/30">
          <h2 className="text-sm font-semibold text-violet-300">🏁 {race.label}</h2>
          <p className="text-sm text-slate-300">{race.blurb}</p>
          <p className="text-[11px] text-slate-500">{race.position}th · {race.gamesLeft} to play · {race.gap} point{race.gap === 1 ? '' : 's'} in it</p>
        </div>
      )}

      {/* Where July was spent */}
      {tour && (
        <div className="card p-4 space-y-1">
          <h2 className="text-sm font-semibold text-slate-300">✈️ Pre-season: {tour.destination}</h2>
          <p className="text-xs text-slate-400">
            {tour.fitness >= 0 ? `Came back ${tour.fitness} points sharper.` : `Came back ${-tour.fitness} points off it.`}
            {tour.following > 10_000 ? ` Picked up ${Math.round(tour.following / 1000)}k new followers on the way.` : ''}
          </p>
        </div>
      )}

      {/* Fixture by fixture */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-2 text-sm font-semibold text-slate-300 border-b border-slate-700/60">Fixtures</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {entries.map((e, i) => {
                const next = !e.played && entries.slice(0, i).every((x) => x.played);
                return (
                  <tr key={`${e.day}_${e.opponent}_${i}`} className={`border-t border-slate-800/60 ${next ? 'bg-emerald-500/5' : ''}`}>
                    <td className="px-3 py-1.5 text-[11px] text-slate-500 whitespace-nowrap">d{e.day}</td>
                    <td className="px-2 py-1.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${PHASE_TONE[e.phase]}`}>{PHASE_SHORT[e.phase]}</span>
                    </td>
                    <td className="px-2 py-1.5 text-slate-500 text-xs w-8">{e.home ? 'H' : 'A'}</td>
                    <td className="px-2 py-1.5 text-slate-200">{e.opponent}</td>
                    <td className="px-2 py-1.5 text-[11px] text-slate-500 hidden sm:table-cell">{e.competition}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-300">{e.score ?? (next ? 'next' : '—')}</td>
                  </tr>
                );
              })}
              {entries.length === 0 && (
                <tr><td className="px-4 py-6 text-center text-slate-500 text-sm">No fixtures scheduled.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <button className="btn-ghost w-full" onClick={() => navigate('/my-player')}>Back to My Player</button>
    </div>
  );
}
