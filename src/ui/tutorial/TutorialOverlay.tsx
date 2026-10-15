import { useEffect, useLayoutEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTutorial } from '../../state/tutorial';
import { TUTORIAL_STEPS } from './steps';

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** A target counts only if it's actually on screen: the menu is hidden off-canvas on a phone. */
function visibleBox(el: Element | null): Box | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return null;
  if (r.right <= 0 || r.left >= window.innerWidth) return null;
  const pad = 6;
  return { top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 };
}

/**
 * The guided tour. Opens each step's screen, highlights the part it is about,
 * and keeps a card with the explanation and Back / Next / Skip at the bottom of
 * the screen. The highlight never blocks the page, so you can try things as
 * you go; wandering off doesn't break it, and Next carries on from the step you
 * were on.
 */
export function TutorialOverlay() {
  const { active, step, goTo, finish } = useTutorial();
  const navigate = useNavigate();
  const location = useLocation();
  const [box, setBox] = useState<Box | null>(null);

  const current = TUTORIAL_STEPS[step];
  const last = step === TUTORIAL_STEPS.length - 1;

  // Open the step's screen when the step changes — not on every navigation, so
  // you can click around without being dragged back.
  useEffect(() => {
    if (!active || !current) return;
    if (location.pathname !== current.route) navigate(current.route);
  }, [active, step]);

  // Find the target, scroll it into view, and follow it as the page moves.
  // Screens load lazily, so keep looking for a few seconds before giving up.
  useLayoutEffect(() => {
    setBox(null);
    if (!active || !current?.target || location.pathname !== current.route) return;
    const selector = current.target;
    let frame = 0;
    let scrolled = false;
    const startedAt = performance.now();
    const tick = () => {
      const el = document.querySelector(selector);
      if (el && !scrolled) {
        // To the top of the screen, clear of the card at the bottom.
        el.scrollIntoView({ block: 'start', behavior: 'smooth' });
        scrolled = true;
      }
      const next = visibleBox(el);
      setBox((prev) =>
        prev && next && prev.top === next.top && prev.left === next.left && prev.width === next.width && prev.height === next.height
          ? prev
          : next,
      );
      if (el || performance.now() - startedAt < 4000) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, step, current, location.pathname]);

  // Arrow keys and Escape, like any other walkthrough.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); if (last) finish(); else goTo(step + 1); }
      else if (e.key === 'ArrowLeft' && step > 0) { e.preventDefault(); goTo(step - 1); }
      else if (e.key === 'Escape') finish();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, step, last, goTo, finish]);

  if (!active || !current) return null;

  return (
    <>
      {/* Dim everything except the highlighted part. Clicks pass straight through. */}
      {box ? (
        <div
          aria-hidden
          data-tour-highlight
          className="fixed z-[75] rounded-lg outline outline-2 outline-accent-400 pointer-events-none transition-all duration-200"
          style={{ ...box, boxShadow: '0 0 0 9999px rgba(5, 8, 15, 0.6)' }}
        />
      ) : (
        <div aria-hidden className="fixed inset-0 z-[75] bg-[rgba(5,8,15,0.45)] pointer-events-none" />
      )}

      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby="tutorial-title"
        className="fixed z-[80] left-3 right-3 bottom-3 md:left-auto md:right-6 md:bottom-6 md:w-[26rem] safe-b"
      >
        <div className="card p-4 border border-accent/40 shadow-2xl">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-[10px] uppercase tracking-widest text-accent-400">
              Tutorial · {step + 1} of {TUTORIAL_STEPS.length}
            </span>
            <button type="button" className="text-xs text-slate-500 hover:text-white" onClick={finish}>
              Skip tutorial
            </button>
          </div>
          <h2 id="tutorial-title" className="font-display font-semibold uppercase tracking-wide text-white text-lg leading-tight">
            {current.title}
          </h2>
          <p className="text-sm text-slate-300 mt-1.5 leading-relaxed">{current.body}</p>

          <div className="h-1 bg-surface-700 rounded-full mt-3 overflow-hidden">
            <div className="h-1 bg-accent rounded-full transition-all" style={{ width: `${((step + 1) / TUTORIAL_STEPS.length) * 100}%` }} />
          </div>

          <div className="flex items-center justify-between gap-2 mt-3">
            <button type="button" className="btn-ghost text-sm disabled:opacity-40" disabled={step === 0} onClick={() => goTo(step - 1)}>
              ← Back
            </button>
            <button type="button" className="btn-primary text-sm" onClick={() => (last ? finish() : goTo(step + 1))}>
              {last ? 'Finish' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
