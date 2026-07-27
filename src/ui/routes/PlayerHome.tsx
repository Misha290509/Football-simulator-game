import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../state/store';
import { playerCareerOf, avatarSelectionBias } from '../../game/playerCareer';
import { MANAGER_STYLE_LABEL } from '../../game/playerProgression';
import { playStylesOf, PLAYSTYLE_META } from '../../game/playStyles';
import { assignXI, resolveBench } from '../../engine/lineup';
import { Rating, CrestBadge } from '../components/Rating';
import { fullName, ageOf } from '../format';
import type { AvatarMatchSummary } from '../../types/playerCareer';
import type { Player } from '../../types/player';

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
  const respondCallUp = useGameStore((s) => s.respondCallUp);
  const commitAllegiance = useGameStore((s) => s.commitAllegianceAction);
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
        {career.shirt && (
          <div className={`shrink-0 w-11 h-12 rounded flex items-center justify-center font-bold text-lg ${career.shirt.marquee ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40' : 'bg-surface-700 text-slate-300 border border-surface-600'}`} title={career.shirt.marquee ? 'A marquee shirt — earned.' : 'Your squad number.'}>
            {career.shirt.number}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-xl font-semibold text-white truncate">{fullName(p)}</div>
          <div className="text-sm text-slate-400">{p.position} · {ageOf(p, currentYear)} yrs · {club?.name ?? 'No club'}</div>
          <div className="text-xs text-slate-500 mt-0.5">{career.status} · {career.archetype}{career.managerStyle ? ` · Gaffer: ${MANAGER_STYLE_LABEL[career.managerStyle]}` : ''}</div>
          {career.identity && (
            <div className="text-[11px] text-slate-600 mt-0.5 truncate">
              {career.identity.hometown ? `${career.identity.hometown} lad` : ''}
              {career.identity.boyhoodClub ? ` · grew up a ${career.identity.boyhoodClub} fan` : ''}
              {career.identity.betrayal ? ' · 💔 branded a traitor' : career.identity.homecoming ? ' · 🏠 came home' : ''}
            </div>
          )}
        </div>
        <div className="text-right space-y-1">
          <div className="flex items-center gap-2 justify-end"><span className="text-[11px] uppercase tracking-wide text-slate-500">OVR</span><Rating value={p.overall} /></div>
          <div className="flex items-center gap-2 justify-end"><span className="text-[11px] uppercase tracking-wide text-slate-500">POT</span><Rating value={p.potential} /></div>
        </div>
      </div>

      {/* PlayStyles + public persona — the evolving signature of your player */}
      {(playStylesOf(p).length > 0 || (career.publicImage?.persona && career.publicImage.persona !== 'Unknown')) && (
        <div className="flex flex-wrap gap-1.5">
          {career.publicImage?.persona && career.publicImage.persona !== 'Unknown' && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-fuchsia-500/10 text-fuchsia-300 border border-fuchsia-500/25">🎭 {career.publicImage.persona}</span>
          )}
          {playStylesOf(p).map((s) => (
            <span key={s} className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/25" title={PLAYSTYLE_META[s].blurb}>★ {PLAYSTYLE_META[s].label}</span>
          ))}
        </div>
      )}

      {/* Manager conversation (choice-driven) */}
      {(career.pendingConversations ?? []).length > 0 && (() => {
        const conv = career.pendingConversations![0];
        const header = conv.trigger === 'RIVAL_PRESS' ? 'The press want a reaction'
          : conv.trigger === 'MENTOR_WORD' ? 'A word from your mentor'
          : conv.trigger === 'DRESSING_ROOM' ? 'Dressing-room politics'
          : conv.trigger === 'PUNDIT' ? 'On the panel tonight'
          : conv.trigger === 'BURNOUT' ? 'You’re running on empty'
          : conv.trigger === 'INCIDENT' ? 'Off the pitch'
          : conv.trigger === 'FAMILY' ? 'A call from home'
          : conv.trigger === 'RELEGATION' ? 'The club has gone down'
          : conv.trigger === 'PROTEST' ? 'The supporters are protesting'
          : conv.trigger === 'INTL_STANDBY' ? 'On standby'
          : conv.trigger === 'INTL_CUT' ? 'Left out of the squad'
          : conv.trigger === 'INTL_RIVAL' ? 'One shirt, two of you'
          : conv.trigger === 'CAPTAINCY' ? 'The armband'
          : 'Manager wants a word';
        return (
          <div className="card p-4 border border-accent/30 bg-accent/5">
            <div className="text-xs uppercase tracking-wide text-accent-400 mb-1">{header}</div>
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

      {/* Dual nationality — the choice that closes a door for good */}
      {career.pendingAllegiance && (
        <div className="card p-4 border border-fuchsia-500/40 bg-fuchsia-500/5">
          <div className="text-xs uppercase tracking-wide text-fuchsia-300 mb-1">🌍 Two countries want you</div>
          <p className="text-sm text-slate-200 mb-3">Commit to one and the other door closes forever. Choose carefully — this is for the rest of your career.</p>
          <div className="flex flex-wrap gap-2">
            {career.pendingAllegiance.nations.map((n) => (
              <button key={n} className="btn-primary text-sm" onClick={() => void commitAllegiance(n)}>Play for {n}</button>
            ))}
          </div>
        </div>
      )}

      {/* International call-up (accept / withdraw) */}
      {career.pendingCallUp && (
        <div className="card p-4 border border-emerald-500/30 bg-emerald-500/5">
          <div className="text-xs uppercase tracking-wide text-emerald-400 mb-1">🏴 International call-up</div>
          <p className="text-sm text-slate-200 mb-3">The {career.pendingCallUp.nation} manager has called you into the senior squad{career.pendingCallUp.competition ? ` for the ${career.pendingCallUp.competition}` : ''}. Accept to win your first cap.</p>
          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={() => void respondCallUp(true)}>Accept the call-up</button>
            <button className="btn-ghost" onClick={() => void respondCallUp(false)}>Withdraw</button>
          </div>
        </div>
      )}

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
          <div className="grid grid-cols-3 gap-1 mt-2">
            <button className="btn-ghost text-[11px]" onClick={() => void requestMeeting('MINUTES')}>Minutes</button>
            <button className="btn-ghost text-[11px]" onClick={() => void requestMeeting('ROLE')}>My role</button>
            <button className="btn-ghost text-[11px]" onClick={() => void requestMeeting('NEW_DEAL')}>New deal</button>
          </div>
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
          {career.comeback && !career.comeback.returned
            ? `🚑 Serious injury — around ${career.comeback.weeksOut} weeks out. The long road back starts here.`
            : '🚑 Injured — out for a spell. You’ll return to reduced sharpness.'}
        </div>
      )}
      {(career.burnout?.level ?? 0) >= 45 && (
        <div className="card p-3 border border-violet-500/30 bg-violet-500/5 text-sm text-violet-200">
          🧠 {(career.burnout!.level >= 70 ? 'Burnt out — this is affecting everything. Address it.' : 'Running low — the season is taking its toll.')}
          <div className="h-1.5 rounded bg-surface-700 overflow-hidden mt-1.5"><div className="h-full bg-violet-400" style={{ width: `${career.burnout!.level}%` }} /></div>
        </div>
      )}
      {career.chronic && (
        <div className="card p-3 border border-rose-500/30 bg-rose-500/5 text-sm text-rose-200">
          🦵 A chronic {career.chronic.kind.toLowerCase()} problem — it never fully healed. You're a different player now, and you'll manage it for the rest of your career.
        </div>
      )}
      {career.crisis && (
        <div className="card p-3 border border-rose-500/30 bg-rose-500/5 text-sm text-rose-200">
          🏚️ The club is in financial trouble — wages deferred, the training ground up for sale. Nobody knows how this ends.
        </div>
      )}
      {career.owner && (
        <div className="card p-3 border border-surface-600 text-xs text-slate-400">
          🏛️ Owned by {career.owner.name}{career.owner.kind === 'BILLIONAIRE' ? ' — and the money is about to change everything.' : career.owner.kind === 'ASSET_STRIPPER' ? ' — and nobody trusts them.' : '.'}
        </div>
      )}
      {career.spiral && (
        <div className="card p-3 border border-amber-500/30 bg-amber-500/5 text-sm text-amber-200">
          📉 You're in a spiral — form, trust and confidence all feeding each other downward. The only way out is through.
        </div>
      )}
      {!p.injury && career.comeback?.returned && (
        <div className="card p-3 border border-amber-500/30 bg-amber-500/5 text-sm text-amber-300">
          💪 On the comeback trail — back in the squad after {career.comeback.weeksOut} weeks out. Build your sharpness back to full to complete the comeback.
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

      {/* Fame — following + public persona */}
      {(career.following > 0 || career.publicImage?.persona) && (
        <div className="card p-3 flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Fame</div>
            <div className="text-sm text-slate-200">{formatFollowing(career.following)} following{career.publicImage?.persona ? ` · ${career.publicImage.persona}` : ''}</div>
          </div>
          <div className="w-28 h-1.5 rounded bg-surface-700 overflow-hidden"><div className="h-full bg-sky-500/70" style={{ width: `${Math.min(100, Math.round(career.following / 500))}%` }} /></div>
        </div>
      )}

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
              {career.rival!.sidelined ? (
                <div className="text-xs mt-2 text-emerald-400">🚑 He’s sidelined — the shirt is open. Seize it.</div>
              ) : (
                <div className={`text-xs mt-2 ${ahead ? 'text-emerald-400' : 'text-amber-400'}`}>{ahead ? 'You’re ahead in the pecking order — keep it up.' : 'He’s the one to dislodge. Force the manager’s hand.'}</div>
              )}
              {typeof career.rival!.edge === 'number' && career.rival!.edge !== 0 && (
                <div className="text-[11px] mt-1 text-slate-500">Head-to-head: you’re {career.rival!.edge > 0 ? 'ahead' : 'behind'} by {Math.abs(career.rival!.edge)} on recent form.</div>
              )}
            </div>
          );
        })()}

        {/* Mentor — a named senior team-mate in your corner */}
        {career.mentor && (
          <div className="card p-4">
            <h2 className="text-sm font-semibold text-slate-400 mb-2">Your mentor</h2>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-200 truncate">{career.mentor.departed ? '🕊️ ' : '🤝 '}{career.mentor.name}</span>
              <span className="text-[11px] text-slate-500">{career.mentor.departed ? 'moved on' : 'since ' + career.mentor.since}</span>
            </div>
            <div className="mt-2 h-1.5 rounded bg-surface-700 overflow-hidden">
              <div className="h-full bg-amber-400" style={{ width: `${Math.round(career.mentor.bond)}%` }} />
            </div>
            <div className="text-[11px] mt-1 text-slate-500">
              {career.mentor.departed ? 'A bond you carry with you.'
                : career.mentor.bond >= 85 ? 'Like family now — he’d run through a wall for you.'
                : career.mentor.bond >= 65 ? 'A trusted voice when it gets hard.'
                : 'Still finding your feet together.'}
            </div>
          </div>
        )}

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

      {/* Competition for the shirt (depth at your position) */}
      {clubId && <PositionBattle players={players} clubId={clubId} avatar={p} year={currentYear} />}

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

function PositionBattle({ players, clubId, avatar, year }: { players: Record<string, Player>; clubId: string; avatar: Player; year: number }) {
  const rivals = Object.values(players)
    .filter((pl) => pl.contract.clubId === clubId && pl.positions.includes(avatar.position))
    .sort((a, b) => b.overall - a.overall);
  if (rivals.length <= 1) return null;
  const myRank = rivals.findIndex((r) => r.id === avatar.id) + 1;
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-slate-400">Competition at {avatar.position}</h2>
        <span className="text-xs text-slate-500">You’re #{myRank} of {rivals.length}</span>
      </div>
      <div className="space-y-1">
        {rivals.slice(0, 5).map((r, i) => {
          const me = r.id === avatar.id;
          const out = r.injury || (r.cards?.suspendedFor ?? 0) > 0;
          return (
            <div key={r.id} className={`flex items-center justify-between text-sm rounded px-1 ${me ? 'bg-accent/10' : ''}`}>
              <span className="truncate">
                <span className="text-slate-600 mr-1.5">{i + 1}.</span>
                <span className={me ? 'text-accent-300 font-medium' : 'text-slate-300'}>{fullName(r)}</span>
                <span className="text-slate-500 text-xs ml-1">{ageOf(r, year)}y</span>
                {out && <span className="text-rose-400 text-[11px] ml-1">out</span>}
              </span>
              <span className="font-mono text-sm flex items-center gap-2">
                <span className="text-slate-500 text-xs">form {r.form > 0 ? '+' : ''}{Math.round(r.form / 10)}</span>
                <Rating value={r.overall} />
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-600 mt-2">Beat them on form and sharpness — or wait for a chance when one’s out — to climb the pecking order.</p>
    </div>
  );
}

function formatFollowing(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${Math.round(n)}`;
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
