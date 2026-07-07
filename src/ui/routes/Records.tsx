import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../state/store';
import { fullName } from '../format';
import { ACHIEVEMENTS } from '../../game/achievements';
import { awardMeta, isIndividualAward } from '../../game/awardMeta';
import type { Award } from '../../types/league';

export function Records() {
  const meta = useGameStore((s) => s.meta)!;
  const players = useGameStore((s) => s.players);
  const clubs = useGameStore((s) => s.clubs);
  const navigate = useNavigate();
  const [tab, setTab] = useState<'leaders' | 'awards' | 'honours' | 'achievements'>('leaders');

  // Career leaders across active players (sum of their archived season stats).
  const leaders = useMemo(() => {
    const rows = Object.values(players).map((p) => {
      let goals = 0, apps = 0, assists = 0;
      for (const s of p.stats) { goals += s.goals; apps += s.appearances; assists += s.assists; }
      return { id: p.id, name: fullName(p), goals, apps, assists };
    });
    return {
      scorers: [...rows].filter((r) => r.goals > 0).sort((a, b) => b.goals - a.goals).slice(0, 15),
      appearances: [...rows].filter((r) => r.apps > 0).sort((a, b) => b.apps - a.apps).slice(0, 15),
    };
  }, [players]);

  const name = (id?: string) => (id && clubs[id] ? clubs[id].shortName : id ?? '—');
  const pname = (id?: string) => (id && players[id] ? fullName(players[id]) : id ?? 'Unknown');

  return (
    <div className="space-y-4">
      <h1 className="page-title">Records &amp; History</h1>
      <div className="flex gap-2">
        {(['leaders', 'awards', 'honours', 'achievements'] as const).map((t) => (
          <button key={t} className={tab === t ? 'btn-primary py-1 px-3 capitalize' : 'btn-ghost py-1 px-3 capitalize'} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === 'leaders' && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="card p-4">
            <h2 className="text-sm font-semibold text-slate-400 mb-2">Career top scorers</h2>
            {leaders.scorers.length === 0 && <p className="text-xs text-slate-500">No completed seasons yet.</p>}
            {leaders.scorers.map((r, i) => (
              <button key={r.id} className="w-full flex items-center justify-between text-sm py-0.5 hover:text-white" onClick={() => navigate(`/player/${r.id}`)}>
                <span><span className="font-mono text-slate-500 mr-2">{i + 1}</span>{r.name}</span>
                <span className="font-mono text-accent-400">{r.goals} <span className="text-slate-500 text-xs">gls</span></span>
              </button>
            ))}
          </div>
          <div className="card p-4">
            <h2 className="text-sm font-semibold text-slate-400 mb-2">Most appearances</h2>
            {leaders.appearances.map((r, i) => (
              <button key={r.id} className="w-full flex items-center justify-between text-sm py-0.5 hover:text-white" onClick={() => navigate(`/player/${r.id}`)}>
                <span><span className="font-mono text-slate-500 mr-2">{i + 1}</span>{r.name}</span>
                <span className="font-mono text-slate-300">{r.apps} <span className="text-slate-500 text-xs">apps</span></span>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === 'awards' && (
        <div className="space-y-4">
          {[...(meta.history ?? [])].reverse().map((h) => {
            const indiv = h.awards.filter((a) => isIndividualAward(a.type));
            if (indiv.length === 0) return null;
            const xi = indiv.filter((a) => a.type === 'TEAM_OF_SEASON');
            const solo = indiv.filter((a) => a.type !== 'TEAM_OF_SEASON');
            return (
              <div key={h.seasonId} className="card p-4">
                <h2 className="text-sm font-semibold text-slate-400 mb-3">{h.label} <span className="text-slate-600">individual awards</span></h2>
                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
                  {solo.map((a, i) => <AwardRow key={i} a={a} pname={pname} navigate={navigate} />)}
                </div>
                {xi.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-surface-700">
                    <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">🧩 Team of the Season</div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                      {xi.map((a, i) => (
                        <button key={i} className="hover:text-white" onClick={() => a.playerId && navigate(`/player/${a.playerId}`)}>
                          <span className="font-mono text-slate-500 mr-1">{a.slot}</span>{pname(a.playerId)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {(meta.history ?? []).every((h) => h.awards.every((a) => !isIndividualAward(a.type))) && (
            <div className="card p-4 text-sm text-slate-500">No individual awards yet — finish a season to see the Ballon d'Or, Golden Boots and more.</div>
          )}
        </div>
      )}

      {tab === 'honours' && (
        <div className="space-y-4">
          <div className="card p-4">
            <h2 className="text-sm font-semibold text-slate-400 mb-2">Season roll of honour</h2>
            <div className="space-y-2">
              {[...(meta.history ?? [])].reverse().map((h) => {
                const champs = h.awards.filter((a) => a.type === 'LEAGUE_CHAMPION' || a.type === 'DOMESTIC_CUP' || a.type === 'CONTINENTAL');
                if (champs.length === 0) return null;
                return (
                  <div key={h.seasonId} className="text-sm">
                    <span className="text-slate-500 font-mono mr-2">{h.label}</span>
                    {champs.map((a, i) => (
                      <span key={i} className="mr-3 text-slate-300">{a.label}: <span className="text-white">{name(a.clubId)}</span></span>
                    ))}
                  </div>
                );
              })}
              {(meta.history ?? []).length === 0 && <p className="text-xs text-slate-500">No seasons completed yet.</p>}
            </div>
          </div>

          {(meta.continentalHistory?.length ?? 0) > 0 && (
            <div className="card p-4">
              <h2 className="text-sm font-semibold text-slate-400 mb-2">European honours</h2>
              <div className="flex flex-wrap gap-2">
                {[...(meta.continentalHistory ?? [])].reverse().map((h, i) => (
                  <div key={i} className="bg-surface-700 rounded px-3 py-1 text-sm"><span className="text-amber-400">🏆</span> {h.year} {h.name}: {name(h.clubId)}</div>
                ))}
              </div>
            </div>
          )}

          {(meta.internationalHistory?.length ?? 0) > 0 && (
            <div className="card p-4">
              <h2 className="text-sm font-semibold text-slate-400 mb-2">World Cup winners</h2>
              <div className="flex flex-wrap gap-2">
                {[...(meta.internationalHistory ?? [])].reverse().map((h) => (
                  <div key={h.year} className="bg-surface-700 rounded px-3 py-1 text-sm"><span className="text-amber-400">🌍</span> {h.year} — {h.nation}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'achievements' && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-3">Achievements ({Object.keys(meta.achievements ?? {}).length}/{ACHIEVEMENTS.length})</h2>
          <div className="grid sm:grid-cols-2 gap-2">
            {ACHIEVEMENTS.map((a) => {
              const year = meta.achievements?.[a.id];
              return (
                <div key={a.id} className={`rounded p-2 border ${year ? 'border-amber-500/40 bg-amber-500/5' : 'border-surface-600 opacity-70'}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{year ? '🏅' : '🔒'} {a.name}</span>
                    {year && <span className="text-xs text-amber-400">{year}</span>}
                  </div>
                  <p className="text-xs text-slate-400">{a.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function AwardRow({ a, pname, navigate }: { a: Award; pname: (id?: string) => string; navigate: (to: string) => void }) {
  const meta = awardMeta(a.type);
  return (
    <button className="flex items-center justify-between text-sm py-0.5 hover:text-white text-left" onClick={() => a.playerId && navigate(`/player/${a.playerId}`)}>
      <span className="truncate"><span className="mr-1.5">{meta.emoji}</span><span className="text-slate-400">{a.label}</span></span>
      <span className="text-white ml-3 shrink-0">{pname(a.playerId)}{a.note ? <span className="text-slate-500 text-xs ml-1">({a.note})</span> : null}</span>
    </button>
  );
}
