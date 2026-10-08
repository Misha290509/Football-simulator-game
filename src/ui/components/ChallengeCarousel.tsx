import { useRef, useState, type KeyboardEvent, type TouchEvent } from 'react';
import type { ChallengeDef } from '../../game/challenges';

interface Props {
  challenges: ChallengeDef[];
  selectedId: string | null;
  /** Called with the challenge's id to pick it, or null to clear the pick. */
  onSelect: (id: string | null) => void;
}

/** A horizontal swipe shorter than this is a tap, not a scroll. */
const SWIPE_THRESHOLD = 40;

/**
 * One challenge at a time, with arrows (or a swipe, or the arrow keys) to move
 * between them. Tapping the card picks it; tapping the picked card clears it.
 */
export function ChallengeCarousel({ challenges, selectedId, onSelect }: Props) {
  const [index, setIndex] = useState(() => {
    const picked = challenges.findIndex((c) => c.id === selectedId);
    return picked >= 0 ? picked : 0;
  });
  const touchStartX = useRef<number | null>(null);

  if (challenges.length === 0) return null;

  const count = challenges.length;

  // Wraps around, so the last challenge leads back to the first.
  const go = (step: number) => setIndex((i) => (i + step + count) % count);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(1);
    }
  };

  const onTouchStart = (e: TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: TouchEvent) => {
    const start = touchStartX.current;
    touchStartX.current = null;
    const end = e.changedTouches[0]?.clientX;
    if (start === null || end === undefined) return;
    const dx = end - start;
    if (Math.abs(dx) >= SWIPE_THRESHOLD) go(dx < 0 ? 1 : -1);
  };

  const arrow =
    'shrink-0 w-9 h-9 flex items-center justify-center rounded-full border border-surface-600 text-slate-300 hover:bg-surface-700 hover:text-white transition-colors';

  return (
    <div
      role="group"
      aria-roledescription="carousel"
      aria-label="Challenges"
      onKeyDown={onKeyDown}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="flex items-center gap-2">
        <button type="button" className={arrow} onClick={() => go(-1)} aria-label="Previous challenge">
          <Chevron direction="left" />
        </button>

        {/* Every card sits in the same grid cell, so the carousel is as tall as
            the longest challenge and the arrows stay put while you scroll. Only
            the current one is visible or reachable. */}
        <div className="grid flex-1 min-w-0">
          {challenges.map((c, i) => {
            const shown = i === index;
            const picked = selectedId === c.id;
            return (
              <button
                type="button"
                key={c.id}
                onClick={() => onSelect(picked ? null : c.id)}
                aria-pressed={shown ? picked : undefined}
                aria-hidden={!shown}
                tabIndex={shown ? 0 : -1}
                aria-label={`${c.name}, challenge ${i + 1} of ${count}`}
                className={`col-start-1 row-start-1 text-left p-4 rounded-lg border transition-colors ${
                  shown ? '' : 'invisible'
                } ${picked ? 'border-accent bg-accent/10' : 'border-surface-600 hover:bg-surface-700'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-display font-semibold uppercase tracking-wide text-white text-lg">{c.name}</div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 shrink-0 mt-1.5">
                    {i + 1} / {count}
                  </div>
                </div>
                <div className="text-xs text-accent-400 mb-1">{c.tagline}</div>
                <div className="text-xs text-slate-400">{c.brief}</div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-2">
                  {c.difficulty.toLowerCase()} · {c.seasons} season{c.seasons > 1 ? 's' : ''}
                  {c.rule === 'NO_SIGNINGS' ? ' · no signings' : ''}
                </div>
                <div className={`text-[11px] font-semibold uppercase tracking-wider mt-3 ${picked ? 'text-accent-400' : 'text-slate-500'}`}>
                  {picked ? '✓ Selected — tap to clear' : 'Tap to select'}
                </div>
              </button>
            );
          })}
        </div>

        <button type="button" className={arrow} onClick={() => go(1)} aria-label="Next challenge">
          <Chevron direction="right" />
        </button>
      </div>

      <div className="flex justify-center gap-1.5 mt-3">
        {challenges.map((c, i) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Show ${c.name}`}
            aria-current={i === index}
            className={`h-1.5 rounded-full transition-all ${
              i === index ? 'w-5 bg-accent' : c.id === selectedId ? 'w-1.5 bg-accent/60' : 'w-1.5 bg-surface-600 hover:bg-slate-500'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d={direction === 'left' ? 'M10 3 5 8l5 5' : 'M6 3l5 5-5 5'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
