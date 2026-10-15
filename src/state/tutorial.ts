import { create } from 'zustand';

// ---------------------------------------------------------------------------
// The manager-career tutorial: which step you're on, and whether you've been
// through it before. Kept apart from the save, because it's about the person
// playing, not the career — a second career shouldn't make you sit through it
// again, and finishing it in one save counts for all of them.
// ---------------------------------------------------------------------------

const DONE_KEY = 'fgm.tutorial.done';

function readDone(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeDone(): void {
  try {
    localStorage.setItem(DONE_KEY, '1');
  } catch {
    // Private browsing or storage blocked: it just offers itself again.
  }
}

interface TutorialState {
  active: boolean;
  step: number;
  /** Finished or skipped at least once, in this browser. */
  done: boolean;
  start: () => void;
  goTo: (step: number) => void;
  /** Close it, and remember it's been seen. */
  finish: () => void;
}

export const useTutorial = create<TutorialState>((set) => ({
  active: false,
  step: 0,
  done: readDone(),
  start: () => set({ active: true, step: 0 }),
  goTo: (step) => set({ step }),
  finish: () => {
    writeDone();
    set({ active: false, step: 0, done: true });
  },
}));
