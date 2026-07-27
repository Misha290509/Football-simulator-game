import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../state/store';
import { playerCareerOf } from '../../game/playerCareer';
import {
  careerTotals, seasonSeries, bestSeason, leaderboard, avatarRank,
  highlightReel, headToHead, buildCareerCard,
} from '../../game/careerStats';
import { ratingColor } from '../format';

type Metric = 'goals' | 'assists' | 'rating';
const METRIC_LABEL: Record<Metric, string> = { goals: 'Goals', assists: 'Assists', rating: 'Avg rating' };

/**
 * The record — everything he's actually done, made legible. A personal
 * dashboard, where he ranks among his peers, the moments worth keeping, how he
 * fares against each club, and the shareable card of who he was.
 */
export function CareerStats() {
  const navigate = useNavigate();
  const meta = useGameStore((s) => s.meta);
  const players = useGameStore((s) => s.players);
  const clubs = useGameStore((s) => s.clubs);
  const season = useGameStore((s) => s.currentSeason());
  const career = playerCareerOf(meta);
  const p = career ? players[career.playerId] : undefined;
  const [metric, setMetric] = useState<Metric>('goals');

  const rows = useMemo(() => {
    if (!career || !p) return [];
    return leaderboard(Object.values(players), clubs, season?.id, metric, career.playerId);
  }, [players, clubs, season, metric, career, p]);

  if (!meta || !career || !p) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-slate-400">This save isn’t a player career.</p>
        <button className="btn-primary" onClick={() => navigate('/dashboard')}>Go to dashboard</button>
      </div>
    );
  }

  const totals = careerTotals(career);
  const series = seasonSeries(career);
  const best = bestSeason(career);
  const reel = highlightReel(career);
  const h2h = headToHead(career).slice(0, 8);
  const year = season?.year ?? meta.startYear;
  const card = buildCareerCard(career, p, clubs[p.contract.clubId ?? '']?.name ?? '', year);
  const rank = avatarRank(rows, career.playerId);
  const maxSeasonValue = Math.max(1, ...series.map((s) => s.goals + s.assists));

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <h1 className="page-title">Career Stats</h1>

      {/* The card */}
      <div className="card p-5 border border-accent/30 bg-gradient-to-br from-accent/10 to-transparent">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-2xl font-bold text-white truncate">{card.name}</div>
            <div className="text-sm text-slate-400">{card.position} · {card.age} · {card.club || 'Free agent'}</div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {card.identity.map((t) => (
                <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-surface-700 text-slate-300 border border-surface-600">{t}</span>
              ))}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">OVR</div>
            <div className={`text-3xl font-bold ${ratingColor(card.overall)}`}>{card.overall}</div>
          </div>
        </div>
        <p className="text-sm text-accent-200 italic mt-3">“{card.verdict}”</p>
      </div>

      {/* Headline totals */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Appearances" value={`${totals.apps}`} />
        <Stat label="Goals" value={`${totals.goals}`} />
        <Stat label="Assists" value={`${totals.assists}`} />
        <Stat label="Avg rating" value={totals.avgRating ? totals.avgRating.toFixed(2) : '—'} />
        <Stat label="Seasons" value={`${totals.seasons}`} />
        <Stat label="Clubs" value={`${totals.clubs}`} />
        <Stat label="Honours" value={`${totals.honours}`} />
        <Stat label="G+A per game" value={totals.contributionsPerApp.toFixed(2)} />
      </div>

      {/* Season by season */}
      {series.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-400">Season by season</h2>
            {best && <span className="text-[11px] text-slate-500">Best: {best.season} ({best.goals}G {best.assists}A)</span>}
          </div>
          <div className="space-y-1.5">
            {series.map((s) => (
              <div key={s.season} className="flex items-center gap-2 text-xs">
                <span className="w-16 shrink-0 text-slate-400">{s.season}</span>
                <span className="w-24 shrink-0 text-slate-500 truncate">{s.club}</span>
                <div className="flex-1 h-3 rounded bg-surface-700 overflow-hidden flex">
                  <div className="h-full bg-emerald-500" style={{ width: `${(s.goals / maxSeasonValue) * 100}%` }} title={`${s.goals} goals`} />
                  <div className="h-full bg-sky-500" style={{ width: `${(s.assists / maxSeasonValue) * 100}%` }} title={`${s.assists} assists`} />
                </div>
                <span className="w-10 text-right font-mono text-slate-400">{s.apps}a</span>
                <span className={`w-10 text-right font-mono ${ratingColor((s.rating || 6) * 10)}`}>{s.rating ? s.rating.toFixed(1) : '—'}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-2 text-[10px] text-slate-500">
            <span><span className="inline-block w-2 h-2 rounded-sm bg-emerald-500 mr-1" />Goals</span>
            <span><span className="inline-block w-2 h-2 rounded-sm bg-sky-500 mr-1" />Assists</span>
          </div>
        </div>
      )}

      {/* Leaderboard */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-400">This season’s leaders</h2>
          <div className="flex gap-1">
            {(['goals', 'assists', 'rating'] as Metric[]).map((m) => (
              <button key={m} onClick={() => setMetric(m)}
                className={`text-[11px] px-2 py-1 rounded ${metric === m ? 'bg-accent/20 text-accent-200' : 'text-slate-500 hover:bg-surface-700'}`}>
                {METRIC_LABEL[m]}
              </button>
            ))}
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="text-xs text-slate-500">No numbers on the board yet this season.</p>
        ) : (
          <>
            {rank > 0 && <div className="text-[11px] text-accent-300 mb-2">You’re #{rank} for {METRIC_LABEL[metric].toLowerCase()}.</div>}
            <div className="space-y-1">
              {rows.map((r, i) => (
                <div key={r.playerId} className={`flex items-center gap-2 text-sm px-2 py-1 rounded ${r.isAvatar ? 'bg-accent/10 border border-accent/30' : ''}`}>
                  <span className="w-6 text-right font-mono text-slate-600">{i + 1}</span>
                  <span className={`flex-1 truncate ${r.isAvatar ? 'text-accent-200 font-medium' : 'text-slate-300'}`}>{r.name}</span>
                  <span className="text-[11px] text-slate-500 w-16 truncate">{r.club}</span>
                  <span className="font-mono text-white w-10 text-right">{metric === 'rating' ? r.value.toFixed(2) : r.value}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {/* Highlight reel */}
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-2">🎬 Highlight reel</h2>
          {reel.length === 0 ? (
            <p className="text-xs text-slate-500">No moments saved yet — go and make some.</p>
          ) : (
            <ul className="space-y-1.5 max-h-64 overflow-y-auto">
              {reel.map((h, i) => (
                <li key={i} className="text-xs text-slate-300">⭐ {h.text}</li>
              ))}
            </ul>
          )}
        </div>

        {/* Head to head */}
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-2">⚔️ Against each club</h2>
          {h2h.length === 0 ? (
            <p className="text-xs text-slate-500">No history yet.</p>
          ) : (
            <div className="space-y-1">
              {h2h.map((r) => (
                <div key={r.club} className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 truncate flex-1">{r.club}</span>
                  <span className="text-slate-500 w-16 text-right">{r.games}g · {r.goals}⚽</span>
                  <span className={`font-mono w-10 text-right ${ratingColor(r.avgRating * 10)}`}>{r.avgRating.toFixed(1)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Honours */}
      {card.honours.length > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-2">🏆 Honours</h2>
          <div className="flex flex-wrap gap-1.5">
            {card.honours.map((h) => (
              <span key={h} className="text-[11px] px-2 py-1 rounded bg-amber-500/10 text-amber-300 border border-amber-500/25">{h}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-xl font-bold text-white tabular-nums">{value}</div>
    </div>
  );
}
