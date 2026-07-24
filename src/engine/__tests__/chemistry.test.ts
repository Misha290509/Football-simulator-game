import { describe, it, expect } from 'vitest';
import { Rng } from '../rng';
import { generateSquad } from '../generator';
import { squadChemistry, chemistryMod, dressingRoom, isLeader } from '../chemistry';
import { buildLineupProfile } from '../lineup';

const squad = generateSquad({ rng: new Rng(41), currentYear: 2024, reputation: 75, clubId: 'A', nationality: 'GB' });

describe('Dressing-room chemistry', () => {
  it('scores 0–100 with a factor breakdown', () => {
    const c = squadChemistry(squad, 2025);
    expect(c.score).toBeGreaterThanOrEqual(10);
    expect(c.score).toBeLessThanOrEqual(95);
    expect(c.factors.length).toBeGreaterThanOrEqual(4);
    expect(c.label.length).toBeGreaterThan(0);
  });

  it('rewards high morale and punishes a miserable squad', () => {
    const happy = squad.map((p) => ({ ...p, morale: 90 }));
    const sour = squad.map((p) => ({ ...p, morale: 20 }));
    expect(squadChemistry(happy).score).toBeGreaterThan(squadChemistry(sour).score);
  });

  it('penalises multiple big egos and a huge wage gap', () => {
    const base = squadChemistry(squad).score;
    const divas = squad.map((p, i) => (i < 4 ? { ...p, ego: 90 } : p));
    expect(squadChemistry(divas).score).toBeLessThanOrEqual(base);
    const envy = squad.map((p, i) => (i === 0 ? { ...p, contract: { ...p.contract, wage: p.contract.wage * 40 } } : p));
    expect(squadChemistry(envy).score).toBeLessThan(base + 1);
  });

  it('feeds a bounded team-wide multiplier into the match profile', () => {
    const mod = chemistryMod(squad);
    expect(mod).toBeGreaterThan(0.955);
    expect(mod).toBeLessThan(1.045);
    const happy = squad.map((p) => ({ ...p, morale: 92 }));
    const sour = squad.map((p) => ({ ...p, morale: 18 }));
    const a = buildLineupProfile('A', happy, '4-3-3');
    const b = buildLineupProfile('A', sour, '4-3-3');
    expect(a.attack).toBeGreaterThan(b.attack); // morale flows through condition AND chemistry
  });

  it('surfaces leaders and national cliques for the dressing-room view (#47)', () => {
    const room = dressingRoom(squad, squad[0].id);
    // A national bloc exists (whole squad is GB).
    expect(room.cliques.some((c) => c.nationality === 'GB' && c.count >= 3)).toBe(true);
    // Any listed leader genuinely qualifies; the captain sorts first if he leads.
    for (const l of room.leaders) expect(isLeader(l)).toBe(true);
    if (room.leaders.some((l) => l.id === squad[0].id)) expect(room.leaders[0].id).toBe(squad[0].id);
  });
});
