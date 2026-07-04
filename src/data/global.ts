// Combined dataset spanning all eleven nations (§1A, M6).
import { ENGLAND_DATASET } from './england';
import { buildGlobalDataset } from './countries';

export const GLOBAL_DATASET = buildGlobalDataset(ENGLAND_DATASET.countries[0]);
