import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../state/store';
import { playerCareerOf } from '../../game/playerCareer';
import { YOUTH_POSITIONS } from '../../engine/academy';
import { POSITION_LABEL } from '../../engine/lineup';
import type { PlayerTrainingFocus } from '../../types/player';
import type { Position } from '../../types/attributes';

const FOCI: { id: PlayerTrainingFocus; label: string; blurb: string }[] = [
  { id: 'SHOOTING', label: 'Shooting', blurb: 'Finishing, long shots, composure.' },
  { id: 'PASSING', label: 'Passing', blurb: 'Vision, short & long passing.' },
  { id: 'DRIBBLING', label: 'Dribbling', blurb: 'Close control, agility, flair.' },
  { id: 'DEFENDING', label: 'Defending', blurb: 'Tackling, marking, positioning.' },
  { id: 'PHYSICAL', label: 'Physical', blurb: 'Pace, stamina, strength.' },
  { id: 'GOALKEEPING', label: 'Goalkeeping', blurb: 'Handling, reflexes, distribution.' },
];

export function PlayerTraining() {
  const navigate = useNavigate();
  const meta = useGameStore((s) => s.meta);
  const players = useGameStore((s) => s.players);
  const setTraining = useGameStore((s) => s.setTraining);
  const career = playerCareerOf(meta);
  const p = career ? players[career.playerId] : undefined;
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  if (!meta || !career || !p) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-slate-400">This save isn’t a player career.</p>
        <button className="btn-primary" onClick={() => navigate('/dashboard')}>Go to dashboard</button>
      </div>
    );
  }

  const focus = p.training?.focus ?? null;
  const retrain = p.training?.retrainPosition ?? null;
  const retrainProgress = p.training?.retrainProgress ?? 0;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h1 className="page-title">Training</h1>

      <div className="card p-4">
        <h2 className="text-sm font-semibold text-slate-400 mb-1">Focus</h2>
        <p className="text-xs text-slate-500 mb-3">Where you put in the extra hours. Good form and regular minutes speed your growth toward your potential.</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {FOCI.map((f) => (
            <button
              key={f.id}
              onClick={() => { void setTraining(p.id, { focus: focus === f.id ? null : f.id }); flash(focus === f.id ? 'Focus cleared.' : `Focusing on ${f.label.toLowerCase()}.`); }}
              className={`text-left p-3 rounded-lg border transition-colors ${focus === f.id ? 'border-accent bg-accent/10' : 'border-surface-600 hover:bg-surface-700'}`}
            >
              <div className="font-medium text-white">{f.label}</div>
              <div className="text-xs text-slate-400">{f.blurb}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="card p-4">
        <h2 className="text-sm font-semibold text-slate-400 mb-1">Learn a new position</h2>
        <p className="text-xs text-slate-500 mb-3">Retrain to add versatility. Progress builds day by day until the new role is second nature.</p>
        <div className="flex items-center gap-3">
          <select
            className="bg-surface-700 border border-surface-600 rounded px-3 py-2 text-sm"
            value={retrain ?? ''}
            onChange={(e) => { const v = e.target.value ? (e.target.value as Position) : null; void setTraining(p.id, { retrainPosition: v }); flash(v ? `Learning ${POSITION_LABEL[v] ?? v}.` : 'Retraining stopped.'); }}
          >
            <option value="">— none —</option>
            {YOUTH_POSITIONS.filter((pos) => !p.positions.includes(pos)).map((pos) => (
              <option key={pos} value={pos}>{POSITION_LABEL[pos] ?? pos}</option>
            ))}
          </select>
          {retrain && (
            <div className="flex-1">
              <div className="text-xs text-slate-500 mb-1">Learning {POSITION_LABEL[retrain] ?? retrain} — {Math.round(retrainProgress)}%</div>
              <div className="h-2 rounded bg-surface-700 overflow-hidden"><div className="h-full bg-accent-500" style={{ width: `${Math.round(retrainProgress)}%` }} /></div>
            </div>
          )}
        </div>
      </div>

      <div className="card p-4">
        <h2 className="text-sm font-semibold text-slate-400 mb-2">Current positions</h2>
        <div className="flex flex-wrap gap-2">
          {p.positions.map((pos) => (
            <span key={pos} className="bg-surface-700 rounded px-2 py-1 text-xs">{POSITION_LABEL[pos] ?? pos}{pos === p.position ? ' ★' : ''}</span>
          ))}
        </div>
      </div>

      {toast && <div className="fixed bottom-6 right-6 card px-4 py-3 text-sm shadow-lg border-accent">{toast}</div>}
    </div>
  );
}
