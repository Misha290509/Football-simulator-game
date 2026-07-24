import { describe, it, expect } from 'vitest';
import { createNewGame } from '../newGame';
import { loadDataset } from '../../data/datasetLoader';
import { ENGLAND_DATASET } from '../../data/england';

function managerClubId(): string {
  const world = loadDataset(ENGLAND_DATASET, 5, 2024);
  const comp = Object.values(world.competitions).find((c) => c.tier === 1)!;
  return comp.clubIds[0];
}

describe('custom club identity (#61)', () => {
  it('rebrands the chosen club with a custom name, abbrev and colour', () => {
    const clubId = managerClubId();
    const snap = createNewGame({
      saveName: 'Custom', managerName: 'M', dataset: ENGLAND_DATASET,
      managerClubId: clubId, startYear: 2024, seed: 1,
      customClub: { name: 'Athletic Newtown', shortName: 'Athletic Newtown', abbrev: 'atn', primaryColor: '#ff0055' },
    });
    const club = snap.clubs[clubId];
    expect(club.name).toBe('Athletic Newtown');
    expect(club.abbrev).toBe('ATN'); // upper-cased, 3 chars
    expect(club.primaryColor).toBe('#ff0055');
  });

  it('keeps the club’s own identity when no custom club is given', () => {
    const clubId = managerClubId();
    const plain = createNewGame({ saveName: 'Plain', managerName: 'M', dataset: ENGLAND_DATASET, managerClubId: clubId, startYear: 2024, seed: 1 });
    const custom = createNewGame({ saveName: 'C', managerName: 'M', dataset: ENGLAND_DATASET, managerClubId: clubId, startYear: 2024, seed: 1, customClub: { name: '', abbrev: '' } });
    // Empty custom fields fall back to the original identity.
    expect(custom.clubs[clubId].name).toBe(plain.clubs[clubId].name);
    expect(custom.clubs[clubId].abbrev).toBe(plain.clubs[clubId].abbrev);
  });
});
