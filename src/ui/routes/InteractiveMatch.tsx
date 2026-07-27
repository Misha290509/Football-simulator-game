import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../state/store';
import type { GamePlan, KeyMoment, InteractiveMatchRecord, PositioningIntent } from '../../types/interactiveMatch';
import { FLOW_HOT, FLOW_COLD, type InteractiveInput } from '../../engine/interactiveMatch';
import { ROLE_POSITIONING } from '../../game/momentLibrary';
import { isExplosiveChoice, fatigueLevel, FATIGUE_GATE, fuzzyDescriptor } from '../../game/matchConditions';
import { captainTeamTalkOptions } from '../../game/squadLife';
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
  const setPositioning = useGameStore((s) => s.setInteractivePositioning);
  const setSecondHalf = useGameStore((s) => s.setSecondHalfPositioning);
  const kickOff = useGameStore((s) => s.kickOffInteractive);
  const decide = useGameStore((s) => s.decideMoment);
  const autoMoment = useGameStore((s) => s.autoResolveMoment);
  const autoRest = useGameStore((s) => s.autoResolveRest);
  const ackHalfTime = useGameStore((s) => s.acknowledgeHalfTime);
  const finish = useGameStore((s) => s.finishPlayerMatch);
  const cancel = useGameStore((s) => s.cancelInteractive);
  const captainTalk = useGameStore((s) => s.deliverCaptainTalk);
  const [talkToast, setTalkToast] = useState<string | null>(null);
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
          <h1 className="page-title">{ip.input.cameo ? 'Get ready to come on' : 'Team talk'}</h1>
          {ip.input.occasion?.kind === 'DERBY' ? (
            <div className="text-xs px-2.5 py-1.5 rounded border border-rose-500/40 bg-rose-500/10 text-rose-200">⚔️ {ip.input.occasion.label} — the one the fans circle on the calendar. Bragging rights, raw nerves, no hiding place.</div>
          ) : ip.input.occasion?.kind === 'FORMER_CLUB' ? (
            <div className="text-xs px-2.5 py-1.5 rounded border border-sky-500/40 bg-sky-500/10 text-sky-200">🔙 {ip.input.occasion.label} — old faces, familiar stands. Prove they were wrong to let you go, or show them what they made you.</div>
          ) : ip.input.importance >= 0.6 && (
            <div className="text-xs px-2.5 py-1.5 rounded border border-amber-500/30 bg-amber-500/5 text-amber-200">🔥 Big occasion — the pressure’s on. Nerves will bite unless you rise to it.</div>
          )}
          {ip.input.cameo && (
            <div className="text-xs px-2.5 py-1.5 rounded border border-sky-500/30 bg-sky-500/5 text-sky-200">You’re on the bench — this is a late cameo to make an impact. Fewer chances, so make them count.</div>
          )}
          {ip.input.conditions && (
            <div className="text-xs px-2.5 py-1.5 rounded border border-surface-600 bg-surface-700/40 text-slate-300">
              🌦️ {ip.input.conditions.label} · {ip.input.conditions.attendance.toLocaleString()} in
              {ip.input.conditions.hostility > 0.4 ? <span className="text-rose-300"> · a hostile away end</span> : null}
            </div>
          )}
          {ip.input.oppPlan && ip.input.oppPlan.attention >= 0.45 && (
            <div className="text-xs px-2.5 py-1.5 rounded border border-rose-500/30 bg-rose-500/5 text-rose-200">
              🎯 They've set up to stop you — {ip.input.oppPlan.label}
              {ip.input.oppPlan.markerName ? <span className="text-rose-300"> ({ip.input.oppPlan.markerName} is glued to you)</span> : null}.
              This is what being feared looks like.
            </div>
          )}
          {(ip.input.scout ?? []).length > 0 && (
            <div className="rounded border border-sky-500/30 bg-sky-500/5 p-2.5">
              <div className="text-[11px] uppercase tracking-wide text-sky-300 mb-1.5">📋 Scouting report</div>
              <ul className="space-y-1">
                {(ip.input.scout ?? []).map((n) => (
                  <li key={n.tag} className="text-xs text-slate-300">• {n.text} <span className="text-sky-300/80">{n.hint}</span></li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-sm text-slate-400">The manager sets your instruction — and you choose how you move off the ball. Both shape your game.</p>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">On the ball — game plan</div>
          <div className="grid sm:grid-cols-2 gap-2">
            {(Object.keys(PLAN_INFO) as GamePlan[]).map((p) => (
              <button key={p} onClick={() => setPlan(p)} className={`text-left p-3 rounded-lg border ${ip.input.gamePlan === p ? 'border-accent bg-accent/10' : 'border-surface-600 hover:bg-surface-700'}`}>
                <div className="font-medium text-white">{PLAN_INFO[p].label}</div>
                <div className="text-xs text-slate-400">{PLAN_INFO[p].blurb}</div>
              </button>
            ))}
          </div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500 pt-1">Off the ball — your movement</div>
          <div className="grid sm:grid-cols-3 gap-2">
            {(ROLE_POSITIONING[ip.input.role] ?? []).map((o) => (
              <button key={o.id} onClick={() => setPositioning(o.id)} className={`text-left p-3 rounded-lg border ${ip.input.intent === o.id ? 'border-accent bg-accent/10' : 'border-surface-600 hover:bg-surface-700'}`}>
                <div className="font-medium text-white text-sm">{o.label}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{o.blurb}</div>
              </button>
            ))}
          </div>
          {ip.input.status === 'CAPTAIN' && (
            <div className="rounded border border-amber-500/30 bg-amber-500/5 p-2.5">
              <div className="text-[11px] uppercase tracking-wide text-amber-300 mb-1.5">🎖️ You wear the armband — a word before they go out?</div>
              <div className="flex flex-col gap-1.5">
                {captainTeamTalkOptions(false).map((o) => (
                  <button key={o.id} className="btn-ghost text-left text-xs" onClick={async () => setTalkToast(await captainTalk(o.id))}>
                    “{o.text}” <span className="text-slate-500">— {o.blurb}</span>
                  </button>
                ))}
              </div>
              {talkToast && <div className="text-[11px] text-amber-200 mt-1.5">{talkToast}</div>}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button className="btn-primary flex-1" onClick={() => kickOff()}>Kick off ▸</button>
            <button className="btn-ghost" onClick={() => { autoRest(); }}>Sim it</button>
          </div>
        </div>
      )}

      {ip.phase === 'HALFTIME' && (
        <div className="card p-4 space-y-3">
          <h1 className="page-title">Half-time</h1>
          <p className="text-sm text-slate-300">“{score} at the break. Keep doing what the plan asks — stay switched on for the second half.”</p>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Change your movement for the second half?</div>
            <div className="grid sm:grid-cols-3 gap-2">
              {(ROLE_POSITIONING[ip.input.role] ?? []).map((o) => {
                const active = (ip.input.intent2 ?? ip.input.intent) === o.id;
                return (
                  <button key={o.id} onClick={() => setSecondHalf(o.id)} className={`text-left p-2.5 rounded-lg border ${active ? 'border-accent bg-accent/10' : 'border-surface-600 hover:bg-surface-700'}`}>
                    <div className="font-medium text-white text-xs">{o.label}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{o.blurb}</div>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={() => ackHalfTime(true)}>“I’m up for this” (confidence +)</button>
            <button className="btn-ghost" onClick={() => ackHalfTime(false)}>Nod along</button>
          </div>
        </div>
      )}

      {ip.phase === 'PLAYING' && ip.pending && (
        <>
          <MatchFeel flow={ip.flow ?? 50} marker={ip.input.marker} duel={ip.duel} />
          <MomentCard
            key={ip.pending.id}
            moment={ip.pending}
            gamePlanLabel={PLAN_INFO[ip.input.gamePlan].label}
            flow={ip.flow ?? 50}
            fatigue={fatigueLevel(ip.input.fitness, ip.pending.minute, ip.input.conditions)}
            scout={ip.input.scout}
            timed={!!settings?.timed}
            seconds={settings?.timerSeconds ?? 15}
            onDecide={(cid) => decide(cid)}
            onAutoMoment={() => autoMoment()}
            onAutoRest={() => autoRest()}
          />
        </>
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

function MatchFeel({ flow, marker, duel }: { flow: number; marker?: { name: string; rating: number }; duel?: { won: number; lost: number } }) {
  const hot = flow >= FLOW_HOT, cold = flow <= FLOW_COLD;
  const label = hot ? '🔥 In the zone' : cold ? '😬 Rattled' : 'Settled';
  const tone = hot ? 'bg-orange-500' : cold ? 'bg-sky-500' : 'bg-emerald-500';
  return (
    <div className="card p-3 space-y-2">
      <div className="flex items-center justify-between text-[11px]">
        <span className="uppercase tracking-wide text-slate-500">Flow</span>
        <span className={hot ? 'text-orange-300' : cold ? 'text-sky-300' : 'text-slate-400'}>{label}</span>
      </div>
      <div className="h-2 rounded bg-surface-700 overflow-hidden">
        <div className={`h-full ${tone} transition-all`} style={{ width: `${Math.max(3, Math.min(100, flow))}%` }} />
      </div>
      {marker && (
        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
          <span>⚔️ Duel vs <span className="text-slate-200">{marker.name}</span> <span className="text-slate-600">({marker.rating})</span></span>
          {duel && (duel.won + duel.lost > 0) && <span className="font-mono">{duel.won}–{duel.lost}</span>}
        </div>
      )}
    </div>
  );
}

function MomentCard({ moment, gamePlanLabel, flow, fatigue, scout, timed, seconds, onDecide, onAutoMoment, onAutoRest }: {
  moment: KeyMoment;
  gamePlanLabel: string; flow: number; fatigue: number;
  scout?: { tag: string; hint: string }[];
  timed: boolean; seconds: number;
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
        <span className="text-[11px] uppercase tracking-wide text-slate-500">
          Plan: {gamePlanLabel}
          {fatigue >= FATIGUE_GATE && <span className="text-rose-400 ml-2">🫁 tiring</span>}
          {(m.clarity ?? 1) < 0.6 && <span className="text-slate-500 ml-2" title="Under this much pressure you can't read it clearly.">🌫️ instinct</span>}
        </span>
        {timed && <span className={`text-sm font-mono ${left <= 3 ? 'text-rose-400' : 'text-slate-400'}`}>{left}s</span>}
      </div>
      <p className="text-base text-white font-medium">{m.prompt}</p>
      {(scout ?? []).length > 0 && (
        <div className="text-[11px] text-sky-300/80">📋 {(scout ?? []).map((n) => n.hint).join(' · ')}</div>
      )}
      <div className="space-y-2">
        {m.choices.map((c, i) => {
          const locked = c.signature && flow < FLOW_HOT;
          const gassed = fatigue >= FATIGUE_GATE && isExplosiveChoice(m.type, c);
          const foggy = (m.clarity ?? 1) < 0.6;
          if (locked) {
            return (
              <div key={c.id} className="w-full text-left p-3 rounded-lg border border-dashed border-surface-600 opacity-50 flex items-center justify-between cursor-not-allowed" title="Get in the zone (high flow) to unlock your signature move">
                <span className="text-sm text-slate-400">{c.label}</span>
                <span className="text-[10px] uppercase tracking-wide text-orange-400/70">🔒 in the zone</span>
              </div>
            );
          }
          return (
            <button key={c.id} onClick={() => onDecide(c.id)} title={gassed ? 'Your legs have gone — this is a big ask now.' : undefined} className={`w-full text-left p-3 rounded-lg border flex items-center justify-between ${gassed ? 'border-rose-500/30 bg-rose-500/5' : c.signature ? 'border-orange-500/50 bg-orange-500/5 hover:bg-orange-500/10' : 'border-surface-600 hover:border-accent hover:bg-accent/5'}`}>
              <span className="text-sm text-slate-100"><span className="text-slate-600 mr-2">{i + 1}</span>{c.label}{m.gamePlanAligned.includes(c.id) && <span className="text-[10px] text-accent-400 ml-2">✓ plan</span>}</span>
              <span className={`text-[10px] uppercase tracking-wide ${c.signature ? 'text-orange-300' : foggy ? 'text-slate-500 italic' : RISK_TONE[c.risk]}`}>
                {gassed ? '🫁 legs gone · ' : ''}{c.signature ? 'signature' : foggy ? fuzzyDescriptor(c.id, m.id) : c.risk.toLowerCase()}
              </span>
            </button>
          );
        })}
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
  const rating = av?.rating ?? 6.5;
  const attempts = record.decisionLog.length;
  const successes = record.decisionLog.filter((d) => d.success).length;
  const onPlan = record.decisionLog.filter((d) => d.followedGamePlan).length;
  const t = record.tally;
  // Player of the match: a strong rating with real end-product.
  const potm = rating >= 7.8 && (av?.goals || av?.assists || t.decisive > 0 || t.penSaved > 0);

  return (
    <div className="card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Full time</h1>
        {potm && <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">★ Player of the Match</span>}
      </div>

      {/* Headline rating ring + line */}
      <div className="flex items-center gap-4">
        <RatingRing value={rating} />
        <div className="flex-1">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span className="text-slate-300">⚽ {av?.goals ?? 0} <span className="text-slate-500">goals</span></span>
            <span className="text-slate-300">🅰 {av?.assists ?? 0} <span className="text-slate-500">assists</span></span>
            <span className="text-slate-300">{av?.shots ?? 0} <span className="text-slate-500">shots</span></span>
            {av?.saves != null && <span className="text-slate-300">🧤 {av.saves} <span className="text-slate-500">saves</span></span>}
          </div>
          {record.standout && <div className="text-sm text-amber-300 mt-1.5">⭐ {record.standout}</div>}
        </div>
      </div>

      {/* Contribution breakdown */}
      <div>
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="uppercase tracking-wide text-slate-500">Moments won</span>
          <span className="font-mono text-slate-400">{successes}/{attempts}</span>
        </div>
        <div className="h-2 rounded bg-surface-700 overflow-hidden flex">
          <div className="h-full bg-emerald-500" style={{ width: `${attempts ? (successes / attempts) * 100 : 0}%` }} />
          <div className="h-full bg-rose-500/60" style={{ width: `${attempts ? ((attempts - successes) / attempts) * 100 : 0}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
        <Cell label="Big moments" value={`${t.bigWon}–${t.bigLost}`} />
        <Cell label="Decisive" value={`${t.decisive}`} />
        <Cell label="On-plan" value={`${attempts ? Math.round((onPlan / attempts) * 100) : 0}%`} />
        <Cell label="Off the ball" value={input.intent2 && input.intent2 !== input.intent
          ? `${INTENT_LABEL[input.intent ?? 'IN_BEHIND']} → ${INTENT_LABEL[input.intent2]}`
          : INTENT_LABEL[input.intent ?? 'IN_BEHIND']} />
      </div>
      {(t.penScored + t.penMissed + t.penSaved) > 0 && (
        <div className="text-xs text-slate-400">Penalties — scored {t.penScored}, missed {t.penMissed}, saved {t.penSaved}.</div>
      )}
      {record.duel && (record.duel.won + record.duel.lost) > 0 && (
        <div className={`text-xs px-2.5 py-1.5 rounded border ${record.duel.won > record.duel.lost ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300' : record.duel.won < record.duel.lost ? 'border-rose-500/30 bg-rose-500/5 text-rose-300' : 'border-surface-600 text-slate-400'}`}>
          ⚔️ Personal duel vs {record.duel.markerName}: <span className="font-mono">{record.duel.won}–{record.duel.lost}</span>
          {record.duel.won > record.duel.lost ? ' — you came out on top.' : record.duel.won < record.duel.lost ? ' — he shaded it.' : ' — honours even.'}
        </div>
      )}

      <div>
        <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Your moments</div>
        <ul className="space-y-1 max-h-40 overflow-y-auto text-sm">
          {record.decisionLog.map((d, i) => (
            <li key={i} className={d.success ? 'text-slate-300' : 'text-slate-500'}>
              <span className="text-slate-600 mr-2">{i + 1}.</span>{d.success ? '✓ ' : '· '}{d.effect}{d.followedGamePlan ? '' : ' (off-plan)'}
            </li>
          ))}
        </ul>
      </div>
      <button className="btn-primary w-full" onClick={onContinue}>Continue ▸</button>
    </div>
  );
}

const INTENT_LABEL: Record<PositioningIntent, string> = {
  IN_BEHIND: 'In behind', SHOW_FOR_IT: 'Came short', STAY_WIDE: 'Wide', BETWEEN_LINES: 'The pocket', PRESS: 'Pressing', HOLD_SHAPE: 'Held shape',
};

function RatingRing({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, (value - 4) / 6)); // 4.0–10 → 0–1
  const tone = value >= 7.5 ? '#34d399' : value < 6 ? '#fb7185' : '#e2e8f0';
  const r = 26, C = 2 * Math.PI * r;
  return (
    <div className="relative w-[68px] h-[68px] shrink-0">
      <svg viewBox="0 0 68 68" className="w-full h-full -rotate-90">
        <circle cx="34" cy="34" r={r} fill="none" stroke="currentColor" className="text-surface-700" strokeWidth="6" />
        <circle cx="34" cy="34" r={r} fill="none" stroke={tone} strokeWidth="6" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xl font-bold tabular-nums" style={{ color: tone }}>{value.toFixed(1)}</span>
      </div>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return <div className="card p-2"><div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div><div className="text-base font-semibold text-white">{value}</div></div>;
}
