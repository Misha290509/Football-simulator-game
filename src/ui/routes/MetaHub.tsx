import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../state/store';
import { playerCareerOf } from '../../game/playerCareer';
import {
  CHALLENGE_BY_ID, challengeProgress, PLAYER_ACHIEVEMENTS, evaluateAchievements,
  achievementScore, normaliseDials, difficultyScore, compareEraRival,
} from '../../game/metaGame';

const DIAL_LABEL: Record<string, string> = {
  injuries: 'Injuries', formSwing: 'Form swings', managerPatience: 'Manager patience',
  marketInterest: 'Market interest', growth: 'Growth rate',
};
const TIER_TONE: Record<number, string> = {
  1: 'text-slate-400', 2: 'text-sky-300', 3: 'text-emerald-300', 4: 'text-amber-300', 5: 'text-fuchsia-300',
};

/**
 * The reasons to start a second career: the scenario you're playing, the dials
 * you're playing it on, the long list of things you haven't done yet, and the
 * one player whose career has run alongside yours since the day you started.
 */
export function MetaHub() {
  const navigate = useNavigate();
  const meta = useGameStore((s) => s.meta);
  const players = useGameStore((s) => s.players);
  const season = useGameStore((s) => s.currentSeason());
  const career = playerCareerOf(meta) ?? meta?.playerCareer;
  const p = career ? players[career.playerId] : undefined;
  const year = season?.year ?? meta?.startYear ?? 2025;

  const states = useMemo(
    () => (career ? evaluateAchievements(career, p, year) : []),
    [career, p, year],
  );

  if (!meta || !career) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-slate-400">This save isn’t a player career.</p>
        <button className="btn-primary" onClick={() => navigate('/dashboard')}>Go to dashboard</button>
      </div>
    );
  }

  const dials = normaliseDials(career.dials);
  const hardness = difficultyScore(dials);
  const score = achievementScore(states);
  const earned = new Set(states.filter((s) => s.earned).map((s) => s.id));
  const chal = career.challenge ? CHALLENGE_BY_ID[career.challenge] : null;
  const prog = career.challenge ? challengeProgress(career.challenge, career, p, year) : null;
  const rival = compareEraRival(career, p, career.eraRival ? players[career.eraRival.playerId] : undefined);

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl font-bold">The long game</h1>
        <p className="text-xs text-slate-500">
          {score.earned} of {score.total} achievements · {score.points}/{score.maxPoints} points ·
          {hardness > 15 ? ' played the hard way' : hardness < -15 ? ' played gently' : ' played straight'}
        </p>
      </div>

      {/* The scenario */}
      {chal && prog && (
        <div className={`card p-4 space-y-2 ${prog.done ? 'border-emerald-500/40' : 'border-amber-500/30'}`}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-200">🎯 {chal.label}</h2>
            {prog.done && <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/25">Complete</span>}
          </div>
          <p className="text-xs text-slate-400">{chal.blurb}</p>
          <p className="text-xs text-slate-300"><span className="text-slate-500">Goal:</span> {chal.goal}</p>
          <div className="h-1.5 rounded-full bg-slate-700/60 overflow-hidden">
            <div className={`h-full ${prog.done ? 'bg-emerald-400' : 'bg-amber-400'}`} style={{ width: `${Math.round(prog.progress * 100)}%` }} />
          </div>
          <p className="text-[11px] text-slate-500">{prog.note}</p>
        </div>
      )}

      {/* The dials */}
      <div className="card p-4 space-y-2">
        <h2 className="text-sm font-semibold text-slate-300">🎚️ Realism</h2>
        <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1">
          {(Object.keys(DIAL_LABEL) as (keyof typeof dials)[]).map((k) => {
            const v = dials[k];
            const off = Math.abs(v - 1) > 0.05;
            return (
              <div key={k} className="flex items-center justify-between text-xs">
                <span className="text-slate-400">{DIAL_LABEL[k]}</span>
                <span className={off ? (v > 1 ? 'text-amber-300 tabular-nums' : 'text-sky-300 tabular-nums') : 'text-slate-500 tabular-nums'}>
                  ×{v.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-slate-500">Set at creation. A career built on harsher dials counts for more.</p>
      </div>

      {/* The era rival */}
      {rival && (
        <div className="card p-4 space-y-2">
          <h2 className="text-sm font-semibold text-slate-300">⚖️ You and {rival.name}</h2>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ['Apps', rival.appsEdge], ['Goals', rival.goalsEdge], ['Trophies', rival.trophiesEdge],
            ].map(([label, edge]) => (
              <div key={label as string} className="rounded-lg bg-surface-800/60 p-2">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
                <div className={`text-sm font-semibold tabular-nums ${(edge as number) > 0 ? 'text-emerald-300' : (edge as number) < 0 ? 'text-rose-300' : 'text-slate-400'}`}>
                  {(edge as number) > 0 ? '+' : ''}{edge as number}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400">{rival.verdict}</p>
        </div>
      )}

      {/* Achievements */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-2 flex items-center justify-between border-b border-slate-700/60">
          <h2 className="text-sm font-semibold text-slate-300">🏅 Achievements</h2>
          <span className="text-[11px] text-slate-500">{score.earned}/{score.total}</span>
        </div>
        <ul className="divide-y divide-slate-800/60">
          {PLAYER_ACHIEVEMENTS.map((a) => {
            const got = earned.has(a.id);
            return (
              <li key={a.id} className={`px-4 py-2 flex items-start gap-3 ${got ? '' : 'opacity-50'}`}>
                <span className="text-sm mt-0.5">{got ? '✅' : '⬜'}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm ${got ? 'text-slate-200' : 'text-slate-400'}`}>{a.label}</span>
                    <span className={`text-[10px] ${TIER_TONE[a.tier]}`}>{'★'.repeat(a.tier)}</span>
                  </div>
                  <p className="text-[11px] text-slate-500">{a.blurb}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <button className="btn-ghost w-full" onClick={() => navigate('/my-player')}>Back to My Player</button>
    </div>
  );
}
