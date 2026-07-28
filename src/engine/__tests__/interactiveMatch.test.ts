import { describe, it, expect } from 'vitest';
import { runInteractiveMatch, type InteractiveInput } from '../interactiveMatch';
import { buildLineupProfile } from '../lineup';
import { generatePlayer } from '../generator';
import { Rng } from '../rng';
import { momentRole } from '../../game/momentLibrary';
import { isSituation } from '../../game/momentChains';
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

describe('interactive match — impact-sub cameo (benched avatar)', () => {
  it('a cameo produces a handful of late moments, deterministically, with limited minutes', () => {
    const inp: InteractiveInput = { ...input('ST'), cameo: true, status: 'PROSPECT' };
    const a = playThrough(inp);
    // A cameo budget is 2–4 moments (fewer than a full start's 4–10).
    expect(a.decisions.length).toBeGreaterThanOrEqual(2);
    expect(a.decisions.length).toBeLessThanOrEqual(4);
    // Same seed + decisions reproduce the cameo exactly.
    const replay = runInteractiveMatch(inp, a.decisions);
    if (replay.kind === 'DONE') {
      expect(fingerprint(replay.match)).toBe(fingerprint(a.match));
      const av = replay.match.playerStats.find((s) => s.playerId === inp.avatar.id);
      expect(av && av.minutes).toBeLessThanOrEqual(30);
    }
  });
});

describe('interactive match — off-the-ball positioning intent', () => {
  it('reshapes the moment mix deterministically (runs in behind → more direct chances)', () => {
    const behind: InteractiveInput = { ...input('ST'), intent: 'IN_BEHIND' };
    const short: InteractiveInput = { ...input('ST'), intent: 'SHOW_FOR_IT' };
    const typeCounts = (inp: InteractiveInput) => {
      const seen: Record<string, number> = {};
      let step = runInteractiveMatch(inp, []); const d: MomentDecision[] = [];
      while (step.kind === 'DECISION' && d.length < 30) {
        seen[step.moment.type] = (seen[step.moment.type] ?? 0) + 1;
        d.push({ momentId: step.moment.id, choiceId: step.moment.choices[0].id, autoResolved: false, followedGamePlan: false, success: false, effect: '' });
        step = runInteractiveMatch(inp, d);
      }
      return seen;
    };
    const b = typeCounts(behind);
    const s = typeCounts(short);
    const directBehind = (b.RUN_IN_BEHIND ?? 0) + (b.ONE_ON_ONE ?? 0);
    const directShort = (s.RUN_IN_BEHIND ?? 0) + (s.ONE_ON_ONE ?? 0);
    // Running in behind should, over the match, yield at least as many direct
    // chances as coming short — and the same intent always reproduces.
    expect(directBehind).toBeGreaterThanOrEqual(directShort);
    expect(typeCounts(behind)).toEqual(b);
  });
});

describe('interactive match — flow, duel & signature', () => {
  it('exposes a flow value in [0,100] on every step and moves it off the baseline', () => {
    const inp = input('ST', 42);
    const seen: number[] = [];
    let step = runInteractiveMatch(inp, []); const d: MomentDecision[] = [];
    let guard = 0;
    while (step.kind === 'DECISION' && guard++ < 40) {
      expect(step.flow).toBeGreaterThanOrEqual(0);
      expect(step.flow).toBeLessThanOrEqual(100);
      seen.push(step.flow);
      const goal = step.moment.choices.find((c) => c.reward === 'GOAL' && !c.signature) ?? step.moment.choices[0];
      d.push({ momentId: step.moment.id, choiceId: goal.id, autoResolved: false, followedGamePlan: false, success: false, effect: '' });
      step = runInteractiveMatch(inp, d);
    }
    expect(step.kind).toBe('DONE');
    // Flow is dynamic — it doesn't just sit at the starting 50 all match.
    expect(seen.some((f) => f !== 50)).toBe(true);
  });

  it('tracks a personal duel vs the marker and records the verdict', () => {
    const marker = { name: 'Virgil Stone', rating: 84, role: 'RCB' };
    let found = false;
    for (let seed = 1; seed <= 40 && !found; seed++) {
      const inp: InteractiveInput = { ...input('ST', seed), intent: 'IN_BEHIND', marker };
      const d: MomentDecision[] = [];
      let step = runInteractiveMatch(inp, d); let guard = 0;
      while (step.kind === 'DECISION' && guard++ < 40) {
        d.push({ momentId: step.moment.id, choiceId: step.moment.choices[0].id, autoResolved: false, followedGamePlan: false, success: false, effect: '' });
        step = runInteractiveMatch(inp, d);
      }
      if (step.kind === 'DONE' && step.record.duel && (step.record.duel.won + step.record.duel.lost) > 0) {
        expect(step.record.duel.markerName).toBe('Virgil Stone');
        expect(step.duel.won + step.duel.lost).toBeGreaterThan(0);
        found = true;
      }
    }
    expect(found).toBe(true);
  });
});

describe('interactive match — goal of the season', () => {
  it('a spectacular strike (long shot / free kick) earns a worldie standout', () => {
    // Auto-pick the goal-seeking choice on every moment; a shooting-heavy intent
    // across a spread of seeds is (deterministically) certain to bury a screamer.
    let found = false;
    for (let seed = 1; seed <= 150 && !found; seed++) {
      const inp: InteractiveInput = { ...input('ST', seed), intent: 'BETWEEN_LINES' };
      const d: MomentDecision[] = [];
      let step = runInteractiveMatch(inp, d);
      let guard = 0;
      while (step.kind === 'DECISION' && guard++ < 40) {
        const goalChoice = step.moment.choices.find((c) => c.reward === 'GOAL') ?? step.moment.choices[0];
        d.push({ momentId: step.moment.id, choiceId: goalChoice.id, autoResolved: false, followedGamePlan: false, success: false, effect: '' });
        step = runInteractiveMatch(inp, d);
      }
      if (step.kind === 'DONE' && /goal-of-the-season/i.test(step.record.standout ?? '')) found = true;
    }
    expect(found).toBe(true);
  });
});

describe('interactive match — half-time positioning switch', () => {
  const playMoments = (inp: InteractiveInput) => {
    const out: { minute: number; type: string }[] = [];
    let step = runInteractiveMatch(inp, []); const d: MomentDecision[] = [];
    while (step.kind === 'DECISION' && d.length < 40) {
      out.push({ minute: step.moment.minute, type: step.moment.type });
      d.push({ momentId: step.moment.id, choiceId: step.moment.choices[0].id, autoResolved: false, followedGamePlan: false, success: false, effect: '' });
      step = runInteractiveMatch(inp, d);
    }
    return out;
  };

  it('leaves the first half identical and only reshapes minute≥45 moments', () => {
    const base: InteractiveInput = { ...input('ST'), intent: 'SHOW_FOR_IT' };
    const switched: InteractiveInput = { ...base, intent2: 'IN_BEHIND' };
    const a = playMoments(base);
    const b = playMoments(switched);
    const firstHalf = (xs: typeof a) => xs.filter((m) => m.minute < 45);
    // First half is byte-identical — the switch never touches it.
    expect(firstHalf(b)).toEqual(firstHalf(a));
    // Deterministic: the switched run reproduces exactly.
    expect(playMoments(switched)).toEqual(b);
  });
});

describe('interactive match — chains & situations', () => {
  /** Every moment the engine offered across a full match, in order. */
  const momentsOf = (inp: InteractiveInput, choiceIndex = 0) => {
    const decisions: MomentDecision[] = [];
    const out: { type: string; because?: string; index: number }[] = [];
    let step = runInteractiveMatch(inp, decisions);
    let guard = 0;
    while (step.kind === 'DECISION' && guard++ < 60) {
      out.push({ type: step.moment.type, because: step.moment.because, index: step.moment.index });
      const ch = step.moment.choices[Math.min(choiceIndex, step.moment.choices.length - 1)];
      decisions.push({ momentId: step.moment.id, choiceId: ch.id, autoResolved: false, followedGamePlan: false, success: false, effect: '' });
      step = runInteractiveMatch(inp, decisions);
    }
    return { moments: out, decisions, done: step };
  };

  it('produces follow-up moments that explain why they exist', () => {
    // Sweep seeds and roles until a chain or situation lands; over a season's
    // worth of matches it has to happen, or the feature is inert.
    let withReason = 0, seen = 0;
    for (let seed = 1; seed <= 40; seed++) {
      for (const pos of ['ST', 'RW', 'CM', 'RCB', 'GK'] as const) {
        for (const ci of [0, 1]) {
          const { moments } = momentsOf(input(pos, seed), ci);
          seen += moments.length;
          withReason += moments.filter((m) => m.because).length;
        }
      }
    }
    expect(seen).toBeGreaterThan(500);
    expect(withReason).toBeGreaterThan(0);
  });

  it('keeps the replay exact even when the match grew extra moments', () => {
    // Find a match that actually chained, then prove it still reproduces.
    for (let seed = 1; seed <= 60; seed++) {
      const inp = input('RW', seed);
      const { moments, decisions, done } = momentsOf(inp, 0);
      if (!moments.some((m) => m.because)) continue;
      expect(done.kind).toBe('DONE');
      const replay = runInteractiveMatch(inp, decisions);
      expect(replay.kind).toBe('DONE');
      if (replay.kind === 'DONE' && done.kind === 'DONE') {
        expect(fingerprint(replay.match)).toBe(fingerprint(done.match));
        expect(replay.record.decisionLog.length).toBe(decisions.length);
      }
      return;
    }
    throw new Error('no chained match found in 60 seeds — chains are not firing');
  });

  it('indexes every moment contiguously, so the decision log stays aligned', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const { moments } = momentsOf(input('ST', seed));
      expect(moments.map((m) => m.index)).toEqual(moments.map((_, i) => i));
    }
  });

  it('never offers more than one scoreline-driven situation in a match', () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const pos of ['ST', 'CM', 'GK'] as const) {
        const { moments } = momentsOf(input(pos, seed));
        const sits = moments.filter((m) => isSituation(m.type as never));
        expect(sits.length).toBeLessThanOrEqual(1);
      }
    }
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
