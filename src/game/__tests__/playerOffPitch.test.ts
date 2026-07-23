import { describe, it, expect } from 'vitest';
import {
  marketHeat, updateInterest, askingPrice, advanceOffPitch, executeContractOffer, executeLoanOffer,
  hireAgent, AGENT_ROSTER, derivePersona, pressPromptFor, autoRoutine,
} from '../playerOffPitch';
import { generatePlayer } from '../../engine/generator';
import { Rng } from '../../engine/rng';
import type { Player } from '../../types/player';
import type { Club } from '../../types/club';
import type { PlayerCareer, AvatarMatchSummary } from '../../types/playerCareer';
import type { ContractOffer, LoanOffer } from '../../types/playerOffPitch';

function mk(overall: number, opts: { age?: number; position?: Player['position']; clubId?: string } = {}): Player {
  const p = generatePlayer({ rng: new Rng(overall * 7 + 3), currentYear: 2025, target: overall, position: opts.position ?? 'ST', ageRange: [opts.age ?? 22, opts.age ?? 22], ratingCap: 95 });
  p.overall = overall;
  p.value = overall >= 80 ? 40_000_000 : 5_000_000;
  p.contract.clubId = opts.clubId ?? 'small';
  p.contract.wage = 20_000;
  p.contract.expiresYear = 2028;
  return p;
}

function club(id: string, reputation: number): Club {
  return {
    id, name: `${id} FC`, shortName: id, abbrev: id.slice(0, 3).toUpperCase(),
    countryId: 'ENG', reputation, playerIds: [],
    finances: { balance: 200_000_000, transferBudget: 150_000_000, wageBudget: 2_000_000 },
  } as unknown as Club;
}

function career(over: Partial<PlayerCareer> = {}): PlayerCareer {
  return {
    playerId: 'av', origin: 'CREATED', archetype: 'Academy Graduate',
    managerTrust: 50, status: 'ROTATION', clubRelationship: 55, fanRating: 50, following: 0,
    seasonGoals: 0, seasonApps: 0, seasonAvgRating: 0, objectives: [], traits: [],
    personality: { professionalism: 55, ambition: 60, loyalty: 55, temperament: 50 },
    sponsorships: [], international: { capped: false, caps: 0, intlGoals: 0 },
    milestones: [], seasonHistory: [],
    agent: null, transferInterest: [], activeSagas: [], contractOffers: [],
    transferRequestPending: false, loanSpell: null, loanOffers: [],
    publicImage: { persona: 'Unknown', controversy: 0 }, pressHistory: [], pendingPress: [],
    pendingSponsorOffers: [], lifestyle: { routine: { TRAINING: 1, REST: 1, MEDIA: 1, COMMUNITY: 1, PERSONAL: 1 }, autoManage: true },
    careerEarnings: 0, ...over,
  };
}

const CLUBS: Record<string, Club> = { small: club('small', 60), rich: club('rich', 88), mid: club('mid', 74), lower: club('lower', 45) };

describe('market heat', () => {
  it('a banging season lifts heat above a quiet one', () => {
    const p = mk(82, { age: 21 });
    const hot = marketHeat(career({ status: 'KEY', seasonApps: 30, seasonGoals: 20, seasonAvgRating: 7.6, following: 5000 }), p, 2025);
    const cold = marketHeat(career({ status: 'ROTATION', seasonApps: 5, seasonGoals: 0, seasonAvgRating: 6.3 }), mk(70, { age: 29 }), 2025);
    expect(hot).toBeGreaterThan(cold);
    expect(hot).toBeLessThanOrEqual(100);
  });
});

describe('interest model', () => {
  it('a hot young star draws richer clubs; a fringe journeyman draws few/none', () => {
    const star = mk(84, { age: 21, clubId: 'small' });
    const hot = updateInterest(career({ status: 'STAR', seasonApps: 28, seasonGoals: 18, seasonAvgRating: 7.7, following: 20000 }), star, CLUBS, 2025, 40, 99);
    expect(hot.some((i) => i.clubId === 'rich')).toBe(true);

    const fringe = mk(58, { age: 30, clubId: 'small' });
    const cold = updateInterest(career({ status: 'ROTATION', seasonApps: 3, seasonAvgRating: 6.2 }), fringe, CLUBS, 2025, 40, 99);
    expect(cold.length).toBeLessThanOrEqual(hot.length);
  });

  it('is deterministic under the same seed + day', () => {
    const p = mk(80, { age: 22, clubId: 'small' });
    const c = career({ status: 'KEY', seasonApps: 20, seasonGoals: 12, seasonAvgRating: 7.3, following: 8000 });
    const a = updateInterest(c, p, CLUBS, 2025, 30, 12345);
    const b = updateInterest(c, p, CLUBS, 2025, 30, 12345);
    expect(a).toEqual(b);
  });
});

describe('asking price', () => {
  it('is a premium on value, discounted by a transfer request', () => {
    const p = mk(84, { age: 24 });
    const normal = askingPrice(p, career({ status: 'KEY' }));
    const requested = askingPrice(p, career({ status: 'KEY', transferRequestPending: true }));
    expect(normal).toBeGreaterThan(p.value);
    expect(requested).toBeLessThan(normal);
  });
});

describe('executors', () => {
  it('a signed transfer moves the avatar and swaps club squads + cash', () => {
    const p = mk(82, { age: 23, clubId: 'small' });
    const clubs: Record<string, Club> = { small: { ...CLUBS.small, playerIds: ['av'] }, rich: { ...CLUBS.rich, playerIds: [] } };
    const offer: ContractOffer = { id: 'o1', clubId: 'rich', kind: 'TRANSFER', wage: 60_000, length: 4, signingBonus: 300_000, goalBonus: 3000, releaseClause: null, rolePromise: 'KEY', deadline: 60, fee: 40_000_000 };
    const ex = executeContractOffer(career(), { ...p, id: 'av' }, offer, clubs, 2025, 30);
    expect(ex.avatar.contract.clubId).toBe('rich');
    expect(ex.clubPatches.rich.playerIds).toContain('av');
    expect(ex.clubPatches.small.playerIds).not.toContain('av');
    expect(ex.clubPatches.rich.finances.balance).toBeLessThan(clubs.rich.finances.balance);
    expect(ex.career.status).toBe('KEY');
    // A role promise is recorded to keep.
    expect((ex.career.promises ?? []).length).toBeGreaterThan(0);
  });

  it('a renewal keeps the club but extends the deal', () => {
    const p = mk(78, { age: 27, clubId: 'small' });
    const offer: ContractOffer = { id: 'r1', clubId: 'small', kind: 'RENEWAL', wage: 45_000, length: 3, signingBonus: 135_000, goalBonus: 1800, releaseClause: null, rolePromise: 'KEY', deadline: 60 };
    const ex = executeContractOffer(career({ status: 'KEY' }), { ...p, id: 'av' }, offer, CLUBS, 2025, 30);
    expect(ex.avatar.contract.clubId).toBe('small');
    expect(ex.avatar.contract.expiresYear).toBe(2028);
    expect(ex.career.careerEarnings).toBe(135_000);
  });

  it('a loan move sends the avatar out and records the spell', () => {
    const p = mk(64, { age: 19, clubId: 'small' });
    const clubs: Record<string, Club> = { small: { ...CLUBS.small, playerIds: ['av'] }, lower: { ...CLUBS.lower, playerIds: [] } };
    const offer: LoanOffer = { id: 'l1', clubId: 'lower', minutesGuarantee: true, quality: 45, note: '', deadline: 60 };
    const ex = executeLoanOffer(career(), { ...p, id: 'av' }, offer, clubs, 2025, 30);
    expect(ex.avatar.contract.clubId).toBe('lower');
    expect(ex.avatar.loan?.parentClubId).toBe('small');
    expect(ex.career.loanSpell?.loanClubId).toBe('lower');
  });
});

describe('agent auto-negotiate escape hatch', () => {
  it('quietly signs a qualifying offer during an advance', () => {
    const p = mk(82, { age: 23, clubId: 'small' });
    const agent = hireAgent(AGENT_ROSTER[2], p);
    agent.autoNegotiate = { enabled: true, minWage: 30_000, minRole: 'ROTATION' };
    const offer: ContractOffer = { id: 'o1', clubId: 'rich', kind: 'TRANSFER', wage: 60_000, length: 4, signingBonus: 300_000, goalBonus: 3000, releaseClause: null, rolePromise: 'KEY', deadline: 60, fee: 40_000_000 };
    const c = career({ agent, agentId: agent.id, contractOffers: [offer], activeSagas: [{ id: 's', clubId: 'rich', stage: 'PERSONAL_TERMS', fee: 40_000_000, deadline: 60, note: '' }] });
    const clubs: Record<string, Club> = { small: { ...CLUBS.small, playerIds: ['av'] }, rich: { ...CLUBS.rich, playerIds: [] } };
    const res = advanceOffPitch({ career: c, avatar: { ...p, id: 'av' }, clubs, year: 2025, day: 30, daysElapsed: 7, seed: 1 });
    expect(res.clubPatches?.rich.playerIds).toContain('av');
    expect(res.career.contractOffers ?? []).toHaveLength(0);
  });

  it('leaves a below-floor offer untouched (player must decide)', () => {
    const p = mk(70, { age: 24, clubId: 'small' });
    const agent = hireAgent(AGENT_ROSTER[0], p);
    agent.autoNegotiate = { enabled: true, minWage: 100_000, minRole: 'KEY' };
    const offer: ContractOffer = { id: 'o1', clubId: 'mid', kind: 'TRANSFER', wage: 30_000, length: 4, signingBonus: 90_000, goalBonus: 1500, releaseClause: null, rolePromise: 'ROTATION', deadline: 60, fee: 10_000_000 };
    const c = career({ agent, agentId: agent.id, contractOffers: [offer] });
    const res = advanceOffPitch({ career: c, avatar: { ...p, id: 'av' }, clubs: CLUBS, year: 2025, day: 30, daysElapsed: 7, seed: 1 });
    expect(res.clubPatches).toBeUndefined();
    expect(res.career.contractOffers).toHaveLength(1);
  });
});

describe('advanceOffPitch determinism + wealth', () => {
  it('is reproducible under the same seed', () => {
    const p = mk(80, { age: 22, clubId: 'small' });
    const c = career({ status: 'KEY', seasonApps: 20, seasonGoals: 14, seasonAvgRating: 7.4, following: 12000 });
    const a = advanceOffPitch({ career: c, avatar: { ...p, id: 'av' }, clubs: CLUBS, year: 2025, day: 30, daysElapsed: 7, seed: 555 });
    const b = advanceOffPitch({ career: c, avatar: { ...p, id: 'av' }, clubs: CLUBS, year: 2025, day: 30, daysElapsed: 7, seed: 555 });
    expect(a.career.transferInterest).toEqual(b.career.transferInterest);
    expect(a.earningsDelta).toEqual(b.earningsDelta);
  });

  it('accrues weekly wages into career earnings', () => {
    const p = mk(78, { age: 25, clubId: 'small' });
    const res = advanceOffPitch({ career: career(), avatar: { ...p, id: 'av' }, clubs: CLUBS, year: 2025, day: 30, daysElapsed: 7, seed: 1 });
    expect(res.earningsDelta).toBeGreaterThan(0);
    expect(res.career.careerEarnings).toBe(res.earningsDelta);
  });

  it('skips the buying market while out on loan', () => {
    const p = mk(64, { age: 19, clubId: 'lower' });
    const c = career({ loanSpell: { parentClubId: 'small', loanClubId: 'lower', until: 2026, minutesGuarantee: true, loanManagerTrust: 55, appsAtLoan: 0, goalsAtLoan: 0 } });
    const res = advanceOffPitch({ career: c, avatar: { ...p, id: 'av' }, clubs: CLUBS, year: 2025, day: 30, daysElapsed: 7, seed: 1 });
    expect(res.career.transferInterest ?? []).toHaveLength(0);
    expect(res.career.activeSagas ?? []).toHaveLength(0);
  });
});

describe('media / persona', () => {
  it('a hat-trick triggers a press prompt; a par game does not', () => {
    const p = mk(80);
    const summary = (over: Partial<AvatarMatchSummary>): AvatarMatchSummary => ({ day: 10, opponent: 'Foe', home: true, minutes: 90, rating: 7, goals: 0, assists: 0, teamGoals: 1, oppGoals: 0, result: 'W', ...over });
    expect(pressPromptFor(summary({ goals: 3 }), p, 10)).not.toBeNull();
    expect(pressPromptFor(summary({ goals: 0, rating: 6.6, result: 'D', teamGoals: 1, oppGoals: 1 }), p, 10)).toBeNull();
  });

  it('persona tracks the controversy meter', () => {
    expect(derivePersona({ persona: '', controversy: 80 }, career())).toBe('Bad Boy');
    expect(derivePersona({ persona: '', controversy: 5 }, career({ fanRating: 80 }))).toBe('Fan Favourite');
  });
});

describe('lifestyle', () => {
  it('auto routine favours training for a teenager and rest for a veteran', () => {
    const young = autoRoutine(mk(60, { age: 18 }), 2025);
    const old = autoRoutine(mk(78, { age: 33 }), 2025);
    expect(young.TRAINING).toBeGreaterThanOrEqual(old.TRAINING);
    expect(old.REST).toBeGreaterThanOrEqual(young.REST);
  });
});
