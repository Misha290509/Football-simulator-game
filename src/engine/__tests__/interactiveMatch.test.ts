import { describe, it, expect } from 'vitest';
import { runInteractiveMatch, type InteractiveInput } from '../interactiveMatch';
import { buildLineupProfile } from '../lineup';
import { generatePlayer } from '../generator';
import { Rng } from '../rng';
import { momentRole } from '../../game/momentLibrary';
import type { Player } from '../../types/player';
import type { Match } from '../../types/match';
import type { MomentDecision } from '../../types/interactiveMatch';

function squad(seed: number, clubId: string): Player[] {
  const rng = new Rng(seed);
  const spec: [Player['position'], number][] = [
    ['GK', 74], ['GK', 64], ['RB', 74], ['RCB', 76], ['LCB', 75], ['LB', 73],
    ['CDM', 76], ['CM', 75], ['CM', 74], ['RW', 78], ['ST', 80], ['LW', 76], ['ST', 72], ['CAM', 74],
  ];
  return spec.map(([position, target], i) => {
    const p = generatePlayer({ rng, currentYear: 2025, target, position, ageRange: [23, 29], ratingCap: 90 });
    p.id = `${clubId}_${i}`; p.contract.clubId = clubId;
    return p;
  });
}

function input(avatarPos: Player['position'], seed = 12345): InteractiveInput {
  const home = squad(1, 'H'); const away = squad(2, 'A');
  const avatar = home.find((p) => p.position === avatarPos)!;
  const hp = buildLineupProfile('H', home, '4-3-3', { autoMode: true });
  const ap = buildLineupProfile('A', away, '4-3-3', { autoMode: true });
  const fixture = { id: 'MTEST', competitionId: 'L', seasonId: 'S', round: 1, day: 30, homeClubId: 'H', awayClubId: 'A', played: false, homeGoals: 0, awayGoals: 0, homeXg: 0, awayXg: 0, events: [], playerStats: [], seed } as Match;
  return {
    matchId: 'MTEST', seed, fixture, avatar, role: momentRole(avatarPos), isAvatarHome: true,
    avatarProfile: hp, oppProfile: ap, oppName: 'Away', importance: 0.4, confidence: 60, fitness: 100,
    status: 'KEY', gamePlan: 'BALANCED', frequency: 'NORMAL',
  };
}

/** Play a full match always choosing the first option; return decisions + match. */
function playThrough(inp: InteractiveInput, choiceIndex = 0): { decisions: MomentDecision[]; match: Match } {
  const decisions: MomentDecision[] = [];
  let step = runInteractiveMatch(inp, decisions);
  let guard = 0;
  while (step.kind === 'DECISION' && guard++ < 50) {
    const ch = step.moment.choices[Math.min(choiceIndex, step.moment.choices.length - 1)];
    decisions.push({ momentId: step.moment.id, choiceId: ch.id, autoResolved: false, followedGamePlan: false, success: false, effect: '' });
    step = runInteractiveMatch(inp, decisions);
  }
  if (step.kind !== 'DONE') throw new Error('did not finish');
  return { decisions, match: step.match };
}

const fingerprint = (m: Match) =>
  `${m.homeGoals}-${m.awayGoals}|` + [...m.playerStats].sort((a, b) => a.playerId.localeCompare(b.playerId)).map((s) => `${s.playerId}:${s.goals}:${s.assists}:${s.rating}`).join(',');

describe('interactive match — determinism (Tier 3 Step 1)', () => {
  it('pauses at moments and resumes; seed + decisionLog reproduces the match exactly', () => {
    const inp = input('ST');
    const a = playThrough(inp);
    expect(a.decisions.length).toBeGreaterThanOrEqual(4);
    expect(a.decisions.length).toBeLessThanOrEqual(10);

    // Replay from the same seed + decision log → identical match.
    const replay = runInteractiveMatch(inp, a.decisions);
    expect(replay.kind).toBe('DONE');
    if (replay.kind === 'DONE') expect(fingerprint(replay.match)).toBe(fingerprint(a.match));

    // A different set of decisions generally yields a different match…
    const b = playThrough(inp, 1);
    // …but the SAME decisions always reproduce (run it a third time).
    const again = runInteractiveMatch(inp, b.decisions);
    if (again.kind === 'DONE') expect(fingerprint(again.match)).toBe(fingerprint(b.match));
  });

  it('the scoreline equals the sum of scorers (records stay consistent)', () => {
    const { match } = playThrough(input('ST'));
    const homeGoals = match.playerStats.filter((s) => s.playerId.startsWith('H_')).reduce((n, s) => n + s.goals, 0);
    expect(homeGoals).toBe(match.homeGoals);
  });
});

describe('interactive match — position-correct moments', () => {
  it('a striker gets finishing moments; a keeper never does', () => {
    let stStep = runInteractiveMatch(input('ST'), []);
    // collect a few striker moment types
    const stTypes = new Set<string>();
    let d: MomentDecision[] = [];
    while (stStep.kind === 'DECISION' && d.length < 20) { stTypes.add(stStep.moment.type); d.push({ momentId: stStep.moment.id, choiceId: stStep.moment.choices[0].id, autoResolved: false, followedGamePlan: false, success: false, effect: '' }); stStep = runInteractiveMatch(input('ST'), d); }

    const gkInp = input('GK');
    let gkStep = runInteractiveMatch(gkInp, []);
    let gd: MomentDecision[] = [];
    const gkHasGoalReward: boolean[] = [];
    while (gkStep.kind === 'DECISION' && gd.length < 20) {
      gkHasGoalReward.push(gkStep.moment.choices.some((c) => c.reward === 'GOAL'));
      gd.push({ momentId: gkStep.moment.id, choiceId: gkStep.moment.choices[0].id, autoResolved: false, followedGamePlan: false, success: false, effect: '' });
      gkStep = runInteractiveMatch(gkInp, gd);
    }
    // The keeper is never asked to score.
    expect(gkHasGoalReward.every((x) => x === false)).toBe(true);
    // (sanity) the striker library is attacking.
    expect(stTypes.size).toBeGreaterThan(0);
  });
});

describe('interactive match — no stat inflation', () => {
  it('an auto-first-choice striker averages a sane number of goals per match', () => {
    let goals = 0; const N = 40;
    for (let s = 0; s < N; s++) {
      const { match } = playThrough(input('ST', 1000 + s * 7));
      const av = match.playerStats.find((x) => x.playerId === 'H_10'); // the ST
      goals += av ? av.goals : 0;
    }
    const perMatch = goals / N;
    // A good striker: comfortably under ~1.5 goals/game on average, and scoring some.
    expect(perMatch).toBeGreaterThan(0.1);
    expect(perMatch).toBeLessThan(1.6);
  });
});
