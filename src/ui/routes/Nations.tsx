import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../state/store';
import { fullName } from '../format';
import { buildNationSquads, nationStrength } from '../../engine/nationalTeam';
import { NATIONS } from '../../data/nations';
import type { TournamentSummary } from '../../types/league';

export function Nations() {
  const navigate = useNavigate();
  const meta = useGameStore((s) => s.meta)!;
  const players = useGameStore((s) => s.players);
  const appointNationalJob = useGameStore((s) => s.appointNationalJob);
  const resignNationalJob = useGameStore((s) => s.resignNationalJob);
  const [toast, setToast] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 4000); };

  // Every nation from the table, ranked by its blended (base + real-squad) strength.
  const squads = useMemo(() => buildNationSquads(players), [players]);
  const nations = useMemo(
    () => NATIONS
      .map((n) => ({ ...n, rating: nationStrength(n.name, squads), squad: squads[n.name] }))
      .sort((a, b) => b.rating - a.rating),
    [squads],
  );
  const job = meta.nationalJob;
  const tournaments = meta.lastTournaments ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">National Teams</h1>
        {meta.worldChampion && (
          <span className="text-sm text-amber-400">🏆 World champions: {meta.worldChampion.nation} ({meta.worldChampion.year})</span>
        )}
      </div>

      <div className="card p-4">
        {job ? (
          <div className="flex items-center justify-between">
            <div><span className="text-slate-400 text-sm">You manage</span> <span className="font-semibold">{job}</span></div>
            <button className="btn-ghost text-sm" onClick={() => resignNationalJob()}>Resign national post</button>
          </div>
        ) : (
          <p className="text-sm text-slate-400">
            You don't hold a national team post. The World Cup runs every four years (2026, 2030…);
            the Euros and Copa América fall on the years between (2028, 2032…). Take a nation to your
            reputation level and chase glory.
          </p>
        )}
      </div>

      {tournaments.map((t) => <TournamentCard key={`${t.kind}_${t.year}`} t={t} navigate={navigate} />)}

      <div className="card p-4">
        <h2 className="text-sm font-semibold text-slate-400 mb-3">World rankings</h2>
        <div className="space-y-1">
          {nations.map((n, i) => (
            <div key={n.name} className="rounded bg-surface-700">
              <div className="flex items-center justify-between px-3 py-2 cursor-pointer" onClick={() => setOpen(open === n.name ? null : n.name)}>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-slate-500 w-6 text-right">{i + 1}</span>
                  <span className="font-medium">{n.name}{job === n.name && <span className="ml-1 text-xs text-accent-400">(you)</span>}</span>
                  <span className="text-[10px] uppercase tracking-wide text-slate-500">{n.confederation}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono font-semibold text-accent-400">{n.rating}</span>
                  {!job && (
                    <button className="btn-ghost text-xs py-0.5" onClick={async (e) => { e.stopPropagation(); flash((await appointNationalJob(n.name)).message); }}>Manage</button>
                  )}
                </div>
              </div>
              {open === n.name && (
                n.squad && n.squad.xi.length > 0 ? (
                  <div className="px-3 pb-3 grid sm:grid-cols-2 gap-x-6 gap-y-1">
                    {n.squad.xi.map((p) => (
                      <div key={p.id} className="flex items-center justify-between text-sm cursor-pointer hover:text-white" onClick={() => navigate(`/player/${p.id}`)}>
                        <span><span className="font-mono text-slate-500 mr-2">{p.position}</span>{fullName(p)}</span>
                        <span className="font-mono text-slate-400">{p.overall}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-3 pb-3 text-xs text-slate-500">No dataset players from this nation — squad simulated from its ranking.</div>
                )
              )}
            </div>
          ))}
        </div>
      </div>

      {(meta.internationalHistory?.length ?? 0) > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-2">World Cup roll of honour</h2>
          <div className="flex flex-wrap gap-2">
            {[...(meta.internationalHistory ?? [])].reverse().map((h) => (
              <div key={h.year} className="bg-surface-700 rounded px-3 py-1 text-sm"><span className="text-amber-400">🏆</span> {h.year} — {h.nation}</div>
            ))}
          </div>
        </div>
      )}

      {toast && <div className="fixed bottom-6 right-6 card px-4 py-3 text-sm shadow-lg border-accent">{toast}</div>}
    </div>
  );
}

function TournamentCard({ t, navigate }: { t: TournamentSummary; navigate: (to: string) => void }) {
  const [tab, setTab] = useState<'groups' | 'knockout' | 'scorers'>('knockout');
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">{t.name}</h2>
        <span className="text-sm text-amber-400">🏆 {t.championNation} <span className="text-slate-500">def. {t.runnerUpNation}</span></span>
      </div>
      <div className="flex gap-2 text-xs">
        {(['knockout', 'groups', 'scorers'] as const).map((k) => (
          <button key={k} className={tab === k ? 'btn-primary py-0.5 px-2 capitalize' : 'btn-ghost py-0.5 px-2 capitalize'} onClick={() => setTab(k)}>{k}</button>
        ))}
      </div>

      {tab === 'groups' && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {t.groups.map((g) => (
            <div key={g.name} className="bg-surface-700 rounded p-2">
              <div className="text-xs font-semibold text-slate-400 mb-1">{g.name}</div>
              <table className="w-full text-xs">
                <tbody>
                  {g.rows.map((r, i) => (
                    <tr key={r.nation} className={i < 2 ? 'text-white' : 'text-slate-500'}>
                      <td className="py-0.5">{i + 1}. {r.nation}</td>
                      <td className="text-right tabular-nums">{r.points}</td>
                      <td className="text-right tabular-nums w-8 text-slate-500">{r.gd >= 0 ? `+${r.gd}` : r.gd}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {tab === 'knockout' && (
        <div className="space-y-2">
          {groupByRound(t.knockout).map(([round, ties]) => (
            <div key={round}>
              <div className="text-xs font-semibold text-slate-400 mb-1">{round}</div>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-0.5">
                {ties.map((tie, i) => (
                  <div key={i} className="flex items-center justify-between text-sm py-0.5 border-b border-surface-700/50">
                    <span className={tie.winner === tie.homeNation ? 'text-white font-medium' : 'text-slate-400'}>{tie.homeNation}</span>
                    <span className="font-mono text-xs text-slate-400 px-2">
                      {tie.homeGoals}–{tie.awayGoals}{tie.pens && ` (${tie.pens[0]}–${tie.pens[1]}p)`}
                    </span>
                    <span className={tie.winner === tie.awayNation ? 'text-white font-medium text-right flex-1' : 'text-slate-400 text-right flex-1'}>{tie.awayNation}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'scorers' && (
        <div className="grid sm:grid-cols-2 gap-4">
          <ScorerList title="Golden Boot — top scorers" rows={t.topScorers} unit="goals" navigate={navigate} />
          <ScorerList title="Playmaker — top assisters" rows={t.topAssisters} unit="assists" navigate={navigate} />
        </div>
      )}
    </div>
  );
}

function ScorerList({ title, rows, unit, navigate }: {
  title: string; rows: TournamentSummary['topScorers']; unit: string; navigate: (to: string) => void;
}) {
  return (
    <div>
      <div className="text-xs font-semibold text-slate-400 mb-1">{title}</div>
      <div className="space-y-0.5">
        {rows.length === 0 && <div className="text-xs text-slate-500">—</div>}
        {rows.map((r, i) => (
          <div
            key={`${r.nation}_${r.name}_${i}`}
            className={`flex items-center justify-between text-sm py-0.5 ${r.playerId ? 'cursor-pointer hover:text-white' : ''}`}
            onClick={() => r.playerId && navigate(`/player/${r.playerId}`)}
          >
            <span><span className="font-mono text-slate-500 mr-2">{i + 1}</span>{r.name} <span className="text-xs text-slate-500">({r.nation})</span></span>
            <span className="font-mono text-accent-400">{r.count} <span className="text-slate-500 text-xs">{unit}</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}

function groupByRound(ties: TournamentSummary['knockout']): [string, TournamentSummary['knockout']][] {
  const order = new Map<string, TournamentSummary['knockout']>();
  for (const t of ties) (order.get(t.round) ?? order.set(t.round, []).get(t.round)!).push(t);
  return [...order.entries()];
}
