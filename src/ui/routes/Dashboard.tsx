import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../state/store';
import { CrestBadge, Rating } from '../components/Rating';
import { formatMoney, formatWage, ageOf, fullName } from '../format';
import { computeStandings } from '../../engine/standings';
import { computeSeasonSummary } from '../../game/seasonReview';
import { buildOppositionReport } from '../../game/oppositionReport';
import { aiManagerOf } from '../../game/aiManagers';
import { matchDate, formatShort, formatFull, currentDate } from '../../game/gameCalendar';

export function Dashboard() {
  const navigate = useNavigate();
  const meta = useGameStore((s) => s.meta)!;
  const club = useGameStore((s) => s.managerClub())!;
  const clubs = useGameStore((s) => s.clubs);
  const players = useGameStore((s) => s.getClubPlayers(club.id));
  const seasonMatches = useGameStore((s) => s.currentSeasonMatches());
  const nextMatch = useGameStore((s) => s.managerNextMatch());
  const answerPress = useGameStore((s) => s.answerPress);
  const transferWindow = useGameStore((s) => s.transferWindow);
  const allPlayers = useGameStore((s) => s.players);
  const complete = useGameStore((s) => s.seasonComplete());
  const [pressToast, setPressToast] = useState<string | null>(null);

  const season = useGameStore((s) => s.currentSeason());
  const currentYear = season?.year ?? meta.startYear;

  const fixtureMaxDay = seasonMatches.reduce((mx, m) => Math.max(mx, m.neutral ? 0 : m.day), 0);
  const comp = Object.values(meta.competitions).find((c) => c.clubIds.includes(club.id))!;
  const table = computeStandings(comp, seasonMatches);
  const position = table.findIndex((r) => r.clubId === club.id) + 1;
  const myRow = table[position - 1];

  const lastResult = [...seasonMatches]
    .filter((m) => m.played && !m.neutral && (m.homeClubId === club.id || m.awayClubId === club.id))
    .sort((a, b) => b.day - a.day)[0];

  const sorted = [...players].sort((a, b) => b.overall - a.overall);
  const squadOvr = Math.round(
    sorted.slice(0, 11).reduce((s, p) => s + p.overall, 0) / Math.min(11, sorted.length || 1),
  );
  const wageTotal = players.reduce((s, p) => s + p.contract.wage, 0);

  const stat = (label: string, value: string) => (
    <div className="card p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </div>
  );

  const opp = (clubId: string) => clubs[clubId];

  const board = meta.board;

  return (
    <div className="space-y-6">
      {meta.pendingPress && (
        <div className="card p-4 border border-accent/40">
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Press conference</div>
          <div className="font-medium mb-3">“{meta.pendingPress.question.prompt}”</div>
          <div className="flex flex-wrap gap-2">
            {meta.pendingPress.question.options.map((o) => (
              <button key={o.tone} className="btn-ghost text-sm" onClick={async () => setPressToast((await answerPress(o.tone)).message)}>
                {o.label}
              </button>
            ))}
          </div>
          {pressToast && <p className="text-sm text-slate-400 mt-3">{pressToast}</p>}
        </div>
      )}

      {meta.sacked && (
        <div className="card p-4 border-red-500 bg-red-500/10 flex items-center justify-between gap-4">
          <div>
            <div className="font-semibold text-red-300">You have been dismissed</div>
            <div className="text-sm text-slate-400">
              {(meta.jobOffers?.length ?? 0) > 0
                ? 'The board terminated your contract — but other clubs are interested. Take a new job to continue your career.'
                : 'The board terminated your contract.'}
            </div>
          </div>
          <button className="btn-primary shrink-0" onClick={() => navigate('/manager')}>
            {(meta.jobOffers?.length ?? 0) > 0 ? 'View job offers ▸' : 'Manager profile ▸'}
          </button>
        </div>
      )}

      {complete && (() => {
        const s = computeSeasonSummary(club.id, seasonMatches, allPlayers);
        const scorer = s.topScorerId ? allPlayers[s.topScorerId] : null;
        const best = s.bestRatedId ? allPlayers[s.bestRatedId] : null;
        return (
          <div className="card p-5 border border-accent/30">
            <h2 className="text-lg font-bold text-white mb-3">Season Review</h2>
            <div className="grid sm:grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-xs text-slate-500">League record</div>
                <div className="text-lg font-semibold">{s.won}W · {s.drawn}D · {s.lost}L</div>
                <div className="text-xs text-slate-400">{s.goalsFor} scored, {s.goalsAgainst} conceded</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Top scorer</div>
                <div className="text-lg font-semibold">{scorer ? fullName(scorer) : '—'}</div>
                <div className="text-xs text-slate-400">{s.topScorerGoals} league goals</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Best performer</div>
                <div className="text-lg font-semibold">{best ? fullName(best) : '—'}</div>
                <div className="text-xs text-slate-400">{best ? `avg rating ${s.bestRating.toFixed(2)}` : ''}</div>
              </div>
            </div>
            {s.biggestWin && (
              <div className="text-xs text-slate-500 mt-3">Biggest win: {s.biggestWin.score} vs {clubs[s.biggestWin.opponentId]?.shortName ?? '—'}.</div>
            )}
          </div>
        );
      })()}

      {board && !meta.sacked && (
        <div className="card p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500">Board objective</div>
            <div className="text-sm">{board.objectiveText} <span className="text-slate-500">(target: {board.targetPosition}{ordinal(board.targetPosition)})</span></div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-500">Job security</div>
            <div className={`font-semibold ${board.confidence < 30 ? 'text-red-400' : board.confidence < 55 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {board.confidence}%
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <CrestBadge abbrev={club.abbrev} color={club.primaryColor} size={44} />
          <div>
            <h1 className="text-2xl font-bold text-white">{club.name}</h1>
            <div className="text-sm text-slate-400">
              {comp.name} · {season?.label} · {club.stadium.name}
            </div>
          </div>
        </div>
        {(() => {
          const today = currentDate(meta, fixtureMaxDay);
          const win = transferWindow();
          return (
            <div className="text-right">
              <div className="text-xs uppercase tracking-wide text-slate-500">Today</div>
              <div className="text-lg font-semibold text-white">📅 {formatFull(today)}</div>
              <div className="text-xs mt-0.5">
                {win.open
                  ? <span className="text-emerald-400">{win.kind === 'WINTER' ? 'January' : 'Summer'} transfer window open</span>
                  : <span className="text-slate-500">Transfer window shut · reopens {win.nextLabel}</span>}
              </div>
            </div>
          );
        })()}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stat('League position', position ? `${position}${ordinal(position)}` : '—')}
        {stat('Points', myRow ? `${myRow.points} (P${myRow.played})` : '—')}
        {stat('Squad XI OVR', String(squadOvr))}
        {stat('Wage bill', formatWage(wageTotal))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-2">Next fixture</h2>
          {nextMatch ? (() => {
            const oppId = nextMatch.homeClubId === club.id ? nextMatch.awayClubId : nextMatch.homeClubId;
            const oppClub = clubs[oppId];
            const oppPlayers = Object.values(allPlayers).filter((p) => p.contract.clubId === oppId);
            const cont = meta.continental?.[nextMatch.competitionId];
            const cup = meta.domesticCups?.[nextMatch.competitionId];
            const report = oppClub && oppPlayers.length ? buildOppositionReport(oppClub, oppPlayers, seasonMatches) : null;
            const oppManager = oppId !== meta.managerClubId ? aiManagerOf(oppId, oppClub, meta.seed, meta.aiManagers) : null;
            return (
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm">vs <strong>{oppClub?.name}</strong></span>
                  <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${nextMatch.homeClubId === club.id ? 'bg-emerald-500/15 text-emerald-300' : 'bg-sky-500/15 text-sky-300'}`}>
                    {nextMatch.homeClubId === club.id ? 'Home' : 'Away'}
                  </span>
                  <span className="text-[10px] uppercase tracking-wide text-slate-500">
                    {cont ? cont.name : cup ? `${cup.name} · ${nextMatch.stageLabel}` : 'League'}
                  </span>
                  <span className="text-[10px] text-slate-500 ml-auto">{formatShort(matchDate(nextMatch, fixtureMaxDay, currentYear, meta))}</span>
                </div>
                {report && (
                  <div className="text-xs text-slate-400 space-y-1 border-t border-surface-700 pt-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-300">Scouting report</span>
                      <span>Strength <span className="font-mono text-white">{report.strength}</span> · Form {report.form}</span>
                    </div>
                    {oppManager && (
                      <p>In the other dugout: <span className="text-slate-300">{oppManager.name}</span>
                        {oppManager.titles > 0 && <span className="text-amber-400/80"> · {oppManager.titles} title{oppManager.titles > 1 ? 's' : ''}</span>}
                        <span className="text-slate-500"> · rep {oppManager.reputation}</span>
                      </p>
                    )}
                    <p>{report.style}</p>
                    <p className="text-amber-300">⚠ {report.threat}</p>
                    <p className="text-emerald-300">✓ {report.weakness}</p>
                    {report.onesToWatch.length > 0 && (
                      <p>Ones to watch: {report.onesToWatch.map((d) => `${d.name} (${d.position} ${d.ovr})`).join(', ')}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })() : (
            <p className="text-sm text-slate-500">Season complete — start the next season.</p>
          )}
        </div>

        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-2">Last result</h2>
          {lastResult ? (
            <button
              className="flex items-center gap-3 hover:underline"
              onClick={() => navigate(`/match/${lastResult.id}`)}
            >
              <span className="text-sm">{opp(lastResult.homeClubId).shortName}</span>
              <span className="font-mono font-bold">
                {lastResult.homeGoals} – {lastResult.awayGoals}
              </span>
              <span className="text-sm">{opp(lastResult.awayClubId).shortName}</span>
            </button>
          ) : (
            <p className="text-sm text-slate-500">No matches played yet.</p>
          )}
        </div>
      </div>

      <div className="card p-4">
        <h2 className="text-sm font-semibold text-slate-400 mb-3">Key players</h2>
        <div className="space-y-2">
          {sorted.slice(0, 5).map((p) => (
            <button
              key={p.id}
              className="w-full flex items-center justify-between hover:bg-surface-700 rounded px-1"
              onClick={() => navigate(`/player/${p.id}`)}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-slate-500 w-8">{p.position}</span>
                <span className="text-sm">{fullName(p)}</span>
                <span className="text-xs text-slate-500">{ageOf(p, currentYear)}y</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xs text-slate-500">{formatMoney(p.value)}</span>
                <Rating value={p.overall} />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] ?? s[v] ?? s[0];
}
