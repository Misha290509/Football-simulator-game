import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../state/store';

/**
 * Player-career fast-forward. The avatar doesn't pick teams or manage a live
 * match — they advance through fixtures and watch their season unfold. Reuses
 * the same advance engine as manager mode; the personal summary shows on the
 * My Player screen after each step.
 */
export function PlayerPlayMenu() {
  const navigate = useNavigate();
  const meta = useGameStore((s) => s.meta)!;
  const simming = useGameStore((s) => s.simming);
  const advance = useGameStore((s) => s.advanceMatchday);
  const toNext = useGameStore((s) => s.simToNextManagerMatch);
  const toEnd = useGameStore((s) => s.simToSeasonEnd);
  const startNext = useGameStore((s) => s.startNextSeason);
  const beginPlayerMatch = useGameStore((s) => s.beginPlayerMatch);
  const complete = useGameStore((s) => s.seasonComplete());
  const nextMatch = useGameStore((s) => s.managerNextMatch());
  const seasonMatches = useGameStore((s) => s.currentSeasonMatches());
  const stopSim = useGameStore((s) => s.stopSim);

  // Play the avatar's next fixture: interactive if enabled + starting, else sim.
  const playNext = async () => {
    const r = await beginPlayerMatch();
    if (r === 'STARTED') navigate('/play-match');
    else await toNext();
  };

  const clubId = meta.managerClubId;
  const mine = seasonMatches.filter((m) => !m.neutral && (m.homeClubId === clubId || m.awayClubId === clubId));
  const total = mine.length;
  const played = mine.filter((m) => m.played).length;
  const preseason = !complete && played === 0 && !!nextMatch && meta.currentDay < nextMatch.day;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.key === 'n' && !simming && !complete) advance();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance, simming, complete]);

  const label = complete ? 'Season complete' : preseason ? 'Pre-season' : `Match ${Math.min(played + 1, total)} / ${total}`;

  return (
    <div className="flex items-center gap-2 w-max" role="toolbar" aria-label="Play controls">
      <span className="notch font-display uppercase tracking-wider text-[11px] text-accent bg-accent/10 border border-accent/25 px-2.5 py-1 mr-1 whitespace-nowrap">{label}</span>
      {complete ? (
        <button className="btn-primary" disabled={simming} onClick={() => startNext()}>{simming ? 'Processing…' : 'Start Next Season ▸'}</button>
      ) : simming ? (
        <button className="btn-ghost text-rose-300" onClick={() => stopSim()}>■ Stop</button>
      ) : (
        <>
          <button className="btn-ghost" onClick={() => advance()}>{preseason ? 'Advance Day' : 'Advance'}</button>
          <button className="btn-primary" disabled={!nextMatch} onClick={() => (preseason ? toNext() : playNext())}>{preseason ? 'Skip to opening day ▸' : 'Play Next Match ▸'}</button>
          <button className="btn-ghost" onClick={() => toEnd()}>To Season End ⏩</button>
        </>
      )}
    </div>
  );
}
