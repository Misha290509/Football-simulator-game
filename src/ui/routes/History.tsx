import { useState } from 'react';
import { useGameStore } from '../../state/store';
import type { Award } from '../../types/league';

export function History() {
  const meta = useGameStore((s) => s.meta)!;
  const clubs = useGameStore((s) => s.clubs);
  const players = useGameStore((s) => s.players);
  const [tab, setTab] = useState<'honours' | 'hof'>('honours');

  const history = [...(meta.history ?? [])].reverse();
  const hof = [...(meta.hallOfFame ?? [])].sort((a, b) => b.peakOvr - a.peakOvr);

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
        <button className={tab === 'hof' ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab('hof')}>Hall of Fame</button>
      </div>

      {tab === 'honours' ? (
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
