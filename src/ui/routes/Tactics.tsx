import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../state/store';
import {
  FORMATION_NAMES,
  formationRows,
  POSITION_LABEL,
  assignXI,
  resolveBench,
  lineupAverage,
  FORMATIONS,
} from '../../engine/lineup';
import { overallAt } from '../../engine/ratings';
import { ratingColor, fullName, playerStatus } from '../format';
import type { Player } from '../../types/player';

const DEF_OPTS: [string, string][] = [['DEEP', 'Play Deep'], ['BALANCED', 'Balanced'], ['PRESSING', 'Pressing']];
const OFF_OPTS: [string, string][] = [['POSSESSION', 'Possession'], ['COUNTER', 'Counter Attack'], ['DIRECT', 'Direct']];

type Zone = 'lineup' | 'bench' | 'reserve';
interface DragLoc { zone: Zone; index?: number; playerId?: string }

const pad = (arr: (string | null)[] | undefined, n: number): (string | null)[] =>
  Array.from({ length: n }, (_, i) => arr?.[i] ?? null);

export function Tactics() {
  const navigate = useNavigate();
  const club = useGameStore((s) => s.managerClub())!;
  const squad = useGameStore((s) => s.getClubPlayers(club.id));
  const setFormation = useGameStore((s) => s.setFormation);
  const setTactic = useGameStore((s) => s.setTactic);
  const setSetPieceTaker = useGameStore((s) => s.setSetPieceTaker);
  const setAutoMode = useGameStore((s) => s.setAutoMode);
  const setLockFormation = useGameStore((s) => s.setLockFormation);
  const autoFillLineup = useGameStore((s) => s.autoFillLineup);
  const saveSquad = useGameStore((s) => s.saveSquad);

  const formation = club.formation;
  const slots = FORMATIONS[formation] ?? FORMATIONS['4-3-3'];
  const rows = formationRows(formation);
  const autoMode = club.autoMode ?? true;
  const editable = !autoMode;

  const byId = useMemo(() => new Map(squad.map((p) => [p.id, p])), [squad]);

  // Resolved arrays for display. Auto mode = computed; manual = the saved choices.
  const lineup: (string | null)[] = autoMode
    ? assignXI(squad, formation, { autoMode: true }).map((a) => a?.player.id ?? null)
    : pad(club.lineup, 11);
  const bench: (string | null)[] = autoMode
    ? resolveBench(squad, formation, { autoMode: true }).map((p) => p.id).concat(Array(9).fill(null)).slice(0, 9)
    : pad(club.bench, 9);

  const inLineup = new Set(lineup.filter(Boolean) as string[]);
  const onBench = new Set(bench.filter(Boolean) as string[]);
  const reserves = squad.filter((p) => !inLineup.has(p.id) && !onBench.has(p.id));

  const avg = lineupAverage(squad, formation, { lineup: club.lineup, autoMode });

  // --- Drag and drop ------------------------------------------------------
  const playerAt = (loc: DragLoc): string | null => {
    if (loc.zone === 'reserve') return loc.playerId ?? null;
    if (loc.zone === 'lineup') return lineup[loc.index!];
    return bench[loc.index!];
  };

  const handleDrop = (target: DragLoc, raw: string) => {
    if (!editable || !raw) return;
    const source = JSON.parse(raw) as DragLoc;
    const S = playerAt(source);
    if (!S) return;
    const nl = [...lineup];
    const nb = [...bench];
    const write = (loc: DragLoc, pid: string | null) => {
      if (loc.zone === 'lineup') nl[loc.index!] = pid;
      else if (loc.zone === 'bench') nb[loc.index!] = pid;
    };
    // Dropping onto the reserves panel just removes S from its slot.
    if (target.zone === 'reserve') {
      if (source.zone !== 'reserve') write(source, null);
      void saveSquad(nl, nb);
      return;
    }
    const T = playerAt(target); // displaced player (may be null)
    write(target, S);
    if (source.zone !== 'reserve') write(source, T);
    void saveSquad(nl, nb);
  };

  const dragProps = (loc: DragLoc, playerId: string | null) =>
    editable && playerId
      ? {
          draggable: true,
          onDragStart: (e: React.DragEvent) =>
            e.dataTransfer.setData('text/plain', JSON.stringify({ ...loc, playerId })),
        }
      : {};
  const dropProps = (loc: DragLoc) =>
    editable
      ? {
          onDragOver: (e: React.DragEvent) => e.preventDefault(),
          onDrop: (e: React.DragEvent) => handleDrop(loc, e.dataTransfer.getData('text/plain')),
        }
      : {};

  // Pitch rows: GK (slot 0) then outfield grouped by the formation digits.
  const pitchRows: number[][] = [];
  let idx = 1;
  for (const n of rows) pitchRows.push(Array.from({ length: n }, () => idx++));

  const SlotCell = ({ slotIndex }: { slotIndex: number }) => {
    const pid = lineup[slotIndex];
    const p = pid ? byId.get(pid) : undefined;
    const slot = slots[slotIndex];
    return (
      <div
        {...dragProps({ zone: 'lineup', index: slotIndex }, pid)}
        {...dropProps({ zone: 'lineup', index: slotIndex })}
        className={`min-w-[86px] rounded-md px-2 py-1.5 text-center border border-surface-600 bg-surface-800/90 ${
          editable ? (p ? 'cursor-grab' : 'cursor-pointer') : ''
        }`}
      >
        <div className="text-[10px] font-bold text-slate-400">{POSITION_LABEL[slot]}</div>
        {p ? (
          <>
            <div className="text-xs font-medium truncate max-w-[82px]">{p.name.last}</div>
            <div className={`text-xs font-mono ${ratingColor(overallAt(p.attributes, slot))}`}>{overallAt(p.attributes, slot)}</div>
          </>
        ) : (
          <div className="text-xs text-slate-500 italic">empty</div>
        )}
      </div>
    );
  };

  const PlayerRow = ({ p, loc }: { p: Player; loc: DragLoc }) => {
    const st = playerStatus(p);
    return (
      <div
        {...dragProps(loc, p.id)}
        className={`flex items-center justify-between rounded px-2 py-1.5 text-sm bg-surface-700 ${editable ? 'cursor-grab hover:bg-surface-600' : ''}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-xs text-slate-500 w-7">{p.position}</span>
          <button className="truncate hover:underline" onClick={() => navigate(`/player/${p.id}`)}>{fullName(p)}</button>
        </div>
        <div className="flex items-center gap-2">
          {(p.injury || p.cards.suspendedFor > 0) && <span className={`text-[10px] px-1 rounded ${st.className}`}>{st.label}</span>}
          <span className={`font-mono font-semibold ${ratingColor(p.overall)}`}>{p.overall}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">Tactics &amp; Formation</h1>

      {/* Controls */}
      <div className="card p-4 flex flex-wrap items-end gap-4">
        <label className="text-sm">
          <span className="block text-xs text-slate-400 mb-1">Formation</span>
          <select className="bg-surface-700 border border-surface-600 rounded px-2 py-1.5" value={formation} onChange={(e) => setFormation(e.target.value)}>
            {FORMATION_NAMES.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
        <label className="text-sm flex items-center gap-2 pb-1.5">
          <input type="checkbox" checked={club.lockFormation ?? false} onChange={(e) => setLockFormation(e.target.checked)} />
          <span className="text-slate-300">Lock formation</span>
        </label>
        <label className="text-sm">
          <span className="block text-xs text-slate-400 mb-1">Defensive</span>
          <select className="bg-surface-700 border border-surface-600 rounded px-2 py-1.5" value={club.tactics?.defensive ?? 'BALANCED'} onChange={(e) => setTactic('defensive', e.target.value)}>
            {DEF_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-xs text-slate-400 mb-1">Offensive</span>
          <select className="bg-surface-700 border border-surface-600 rounded px-2 py-1.5" value={club.tactics?.offensive ?? 'POSSESSION'} onChange={(e) => setTactic('offensive', e.target.value)}>
            {OFF_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="text-sm flex items-center gap-2 pb-1.5">
          <input type="checkbox" checked={autoMode} onChange={(e) => setAutoMode(e.target.checked)} />
          <span className="text-slate-300">Auto-Mode</span>
        </label>
        <div className="ml-auto text-center">
          <div className="text-xs text-slate-400">Avg rating</div>
          <div className={`text-2xl font-mono font-bold ${ratingColor(avg)}`}>{avg}</div>
        </div>
      </div>

      {/* Set-piece takers */}
      <div className="card p-4 flex flex-wrap items-end gap-4">
        <span className="text-sm font-semibold text-slate-400 w-full sm:w-auto">Set-piece takers</span>
        {([['penalty', 'Penalties'], ['freeKick', 'Free-kicks'], ['corner', 'Corners']] as const).map(([role, label]) => {
          const cur = role === 'penalty' ? club.penaltyTakerId : role === 'freeKick' ? club.freeKickTakerId : club.cornerTakerId;
          return (
            <label key={role} className="text-sm">
              <span className="block text-xs text-slate-400 mb-1">{label}</span>
              <select
                className="bg-surface-700 border border-surface-600 rounded px-2 py-1.5 min-w-[10rem]"
                value={cur ?? ''}
                onChange={(e) => setSetPieceTaker(role, e.target.value)}
              >
                <option value="">— auto —</option>
                {[...squad].sort((a, b) => b.overall - a.overall).map((p) => (
                  <option key={p.id} value={p.id}>{p.name.first[0]}. {p.name.last} ({p.position})</option>
                ))}
              </select>
            </label>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-[1fr,300px] gap-4">
        {/* Pitch */}
        <div className="card p-4">
          {/* Viewed from the manager's perspective: the team attacks upward, so
              the front line sits at the top and the keeper at the bottom. */}
          <div className="rounded-md bg-gradient-to-b from-green-800/40 to-green-900/40 border border-green-900/50 p-4 space-y-5">
            {[...pitchRows].reverse().map((row, ri) => (
              <div key={ri} className="flex justify-around gap-2">{row.map((si) => <SlotCell key={si} slotIndex={si} />)}</div>
            ))}
            <div className="flex justify-center"><SlotCell slotIndex={0} /></div>
          </div>
          <div className="flex items-center justify-between mt-3">
            <p className="text-xs text-slate-500">
              {autoMode
                ? `Auto-Mode on — best XI${club.lockFormation ? '' : ' & formation'} picked automatically.`
                : 'Drag players between the pitch, bench and reserves to set your team.'}
            </p>
            {editable && <button className="btn-ghost text-xs" onClick={() => autoFillLineup()}>Auto-fill</button>}
          </div>
        </div>

        {/* Bench + Reserves */}
        <div className="space-y-4">
          <div className="card p-3" {...dropProps({ zone: 'bench' })}>
            <h2 className="text-sm font-semibold text-slate-400 mb-2 px-1">Bench <span className="text-slate-600">(subs · 9)</span></h2>
            <div className="space-y-1">
              {Array.from({ length: 9 }, (_, i) => {
                const pid = bench[i];
                const p = pid ? byId.get(pid) : undefined;
                return (
                  <div key={i} {...dropProps({ zone: 'bench', index: i })} className="min-h-[34px]">
                    {p ? <PlayerRow p={p} loc={{ zone: 'bench', index: i }} /> : (
                      <div className="text-xs text-slate-600 italic px-2 py-2 rounded border border-dashed border-surface-600">empty bench slot</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card p-3" {...dropProps({ zone: 'reserve' })}>
            <h2 className="text-sm font-semibold text-slate-400 mb-2 px-1">Reserves <span className="text-slate-600">({reserves.length})</span></h2>
            <div className="space-y-1 max-h-[260px] overflow-y-auto pr-1">
              {reserves.length === 0 ? (
                <p className="text-xs text-slate-600 px-1 py-2">No reserves — everyone's in the squad or on the bench.</p>
              ) : (
                [...reserves].sort((a, b) => b.overall - a.overall).map((p) => (
                  <PlayerRow key={p.id} p={p} loc={{ zone: 'reserve', playerId: p.id }} />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
