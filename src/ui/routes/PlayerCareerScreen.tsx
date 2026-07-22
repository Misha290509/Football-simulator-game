import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../state/store';
import { playerCareerOf } from '../../game/playerCareer';
import { awardMeta } from '../../game/awardMeta';
import { traitsOf, TRAIT_LABEL, type PlayerTrait } from '../../engine/traits';
import { fullName, formatMoney } from '../format';

export function PlayerCareerScreen() {
  const navigate = useNavigate();
  const meta = useGameStore((s) => s.meta);
  const players = useGameStore((s) => s.players);
  const clubs = useGameStore((s) => s.clubs);
  const career = playerCareerOf(meta);
  const p = career ? players[career.playerId] : undefined;

  if (!meta || !career || !p) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-slate-400">This save isn’t a player career.</p>
        <button className="btn-primary" onClick={() => navigate('/dashboard')}>Go to dashboard</button>
      </div>
    );
  }

  const club = p.contract.clubId ? clubs[p.contract.clubId] : undefined;
  const statusItems = (career.statusHistory ?? []).map((s) => ({
    day: s.day,
    text: `${statusRank(s.to) > statusRank(s.from) ? 'Promoted' : 'Dropped'} to ${cap(s.to)} (from ${cap(s.from)}).`,
  }));
  const milestones = [...career.milestones, ...statusItems].sort((a, b) => b.day - a.day);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h1 className="page-title">Career</h1>

      {/* Contract + standing */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-2">Contract</h2>
          <Row label="Club" value={club?.name ?? 'Free agent'} />
          <Row label="Squad status" value={career.status} />
          <Row label="Wage" value={`${formatMoney(p.contract.wage)}/wk`} />
          <Row label="Expires" value={`${p.contract.expiresYear}`} />
        </div>
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-2">This season</h2>
          <Row label="Appearances" value={`${career.seasonApps}`} />
          <Row label="Goals" value={`${career.seasonGoals}`} />
          <Row label="Avg rating" value={career.seasonAvgRating ? career.seasonAvgRating.toFixed(1) : '—'} />
          <Row label="Manager trust" value={`${Math.round(career.managerTrust)}/100`} />
        </div>
      </div>

      {/* Development / traits */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-slate-400 mb-2">Traits &amp; development</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          {traitsOf(p).length === 0 ? <span className="text-xs text-slate-500">No signature traits yet — train to develop them.</span> :
            traitsOf(p).map((t) => <span key={t} className="bg-accent/10 text-accent-300 rounded px-2 py-1 text-xs">{TRAIT_LABEL[t as PlayerTrait]}</span>)}
        </div>
        {Object.keys(career.traitProgress ?? {}).length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs text-slate-500">Closest to unlocking</div>
            {Object.entries(career.traitProgress ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, pct]) => (
              <div key={id}>
                <div className="flex justify-between text-xs"><span className="text-slate-400">{TRAIT_LABEL[id as PlayerTrait] ?? id}</span><span className="text-slate-500">{pct}%</span></div>
                <div className="h-1.5 rounded bg-surface-700 overflow-hidden"><div className="h-full bg-accent-500/70" style={{ width: `${pct}%` }} /></div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 pt-3 border-t border-surface-700 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {(['professionalism', 'ambition', 'loyalty', 'temperament'] as const).map((k) => (
            <div key={k}><span className="text-slate-500 capitalize">{k}</span><div className="font-mono text-slate-300">{Math.round(career.personality[k])}</div></div>
          ))}
        </div>
      </div>

      {/* International */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-slate-400 mb-2">International</h2>
        {career.international.capped ? (
          <>
            <div className="text-sm text-slate-300">{career.international.caps} caps · {career.international.intlGoals} goals</div>
            {(career.tournamentSquads ?? []).length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {career.tournamentSquads!.map((t, i) => <span key={i} className="bg-surface-700 rounded px-2 py-1 text-xs">🌍 {t.competition} ({t.season})</span>)}
              </div>
            )}
          </>
        ) : (
          <div className="text-sm text-slate-500">Uncapped — keep performing to force your way into the national-team reckoning.</div>
        )}
      </div>

      {/* Awards */}
      {p.awards.length > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-2">Honours &amp; awards</h2>
          <div className="flex flex-wrap gap-2">
            {p.awards.map((a, i) => (
              <span key={i} className="bg-surface-700 rounded px-2 py-1 text-xs">{awardMeta(a.awardId).emoji} {a.label ?? a.awardId}</span>
            ))}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-slate-400 mb-2">Timeline</h2>
        {milestones.length === 0 ? (
          <p className="text-xs text-slate-500">Your story starts here.</p>
        ) : (
          <ul className="space-y-1.5">
            {milestones.map((m, i) => (
              <li key={i} className="text-sm text-slate-300 flex gap-2">
                <span className="text-slate-600">•</span><span>{m.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Past seasons */}
      {career.seasonHistory.length > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-2">Season by season</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-slate-500 text-xs"><th className="text-left py-1">Season</th><th className="text-left">Club</th><th className="text-right">Apps</th><th className="text-right">Gls</th><th className="text-right">Ast</th><th className="text-right">Avg</th></tr></thead>
              <tbody>
                {career.seasonHistory.map((s, i) => (
                  <tr key={i} className="border-t border-surface-700">
                    <td className="py-1">{s.season}</td><td>{s.club}</td>
                    <td className="text-right">{s.apps}</td><td className="text-right">{s.goals}</td>
                    <td className="text-right">{s.assists}</td><td className="text-right">{s.avgRating.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-500">Player: {fullName(p)}</p>
    </div>
  );
}

function cap(s: string): string { return s.charAt(0) + s.slice(1).toLowerCase(); }
const STATUS_ORD = ['YOUTH', 'PROSPECT', 'ROTATION', 'KEY', 'STAR', 'CAPTAIN'];
const statusRank = (s: string) => STATUS_ORD.indexOf(s);

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm py-0.5">
      <span className="text-slate-500">{label}</span><span className="text-white">{value}</span>
    </div>
  );
}
