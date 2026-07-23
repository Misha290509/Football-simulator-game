import { useMemo, useState } from 'react';
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
import { ROLES_BY_POSITION, defaultRoleFor } from '../../engine/roles';
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
  const setTacticSlider = useGameStore((s) => s.setTacticSlider);
  const setSetPieceTaker = useGameStore((s) => s.setSetPieceTaker);
  const setAutoMode = useGameStore((s) => s.setAutoMode);
  const setLockFormation = useGameStore((s) => s.setLockFormation);
  const setSlotRole = useGameStore((s) => s.setSlotRole);
  const autoFillLineup = useGameStore((s) => s.autoFillLineup);
  const saveSquad = useGameStore((s) => s.saveSquad);
  const saveLineupPreset = useGameStore((s) => s.saveLineupPreset);
  const applyLineupPreset = useGameStore((s) => s.applyLineupPreset);
  const deleteLineupPreset = useGameStore((s) => s.deleteLineupPreset);

  const [presetName, setPresetName] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 4000); };
  const presets = club.lineupPresets ?? [];

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
    // Dropping onto the bench card itself (not a specific slot): drop into the
    // first free bench slot, or the last one if the bench is full.
    let tgt = target;
    if (target.zone === 'bench' && target.index === undefined) {
      const empty = nb.findIndex((x) => !x);
      tgt = { zone: 'bench', index: empty === -1 ? nb.length - 1 : empty };
    }
    if (tgt.index === undefined) return; // nothing to write to
    const T = playerAt(tgt); // displaced player (may be null)
    write(tgt, S);
    if (source.zone !== 'reserve') write(source, T);
    void saveSquad(nl, nb);
  };

  const dragProps = (loc: DragLoc, playerId: string | null) =>
    editable && playerId
      ? {
          draggable: true,
          onDragStart: (e: React.DragEvent) => {
            e.dataTransfer.setData('text/plain', JSON.stringify({ ...loc, playerId }));
            e.dataTransfer.effectAllowed = 'move';
          },
        }
      : {};
  const dropProps = (loc: DragLoc) =>
    editable
      ? {
          onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; },
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            // Stop the drop from bubbling to a parent drop zone (e.g. a bench
            // slot up to the bench card), which would otherwise re-handle the
            // same drop against the wrong target and clobber the result.
            e.stopPropagation();
            handleDrop(loc, e.dataTransfer.getData('text/plain'));
          },
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
            {(ROLES_BY_POSITION[slot]?.length ?? 0) > 1 && (
              <select
                className="mt-1 w-full bg-surface-700 border border-surface-600 rounded text-[9px] px-0.5 py-0.5 text-slate-300"
                value={club.roles?.[slotIndex] ?? defaultRoleFor(slot)}
                draggable={false}
                onMouseDown={(e) => e.stopPropagation()}
                onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => { const v = e.target.value; void setSlotRole(slotIndex, v === defaultRoleFor(slot) ? null : v); }}
                title="Player role"
              >
                {ROLES_BY_POSITION[slot].map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            )}
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
      <h1 className="page-title">Tactics &amp; Formation</h1>

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
        {([['width', 'Width', 'Narrow', 'Wide'], ['tempo', 'Tempo', 'Patient', 'High'], ['pressing', 'Pressing', 'Contain', 'Press']] as const).map(([k, label, lo, hi]) => (
          <label key={k} className="text-sm w-36">
            <span className="block text-xs text-slate-400 mb-1">{label} <span className="text-slate-600">({club.tactics?.[k] ?? 50})</span></span>
            <input type="range" min={0} max={100} step={5} className="w-full" value={club.tactics?.[k] ?? 50} onChange={(e) => void setTacticSlider(k, Number(e.target.value))} />
            <span className="flex justify-between text-[9px] text-slate-600"><span>{lo}</span><span>{hi}</span></span>
          </label>
        ))}
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

      {/* Saved team sheets — switch a first XI / rest XI in one click */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="section-title">Team sheets</h2>
          <span className="text-xs text-slate-500">Save your current XI &amp; formation, then switch to rest players in a click.</span>
        </div>
        {presets.length > 0 ? (
          <div className="flex flex-wrap gap-2 mb-3">
            {presets.map((p, i) => (
              <div key={p.name} className="flex items-center bg-surface-700 rounded-md overflow-hidden border border-surface-600">
                <button
                  className="px-3 py-1.5 text-sm hover:bg-accent/10"
                  title={`Load ${p.name} (${p.formation})`}
                  onClick={async () => flash((await applyLineupPreset(i)).message)}
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="text-xs text-slate-500 ml-1.5">{p.formation}</span>
                </button>
                <button
                  className="px-2 py-1.5 text-slate-500 hover:text-rose-300 border-l border-surface-600"
                  title={`Delete ${p.name}`}
                  onClick={() => deleteLineupPreset(i)}
                >✕</button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500 mb-3">No saved team sheets yet.</p>
        )}
        <div className="flex gap-2 max-w-md">
          <input
            className="flex-1 bg-surface-700 border border-surface-600 rounded px-3 py-1.5 text-sm"
            placeholder={presets.length ? 'Name (e.g. Rotation, Cup XI)…' : 'Name your first XI (e.g. First XI)…'}
            value={presetName}
            maxLength={20}
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && presetName.trim()) { void saveLineupPreset(presetName).then((r) => flash(r.message)); setPresetName(''); } }}
          />
          <button
            className="btn-ghost text-sm"
            disabled={!presetName.trim() || presets.length >= 6}
            onClick={async () => { flash((await saveLineupPreset(presetName)).message); setPresetName(''); }}
          >Save current XI</button>
        </div>
        {presets.length >= 6 && <p className="text-xs text-amber-300/80 mt-1.5">Preset limit reached (6) — delete one to add another.</p>}
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

      {toast && <div className="fixed bottom-6 right-6 card px-4 py-3 text-sm shadow-lg border-accent max-w-sm">{toast}</div>}
    </div>
  );
}
