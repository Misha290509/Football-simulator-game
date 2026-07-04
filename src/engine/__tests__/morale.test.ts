import { describe, it, expect } from 'vitest';
import { evaluateTeamTalk, evaluateInteraction, moodLabel, type TalkContext } from '../morale';
import { loadDataset } from '../../data/datasetLoader';
import { ENGLAND_DATASET } from '../../data/england';
import type { Player } from '../../types/player';

const world = loadDataset(ENGLAND_DATASET, 5, 2024);
const anyPlayer = Object.values(world.players)[0];
function withHidden(over: Partial<Player['hidden']>, form = 0, morale = 60): Player {
  return { ...structuredClone(anyPlayer), form, morale, hidden: { ...anyPlayer.hidden, ...over } };
}

describe('Team talks', () => {
  it('a rousing talk when losing at half-time lifts the team; complacency hurts', () => {
    const losing: TalkContext = { phase: 'HALF', scoreDiff: -1, weAreFavourite: true };
    const fired = evaluateTeamTalk('FIRED_UP', losing, 70);
    const relaxed = evaluateTeamTalk('RELAXED', losing, 70);
    expect(fired.reception).toBeGreaterThan(0);
    expect(fired.talkBoost).toBeGreaterThan(1);
    expect(relaxed.reception).toBeLessThan(0);
    expect(relaxed.talkBoost).toBeLessThan(1);
  });

  it('staying calm protects a comfortable lead better than the hairdryer', () => {
    const winningBig: TalkContext = { phase: 'HALF', scoreDiff: 2, weAreFavourite: true };
    expect(evaluateTeamTalk('RELAXED', winningBig, 60).reception)
      .toBeGreaterThan(evaluateTeamTalk('FURIOUS', winningBig, 60).reception);
  });

  it('a professional squad takes strong tones better than a flaky one', () => {
    const losing: TalkContext = { phase: 'HALF', scoreDiff: -1, weAreFavourite: false };
    const pros = evaluateTeamTalk('FURIOUS', losing, 85);
    const flaky = evaluateTeamTalk('FURIOUS', losing, 35);
    expect(pros.reception).toBeGreaterThan(flaky.reception);
  });
});

describe('Player interactions', () => {
  it('praising an in-form player lifts morale', () => {
    const r = evaluateInteraction('PRAISE', withHidden({ professionalism: 70 }, 40, 60));
    expect(r.moraleDelta).toBeGreaterThan(0);
  });

  it('praising a low-professionalism player can breed complacency (form dips)', () => {
    const r = evaluateInteraction('PRAISE', withHidden({ professionalism: 30 }, 0, 60));
    expect(r.formDelta).toBeLessThan(0);
  });

  it('reassuring an unhappy player helps most', () => {
    const unhappy = evaluateInteraction('REASSURE', withHidden({}, 0, 30));
    const happy = evaluateInteraction('REASSURE', withHidden({}, 0, 80));
    expect(unhappy.moraleDelta).toBeGreaterThan(happy.moraleDelta);
  });

  it('warning a strong-willed player sparks a response; a fragile one sulks', () => {
    const strong = evaluateInteraction('WARN', withHidden({ consistency: 80, professionalism: 80 }));
    const fragile = evaluateInteraction('WARN', withHidden({ consistency: 30, professionalism: 30 }));
    expect(strong.formDelta).toBeGreaterThan(0);
    expect(fragile.moraleDelta).toBeLessThan(strong.moraleDelta);
  });

  it('mood labels track morale', () => {
    expect(moodLabel(80).label).toBe('Delighted');
    expect(moodLabel(20).label).toBe('Disgruntled');
  });
});
