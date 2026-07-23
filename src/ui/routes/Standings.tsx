import { useMemo, useState } from 'react';
import { useGameStore } from '../../state/store';
import { CrestBadge } from '../components/Rating';
import { computeStandings } from '../../engine/standings';
import { applyPointsPenalties } from '../../game/ffp';
import { projectLeague } from '../../game/projections';
import type { StandingRow } from '../../types/league';
import type { Match } from '../../types/match';

type Res = 'W' | 'D' | 'L';
interface ClubForm { form: Res[]; xgf: number; xga: number }

/** Per-club last-5 form + season xG for/against, from this competition's matches. */
function computeForm(rows: StandingRow[], matches: Match[], compId: string): Map<string, ClubForm> {
  const m = new Map<string, ClubForm>();
  for (const r of rows) m.set(r.clubId, { form: [], xgf: 0, xga: 0 });
  const byClub = new Map<string, Match[]>();
  for (const mt of matches) {
    if (!mt.played || mt.competitionId !== compId) continue;
    for (const cid of [mt.homeClubId, mt.awayClubId]) {
      if (!m.has(cid)) continue;
      (byClub.get(cid) ?? byClub.set(cid, []).get(cid)!).push(mt);
    }
  }
  for (const [cid, ms] of byClub) {
    const rec = m.get(cid)!;
    for (const mt of ms) {
      const home = mt.homeClubId === cid;
      rec.xgf += home ? (mt.homeXg ?? 0) : (mt.awayXg ?? 0);
      rec.xga += home ? (mt.awayXg ?? 0) : (mt.homeXg ?? 0);
    }
    rec.form = [...ms].sort((a, b) => b.day - a.day).slice(0, 5).reverse().map((mt) => {
      const home = mt.homeClubId === cid;
      const gf = home ? mt.homeGoals : mt.awayGoals;
      const ga = home ? mt.awayGoals : mt.homeGoals;
      return gf > ga ? 'W' : gf === ga ? 'D' : 'L';
    });
  }
  return m;
}

function FormPills({ form }: { form: Res[] }) {
  const color = (r: Res) => r === 'W' ? 'bg-emerald-500/80' : r === 'D' ? 'bg-slate-500/70' : 'bg-red-500/80';
  return (
    <span className="inline-flex gap-0.5 justify-end">
      {form.length === 0 ? <span className="text-slate-600">—</span> : form.map((r, i) => (
        <span key={i} className={`inline-block w-4 h-4 rounded-sm text-[9px] leading-4 text-center text-white font-bold ${color(r)}`} title={r}>{r}</span>
      ))}
    </span>
  );
}

export function Standings() {
  const meta = useGameStore((s) => s.meta)!;
  const clubs = useGameStore((s) => s.clubs);
  const seasonMatches = useGameStore((s) => s.currentSeasonMatches());
  const managerClubId = meta.managerClubId;

  const competitions = Object.values(meta.competitions).sort((a, b) => a.tier - b.tier);
  // Open on the manager's own division rather than the top tier by default.
  const myCompId = competitions.find((c) => c.clubIds.includes(managerClubId))?.id ?? competitions[0]?.id;
  const [compId, setCompId] = useState(myCompId);
  const comp = meta.competitions[compId];

  const rows = useMemo(
    () => applyPointsPenalties(computeStandings(comp, seasonMatches), meta.pointsPenalties),
    [comp, seasonMatches, meta.pointsPenalties],
  );
  const formByClub = useMemo(() => computeForm(rows, seasonMatches, comp.id), [rows, seasonMatches, comp.id]);
  const fmtXgd = (r: StandingRow) => {
    const f = formByClub.get(r.clubId); if (!f) return '—';
    const d = f.xgf - f.xga; return `${d > 0 ? '+' : ''}${d.toFixed(1)}`;
  };

  const [showProj, setShowProj] = useState(false);
  const remaining = useMemo(() => seasonMatches.filter((m) => !m.played), [seasonMatches]);
  const projByClub = useMemo(() => {
    if (!showProj || comp.conferences) return null;
    const projs = projectLeague(comp, rows, remaining, clubs, meta.seed);
    return new Map(projs.map((p) => [p.clubId, p]));
  }, [showProj, comp, rows, remaining, clubs, meta.seed]);
  const pct = (x: number) => x >= 0.995 ? '100%' : x < 0.005 ? '—' : `${Math.round(x * 100)}%`;

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
                  <thead><tr><th>#</th><th>Club</th><th className="text-right">P</th><th className="text-right">Pts</th><th className="text-right">Form</th></tr></thead>
                  <tbody>
                    {confRows.map((r, i) => {
                      const club = clubs[r.clubId];
                      return (
                        <tr key={r.clubId} className={r.clubId === managerClubId ? 'bg-accent/10' : ''}>
                          <td className={`text-slate-500 ${i < qual ? 'border-l-2 border-sky-500' : 'border-l-2 border-transparent'}`}>{i + 1}</td>
                          <td><span className="flex items-center gap-2"><CrestBadge abbrev={club.abbrev} color={club.primaryColor} size={20} />{club.name}</span></td>
                          <td className="text-right">{r.played}</td>
                          <td className="text-right font-semibold">{r.points}</td>
                          <td className="text-right"><FormPills form={formByClub.get(r.clubId)?.form ?? []} /></td>
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

      <div className="flex gap-2 items-center">
        {competitions.map((c) => (
          <button
            key={c.id}
            className={compId === c.id ? 'btn-primary' : 'btn-ghost'}
            onClick={() => setCompId(c.id)}
          >
            {c.name}
          </button>
        ))}
        <button className={`ml-auto text-xs ${showProj ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setShowProj((v) => !v)} title="Monte-Carlo projection of the remaining fixtures">📊 Projections</button>
      </div>

      <div className="overflow-x-auto card">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-8">#</th>
              <th>Club</th>
              {projByClub && <th className="text-right" title="Probability of winning the league">Title</th>}
              {projByClub && relegateCount > 0 && <th className="text-right" title="Probability of relegation">Rel</th>}
              {projByClub && <th className="text-right" title="Projected final points">xPts</th>}
              <th className="text-right">P</th>
              <th className="text-right">W</th>
              <th className="text-right">D</th>
              <th className="text-right">L</th>
              <th className="text-right">GF</th>
              <th className="text-right">GA</th>
              <th className="text-right">GD</th>
              <th className="text-right" title="xG difference (season)">xGD</th>
              <th className="text-right">Pts</th>
              <th className="text-right">Form</th>
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
                  {projByClub && <td className="text-right font-mono text-xs text-emerald-300">{pct(projByClub.get(r.clubId)?.title ?? 0)}</td>}
                  {projByClub && relegateCount > 0 && <td className="text-right font-mono text-xs text-rose-300">{pct(projByClub.get(r.clubId)?.relegation ?? 0)}</td>}
                  {projByClub && <td className="text-right font-mono text-xs text-slate-400">{projByClub.get(r.clubId)?.expectedPoints ?? '—'}</td>}
                  <td className="text-right">{r.played}</td>
                  <td className="text-right">{r.won}</td>
                  <td className="text-right">{r.drawn}</td>
                  <td className="text-right">{r.lost}</td>
                  <td className="text-right">{r.goalsFor}</td>
                  <td className="text-right">{r.goalsAgainst}</td>
                  <td className="text-right">{gd(r) > 0 ? `+${gd(r)}` : gd(r)}</td>
                  <td className="text-right text-slate-400 font-mono text-xs">{fmtXgd(r)}</td>
                  <td className="text-right font-semibold">{r.points}</td>
                  <td className="text-right"><FormPills form={formByClub.get(r.clubId)?.form ?? []} /></td>
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
