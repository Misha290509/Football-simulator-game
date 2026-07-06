import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../state/store';
import { CrestBadge } from '../components/Rating';
import { PitchView } from '../components/PitchView';
import { fullName } from '../format';
import { FORMATIONS } from '../../engine/lineup';
import { TALK_TONES, TONE_LABEL } from '../../engine/morale';
import { areRivals } from '../../game/rivalries';
import type { MatchEvent } from '../../types/match';
import type { Side } from '../../engine/liveMatch';

const DEF_TACTICS = ['DEEP', 'BALANCED', 'PRESSING'] as const;
const OFF_TACTICS = ['POSSESSION', 'COUNTER', 'DIRECT'] as const;
const SPEEDS = [{ label: '1×', ms: 750 }, { label: '2×', ms: 380 }, { label: '4×', ms: 160 }];

export function LiveMatch() {
  const navigate = useNavigate();
  const live = useGameStore((s) => s.liveMatch);
  const clubs = useGameStore((s) => s.clubs);
  const players = useGameStore((s) => s.players);
  const tickLive = useGameStore((s) => s.tickLive);
  const liveKickOff = useGameStore((s) => s.liveKickOff);
  const liveTeamTalk = useGameStore((s) => s.liveTeamTalk);
  const resumeSecondHalf = useGameStore((s) => s.liveResumeSecondHalf);
  const liveTickShootout = useGameStore((s) => s.liveTickShootout);
  const liveSub = useGameStore((s) => s.liveSub);
  const liveSetFormation = useGameStore((s) => s.liveSetFormation);
  const liveSetTactic = useGameStore((s) => s.liveSetTactic);
  const finishLive = useGameStore((s) => s.finishLive);
  const cancelLive = useGameStore((s) => s.cancelLive);

  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [offId, setOffId] = useState('');
  const [onId, setOnId] = useState('');
  const [talkedPhase, setTalkedPhase] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  const isPlayingPhase = live?.phase === 'FIRST_HALF' || live?.phase === 'SECOND_HALF';

  // The tick loop — only runs while "playing" and in an active half.
  useEffect(() => {
    if (!playing || !isPlayingPhase) return;
    const id = setInterval(() => tickLive(), SPEEDS[speed].ms);
    return () => clearInterval(id);
  }, [playing, isPlayingPhase, speed, tickLive]);

  // Auto-scroll the commentary feed to the newest line.
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = 0;
  }, [live?.events.length]);

  if (!live) {
    return (
      <div className="space-y-4">
        <p className="text-slate-400">No live match in progress.</p>
        <button className="btn-ghost" onClick={() => navigate('/dashboard')}>Back to dashboard</button>
      </div>
    );
  }

  const home = clubs[live.homeClubId];
  const away = clubs[live.awayClubId];
  const managed: Side = live.home.managed ? 'home' : 'away';
  const managedState = live[managed];
  const name = (id?: string) => (id && players[id] ? fullName(players[id]) : '—');
  const clockLabel = live.phase === 'FULL_TIME' ? 'FT' : live.phase === 'HALF_TIME' ? 'HT' : live.phase === 'SHOOTOUT' ? 'PENS' : `${live.minute}'`;

  const momentum = live.momentum; // -100 away … +100 home
  const homePct = Math.round(50 + momentum / 2);

  return (
    <div className="space-y-4">
      {/* Scoreboard */}
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <CrestBadge abbrev={home?.abbrev ?? '?'} color={home?.primaryColor ?? '#666'} />
            <span className="font-semibold truncate">{home?.shortName}</span>
          </div>
          <div className="text-center px-2 sm:px-4 shrink-0">
            {home && away && areRivals(home.name, away.name) && (
              <div className="text-[10px] font-bold uppercase tracking-widest text-rose-400 mb-0.5">Derby</div>
            )}
            <div className="text-3xl sm:text-4xl font-bold tabular-nums whitespace-nowrap">{live.home.goals} – {live.away.goals}</div>
            <div className="text-xs text-accent-400 font-mono mt-1">{clockLabel}</div>
          </div>
          <div className="flex items-center gap-3 flex-1 justify-end">
            <span className="font-semibold truncate text-right">{away?.shortName}</span>
            <CrestBadge abbrev={away?.abbrev ?? '?'} color={away?.primaryColor ?? '#666'} />
          </div>
        </div>
        {/* Momentum bar */}
        <div className="mt-4">
          <div className="flex justify-between text-[10px] uppercase tracking-wide text-slate-500 mb-1"><span>Momentum</span><span>xG {live.home.xg.toFixed(1)} – {live.away.xg.toFixed(1)}</span></div>
          <div className="h-2 rounded bg-surface-700 overflow-hidden flex">
            <div className="h-2 bg-sky-500 transition-all duration-500" style={{ width: `${homePct}%` }} />
            <div className="h-2 bg-rose-500 transition-all duration-500" style={{ width: `${100 - homePct}%` }} />
          </div>
        </div>
      </div>

      {/* Penalty shootout */}
      {live.phase === 'SHOOTOUT' && live.shootout && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-amber-300">Penalty shootout</h2>
            <span className="text-lg font-bold tabular-nums">{live.shootout.home} – {live.shootout.away}</span>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-3">
            {(['home', 'away'] as const).map((sideKey) => (
              <div key={sideKey}>
                <div className="text-xs text-slate-500 mb-1 truncate">{clubs[live[sideKey].clubId]?.shortName}</div>
                <div className="flex gap-1 flex-wrap">
                  {live.shootout!.kicks.filter((k) => k.side === sideKey).map((k, i) => (
                    <span key={i} className={k.scored ? 'text-emerald-400' : 'text-rose-500'}>{k.scored ? '●' : '○'}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button className="btn-primary w-full" onClick={() => liveTickShootout()}>Take penalty ▸</button>
        </div>
      )}

      {/* Controls */}
      {live.phase === 'PREMATCH' || live.phase === 'HALF_TIME' ? (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-1">
            {live.phase === 'PREMATCH' ? 'Pre-match team talk' : 'Half-time team talk'}
          </h2>
          <p className="text-xs text-slate-500 mb-3">Read the room — the right tone lifts them, the wrong one backfires.</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {TALK_TONES.map((tone) => (
              <button
                key={tone}
                className={talkedPhase === live.phase ? 'btn-ghost opacity-50 text-sm' : 'btn-ghost text-sm'}
                disabled={talkedPhase === live.phase}
                onClick={() => { liveTeamTalk(tone); setTalkedPhase(live!.phase); }}
              >{TONE_LABEL[tone]}</button>
            ))}
          </div>
          {live.lastTalk && talkedPhase === live.phase && (
            <p className={`text-sm mb-3 ${live.lastTalk.reception > 0.15 ? 'text-emerald-300' : live.lastTalk.reception < -0.1 ? 'text-rose-300' : 'text-slate-400'}`}>
              {live.lastTalk.message}
            </p>
          )}
          <button
            className="btn-primary"
            onClick={() => {
              if (live.phase === 'PREMATCH') { liveKickOff(); setPlaying(true); }
              else { resumeSecondHalf(); setPlaying(true); }
            }}
          >
            {live.phase === 'PREMATCH' ? 'Kick Off ▸' : 'Start Second Half ▸'}
          </button>
        </div>
      ) : (
        <div className="card p-3 flex flex-wrap items-center gap-2">
          {live.phase === 'FULL_TIME' ? (
            <button className="btn-primary" onClick={async () => { await finishLive(); navigate('/dashboard'); }}>Confirm result &amp; continue ▸</button>
          ) : (
            <>
              <button className="btn-ghost" onClick={() => setPlaying((p) => !p)}>{playing ? '⏸ Pause' : '▶ Play'}</button>
              <div className="flex gap-1">
                {SPEEDS.map((sp, i) => (
                  <button key={sp.label} className={speed === i ? 'btn-primary px-2 py-1 text-xs' : 'btn-ghost px-2 py-1 text-xs'} onClick={() => setSpeed(i)}>{sp.label}</button>
                ))}
              </div>
              <span className="text-xs text-slate-500 ml-auto">Pause to manage · {managedState.subsUsed}/3 subs used</span>
            </>
          )}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Pitch + commentary */}
        <div className="lg:col-span-2 space-y-4">
          <PitchView live={live} players={players} homeClub={home} awayClub={away} />
          <div className="card p-4">
            <h2 className="text-sm font-semibold text-slate-400 mb-3">Commentary</h2>
            <div ref={feedRef} className="space-y-1.5 max-h-[20rem] overflow-y-auto pr-1">
              {[...live.events].reverse().map((e, i) => (
                <CommentaryLine key={live.events.length - i} e={e} name={name} homeShort={home?.shortName} awayShort={away?.shortName} />
              ))}
            </div>
          </div>
        </div>

        {/* Management panel */}
        <div className="card p-4 space-y-4">
          <h2 className="text-sm font-semibold text-slate-400">Manage — {clubs[managedState.clubId]?.shortName}</h2>

          <div>
            <div className="text-xs text-slate-500 mb-1">Substitution ({managedState.subsUsed}/3)</div>
            <select className="w-full bg-surface-700 border border-surface-600 rounded px-2 py-1 text-sm mb-1" value={offId} onChange={(e) => setOffId(e.target.value)}>
              <option value="">Player off…</option>
              {managedState.onPitch.map((id) => <option key={id} value={id}>{name(id)} ({players[id]?.position})</option>)}
            </select>
            <select className="w-full bg-surface-700 border border-surface-600 rounded px-2 py-1 text-sm mb-2" value={onId} onChange={(e) => setOnId(e.target.value)}>
              <option value="">Player on…</option>
              {managedState.bench.map((b) => <option key={b.playerId} value={b.playerId}>{name(b.playerId)} ({players[b.playerId]?.position}, {b.ovr})</option>)}
            </select>
            <button
              className="btn-primary w-full text-sm"
              disabled={!offId || !onId || managedState.subsUsed >= 3}
              onClick={() => { liveSub(offId, onId); setOffId(''); setOnId(''); }}
            >Make substitution</button>
          </div>

          <div>
            <div className="text-xs text-slate-500 mb-1">Formation</div>
            <select className="w-full bg-surface-700 border border-surface-600 rounded px-2 py-1 text-sm" value={live.home.managed ? undefined : undefined} onChange={(e) => liveSetFormation(e.target.value)} defaultValue="">
              <option value="" disabled>Change formation…</option>
              {Object.keys(FORMATIONS).map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-xs text-slate-500 mb-1">Defensive</div>
              <select className="w-full bg-surface-700 border border-surface-600 rounded px-2 py-1 text-sm" defaultValue="" onChange={(e) => liveSetTactic('defensive', e.target.value)}>
                <option value="" disabled>Set…</option>
                {DEF_TACTICS.map((t) => <option key={t} value={t}>{t[0] + t.slice(1).toLowerCase()}</option>)}
              </select>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Offensive</div>
              <select className="w-full bg-surface-700 border border-surface-600 rounded px-2 py-1 text-sm" defaultValue="" onChange={(e) => liveSetTactic('offensive', e.target.value)}>
                <option value="" disabled>Set…</option>
                {OFF_TACTICS.map((t) => <option key={t} value={t}>{t[0] + t.slice(1).toLowerCase()}</option>)}
              </select>
            </div>
          </div>

          <button className="btn-ghost w-full text-xs text-slate-500" onClick={() => { if (confirm('Abandon the live match? It will stay unplayed and you can quick-sim it later.')) { cancelLive(); navigate('/dashboard'); } }}>
            Abandon live match
          </button>
        </div>
      </div>
    </div>
  );
}

function CommentaryLine({ e, name, homeShort, awayShort }: { e: MatchEvent; name: (id?: string) => string; homeShort?: string; awayShort?: string }) {
  const teamShort = e.side === 'home' ? homeShort : awayShort;
  let text = e.description;
  let icon = '';
  let cls = 'text-slate-300';
  switch (e.type) {
    case 'GOAL':
      icon = '⚽'; cls = 'text-emerald-300 font-semibold';
      text = `GOAL! ${name(e.playerId)} ${e.description}${e.assistPlayerId ? ` (assist: ${name(e.assistPlayerId)})` : ''}`;
      break;
    case 'SAVE': case 'BIG_CHANCE': case 'SHOT':
      text = `${name(e.playerId)} ${e.description}`; cls = 'text-slate-300';
      break;
    case 'YELLOW': icon = '🟨'; text = `${name(e.playerId)} — ${e.description}`; cls = 'text-yellow-300'; break;
    case 'RED': icon = '🟥'; text = `${name(e.playerId)} — ${e.description}`; cls = 'text-rose-300 font-medium'; break;
    case 'SUB': icon = '🔁'; text = `${name(e.playerId)} on for ${name(e.assistPlayerId)}`; cls = 'text-sky-300'; break;
    case 'KICKOFF': case 'HALFTIME': case 'FULLTIME': cls = 'text-accent-400 font-medium'; break;
    case 'COMMENTARY': cls = 'text-slate-500 italic'; break;
  }
  return (
    <div className={`text-sm flex gap-2 ${cls}`}>
      <span className="font-mono text-xs text-slate-500 w-8 shrink-0 text-right">{e.type === 'FULLTIME' || e.type === 'HALFTIME' ? '' : `${e.minute}'`}</span>
      <span>{icon && <span className="mr-1">{icon}</span>}{teamShort && (e.type === 'GOAL' || e.type === 'RED') ? <span className="text-slate-500">[{teamShort}] </span> : ''}{text}</span>
    </div>
  );
}
