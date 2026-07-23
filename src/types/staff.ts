// Staff & facilities (§8, §11-M5).

export type StaffRole = 'ASSISTANT' | 'COACH' | 'SCOUT' | 'PHYSIO' | 'YOUTH_COACH';

/** Per-scout skill detail (Idea 6). Present on staff with role 'SCOUT'. */
export interface ScoutProfile {
  judgingAbility: number; // 0–100 accuracy on current ability
  judgingPotential: number; // 0–100 accuracy on ceiling
  experience: number; // 0–100
  regionalKnowledge: Record<string, number>; // countryId → 0–100
  /** Optional niche that boosts yield/accuracy within it. */
  specialization?: { positions: string[]; region: string };
}

export interface Staff {
  id: string;
  name: { first: string; last: string };
  role: StaffRole;
  rating: number; // 0–100
  wage: number; // per week (agreed wage once hired; asking wage in the market)
  clubId: string | null;
  /** Contract end year (set on hire). Undefined for market free agents. */
  expiresYear?: number;
  /** Scouting skill detail (role 'SCOUT'). */
  scoutProfile?: ScoutProfile;
}

export type TrainingFocus = 'BALANCED' | 'ATTACKING' | 'DEFENDING' | 'FITNESS' | 'YOUTH';

export interface Facilities {
  academy: number; // 1–5, scales youth intake quality/quantity
  training: number; // 1–5, scales development speed
}

export interface BoardState {
  targetPosition: number; // expected league finish
  objectiveText: string;
  confidence: number; // 0–100 job security (the boardroom)
  /** Supporter confidence, 0–100 (§ #42). Reacts to results, entertainment,
   *  signings and sales; sustained fan unrest drags the board down. Absent ⇒
   *  treated as 60 (neutral) so existing saves migrate cleanly. */
  fanConfidence?: number;
}
