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
 * Evaluate the manager's offer. Scores each term against the agent's demands;
 * a strong offer is accepted, a near-miss is countered (agent meets you part-way),
 * a poor one (or an unsettled player who wants out) is rejected.
 */
export function evaluateContractOffer(
  player: Player, club: Club, offer: ContractOffer, year: number,
): NegotiationResult {
  const name = player.name.last;
  const gap = player.overall - club.reputation;

  // A player who has clearly outgrown a modest club won't re-commit at all.
  if (gap >= 12 && player.hidden.ambition > 66 && player.morale < 60) {
    return { outcome: 'REJECT', message: `${name} feels he has outgrown the club and wants to move on.` };
  }
  if (offer.years < 1 || offer.years > 6) {
    return { outcome: 'REJECT', message: 'Contract length must be between 1 and 6 years.' };
  }

  const demand = agentDemands(player, club, year);
  let score = 0;

  // Wage is the big lever.
  const wageRatio = offer.wage / Math.max(1, demand.wage);
  score += wageRatio >= 1 ? 40 : wageRatio >= 0.9 ? 20 : wageRatio >= 0.8 ? -10 : -60;

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
