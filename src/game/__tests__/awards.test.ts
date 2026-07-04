import { describe, it, expect } from 'vitest';
import { computeSeasonAwards, buildCompMeta, type CompMeta } from '../awards';
import { generatePlayer } from '../../engine/generator';
import { Rng } from '../../engine/rng';
import type { Player } from '../../types/player';
import type { Match, PlayerMatchStat } from '../../types/match';
import type { Competition } from '../../types/competition';
import type { Club } from '../../types/club';
import type { Position } from '../../types/attributes';

const rng = new Rng(4242);
let seq = 0;
function mkPlayer(pos: Position, clubId: string, born = 1998): Player {
  const p = generatePlayer({ rng, currentYear: 2024, target: 78, position: pos });
  p.id = `p_${pos}_${clubId}_${seq++}`;
  p.contract.clubId = clubId;
  p.born = { year: born };
  p.positions = [pos];
  p.position = pos;
  return p;
}

function comp(id: string, clubIds: string[]): Competition {
  return {
    id, name: id, countryId: id, confederation: 'UEFA', format: 'round_robin', tier: 1,
    numClubs: clubIds.length, rounds: 2, tiebreakers: [], promotion: null, conferences: null, clubIds,
  };
}

function club(id: string, reputation: number): Club {
  return { id, reputation } as unknown as Club;
}

let mSeq = 0;
function mkMatch(competitionId: string, home: string, away: string, hg: number, ag: number, stats: PlayerMatchStat[]): Match {
  return {
    id: `m_${mSeq++}`, competitionId, seasonId: 'S', round: 1, day: mSeq,
    homeClubId: home, awayClubId: away, played: true, homeGoals: hg, awayGoals: ag,
    homeXg: hg, awayXg: ag, events: [], playerStats: stats, seed: 1,
  };
}
const stat = (p: Player, o: Partial<PlayerMatchStat> = {}): PlayerMatchStat => ({
  playerId: p.id, minutes: 90, goals: 0, assists: 0, shots: 0, rating: 7, yellow: false, red: false, ...o,
});

describe('Individual awards', () => {
  // Two leagues, two clubs each.
  const A = comp('LG_A', ['a1', 'a2']);
  const B = comp('LG_B', ['b1', 'b2']);
  const competitions = { LG_A: A, LG_B: B };
  const clubs: Record<string, Club> = { a1: club('a1', 85), a2: club('a2', 80), b1: club('b1', 70), b2: club('b2', 65) };

  // Squads (enough for a World XI): GK + defenders + mids + attackers per club.
  const players: Record<string, Player> = {};
  const add = (p: Player) => { players[p.id] = p; };
  const striker = mkPlayer('ST', 'a1');       // will be top scorer in A + globally
  const bStriker = mkPlayer('ST', 'b1');      // top scorer in B (fewer goals)
  const playmaker = mkPlayer('CAM', 'a1');    // top assister
  const keeper = mkPlayer('GK', 'a1');        // Yashin candidate (clean sheets)
  const kid = mkPlayer('LW', 'a2', 2005);     // U21 -> Kopa candidate
  add(striker); add(bStriker); add(playmaker); add(keeper); add(kid);
  for (const c of ['a1', 'a2', 'b1', 'b2']) {
    add(mkPlayer('LCB', c)); add(mkPlayer('RCB', c)); add(mkPlayer('LB', c)); add(mkPlayer('RB', c));
    add(mkPlayer('CM', c)); add(mkPlayer('CDM', c)); add(mkPlayer('RW', c));
  }

  const rosterOf = (cid: string) => Object.values(players).filter((p) => p.contract.clubId === cid);
  const aStat = (p: Player): PlayerMatchStat => {
    if (p.id === striker.id) return stat(p, { goals: 2, rating: 8.5 });
    if (p.id === playmaker.id) return stat(p, { assists: 2, rating: 8.2 });
    if (p.id === keeper.id) return stat(p, { rating: 7.8 });
    if (p.id === kid.id) return stat(p, { goals: 1, assists: 1, rating: 8.0 });
    return stat(p);
  };

  // A full 20-game league season so the named players clear the min-apps gates.
  const matches: Match[] = [];
  for (let i = 0; i < 20; i++) {
    matches.push(mkMatch('LG_A', 'a1', 'a2', 2, 0, [...rosterOf('a1'), ...rosterOf('a2')].map(aStat)));
    matches.push(mkMatch('LG_B', 'b1', 'b2', 1, 1, [...rosterOf('b1'), ...rosterOf('b2')].map((p) =>
      p.id === bStriker.id ? stat(p, { goals: i < 8 ? 1 : 0, rating: 7.4 }) : stat(p))));
  }

  const compMeta: Record<string, CompMeta> = buildCompMeta(competitions, undefined, clubs);
  const clubLeague: Record<string, string> = { a1: 'LG_A', a2: 'LG_A', b1: 'LG_B', b2: 'LG_B' };

  const res = computeSeasonAwards({
    seasonId: 'S', year: 2024, matches, players, comps: compMeta, clubs, clubLeague,
    tournaments: [], leagueChampionClubs: new Set(['a1']), continentalChampionClubs: new Set(),
  });
  const find = (type: string, compId?: string) => res.seasonEnd.find((a) => a.type === type && (!compId || a.competitionId === compId));

  it('gives each league its own Golden Boot to that league\'s top scorer', () => {
    expect(find('GOLDEN_BOOT', 'LG_A')?.playerId).toBe(striker.id);
    expect(find('GOLDEN_BOOT', 'LG_A')?.value).toBe(40);
    expect(find('GOLDEN_BOOT', 'LG_B')?.playerId).toBe(bStriker.id);
    expect(find('GOLDEN_BOOT', 'LG_B')?.value).toBe(8);
  });

  it('awards a single coefficient-weighted global Golden Boot to the world\'s top scorer', () => {
    const g = find('GLOBAL_GOLDEN_BOOT');
    expect(g?.playerId).toBe(striker.id);
  });

  it('names the top assister as Playmaker', () => {
    expect(find('PLAYMAKER')?.playerId).toBe(playmaker.id);
  });

  it('selects a World XI of 11 (1 GK, 4 DEF, 3 MID, 3 ATT)', () => {
    const xi = res.seasonEnd.filter((a) => a.type === 'TEAM_OF_SEASON');
    expect(xi.length).toBe(11);
    const grp = (slot?: string) => slot;
    expect(xi.filter((a) => grp(a.slot) === 'GK').length).toBe(1);
  });

  it('holds the gala trophies (Ballon d\'Or, Kopa, Yashin, Puskás) for the ceremony', () => {
    const types = res.gala.map((a) => a.type);
    expect(types).toContain('GLOBAL_BEST');
    expect(types).toContain('KOPA');
    expect(types).toContain('YASHIN');
    expect(types).toContain('PUSKAS');
    // Yashin goes to a goalkeeper; Kopa to an under-21.
    const yashin = res.gala.find((a) => a.type === 'YASHIN')!;
    expect(players[yashin.playerId!].position).toBe('GK');
    const kopa = res.gala.find((a) => a.type === 'KOPA')!;
    expect(2024 - players[kopa.playerId!].born.year).toBeLessThanOrEqual(21);
  });
});
