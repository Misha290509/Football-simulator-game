import { describe, it, expect } from 'vitest';
import {
  assignPundit, punditJab, makePost, maybeOldPostResurfaces, maybeChant,
  availableProjects, takeProject, POST_OPTIONS, MEDIA_PROJECTS,
} from '../mediaFame';
import type { Player } from '../../types/player';
import type { PlayerCareer, SquadStatus } from '../../types/playerCareer';

const player = (): Player =>
  ({ id: 'me', name: { first: 'Alex', last: 'Hunter' }, overall: 84 } as unknown as Player);
const career = (status: SquadStatus, over: Partial<PlayerCareer> = {}): PlayerCareer =>
  ({ playerId: 'me', status, fanRating: 60, following: 200_000, bankBalance: 0, careerEarnings: 0,
     publicImage: { persona: 'Unknown', controversy: 10 }, ...over } as unknown as PlayerCareer);

describe('pundit nemesis', () => {
  it('only bothers with a prominent player', () => {
    const r = punditJab(career('ROTATION'), player(), 5.5, 10, 7);
    expect(r.news).toHaveLength(0);
    expect(r.conversation).toBeNull();
  });

  it('takes swings on a poor run and offers a real choice', () => {
    let fired = false;
    for (let d = 0; d < 60 && !fired; d++) {
      const r = punditJab(career('STAR'), player(), 5.8, d, 7);
      if (r.conversation) {
        expect(r.conversation.trigger).toBe('PUNDIT');
        expect(r.conversation.choices.length).toBe(3);
        expect(r.career.pundit!.jabs).toBeGreaterThan(0);
        fired = true;
      }
    }
    expect(fired).toBe(true);
  });

  it('goes quiet when the player answers with form', () => {
    const withJabs = career('STAR', { pundit: { ...assignPundit(player(), 7), jabs: 3 } });
    const r = punditJab(withJabs, player(), 7.8, 20, 7);
    expect(r.career.pundit!.silenced).toBe(true);
    expect(r.news.some((n) => /gone quiet/i.test(n.title))).toBe(true);
  });
});

describe('social media', () => {
  it('grows the following, and reach scales with the audience already built', () => {
    const small = makePost(career('KEY', { following: 10_000 }), player(), 'HUMBLE', 10);
    const big = makePost(career('STAR', { following: 2_000_000 }), player(), 'HUMBLE', 10);
    const smallGain = (small.career.following ?? 0) - 10_000;
    const bigGain = (big.career.following ?? 0) - 2_000_000;
    expect(bigGain).toBeGreaterThan(smallGain);
  });

  it('a late-night post costs fans and spikes controversy', () => {
    const r = makePost(career('STAR'), player(), 'LATE_NIGHT', 10);
    expect(r.career.fanRating!).toBeLessThan(60);
    expect(r.career.publicImage!.controversy).toBeGreaterThan(10);
    expect(r.moraleDelta).toBeLessThan(0);
  });

  it('records posts so they can resurface later — and they do', () => {
    const posted = makePost(career('STAR'), player(), 'LATE_NIGHT', 10).career;
    expect(posted.posts!.length).toBe(1);
    let resurfaced = false;
    for (let d = 400; d < 900 && !resurfaced; d++) {
      const r = maybeOldPostResurfaces(posted, player(), d, 7);
      if (r.news.length) { expect(r.moraleDelta).toBeLessThan(0); resurfaced = true; }
    }
    expect(resurfaced).toBe(true);
  });

  it('a clean history never resurfaces', () => {
    const clean = makePost(career('STAR'), player(), 'HUMBLE', 10).career;
    for (let d = 400; d < 700; d++) expect(maybeOldPostResurfaces(clean, player(), d, 7).news).toHaveLength(0);
  });

  it('every post option is well-formed', () => {
    for (const o of POST_OPTIONS) { expect(o.label.length).toBeGreaterThan(0); expect(o.following).toBeGreaterThan(0); }
  });
});

describe('media projects', () => {
  it('gates projects behind a real audience', () => {
    expect(availableProjects(career('KEY', { following: 5_000 }))).toHaveLength(0);
    expect(availableProjects(career('STAR', { following: 1_000_000 })).length).toBeGreaterThan(0);
  });

  it('pays a fee, grows the following and locks in an image', () => {
    const c = career('STAR', { following: 1_000_000 });
    const r = takeProject(c, player(), 'documentary', 10);
    expect(r.ok).toBe(true);
    const proj = MEDIA_PROJECTS.find((p) => p.id === 'documentary')!;
    expect(r.career.bankBalance).toBe(proj.fee);
    expect(r.career.following!).toBeGreaterThan(1_000_000);
    expect(r.career.mediaProjects).toContain('documentary');
  });

  it('refuses a repeat or an out-of-reach project', () => {
    const c = career('STAR', { following: 1_000_000, mediaProjects: ['documentary'] });
    expect(takeProject(c, player(), 'documentary', 10).ok).toBe(false);
    expect(takeProject(career('KEY', { following: 1_000 }), player(), 'cover', 10).ok).toBe(false);
  });
});

describe('the chant', () => {
  it('arrives once for a beloved, established player', () => {
    const beloved = career('STAR', { fanRating: 85 });
    let got: PlayerCareer | null = null;
    for (let d = 0; d < 80 && !got; d++) {
      const r = maybeChant(beloved, player(), d, 7);
      if (r.career.hasChant) { expect(r.moraleDelta).toBeGreaterThan(0); got = r.career; }
    }
    expect(got).not.toBeNull();
    // Never fires twice.
    expect(maybeChant(got!, player(), 200, 7).news).toHaveLength(0);
  });

  it('does not arrive for a squad player the crowd barely knows', () => {
    const unknown = career('ROTATION', { fanRating: 50 });
    for (let d = 0; d < 80; d++) expect(maybeChant(unknown, player(), d, 7).career.hasChant ?? false).toBe(false);
  });
});
