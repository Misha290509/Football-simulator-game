import { useState } from 'react';
import { useGameStore } from '../../state/store';
import type { Award } from '../../types/league';
import { dynastyBoard } from '../../game/dynasty';

export function History() {
  const meta = useGameStore((s) => s.meta)!;
  const clubs = useGameStore((s) => s.clubs);
  const players = useGameStore((s) => s.players);
  const [tab, setTab] = useState<'honours' | 'hof' | 'dynasty'>('honours');

  const history = [...(meta.history ?? [])].reverse();
  const hof = [...(meta.hallOfFame ?? [])].sort((a, b) => b.peakOvr - a.peakOvr);
  const dynasty = dynastyBoard(meta.allTimeHonours);

  const subject = (a: Award): string => {
    if (a.playerId) return players[a.playerId] ? `${players[a.playerId].name.first} ${players[a.playerId].name.last}` : '—';
    if (a.clubId) return clubs[a.clubId]?.name ?? '—';
    return '—';
  };

  return (
    <div className="space-y-4">
      <h1 className="page-title">History</h1>

      <div className="flex gap-2">
        <button className={tab === 'honours' ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab('honours')}>Honours</button>
        <button className={tab === 'dynasty' ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab('dynasty')}>Dynasty</button>
        <button className={tab === 'hof' ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab('hof')}>Hall of Fame</button>
      </div>

      {tab === 'dynasty' ? (
        dynasty.length === 0 ? (
          <div className="card p-6 text-center text-slate-500">No silverware won yet — the all-time board fills as trophies are decided.</div>
        ) : (
          <div className="overflow-x-auto card">
            <table className="data-table w-full">
              <thead><tr><th>#</th><th>Club</th><th className="text-right">League</th><th className="text-right">Cups</th><th className="text-right">Continental</th><th className="text-right">Total</th></tr></thead>
              <tbody>
                {dynasty.map((r, i) => (
                  <tr key={r.clubId}>
                    <td className="text-slate-500">{i + 1}</td>
                    <td className="font-medium">{clubs[r.clubId]?.name ?? r.clubId}</td>
                    <td className="text-right font-mono">{r.honours.league}</td>
                    <td className="text-right font-mono">{r.honours.cup}</td>
                    <td className="text-right font-mono">{r.honours.continental}</td>
                    <td className="text-right font-mono font-semibold">{r.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : tab === 'honours' ? (
        history.length === 0 ? (
          <div className="card p-6 text-center text-slate-500">Complete a season to build the honours archive.</div>
        ) : (
          <div className="space-y-3">
            {history.map((h) => (
              <div key={h.seasonId} className="card p-4">
                <h2 className="font-semibold mb-2">{h.label}</h2>
                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                  {h.awards.map((a, i) => (
                    <div key={i} className="flex justify-between border-b border-surface-700 py-1">
                      <span className="text-slate-400">{a.label}</span>
                      <span className="font-medium">{subject(a)}{a.value !== undefined ? ` (${a.value})` : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      ) : hof.length === 0 ? (
        <div className="card p-6 text-center text-slate-500">
          No inductees yet. Great players enter the Hall of Fame when they retire.
        </div>
      ) : (
        <div className="overflow-x-auto card">
          <table className="data-table">
            <thead>
              <tr><th>Player</th><th>Nat</th><th className="text-right">Peak OVR</th><th className="text-right">Honours</th><th>Last club</th><th className="text-right">Inducted</th></tr>
            </thead>
            <tbody>
              {hof.map((e) => (
                <tr key={e.playerId}>
                  <td className="font-medium">{e.name}</td>
                  <td>{e.nationality}</td>
                  <td className="text-right font-mono text-accent-400">{e.peakOvr}</td>
                  <td className="text-right">{e.awardCount}</td>
                  <td>{e.lastClubName}</td>
                  <td className="text-right">{e.inductedYear}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
