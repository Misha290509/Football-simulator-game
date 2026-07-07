import { useMemo, useState } from 'react';
import { useGameStore } from '../../state/store';
import { CrestBadge } from '../components/Rating';
import { computeStandings } from '../../engine/standings';
import { applyPointsPenalties } from '../../game/ffp';
import type { StandingRow } from '../../types/league';

export function Standings() {
  const meta = useGameStore((s) => s.meta)!;
  const clubs = useGameStore((s) => s.clubs);
  const seasonMatches = useGameStore((s) => s.currentSeasonMatches());
  const managerClubId = meta.managerClubId;

  const competitions = Object.values(meta.competitions).sort((a, b) => a.tier - b.tier);
  const [compId, setCompId] = useState(competitions[0]?.id);
  const comp = meta.competitions[compId];

  const rows = useMemo(
    () => applyPointsPenalties(computeStandings(comp, seasonMatches), meta.pointsPenalties),
    [comp, seasonMatches, meta.pointsPenalties],
  );

  // Conference-format competitions (MLS) render one table per conference.
  if (comp.conferences) {
    const names = comp.conferences.names;
    const qual = comp.conferences.playoffQualifiersPerConference;
    return (
      <div className="space-y-4">
        <h1 className="page-title">Standings</h1>
        <div className="flex gap-2">
          {competitions.map((c) => (
            <button key={c.id} className={compId === c.id ? 'btn-primary' : 'btn-ghost'} onClick={() => setCompId(c.id)}>
              {c.name}
            </button>
          ))}
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          {names.map((conf, ci) => {
            const confRows = rows.filter((_r, idx) => idx % names.length === ci);
            return (
              <div key={conf} className="overflow-x-auto card">
                <div className="px-3 py-2 text-sm font-semibold text-slate-300 border-b border-surface-600">{conf} Conference</div>
                <table className="data-table">
                  <thead><tr><th>#</th><th>Club</th><th className="text-right">P</th><th className="text-right">Pts</th></tr></thead>
                  <tbody>
                    {confRows.map((r, i) => {
                      const club = clubs[r.clubId];
                      return (
                        <tr key={r.clubId} className={r.clubId === managerClubId ? 'bg-accent/10' : ''}>
                          <td className={`text-slate-500 ${i < qual ? 'border-l-2 border-sky-500' : 'border-l-2 border-transparent'}`}>{i + 1}</td>
                          <td><span className="flex items-center gap-2"><CrestBadge abbrev={club.abbrev} color={club.primaryColor} size={20} />{club.name}</span></td>
                          <td className="text-right">{r.played}</td>
                          <td className="text-right font-semibold">{r.points}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-slate-500"><span className="text-sky-500">▌</span> Playoff qualification · champion decided in the post-season bracket.</p>
      </div>
    );
  }

  // Zone coloring from the rule config.
  const relegateCount = comp.promotion?.autoRelegate ?? 0;
  const playoffStart = comp.promotion?.autoPromote ?? 0;
  const playoffEnd = playoffStart + (comp.promotion?.promotionPlayoffSlots ?? 0);

  const zoneClass = (pos: number): string => {
    if (comp.tier > 1 && pos < (comp.promotion?.autoPromote ?? 0))
      return 'border-l-2 border-emerald-500';
    if (comp.tier > 1 && pos >= playoffStart && pos < playoffEnd)
      return 'border-l-2 border-sky-500';
    if (pos >= rows.length - relegateCount && relegateCount > 0)
      return 'border-l-2 border-red-500';
    return 'border-l-2 border-transparent';
  };

  const gd = (r: StandingRow) => r.goalsFor - r.goalsAgainst;

  return (
    <div className="space-y-4">
      <h1 className="page-title">Standings</h1>

      <div className="flex gap-2">
        {competitions.map((c) => (
          <button
            key={c.id}
            className={compId === c.id ? 'btn-primary' : 'btn-ghost'}
            onClick={() => setCompId(c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto card">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-8">#</th>
              <th>Club</th>
              <th className="text-right">P</th>
              <th className="text-right">W</th>
              <th className="text-right">D</th>
              <th className="text-right">L</th>
              <th className="text-right">GF</th>
              <th className="text-right">GA</th>
              <th className="text-right">GD</th>
              <th className="text-right">Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const club = clubs[r.clubId];
              const isManager = r.clubId === managerClubId;
              return (
                <tr key={r.clubId} className={isManager ? 'bg-accent/10' : ''}>
                  <td className={`text-slate-500 ${zoneClass(i)}`}>{i + 1}</td>
                  <td>
                    <span className="flex items-center gap-2">
                      <CrestBadge abbrev={club.abbrev} color={club.primaryColor} size={20} />
                      <span className={isManager ? 'font-semibold text-white' : ''}>
                        {club.name}
                      </span>
                    </span>
                  </td>
                  <td className="text-right">{r.played}</td>
                  <td className="text-right">{r.won}</td>
                  <td className="text-right">{r.drawn}</td>
                  <td className="text-right">{r.lost}</td>
                  <td className="text-right">{r.goalsFor}</td>
                  <td className="text-right">{r.goalsAgainst}</td>
                  <td className="text-right">{gd(r) > 0 ? `+${gd(r)}` : gd(r)}</td>
                  <td className="text-right font-semibold">{r.points}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex gap-4 text-xs text-slate-500">
        {comp.tier > 1 && (comp.promotion?.autoPromote ?? 0) > 0 && (
          <span><span className="text-emerald-500">▌</span> Promotion</span>
        )}
        {comp.tier > 1 && (comp.promotion?.promotionPlayoffSlots ?? 0) > 0 && (
          <span><span className="text-sky-500">▌</span> Play-offs</span>
        )}
        {relegateCount > 0 && (
          <span><span className="text-red-500">▌</span> Relegation</span>
        )}
        <span className="ml-auto">
          Tiebreakers: {comp.tiebreakers.join(' → ')}
        </span>
      </div>
    </div>
  );
}
