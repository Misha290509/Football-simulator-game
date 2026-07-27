import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../state/store';
import { playerCareerOf } from '../../game/playerCareer';
import { YOUTH_POSITIONS } from '../../engine/academy';
import { POSITION_LABEL } from '../../engine/lineup';
import { focusRating, flattenAttributes } from '../../engine/development';
import { ratingColor } from '../format';
import { INTENSITY, intensityOf, investCost, attrCeiling, type TrainingIntensity } from '../../game/playerDevelopment';
import {
  habitById, BODY, bodyOf, availableBadges, BADGES, CAMPS, versatilityRating,
  type BodyType,
} from '../../game/trainingDepth';
import type { PlayerTrainingFocus } from '../../types/player';
import type { Position, AttributeKey } from '../../types/attributes';

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
  const setTrainingIntensity = useGameStore((s) => s.setTrainingIntensity);
  const investDP = useGameStore((s) => s.investDevelopmentPoints);
  const trainOutHabit = useGameStore((s) => s.trainOutBadHabit);
  const studyMoment = useGameStore((s) => s.studyMomentType);
  const setBody = useGameStore((s) => s.setPlayerBodyType);
  const startBadge = useGameStore((s) => s.startCoachingBadge);
  const attendCamp = useGameStore((s) => s.attendTrainingCamp);
  const season = useGameStore((s) => s.currentSeason());
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

      {/* Development Points + weekly intensity — the hands-on progression */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-400">Development</h2>
          <span className="text-sm"><span className="text-slate-500 text-xs uppercase tracking-wide mr-1">Points</span><span className="font-bold text-emerald-300 tabular-nums">{Math.round(career.developmentPoints ?? 0)}</span> <span className="text-slate-500 text-xs">DP</span></span>
        </div>
        <p className="text-xs text-slate-500">Earn Development Points by playing well, then spend them below to grow the attributes <em>you</em> choose (▲ next to each). Set your weekly training intensity — push hard for faster growth, or ease off to stay fresh.</p>
        <div className="grid grid-cols-3 gap-2">
          {(['LIGHT', 'BALANCED', 'INTENSE'] as TrainingIntensity[]).map((k) => {
            const active = intensityOf(career) === k;
            return (
              <button key={k} onClick={() => { void setTrainingIntensity(k); flash(`Training: ${INTENSITY[k].label.toLowerCase()}.`); }}
                className={`text-left p-2.5 rounded-lg border ${active ? 'border-accent bg-accent/10' : 'border-surface-700 hover:bg-surface-700/60'}`}>
                <div className="text-sm font-medium text-white">{INTENSITY[k].label}</div>
                <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">{INTENSITY[k].blurb}</div>
              </button>
            );
          })}
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

      {/* Coach, focus progress & this week's report */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-400">Development</h2>
          {career.coachRelationship != null && <span className="text-[11px] text-slate-500">Coach rapport {Math.round(career.coachRelationship)}</span>}
        </div>
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-400">Progress toward your next step{focus ? ` in ${FOCI.find((f) => f.id === focus)?.label.toLowerCase() ?? focus.toLowerCase()}` : ''}</span>
            <span className="font-mono text-slate-500">{Math.round(career.focusProgress ?? 0)}%</span>
          </div>
          <div className="h-2 rounded bg-surface-700 overflow-hidden"><div className="h-full bg-accent-500" style={{ width: `${Math.round(career.focusProgress ?? 0)}%` }} /></div>
        </div>
        {career.coachAdviceFocus && career.coachAdviceFocus !== focus && (
          <div className="text-xs text-sky-300/90">💬 The coach reckons you should focus on <span className="font-medium">{FOCI.find((f) => f.id === career.coachAdviceFocus)?.label ?? career.coachAdviceFocus}</span>.</div>
        )}
        {career.trainingReport && (
          <div className="text-xs text-slate-400 border-t border-surface-700 pt-2">
            <div>📋 {career.trainingReport.note}</div>
            {career.trainingReport.sharpnessNote && <div className="text-slate-500 mt-0.5">{career.trainingReport.sharpnessNote}</div>}
          </div>
        )}
      </div>

      {/* Bad habits */}
      {(career.badHabits ?? []).length > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-1">Habits to break</h2>
          <p className="text-xs text-slate-500 mb-3">Repeated behaviour has hardened into a reputation. Weeks of unglamorous work will shift it.</p>
          <div className="space-y-2">
            {(career.badHabits ?? []).map((h) => {
              const def = habitById(h.id)!;
              return (
                <div key={h.id} className="p-2.5 rounded-lg border border-rose-500/25 bg-rose-500/5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-rose-200">{def.label}</span>
                    {h.trainingOut
                      ? <span className="text-[10px] text-emerald-300">working on it · {Math.round(h.progress)}%</span>
                      : <button className="btn-ghost text-[11px]" onClick={async () => flash(await trainOutHabit(h.id))}>Train it out</button>}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{def.blurb}</div>
                  {h.trainingOut && <div className="h-1 rounded bg-surface-700 overflow-hidden mt-1.5"><div className="h-full bg-emerald-500" style={{ width: `${h.progress}%` }} /></div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Video analysis */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-slate-400 mb-1">Video analysis</h2>
        <p className="text-xs text-slate-500 mb-3">Sit down with the analyst and study the situations you keep getting wrong. A small permanent edge on exactly that moment.</p>
        <div className="flex flex-wrap gap-2">
          {(['ONE_ON_ONE', 'LONG_SHOT', 'HEADER', 'TAKE_ON', 'THROUGH_BALL', 'SLIDE_TACKLE', 'SHOT_STOP'] as const).map((t) => {
            const a = (career.analysis ?? []).find((x) => x.type === t);
            return (
              <button key={t} onClick={async () => flash(await studyMoment(t))}
                className="text-left px-2.5 py-1.5 rounded-lg border border-surface-600 hover:border-accent hover:bg-accent/5">
                <span className="text-xs text-slate-200 capitalize">{t.toLowerCase().replace(/_/g, ' ')}</span>
                {a && <span className="text-[10px] text-emerald-300 ml-1.5">+{Math.round(a.bonus * 100)}%</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Body composition */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-slate-400">Body composition</h2>
          <span className="text-[11px] text-slate-500">Versatility {versatilityRating(p)}</span>
        </div>
        <p className="text-xs text-slate-500 mb-3">Leaner and quicker, or heavier and harder to shift. A real trade-off in pace, strength and how easily you break down.</p>
        <div className="grid sm:grid-cols-3 gap-2">
          {(['LEAN', 'BALANCED', 'POWERFUL'] as BodyType[]).map((b) => (
            <button key={b} onClick={async () => flash(await setBody(b))}
              className={`text-left p-2.5 rounded-lg border ${bodyOf(career) === b ? 'border-accent bg-accent/10' : 'border-surface-600 hover:bg-surface-700'}`}>
              <div className="text-sm text-white">{BODY[b].label}</div>
              <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">{BODY[b].blurb}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Coaching badges */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-slate-400 mb-1">Coaching badges</h2>
        <p className="text-xs text-slate-500 mb-3">Study while you still play — it's what opens the dugout afterwards.</p>
        {(career.badges ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {(career.badges ?? []).map((b) => (
              <span key={b} className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/25">🎓 {BADGES.find((x) => x.id === b)?.label ?? b}</span>
            ))}
          </div>
        )}
        {career.badgeStudy ? (
          <div className="text-xs text-sky-300">📚 Studying for the {BADGES.find((b) => b.id === career.badgeStudy!.id)?.label} — it takes time around training.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {availableBadges(career, (season?.year ?? meta.startYear) - p.born.year).map((b) => (
              <button key={b.id} onClick={async () => flash(await startBadge(b.id))}
                className="text-left p-2.5 rounded-lg border border-surface-600 hover:border-accent hover:bg-accent/5">
                <div className="text-sm text-white">{b.label}</div>
                <div className="text-[10px] text-slate-500">{b.blurb}</div>
              </button>
            ))}
            {availableBadges(career, (season?.year ?? meta.startYear) - p.born.year).length === 0 && (
              <p className="text-xs text-slate-500">Nothing available yet — the first badge opens up in your mid-twenties.</p>
            )}
          </div>
        )}
      </div>

      {/* Off-season camp */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-slate-400 mb-1">Off-season</h2>
        <p className="text-xs text-slate-500 mb-3">How you spend the summer decides how you come back.{career.lastCamp ? ` Last summer: ${CAMPS.find((c) => c.id === career.lastCamp)?.label.toLowerCase()}.` : ''}</p>
        <div className="grid sm:grid-cols-3 gap-2">
          {CAMPS.map((c) => (
            <button key={c.id} onClick={async () => flash(await attendCamp(c.id))}
              className="text-left p-2.5 rounded-lg border border-surface-600 hover:border-accent hover:bg-accent/5">
              <div className="text-sm text-white">{c.label}</div>
              <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">{c.blurb}</div>
              <div className="text-[10px] text-slate-500 mt-1">{c.dp ? `+${c.dp} DP · ` : ''}{c.sharpness > 0 ? `+${c.sharpness} sharpness` : `${c.sharpness} sharpness`}{c.morale > 0 ? ` · +${c.morale} morale` : ''}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Trait quests — how close you are to unlocking a perk */}
      {career.traitProgress && Object.keys(career.traitProgress).length > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-2">Traits in progress</h2>
          <div className="space-y-2">
            {Object.entries(career.traitProgress).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, pct]) => (
              <div key={id}>
                <div className="flex items-center justify-between text-xs mb-1"><span className="text-slate-300 capitalize">{id.replace(/_/g, ' ').toLowerCase()}</span><span className="font-mono text-slate-500">{Math.round(pct)}%</span></div>
                <div className="h-1.5 rounded bg-surface-700 overflow-hidden"><div className="h-full bg-emerald-500/70" style={{ width: `${Math.round(pct)}%` }} /></div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-600 mt-2">Push the right attributes over the line in training to unlock these perks.</p>
        </div>
      )}

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

      {/* Full attribute breakdown — spend DP to grow any of them */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-400">Your attributes</h2>
          <span className="text-[11px] text-slate-500">▲ spend DP · ceiling {attrCeiling(p, meta.ratingCap ?? 90)}</span>
        </div>
        <div className="grid sm:grid-cols-3 gap-x-6 gap-y-4">
          {(['technical', 'mental', 'physical'] as const).map((grp) => (
            <AttrGroup key={grp} title={GROUP_LABEL[grp]} group={p.attributes[grp]} deltas={seasonDeltas}
              dp={Math.round(career.developmentPoints ?? 0)} ceiling={attrCeiling(p, meta.ratingCap ?? 90)}
              onInvest={async (k) => flash(await investDP(k))} />
          ))}
          {isGk && <AttrGroup title={GROUP_LABEL.goalkeeping} group={p.attributes.goalkeeping} deltas={seasonDeltas}
            dp={Math.round(career.developmentPoints ?? 0)} ceiling={attrCeiling(p, meta.ratingCap ?? 90)}
            onInvest={async (k) => flash(await investDP(k))} />}
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

function AttrGroup({ title, group, deltas, dp, ceiling, onInvest }: {
  title: string; group: Record<string, number>; deltas?: Record<string, number>;
  dp: number; ceiling: number; onInvest: (k: AttributeKey) => void;
}) {
  return (
    <div>
      <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-2">{title}</h3>
      <div className="space-y-1">
        {Object.entries(group).map(([k, v]) => {
          const d = deltas?.[k];
          const cost = investCost(v);
          const maxed = v >= ceiling;
          const canBuy = !maxed && dp >= cost;
          return (
            <div key={k} className="flex items-center justify-between text-sm">
              <span className="text-slate-400 capitalize">{attrLabel(k)}</span>
              <span className="flex items-center gap-1.5">
                {d != null && d !== 0 && (
                  <span className={`text-[10px] font-mono font-semibold ${d > 0 ? 'text-emerald-400' : 'text-rose-400'}`} title="Change last season">{d > 0 ? '+' : ''}{d}</span>
                )}
                <span className={`font-mono ${ratingColor(v)}`}>{Math.round(v)}</span>
                <button
                  onClick={() => onInvest(k as AttributeKey)}
                  disabled={!canBuy}
                  title={maxed ? 'At its ceiling' : `Spend ${cost} DP to improve`}
                  className={`w-6 h-5 rounded text-[10px] font-bold leading-none ${canBuy ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30' : 'bg-surface-700 text-slate-600 cursor-not-allowed'}`}
                >{maxed ? '—' : '▲'}</button>
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
