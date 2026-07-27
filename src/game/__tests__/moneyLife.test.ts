import { describe, it, expect } from 'vitest';
import {
  taxRateFor, wagePacket, compareNet, DEFAULT_TAX,
  INVESTMENTS, invest, advanceInvestments, portfolioValue,
  hireAdviser, advanceAdviser, maybeFamilyAsk,
} from '../moneyLife';
import type { Player } from '../../types/player';
import type { PlayerCareer } from '../../types/playerCareer';

const player = (): Player =>
  ({ id: 'me', name: { first: 'Alex', last: 'Hunter' } } as unknown as Player);
const career = (over: Partial<PlayerCareer> = {}): PlayerCareer =>
  ({ playerId: 'me', bankBalance: 10_000_000, ...over } as unknown as PlayerCareer);

describe('tax & net wages', () => {
  it('knows real rates and falls back sensibly', () => {
    expect(taxRateFor('eng')).toBeGreaterThan(0.3);
    expect(taxRateFor('sau')).toBe(0);
    expect(taxRateFor('atlantis')).toBe(DEFAULT_TAX);
    expect(taxRateFor(undefined)).toBe(DEFAULT_TAX);
  });

  it('takes tax and the agent cut out of the headline number', () => {
    const packet = wagePacket(100_000, 'eng', 10);
    expect(packet.net).toBeLessThan(packet.gross);
    expect(packet.tax).toBeGreaterThan(0);
    expect(packet.agentCut).toBe(10_000);
    expect(packet.net).toBe(100_000 - packet.tax - 10_000);
  });

  it('makes a tax-free move genuinely better than it looks', () => {
    // A smaller gross in a tax-free country can still beat a bigger one at home.
    const cmp = compareNet(150_000, 'eng', 120_000, 'sau', 5);
    expect(cmp.better).toBe(true);
    expect(cmp.deltaPct).toBeGreaterThan(0);
  });

  it('a like-for-like move at a lower wage is worse', () => {
    const cmp = compareNet(150_000, 'eng', 100_000, 'eng', 5);
    expect(cmp.better).toBe(false);
  });
});

describe('investments', () => {
  it('buys a holding and deducts the cost', () => {
    const r = invest(career(), player(), 'PROPERTY', 10);
    expect(r.ok).toBe(true);
    expect(r.career.bankBalance).toBe(10_000_000 - 2_000_000);
    expect(portfolioValue(r.career)).toBe(2_000_000);
  });

  it('refuses a repeat or an unaffordable one', () => {
    const held = invest(career(), player(), 'PROPERTY', 10).career;
    expect(invest(held, player(), 'PROPERTY', 20).ok).toBe(false);
    expect(invest(career({ bankBalance: 100 }), player(), 'PROPERTY', 10).ok).toBe(false);
  });

  it('safe holdings pay out year after year', () => {
    let c = invest(career(), player(), 'BONDS', 10).career;
    const before = c.bankBalance!;
    for (let y = 2025; y < 2030; y++) c = advanceInvestments(c, player(), y, 0, 7).career;
    expect(c.bankBalance!).toBeGreaterThan(before);
    expect(c.holdings![0].failed ?? false).toBe(false);
  });

  it('a risky one eventually goes under, and stays under', () => {
    let c = invest(career(), player(), 'STARTUP', 10).career;
    let collapsed = false;
    for (let y = 2025; y < 2040 && !collapsed; y++) {
      const r = advanceInvestments(c, player(), y, 0, 7);
      c = r.career;
      if (r.news.some((n) => /collapsed/i.test(n.title))) { expect(r.moraleDelta).toBeLessThan(0); collapsed = true; }
    }
    expect(collapsed).toBe(true);
    expect(c.holdings![0].failed).toBe(true);
    expect(portfolioValue(c)).toBe(0);
  });

  it('every investment is well-formed', () => {
    for (const i of INVESTMENTS) {
      expect(i.cost).toBeGreaterThan(0);
      expect(i.risk).toBeGreaterThanOrEqual(0);
      expect(i.risk).toBeLessThanOrEqual(1);
    }
  });
});

describe('the adviser', () => {
  it('is hired once and named', () => {
    const r = hireAdviser(career(), 10, 7);
    expect(r.career.adviser!.name.length).toBeGreaterThan(0);
    expect(hireAdviser(r.career, 20, 7).news).toHaveLength(0);
  });

  it('a bad one eventually disappears with the money', () => {
    const c = career({ adviser: { name: 'Martin Vale', trustworthy: false, since: 0 } });
    let robbed = null as null | ReturnType<typeof advanceAdviser>;
    for (let d = 700; d < 3000 && !robbed; d++) {
      const r = advanceAdviser(c, player(), d, 7);
      if (r.news.length) robbed = r;
    }
    expect(robbed).not.toBeNull();
    expect(robbed!.career.bankBalance!).toBeLessThan(10_000_000);
    expect(robbed!.career.adviser!.exposed).toBe(true);
    expect(robbed!.moraleDelta).toBeLessThan(0);
    // Never fires again once exposed.
    expect(advanceAdviser(robbed!.career, player(), 3500, 7).news).toHaveLength(0);
  });

  it('a good one never robs him', () => {
    const c = career({ adviser: { name: 'Simon Ferry', trustworthy: true, since: 0 } });
    for (let d = 700; d < 3000; d++) {
      const r = advanceAdviser(c, player(), d, 7);
      expect(r.moraleDelta).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('family', () => {
  it('only comes calling once he is visibly wealthy', () => {
    const poor = career({ bankBalance: 100_000 });
    for (let d = 0; d < 200; d++) expect(maybeFamilyAsk(poor, player(), d, 7).conversation).toBeNull();
  });

  it('eventually asks, with a real choice', () => {
    let asked = null as null | ReturnType<typeof maybeFamilyAsk>;
    for (let d = 0; d < 400 && !asked; d++) {
      const r = maybeFamilyAsk(career(), player(), d, 7);
      if (r.conversation) asked = r;
    }
    expect(asked).not.toBeNull();
    expect(asked!.conversation!.trigger).toBe('FAMILY');
    expect(asked!.conversation!.choices.length).toBe(3);
  });
});
