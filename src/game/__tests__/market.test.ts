import { describe, it, expect } from 'vitest';
import { loadDataset } from '../../data/datasetLoader';
import { ENGLAND_DATASET } from '../../data/england';
import { buildScoutReport, scoutStars, marketView, eliteKnownIds } from '../../engine/marketScout';
import { estimateValue } from '../../engine/development';
import { clubValuation, negotiateFee, transferFloor, overpricedAsk, respondToTransferOffer, dealGrade, type FeeOffer } from '../feeNegotiation';
import { evaluateLoanTerms } from '../transfers';
import { leaveWillingness, evaluateContractOffer, agentDemands } from '../contracts';
import type { Staff } from '../../types/staff';
import type { Player } from '../../types/player';

const world = loadDataset(ENGLAND_DATASET, 5, 2024);
const players = Object.values(world.players);
const clubs = Object.values(world.clubs);
const target = [...players].sort((a, b) => b.overall - a.overall)[20]; // a strong-but-not-top player

function scout(rating: number, id = 's'): Staff {
  return {
    id, name: { first: 'A', last: 'Scout' }, role: 'SCOUT', rating, wage: 1000, clubId: 'x',
    scoutProfile: { judgingAbility: rating, judgingPotential: rating - 5, experience: rating, regionalKnowledge: {} },
  };
}

describe('Market scouting', () => {
  it('maps scout rating to 1–5 stars', () => {
    expect(scoutStars(scout(95))).toBe(5);
    expect(scoutStars(scout(40))).toBe(2);
    expect(scoutStars(scout(10))).toBe(1);
  });

  it('a 5★ scout reads within ±1 of the true overall', () => {
    for (const p of players.slice(0, 40)) {
      const r = buildScoutReport(p, scout(95), 2024, 0);
      expect(Math.abs(r.estOverall - p.overall)).toBeLessThanOrEqual(1);
    }
  });

  it('a weak scout can be well off, but is bounded', () => {
    let maxDelta = 0;
    for (const p of players.slice(0, 60)) {
      const r = buildScoutReport(p, scout(38), 2024, 0);
      maxDelta = Math.max(maxDelta, Math.abs(r.estOverall - p.overall));
    }
    expect(maxDelta).toBeGreaterThan(1); // sometimes genuinely misleading
    expect(maxDelta).toBeLessThanOrEqual(6);
  });

  it('is deterministic per (player, scout)', () => {
    const a = buildScoutReport(target, scout(60), 2024, 0);
    const b = buildScoutReport(target, scout(60), 2024, 0);
    expect(a.estOverall).toBe(b.estOverall);
    expect(a.estValue).toBe(b.estValue);
  });

  it('overrating a player also overvalues him (self-consistent estimate)', () => {
    // The value read is derived from the (biased) overall via the same curve.
    // Holding age and estimated potential fixed, the estimated value must move
    // with the estimated overall relative to a true-overall baseline.
    const p = target;
    const r = buildScoutReport(p, scout(45), 2024, 0);
    const age = 2024 - p.born.year;
    const baseline = estimateValue(p.overall, age, r.estPotential);
    if (r.estOverall > p.overall) expect(r.estValue).toBeGreaterThanOrEqual(baseline);
    if (r.estOverall < p.overall) expect(r.estValue).toBeLessThanOrEqual(baseline);
  });

  it('shows every player: exact for elite, an estimate otherwise, a report when scouted', () => {
    const elite = eliteKnownIds(world.players, 50);
    expect(elite.size).toBe(50);
    const eliteId = [...elite][0];
    const eliteView = marketView(world.players[eliteId], { managerClubId: 'none', eliteIds: elite });
    expect(eliteView.level).toBe('ELITE');
    expect(eliteView.exact).toBe(true);

    const fogged = players.find((p) => !elite.has(p.id) && p.contract.clubId)!;
    const estView = marketView(fogged, { managerClubId: 'none', eliteIds: elite, scoutRating: 30 });
    expect(estView.level).toBe('ESTIMATE'); // never hidden
    expect(estView.exact).toBe(false);
    expect(estView.ovr).toBeGreaterThan(0);
    expect(estView.value).toBeGreaterThanOrEqual(0);
    // A stronger department reads closer to the truth on average.
    let sumWeak = 0, sumStrong = 0, n = 0;
    for (const p of players.filter((x) => !elite.has(x.id) && x.contract.clubId).slice(0, 120)) {
      sumWeak += Math.abs(marketView(p, { managerClubId: 'none', eliteIds: elite, scoutRating: 25 }).ovr - p.overall);
      sumStrong += Math.abs(marketView(p, { managerClubId: 'none', eliteIds: elite, scoutRating: 92 }).ovr - p.overall);
      n++;
    }
    expect(sumStrong / n).toBeLessThan(sumWeak / n);

    const report = buildScoutReport(fogged, scout(70), 2024, 0);
    const withReport = marketView(fogged, { managerClubId: 'none', eliteIds: elite, report });
    expect(withReport.level).toBe('REPORT');
    expect(withReport.exact).toBe(false);
    expect(withReport.stars).toBe(scoutStars(scout(70)));
  });
});

describe('Fee negotiation', () => {
  const seller = clubs[0];
  const buyer = clubs[1];

  function keyOf(role: Player['squadRole']): Player { return { ...target, squadRole: role }; }

  it('values a key player far above a surplus one', () => {
    const key = clubValuation(keyOf('KEY'), seller, buyer, 2024);
    const surplus = clubValuation(keyOf('SURPLUS'), seller, buyer, 2024);
    expect(key).toBeGreaterThan(surplus);
  });

  it('accepts a strong offer and rejects a lowball', () => {
    const p = keyOf('FIRST');
    const val = clubValuation(p, seller, buyer, 2024);
    const strong: FeeOffer = { fee: Math.round(val * 1.25), instalmentYears: 1, sellOnPct: 0, addOns: 0 };
    const low: FeeOffer = { fee: Math.round(val * 0.3), instalmentYears: 1, sellOnPct: 0, addOns: 0 };
    expect(negotiateFee(p, seller, buyer, strong, 2024).outcome).toBe('ACCEPT');
    expect(negotiateFee(p, seller, buyer, low, 2024).outcome).toBe('REJECT');
  });

  it('counters an offer that is close but short', () => {
    const p = keyOf('FIRST');
    const val = clubValuation(p, seller, buyer, 2024);
    const close: FeeOffer = { fee: Math.round(val * 0.88), instalmentYears: 1, sellOnPct: 0, addOns: 0 };
    const r = negotiateFee(p, seller, buyer, close, 2024);
    expect(r.outcome).toBe('COUNTER');
    expect(r.counterFee).toBeGreaterThan(close.fee);
  });

  it('signs a free agent with no fee', () => {
    expect(negotiateFee(target, null, buyer, { fee: 0, instalmentYears: 1, sellOnPct: 0, addOns: 0 }, 2024).outcome).toBe('ACCEPT');
  });
});

describe('Tension-driven haggling', () => {
  const seller = clubs[0];
  const buyer = clubs[1];
  const p: Player = { ...target, squadRole: 'FIRST' };
  const floor = transferFloor(p, seller, buyer, 2024);
  const initialAsk = overpricedAsk(floor, 1.4);
  const bid = (fee: number): FeeOffer => ({ fee, instalmentYears: 1, sellOnPct: 0, addOns: 0 });

  it('opens with an ask above the hidden floor', () => {
    expect(initialAsk).toBeGreaterThan(floor);
  });

  it('accepts once you meet the floor and drifts the ask down otherwise', () => {
    const short = respondToTransferOffer({ offer: bid(Math.round(floor * 0.8)), player: p, sellerName: seller.shortName, floor, ask: initialAsk, initialAsk, tension: 0 });
    expect(short.outcome).toBe('COUNTER');
    expect(short.ask).toBeLessThan(initialAsk); // they give ground
    expect(short.ask).toBeGreaterThanOrEqual(floor);
    const met = respondToTransferOffer({ offer: bid(floor), player: p, sellerName: seller.shortName, floor, ask: short.ask, initialAsk, tension: short.tension });
    expect(met.outcome).toBe('ACCEPT');
    expect(met.grade).toBeTruthy();
  });

  it('raises tension on lowballs and refuses at the ceiling', () => {
    const insult = respondToTransferOffer({ offer: bid(Math.round(floor * 0.4)), player: p, sellerName: seller.shortName, floor, ask: initialAsk, initialAsk, tension: 0 });
    expect(insult.tension).toBeGreaterThan(0);
    const maxed = respondToTransferOffer({ offer: bid(Math.round(floor * 0.4)), player: p, sellerName: seller.shortName, floor, ask: initialAsk, initialAsk, tension: 95 });
    expect(maxed.outcome).toBe('REFUSE');
    expect(maxed.tension).toBe(100);
  });

  it('grades the minimum price A+ and full ask worst', () => {
    expect(dealGrade(floor, floor, initialAsk)).toBe('A+');
    expect(['D', 'E']).toContain(dealGrade(initialAsk, floor, initialAsk));
  });
});

describe('Loan term negotiation', () => {
  const buyer = clubs[1];
  const parent = clubs[0];
  // A loan-eligible player: not a key man, modest overall.
  const p: Player = { ...target, squadRole: 'ROTATION', overall: 68, value: 5_000_000 };

  it('rejects a greedy wage split but accepts it with a strong buy option', () => {
    const greedy = evaluateLoanTerms(p, buyer, parent, 1, 0.9, null);
    expect(greedy.ok).toBe(false);
    const sweetened = evaluateLoanTerms(p, buyer, parent, 1, 0.75, Math.round(p.value * 1.3));
    expect(sweetened.ok).toBe(true);
  });

  it('accepts a fair, even split', () => {
    expect(evaluateLoanTerms(p, buyer, parent, 1, 0.5, null).ok).toBe(true);
  });
});

describe('Willingness to leave', () => {
  const strong = [...clubs].sort((a, b) => b.reputation - a.reputation)[0];
  const weak = [...clubs].sort((a, b) => a.reputation - b.reputation)[0];
  const star: Player = { ...target, overall: 84, hidden: { ...target.hidden, ambition: 70 }, morale: 60 };

  it('rises when outgrowing a weak club and warming the bench', () => {
    const benchedAtWeak = leaveWillingness(star, weak, 1, 20);
    const settledStarter = leaveWillingness({ ...star, overall: strong.reputation - 5, morale: 80 }, strong, 20, 20);
    expect(benchedAtWeak).toBeGreaterThan(settledStarter);
    expect(benchedAtWeak).toBeGreaterThan(60);
  });

  it('an ever-present starter at a strong club won\'t be tempted away', () => {
    const settled: Player = { ...star, overall: strong.reputation - 6, morale: 82 };
    const r = evaluateContractOffer(settled, weak, agentDemands(settled, weak, 2024), 2024, { currentClub: strong, appearances: 20, clubGames: 20 });
    expect(r.outcome).toBe('REJECT');
  });
});
