import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../state/store';
import { CrestBadge } from '../components/Rating';
import { leaguePhaseTable, groupTables } from '../../game/continental/competition';
import type { ContinentalState } from '../../types/continental';
import type { Match } from '../../types/match';
import type { StandingRow } from '../../types/league';

const KO_ORDER = ['Knockout Play-off', 'Round of 32', 'Round of 16', 'Quarter-final', 'Semi-final', 'Final'];

export function Continental() {
  const meta = useGameStore((s) => s.meta)!;
  const clubs = useGameStore((s) => s.clubs);
  const matches = useGameStore((s) => s.currentSeasonMatches());
  const states = Object.values(meta.continental ?? {});
  const [tab, setTab] = useState<string>(states[0]?.id ?? '');

  const active = states.find((s) => s.id === tab) ?? states[0];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">Cups &amp; Continental</h1>

      <CupsPanel matches={matches} clubs={clubs} managerClubId={meta.managerClubId} />

      {states.length > 0 ? (
        <>
          <div className="flex flex-wrap gap-2">
            {states.map((s) => (
              <button key={s.id} className={active?.id === s.id ? 'btn-primary py-1 px-3' : 'btn-ghost py-1 px-3'} onClick={() => setTab(s.id)}>
                {s.name}
              </button>
            ))}
          </div>
          {active && <CompetitionView state={active} matches={matches} clubs={clubs} managerClubId={meta.managerClubId} />}
        </>
      ) : (
        <p className="text-sm text-slate-400">No continental competitions are running in this world yet.</p>
      )}
      <RollOfHonour />
    </div>
  );
}

/** The manager's domestic cups: current round, reigning holder, and their run. */
function CupsPanel({ matches, clubs, managerClubId }: {
  matches: Match[]; clubs: Record<string, import('../../types/club').Club>; managerClubId: string;
}) {
  const navigate = useNavigate();
  const meta = useGameStore((s) => s.meta)!;
  const countryId = clubs[managerClubId]?.countryId;
  const cups = Object.values(meta.domesticCups ?? {}).filter((c) => c.countryId === countryId);
  const name = (id: string) => clubs[id]?.shortName ?? clubs[id]?.name ?? id;
  if (cups.length === 0) return null;

  return (
    <div className="card p-4">
      <h2 className="text-sm font-semibold text-slate-400 mb-3">Domestic cups</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {cups.map((cup) => {
          const holder = meta.cupHolders?.[cup.id];
          const myTies = matches
            .filter((m) => m.competitionId === cup.id && (m.homeClubId === managerClubId || m.awayClubId === managerClubId))
            .sort((a, b) => a.day - b.day);
          return (
            <div key={cup.id} className="bg-surface-700 rounded p-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{cup.name}</span>
                {cup.championId ? <span className="text-xs text-amber-400">🏆 {name(cup.championId)}</span>
                  : <span className="text-xs text-slate-500">{cup.roundLabel ?? '—'}</span>}
              </div>
              {holder && <div className="text-[10px] text-slate-500">Holders: {name(holder.clubId)}</div>}
              <div className="mt-1 space-y-0.5">
                {myTies.length === 0 && <div className="text-xs text-slate-500">Not involved / eliminated.</div>}
                {myTies.map((m) => {
                  const home = m.homeClubId === managerClubId;
                  const opp = home ? m.awayClubId : m.homeClubId;
                  const pen = m.events.find((e) => e.type === 'PENALTY');
                  const won = m.played && ((home ? m.homeGoals > m.awayGoals : m.awayGoals > m.homeGoals) || (pen && (pen.side === 'home') === home));
                  return (
                    <button key={m.id} disabled={!m.played} onClick={() => navigate(`/match/${m.id}`)}
                      className={`w-full flex items-center justify-between text-xs py-0.5 ${m.played ? 'hover:text-white' : 'opacity-70'}`}>
                      <span className="text-slate-400">{m.stageLabel} {home ? 'v' : '@'} {name(opp)}</span>
                      <span className={`font-mono ${m.played ? (won ? 'text-emerald-400' : 'text-rose-400') : 'text-slate-500'}`}>
                        {m.played ? `${home ? m.homeGoals : m.awayGoals}–${home ? m.awayGoals : m.homeGoals}${pen ? ' p' : ''}` : '·'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CompetitionView({ state, matches, clubs, managerClubId }: {
  state: ContinentalState; matches: Match[]; clubs: Record<string, import('../../types/club').Club>; managerClubId: string;
}) {
  const navigate = useNavigate();
  const [view, setView] = useState<'phase' | 'knockout'>('phase');
  const name = (id: string) => clubs[id]?.shortName ?? clubs[id]?.name ?? id;

  const table = useMemo(() => (state.format === 'swiss' ? leaguePhaseTable(state, matches) : []), [state, matches]);
  const groups = useMemo(() => (state.format === 'groups' ? groupTables(state, matches) : []), [state, matches]);
  const ko = useMemo(() => matches
    .filter((m) => m.competitionId === state.id && KO_ORDER.includes(m.stageLabel ?? ''))
    .sort((a, b) => a.day - b.day), [matches, state.id]);

  const TableRow = ({ r, i, qualifyAt, playoffAt }: { r: StandingRow; i: number; qualifyAt: number; playoffAt?: number }) => {
    const mine = r.clubId === managerClubId;
    const zone = i < qualifyAt ? 'border-l-2 border-emerald-500' : (playoffAt && i < playoffAt) ? 'border-l-2 border-amber-500' : 'border-l-2 border-transparent';
    return (
      <div className={`flex items-center gap-2 px-2 py-1 text-sm ${zone} ${mine ? 'bg-accent/10' : ''}`}>
        <span className="w-6 text-right font-mono text-slate-500">{i + 1}</span>
        <CrestBadge abbrev={clubs[r.clubId]?.abbrev ?? '?'} color={clubs[r.clubId]?.primaryColor ?? '#888'} size={18} />
        <span className="flex-1 truncate">{name(r.clubId)}</span>
        <span className="tabular-nums text-slate-400 w-8 text-right">{r.played}</span>
        <span className="tabular-nums text-slate-400 w-10 text-right">{r.goalsFor - r.goalsAgainst >= 0 ? '+' : ''}{r.goalsFor - r.goalsAgainst}</span>
        <span className="tabular-nums font-semibold w-8 text-right">{r.points}</span>
      </div>
    );
  };

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">{state.name} <span className="text-sm text-slate-500">{state.year}</span></h2>
        {state.championId && <span className="text-sm text-amber-400">🏆 {name(state.championId)}</span>}
      </div>
      <div className="flex gap-2 text-xs">
        <button className={view === 'phase' ? 'btn-primary py-0.5 px-2' : 'btn-ghost py-0.5 px-2'} onClick={() => setView('phase')}>
          {state.format === 'groups' ? 'Groups' : 'League Phase'}
        </button>
        <button className={view === 'knockout' ? 'btn-primary py-0.5 px-2' : 'btn-ghost py-0.5 px-2'} onClick={() => setView('knockout')}>Knockout</button>
      </div>

      {view === 'phase' && state.format === 'swiss' && (
        <div>
          <div className="text-xs text-slate-500 mb-1"><span className="text-emerald-400">■</span> top 8 → Round of 16 · <span className="text-amber-400">■</span> 9–24 → play-off · 25+ eliminated</div>
          <div className="grid md:grid-cols-2 gap-x-6">
            {[table.slice(0, Math.ceil(table.length / 2)), table.slice(Math.ceil(table.length / 2))].map((half, hi) => (
              <div key={hi}>{half.map((r, j) => <TableRow key={r.clubId} r={r} i={hi === 0 ? j : j + Math.ceil(table.length / 2)} qualifyAt={8} playoffAt={24} />)}</div>
            ))}
          </div>
        </div>
      )}

      {view === 'phase' && state.format === 'groups' && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {groups.map((g, gi) => (
            <div key={gi} className="bg-surface-700 rounded p-2">
              <div className="text-xs font-semibold text-slate-400 mb-1">Group {String.fromCharCode(65 + gi)}</div>
              {g.map((r, i) => <TableRow key={r.clubId} r={r} i={i} qualifyAt={2} />)}
            </div>
          ))}
        </div>
      )}

      {view === 'knockout' && (
        ko.length === 0
          ? <p className="text-sm text-slate-500">The knockout stage hasn't been drawn yet — it's set once the {state.format === 'groups' ? 'group stage' : 'league phase'} finishes.</p>
          : (
            <div className="space-y-3">
              {KO_ORDER.filter((r) => ko.some((m) => m.stageLabel === r)).map((round) => (
                <div key={round}>
                  <div className="text-xs font-semibold text-slate-400 mb-1">{round}</div>
                  <div className="grid sm:grid-cols-2 gap-x-6 gap-y-0.5">
                    {ko.filter((m) => m.stageLabel === round).map((m) => {
                      const pen = m.events.find((e) => e.type === 'PENALTY');
                      const homeWin = m.played && (m.homeGoals > m.awayGoals || (pen && pen.side === 'home'));
                      const awayWin = m.played && (m.awayGoals > m.homeGoals || (pen && pen.side === 'away'));
                      return (
                        <button key={m.id} disabled={!m.played} onClick={() => navigate(`/match/${m.id}`)}
                          className={`flex items-center justify-between text-sm py-0.5 px-1 rounded ${m.played ? 'hover:bg-surface-700' : 'opacity-70'}`}>
                          <span className={homeWin ? 'text-white font-medium' : 'text-slate-400'}>{name(m.homeClubId)}</span>
                          <span className="font-mono text-xs text-slate-400 px-2">{m.played ? `${m.homeGoals}–${m.awayGoals}` : 'v'}{pen && ' (p)'}</span>
                          <span className={`text-right flex-1 ${awayWin ? 'text-white font-medium' : 'text-slate-400'}`}>{name(m.awayClubId)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )
      )}
    </div>
  );
}

function RollOfHonour() {
  const meta = useGameStore((s) => s.meta)!;
  const clubs = useGameStore((s) => s.clubs);
  const history = meta.continentalHistory ?? [];
  if (history.length === 0) return null;
  return (
    <div className="card p-4">
      <h2 className="text-sm font-semibold text-slate-400 mb-2">Roll of honour</h2>
      <div className="flex flex-wrap gap-2">
        {[...history].reverse().map((h, i) => (
          <div key={i} className="bg-surface-700 rounded px-3 py-1 text-sm">
            <span className="text-amber-400">🏆</span> {h.year} {h.name}: {clubs[h.clubId]?.shortName ?? h.clubId}
          </div>
        ))}
      </div>
    </div>
  );
}
