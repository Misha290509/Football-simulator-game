// Chooses the real (imported) dataset when present, else the bundled structural
// dataset. The real dataset is loaded dynamically so it never bloats the main
// bundle (see scripts/importDataset.ts → src/data/realDataset.json).
import type { Dataset } from '../types/dataset';
import { GLOBAL_DATASET } from './global';

let cached: Dataset | null = null;

export async function getActiveDataset(): Promise<Dataset> {
  if (cached) return cached;
  try {
    const mod = await import('./realDataset.json');
    const d = (mod as unknown as { default?: Dataset }).default ?? (mod as unknown as Dataset);
    if (d && Array.isArray(d.countries) && d.countries.length > 0) {
      cached = d;
      return d;
    }
  } catch {
    /* no real dataset present — fall back */
  }
  cached = GLOBAL_DATASET;
  return GLOBAL_DATASET;
}

export function isRealDataset(d: Dataset): boolean {
  return d.name.toLowerCase().includes('real') || d.name.toLowerCase().includes('imported');
}
