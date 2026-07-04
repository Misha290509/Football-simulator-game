import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../state/store';

/** Granular fast-forward controls (§3, §10). Auto-stops at the season end.
 *  Keyboard: "n" advances a matchday when not typing in a field. */
export function PlayMenu() {
  const navigate = useNavigate();
  const meta = useGameStore((s) => s.meta)!;
  const simming = useGameStore((s) => s.simming);
  const advance = useGameStore((s) => s.advanceMatchday);
  const toNext = useGameStore((s) => s.simToNextManagerMatch);
  const toEnd = useGameStore((s) => s.simToSeasonEnd);
  const startNext = useGameStore((s) => s.startNextSeason);
  const beginLiveMatch = useGameStore((s) => s.beginLiveMatch);
  const complete = useGameStore((s) => s.seasonComplete());
  const nextMatch = useGameStore((s) => s.managerNextMatch());
  const seasonMatches = useGameStore((s) => s.currentSeasonMatches());

  // Count the manager's own fixtures this season (all competitions), so the
  // label reads "games played / total" rather than a raw calendar-day index.
  const mine = seasonMatches.filter(
    (m) => !m.neutral && (m.homeClubId === meta.managerClubId || m.awayClubId === meta.managerClubId),
  );
  const totalMatches = mine.length;
  const playedMatches = mine.filter((m) => m.played).length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.key === 'n' && !simming && !complete) advance();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance, simming, complete]);

  const dayLabel = complete
    ? 'Season complete'
    : `Match ${Math.min(playedMatches + 1, totalMatches)} / ${totalMatches}`;

  return (
    <div className="flex items-center gap-2" role="toolbar" aria-label="Play controls">
      <span className="text-xs text-slate-500 mr-2 whitespace-nowrap">{dayLabel}</span>
      {complete ? (
        <button className="btn-primary" disabled={simming} onClick={() => startNext()}>
          {simming ? 'Processing…' : 'Start Next Season ▸'}
        </button>
      ) : (
        <>
          <button className="btn-ghost" disabled={simming} onClick={() => advance()}>
            Advance Matchday
          </button>
          <button
            className="btn-ghost"
            disabled={simming || !nextMatch}
            onClick={() => toNext()}
            title="Fast-forward to your next fixture"
          >
            To Next Match
          </button>
          <button
            className="btn-primary"
            disabled={simming || !nextMatch}
            onClick={async () => { if (await beginLiveMatch()) navigate('/live'); }}
            title="Watch your next match live and manage it in real time"
          >
            ▶ Watch Live
          </button>
          <button className="btn-primary" disabled={simming} onClick={() => toEnd()}>
            {simming ? 'Simulating…' : 'To Season End ⏩'}
          </button>
        </>
      )}
    </div>
  );
}
