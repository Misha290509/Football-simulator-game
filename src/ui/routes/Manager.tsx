import { useState } from 'react';
import { useGameStore } from '../../state/store';
import { BOARD_REQUEST_LABEL, type BoardRequestKind } from '../../game/boardroom';
import { styleTags } from '../../game/aiManagers';

export function Manager() {
  const meta = useGameStore((s) => s.meta)!;
  const clubs = useGameStore((s) => s.clubs);
  const club = useGameStore((s) => s.managerClub());
  const acceptJobOffer = useGameStore((s) => s.acceptJobOffer);
  const declineJobOffer = useGameStore((s) => s.declineJobOffer);
  const requestFromBoard = useGameStore((s) => s.requestFromBoard);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 4000); };

  const rep = meta.managerReputation ?? 50;
  const stints = meta.managerStints ?? [];
  const offers = meta.jobOffers ?? [];
  const totalTrophies = stints.reduce((a, s) => a + s.trophies, 0);
  const totalSeasons = stints.reduce((a, s) => a + s.seasons, 0);

  const repTier = rep >= 80 ? 'World-class' : rep >= 65 ? 'Highly rated' : rep >= 50 ? 'Established' : rep >= 35 ? 'Up-and-coming' : 'Unproven';
  const tags = styleTags(meta.managerStyle);
  const styleWins = meta.managerStyle?.wins ?? 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Manager</h1>

      {meta.sacked && (
        <div className="card p-4 border border-rose-500/40 bg-rose-500/10">
          <div className="font-semibold text-rose-300">You're between jobs.</div>
          <p className="text-sm text-slate-400 mt-1">The board dismissed you. Accept one of the offers below to take charge of a new club and continue your career.</p>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Manager</div>
          <div className="text-lg font-bold text-white">{meta.managerName}</div>
          <div className="text-sm text-slate-400 mt-1">{club ? `${club.name}` : 'Between jobs'}</div>
          {(tags.length > 0 || styleWins > 0) && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {tags.map((t) => (
                <span key={t} className="text-[11px] px-2 py-0.5 rounded-full border border-accent/40 text-accent-400">{t}</span>
              ))}
              {tags.length === 0 && <span className="text-xs text-slate-500">Tactical identity forming — {styleWins} wins banked ({20 - styleWins > 0 ? `${20 - styleWins} more to earn a style tag` : 'no dominant style yet'}).</span>}
            </div>
          )}
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Reputation — {repTier}</div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-surface-700 rounded"><div className="h-2 rounded bg-accent" style={{ width: `${rep}%` }} /></div>
            <span className="font-mono text-sm">{rep}</span>
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Career</div>
          <div className="text-sm mt-1">{totalTrophies} trophies · {totalSeasons} seasons · {stints.length} club{stints.length === 1 ? '' : 's'}</div>
        </div>
      </div>

      {offers.length > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-3">Job offers</h2>
          <div className="space-y-2">
            {offers.map((o) => (
              <div key={o.id} className="flex items-center justify-between bg-surface-700 rounded px-3 py-2">
                <div className="min-w-0">
                  <div className="font-medium">{o.clubName} <span className="text-xs text-slate-500">· {o.leagueName} · rep {o.clubReputation}</span></div>
                  <div className="text-xs text-slate-400">{o.reason}</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button className="btn-primary text-xs py-1" onClick={async () => flash((await acceptJobOffer(o.id)).message)}>Accept</button>
                  <button className="btn-ghost text-xs py-1" onClick={() => declineJobOffer(o.id)}>Decline</button>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-2">Accepting takes you to the new club immediately for the rest of the season.</p>
        </div>
      )}

      {club && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-400">Boardroom</h2>
            <span className="text-xs text-slate-500">Board confidence: <span className="font-mono text-slate-300">{meta.board?.confidence ?? 50}%</span></span>
          </div>
          <p className="text-xs text-slate-500 mb-3">The board back you based on their confidence and your reputation. You can ask again after a while.</p>
          <div className="flex flex-wrap gap-2">
            {(['TRANSFER_BUDGET', 'WAGE_BUDGET', 'FACILITIES'] as BoardRequestKind[]).map((k) => (
              <button key={k} className="btn-ghost text-sm" onClick={async () => flash((await requestFromBoard(k)).message)}>
                {BOARD_REQUEST_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="card p-4">
        <h2 className="text-sm font-semibold text-slate-400 mb-3">Career history</h2>
        {stints.length === 0 ? (
          <p className="text-sm text-slate-500">No history yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table w-full">
              <thead><tr><th>Club</th><th>Years</th><th className="text-right">Seasons</th><th className="text-right">Trophies</th><th>Left</th></tr></thead>
              <tbody>
                {[...stints].reverse().map((s, i) => (
                  <tr key={i}>
                    <td className="font-medium">{clubs[s.clubId]?.shortName ?? s.clubName}{s.toYear === undefined && <span className="ml-1 text-xs text-emerald-400">(current)</span>}</td>
                    <td className="text-slate-400">{s.fromYear}{s.toYear !== undefined ? `–${s.toYear}` : '–'}</td>
                    <td className="text-right">{s.seasons}</td>
                    <td className="text-right">{s.trophies || '—'}</td>
                    <td className="text-slate-500 text-xs">{s.reasonLeft ? s.reasonLeft[0] + s.reasonLeft.slice(1).toLowerCase() : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {toast && <div className="fixed bottom-6 right-6 card px-4 py-3 text-sm shadow-lg border-accent">{toast}</div>}
    </div>
  );
}
