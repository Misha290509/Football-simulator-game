// Neutral attribute defaults used when a real dataset omits specific values.
import type { Attributes, HiddenAttributes } from '../types/attributes';
import {
  TECHNICAL_KEYS, MENTAL_KEYS, PHYSICAL_KEYS, GOALKEEPING_KEYS,
} from '../types/attributes';

const fill = <T extends Record<string, number>>(keys: readonly string[], v: number): T => {
  const o = {} as T;
  for (const k of keys) o[k as keyof T] = v as T[keyof T];
  return o;
};

export const DEFAULT_ATTRIBUTES: Attributes = {
  technical: fill(TECHNICAL_KEYS, 50),
  mental: fill(MENTAL_KEYS, 50),
  physical: fill(PHYSICAL_KEYS, 55),
  goalkeeping: fill(GOALKEEPING_KEYS, 25),
};

export const DEFAULT_HIDDEN: HiddenAttributes = {
  injuryProneness: 40,
  consistency: 65,
  bigGame: 60,
  ambition: 65,
  professionalism: 65,
  versatility: 50,
};
