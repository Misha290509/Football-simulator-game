import { describe, it, expect } from 'vitest';
import { Rng } from '../rng';
import { generatePlayer } from '../generator';
import { developPlayer, type SeasonPerf } from '../development';

const perf: SeasonPerf = { minutes: 2400, avgRating: 7.2, goals: 8, assists: 5, cleanSheets: 0, appearances: 30 };

describe('Individual training focus', () => {
  it('channels growth into the focused attributes', () => {
    const base = generatePlayer({ rng: new Rng(31), currentYear: 2024, target: 62, position: 'ST', ageRange: [18, 18] });
    base.potential = 85;

    const plain = developPlayer({ ...base, training: null }, 2025, new Rng(99), { perf });
    const focused = developPlayer({ ...base, training: { focus: 'SHOOTING' } }, 2025, new Rng(99), { perf });

    // Focused shooting attributes outgrow the balanced regime…
    expect(focused.attributes.technical.finishing).toBeGreaterThan(plain.attributes.technical.finishing);
    expect(focused.attributes.technical.shotPower).toBeGreaterThan(plain.attributes.technical.shotPower);
    // …while unfocused ones lag slightly behind it.
    expect(focused.attributes.mental.marking).toBeLessThanOrEqual(plain.attributes.mental.marking);
  });

  it('has no effect in decline years (no negative-side distortion)', () => {
    const vet = generatePlayer({ rng: new Rng(32), currentYear: 2024, target: 74, position: 'CM', ageRange: [34, 34] });
    const a = developPlayer({ ...vet, training: { focus: 'PASSING' } }, 2025, new Rng(7), { perf: { ...perf, avgRating: 6.4 } });
    const b = developPlayer({ ...vet, training: null }, 2025, new Rng(7), { perf: { ...perf, avgRating: 6.4 } });
    expect(a.attributes.technical.shortPassing).toBe(b.attributes.technical.shortPassing);
  });
});
