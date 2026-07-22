import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../state/store';
import { playerCareerOf, playerSelectionWeight } from '../../game/playerCareer';
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
    const bias = { [career.playerId]: playerSelectionWeight(career) };
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
          <div className="text-xs text-slate-500 mt-1">Play well and start regularly to earn the gaffer’s faith.</div>
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
    </div>
  );
}
