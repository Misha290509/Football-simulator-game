import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../state/store';
import { playerCareerOf } from '../../game/playerCareer';
import { computeLegacy, careerTotals, VETERAN_TRAITS } from '../../game/playerLegacy';
import { retirementAvailable } from '../../game/playerEndgame';
import { IDENTITY_LABEL, IDENTITY_BLURB } from '../../types/playerLegacy';
import { fullName, ageOf } from '../format';
import type { Position } from '../../types/attributes';

const RETRAIN_POS: Position[] = ['GK', 'LB', 'LCB', 'RCB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST'];
const ROLE_LABEL: Record<string, string> = { PRIME: 'In his prime', EXPERIENCED_KEY: 'Experienced key player', IMPACT_SUB: 'Impact substitute', SQUAD_ELDER: 'Squad elder' };

export function Legacy() {
  const navigate = useNavigate();
  const meta = useGameStore((s) => s.meta);
  const players = useGameStore((s) => s.players);
  const clubs = useGameStore((s) => s.clubs);
  const season = useGameStore((s) => s.currentSeason());
  const setDreamClub = useGameStore((s) => s.setDreamClub);
  const retrainAvatarPosition = useGameStore((s) => s.retrainAvatarPosition);
  const announceRetirement = useGameStore((s) => s.announceRetirement);
  const announceInternationalRetirement = useGameStore((s) => s.announceInternationalRetirement);
  const becomeMentor = useGameStore((s) => s.becomeMentor);
  const career = playerCareerOf(meta);
  const p = career ? players[career.playerId] : undefined;
  const year = season?.year ?? meta?.startYear ?? new Date().getFullYear();
  const [toast, setToast] = useState<string | null>(null);

  const legacy = useMemo(() => (career && p && meta) ? computeLegacy(career, p, clubs, players, year) : null, [career, p, meta, clubs, players, year]);
  const totals = useMemo(() => (career && p) ? careerTotals(career, p, p.born.year) : null, [career, p]);

  if (!meta || !career || !p) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-slate-400">This save isn’t a player career.</p>
        <button className="btn-primary" onClick={() => navigate('/dashboard')}>Go to dashboard</button>
      </div>
    );
  }

  const age = ageOf(p, year);
  const retired = career.retirement?.retiredDay != null;
  const canRetire = retirementAvailable(career, p, year);
  const veteranTraits = career.veteranTraits ?? [];
  const youngTeammates = Object.values(players).filter((t) => t.contract.clubId === p.contract.clubId && t.id !== p.id && ageOf(t, year) <= 21 && t.potential >= 74).slice(0, 6);
  const mentored = new Set((career.mentorships ?? []).map((m) => m.menteeId));
  const bigLeagueClubs = Object.values(clubs).filter((c) => c.reputation >= 78).sort((a, b) => b.reputation - a.reputation).slice(0, 40);

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Ambitions &amp; Legacy</h1>
        <button className="btn-ghost text-sm" onClick={() => navigate('/retrospective')}>Career retrospective →</button>
      </div>
      {toast && <div className="card p-3 border border-accent/30 bg-accent/5 text-sm text-accent-200">{toast}</div>}

      {/* Legacy headline */}
      {legacy && (
        <div className="card p-5">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Legacy score</div>
              <div className="text-4xl font-bold text-white tabular-nums">{legacy.score}</div>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wide text-slate-500">Ranked in this world</div>
              <div className="text-2xl font-semibold text-accent-300">#{legacy.peerRank}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {legacy.identities.map((id) => (
              <span key={id} className="bg-accent/10 text-accent-200 rounded-full px-3 py-1 text-xs" title={IDENTITY_BLURB[id]}>{IDENTITY_LABEL[id]}</span>
            ))}
          </div>
          {/* Transparent breakdown */}
          <div className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-1">
            {Object.entries(legacy.breakdown).filter(([, v]) => v !== 0).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between text-sm">
                <span className="text-slate-400">{k}</span><span className="font-mono text-slate-300">{v > 0 ? '+' : ''}{v}</span>
              </div>
            ))}
          </div>
          {legacy.legendAtClubs.length > 0 && (
            <div className="mt-3 pt-3 border-t border-surface-700 text-sm text-slate-300">
              <span className="text-slate-500">Club legend at:</span> {legacy.legendAtClubs.map((id) => clubs[id]?.shortName ?? id).join(', ')}
            </div>
          )}
        </div>
      )}

      {/* Ambitions checklist */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-slate-400 mb-2">Ambitions</h2>
        <ul className="space-y-2">
          {(career.ambitions ?? []).map((a) => (
            <li key={a.id}>
              <div className="flex items-center justify-between text-sm">
                <span className={a.achieved ? 'text-emerald-400' : 'text-slate-300'}>{a.achieved ? '✓ ' : '○ '}{a.text}</span>
                {a.target != null && !a.achieved && <span className="text-xs text-slate-500 font-mono">{Math.round(a.progress ?? 0)}/{a.target}</span>}
              </div>
              {a.target != null && !a.achieved && (
                <div className="mt-1 h-1.5 rounded bg-surface-700 overflow-hidden"><div className="h-full bg-accent-500/70" style={{ width: `${Math.min(100, Math.round(((a.progress ?? 0) / a.target) * 100))}%` }} /></div>
              )}
            </li>
          ))}
        </ul>
        {/* Dream club */}
        <div className="mt-4 pt-3 border-t border-surface-700 flex items-center gap-3">
          <span className="text-sm text-slate-400">Dream club</span>
          <select className="input-field text-sm flex-1" value={career.dreamClubId ?? ''} onChange={(e) => void setDreamClub(e.target.value || null)}>
            <option value="">— none nominated —</option>
            {bigLeagueClubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {/* Decline & adaptation */}
      {!retired && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-2">Decline &amp; adaptation</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <Stat label="Age" value={`${age}`} />
            <Stat label="Overall" value={`${p.overall}`} />
            <Stat label="Peak" value={`${totals?.peakOvr ?? p.overall}`} />
            <Stat label="Role" value={ROLE_LABEL[career.roleEvolution ?? 'PRIME'] ?? 'Prime'} />
          </div>
          {career.decline?.started
            ? <p className="text-xs text-slate-500 mb-3">The physical peak has passed — but experience, positioning and leadership are ways to stay valuable. Consider a new position for a genuine second act.</p>
            : <p className="text-xs text-slate-500 mb-3">Still in your prime. Adaptation options open up as you get older.</p>}

          {/* Veteran traits */}
          {veteranTraits.length > 0 && (
            <div className="mb-3">
              <div className="text-xs text-slate-500 mb-1">Veteran traits</div>
              <div className="flex flex-wrap gap-2">
                {veteranTraits.map((v) => <span key={v} className="bg-amber-500/10 text-amber-300 rounded px-2 py-1 text-xs" title={VETERAN_TRAITS[v]?.blurb}>{VETERAN_TRAITS[v]?.label ?? v}</span>)}
              </div>
            </div>
          )}

          {/* Position retraining */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-400">Retrain position</span>
            <select className="input-field text-sm flex-1" value={p.training?.retrainPosition ?? ''} onChange={(e) => void retrainAvatarPosition((e.target.value || null) as Position | null)}>
              <option value="">— stay at {p.position} —</option>
              {RETRAIN_POS.filter((pos) => pos !== p.position && !p.positions.includes(pos)).map((pos) => <option key={pos} value={pos}>{pos}</option>)}
            </select>
            {p.training?.retrainPosition && <span className="text-xs text-slate-500 tabular-nums">{Math.round(p.training.retrainProgress ?? 0)}%</span>}
          </div>
        </div>
      )}

      {/* Mentorship */}
      {!retired && age >= 30 && youngTeammates.length > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-2">Mentor a young player</h2>
          <p className="text-xs text-slate-500 mb-3">Pass on the lessons of a long career — accelerate a prospect’s development and build your standing at the club.</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {youngTeammates.map((t) => (
              <div key={t.id} className="rounded-lg bg-surface-800/60 p-2.5 flex items-center justify-between">
                <div className="min-w-0"><div className="text-sm text-white truncate">{fullName(t)}</div><div className="text-[11px] text-slate-500">{t.position} · {ageOf(t, year)} · POT {t.potential}</div></div>
                {mentored.has(t.id)
                  ? <span className="text-xs text-emerald-400">Mentoring</span>
                  : <button className="btn-ghost text-xs" onClick={async () => setToast(await becomeMentor(t.id))}>Mentor</button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Retirement */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-slate-400 mb-2">Retirement</h2>
        {retired ? (
          <div className="text-sm text-slate-300">You have retired from professional football. <button className="text-accent-300 underline" onClick={() => navigate('/retrospective')}>View your career retrospective →</button></div>
        ) : career.retirement?.announced ? (
          <div className="text-sm">
            <p className="text-amber-300">{career.retirement.forced ? 'A forced end approaches.' : `This is your farewell season (${career.retirement.finalSeason}).`} You’ll hang up your boots at season’s end — tributes await.</p>
            {career.retirement.forced && <button className="btn-primary text-xs mt-2" onClick={() => void announceRetirement(false)}>Retire now</button>}
          </div>
        ) : canRetire ? (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">Retirement is your choice. Announce a farewell season for a proper send-off, or hang them up now.</p>
            <div className="flex gap-2">
              <button className="btn-ghost text-sm" onClick={() => void announceRetirement(true)}>Announce farewell season</button>
              <button className="btn-ghost text-sm text-rose-300" onClick={() => void announceRetirement(false)}>Retire now</button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500">You’re still going strong. Retirement becomes available as your career winds down.</p>
        )}
        {/* International retirement */}
        {career.international.capped && !career.retirement?.internationalRetiredDay && !retired && (
          <div className="mt-3 pt-3 border-t border-surface-700">
            <button className="btn-ghost text-xs" onClick={() => void announceInternationalRetirement()}>Retire from international football ({career.international.caps} caps)</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-3 text-center">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-lg font-semibold mt-0.5 text-white">{value}</div>
    </div>
  );
}
