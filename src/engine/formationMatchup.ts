// ---------------------------------------------------------------------------
// Formation matchup matrix (§ Tactics depth). A mild rock-paper-scissors edge
// derived from each shape's central-midfield presence and flank width. Equal
// shapes cancel (edge 1.0), so a same-formation match is unaffected — it only
// tilts mismatches: a packed central midfield edges a lighter one; a wide shape
// stretches a narrow one. Deliberately small — it flavours results, it doesn't
// decide them, and it never touches the base RNG stream (it scales shot volume).
// ---------------------------------------------------------------------------

interface Shape {
  /** Bodies in the central midfield band (CDM/CM/CAM). */
  central: number;
  /** Genuine width — wingers or wide midfielders (0 = narrow). */
  width: number;
}

// Shapes for the eight supported back-four formations. Two strikers or a
// classic front three read as extra central threat via a fuller midfield or a
// congested middle; the diamond is the width outlier (no wide players at all).
const SHAPES: Record<string, Shape> = {
  '4-1-2-1-2': { central: 4, width: 0 }, // narrow diamond — owns the middle, no flanks
  '4-1-4-1':   { central: 3, width: 2 },
  '4-2-3-1':   { central: 3, width: 2 },
  '4-5-1':     { central: 3, width: 2 },
  '4-2-4':     { central: 2, width: 2 },
  '4-3-3':     { central: 3, width: 2 },
  '4-4-1-1':   { central: 3, width: 2 },
  '4-4-2':     { central: 2, width: 2 },
};

const DEFAULT_SHAPE: Shape = { central: 3, width: 2 };
const shapeOf = (f: string): Shape => SHAPES[f] ?? DEFAULT_SHAPE;

/**
 * The shot-volume multiplier `mine` earns against `theirs`. Symmetric by
 * construction (if I gain, they lose the mirror amount), clamped to ±6% so it
 * can never swing a match on its own. Returns exactly 1 for identical shapes.
 */
export function formationMatchup(mine: string, theirs: string): { shotVol: number } {
  const a = shapeOf(mine);
  const b = shapeOf(theirs);
  const edge = 1 + 0.02 * (a.central - b.central) + 0.012 * (a.width - b.width);
  return { shotVol: Math.max(0.94, Math.min(1.06, edge)) };
}
