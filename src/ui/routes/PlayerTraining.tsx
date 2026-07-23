import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../state/store';
import { playerCareerOf } from '../../game/playerCareer';
import { YOUTH_POSITIONS } from '../../engine/academy';
import { POSITION_LABEL } from '../../engine/lineup';
import { focusRating, flattenAttributes } from '../../engine/development';
import { ratingColor } from '../format';
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

const attrLabel = (k: string) => k.replace(/([A-Z])/g, ' $1').replace(/^gk /i, '').trim();

const GROUP_LABEL: Record<string, string> = { technical: 'Technical', mental: 'Mental', physical: 'Physical', goalkeeping: 'Goalkeeping' };

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
  const isGk = p.position === 'GK';
  const seasonDeltas = p.lastSeasonChange?.attrs ?? {};

  // Skill-area ratings (aligned with the training foci), + strengths/weaknesses.
  const areas = FOCI
    .filter((f) => f.id !== 'GOALKEEPING' || isGk)
    .map((f) => ({ ...f, rating: focusRating(p.attributes, f.id) }));
  const flat = flattenAttributes(p.attributes);
  const ranked = Object.entries(flat).filter(([k]) => isGk || !k.startsWith('gk')).sort((a, b) => b[1] - a[1]);
  const strengths = ranked.slice(0, 3);
  const weaknesses = [...ranked].reverse().filter(([k]) => isGk || !['gkDiving', 'gkHandling', 'gkKicking', 'gkPositioning', 'gkReflexes'].includes(k)).slice(0, 3);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h1 className="page-title">Training</h1>

      {/* Identity + overall */}
      <div className="card p-4 flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold text-white">{p.name.first} {p.name.last}</div>
          <div className="text-xs text-slate-500">{p.positions.map((pos) => POSITION_LABEL[pos] ?? pos).join(' · ')}</div>
        </div>
        <div className="flex gap-4 text-center">
          <div><div className="text-[11px] uppercase tracking-wide text-slate-500">OVR</div><div className={`text-2xl font-bold ${ratingColor(p.overall)}`}>{p.overall}</div></div>
          <div><div className="text-[11px] uppercase tracking-wide text-slate-500">POT</div><div className={`text-2xl font-bold ${ratingColor(p.potential)}`}>{p.potential}</div></div>
        </div>
      </div>

      {/* Skill areas — tap one to focus training there */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-slate-400 mb-1">Skill areas &amp; focus</h2>
        <p className="text-xs text-slate-500 mb-3">Your rating in each area. Tap one to pour your extra hours into it — good form and regular minutes speed the growth.</p>
        <div className="space-y-2">
          {areas.map((f) => {
            const active = focus === f.id;
            return (
              <button
                key={f.id}
                onClick={() => { void setTraining(p.id, { focus: active ? null : f.id }); flash(active ? 'Focus cleared.' : `Focusing on ${f.label.toLowerCase()}.`); }}
                className={`w-full text-left p-2.5 rounded-lg border transition-colors ${active ? 'border-accent bg-accent/10' : 'border-surface-700 hover:bg-surface-700/60'}`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-24 text-sm font-medium text-white shrink-0">{f.label}{active && <span className="text-accent-400"> ●</span>}</span>
                  <div className="flex-1 h-2 rounded bg-surface-700 overflow-hidden"><div className="h-full bg-accent-500/70" style={{ width: `${f.rating}%` }} /></div>
                  <span className={`w-8 text-right font-mono text-sm ${ratingColor(f.rating)}`}>{f.rating}</span>
                </div>
                {active && <div className="text-[11px] text-slate-400 mt-1">{f.blurb}</div>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Strengths & weaknesses */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="card p-4">
          <h2 className="text-xs uppercase tracking-wide text-emerald-400/80 mb-2">Strengths</h2>
          {strengths.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between text-sm py-0.5"><span className="text-slate-300 capitalize">{attrLabel(k)}</span><span className={`font-mono ${ratingColor(v)}`}>{Math.round(v)}</span></div>
          ))}
        </div>
        <div className="card p-4">
          <h2 className="text-xs uppercase tracking-wide text-rose-400/80 mb-2">To work on</h2>
          {weaknesses.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between text-sm py-0.5"><span className="text-slate-300 capitalize">{attrLabel(k)}</span><span className={`font-mono ${ratingColor(v)}`}>{Math.round(v)}</span></div>
          ))}
        </div>
      </div>

      {/* Full attribute breakdown */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-slate-400 mb-3">Your attributes</h2>
        <div className="grid sm:grid-cols-3 gap-x-6 gap-y-4">
          {(['technical', 'mental', 'physical'] as const).map((grp) => (
            <AttrGroup key={grp} title={GROUP_LABEL[grp]} group={p.attributes[grp]} deltas={seasonDeltas} />
          ))}
          {isGk && <AttrGroup title={GROUP_LABEL.goalkeeping} group={p.attributes.goalkeeping} deltas={seasonDeltas} />}
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

      <MatchSettings />

      {toast && <div className="fixed bottom-6 right-6 card px-4 py-3 text-sm shadow-lg border-accent">{toast}</div>}
    </div>
  );
}

function AttrGroup({ title, group, deltas }: { title: string; group: Record<string, number>; deltas?: Record<string, number> }) {
  return (
    <div>
      <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-2">{title}</h3>
      <div className="space-y-1">
        {Object.entries(group).map(([k, v]) => {
          const d = deltas?.[k];
          return (
            <div key={k} className="flex items-center justify-between text-sm">
              <span className="text-slate-400 capitalize">{attrLabel(k)}</span>
              <span className="flex items-center gap-1.5">
                {d != null && d !== 0 && (
                  <span className={`text-[10px] font-mono font-semibold ${d > 0 ? 'text-emerald-400' : 'text-rose-400'}`} title="Change last season">{d > 0 ? '+' : ''}{d}</span>
                )}
                <span className={`font-mono ${ratingColor(v)}`}>{Math.round(v)}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MatchSettings() {
  const meta = useGameStore((s) => s.meta);
  const setCareerSettings = useGameStore((s) => s.setCareerSettings);
  const s = meta?.careerSettings ?? { interactive: true, timed: false, timerSeconds: 15, momentFrequency: 'NORMAL' as const };
  return (
    <div className="card p-4 space-y-3">
      <h2 className="text-sm font-semibold text-slate-400">Match settings</h2>
      <label className="flex items-center justify-between text-sm">
        <span className="text-slate-300">Play key moments interactively</span>
        <input type="checkbox" checked={s.interactive} onChange={(e) => void setCareerSettings({ interactive: e.target.checked })} />
      </label>
      <label className="flex items-center justify-between text-sm">
        <span className="text-slate-300">Timed decisions <span className="text-slate-500">(optional)</span></span>
        <input type="checkbox" checked={s.timed} onChange={(e) => void setCareerSettings({ timed: e.target.checked })} />
      </label>
      {s.timed && (
        <label className="block text-sm">
          <span className="text-slate-400">Timer: {s.timerSeconds}s</span>
          <input type="range" min={5} max={30} step={1} value={s.timerSeconds} className="w-full" onChange={(e) => void setCareerSettings({ timerSeconds: Number(e.target.value) })} />
        </label>
      )}
      <label className="block text-sm">
        <span className="text-slate-400">Moment frequency</span>
        <select className="mt-1 w-full bg-surface-700 border border-surface-600 rounded px-3 py-2 text-sm" value={s.momentFrequency} onChange={(e) => void setCareerSettings({ momentFrequency: e.target.value as 'LOW' | 'NORMAL' | 'HIGH' })}>
          <option value="LOW">Fewer (quicker matches)</option>
          <option value="NORMAL">Normal</option>
          <option value="HIGH">More (more involved)</option>
        </select>
      </label>
      <p className="text-xs text-slate-500">Turn interactive off to auto-simulate every match. Timers are always optional.</p>
    </div>
  );
}
