import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../state/store';
import { playerCareerOf, avatarSelectionBias } from '../../game/playerCareer';
import { assignXI, resolveBench } from '../../engine/lineup';
import { Rating, CrestBadge } from '../components/Rating';
import { fullName, ageOf } from '../format';
import type { AvatarMatchSummary } from '../../types/playerCareer';

export function PlayerHome() {
  const navigate = useNavigate();
  const meta = useGameStore((s) => s.meta);
  const players = useGameStore((s) => s.players);
  const clubs = useGameStore((s) => s.clubs);
  const season = useGameStore((s) => s.currentSeason());
  const nextMatch = useGameStore((s) => s.managerNextMatch());
  const answerConversation = useGameStore((s) => s.answerConversation);
  const requestMeeting = useGameStore((s) => s.requestMeeting);
  const answerPlayerPress = useGameStore((s) => s.answerPlayerPress);
  const career = playerCareerOf(meta);
  const currentYear = season?.year ?? meta?.startYear ?? new Date().getFullYear();

  const p = career ? players[career.playerId] : undefined;
  const clubId = p?.contract.clubId ?? undefined;
  const club = clubId ? clubs[clubId] : undefined;

  // "Will I start?" — resolve the club's XI with the avatar's trust nudge and
  // see where the avatar lands (starting / bench / out of the squad).
  const selection = useMemo(() => {
    if (!career || !p || !clubId || !club) return null;
    const squad = Object.values(players).filter((pl) => pl.contract.clubId === clubId);
    const bias = { [career.playerId]: avatarSelectionBias(career, p, squad) };
    const formation = club.formation ?? '4-3-3';
    const xi = assignXI(squad, formation, { autoMode: true, selectionBias: bias });
    if (xi.some((s) => s?.player.id === career.playerId)) return 'START';
    const bench = resolveBench(squad, formation, { autoMode: true });
    if (bench.some((b) => b.id === career.playerId)) return 'BENCH';
    return 'OUT';
  }, [career, p, clubId, club, players]);

  if (!meta || !career || !p) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-slate-400">This save isn’t a player career.</p>
        <button className="btn-primary" onClick={() => navigate('/dashboard')}>Go to dashboard</button>
      </div>
    );
  }

  const oppId = nextMatch ? (nextMatch.homeClubId === clubId ? nextMatch.awayClubId : nextMatch.homeClubId) : null;
  const personalNews = (meta.news ?? [])
    .filter((n) => n.id.startsWith('news_pc_') || n.category === 'MILESTONE' || n.category === 'AWARD')
    .slice(-8).reverse();

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <h1 className="page-title">My Player</h1>

      {/* Identity */}
      <div className="card p-5 flex items-center gap-4">
        {club && <CrestBadge abbrev={club.abbrev} color={club.primaryColor ?? '#3ba776'} size={44} />}
        <div className="flex-1 min-w-0">
          <div className="text-xl font-semibold text-white truncate">{fullName(p)}</div>
          <div className="text-sm text-slate-400">{p.position} · {ageOf(p, currentYear)} yrs · {club?.name ?? 'No club'}</div>
          <div className="text-xs text-slate-500 mt-0.5">{career.status} · {career.archetype}</div>
        </div>
        <div className="text-right space-y-1">
          <div className="flex items-center gap-2 justify-end"><span className="text-[11px] uppercase tracking-wide text-slate-500">OVR</span><Rating value={p.overall} /></div>
          <div className="flex items-center gap-2 justify-end"><span className="text-[11px] uppercase tracking-wide text-slate-500">POT</span><Rating value={p.potential} /></div>
        </div>
      </div>

      {/* Manager conversation (choice-driven) */}
      {(career.pendingConversations ?? []).length > 0 && (() => {
        const conv = career.pendingConversations![0];
        return (
          <div className="card p-4 border border-accent/30 bg-accent/5">
            <div className="text-xs uppercase tracking-wide text-accent-400 mb-1">Manager wants a word</div>
            <p className="text-sm text-slate-200 mb-3">{conv.prompt}</p>
            <div className="flex flex-col gap-2">
              {conv.choices.map((c, i) => (
                <button key={i} className="btn-ghost text-left text-sm" onClick={() => void answerConversation(conv.id, i)}>“{c.text}”</button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Retirement / farewell banner (Tier 5) */}
      {career.retirement?.retiredDay != null ? (
        <button className="card p-4 w-full text-left border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 transition-colors" onClick={() => navigate('/retrospective')}>
          <span className="text-sm text-amber-200">🎬 Your playing career is over. View your career retrospective and choose what comes next →</span>
        </button>
      ) : career.retirement?.announced ? (
        <div className="card p-3 border border-amber-500/30 bg-amber-500/5 text-sm text-amber-200">
          🙌 {career.retirement.forced ? 'The end is near.' : `Farewell season — retiring at the end of ${career.retirement.finalSeason}.`} <button className="underline" onClick={() => navigate('/legacy')}>Manage your send-off →</button>
        </div>
      ) : null}

      {/* Press prompt (event-driven media moment) */}
      {(career.pendingPress ?? []).length > 0 && (() => {
        const pr = career.pendingPress![0];
        return (
          <div className="card p-4 border border-sky-500/30 bg-sky-500/5">
            <div className="text-xs uppercase tracking-wide text-sky-400 mb-1">🎙 The press want a word</div>
            <p className="text-sm text-slate-200 mb-3">{pr.prompt}</p>
            <div className="flex flex-col gap-2">
              {pr.choices.map((c, i) => (
                <button key={i} className="btn-ghost text-left text-sm" onClick={() => void answerPlayerPress(pr.id, i)}>
                  “{c.text}” <span className="text-[11px] text-slate-500">({c.tone.toLowerCase()})</span>
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Off-pitch nudge — decisions waiting elsewhere */}
      {((career.contractOffers ?? []).length > 0 || (career.loanOffers ?? []).length > 0 || (career.pendingSponsorOffers ?? []).length > 0) && (
        <button className="card p-3 w-full text-left border border-accent/30 bg-accent/5 hover:bg-accent/10 transition-colors" onClick={() => navigate('/off-pitch')}>
          <span className="text-sm text-accent-200">📩 You have decisions waiting off the pitch — offers on the table.</span>
        </button>
      )}

      {/* Selection read + next fixture */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Next fixture</div>
          {nextMatch && oppId ? (
            <div>
              <div className="text-white font-medium">{nextMatch.homeClubId === clubId ? 'vs' : '@'} {clubs[oppId]?.shortName ?? '—'}</div>
              <div className={`text-sm mt-1 ${selection === 'START' ? 'text-emerald-400' : selection === 'BENCH' ? 'text-amber-400' : 'text-rose-400'}`}>
                {selection === 'START' ? '✓ In the starting XI' : selection === 'BENCH' ? 'On the bench' : 'Not in the matchday squad'}
              </div>
            </div>
          ) : <div className="text-sm text-slate-500">No upcoming fixture.</div>}
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Manager trust</div>
          <TrustBar trust={career.managerTrust} />
          <button className="btn-ghost text-xs mt-2 w-full" onClick={() => void requestMeeting()}>Ask for more minutes</button>
        </div>
      </div>

      {/* Condition + season tallies */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Form" value={p.form > 15 ? 'Hot' : p.form < -15 ? 'Cold' : 'Steady'} tone={p.form > 15 ? 'good' : p.form < -15 ? 'bad' : 'neutral'} />
        <Stat label="Fitness" value={`${Math.round(p.fitness)}%`} tone={p.fitness > 80 ? 'good' : p.fitness < 55 ? 'bad' : 'neutral'} />
        <Stat label="Season apps" value={`${career.seasonApps}`} />
        <Stat label="Season goals" value={`${career.seasonGoals}`} />
      </div>
      {p.injury && (
        <div className="card p-3 border border-rose-500/30 bg-rose-500/5 text-sm text-rose-300">
          🚑 Injured — out for a spell. You’ll return to reduced sharpness.
        </div>
      )}

      {/* Objectives */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-2">This match — the gaffer wants</h2>
          {(() => {
            const objs = (career.matchObjectives ?? []).filter((o) => nextMatch && o.matchId === nextMatch.id);
            if (objs.length === 0) return <p className="text-xs text-slate-500">No brief yet — set on matchday.</p>;
            return (
              <ul className="space-y-1">
                {objs.map((o, i) => <li key={i} className="text-sm text-slate-300 flex gap-2"><span className="text-slate-600">▸</span>{o.text}</li>)}
              </ul>
            );
          })()}
        </div>
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-2">Season objectives</h2>
          {(career.objectives ?? []).length === 0 ? (
            <p className="text-xs text-slate-500">No season targets set.</p>
          ) : (
            <ul className="space-y-2">
              {career.objectives.map((o, i) => (
                <li key={i} className="text-sm">
                  <div className="flex items-center justify-between">
                    <span className={o.met ? 'text-emerald-400' : 'text-slate-300'}>{o.met ? '✓ ' : ''}{o.text}</span>
                    {o.target != null && o.kind !== 'AVG_RATING' && <span className="text-xs text-slate-500 font-mono">{Math.round(o.progress ?? 0)}/{o.target}</span>}
                  </div>
                  {o.target != null && o.kind !== 'AVG_RATING' && (
                    <div className="mt-1 h-1.5 rounded bg-surface-700 overflow-hidden"><div className={`h-full ${o.met ? 'bg-emerald-500' : 'bg-accent-500/70'}`} style={{ width: `${Math.min(100, Math.round(((o.progress ?? 0) / o.target) * 100))}%` }} /></div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Standing: confidence, sharpness, rival + promises */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Confidence" value={`${Math.round(career.confidence ?? 60)}`} tone={(career.confidence ?? 60) >= 60 ? 'good' : (career.confidence ?? 60) < 35 ? 'bad' : 'neutral'} />
        <Stat label="Match sharpness" value={`${Math.round(career.matchSharpness ?? 100)}%`} tone={(career.matchSharpness ?? 100) >= 85 ? 'good' : (career.matchSharpness ?? 100) < 70 ? 'bad' : 'neutral'} />
        <Stat label="Season avg" value={career.seasonAvgRating ? career.seasonAvgRating.toFixed(1) : '—'} />
        <Stat label="Caps" value={career.international.capped ? `${career.international.caps}` : '—'} />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {/* Rival for the shirt */}
        {career.rival && players[career.rival.playerId] && (() => {
          const r = players[career.rival!.playerId];
          const ahead = p.overall >= r.overall;
          return (
            <div className="card p-4">
              <h2 className="text-sm font-semibold text-slate-400 mb-2">Battle for the shirt</h2>
              <div className="flex items-center justify-between text-sm">
                <span className="text-accent-300">You <span className="text-slate-500">({p.position})</span></span>
                <span className="font-mono">{p.overall} OVR · form {p.form > 0 ? '+' : ''}{Math.round(p.form / 10)}</span>
              </div>
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="text-slate-300 truncate">{fullName(r)} <span className="text-slate-500">({r.position})</span></span>
                <span className="font-mono text-slate-400">{r.overall} OVR · form {r.form > 0 ? '+' : ''}{Math.round(r.form / 10)}</span>
              </div>
              <div className={`text-xs mt-2 ${ahead ? 'text-emerald-400' : 'text-amber-400'}`}>{ahead ? 'You’re ahead in the pecking order — keep it up.' : 'He’s the one to dislodge. Force the manager’s hand.'}</div>
            </div>
          );
        })()}

        {/* Promises */}
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-2">Manager’s promises</h2>
          {(career.promises ?? []).length === 0 ? (
            <p className="text-xs text-slate-500">No outstanding promises.</p>
          ) : (
            <ul className="space-y-1">
              {career.promises!.map((pr, i) => <li key={i} className="text-sm text-slate-300 flex gap-2"><span className="text-slate-600">•</span>{pr.text}</li>)}
            </ul>
          )}
        </div>
      </div>

      {/* Last match */}
      {career.lastMatch && <LastMatchCard s={career.lastMatch} />}

      {/* Personal feed */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-slate-400 mb-2">Your story so far</h2>
        {personalNews.length === 0 ? (
          <p className="text-xs text-slate-500">Nothing yet — get out on the pitch and make headlines.</p>
        ) : (
          <ul className="space-y-1.5">
            {personalNews.map((n) => (
              <li key={n.id} className="text-sm">
                <span className="text-white">{n.title}</span>
                <span className="text-slate-500"> — {n.body}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TrustBar({ trust }: { trust: number }) {
  const pct = Math.round(trust);
  const tone = pct >= 66 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-rose-500';
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-lg font-semibold text-white">{pct}</span>
        <span className="text-[11px] text-slate-500">{pct >= 66 ? 'Trusted' : pct >= 40 ? 'On watch' : 'Out of favour'}</span>
      </div>
      <div className="mt-1 h-2 rounded bg-surface-700 overflow-hidden"><div className={`h-full ${tone}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function Stat({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'good' | 'bad' | 'neutral' }) {
  const color = tone === 'good' ? 'text-emerald-400' : tone === 'bad' ? 'text-rose-400' : 'text-white';
  return (
    <div className="card p-3 text-center">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-lg font-semibold mt-0.5 ${color}`}>{value}</div>
    </div>
  );
}

function LastMatchCard({ s }: { s: AvatarMatchSummary }) {
  const resTone = s.result === 'W' ? 'text-emerald-400' : s.result === 'D' ? 'text-slate-300' : 'text-rose-400';
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-slate-400">Last match</h2>
        <span className="text-xs text-slate-500">{s.competition ?? ''}</span>
      </div>
      <div className="flex items-center gap-4">
        <div className={`text-lg font-semibold ${resTone}`}>{s.home ? 'H' : 'A'} {s.teamGoals}–{s.oppGoals} vs {s.opponent}</div>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-slate-400">{s.minutes}′</span>
          {s.goals > 0 && <span className="text-emerald-400">⚽ {s.goals}</span>}
          {s.assists > 0 && <span className="text-sky-400">🅰 {s.assists}</span>}
          <span className={`font-mono font-semibold ${s.rating >= 7.5 ? 'text-emerald-400' : s.rating < 6 ? 'text-rose-400' : 'text-white'}`}>{s.rating.toFixed(1)}</span>
        </div>
      </div>
      {(s.objectives?.length || s.trustDelta != null) && (
        <div className="mt-3 pt-3 border-t border-surface-700 flex flex-wrap items-center gap-x-3 gap-y-1">
          {s.objectives?.map((o, i) => (
            <span key={i} className={`text-xs ${o.met ? 'text-emerald-400' : 'text-slate-500'}`}>{o.met ? '✓' : '✗'} {o.text}</span>
          ))}
          {s.trustDelta != null && s.trustDelta !== 0 && (
            <span className={`text-xs ml-auto ${s.trustDelta > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              Trust {s.trustDelta > 0 ? '+' : ''}{s.trustDelta}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
