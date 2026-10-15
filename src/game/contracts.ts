// ---------------------------------------------------------------------------
// Interactive contract negotiation (§ Depth). An agent has demands (wage,
// length, release clause, signing/loyalty bonuses, appearance/goal bonuses, and
// a squad-status promise); the manager makes an offer and the agent accepts,
// counters, or walks away. Pure + deterministic given the same inputs.
// ---------------------------------------------------------------------------

import type { Player, SquadRole } from '../types/player';
import type { Club } from '../types/club';
import { wageDemand } from './transfers';

export interface ContractOffer {
  wage: number;
  years: number;
  releaseClause: number | null;
  signingBonus: number;
  loyaltyBonus: number;
  appearanceBonus: number;
  goalBonus: number;
  squadRole: SquadRole;
}

export type NegotiationOutcome = 'ACCEPT' | 'COUNTER' | 'REJECT';
export interface NegotiationResult {
  outcome: NegotiationOutcome;
  message: string;
  counter?: ContractOffer;
}

const round100 = (n: number) => Math.round(n / 100) * 100;
const round1k = (n: number) => Math.round(n / 1000) * 1000;

/** The squad status a player of this quality expects at this club. */
function expectedRole(player: Player, club: Club): SquadRole {
  const gap = player.overall - club.reputation;
  if (gap >= 6) return 'KEY';
  if (gap >= 1) return 'FIRST';
  if (gap >= -4) return 'ROTATION';
  return 'BACKUP';
}
const ROLE_RANK: Record<SquadRole, number> = { KEY: 5, FIRST: 4, ROTATION: 3, BACKUP: 2, PROSPECT: 1, SURPLUS: 0 };

/** The agent's opening demands — a fair-value starting point for the manager. */
export function agentDemands(player: Player, club: Club, year: number): ContractOffer {
  const gap = player.overall - club.reputation;
  const wage = round100(wageDemand(player) * (1 + Math.max(0, gap) * 0.03) * (player.morale < 45 ? 1.15 : 1));
  const age = year - player.born.year;
  const years = age >= 31 ? 2 : age >= 28 ? 3 : age <= 22 ? 5 : 4;
  // Ambitious / in-demand players want a release clause; loyal ones don't insist.
  const wantsClause = player.hidden.ambition > 60 || gap >= 4;
  const releaseClause = wantsClause ? round1k(player.value * 1.8) : null;
  return {
    wage,
    years,
    releaseClause,
    signingBonus: round1k(wage * 12),
    loyaltyBonus: player.contract.clubId === club.id ? round1k(wage * 8) : 0,
    appearanceBonus: round100(wage * 0.1),
    goalBonus: ROLE_RANK[expectedRole(player, club)] >= 3 ? round100(wage * 0.15) : 0,
    squadRole: expectedRole(player, club),
  };
}

/**
 * How keen a player is to leave his current club, 0 (settled) – 100 (desperate
 * to go). Driven by how far he has outgrown a weaker side (team strength) and how
 * little he actually plays (game time); ambition sharpens it, high morale calms it.
 */
export function leaveWillingness(player: Player, currentClub: Club, appearances: number, clubGames: number): number {
  const gap = player.overall - currentClub.reputation; // a big fish in a small pond
  const playRatio = clubGames > 0 ? Math.min(1, appearances / clubGames) : 0.6;
  let w = 40 + gap * 3.2;
  w += (0.55 - playRatio) * 55;                 // benched → restless; ever-present → happy
  w += (player.hidden.ambition - 55) * 0.5;
  w -= (player.morale - 55) * 0.25;
  return Math.min(100, Math.max(0, Math.round(w)));
}

/** Optional context when prising a player from another club. */
export interface LeaveContext { currentClub?: Club | null; appearances?: number; clubGames?: number }

/** Below this willingness he won't leave his club for any money. */
export const SETTLED_BLOCK = 8;
/** Below this he wants paying more than his usual demands to move. */
const SETTLED_PREMIUM_FROM = 45;

/**
 * The pay rise a settled player needs to uproot himself, as a multiple of his
 * normal wage demands: none for a player happy to go, up to about +55% for one
 * who is very settled.
 */
export function settledWagePremium(willingness: number): number {
  return willingness >= SETTLED_PREMIUM_FROM ? 1 : 1 + (SETTLED_PREMIUM_FROM - willingness) * 0.015;
}

/** How a player at another club feels about joining you, known before any talks. */
export interface TransferStance {
  /** Why he won't come at all, or null if money can do it. */
  blocked: string | null;
  /** Multiple on his usual wage demands (1 = no premium). */
  premium: number;
  /** 0–100, null when there's no current club to leave. */
  willingness: number | null;
}

function isTransfer(club: Club, context?: LeaveContext): context is LeaveContext & { currentClub: Club } {
  return !!context?.currentClub && context.currentClub.id !== club.id;
}

/**
 * Decide up front whether a player would move to `club`, and at what price.
 *
 * This used to be found out only when you sent personal terms, after the fee
 * had already been agreed with his club: "settled and isn't looking to move".
 * Now a player who won't come is known before talks start, and one who's
 * merely settled names a higher wage instead of refusing.
 */
export function transferStance(player: Player, club: Club, context?: LeaveContext): TransferStance {
  if (!isTransfer(club, context)) return { blocked: null, premium: 1, willingness: null };
  const name = player.name.last;
  // Clearly too good for you, ambitious, and unhappy: he wants a bigger stage, not yours.
  if (player.overall - club.reputation >= 12 && player.hidden.ambition > 66 && player.morale < 60) {
    return { blocked: `${name} won't drop down to a club of ${club.shortName}'s level.`, premium: 1, willingness: null };
  }
  const w = leaveWillingness(player, context.currentClub, context.appearances ?? 0, context.clubGames ?? 0);
  if (w < SETTLED_BLOCK) {
    return {
      blocked: `${name} is completely settled at ${context.currentClub.shortName} and won't consider a move, whatever the money.`,
      premium: 1,
      willingness: w,
    };
  }
  return { blocked: null, premium: settledWagePremium(w), willingness: w };
}

/** His demands for joining you from another club: his usual demands, plus any settled premium. */
export function transferDemands(player: Player, club: Club, year: number, context?: LeaveContext): ContractOffer {
  const demand = agentDemands(player, club, year);
  const { premium } = transferStance(player, club, context);
  return premium > 1 ? { ...demand, wage: round100(demand.wage * premium) } : demand;
}

/**
 * Evaluate the manager's offer. Scores each term against the agent's demands;
 * a strong offer is accepted, a near-miss is countered (agent meets you part-way),
 * a poor one (or an unsettled player who wants out) is rejected. When `context`
 * describes his current club, his willingness to leave gates the move.
 */
export function evaluateContractOffer(
  player: Player, club: Club, offer: ContractOffer, year: number, context?: LeaveContext,
): NegotiationResult {
  const name = player.name.last;
  const gap = player.overall - club.reputation;
  const transfer = isTransfer(club, context);

  // A player who has clearly outgrown a modest club won't re-commit at all.
  // (Signing him from elsewhere, the same thing is checked up front instead.)
  if (!transfer && gap >= 12 && player.hidden.ambition > 66 && player.morale < 60) {
    return { outcome: 'REJECT', message: `${name} feels he has outgrown the club and wants to move on.` };
  }
  if (offer.years < 1 || offer.years > 6) {
    return { outcome: 'REJECT', message: 'Contract length must be between 1 and 6 years.' };
  }

  // Prising him from another club. Whether he'd come at all is settled before
  // talks (transferStance); here a settled player simply wants more money,
  // which is built into his demands, and a keen one is easier to please.
  let willingnessAdj = 0;
  if (transfer) {
    const stance = transferStance(player, club, context);
    if (stance.blocked) return { outcome: 'REJECT', message: stance.blocked };
    willingnessAdj = Math.max(0, ((stance.willingness ?? 55) - 55) * 0.35);
  }

  const demand = transfer ? transferDemands(player, club, year, context) : agentDemands(player, club, year);
  let score = 0;

  // Wage is the big lever.
  const wageRatio = offer.wage / Math.max(1, demand.wage);
  score += wageRatio >= 1 ? 40 : wageRatio >= 0.9 ? 20 : wageRatio >= 0.8 ? -10 : -60;
  // Money talks: paying well over the odds can win him round on the rest.
  if (wageRatio >= 1.2) score += 8;

  // Length: within one year of what he wants is fine.
  score += Math.abs(offer.years - demand.years) <= 1 ? 10 : -8;

  // Release clause: wants one → offering a reasonable one pleases; omitting annoys.
  if (demand.releaseClause) {
    if (offer.releaseClause && offer.releaseClause <= demand.releaseClause * 1.4) score += 15;
    else score -= 20;
  } else if (offer.releaseClause && offer.releaseClause < player.value) {
    score -= 10; // an unwanted low clause undersells him
  }

  // Squad status promise.
  const roleDiff = ROLE_RANK[offer.squadRole] - ROLE_RANK[demand.squadRole];
  score += roleDiff >= 0 ? 12 : roleDiff === -1 ? -6 : -25;

  // Bonuses sweeten the deal.
  score += offer.signingBonus >= demand.signingBonus * 0.75 ? 8 : 0;
  score += offer.loyaltyBonus >= demand.loyaltyBonus * 0.75 ? 5 : 0;
  score += (offer.appearanceBonus > 0 || offer.goalBonus > 0) ? 5 : 0;

  // Professional, happy players are easier to please.
  score += (player.hidden.professionalism - 60) / 6;
  score += (player.morale - 60) / 8;
  // How keen he is to leave his current club sways the whole negotiation.
  score += willingnessAdj;

  // A settled player names his price to move, and won't sign for less. Short
  // of it, his agent comes back with that wage rather than a no.
  if (transfer && demand.wage > agentDemands(player, club, year).wage && wageRatio < 0.97) {
    const settledAt = context?.currentClub?.shortName ?? 'his club';
    return {
      outcome: 'COUNTER',
      message: `${name} is settled at ${settledAt}. He'll move for ${demand.wage.toLocaleString()} a week, not less.`,
      counter: { ...offer, wage: demand.wage },
    };
  }

  if (score >= 22) return { outcome: 'ACCEPT', message: `${name} is happy to put pen to paper!` };
  if (score >= -18) {
    // Counter: meet the agent roughly half-way on wage, clause and status.
    const counter: ContractOffer = {
      wage: round100(Math.max(offer.wage, (offer.wage + demand.wage) / 2)),
      years: demand.years,
      releaseClause: demand.releaseClause ?? offer.releaseClause,
      signingBonus: Math.max(offer.signingBonus, demand.signingBonus),
      loyaltyBonus: Math.max(offer.loyaltyBonus, demand.loyaltyBonus),
      appearanceBonus: Math.max(offer.appearanceBonus, demand.appearanceBonus),
      goalBonus: Math.max(offer.goalBonus, demand.goalBonus),
      squadRole: ROLE_RANK[demand.squadRole] > ROLE_RANK[offer.squadRole] ? demand.squadRole : offer.squadRole,
    };
    return { outcome: 'COUNTER', message: `${name}'s agent has come back with revised terms.`, counter };
  }
  return { outcome: 'REJECT', message: `${name}'s agent rejects the offer out of hand.` };
}

/** Apply an accepted offer to the player. */
export function applyContractOffer(player: Player, offer: ContractOffer, year: number): Player {
  return {
    ...player,
    contract: {
      ...player.contract,
      wage: offer.wage,
      startYear: year,
      expiresYear: year + offer.years,
      signingBonus: offer.signingBonus,
      releaseClause: offer.releaseClause,
      bonuses: [
        ...(offer.appearanceBonus > 0 ? [{ type: 'appearance' as const, amount: offer.appearanceBonus }] : []),
        ...(offer.goalBonus > 0 ? [{ type: 'goal' as const, amount: offer.goalBonus }] : []),
      ],
      squadRolePromise: offer.squadRole,
    },
    squadRole: offer.squadRole,
    transferListed: false,
    transferRequested: false,
    morale: Math.min(100, player.morale + 8),
  };
}
