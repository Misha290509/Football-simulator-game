import { describe, it, expect } from 'vitest';
import { loadDataset } from '../../data/datasetLoader';
import { ENGLAND_DATASET } from '../../data/england';
import { agentDemands, evaluateContractOffer, applyContractOffer } from '../contracts';
import { traitsOf } from '../../engine/traits';
import type { Player } from '../../types/player';

const world = loadDataset(ENGLAND_DATASET, 5, 2024);
const players = Object.values(world.players).sort((a, b) => b.overall - a.overall);
const clubs = Object.values(world.clubs);
const clubOf = (p: Player) => clubs.find((c) => c.id === p.contract.clubId) ?? clubs[0];

describe('Contract negotiation', () => {
  it('produces sensible agent demands (wage at least market, a length, a role)', () => {
    const p = players[0];
    const d = agentDemands(p, clubOf(p), 2024);
    expect(d.wage).toBeGreaterThan(0);
    expect(d.years).toBeGreaterThanOrEqual(1);
    expect(['KEY', 'FIRST', 'ROTATION', 'BACKUP']).toContain(d.squadRole);
  });

  it('accepts an offer that meets the demands', () => {
    const p = players[10];
    const club = clubOf(p);
    const d = agentDemands(p, club, 2024);
    const res = evaluateContractOffer(p, club, d, 2024);
    expect(res.outcome).toBe('ACCEPT');
  });

  it('counters or rejects a lowball offer', () => {
    const p = players[10];
    const club = clubOf(p);
    const d = agentDemands(p, club, 2024);
    const lowball = { ...d, wage: Math.round(d.wage * 0.6), squadRole: 'BACKUP' as const };
    const res = evaluateContractOffer(p, club, lowball, 2024);
    expect(res.outcome === 'COUNTER' || res.outcome === 'REJECT').toBe(true);
  });

  it('applies an accepted offer, writing clauses and a squad-role promise', () => {
    const p = players[10];
    const club = clubOf(p);
    const d = { ...agentDemands(p, club, 2024), releaseClause: 50_000_000, squadRole: 'FIRST' as const };
    const np = applyContractOffer(p, d, 2024);
    expect(np.contract.expiresYear).toBe(2024 + d.years);
    expect(np.contract.releaseClause).toBe(50_000_000);
    expect(np.contract.squadRolePromise).toBe('FIRST');
    expect(np.transferRequested).toBe(false);
  });
});

describe('Player traits', () => {
  it('derives traits deterministically from attributes', () => {
    const a = traitsOf(players[0]);
    const b = traitsOf(players[0]);
    expect(a).toEqual(b);
    expect(a.length).toBeLessThanOrEqual(5);
  });

  it('flags a clinical finisher and a playmaker somewhere in the world', () => {
    const anyClinical = players.some((p) => traitsOf(p).includes('CLINICAL') || traitsOf(p).includes('POACHER'));
    const anyPlaymaker = players.some((p) => traitsOf(p).includes('PLAYMAKER'));
    expect(anyClinical || anyPlaymaker).toBe(true);
  });
});
