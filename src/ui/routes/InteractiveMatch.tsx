import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../state/store';
import type { GamePlan, KeyMoment, InteractiveMatchRecord } from '../../types/interactiveMatch';
import type { InteractiveInput } from '../../engine/interactiveMatch';
import type { Match } from '../../types/match';

const PLAN_INFO: Record<GamePlan, { label: string; blurb: string }> = {
  ATTACK: { label: 'Get forward', blurb: 'Take risks, back yourself in the final third.' },
  SUPPORT: { label: 'Support play', blurb: 'Link up, create for others, pick your moments.' },
  BALANCED: { label: 'Balanced', blurb: 'Play the situation — no unnecessary risks.' },
  CONTAIN: { label: 'Stay disciplined', blurb: 'Keep your shape, play safe, protect the result.' },
  POSSESSION: { label: 'Keep the ball', blurb: 'Retain possession, patient build-up.' },
};
const RISK_TONE: Record<string, string> = { SAFE: 'text-emerald-400', BALANCED: 'text-amber-400', AMBITIOUS: 'text-rose-400' };

export function InteractiveMatch() {
  const navigate = useNavigate();
  const ip = useGameStore((s) => s.interactivePlay);
  const meta = useGameStore((s) => s.meta);
  const setPlan = useGameStore((s) => s.setInteractiveGamePlan);
  const kickOff = useGameStore((s) => s.kickOffInteractive);
  const decide = useGameStore((s) => s.decideMoment);
  const autoMoment = useGameStore((s) => s.autoResolveMoment);
  const autoRest = useGameStore((s) => s.autoResolveRest);
  const ackHalfTime = useGameStore((s) => s.acknowledgeHalfTime);
  const finish = useGameStore((s) => s.finishPlayerMatch);
  const cancel = useGameStore((s) => s.cancelInteractive);
  const settings = meta?.careerSettings;

  useEffect(() => { if (!ip) navigate('/my-player', { replace: true }); }, [ip, navigate]);
  if (!ip) return null;

  const [tg, og] = ip.pending?.context.score ?? [ip.done?.match ? (ip.input.isAvatarHome ? ip.done.match.homeGoals : ip.done.match.awayGoals) : 0, 0];
  const score = ip.done ? `${ip.input.isAvatarHome ? ip.done.match.homeGoals : ip.done.match.awayGoals}–${ip.input.isAvatarHome ? ip.done.match.awayGoals : ip.done.match.homeGoals}` : `${tg}–${og}`;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="card p-3 flex items-center justify-between">
        <div className="text-sm text-slate-400">vs <span className="text-white font-semibold">{ip.input.oppName}</span></div>
        <div className="font-mono text-lg text-white">{score}</div>
        <div className="text-xs text-slate-500">{PLAN_INFO[ip.input.gamePlan].label}</div>
      </div>

      {/* Ticker */}
      {ip.ticker.length > 0 && ip.phase !== 'PREMATCH' && (
        <div className="card p-3 max-h-32 overflow-y-auto text-sm space-y-0.5">
          {ip.ticker.slice(-8).map((t, i) => (
            <div key={i} className={t.kind === 'GOAL' ? 'text-emerald-400' : 'text-slate-400'}><span className="font-mono text-slate-600 mr-2">{t.minute}'</span>{t.text}</div>
          ))}
        </div>
      )}

      {ip.phase === 'PREMATCH' && (
        <div className="card p-4 space-y-3">
          <h1 className="page-title">Team talk</h1>
          <p className="text-sm text-slate-400">The manager sets your instruction for the match. You can follow it — or back your instincts.</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {(Object.keys(PLAN_INFO) as GamePlan[]).map((p) => (
              <button key={p} onClick={() => setPlan(p)} className={`text-left p-3 rounded-lg border ${ip.input.gamePlan === p ? 'border-accent bg-accent/10' : 'border-surface-600 hover:bg-surface-700'}`}>
                <div className="font-medium text-white">{PLAN_INFO[p].label}</div>
                <div className="text-xs text-slate-400">{PLAN_INFO[p].blurb}</div>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={() => kickOff()}>Kick off ▸</button>
            <button className="btn-ghost" onClick={() => { autoRest(); }}>Sim it</button>
          </div>
        </div>
      )}

      {ip.phase === 'HALFTIME' && (
        <div className="card p-4 space-y-3">
          <h1 className="page-title">Half-time</h1>
          <p className="text-sm text-slate-300">“{score} at the break. Keep doing what the plan asks — stay switched on for the second half.”</p>
          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={() => ackHalfTime(true)}>“I’m up for this” (confidence +)</button>
            <button className="btn-ghost" onClick={() => ackHalfTime(false)}>Nod along</button>
          </div>
        </div>
      )}

      {ip.phase === 'PLAYING' && ip.pending && (
        <MomentCard
          key={ip.pending.id}
          moment={ip.pending}
          gamePlanLabel={PLAN_INFO[ip.input.gamePlan].label}
          timed={!!settings?.timed}
          seconds={settings?.timerSeconds ?? 15}
          onDecide={(cid) => decide(cid)}
          onAutoMoment={() => autoMoment()}
          onAutoRest={() => autoRest()}
        />
      )}

      {ip.phase === 'DONE' && ip.done && (
        <MatchDone
          input={ip.input} record={ip.done.record} match={ip.done.match}
          onContinue={async () => { await finish(); navigate('/my-player', { replace: true }); }}
        />
      )}

      {ip.phase !== 'DONE' && (
        <button className="btn-ghost text-xs text-slate-500" onClick={() => { cancel(); navigate('/my-player', { replace: true }); }}>Leave (abandon interactive match)</button>
      )}
    </div>
  );
}

function MomentCard({ moment, gamePlanLabel, timed, seconds, onDecide, onAutoMoment, onAutoRest }: {
  moment: KeyMoment;
  gamePlanLabel: string; timed: boolean; seconds: number;
  onDecide: (cid: string) => void; onAutoMoment: () => void; onAutoRest: () => void;
}) {
  const m = moment;
  const [left, setLeft] = useState(seconds);
  const firedRef = useRef(false);
  useEffect(() => {
    firedRef.current = false;
    if (!timed) return;
    setLeft(seconds);
    const iv = setInterval(() => setLeft((l) => (l <= 1 ? 0 : l - 1)), 1000);
    return () => clearInterval(iv);
  }, [m.id, timed, seconds]);
  useEffect(() => {
    if (timed && left === 0 && !firedRef.current) { firedRef.current = true; onAutoMoment(); }
  }, [left, timed, onAutoMoment]);

  return (
    <div className="card p-4 space-y-3 border border-accent/30">
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm text-accent-400">{m.minute}'</span>
        <span className="text-[11px] uppercase tracking-wide text-slate-500">Plan: {gamePlanLabel}</span>
        {timed && <span className={`text-sm font-mono ${left <= 3 ? 'text-rose-400' : 'text-slate-400'}`}>{left}s</span>}
      </div>
      <p className="text-base text-white font-medium">{m.prompt}</p>
      <div className="space-y-2">
        {m.choices.map((c, i) => (
          <button key={c.id} onClick={() => onDecide(c.id)} className="w-full text-left p-3 rounded-lg border border-surface-600 hover:border-accent hover:bg-accent/5 flex items-center justify-between">
            <span className="text-sm text-slate-100"><span className="text-slate-600 mr-2">{i + 1}</span>{c.label}{m.gamePlanAligned.includes(c.id) && <span className="text-[10px] text-accent-400 ml-2">✓ plan</span>}</span>
            <span className={`text-[10px] uppercase tracking-wide ${RISK_TONE[c.risk]}`}>{c.risk.toLowerCase()}</span>
          </button>
        ))}
      </div>
      <div className="flex gap-2 pt-1">
        <button className="btn-ghost text-xs" onClick={onAutoMoment}>Skip moment</button>
        <button className="btn-ghost text-xs" onClick={onAutoRest}>Sim to end</button>
      </div>
    </div>
  );
}

function MatchDone({ input, record, match, onContinue }: {
  input: InteractiveInput; record: InteractiveMatchRecord; match: Match; onContinue: () => void;
}) {
  const av = match.playerStats.find((s) => s.playerId === input.avatar.id);
  return (
    <div className="card p-4 space-y-3">
      <h1 className="page-title">Full time</h1>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
        <Cell label="Rating" value={av ? av.rating.toFixed(1) : '—'} />
        <Cell label="Goals" value={`${av?.goals ?? 0}`} />
        <Cell label="Assists" value={`${av?.assists ?? 0}`} />
        <Cell label="Plan adherence" value={`${Math.round(record.gamePlanAdherence * 100)}%`} />
      </div>
      {record.standout && <div className="text-sm text-amber-300">⭐ {record.standout}</div>}
      <div>
        <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Your moments</div>
        <ul className="space-y-1 max-h-40 overflow-y-auto text-sm">
          {record.decisionLog.map((d, i) => (
            <li key={i} className="text-slate-400"><span className="text-slate-600 mr-2">{i + 1}.</span>{d.effect}{d.followedGamePlan ? '' : ' (off-plan)'}</li>
          ))}
        </ul>
      </div>
      <button className="btn-primary w-full" onClick={onContinue}>Continue ▸</button>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return <div className="card p-2"><div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div><div className="text-lg font-semibold text-white">{value}</div></div>;
}
