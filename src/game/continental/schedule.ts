// ---------------------------------------------------------------------------
// Continental fixture construction (§ Continental). Pure + deterministic.
//   • Swiss league phase: each club draws N distinct opponents (4 home / 4 away
//     for N=8) via a seeded circular pairing, then the fixtures are greedily
//     edge-coloured into matchdays so no club plays twice on the same day.
//   • Group stage: seeded pots → groups of 4 → double? no, single round-robin.
//   • Knockout: seeded single-leg ties (penalties settle level games) generated
//     one round at a time as the previous phase resolves.
// Match `day`s are assigned by the caller onto interleaved calendar slots.
// ---------------------------------------------------------------------------

import type { Match } from '../../types/match';
import type { Club } from '../../types/club';
import { Rng } from '../../engine/rng';

interface Pair { home: string; away: string }

function stub(
  id: string, competitionId: string, seasonId: string, round: number,
  home: string, away: string, seed: number, stageLabel: string,
): Match {
  return {
    id, competitionId, seasonId, round, day: 0,
    homeClubId: home, awayClubId: away, played: false,
    homeGoals: 0, awayGoals: 0, homeXg: 0, awayXg: 0,
    events: [], playerStats: [], seed, stageLabel,
  };
}

/**
 * Build a Swiss league-phase fixture list: every club plays `games` distinct
 * opponents. Returns matches grouped into matchdays (each an array of pairs),
 * with `day` still 0 — the caller maps matchday index → calendar day.
 */
export function buildSwissLeaguePhase(
  competitionId: string,
  seasonId: string,
  clubIds: string[],
  games: number,
  seed: number,
): { matchdays: Match[][] } {
  const rng = new Rng(seed);
  const clubs = rng.shuffle([...clubIds]);
  const n = clubs.length;
  const half = Math.floor(games / 2);

  // Circular adjacency: club i meets i+1..i+half (home) — each unordered pair
  // once. That gives every club `half` home + `half` away = `games` opponents.
  const pairs: Pair[] = [];
  for (let i = 0; i < n; i++) {
    for (let k = 1; k <= half; k++) {
      const j = (i + k) % n;
      if (i === j) continue;
      pairs.push({ home: clubs[i], away: clubs[j] });
    }
  }

  // Greedy edge-colouring: assign each pair to the lowest matchday where neither
  // club already plays. Guarantees no club appears twice on a matchday.
  const usedDay: Record<string, Set<number>> = {};
  const use = (c: string) => (usedDay[c] ??= new Set());
  const matchdays: Match[][] = [];
  let mSeq = 0;
  for (const p of pairs) {
    let d = 0;
    while (use(p.home).has(d) || use(p.away).has(d)) d++;
    use(p.home).add(d); use(p.away).add(d);
    (matchdays[d] ??= []).push(
      stub(`m_${competitionId}_${seasonId}_lp${d}_${mSeq++}`, competitionId, seasonId, d + 1, p.home, p.away, rng.seedValue(), 'League Phase'),
    );
  }
  return { matchdays: matchdays.filter(Boolean) };
}

/**
 * Draw group-stage fixtures (Club World Cup): seed clubs into 4 pots by
 * reputation, form `nGroups` groups of 4, single round-robin (6 games/group).
 */
export function buildGroupStage(
  competitionId: string,
  seasonId: string,
  clubIds: string[],
  nGroups: number,
  clubs: Record<string, Club>,
  seed: number,
): { groups: string[][]; matchdays: Match[][] } {
  const rng = new Rng(seed);
  const sorted = [...clubIds].sort((a, b) => (clubs[b]?.reputation ?? 0) - (clubs[a]?.reputation ?? 0));
  const pots: string[][] = [];
  for (let k = 0; k < 4; k++) pots.push(rng.shuffle(sorted.slice(k * nGroups, (k + 1) * nGroups)));
  const groups: string[][] = [];
  for (let g = 0; g < nGroups; g++) groups.push([pots[0][g], pots[1][g], pots[2][g], pots[3][g]]);

  // Round-robin of 4: 3 matchdays × (nGroups × 2) matches.
  const rr: [number, number][][] = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];
  const matchdays: Match[][] = [[], [], []];
  let mSeq = 0;
  groups.forEach((grp, gi) => {
    rr.forEach((round, ri) => {
      for (const [i, j] of round) {
        matchdays[ri].push(
          stub(`m_${competitionId}_${seasonId}_g${gi}_${ri}_${mSeq++}`, competitionId, seasonId, ri + 1, grp[i], grp[j], rng.seedValue(), `Group ${String.fromCharCode(65 + gi)}`),
        );
      }
    });
  });
  return { groups, matchdays };
}

/**
 * Seed a single knockout round from an ordered list of survivors (best first).
 * When the field isn't a power of two the top seeds receive byes so the bracket
 * still resolves cleanly; the rest pair top-vs-bottom (higher seed hosts).
 */
export function buildKnockoutRound(
  competitionId: string,
  seasonId: string,
  seeds: string[],
  stageLabel: string,
  roundNo: number,
  seed: number,
): { matches: Match[]; byes: string[] } {
  const rng = new Rng(seed);
  const n = seeds.length;
  if (n <= 1) return { matches: [], byes: seeds };
  // Reduce to the largest power of two strictly below n; top (2p−n) seeds rest.
  const p = 1 << Math.floor(Math.log2(n - 1));
  const byeCount = 2 * p - n; // 0 when n is a power of two
  const byes = seeds.slice(0, byeCount);
  const playing = seeds.slice(byeCount);
  const matches: Match[] = [];
  const half = Math.floor(playing.length / 2);
  for (let i = 0; i < half; i++) {
    const home = playing[i];
    const away = playing[playing.length - 1 - i];
    matches.push(
      stub(`m_${competitionId}_${seasonId}_r${roundNo}_${i}`, competitionId, seasonId, roundNo, home, away, rng.seedValue(), stageLabel),
    );
  }
  return { matches, byes };
}
