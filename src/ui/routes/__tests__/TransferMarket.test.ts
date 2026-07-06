import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Testing approach
// ---------------------------------------------------------------------------
// TransferMarket.tsx is a React route component with no existing component-
// test precedent anywhere in this repo (no jsdom/@testing-library/react in
// devDependencies, no vitest `environment` configured, no other file under
// src/ui has a __tests__ dir). Every existing __tests__ suite in this
// codebase (src/engine, src/game, src/state, src/db) unit-tests pure
// functions/logic rather than rendering components. Adding a new heavy
// component-testing dependency chain for a single checkbox predicate would
// be inconsistent with the repo's conventions and out of scope for this
// change (the spec explicitly says "no new dependencies").
//
// So this suite:
//   1. Unit-tests the `hideExpiring` predicate and its composition with the
//      `avail` filter as a standalone, pure re-implementation that is
//      *character-for-character* the same boolean expression used in
//      TransferMarket.tsx's `rows` useMemo (see predicate functions below).
//   2. Cross-checks that re-implementation against the real source file's
//      text so the two can't silently drift apart (source-verification
//      tests) — this substitutes for mounting the component and exercising
//      the actual `useMemo` when a DOM/render environment isn't available.
//
// Together these give behavioural coverage of every spec test-plan scenario
// (1-12) without needing to render the component.

const SRC_PATH = path.join(__dirname, '../TransferMarket.tsx');
const src = fs.readFileSync(SRC_PATH, 'utf8');

type MinimalPlayer = { contract: { clubId: string | null; expiresYear: number } };

/** Verbatim re-implementation of the predicate added to the `rows` useMemo:
 *  `if (hideExpiring && p.contract.clubId && p.contract.expiresYear - year <= 0) continue;`
 *  Returns true when the player would be DROPPED (hidden) by this filter. */
function isHiddenByHideExpiring(p: MinimalPlayer, year: number, hideExpiring: boolean): boolean {
  return !!(hideExpiring && p.contract.clubId && p.contract.expiresYear - year <= 0);
}

/** Verbatim re-implementation of the existing `avail === 'EXPIRING'` guard:
 *  `if (avail === 'EXPIRING' && !(p.contract.clubId && p.contract.expiresYear - year <= 1)) continue;` */
function isHiddenByAvailExpiring(p: MinimalPlayer, year: number, avail: string): boolean {
  return avail === 'EXPIRING' && !(p.contract.clubId && p.contract.expiresYear - year <= 1);
}

/** Verbatim re-implementation of the existing `avail === 'FREE'` guard:
 *  `if (avail === 'FREE' && p.contract.clubId) continue;` */
function isHiddenByAvailFree(p: MinimalPlayer, avail: string): boolean {
  return avail === 'FREE' && !!p.contract.clubId;
}

/** Simulates the sequential AND-composition of all three checks, matching
 *  the order they appear in the real `for` loop (avail checks before the
 *  hideExpiring check). Returns true if the player survives (is shown). */
function isShown(p: MinimalPlayer, year: number, opts: { avail?: string; hideExpiring?: boolean } = {}): boolean {
  const avail = opts.avail ?? 'ALL';
  const hideExpiring = opts.hideExpiring ?? false;
  if (isHiddenByAvailFree(p, avail)) return false;
  if (isHiddenByAvailExpiring(p, year, avail)) return false;
  if (isHiddenByHideExpiring(p, year, hideExpiring)) return false;
  return true;
}

const YEAR = 2026;

const mkContracted = (expiresYear: number): MinimalPlayer => ({ contract: { clubId: 'club-1', expiresYear } });
const mkFreeAgent = (expiresYear: number): MinimalPlayer => ({ contract: { clubId: null, expiresYear } });

describe('TransferMarket — hideExpiring predicate (spec test plan 1-9, 11-12)', () => {
  // 1. Default off: a contracted player expiring this season is present (not hidden).
  it('1. filter off (default) never hides an expiring-this-season player', () => {
    const p = mkContracted(YEAR);
    expect(isHiddenByHideExpiring(p, YEAR, false)).toBe(false);
    expect(isShown(p, YEAR, { hideExpiring: false })).toBe(true);
  });

  // 2. Hide on, expires this season -> hidden.
  it('2. filter on hides a player whose contract expires this season (expiresYear === year)', () => {
    const p = mkContracted(YEAR);
    expect(isHiddenByHideExpiring(p, YEAR, true)).toBe(true);
    expect(isShown(p, YEAR, { hideExpiring: true })).toBe(false);
  });

  // 3. Hide on, lapsed contract (expiresYear === year - 1) -> hidden.
  it('3. filter on hides an already-lapsed contract (expiresYear < year)', () => {
    const p = mkContracted(YEAR - 1);
    expect(isHiddenByHideExpiring(p, YEAR, true)).toBe(true);
    expect(isShown(p, YEAR, { hideExpiring: true })).toBe(false);
  });

  // 4. Hide on, expires next season (expiresYear === year + 1) -> present.
  it('4. filter on does NOT hide a player expiring next season (expiresYear === year + 1)', () => {
    const p = mkContracted(YEAR + 1);
    expect(isHiddenByHideExpiring(p, YEAR, true)).toBe(false);
    expect(isShown(p, YEAR, { hideExpiring: true })).toBe(true);
  });

  // 5. Hide on, multi-year contract (expiresYear === year + 3) -> present.
  it('5. filter on does NOT hide a multi-year contract (expiresYear === year + 3)', () => {
    const p = mkContracted(YEAR + 3);
    expect(isHiddenByHideExpiring(p, YEAR, true)).toBe(false);
    expect(isShown(p, YEAR, { hideExpiring: true })).toBe(true);
  });

  // 6. Hide on, free agent (any expiresYear) -> never hidden.
  it('6. filter on never hides a free agent, even with expiresYear === year', () => {
    const pThisYear = mkFreeAgent(YEAR);
    const pLapsed = mkFreeAgent(YEAR - 5);
    expect(isHiddenByHideExpiring(pThisYear, YEAR, true)).toBe(false);
    expect(isHiddenByHideExpiring(pLapsed, YEAR, true)).toBe(false);
    expect(isShown(pThisYear, YEAR, { hideExpiring: true })).toBe(true);
    expect(isShown(pLapsed, YEAR, { hideExpiring: true })).toBe(true);
  });

  // 7. Boundary: this-season vs next-season, filter on -> only +1 remains.
  it('7. boundary: with filter on, expiresYear===year is hidden and expiresYear===year+1 remains', () => {
    const thisSeason = mkContracted(YEAR);
    const nextSeason = mkContracted(YEAR + 1);
    const survivors = [thisSeason, nextSeason].filter((p) => isShown(p, YEAR, { hideExpiring: true }));
    expect(survivors).toEqual([nextSeason]);
  });

  // 8. Compose with avail === 'EXPIRING': this-season hidden, next-season (<=1y) remains.
  it('8. composes with avail=EXPIRING as AND: narrows to exactly "expires next season"', () => {
    const thisSeason = mkContracted(YEAR); // -year === 0, within EXPIRING's <=1 but hidden by hideExpiring
    const nextSeason = mkContracted(YEAR + 1); // -year === 1, within EXPIRING's <=1, survives hideExpiring
    const beyond = mkContracted(YEAR + 2); // -year === 2, excluded by EXPIRING itself

    expect(isShown(thisSeason, YEAR, { avail: 'EXPIRING', hideExpiring: true })).toBe(false);
    expect(isShown(nextSeason, YEAR, { avail: 'EXPIRING', hideExpiring: true })).toBe(true);
    expect(isShown(beyond, YEAR, { avail: 'EXPIRING', hideExpiring: true })).toBe(false);
  });

  // 9. Compose with avail === 'FREE': result unaffected by hideExpiring (free agents only, unaffected).
  it('9. composes with avail=FREE as a no-op: free-agent result set is identical with hideExpiring on or off', () => {
    const players = [mkFreeAgent(YEAR), mkFreeAgent(YEAR - 3), mkFreeAgent(YEAR + 10), mkContracted(YEAR)];
    const withoutHide = players.filter((p) => isShown(p, YEAR, { avail: 'FREE', hideExpiring: false }));
    const withHide = players.filter((p) => isShown(p, YEAR, { avail: 'FREE', hideExpiring: true }));
    expect(withHide).toEqual(withoutHide);
    // Sanity: FREE already excludes the contracted player regardless of hideExpiring.
    expect(withHide).toHaveLength(3);
  });

  // 11. Counter updates: rows.length decreases by exactly the number of hidden
  // this-season contracted players when the filter is toggled on.
  it('11. shown count decreases by exactly the number of newly-hidden this-season contracted players', () => {
    const players = [
      mkContracted(YEAR), // hidden when on
      mkContracted(YEAR - 2), // hidden when on (lapsed)
      mkContracted(YEAR + 1), // stays
      mkContracted(YEAR + 5), // stays
      mkFreeAgent(YEAR), // stays (free agent)
    ];
    const countOff = players.filter((p) => isShown(p, YEAR, { hideExpiring: false })).length;
    const countOn = players.filter((p) => isShown(p, YEAR, { hideExpiring: true })).length;
    expect(countOff).toBe(5);
    expect(countOn).toBe(3);
    expect(countOff - countOn).toBe(2); // exactly the two this-season/lapsed contracted players
  });

  // 12. No crash on empty result: every visible player expires this season -> empty array, no throw.
  it('12. filtering a dataset where every player expires this season yields an empty array without throwing', () => {
    const players = [mkContracted(YEAR), mkContracted(YEAR), mkContracted(YEAR - 1)];
    let result: MinimalPlayer[] = [];
    expect(() => {
      result = players.filter((p) => isShown(p, YEAR, { hideExpiring: true }));
    }).not.toThrow();
    expect(result).toEqual([]);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Source-verification: guards against the extracted predicate above drifting
// away from the real implementation, and covers the wiring the pure-logic
// tests above can't reach (state declaration, Reset behaviour, dependency
// array, and the rendered checkbox) — see spec test-plan scenario 10.
// ---------------------------------------------------------------------------
describe('TransferMarket.tsx source wiring (scenario 10 + drift guard)', () => {
  it('declares hideExpiring state defaulting to false', () => {
    expect(src).toMatch(/const \[hideExpiring, setHideExpiring\] = useState\(false\);/);
  });

  it('contains the exact hideExpiring predicate this suite re-implements', () => {
    expect(src).toContain(
      "if (hideExpiring && p.contract.clubId && p.contract.expiresYear - year <= 0) continue;",
    );
  });

  it('contains the exact avail === EXPIRING predicate this suite re-implements', () => {
    expect(src).toContain(
      "if (avail === 'EXPIRING' && !(p.contract.clubId && p.contract.expiresYear - year <= 1)) continue;",
    );
  });

  it('contains the exact avail === FREE predicate this suite re-implements', () => {
    expect(src).toContain("if (avail === 'FREE' && p.contract.clubId) continue;");
  });

  it('includes hideExpiring in the rows useMemo dependency array (recomputes on toggle)', () => {
    const depsMatch = src.match(/}, \[players, meta\.managerClubId,[^\]]*\]\);/);
    expect(depsMatch).not.toBeNull();
    expect(depsMatch![0]).toContain('hideExpiring');
  });

  it('resetFilters clears hideExpiring back to false (scenario 10)', () => {
    const resetMatch = src.match(/const resetFilters = \(\) => \{[\s\S]*?\};/);
    expect(resetMatch).not.toBeNull();
    expect(resetMatch![0]).toContain('setHideExpiring(false)');
  });

  it('renders a "Hide expiring this season" checkbox matching the existing checkbox markup', () => {
    expect(src).toContain(
      '<label className="flex items-center gap-2"><input type="checkbox" checked={hideExpiring} onChange={(e) => setHideExpiring(e.target.checked)} /><span className="text-slate-400">Hide expiring this season</span></label>',
    );
  });

  it('places the new checkbox after "Firm reads only" and before the Reset button (per spec placement)', () => {
    const firmIdx = src.indexOf('Firm reads only');
    const hideIdx = src.indexOf('Hide expiring this season');
    const resetIdx = src.indexOf('onClick={resetFilters}');
    expect(firmIdx).toBeGreaterThan(-1);
    expect(hideIdx).toBeGreaterThan(firmIdx);
    expect(resetIdx).toBeGreaterThan(hideIdx);
  });
});
