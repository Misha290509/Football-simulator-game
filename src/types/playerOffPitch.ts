// ---------------------------------------------------------------------------
// Player Career — off-pitch life (Tier 4). Types for the agent, the inverted
// transfer market (clubs bidding for the avatar), contracts/renewals, loans,
// media/public image, sponsorships and the weekly lifestyle routine. All of it
// is event-driven through the inbox and deterministic under the seeded RNG.
// ---------------------------------------------------------------------------

import type { SquadStatus } from './playerCareer';

export interface PlayerAgent {
  id: string;
  name: string;
  negotiation: number; // squeezes better wages/bonuses
  network: number; // how many/how big the clubs that come calling
  mediaSavvy: number; // limits PR damage
  reputation: number;
  commissionPct: number; // % of wages taken
  relationship: number; // 0–100 — overrule him and it drops
  autoNegotiate: { enabled: boolean; minWage: number; minRole: SquadStatus };
}

/** An AI club's standing interest in signing the avatar. */
export interface ClubInterest {
  clubId: string;
  level: number; // 0–100
  lastSeen: number; // day last refreshed
}

export type SagaStage = 'RUMOUR' | 'BID' | 'PERSONAL_TERMS' | 'DONE' | 'COLLAPSED';

/** A live transfer pursuit of the avatar by one club. */
export interface TransferSaga {
  id: string;
  clubId: string;
  stage: SagaStage;
  fee: number;
  deadline: number; // day the saga expires if not advanced
  note: string;
}

/** A concrete contract offer (renewal or a new club's personal terms). */
export interface ContractOffer {
  id: string;
  clubId: string;
  kind: 'RENEWAL' | 'TRANSFER';
  wage: number;
  length: number; // years
  signingBonus: number;
  goalBonus: number; // per goal
  releaseClause: number | null;
  rolePromise: SquadStatus;
  deadline: number;
  fee?: number; // transfer fee agreed with the selling club (TRANSFER only)
}

export interface LoanSpell {
  parentClubId: string;
  loanClubId: string;
  until: number; // year
  minutesGuarantee: boolean;
  loanManagerTrust: number;
  appsAtLoan: number;
  goalsAtLoan: number;
}

export interface LoanOffer {
  id: string;
  clubId: string;
  minutesGuarantee: boolean;
  quality: number; // club reputation
  note: string;
  deadline: number;
}

export type PressTone = 'HUMBLE' | 'CONFIDENT' | 'DEFIANT' | 'DIPLOMATIC' | 'CONTROVERSIAL';

export interface PressChoice {
  text: string;
  tone: PressTone;
  fanRating?: number;
  trust?: number;
  relationship?: number;
  rival?: number;
  following?: number;
  controversy?: number;
}

export interface PressPrompt {
  id: string;
  topic: string;
  prompt: string;
  choices: PressChoice[];
}

export interface PressRecord { day: number; topic: string; choice: string }

export type SponsorTier = 'LOCAL' | 'NATIONAL' | 'GLOBAL';

export interface SponsorOffer {
  id: string;
  brand: string;
  tier: SponsorTier;
  value: number; // per year
  length: number;
  goalBonus: number;
  deadline: number;
}

export type LifestyleSlot = 'TRAINING' | 'REST' | 'MEDIA' | 'COMMUNITY' | 'PERSONAL';

export interface Lifestyle {
  routine: Record<LifestyleSlot, number>; // weights summing to ~5 units
  autoManage: boolean;
}

export interface PublicImage {
  persona: string; // Model Professional / Fan Favourite / Outspoken / Bad Boy / Enigma / Unknown
  controversy: number; // 0–100
}

export const DEFAULT_LIFESTYLE: Lifestyle = {
  routine: { TRAINING: 1, REST: 1, MEDIA: 1, COMMUNITY: 1, PERSONAL: 1 },
  autoManage: true,
};
export const DEFAULT_PUBLIC_IMAGE: PublicImage = { persona: 'Unknown', controversy: 0 };
