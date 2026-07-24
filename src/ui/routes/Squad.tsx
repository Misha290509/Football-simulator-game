import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../state/store';
import { DataTable, type Column } from '../components/DataTable';
import { Rating } from '../components/Rating';
import { ageOf, fullName, formatMoney, formatWage, playerStatus } from '../format';
import type { Player } from '../../types/player';
import { POSITION_GROUP, ALL_POSITIONS } from '../../types/attributes';
import { squadChemistry, dressingRoom } from '../../engine/chemistry';
import { squadCompliance } from '../../game/registration';
import { OvrDeltaBadge, StatChangePanel } from '../components/SeasonChange';

export function Squad() {
  const navigate = useNavigate();
  const meta = useGameStore((s) => s.meta)!;
  const club = useGameStore((s) => s.managerClub())!;
  const players = useGameStore((s) => s.getClubPlayers(club.id));
  const season = useGameStore((s) => s.currentSeason());
  const currentYear = season?.year ?? meta.startYear;
  const [view, setView] = useState<'table' | 'depth'>('table');

  const groupOrder: Record<string, number> = { GK: 0, DEF: 1, MID: 2, ATT: 3 };

  const columns: Column<Player>[] = [
    {
      key: 'pos',
      header: 'Pos',
      render: (p) => <span className="font-mono text-slate-400">{p.position}</span>,
      sortValue: (p) => groupOrder[POSITION_GROUP[p.position]] * 100 + p.position.charCodeAt(0),
      align: 'left',
    },
    {
      key: 'name',
      header: 'Name',
      render: (p) => <span className="font-medium">{fullName(p)}</span>,
      sortValue: (p) => p.name.last,
    },
    {
      key: 'age',
      header: 'Age',
      render: (p) => ageOf(p, currentYear),
      sortValue: (p) => ageOf(p, currentYear),
      align: 'right',
    },
    { key: 'nat', header: 'Nat', render: (p) => p.nationality, sortValue: (p) => p.nationality },
    { key: 'foot', header: 'Foot', render: (p) => p.preferredFoot, align: 'center' },
    {
      key: 'ovr',
      header: 'OVR',
      render: (p) => (
        <span className="inline-flex items-center gap-1.5 justify-end">
          <Rating value={p.overall} />
          <OvrDeltaBadge player={p} />
        </span>
      ),
      sortValue: (p) => p.overall,
      align: 'right',
    },
    {
      key: 'pot',
      header: 'POT',
      render: (p) => <Rating value={p.potential} />,
      sortValue: (p) => p.potential,
      align: 'right',
    },
    {
      key: 'value',
      header: 'Value',
      render: (p) => formatMoney(p.value),
      sortValue: (p) => p.value,
      align: 'right',
    },
    {
      key: 'wage',
      header: 'Wage',
      render: (p) => formatWage(p.contract.wage),
      sortValue: (p) => p.contract.wage,
      align: 'right',
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => {
        const s = playerStatus(p);
        return <span className={`text-xs px-1.5 py-0.5 rounded ${s.className}`}>{s.label}</span>;
      },
      sortValue: (p) => (p.injury ? 3 : p.cards.suspendedFor > 0 ? 2 : p.fitness < 70 ? 1 : 0),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Squad</h1>
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {(['table', 'depth'] as const).map((v) => (
              <button key={v} className={view === v ? 'btn-primary capitalize px-3 py-1 text-sm' : 'btn-ghost capitalize px-3 py-1 text-sm'} onClick={() => setView(v)}>{v === 'depth' ? 'Depth chart' : 'Table'}</button>
            ))}
          </div>
          <span className="text-sm text-slate-500">{players.length} players</span>
        </div>
      </div>

      <ChemistryCard players={players} year={currentYear} captainId={club.captainId} />
      <RegistrationCard players={players} club={club} />

      {view === 'table' ? (
        <>
          <DataTable
            columns={columns}
            rows={players}
            rowKey={(p) => p.id}
            onRowClick={(p) => navigate(`/player/${p.id}`)}
            initialSort={{ key: 'ovr', dir: 'desc' }}
            renderExpanded={(p) => (p.lastSeasonChange ? <StatChangePanel player={p} /> : null)}
          />
          <p className="text-xs text-slate-600">Click a row to open the player profile. The ▲/▼ next to OVR is last season's change — expand a row with ▸ to see which attributes moved.</p>
        </>
      ) : (
        <DepthChart players={players} year={currentYear} onOpen={(id) => navigate(`/player/${id}`)} />
      )}
    </div>
  );
}

function ChemistryCard({ players, year, captainId }: { players: Player[]; year: number; captainId?: string | null }) {
  const chem = squadChemistry(players, year);
  const room = dressingRoom(players, captainId);
  const color = chem.score >= 66 ? 'text-emerald-400' : chem.score >= 52 ? 'text-slate-200' : chem.score >= 40 ? 'text-amber-400' : 'text-rose-400';
  return (
    <div className="card p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Dressing room</div>
          <div className="text-sm"><span className={`text-xl font-bold mr-2 ${color}`}>{chem.score}</span><span className="text-slate-300">{chem.label}</span></div>
        </div>
        <div className="flex flex-wrap gap-1.5 ml-auto">
          {chem.factors.map((f) => (
            <span key={f.label} className={`text-[11px] px-2 py-0.5 rounded-full border ${f.delta > 0 ? 'border-emerald-500/30 text-emerald-300' : f.delta < 0 ? 'border-rose-500/30 text-rose-300' : 'border-surface-600 text-slate-500'}`}>
              {f.label} {f.delta > 0 ? `+${f.delta}` : f.delta}
            </span>
          ))}
        </div>
      </div>
      {(room.leaders.length > 0 || room.cliques.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs border-t border-surface-700 pt-2">
          {room.leaders.length > 0 && (
            <div><span className="text-slate-500">Leaders: </span>
              {room.leaders.map((p, i) => <span key={p.id} className="text-slate-300">{i > 0 ? ', ' : ''}{p.name.last}{p.id === captainId ? ' (C)' : ''}</span>)}
            </div>
          )}
          {room.cliques.length > 0 && (
            <div><span className="text-slate-500">National blocs: </span>
              {room.cliques.map((c, i) => <span key={c.nationality} className="text-slate-300">{i > 0 ? ', ' : ''}{c.nationality} ×{c.count}</span>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RegistrationCard({ players, club }: { players: Player[]; club: import('../../types/club').Club }) {
  const comp = squadCompliance(players, club);
  if (!comp) return null;
  const ok = comp.violations.length === 0;
  const chip = (label: string, cur: number, req: string, good: boolean) => (
    <span className={`text-[11px] px-2 py-0.5 rounded-full border ${good ? 'border-emerald-500/30 text-emerald-300' : 'border-rose-500/30 text-rose-300'}`}>{label} {cur} {req}</span>
  );
  return (
    <div className="card p-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <div>
        <div className="text-[10px] uppercase tracking-wide text-slate-500">Squad registration</div>
        <div className={`text-sm ${ok ? 'text-emerald-400' : 'text-rose-400'}`}>{ok ? '✓ Compliant' : '⚠ Non-compliant'}</div>
      </div>
      <div className="flex flex-wrap gap-1.5 ml-auto">
        {chip(club.countryId === 'US' ? 'Roster' : 'Squad', comp.squadCount, `/ ${comp.rules.squadLimit}`, comp.squadCount <= comp.rules.squadLimit)}
        {comp.rules.homegrownMin > 0 && chip('Home-grown', comp.homegrown, `/ ${comp.rules.homegrownMin} min`, comp.homegrown >= comp.rules.homegrownMin)}
        {comp.rules.nonDomesticMax != null && chip(club.countryId === 'US' ? 'Int’l slots' : 'Non-domestic', comp.nonDomestic, `/ ${comp.rules.nonDomesticMax} max`, comp.nonDomestic <= comp.rules.nonDomesticMax)}
      </div>
      {!ok && <div className="w-full text-xs text-rose-300/90">{comp.violations.join(' ')}</div>}
    </div>
  );
}

function DepthChart({ players, year, onOpen }: { players: Player[]; year: number; onOpen: (id: string) => void }) {
  const byPos: Record<string, Player[]> = {};
  for (const p of players) (byPos[p.position] ??= []).push(p);
  for (const list of Object.values(byPos)) list.sort((a, b) => b.overall - a.overall);
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {ALL_POSITIONS.map((pos) => {
        const list = byPos[pos] ?? [];
        const thin = list.length < 2;
        return (
          <div key={pos} className="card p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono font-semibold text-slate-300">{pos}</span>
              {thin && <span className="text-[10px] uppercase tracking-wide text-orange-400" title="Thin cover at this position">Thin</span>}
            </div>
            {list.length === 0 ? (
              <div className="text-xs text-rose-400">No natural cover</div>
            ) : (
              <div className="space-y-1">
                {list.map((p, i) => (
                  <div key={p.id} className="flex items-center justify-between text-sm cursor-pointer hover:bg-surface-700 rounded px-1" onClick={() => onOpen(p.id)}>
                    <span className="truncate">
                      <span className="text-slate-600 mr-1">{i + 1}.</span>{fullName(p)}
                      <span className="text-slate-500 text-xs ml-1">{ageOf(p, year)}y</span>
                    </span>
                    <Rating value={p.overall} />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
