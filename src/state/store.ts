// ---------------------------------------------------------------------------
// Zustand game-state store (§4). Holds the in-memory world, exposes the "Play"
// menu orchestration (§3), and bridges to the Dexie persistence layer. Match
// simulation is dispatched to the Web Worker via simClient.
// ---------------------------------------------------------------------------

import { create } from 'zustand';
import type { Club } from '../types/club';
import type { Player, SquadRole } from '../types/player';
import type { Match, LineupProfile } from '../types/match';
import type { Tactics } from '../types/club';
import type { Season } from '../types/league';
import type { SaveMeta } from '../db/db';
import {
  createSave,
  loadSave,
  listSaves,
  deleteSave,
  persistWorld,
  persistMeta,
  putMatches,
  putPlayers,
  putClubs,
  deletePlayers,
} from '../db/db';
import { migrateSave } from '../db/migrations';
import { ageGroupForAge, computeReadiness, ageOfPlayer, ACADEMY_UPGRADE_COST } from '../engine/academy';
import { recordGraduateInAcademy, fillAcademyBands } from '../game/academy';
import { resolveScoutAssignments, SCOUT_TRIP_DAYS, MAX_SCOUT_POSITIONS } from '../engine/youthScouting';
import {
  createLiveMatch, kickOff, tickLiveMatch, startSecondHalf, applyManagerChange, applyTeamTalk, liveOutcome, tickShootout,
  type LiveMatchState, type Side as LiveSide,
} from '../engine/liveMatch';
import { evaluateInteraction, egoOf, type TalkTone, type InteractKind } from '../engine/morale';
import { switchClub } from '../game/careers';
import { setObjective } from '../game/board';
import { evaluateBoardRequest, generatePressQuestion, evaluatePressAnswer, type BoardRequestKind } from '../game/boardroom';
import { areRivals, derbyResultBonus } from '../game/rivalries';
import { generateNarratives } from '../game/narratives';
import { buildNationSquads, nationStrength } from '../engine/nationalTeam';
import { NATION_BY_NAME } from '../data/nations';
import { advanceAllContinental, nextContinentalStop } from '../game/continental/competition';
import { advanceAllDomesticCups, nextDomesticCupStop } from '../game/cups/domesticCups';
import type { PressTone } from '../types/league';
import { traitStrengthMod } from '../game/clubTraits';
import { marketWage } from '../engine/finances';
import type { AcademyPlayer } from '../types/academy';
import type { Position } from '../types/attributes';
import { createNewGame, type NewGameConfig } from '../game/newGame';
import { simulateMatches } from '../engine/simClient';
import type { MatchContext } from '../game/clubTraits';
import { processMatchday } from '../engine/progression';
import { resolveAndRollover } from '../game/season';
import { galaNews } from '../game/gala';
import { runAiToAiTransfers } from '../game/aiTransfers';
import { recordStyleResult } from '../game/aiManagers';
import { isWindowOpen, windowKey, windowOnDate, currentDate } from '../game/gameCalendar';
import type { PendingArrival } from '../types/league';
import {
  evaluateBid,
  applyTransfer,
  weeklyWageBill,
  evaluateRenewal,
  applyRenewal,
  evaluateLoanIn,
  applyLoanMove,
  generateOffers,
  type BidResult,
} from '../game/transfers';
import { agentDemands, evaluateContractOffer, applyContractOffer, type ContractOffer, type NegotiationResult } from '../game/contracts';
import { ACHIEVEMENTS } from '../game/achievements';
import { buildScoutReport } from '../engine/marketScout';
import { physioFactor, scoutingRate, FACILITY_UPGRADE_COST, generateStaffPool, evaluateStaffTerms } from '../engine/staff';
import type { Staff, TrainingFocus } from '../types/staff';
import { bestOverall, overallAt } from '../engine/ratings';
import { bestFormation, assignXI, resolveBench, FORMATIONS, buildLineupProfile } from '../engine/lineup';
import { Rng, clamp, hashSeed } from '../engine/rng';

/** God-mode: shift every attribute by delta and recompute OVR/value. */
function godScale(p: Player, delta: number): Player {
  const a = structuredClone(p.attributes);
  for (const g of [a.technical, a.mental, a.physical, a.goalkeeping]) {
    for (const k of Object.keys(g)) g[k] = clamp(g[k] + delta);
  }
  const overall = bestOverall(a, p.positions).ovr;
  return {
    ...p,
    attributes: a,
    overall,
    potential: Math.max(p.potential, overall),
    value: Math.round(Math.pow(Math.max(0, overall - 40) / 10, 3.2) * 90_000),
  };
}

/** Scale a lineup profile's strength by a Club-DNA multiplier (matches simWorker). */
function scaleProfile(p: LineupProfile, mod: number): LineupProfile {
  if (!mod || mod === 1) return p;
  return { ...p, attack: p.attack * mod, midfield: p.midfield * mod, defense: p.defense * mod, gk: p.gk * mod };
}

// --- Live match (§ Living Match Day) transient refs (not persisted) ---------
let liveRng: Rng | null = null;
interface LiveWork {
  managedSide: LiveSide;
  managerClubId: string;
  matchDay: number;
  formation: string;
  tactics?: import('../types/club').Tactics;
  lineup: (string | null)[];
  bench: (string | null)[];
  managerMod: number; // Club-DNA strength multiplier for the manager's side
  weAreFavourite: boolean;
  squadProfessionalism: number;
  talkMoraleDelta: number; // accumulated team-talk morale, applied at commit
  talkFormDelta: number;
}
let liveWork: LiveWork | null = null;

interface GameState {
  loaded: boolean;
  saving: boolean;
  simming: boolean;
  /** Set by the user to interrupt a long "to season end" sim between chunks. */
  stopRequested: boolean;
  stopSim: () => void;
  meta: SaveMeta | null;
  /** Interactive live match in progress (transient). */
  liveMatch: LiveMatchState | null;
  clubs: Record<string, Club>;
  players: Record<string, Player>;
  matches: Record<string, Match>;
  savesList: SaveMeta[];

  refreshSavesList: () => Promise<void>;
  newGame: (config: NewGameConfig) => Promise<string>;
  load: (saveId: string) => Promise<boolean>;
  remove: (saveId: string) => Promise<void>;
  persist: () => Promise<void>;
  closeSave: () => void;

  // Transfers (§8, M4)
  makeBid: (playerId: string, fee: number, wage: number) => Promise<BidResult>;
  setTransferListed: (playerId: string, listed: boolean) => Promise<void>;
  setLoanListed: (playerId: string, listed: boolean) => Promise<void>;
  setTraining: (playerId: string, plan: { focus?: import('../types/player').PlayerTrainingFocus | null; retrainPosition?: import('../types/attributes').Position | null }) => Promise<void>;
  renewContract: (playerId: string, years: number, wage: number) => Promise<BidResult>;
  contractDemands: (playerId: string) => ContractOffer | null;
  offerContract: (playerId: string, offer: ContractOffer) => Promise<NegotiationResult>;
  respondToTransferRequest: (playerId: string, grant: boolean) => Promise<void>;
  assignMarketScout: (scoutId: string, playerId: string) => Promise<BidResult>;
  completeSigning: (playerId: string, fee: number, offer: ContractOffer) => Promise<BidResult>;
  /** Transfer-window state for the current date (open? which? label). */
  transferWindow: () => { open: boolean; kind: 'SUMMER' | 'WINTER' | null; nextLabel: string; key: string | null };
  loanIn: (playerId: string, years: number, withOption?: boolean) => Promise<BidResult>;
  triggerLoanOption: (playerId: string) => Promise<BidResult>;
  acceptOffer: (offerId: string) => Promise<void>;
  rejectOffer: (offerId: string) => Promise<void>;
  /** Counter an incoming transfer bid with a higher fee; the AI accepts, improves or walks. */
  counterOffer: (offerId: string, counterFee: number) => Promise<string>;
  /** Record that a club broke off talks over an insulting bid (persists in the save). */
  breakOffTalks: (playerId: string) => Promise<void>;

  // Academy (§ Academy)
  setPlayUp: (playerId: string, on: boolean) => Promise<void>;
  setHoldBack: (playerId: string, on: boolean) => Promise<void>;
  promoteToFirstTeam: (playerId: string, role?: SquadRole) => Promise<BidResult>;
  dualRegister: (playerId: string, on: boolean) => Promise<BidResult>;
  demoteToAcademy: (playerId: string) => Promise<BidResult>;
  releaseAcademyPlayer: (playerId: string) => Promise<BidResult>;
  // Youth scouting (§ Academy)
  dispatchScout: (scoutId: string, positions: string[], country: string) => Promise<BidResult>;
  recallScout: (scoutId: string) => Promise<void>;
  trialProspect: (playerId: string) => Promise<BidResult>;
  signYouthProspect: (playerId: string) => Promise<BidResult>;
  // Man-management (§ Man-management)
  interactWithPlayer: (playerId: string, kind: InteractKind) => Promise<BidResult>;

  // QoL
  toggleShortlist: (playerId: string) => Promise<void>;

  // Manager career (§ Manager career)
  acceptJobOffer: (offerId: string) => Promise<BidResult>;
  declineJobOffer: (offerId: string) => Promise<void>;

  // Boardroom & media (§ Boardroom)
  requestFromBoard: (kind: BoardRequestKind) => Promise<BidResult>;
  answerPress: (tone: PressTone) => Promise<BidResult>;

  // International management (§ Internationals)
  appointNationalJob: (nation: string) => Promise<BidResult>;
  resignNationalJob: () => Promise<void>;

  // Academy investment / mentoring (§ Academy)
  upgradeAcademyFacility: (which: 'training' | 'coaching' | 'medical' | 'recruitment') => Promise<BidResult>;
  hireYouthCoach: (staff: Staff, offeredWage?: number) => Promise<BidResult>;
  setMentor: (youngsterId: string, mentorId: string | null) => Promise<void>;
  offerProfessionalTerms: (playerId: string) => Promise<BidResult>;

  // Depth: scouting / staff / facilities / training (§8, M5)
  scoutPlayer: (playerId: string) => Promise<void>;
  hireStaff: (staff: Staff, terms: { wage: number; years: number }) => Promise<string>;
  fireStaff: (staffId: string) => Promise<string>;
  renegotiateStaff: (staffId: string, wage: number, years: number) => Promise<string>;
  refreshStaffMarket: () => Promise<string>;
  upgradeFacility: (which: 'academy' | 'training') => Promise<string>;
  setTrainingFocus: (focus: TrainingFocus) => Promise<void>;

  // Tactics & formation (§8)
  setFormation: (formation: string) => Promise<void>;
  setTactic: (kind: 'defensive' | 'offensive', value: string) => Promise<void>;
  setSetPieceTaker: (role: 'penalty' | 'freeKick' | 'corner', playerId: string) => Promise<void>;
  expandStadium: (seats: number) => Promise<BidResult>;
  setAutoMode: (on: boolean) => Promise<void>;
  setLockFormation: (on: boolean) => Promise<void>;
  setLineupSlot: (index: number, playerId: string | null) => Promise<void>;
  autoFillLineup: () => Promise<void>;
  /** Persist a manually-edited starting XI + bench (drag-and-drop). */
  saveSquad: (lineup: (string | null)[], bench: (string | null)[]) => Promise<void>;

  // God Mode sandbox (§8, M7)
  setGodMode: (on: boolean) => Promise<void>;
  godAddFunds: (amount: number) => Promise<void>;
  godHealSquad: () => Promise<void>;
  godBoostPlayer: (playerId: string, delta: number) => Promise<void>;
  godForceSign: (playerId: string) => Promise<void>;

  // Play menu (§3)
  advanceMatchday: () => Promise<void>;
  simToNextManagerMatch: () => Promise<void>;
  simToSeasonEnd: () => Promise<void>;
  startNextSeason: () => Promise<void>;

  // Living Match Day (§ interactive live match)
  beginLiveMatch: () => Promise<boolean>;
  liveKickOff: () => void;
  liveTeamTalk: (tone: TalkTone) => void;
  tickLive: () => void;
  liveResumeSecondHalf: () => void;
  liveTickShootout: () => void;
  liveSub: (offId: string, onId: string) => void;
  liveSetFormation: (formation: string) => void;
  liveSetTactic: (kind: 'defensive' | 'offensive', value: string) => void;
  finishLive: () => Promise<void>;
  cancelLive: () => void;

  // Selectors / helpers
  getClubPlayers: (clubId: string) => Player[];
  managerClub: () => Club | null;
  currentSeason: () => Season | null;
  currentSeasonMatches: () => Match[];
  managerNextMatch: () => Match | null;
  lastMatchday: () => number;
  seasonComplete: () => boolean;
}

// Remember the most recently played career so a page refresh (or a deep link)
// can resume it instead of dumping the player on the main menu. localStorage is
// unavailable in tests/private windows, so all access is fail-soft.
const LAST_SAVE_KEY = 'fgm:lastSaveId';
function rememberLastSave(id: string | null): void {
  try {
    if (id) localStorage.setItem(LAST_SAVE_KEY, id);
    else localStorage.removeItem(LAST_SAVE_KEY);
  } catch { /* no storage available */ }
}
export function lastSaveId(): string | null {
  try { return localStorage.getItem(LAST_SAVE_KEY); } catch { return null; }
}

export const useGameStore = create<GameState>((set, get) => ({
  loaded: false,
  saving: false,
  simming: false,
  stopRequested: false,
  stopSim: () => set({ stopRequested: true }),
  meta: null,
  liveMatch: null,
  clubs: {},
  players: {},
  matches: {},
  savesList: [],

  refreshSavesList: async () => set({ savesList: await listSaves() }),

  newGame: async (config) => {
    const snapshot = createNewGame(config);
    await createSave(snapshot);
    set({
      loaded: true,
      meta: snapshot.meta,
      clubs: snapshot.clubs,
      players: snapshot.players,
      matches: snapshot.matches,
    });
    rememberLastSave(snapshot.meta.id);
    await get().refreshSavesList();
    return snapshot.meta.id;
  },

  load: async (saveId) => {
    const snap = await loadSave(saveId);
    if (!snap) return false;
    // Run save migrations (e.g. academy backfill) before hydrating state.
    const migrated = migrateSave(snap.meta, snap.clubs, snap.players);
    if (migrated.changed) {
      await persistMeta(migrated.meta);
      await putClubs(migrated.meta.id, Object.values(migrated.clubs));
      await putPlayers(migrated.meta.id, Object.values(migrated.players));
    }
    set({
      loaded: true,
      meta: migrated.meta,
      clubs: migrated.clubs,
      players: migrated.players,
      matches: snap.matches,
    });
    rememberLastSave(saveId);
    return true;
  },

  remove: async (saveId) => {
    await deleteSave(saveId);
    if (get().meta?.id === saveId) get().closeSave();
    if (lastSaveId() === saveId) rememberLastSave(null);
    await get().refreshSavesList();
  },

  persist: async () => {
    const { meta, clubs, players, matches } = get();
    if (!meta) return;
    set({ saving: true });
    try {
      await persistWorld({ meta, clubs, players, matches });
    } finally {
      set({ saving: false });
    }
  },

  closeSave: () => { liveRng = null; liveWork = null; set({ loaded: false, meta: null, liveMatch: null, clubs: {}, players: {}, matches: {} }); },

  // --- Transfers ---------------------------------------------------------

  makeBid: async (playerId, fee, wage) => {
    const { meta, clubs, players } = get();
    if (!meta) return { ok: false, message: 'No active save.' };
    if (meta.ffp?.embargo) return { ok: false, message: 'Under an FFP transfer embargo — you cannot sign players this season.' };
    const player = players[playerId];
    if (!player) return { ok: false, message: 'Player not found.' };
    const buyer = clubs[meta.managerClubId];
    const seller = player.contract.clubId ? clubs[player.contract.clubId] ?? null : null;
    const buyerSquad = get().getClubPlayers(buyer.id);
    const year = get().currentSeason()?.year ?? meta.startYear;
    const res = evaluateBid(buyer, seller, player, fee, wage, weeklyWageBill(buyerSquad), year);
    if (!res.ok) return res;

    const upd = applyTransfer(buyer, seller, player, fee, wage, year);
    const newClubs = { ...clubs, [upd.buyer.id]: upd.buyer };
    if (upd.seller) newClubs[upd.seller.id] = upd.seller;
    const newPlayers = { ...players, [upd.player.id]: upd.player };
    const newsItem = {
      id: `news_sign_${player.id}_${Date.now().toString(36)}`,
      day: meta.currentDay,
      category: 'TRANSFER' as const,
      title: `Signed ${player.name.first} ${player.name.last}`,
      body: `${player.position} joins from ${seller?.shortName ?? 'free agency'} for ${fee.toLocaleString()}.`,
      read: false,
    };
    const newMeta: SaveMeta = { ...meta, news: [...meta.news, newsItem] };
    set({ clubs: newClubs, players: newPlayers, meta: newMeta });

    await putClubs(meta.id, [upd.buyer, ...(upd.seller ? [upd.seller] : [])]);
    await putPlayers(meta.id, [upd.player]);
    await persistMeta(newMeta);
    return res;
  },

  setTransferListed: async (playerId, listed) => {
    const { meta, players } = get();
    if (!meta) return;
    const player = players[playerId];
    if (!player || player.contract.clubId !== meta.managerClubId) return;
    const np = { ...player, transferListed: listed, loanListed: listed ? false : player.loanListed };
    set({ players: { ...players, [playerId]: np } });
    await putPlayers(meta.id, [np]);
  },

  setLoanListed: async (playerId, listed) => {
    const { meta, players } = get();
    if (!meta) return;
    const player = players[playerId];
    if (!player || player.contract.clubId !== meta.managerClubId) return;
    const np = { ...player, loanListed: listed, transferListed: listed ? false : player.transferListed };
    set({ players: { ...players, [playerId]: np } });
    await putPlayers(meta.id, [np]);
  },

  setTraining: async (playerId, plan) => {
    const { meta, players } = get();
    if (!meta) return;
    const player = players[playerId];
    if (!player || player.contract.clubId !== meta.managerClubId) return;
    const prev = player.training ?? {};
    const np: Player = {
      ...player,
      training: {
        focus: plan.focus !== undefined ? plan.focus : prev.focus,
        retrainPosition: plan.retrainPosition !== undefined ? plan.retrainPosition : prev.retrainPosition,
        // Switching (or clearing) the target position restarts the clock.
        retrainProgress: plan.retrainPosition !== undefined && plan.retrainPosition !== prev.retrainPosition ? 0 : prev.retrainProgress ?? 0,
      },
    };
    set({ players: { ...players, [playerId]: np } });
    await putPlayers(meta.id, [np]);
  },

  renewContract: async (playerId, years, wage) => {
    const { meta, clubs, players } = get();
    if (!meta) return { ok: false, message: 'No active save.' };
    const player = players[playerId];
    if (!player || player.contract.clubId !== meta.managerClubId) return { ok: false, message: 'Not your player.' };
    const club = clubs[meta.managerClubId];
    const res = evaluateRenewal(player, club, years, wage);
    if (!res.ok) return res;
    const year = get().currentSeason()?.year ?? meta.startYear;
    const np = applyRenewal(player, years, wage, year);
    set({ players: { ...players, [playerId]: np } });
    await putPlayers(meta.id, [np]);
    return res;
  },

  contractDemands: (playerId) => {
    const { meta, clubs, players } = get();
    if (!meta) return null;
    const player = players[playerId];
    if (!player) return null;
    const club = clubs[meta.managerClubId];
    const year = get().currentSeason()?.year ?? meta.startYear;
    return agentDemands(player, club, year);
  },

  offerContract: async (playerId, offer) => {
    const { meta, clubs, players } = get();
    if (!meta) return { outcome: 'REJECT', message: 'No active save.' };
    const player = players[playerId];
    if (!player || player.contract.clubId !== meta.managerClubId) return { outcome: 'REJECT', message: 'Not your player.' };
    const club = clubs[meta.managerClubId];
    const year = get().currentSeason()?.year ?? meta.startYear;
    // Wage-budget guard (enforced FFP surfaces the hard limit elsewhere).
    const res = evaluateContractOffer(player, club, offer, year);
    if (res.outcome === 'ACCEPT') {
      const np = applyContractOffer(player, offer, year);
      set({ players: { ...players, [playerId]: np } });
      await putPlayers(meta.id, [np]);
    }
    return res;
  },

  respondToTransferRequest: async (playerId, grant) => {
    const { meta, players } = get();
    if (!meta) return;
    const player = players[playerId];
    if (!player) return;
    const np = grant
      ? { ...player, transferListed: true, transferRequested: false }
      : { ...player, transferRequested: false, morale: clamp(player.morale - 12) };
    set({ players: { ...players, [playerId]: np } });
    await putPlayers(meta.id, [np]);
  },

  assignMarketScout: async (scoutId, playerId) => {
    const { meta, clubs, players } = get();
    if (!meta) return { ok: false, message: 'No active save.' };
    const scout = (clubs[meta.managerClubId]?.staff ?? []).find((s) => s.id === scoutId && s.role === 'SCOUT');
    if (!scout) return { ok: false, message: 'That scout is not on your books.' };
    const assignments = meta.playerScoutAssignments ?? [];
    if (assignments.some((a) => a.scoutId === scoutId)) return { ok: false, message: `${scout.name.last} is already out on assignment.` };
    if (assignments.some((a) => a.playerId === playerId)) return { ok: false, message: 'A scout is already assessing this player.' };
    if (!players[playerId]) return { ok: false, message: 'Player not found.' };
    // Faster turnaround for experienced scouts (day indices are strided ×3).
    const exp = scout.scoutProfile?.experience ?? scout.rating;
    const dueDay = meta.currentDay + Math.max(4, Math.min(12, Math.round(13 - exp / 12)));
    const newMeta: SaveMeta = {
      ...meta,
      playerScoutAssignments: [...assignments, { scoutId, playerId, startDay: meta.currentDay, dueDay }],
    };
    set({ meta: newMeta });
    await persistMeta(newMeta);
    return { ok: true, message: `${scout.name.first} ${scout.name.last} is on the road — report due in ~${dueDay - meta.currentDay} days.` };
  },

  transferWindow: () => {
    const { meta } = get();
    if (!meta) return { open: false, kind: null, nextLabel: 'the next window', key: null };
    const maxDay = get().lastMatchday();
    const d = currentDate(meta, maxDay);
    const kind = windowOnDate(d);
    // The next window to open from a shut date: winter (Jan) in autumn, the
    // summer after rollover in spring.
    const nextLabel = kind ? '' : (d.getUTCMonth() >= 8 || d.getUTCMonth() <= 0) ? 'January' : 'the summer window';
    return { open: kind !== null, kind, nextLabel, key: windowKey(meta, maxDay) };
  },

  completeSigning: async (playerId, fee, offer) => {
    const { meta, clubs, players } = get();
    if (!meta) return { ok: false, message: 'No active save.' };
    if (meta.ffp?.embargo) return { ok: false, message: 'Under an FFP transfer embargo — you cannot sign players this season.' };
    const player = players[playerId];
    if (!player) return { ok: false, message: 'Player not found.' };
    const buyer = clubs[meta.managerClubId];
    if (fee > buyer.finances.transferBudget) return { ok: false, message: 'The agreed fee exceeds your transfer budget.' };
    const buyerSquad = get().getClubPlayers(buyer.id);
    if (weeklyWageBill(buyerSquad) + offer.wage > buyer.finances.wageBudget) {
      return { ok: false, message: 'Those wages would breach your wage budget.' };
    }
    const seller = player.contract.clubId ? clubs[player.contract.clubId] ?? null : null;
    const year = get().currentSeason()?.year ?? meta.startYear;
    const win = get().transferWindow();

    // Window shut → deal is done now (fee paid, terms agreed) but the player
    // registers when the next window opens. He keeps playing for his club.
    if (!win.open) {
      const paidBuyer: Club = { ...buyer, finances: { ...buyer.finances, balance: buyer.finances.balance - fee, transferBudget: buyer.finances.transferBudget - fee } };
      const paidSeller = seller ? { ...seller, finances: { ...seller.finances, balance: seller.finances.balance + fee, transferBudget: seller.finances.transferBudget + Math.round(fee * 0.6) } } : null;
      const arrival: PendingArrival = {
        playerId, toClubId: buyer.id, fee, wage: offer.wage, years: offer.years,
        releaseClause: offer.releaseClause ?? null, playerName: `${player.name.first} ${player.name.last}`,
        arriveLabel: win.nextLabel,
      };
      const newClubs = { ...clubs, [paidBuyer.id]: paidBuyer };
      if (paidSeller) newClubs[paidSeller.id] = paidSeller;
      const news = {
        id: `news_predeal_${player.id}_${Date.now().toString(36)}`, day: meta.currentDay, category: 'TRANSFER' as const,
        title: `Pre-agreed: ${player.name.first} ${player.name.last}`,
        body: `Deal done with ${seller?.shortName ?? 'the player'} for ${fee.toLocaleString()} — he joins in ${win.nextLabel}. He stays with his club until the window opens.`,
        read: false,
      };
      const reports = { ...(meta.scoutReports ?? {}) }; delete reports[playerId];
      const newMeta: SaveMeta = {
        ...meta, news: [...meta.news, news], scoutReports: reports,
        pendingArrivals: [...(meta.pendingArrivals ?? []), arrival],
        playerScoutAssignments: (meta.playerScoutAssignments ?? []).filter((a) => a.playerId !== playerId),
      };
      set({ clubs: newClubs, meta: newMeta });
      await putClubs(meta.id, [paidBuyer, ...(paidSeller ? [paidSeller] : [])]);
      await persistMeta(newMeta);
      return { ok: true, message: `${player.name.last} agreed — he joins in ${win.nextLabel}.` };
    }

    const upd = applyTransfer(buyer, seller, player, fee, offer.wage, year);
    const signed = applyContractOffer(upd.player, offer, year);
    const newClubs = { ...clubs, [upd.buyer.id]: upd.buyer };
    if (upd.seller) newClubs[upd.seller.id] = upd.seller;
    const news = {
      id: `news_sign_${player.id}_${Date.now().toString(36)}`, day: meta.currentDay, category: 'TRANSFER' as const,
      title: `Signed ${player.name.first} ${player.name.last}`,
      body: `${player.position} joins from ${seller?.shortName ?? 'free agency'} for ${fee.toLocaleString()} on ${offer.wage.toLocaleString()}/wk.`,
      read: false,
    };
    // Clear any scout report/assignment now that he's ours.
    const reports = { ...(meta.scoutReports ?? {}) }; delete reports[playerId];
    const newMeta: SaveMeta = {
      ...meta, news: [...meta.news, news], scoutReports: reports,
      playerScoutAssignments: (meta.playerScoutAssignments ?? []).filter((a) => a.playerId !== playerId),
    };
    set({ clubs: newClubs, players: { ...players, [playerId]: signed }, meta: newMeta });
    await putClubs(meta.id, [upd.buyer, ...(upd.seller ? [upd.seller] : [])]);
    await putPlayers(meta.id, [signed]);
    await persistMeta(newMeta);
    return { ok: true, message: `${player.name.last} signs!` };
  },

  loanIn: async (playerId, years, withOption = false) => {
    const { meta, clubs, players } = get();
    if (!meta) return { ok: false, message: 'No active save.' };
    if (meta.ffp?.embargo) return { ok: false, message: 'Under an FFP transfer embargo — no loan moves this season.' };
    if (!get().transferWindow().open) return { ok: false, message: 'The transfer window is shut — loans can only be arranged when it is open.' };
    const player = players[playerId];
    if (!player) return { ok: false, message: 'Player not found.' };
    const toClub = clubs[meta.managerClubId];
    const fromClub = player.contract.clubId ? clubs[player.contract.clubId] : null;
    if (!fromClub || fromClub.id === toClub.id) return { ok: false, message: 'Cannot loan this player.' };
    const res = evaluateLoanIn(player, toClub, years);
    if (!res.ok) return res;
    const year = get().currentSeason()?.year ?? meta.startYear;
    // An option to buy is agreed at a slight premium to the player's value.
    const option = withOption ? Math.round(player.value * 1.1) : null;
    const mv = applyLoanMove(player, fromClub, toClub, year + years, 0.5, option);
    set({
      clubs: { ...clubs, [mv.fromClub.id]: mv.fromClub, [mv.toClub.id]: mv.toClub },
      players: { ...players, [mv.player.id]: mv.player },
    });
    await putClubs(meta.id, [mv.fromClub, mv.toClub]);
    await putPlayers(meta.id, [mv.player]);
    return { ok: true, message: option ? `${res.message} Option to buy: ${option.toLocaleString()}.` : res.message };
  },

  triggerLoanOption: async (playerId) => {
    const { meta, clubs, players } = get();
    if (!meta) return { ok: false, message: 'No active save.' };
    if (meta.ffp?.embargo) return { ok: false, message: 'Under an FFP transfer embargo — you cannot buy this season.' };
    const player = players[playerId];
    if (!player?.loan || player.contract.clubId !== meta.managerClubId) return { ok: false, message: 'Not on loan at your club.' };
    const fee = player.loan.optionToBuy;
    if (fee == null) return { ok: false, message: 'No option to buy was agreed on this loan.' };
    const buyer = clubs[meta.managerClubId];
    if (fee > buyer.finances.transferBudget) return { ok: false, message: 'The option fee exceeds your transfer budget.' };
    const parent = clubs[player.loan.parentClubId] ?? null;
    const year = get().currentSeason()?.year ?? meta.startYear;
    // Make the move permanent: pay the option fee, clear the loan.
    const upd = applyTransfer(buyer, parent, { ...player, loan: null }, fee, player.contract.wage, year);
    const permanent = { ...upd.player, loan: null };
    const newClubs = { ...clubs, [upd.buyer.id]: upd.buyer };
    if (upd.seller) newClubs[upd.seller.id] = upd.seller;
    const news = { id: `news_optbuy_${playerId}_${meta.currentDay}`, day: meta.currentDay, category: 'TRANSFER' as const, title: `${player.name.last} signed permanently`, body: `Option to buy triggered — ${player.name.first} ${player.name.last} joins for ${fee.toLocaleString()}.`, read: false };
    const newMeta: SaveMeta = { ...meta, news: [...meta.news, news] };
    set({ clubs: newClubs, players: { ...players, [playerId]: permanent }, meta: newMeta });
    await putClubs(meta.id, [upd.buyer, ...(upd.seller ? [upd.seller] : [])]);
    await putPlayers(meta.id, [permanent]);
    await persistMeta(newMeta);
    return { ok: true, message: `${player.name.last} signed permanently for ${fee.toLocaleString()}.` };
  },

  acceptOffer: async (offerId) => {
    const { meta, clubs, players } = get();
    if (!meta) return;
    const offer = (meta.pendingOffers ?? []).find((o) => o.id === offerId);
    if (!offer) return;
    const player = players[offer.playerId];
    const managerClub = clubs[meta.managerClubId];
    const aiClub = clubs[offer.fromClubId];
    if (!player || !aiClub) return;
    const year = get().currentSeason()?.year ?? meta.startYear;

    const newClubs = { ...clubs };
    const newPlayers = { ...players };
    let academies = meta.academies;
    const extraNews: typeof meta.news = [];
    let body = '';
    if (offer.type === 'BUY') {
      const upd = applyTransfer(aiClub, managerClub, player, offer.fee, offer.wage, year);
      newClubs[aiClub.id] = upd.buyer;
      if (upd.seller) newClubs[managerClub.id] = upd.seller;
      newPlayers[player.id] = upd.player;
      body = `Sold ${player.name.first} ${player.name.last} to ${aiClub.shortName} for ${offer.fee.toLocaleString()}.`;
      // Sell-on of an academy product: near-pure profit + a reputation boost for
      // the academy (the flywheel), recorded in the graduate's legacy (Idea 14).
      if (player.academyGraduateOf === managerClub.id && meta.academies?.[managerClub.id]) {
        const ac = meta.academies[managerClub.id];
        const graduates = ac.graduates.map((g) => (g.playerId === player.id ? { ...g, saleFee: offer.fee } : g));
        academies = { ...meta.academies, [managerClub.id]: { ...ac, graduates, reputation: clamp(ac.reputation + Math.min(8, 2 + offer.fee / 20_000_000), 0, 100) } };
        extraNews.push({ id: `news_sellon_${offerId}`, day: meta.currentDay, category: 'BOARD' as const, title: 'Academy product sold for profit', body: `${player.name.last} came through your academy — his ${offer.fee.toLocaleString()} fee is near-pure profit, and your academy's stock rises.`, read: false });
      }
    } else {
      const mv = applyLoanMove(player, managerClub, aiClub, offer.loanUntilYear ?? year + 1, offer.wageSplitParent ?? 0.5);
      newClubs[mv.fromClub.id] = mv.fromClub;
      newClubs[mv.toClub.id] = mv.toClub;
      newPlayers[mv.player.id] = mv.player;
      body = `Loaned ${player.name.first} ${player.name.last} to ${aiClub.shortName} until ${offer.loanUntilYear}.`;
    }
    const newsItem = { id: `news_offer_${offerId}`, day: meta.currentDay, category: 'TRANSFER' as const, title: 'Deal completed', body, read: false };
    const newMeta: SaveMeta = { ...meta, academies, pendingOffers: (meta.pendingOffers ?? []).filter((o) => o.id !== offerId), news: [...meta.news, newsItem, ...extraNews] };
    set({ clubs: newClubs, players: newPlayers, meta: newMeta });
    await putClubs(meta.id, Object.values(newClubs).filter((c) => c.id === aiClub.id || c.id === managerClub.id));
    await putPlayers(meta.id, [newPlayers[player.id]]);
    await persistMeta(newMeta);
  },

  rejectOffer: async (offerId) => {
    const { meta } = get();
    if (!meta) return;
    const newMeta: SaveMeta = { ...meta, pendingOffers: (meta.pendingOffers ?? []).filter((o) => o.id !== offerId) };
    set({ meta: newMeta });
    await persistMeta(newMeta);
  },

  counterOffer: async (offerId, counterFee) => {
    const { meta, clubs, players } = get();
    if (!meta) return 'No active save.';
    const offers = meta.pendingOffers ?? [];
    const offer = offers.find((o) => o.id === offerId);
    if (!offer) return 'That offer has expired.';
    if (offer.type !== 'BUY') return 'Only transfer bids can be negotiated, not loans.';
    if (counterFee <= offer.fee) return 'Ask for more than they already offered.';
    const player = players[offer.playerId];
    const buyer = clubs[offer.fromClubId];
    const name = buyer?.shortName ?? 'The club';
    // How high they'll actually go: driven by their bid and the player's value.
    const ceiling = Math.round(Math.max(offer.fee * 1.4, (player?.value ?? offer.fee) * 1.2));

    if (counterFee <= ceiling) {
      // They meet your valuation — complete the sale at the countered fee.
      const updated = offers.map((o) => (o.id === offerId ? { ...o, fee: counterFee } : o));
      set({ meta: { ...meta, pendingOffers: updated } });
      await get().acceptOffer(offerId);
      return `${name} agree to your ${counterFee.toLocaleString()} valuation — deal done.`;
    }
    if (counterFee > ceiling * 1.3) {
      // Too greedy — they walk away entirely.
      const news = { id: `news_counterwalk_${offerId}`, day: meta.currentDay, category: 'TRANSFER' as const, title: `${name} end their interest`, body: `${name} balk at your ${counterFee.toLocaleString()} demand and pull out of the deal.`, read: false };
      const newMeta: SaveMeta = { ...meta, pendingOffers: offers.filter((o) => o.id !== offerId), news: [...meta.news, news] };
      set({ meta: newMeta });
      await persistMeta(newMeta);
      return `${name} refuse and walk away from the deal.`;
    }
    // In between — they won't match you, but improve their bid to their ceiling.
    const updated = offers.map((o) => (o.id === offerId ? { ...o, fee: ceiling } : o));
    const newMeta: SaveMeta = { ...meta, pendingOffers: updated };
    set({ meta: newMeta });
    await persistMeta(newMeta);
    return `${name} won't go that high, but improve their bid to ${ceiling.toLocaleString()}.`;
  },

  breakOffTalks: async (playerId) => {
    const { meta } = get();
    if (!meta) return;
    const key = get().transferWindow().key;
    const newMeta: SaveMeta = {
      ...meta,
      brokenTalks: { ...(meta.brokenTalks ?? {}), [playerId]: { key, day: meta.currentDay } },
    };
    set({ meta: newMeta });
    await persistMeta(newMeta);
  },

  // --- Academy (§ Academy) ----------------------------------------------

  setPlayUp: async (playerId, on) => {
    const { meta } = get();
    if (!meta) return;
    const ap = meta.academyPlayers?.[playerId];
    if (!ap || ap.clubId !== meta.managerClubId) return;
    const academyPlayers = { ...meta.academyPlayers, [playerId]: { ...ap, playedUp: on, heldBack: on ? false : ap.heldBack } };
    const newMeta: SaveMeta = { ...meta, academyPlayers };
    set({ meta: newMeta });
    await persistMeta(newMeta);
  },

  setHoldBack: async (playerId, on) => {
    const { meta } = get();
    if (!meta) return;
    const ap = meta.academyPlayers?.[playerId];
    if (!ap || ap.clubId !== meta.managerClubId) return;
    const academyPlayers = { ...meta.academyPlayers, [playerId]: { ...ap, heldBack: on, playedUp: on ? false : ap.playedUp } };
    const newMeta: SaveMeta = { ...meta, academyPlayers };
    set({ meta: newMeta });
    await persistMeta(newMeta);
  },

  promoteToFirstTeam: async (playerId, role = 'PROSPECT') => {
    const { meta, clubs, players } = get();
    if (!meta) return { ok: false, message: 'No active save.' };
    const ap = meta.academyPlayers?.[playerId];
    const player = players[playerId];
    if (!ap || !player || ap.clubId !== meta.managerClubId) return { ok: false, message: 'Not an academy player of yours.' };
    const club = clubs[meta.managerClubId];
    const np: Player = {
      ...player,
      contract: { ...player.contract, clubId: club.id, wage: Math.max(player.contract.wage, marketWage(player.overall)) },
      academyClubId: undefined,
      academyGraduateOf: club.id,
      squadRole: role,
    };
    const academyPlayers = { ...meta.academyPlayers };
    delete academyPlayers[playerId];
    // Record the graduate in the academy's legacy (graduates + "Class of" cohort).
    const year = get().currentSeason()?.year ?? meta.startYear;
    const academies = meta.academies ? { ...meta.academies, [club.id]: recordGraduateInAcademy(meta.academies[club.id], np, year) } : meta.academies;
    const newClub = { ...club, playerIds: club.playerIds.includes(np.id) ? club.playerIds : [...club.playerIds, np.id] };
    const newMeta: SaveMeta = { ...meta, academyPlayers, academies };
    set({ players: { ...players, [playerId]: np }, clubs: { ...clubs, [club.id]: newClub }, meta: newMeta });
    await putPlayers(meta.id, [np]);
    await putClubs(meta.id, [newClub]);
    await persistMeta(newMeta);
    return { ok: true, message: `${player.name.last} promoted to the first team.` };
  },

  dualRegister: async (playerId, on) => {
    const { meta, clubs, players } = get();
    if (!meta) return { ok: false, message: 'No active save.' };
    const ap = meta.academyPlayers?.[playerId];
    const player = players[playerId];
    if (!ap || !player || ap.clubId !== meta.managerClubId) return { ok: false, message: 'Not an academy player of yours.' };
    const club = clubs[meta.managerClubId];
    // On: register to the first team while staying in the academy. Off: academy-only.
    const np: Player = {
      ...player,
      contract: { ...player.contract, clubId: on ? club.id : null, wage: on ? Math.max(player.contract.wage, marketWage(player.overall)) : player.contract.wage },
      academyClubId: club.id,
    };
    const academyPlayers = { ...meta.academyPlayers, [playerId]: { ...ap, dualRegistered: on } };
    const playerIds = on
      ? (club.playerIds.includes(np.id) ? club.playerIds : [...club.playerIds, np.id])
      : club.playerIds.filter((id) => id !== np.id);
    const newClub = { ...club, playerIds };
    const newMeta: SaveMeta = { ...meta, academyPlayers };
    set({ players: { ...players, [playerId]: np }, clubs: { ...clubs, [club.id]: newClub }, meta: newMeta });
    await putPlayers(meta.id, [np]);
    await putClubs(meta.id, [newClub]);
    await persistMeta(newMeta);
    return { ok: true, message: on ? `${player.name.last} dual-registered with the first team.` : `${player.name.last} returned to academy-only duty.` };
  },

  demoteToAcademy: async (playerId) => {
    const { meta, clubs, players } = get();
    if (!meta) return { ok: false, message: 'No active save.' };
    const player = players[playerId];
    if (!player || player.contract.clubId !== meta.managerClubId) return { ok: false, message: 'Not your first-team player.' };
    const year = get().currentSeason()?.year ?? meta.startYear;
    const age = ageOfPlayer(player, year);
    if (age > 18) return { ok: false, message: 'Only players aged 18 or younger can be demoted to the academy.' };
    const club = clubs[meta.managerClubId];
    const np: Player = { ...player, contract: { ...player.contract, clubId: null }, academyClubId: club.id, squadRole: 'PROSPECT' };
    const firstTeamAvg = Math.max(50, club.reputation * 0.85);
    const existing = meta.academyPlayers?.[playerId];
    const prof = clamp(player.hidden?.professionalism ?? 55);
    const amb = clamp(player.hidden?.ambition ?? 55);
    const det = clamp(player.hidden?.consistency ?? 55);
    const ap: AcademyPlayer = existing
      ? { ...existing, dualRegistered: false, ageGroup: ageGroupForAge(age) }
      : {
          playerId, clubId: club.id, ageGroup: ageGroupForAge(age), playedUp: false, heldBack: false,
          ageGroupPerformance: 55, readiness: computeReadiness(player.overall, player.potential, 55, firstTeamAvg),
          contractStatus: age >= 17 ? 'professional' : 'scholar', dualRegistered: false,
          personality: { determination: det, professionalism: prof, ambition: amb },
          flameOutRisk: clamp(0.5 - (prof + det + amb) / 600, 0, 0.5) as number, isProdigy: false,
        };
    const academyPlayers = { ...meta.academyPlayers, [playerId]: ap };
    const newClub = { ...club, playerIds: club.playerIds.filter((id) => id !== playerId) };
    const newMeta: SaveMeta = { ...meta, academyPlayers };
    set({ players: { ...players, [playerId]: np }, clubs: { ...clubs, [club.id]: newClub }, meta: newMeta });
    await putPlayers(meta.id, [np]);
    await putClubs(meta.id, [newClub]);
    await persistMeta(newMeta);
    return { ok: true, message: `${player.name.last} sent down to the academy.` };
  },

  // Release any academy prospect for free: drops the overlay and removes the
  // player from the world entirely (no compensation, no squad slot involved).
  releaseAcademyPlayer: async (playerId) => {
    const { meta, clubs, players } = get();
    if (!meta) return { ok: false, message: 'No active save.' };
    const ap = meta.academyPlayers?.[playerId];
    const player = players[playerId];
    if (!ap || !player || ap.clubId !== meta.managerClubId) return { ok: false, message: 'Not an academy player of yours.' };
    const academyPlayers = { ...meta.academyPlayers };
    delete academyPlayers[playerId];
    const club = clubs[meta.managerClubId];
    // In case the youngster was dual-registered, clear him from the squad too.
    const newClub = { ...club, playerIds: club.playerIds.filter((id) => id !== playerId) };
    const newPlayers = { ...players };
    delete newPlayers[playerId];
    const newMeta: SaveMeta = { ...meta, academyPlayers };
    set({ players: newPlayers, clubs: { ...clubs, [club.id]: newClub }, meta: newMeta });
    await deletePlayers(meta.id, [playerId]);
    await putClubs(meta.id, [newClub]);
    await persistMeta(newMeta);
    return { ok: true, message: `${player.name.first} ${player.name.last} released from the academy.` };
  },

  // --- Youth scouting (§ Academy) ---------------------------------------

  dispatchScout: async (scoutId, positions, country) => {
    const { meta, clubs } = get();
    if (!meta) return { ok: false, message: 'No active save.' };
    if (positions.length < 1 || positions.length > MAX_SCOUT_POSITIONS) {
      return { ok: false, message: `Pick 1–${MAX_SCOUT_POSITIONS} target positions.` };
    }
    if (!country) return { ok: false, message: 'Pick a target country.' };
    const club = clubs[meta.managerClubId];
    const scout = (club.staff ?? []).find((s) => s.id === scoutId && s.role === 'SCOUT');
    if (!scout) return { ok: false, message: 'Unknown scout.' };
    const assignments = meta.scoutAssignments ?? [];
    if (assignments.some((a) => a.scoutId === scoutId)) return { ok: false, message: `${scout.name.last} is already on a trip.` };
    const newAssignment = { scoutId, positions: positions as Position[], country, durationRemaining: SCOUT_TRIP_DAYS, progress: 0, foundPlayerIds: [] };
    const newMeta: SaveMeta = { ...meta, scoutAssignments: [...assignments, newAssignment] };
    set({ meta: newMeta });
    await persistMeta(newMeta);
    return { ok: true, message: `${scout.name.last} dispatched to ${country}.` };
  },

  recallScout: async (scoutId) => {
    const { meta } = get();
    if (!meta) return;
    const newMeta: SaveMeta = { ...meta, scoutAssignments: (meta.scoutAssignments ?? []).filter((a) => a.scoutId !== scoutId) };
    set({ meta: newMeta });
    await persistMeta(newMeta);
  },

  trialProspect: async (playerId) => {
    const { meta, clubs } = get();
    if (!meta) return { ok: false, message: 'No active save.' };
    const prospects = meta.youthProspects ?? [];
    const idx = prospects.findIndex((p) => p.player.id === playerId);
    if (idx < 0) return { ok: false, message: 'Prospect not found.' };
    if (prospects[idx].trialled) return { ok: false, message: 'Already trialled.' };
    const club = clubs[meta.managerClubId];
    const cost = 25_000;
    if (club.finances.balance < cost) return { ok: false, message: 'Not enough funds for a trial.' };
    const updated = [...prospects];
    updated[idx] = { ...updated[idx], trialled: true, knowledgePct: Math.max(updated[idx].knowledgePct, 90) };
    const newClub = { ...club, finances: { ...club.finances, balance: club.finances.balance - cost } };
    const newMeta: SaveMeta = { ...meta, youthProspects: updated };
    set({ meta: newMeta, clubs: { ...clubs, [club.id]: newClub } });
    await putClubs(meta.id, [newClub]);
    await persistMeta(newMeta);
    return { ok: true, message: 'Trial complete — the report is now reliable.' };
  },

  signYouthProspect: async (playerId) => {
    const { meta, clubs, players } = get();
    if (!meta) return { ok: false, message: 'No active save.' };
    const prospects = meta.youthProspects ?? [];
    const prospect = prospects.find((p) => p.player.id === playerId);
    if (!prospect) return { ok: false, message: 'Prospect not found.' };
    const club = clubs[meta.managerClubId];
    // Enroll into the academy (parallel roster).
    const np: Player = { ...prospect.player, contract: { ...prospect.player.contract, clubId: null }, academyClubId: club.id, squadRole: 'PROSPECT' };
    const academyPlayers = { ...meta.academyPlayers, [playerId]: { ...prospect.academy, clubId: club.id } };
    const newMeta: SaveMeta = { ...meta, academyPlayers, youthProspects: prospects.filter((p) => p.player.id !== playerId) };
    set({ players: { ...players, [playerId]: np }, meta: newMeta });
    await putPlayers(meta.id, [np]);
    await persistMeta(newMeta);
    return { ok: true, message: `${prospect.player.name.last} signed to the academy.` };
  },

  upgradeAcademyFacility: async (which) => {
    const { meta, clubs } = get();
    if (!meta) return { ok: false, message: 'No active save.' };
    const academy = meta.academies?.[meta.managerClubId];
    const club = clubs[meta.managerClubId];
    if (!academy) return { ok: false, message: 'No academy.' };
    const level = academy.facilities[which];
    if (level >= 5) return { ok: false, message: 'Already at the maximum level.' };
    const cost = ACADEMY_UPGRADE_COST(level);
    if (club.finances.balance < cost) return { ok: false, message: `Need ${cost.toLocaleString()} to upgrade.` };
    const newAcademy = { ...academy, facilities: { ...academy.facilities, [which]: level + 1 } };
    const newClub = { ...club, finances: { ...club.finances, balance: club.finances.balance - cost } };
    const newMeta: SaveMeta = { ...meta, academies: { ...meta.academies, [meta.managerClubId]: newAcademy } };
    set({ meta: newMeta, clubs: { ...clubs, [club.id]: newClub } });
    await putClubs(meta.id, [newClub]);
    await persistMeta(newMeta);
    return { ok: true, message: `${which[0].toUpperCase() + which.slice(1)} upgraded to level ${level + 1}.` };
  },

  hireYouthCoach: async (staff, offeredWage) => {
    const { meta, clubs } = get();
    if (!meta) return { ok: false, message: 'No active save.' };
    const academy = meta.academies?.[meta.managerClubId];
    const club = clubs[meta.managerClubId];
    if (!academy) return { ok: false, message: 'No academy.' };
    if (academy.youthCoachIds.length >= 5) return { ok: false, message: 'Youth coaching staff is full (max 5).' };
    // No minimum: offer any wage. He accepts at/above his asking wage, counters
    // on a low bid, and walks away from an insulting one.
    const wants = staff.wage;
    const wage = offeredWage ?? wants;
    if (wage < wants * 0.55) {
      // He's gone for good — remember it in the save so he stays gone.
      const walkMeta: SaveMeta = { ...meta, walkedStaff: { ...(meta.walkedStaff ?? {}), [staff.id]: meta.currentDay } };
      set({ meta: walkMeta });
      await persistMeta(walkMeta);
      return { ok: false, message: `${staff.name.last} is insulted by ${wage.toLocaleString()}/wk and walks away.` };
    }
    if (wage < wants) {
      return { ok: false, message: `${staff.name.last} wants at least ${wants.toLocaleString()}/wk — offer more.` };
    }
    const year = get().currentSeason()?.year ?? meta.startYear;
    const hired: Staff = { ...staff, wage, clubId: club.id, expiresYear: year + 2 };
    const newClub = { ...club, staff: [...(club.staff ?? []), hired] };
    const newAcademy = { ...academy, youthCoachIds: [...academy.youthCoachIds, hired.id] };
    const newMeta: SaveMeta = { ...meta, academies: { ...meta.academies, [meta.managerClubId]: newAcademy } };
    set({ meta: newMeta, clubs: { ...clubs, [club.id]: newClub } });
    await putClubs(meta.id, [newClub]);
    await persistMeta(newMeta);
    return { ok: true, message: `Hired youth coach ${staff.name.last} at ${wage.toLocaleString()}/wk (rating ${staff.rating}).` };
  },

  setMentor: async (youngsterId, mentorId) => {
    const { meta, players } = get();
    if (!meta) return;
    const ap = meta.academyPlayers?.[youngsterId];
    if (!ap || ap.clubId !== meta.managerClubId) return;
    // Only veterans (33+) may mentor.
    if (mentorId) {
      const year = get().currentSeason()?.year ?? meta.startYear;
      const mentor = players[mentorId];
      if (!mentor || year - mentor.born.year < 33) return;
    }
    const academyPlayers = { ...meta.academyPlayers, [youngsterId]: { ...ap, mentorId: mentorId ?? undefined } };
    const newMeta: SaveMeta = { ...meta, academyPlayers };
    set({ meta: newMeta });
    await persistMeta(newMeta);
  },

  offerProfessionalTerms: async (playerId) => {
    const { meta, players } = get();
    if (!meta) return { ok: false, message: 'No active save.' };
    const ap = meta.academyPlayers?.[playerId];
    if (!ap || ap.clubId !== meta.managerClubId) return { ok: false, message: 'Not an academy player of yours.' };
    if (ap.contractStatus === 'professional') return { ok: false, message: 'Already on professional terms.' };
    const year = get().currentSeason()?.year ?? meta.startYear;
    const age = year - (players[playerId]?.born.year ?? year);
    if (age < 16) return { ok: false, message: 'A professional contract can only be offered from age 16.' };
    const academyPlayers = { ...meta.academyPlayers, [playerId]: { ...ap, contractStatus: 'professional' as const } };
    const newMeta: SaveMeta = { ...meta, academyPlayers };
    set({ meta: newMeta });
    await persistMeta(newMeta);
    return { ok: true, message: `${players[playerId]?.name.last ?? 'Player'} signed professional terms — safe from poaching.` };
  },

  // --- Depth systems (M5) ------------------------------------------------

  scoutPlayer: async (playerId) => {
    const { meta } = get();
    if (!meta) return;
    const scouting = { ...(meta.scouting ?? {}) };
    if (scouting[playerId] === undefined) scouting[playerId] = 15; // begin assessment
    const newMeta: SaveMeta = { ...meta, scouting };
    set({ meta: newMeta });
    await persistMeta(newMeta);
  },

  hireStaff: async (staff, terms) => {
    const { meta, clubs } = get();
    if (!meta) return 'No save.';
    if (!get().transferWindow().open) return 'The staff market is shut — you can only hire during a transfer window.';
    const club = clubs[meta.managerClubId];
    const year = get().currentSeason()?.year ?? meta.startYear;
    const res = evaluateStaffTerms(staff, terms.wage, terms.years);
    if (res.outcome === 'WALK') {
      // Insulting bid — he breaks off talks and leaves the market.
      const walkMeta: SaveMeta = { ...meta, staffMarket: (meta.staffMarket ?? []).filter((s) => s.id !== staff.id) };
      set({ meta: walkMeta });
      await persistMeta(walkMeta);
      return res.message;
    }
    if (!res.ok) return res.message; // counter — keep negotiating
    const hired: Staff = { ...staff, clubId: club.id, wage: terms.wage, expiresYear: year + terms.years };
    const updated = { ...club, staff: [...(club.staff ?? []), hired] };
    const newMeta: SaveMeta = { ...meta, staffMarket: (meta.staffMarket ?? []).filter((s) => s.id !== staff.id) };
    set({ clubs: { ...clubs, [club.id]: updated }, meta: newMeta });
    await putClubs(meta.id, [updated]);
    await persistMeta(newMeta);
    return `Hired ${staff.name.first} ${staff.name.last} — ${terms.wage.toLocaleString()}/wk until ${year + terms.years}.`;
  },

  fireStaff: async (staffId) => {
    const { meta, clubs } = get();
    if (!meta) return 'No save.';
    const club = clubs[meta.managerClubId];
    const s = (club.staff ?? []).find((x) => x.id === staffId);
    if (!s) return 'Staff member not found.';
    const year = get().currentSeason()?.year ?? meta.startYear;
    // Pay up the rest of the contract (min half a season of severance).
    const yearsLeft = Math.max(0.5, (s.expiresYear ?? year + 1) - year);
    const severance = Math.round(s.wage * 52 * yearsLeft);
    const updated: Club = {
      ...club,
      staff: (club.staff ?? []).filter((x) => x.id !== staffId),
      finances: {
        ...club.finances,
        balance: club.finances.balance - severance,
        transferBudget: Math.max(0, club.finances.transferBudget - Math.round(severance * 0.5)),
      },
    };
    set({ clubs: { ...clubs, [club.id]: updated } });
    await putClubs(meta.id, [updated]);
    return `${s.name.first} ${s.name.last} let go — ${severance.toLocaleString()} paid to settle the ${yearsLeft % 1 ? yearsLeft.toFixed(1) : yearsLeft}-year contract.`;
  },

  renegotiateStaff: async (staffId, wage, years) => {
    const { meta, clubs } = get();
    if (!meta) return 'No save.';
    const club = clubs[meta.managerClubId];
    const s = (club.staff ?? []).find((x) => x.id === staffId);
    if (!s) return 'Staff member not found.';
    const year = get().currentSeason()?.year ?? meta.startYear;
    const res = evaluateStaffTerms(s, wage, years);
    if (!res.ok) return res.message;
    const updated: Club = {
      ...club,
      staff: (club.staff ?? []).map((x) => (x.id === staffId ? { ...x, wage, expiresYear: year + years } : x)),
    };
    set({ clubs: { ...clubs, [club.id]: updated } });
    await putClubs(meta.id, [updated]);
    return `${s.name.last} signs new terms — ${wage.toLocaleString()}/wk until ${year + years}.`;
  },

  refreshStaffMarket: async () => {
    const { meta } = get();
    if (!meta) return 'No save.';
    const maxDay = get().lastMatchday();
    const wk = windowKey(meta, maxDay);
    const firstSeed = !meta.staffMarket; // silent one-time init, never gated
    if (!firstSeed) {
      if (!wk) return 'The staff market is shut until the next transfer window.';
      const prev = meta.staffRefreshes;
      const used = prev && prev.windowKey === wk ? prev.used : 0;
      if (used >= 3) return 'No refreshes left this window (3 per window).';
    }
    const rng = new Rng((meta.seed ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);
    const staffRefreshes = firstSeed
      ? meta.staffRefreshes
      : { windowKey: wk!, used: (meta.staffRefreshes && meta.staffRefreshes.windowKey === wk ? meta.staffRefreshes.used : 0) + 1 };
    const newMeta: SaveMeta = { ...meta, staffMarket: generateStaffPool(12, rng), staffRefreshes };
    set({ meta: newMeta });
    await persistMeta(newMeta);
    if (firstSeed) return '';
    const left = 3 - staffRefreshes!.used;
    return `Fresh candidates sourced — ${left} refresh${left === 1 ? '' : 'es'} left this window.`;
  },

  upgradeFacility: async (which) => {
    const { meta, clubs } = get();
    if (!meta) return 'No save.';
    const club = clubs[meta.managerClubId];
    const fac = club.facilities ?? { academy: 2, training: 2 };
    const level = fac[which];
    if (level >= 5) return 'Already at the maximum level.';
    const cost = FACILITY_UPGRADE_COST(level);
    if (club.finances.balance < cost) return `Not enough funds (need ${cost.toLocaleString()}).`;
    const updated = {
      ...club,
      facilities: { ...fac, [which]: level + 1 },
      finances: { ...club.finances, balance: club.finances.balance - cost },
    };
    set({ clubs: { ...clubs, [club.id]: updated } });
    await putClubs(meta.id, [updated]);
    return `${which} upgraded to level ${level + 1}.`;
  },

  setTrainingFocus: async (focus) => {
    const { meta, clubs } = get();
    if (!meta) return;
    const club = clubs[meta.managerClubId];
    const updated = { ...club, trainingFocus: focus };
    set({ clubs: { ...clubs, [club.id]: updated } });
    await putClubs(meta.id, [updated]);
  },

  // --- Tactics & formation ----------------------------------------------

  setFormation: async (formation) => {
    const { meta, clubs } = get();
    if (!meta) return;
    const club = clubs[meta.managerClubId];
    // Changing shape invalidates the slot-indexed manual lineup.
    const updated = { ...club, formation, lineup: undefined };
    set({ clubs: { ...clubs, [club.id]: updated } });
    await putClubs(meta.id, [updated]);
  },

  setTactic: async (kind, value) => {
    const { meta, clubs } = get();
    if (!meta) return;
    const club = clubs[meta.managerClubId];
    const tactics = { ...(club.tactics ?? { defensive: 'BALANCED', offensive: 'POSSESSION' }), [kind]: value };
    const updated = { ...club, tactics: tactics as typeof club.tactics };
    set({ clubs: { ...clubs, [club.id]: updated } });
    await putClubs(meta.id, [updated]);
  },

  expandStadium: async (seats) => {
    const { meta, clubs } = get();
    if (!meta) return { ok: false, message: 'No active save.' };
    const club = clubs[meta.managerClubId];
    const cost = seats * 3500; // ~£3.5k per seat of new capacity
    if (seats <= 0) return { ok: false, message: 'Enter a number of seats to add.' };
    if (cost > club.finances.balance) return { ok: false, message: `Not enough cash — that expansion costs ${cost.toLocaleString()}.` };
    const updated: typeof club = {
      ...club,
      stadium: { ...club.stadium, capacity: club.stadium.capacity + seats },
      finances: { ...club.finances, balance: club.finances.balance - cost },
    };
    set({ clubs: { ...clubs, [club.id]: updated } });
    await putClubs(meta.id, [updated]);
    return { ok: true, message: `Stadium expanded by ${seats.toLocaleString()} seats. New capacity ${updated.stadium.capacity.toLocaleString()}.` };
  },

  setSetPieceTaker: async (role, playerId) => {
    const { meta, clubs } = get();
    if (!meta) return;
    const club = clubs[meta.managerClubId];
    const key = role === 'penalty' ? 'penaltyTakerId' : role === 'freeKick' ? 'freeKickTakerId' : 'cornerTakerId';
    const updated = { ...club, [key]: playerId || null };
    set({ clubs: { ...clubs, [club.id]: updated } });
    await putClubs(meta.id, [updated]);
  },

  setAutoMode: async (on) => {
    const { meta, clubs } = get();
    if (!meta) return;
    const club = clubs[meta.managerClubId];
    const squad = get().getClubPlayers(club.id);
    let formation = club.formation;
    let lineup = club.lineup;
    let bench = club.bench;
    if (on) {
      lineup = undefined; // auto-select every match
      bench = undefined;
      if (!club.lockFormation) formation = bestFormation(squad);
    } else {
      // Freeze the current auto XI + bench as the editable starting point.
      lineup = assignXI(squad, formation, { autoMode: true }).map((a) => a?.player.id ?? null);
      bench = resolveBench(squad, formation, { autoMode: true }).map((p) => p.id);
    }
    const updated = { ...club, autoMode: on, formation, lineup, bench };
    set({ clubs: { ...clubs, [club.id]: updated } });
    await putClubs(meta.id, [updated]);
  },

  setLockFormation: async (on) => {
    const { meta, clubs } = get();
    if (!meta) return;
    const club = clubs[meta.managerClubId];
    const updated = { ...club, lockFormation: on };
    set({ clubs: { ...clubs, [club.id]: updated } });
    await putClubs(meta.id, [updated]);
  },

  setLineupSlot: async (index, playerId) => {
    const { meta, clubs } = get();
    if (!meta) return;
    const club = clubs[meta.managerClubId];
    const slots = FORMATIONS[club.formation] ?? FORMATIONS['4-3-3'];
    const lineup: (string | null)[] = slots.map((_, i) => club.lineup?.[i] ?? null);
    // No duplicates: clear the player from any other slot first.
    if (playerId) {
      for (let i = 0; i < lineup.length; i++) if (lineup[i] === playerId) lineup[i] = null;
    }
    lineup[index] = playerId;
    const updated = { ...club, lineup, autoMode: false };
    set({ clubs: { ...clubs, [club.id]: updated } });
    await putClubs(meta.id, [updated]);
  },

  autoFillLineup: async () => {
    const { meta, clubs } = get();
    if (!meta) return;
    const club = clubs[meta.managerClubId];
    const squad = get().getClubPlayers(club.id);
    const lineup = assignXI(squad, club.formation, { autoMode: true }).map((a) => a?.player.id ?? null);
    const bench = resolveBench(squad, club.formation, { autoMode: true }).map((p) => p.id);
    const updated = { ...club, lineup, bench, autoMode: false };
    set({ clubs: { ...clubs, [club.id]: updated } });
    await putClubs(meta.id, [updated]);
  },

  saveSquad: async (lineup, bench) => {
    const { meta, clubs } = get();
    if (!meta) return;
    const club = clubs[meta.managerClubId];
    const updated = { ...club, lineup, bench, autoMode: false };
    set({ clubs: { ...clubs, [club.id]: updated } });
    await putClubs(meta.id, [updated]);
  },

  // --- God Mode (M7) -----------------------------------------------------

  setGodMode: async (on) => {
    const { meta } = get();
    if (!meta) return;
    // Once God Mode has been used it is recorded permanently for the save.
    const newMeta: SaveMeta = {
      ...meta,
      godModeEnabled: on,
      godModeUsed: meta.godModeUsed || on,
    };
    set({ meta: newMeta });
    await persistMeta(newMeta);
  },

  godAddFunds: async (amount) => {
    const { meta, clubs } = get();
    if (!meta || !meta.godModeEnabled) return;
    const club = clubs[meta.managerClubId];
    const updated = {
      ...club,
      finances: {
        ...club.finances,
        balance: club.finances.balance + amount,
        transferBudget: club.finances.transferBudget + amount,
      },
    };
    set({ clubs: { ...clubs, [club.id]: updated } });
    await putClubs(meta.id, [updated]);
  },

  godHealSquad: async () => {
    const { meta, players } = get();
    if (!meta || !meta.godModeEnabled) return;
    const changed: Player[] = [];
    const next = { ...players };
    for (const p of Object.values(players)) {
      if (p.contract.clubId !== meta.managerClubId) continue;
      const np = { ...p, injury: null, fitness: 100, fatigueLoad: 0, cards: { ...p.cards, suspendedFor: 0 } };
      next[p.id] = np;
      changed.push(np);
    }
    set({ players: next });
    await putPlayers(meta.id, changed);
  },

  godBoostPlayer: async (playerId, delta) => {
    const { meta, players } = get();
    if (!meta || !meta.godModeEnabled) return;
    const p = players[playerId];
    if (!p) return;
    const np = godScale(p, delta);
    set({ players: { ...players, [playerId]: np } });
    await putPlayers(meta.id, [np]);
  },

  godForceSign: async (playerId) => {
    const { meta, clubs, players } = get();
    if (!meta || !meta.godModeEnabled) return;
    const player = players[playerId];
    if (!player || player.contract.clubId === meta.managerClubId) return;
    const buyer = clubs[meta.managerClubId];
    const seller = player.contract.clubId ? clubs[player.contract.clubId] ?? null : null;
    const year = get().currentSeason()?.year ?? meta.startYear;
    const upd = applyTransfer(buyer, seller, player, 0, player.contract.wage, year);
    const newClubs = { ...clubs, [upd.buyer.id]: upd.buyer };
    if (upd.seller) newClubs[upd.seller.id] = upd.seller;
    set({ clubs: newClubs, players: { ...players, [upd.player.id]: upd.player } });
    await putClubs(meta.id, [upd.buyer, ...(upd.seller ? [upd.seller] : [])]);
    await putPlayers(meta.id, [upd.player]);
  },

  // --- Play orchestration ------------------------------------------------

  advanceMatchday: async () => {
    if (get().meta?.sacked) return; // dismissed — take a new job first
    const day = get().meta?.currentDay ?? 0;
    await simTo(get, set, day + 1);
  },

  simToNextManagerMatch: async () => {
    if (get().meta?.sacked) return; // dismissed — take a new job first
    set({ stopRequested: false });
    // Advance one continental boundary at a time toward the manager's next
    // fixture, recomputing it each step so a freshly-drawn European tie for the
    // manager becomes the new stopping point.
    for (let guard = 0; guard < 2000; guard++) {
      if (get().stopRequested) { set({ stopRequested: false }); return; }
      while (await progressKnockouts(get, set)) { /* draw ready rounds */ }
      const meta = get().meta;
      if (!meta) return;
      const next = get().managerNextMatch();
      if (!next) { await get().simToSeasonEnd(); return; }
      if (next.day <= meta.currentDay) return; // arrived at their match
      const stopAt = nextKnockoutStop(get);
      const stop = Math.min(next.day, stopAt);
      if (stop > meta.currentDay) await playDays(get, set, meta.currentDay, stop);
      else return;
    }
  },

  simToSeasonEnd: async () => {
    if (get().meta?.sacked) return; // dismissed — must take a new job first
    // A single boundary-aware loop: play to the next continental boundary (or the
    // furthest fixture), draw any round that unlocks, and repeat until the season
    // is genuinely complete. Steps in modest chunks so the user can Stop.
    set({ stopRequested: false });
    for (let guard = 0; guard < 3000; guard++) {
      if (get().stopRequested) { set({ stopRequested: false }); return; }
      while (await progressKnockouts(get, set)) { /* draw ready rounds */ }
      if (get().seasonComplete()) return;
      const meta = get().meta;
      if (!meta) return;
      const target = get().lastMatchday() + 1;
      const stopAt = nextKnockoutStop(get);
      // Cap each chunk (~4 match-weeks) so a Stop takes effect quickly.
      const stop = Math.min(target, stopAt, meta.currentDay + 12);
      if (stop > meta.currentDay) await playDays(get, set, meta.currentDay, stop);
      else if (!(await progressKnockouts(get, set))) return; // nothing left to advance
    }
  },

  startNextSeason: async () => {
    const { meta, clubs, players } = get();
    if (!meta || !get().seasonComplete()) return;
    set({ simming: true });
    try {
      const seasonMatches = get().currentSeasonMatches();
      const result = await resolveAndRollover(meta, clubs, players, seasonMatches);

      // Mark the finished season, register the new (current) one.
      const seasons: Record<string, Season> = {};
      for (const s of Object.values(meta.seasons)) {
        seasons[s.id] = { ...s, current: false, finished: true };
      }
      seasons[result.newSeason.id] = result.newSeason;

      const newMeta: SaveMeta = {
        ...meta,
        competitions: result.competitions,
        seasons,
        currentDay: 0,
        news: [...meta.news, ...result.news],
        board: result.board ?? meta.board,
        sacked: result.sacked ?? false,
        history: [...(meta.history ?? []), ...(result.historyEntry ? [result.historyEntry] : [])],
        hallOfFame: [...(meta.hallOfFame ?? []), ...(result.hallOfFameAdds ?? [])],
        pendingOffers: [],
        brokenTalks: {},
        walkedStaff: {},
        academies: result.academies ?? meta.academies,
        academyPlayers: result.academyPlayers ?? meta.academyPlayers,
        youthCompetitions: result.youthCompetitions ?? meta.youthCompetitions,
        managerReputation: result.managerReputation ?? meta.managerReputation,
        managerStints: result.managerStints ?? meta.managerStints,
        jobOffers: [...(meta.jobOffers ?? []), ...(result.jobOffers ?? [])].slice(-8),
        continental: result.continental ?? {},
        continentalChampions: result.continentalChampions ?? meta.continentalChampions,
        continentalHistory: [...(meta.continentalHistory ?? []), ...(result.continentalHistory ?? [])].slice(-40),
        domesticCups: result.domesticCups ?? {},
        cupHolders: result.cupHolders ?? meta.cupHolders,
        ffp: result.ffp ?? meta.ffp,
        pointsPenalties: result.pointsPenalties ?? {},
        countryCoefficients: result.countryCoefficients ?? meta.countryCoefficients,
        achievements: { ...(meta.achievements ?? {}), ...(result.achievements ?? {}) },
        pendingGala: result.pendingGala ?? null,
        aiManagers: result.aiManagers ?? meta.aiManagers,
      };
      // Announce any newly-unlocked achievements.
      for (const [id, year] of Object.entries(result.achievements ?? {})) {
        const def = ACHIEVEMENTS.find((a) => a.id === id);
        if (def) newMeta.news = [...newMeta.news, { id: `news_ach_${id}_${year}`, day: 0, category: 'AWARD', title: `🏅 Achievement unlocked: ${def.name}`, body: def.description, read: false }];
      }
      // International management: record tournaments + reward a winning national manager.
      const tournaments = result.tournaments ?? (result.worldCup ? [result.worldCup] : []);
      if (tournaments.length > 0) {
        // Store the slim summaries (drop the news blob) for the Nations screen.
        newMeta.lastTournaments = tournaments.map(({ news: _news, honouredPlayerIds: _h, ...summary }) => summary);
        if (result.worldCup) {
          const wc = result.worldCup;
          newMeta.worldChampion = { nation: wc.championNation, year: wc.year };
          newMeta.internationalHistory = [...(meta.internationalHistory ?? []), { year: wc.year, nation: wc.championNation }].slice(-20);
        }
        for (const t of tournaments) {
          if (meta.nationalJob && meta.nationalJob === t.championNation) {
            newMeta.managerReputation = clamp((newMeta.managerReputation ?? 50) + 12, 5, 99);
            newMeta.news = [...newMeta.news, { id: `news_intlmgr_${t.kind}_${t.year}`, day: 0, category: 'BOARD', title: `${t.name} winner!`, body: `You led ${t.championNation} to glory at the ${t.name} — your reputation soars.`, read: false }];
          }
        }
      }

      // Persist playoff/cup/continental (history) + new fixtures + squads.
      await putMatches(meta.id, result.playoffMatches);
      await putMatches(meta.id, result.extraMatches ?? []);
      await putMatches(meta.id, result.newMatches);
      await putPlayers(meta.id, Object.values(result.players));
      await deletePlayers(meta.id, result.retiredIds);
      await putClubs(meta.id, Object.values(result.clubs));
      await persistMeta(newMeta);

      const matches: Record<string, Match> = {};
      for (const m of result.newMatches) matches[m.id] = m;

      set({
        meta: newMeta,
        matches,
        players: result.players,
        clubs: result.clubs,
      });
    } finally {
      set({ simming: false });
    }
  },

  // --- Living Match Day --------------------------------------------------

  beginLiveMatch: async () => {
    const meta = get().meta;
    if (!meta) return false;
    const next = get().managerNextMatch();
    if (!next) return false;
    // Sim everything strictly before the manager's match day (boundary-aware so
    // continental rounds are drawn as their phases finish).
    if (next.day > meta.currentDay) await simTo(get, set, next.day);

    const s = get();
    const m = s.matches[next.id];
    if (!m || m.played) return false;
    const managerClubId = meta.managerClubId;
    const managedSide: LiveSide = m.homeClubId === managerClubId ? 'home' : 'away';
    const homeClub = s.clubs[m.homeClubId];
    const awayClub = s.clubs[m.awayClubId];
    if (!homeClub || !awayClub) return false;
    const playersOf = (clubId: string) => Object.values(s.players).filter((p) => p.contract.clubId === clubId);
    const buildFor = (club: Club) => buildLineupProfile(
      club.id, playersOf(club.id), club.formation ?? '4-3-3',
      {
        tactics: club.tactics, lineup: club.lineup, bench: club.bench, autoMode: club.autoMode,
        setPieces: { penaltyTakerId: club.penaltyTakerId, freeKickTakerId: club.freeKickTakerId, cornerTakerId: club.cornerTakerId },
      },
    );

    // Club-DNA context (mirrors playDays) → strength multipliers.
    const comp = meta.competitions[m.competitionId];
    const ctx: MatchContext = { kind: 'league' };
    if (comp) {
      const totalRounds = Math.max(1, (comp.numClubs - 1) * comp.rounds);
      ctx.runIn = m.round >= totalRounds - Math.ceil(totalRounds * 0.25);
    }
    const homeMod = traitStrengthMod(homeClub.traits, ctx);
    const awayMod = traitStrengthMod(awayClub.traits, ctx);
    const homeProfile = scaleProfile(buildFor(homeClub), homeMod);
    const awayProfile = scaleProfile(buildFor(awayClub), awayMod);

    // A continental knockout tie (not a league-phase or group game) must produce
    // a winner — a level score after 90' goes to a penalty shootout.
    const cont = meta.continental?.[m.competitionId];
    const needsWinner = !!cont && m.stageLabel !== 'League Phase' && !m.stageLabel?.startsWith('Group ');

    // Penalty-taking skill from each side's designated taker (else team attack).
    const penSkill = (club: Club, profile: typeof homeProfile) => {
      const p = club.penaltyTakerId ? s.players[club.penaltyTakerId] : null;
      return p && p.contract.clubId === club.id ? p.attributes.technical.finishing : profile.attack;
    };

    const seed = (meta.seed ^ (next.day * 2654435761) ^ hashSeed(m.id)) >>> 0;
    const { state, rng } = createLiveMatch({
      matchId: m.id, competitionId: m.competitionId, seasonId: m.seasonId,
      homeClubId: m.homeClubId, awayClubId: m.awayClubId,
      homeProfile, awayProfile, managedSide, seed, needsWinner,
      homePenSkill: penSkill(homeClub, homeProfile), awayPenSkill: penSkill(awayClub, awayProfile),
      homeFormation: homeClub.formation ?? '4-3-3', awayFormation: awayClub.formation ?? '4-3-3',
    });
    // Note: no kickoff yet — the UI shows a pre-match team talk first.
    liveRng = rng;
    const managerClub = managedSide === 'home' ? homeClub : awayClub;
    const managerProfile = managedSide === 'home' ? homeProfile : awayProfile;
    const oppProfile = managedSide === 'home' ? awayProfile : homeProfile;
    const usStrength = managerProfile.attack + managerProfile.midfield + managerProfile.defense;
    const themStrength = oppProfile.attack + oppProfile.midfield + oppProfile.defense;
    const squad = playersOf(managerClubId);
    const squadProf = squad.length ? squad.reduce((a, p) => a + (p.hidden?.professionalism ?? 55), 0) / squad.length : 55;
    liveWork = {
      managedSide, managerClubId, matchDay: next.day,
      formation: managerClub.formation ?? '4-3-3',
      tactics: managerClub.tactics,
      lineup: managerProfile.starters.slice(),
      bench: managerProfile.bench.map((b) => b.playerId),
      managerMod: managedSide === 'home' ? homeMod : awayMod,
      weAreFavourite: usStrength >= themStrength,
      squadProfessionalism: squadProf,
      talkMoraleDelta: 0, talkFormDelta: 0,
    };
    set({ liveMatch: state });
    return true;
  },

  liveKickOff: () => {
    const state = get().liveMatch;
    if (!state) return;
    const s = structuredClone(state);
    kickOff(s);
    set({ liveMatch: s });
  },

  liveTeamTalk: (tone) => {
    const state = get().liveMatch;
    if (!state || !liveWork) return;
    const w = liveWork;
    const s = structuredClone(state);
    const res = applyTeamTalk(s, w.managedSide, tone, w.weAreFavourite, w.squadProfessionalism);
    liveWork = { ...w, talkMoraleDelta: w.talkMoraleDelta + res.moraleDelta, talkFormDelta: w.talkFormDelta + res.formDelta };
    set({ liveMatch: s });
  },

  tickLive: () => {
    const state = get().liveMatch;
    if (!state || !liveRng || state.finished) return;
    const s = structuredClone(state);
    tickLiveMatch(s, liveRng);
    set({ liveMatch: s });
  },

  liveResumeSecondHalf: () => {
    const state = get().liveMatch;
    if (!state) return;
    const s = structuredClone(state);
    startSecondHalf(s);
    set({ liveMatch: s });
  },

  liveTickShootout: () => {
    const state = get().liveMatch;
    if (!state || !liveRng || state.phase !== 'SHOOTOUT') return;
    const s = structuredClone(state);
    tickShootout(s, liveRng);
    set({ liveMatch: s });
  },

  liveSub: (offId, onId) => {
    const state = get().liveMatch;
    if (!state || !liveWork) return;
    const w = liveWork;
    if (!w.lineup.includes(offId) || !w.bench.includes(onId)) return;
    const newLineup = w.lineup.map((id) => (id === offId ? onId : id));
    const newBench = w.bench.filter((id) => id !== onId).concat(offId);
    const players = Object.values(get().players).filter((p) => p.contract.clubId === w.managerClubId);
    const profile = scaleProfile(
      buildLineupProfile(w.managerClubId, players, w.formation, { tactics: w.tactics, lineup: newLineup, bench: newBench }),
      w.managerMod,
    );
    const s = structuredClone(state);
    applyManagerChange(s, w.managedSide, profile, { offId, onId });
    liveWork = { ...w, lineup: newLineup, bench: newBench };
    set({ liveMatch: s });
  },

  liveSetFormation: (formation) => {
    const state = get().liveMatch;
    if (!state || !liveWork) return;
    const w = liveWork;
    const players = Object.values(get().players).filter((p) => p.contract.clubId === w.managerClubId);
    const profile = scaleProfile(
      buildLineupProfile(w.managerClubId, players, formation, { tactics: w.tactics, lineup: w.lineup, bench: w.bench }),
      w.managerMod,
    );
    const s = structuredClone(state);
    applyManagerChange(s, w.managedSide, profile, undefined, formation);
    liveWork = { ...w, formation };
    set({ liveMatch: s });
  },

  liveSetTactic: (kind, value) => {
    const state = get().liveMatch;
    if (!state || !liveWork) return;
    const w = liveWork;
    const tactics = {
      defensive: w.tactics?.defensive ?? 'BALANCED',
      offensive: w.tactics?.offensive ?? 'POSSESSION',
      [kind]: value,
    } as Tactics;
    const players = Object.values(get().players).filter((p) => p.contract.clubId === w.managerClubId);
    const profile = scaleProfile(
      buildLineupProfile(w.managerClubId, players, w.formation, { tactics, lineup: w.lineup, bench: w.bench }),
      w.managerMod,
    );
    const s = structuredClone(state);
    applyManagerChange(s, w.managedSide, profile);
    liveWork = { ...w, tactics };
    set({ liveMatch: s });
  },

  finishLive: async () => {
    const meta = get().meta;
    const lm = get().liveMatch;
    if (!meta || !lm || !lm.finished || !liveWork) return;
    const base = get().matches[lm.matchId];
    if (!base) { liveRng = null; liveWork = null; set({ liveMatch: null }); return; }
    const outcome = liveOutcome(lm);
    const managerMatch: Match = {
      ...base, played: true,
      homeGoals: outcome.homeGoals, awayGoals: outcome.awayGoals,
      homeXg: outcome.homeXg, awayXg: outcome.awayXg,
      events: outcome.events, playerStats: outcome.playerStats,
    };
    const day = liveWork.matchDay;
    // Apply accumulated team-talk morale/form to the manager's squad so it
    // persists (processMatchday then builds on top of these values).
    const { managerClubId, talkMoraleDelta, talkFormDelta } = liveWork;
    let players = get().players;
    if (talkMoraleDelta !== 0 || talkFormDelta !== 0) {
      players = { ...players };
      for (const p of Object.values(players)) {
        if (p.contract.clubId !== managerClubId) continue;
        players[p.id] = { ...p, morale: clamp(p.morale + talkMoraleDelta), form: clamp(p.form + talkFormDelta, -100, 100) };
      }
    }
    liveRng = null;
    liveWork = null;
    // Mark it played so playDays skips re-simming it, then commit the matchday.
    set({ players, matches: { ...get().matches, [managerMatch.id]: managerMatch }, liveMatch: null });
    await playDays(get, set, day, day + 1, [managerMatch]);
    while (await progressKnockouts(get, set)) { /* draw any unlocked round */ }
  },

  cancelLive: () => { liveRng = null; liveWork = null; set({ liveMatch: null }); },

  // --- Man-management ----------------------------------------------------

  interactWithPlayer: async (playerId, kind) => {
    const { meta, players } = get();
    if (!meta) return { ok: false, message: 'No active save.' };
    const player = players[playerId];
    if (!player || player.contract.clubId !== meta.managerClubId) return { ok: false, message: 'Not your player.' };
    const cooldown = meta.lastInteraction ?? {};
    // ~2 weeks; day indices are strided ×3 for midweek European + cup fixtures.
    if (meta.currentDay - (cooldown[playerId] ?? -999) < 30) {
      return { ok: false, message: `${player.name.last} has heard enough from you for now.` };
    }
    const res = evaluateInteraction(kind, player);
    const np: Player = {
      ...player,
      morale: clamp(player.morale + res.moraleDelta),
      form: clamp(player.form + res.formDelta, -100, 100),
      ego: clamp(egoOf(player) + res.egoDelta, 5, 99),
    };
    const newMeta: SaveMeta = { ...meta, lastInteraction: { ...cooldown, [playerId]: meta.currentDay } };
    set({ players: { ...players, [playerId]: np }, meta: newMeta });
    await putPlayers(meta.id, [np]);
    await persistMeta(newMeta);
    return { ok: true, message: res.message };
  },

  toggleShortlist: async (playerId) => {
    const { meta } = get();
    if (!meta) return;
    const cur = meta.shortlist ?? [];
    const shortlist = cur.includes(playerId) ? cur.filter((id) => id !== playerId) : [...cur, playerId];
    const newMeta: SaveMeta = { ...meta, shortlist };
    set({ meta: newMeta });
    await persistMeta(newMeta);
  },

  // --- International management -------------------------------------------

  appointNationalJob: async (nation) => {
    const { meta, players } = get();
    if (!meta) return { ok: false, message: 'No active save.' };
    if (!NATION_BY_NAME[nation]) return { ok: false, message: 'That nation is not recognised.' };
    const strength = nationStrength(nation, buildNationSquads(players));
    const need = Math.max(35, strength - 8);
    if ((meta.managerReputation ?? 50) < need) {
      return { ok: false, message: `${nation} want a more established name — reputation ${need}+ required.` };
    }
    const news = { id: `news_natjob_${nation}_${meta.currentDay}`, day: meta.currentDay, category: 'BOARD' as const, title: `Appointed by ${nation}`, body: `You take charge of the ${nation} national team alongside your club.`, read: false };
    const newMeta: SaveMeta = { ...meta, nationalJob: nation, news: [...meta.news, news] };
    set({ meta: newMeta });
    await persistMeta(newMeta);
    return { ok: true, message: `You are the new ${nation} manager.` };
  },

  resignNationalJob: async () => {
    const { meta } = get();
    if (!meta) return;
    const newMeta: SaveMeta = { ...meta, nationalJob: null };
    set({ meta: newMeta });
    await persistMeta(newMeta);
  },

  // --- Manager career ----------------------------------------------------

  acceptJobOffer: async (offerId) => {
    const { meta, clubs } = get();
    if (!meta) return { ok: false, message: 'No active save.' };
    const offer = (meta.jobOffers ?? []).find((o) => o.id === offerId);
    if (!offer) return { ok: false, message: 'Offer no longer available.' };
    const newClub = clubs[offer.clubId];
    if (!newClub) return { ok: false, message: 'Club not found.' };
    const year = get().currentSeason()?.year ?? meta.startYear;
    const oldClub = clubs[meta.managerClubId];
    const reason: 'SACKED' | 'HEADHUNTED' | 'RESIGNED' = meta.sacked
      ? 'SACKED'
      : newClub.reputation > (oldClub?.reputation ?? 0) ? 'HEADHUNTED' : 'RESIGNED';
    const stints = switchClub(meta.managerStints ?? [], newClub, year, reason);
    const managerComp = Object.values(meta.competitions).find((c) => c.clubIds.includes(newClub.id));
    const board = managerComp ? setObjective(newClub, managerComp) : meta.board;
    const news = {
      id: `news_job_${offerId}`, day: meta.currentDay, category: 'BOARD' as const,
      title: `New job: ${newClub.name}`,
      body: `You take charge of ${newClub.name}. A fresh challenge awaits.`, read: false,
    };
    // Fill the new club's academy to a full team in each age band (U16/U18/U21),
    // so the manager inherits a complete youth setup at their new club.
    const players = { ...get().players };
    const academyPlayers = { ...(meta.academyPlayers ?? {}) };
    const academy = meta.academies?.[newClub.id];
    let addedIds: string[] = [];
    if (academy) {
      addedIds = fillAcademyBands(
        newClub, academy, players, academyPlayers,
        year, meta.ratingCap ?? 90, new Rng((meta.seed ^ hashSeed(`job_${newClub.id}`)) >>> 0),
      );
    }
    const newMeta: SaveMeta = {
      ...meta, managerClubId: newClub.id, managerStints: stints, board, sacked: false,
      jobOffers: [], news: [...meta.news, news], academyPlayers,
    };
    set({ meta: newMeta, players });
    if (addedIds.length) await putPlayers(meta.id, addedIds.map((id) => players[id]));
    await persistMeta(newMeta);
    return { ok: true, message: `You are the new manager of ${newClub.name}.` };
  },

  declineJobOffer: async (offerId) => {
    const { meta } = get();
    if (!meta) return;
    const newMeta: SaveMeta = { ...meta, jobOffers: (meta.jobOffers ?? []).filter((o) => o.id !== offerId) };
    set({ meta: newMeta });
    await persistMeta(newMeta);
  },

  // --- Boardroom & media -------------------------------------------------

  requestFromBoard: async (kind) => {
    const { meta, clubs } = get();
    if (!meta) return { ok: false, message: 'No active save.' };
    // ~3 months; day indices are strided ×3 for midweek European + cup fixtures.
    if (meta.currentDay - (meta.lastBoardRequest ?? -999) < 135) {
      return { ok: false, message: 'The board have heard enough from you for a while.' };
    }
    const club = clubs[meta.managerClubId];
    const res = evaluateBoardRequest(kind, club, meta.board, meta.managerReputation ?? 50);
    let newClub = club;
    let academies = meta.academies;
    if (res.granted) {
      if (res.transferBudgetDelta || res.wageBudgetDelta) {
        newClub = { ...club, finances: { ...club.finances, transferBudget: club.finances.transferBudget + res.transferBudgetDelta, wageBudget: club.finances.wageBudget + res.wageBudgetDelta } };
      }
      if (res.fundFacilities) {
        const ac = meta.academies?.[club.id];
        if (ac) {
          const tracks = ['training', 'coaching', 'medical', 'recruitment'] as const;
          const lowest = tracks.reduce((lo, t) => (ac.facilities[t] < ac.facilities[lo] ? t : lo), tracks[0]);
          if (ac.facilities[lowest] < 5) academies = { ...meta.academies, [club.id]: { ...ac, facilities: { ...ac.facilities, [lowest]: ac.facilities[lowest] + 1 } } };
        }
      }
    }
    const newMeta: SaveMeta = { ...meta, lastBoardRequest: meta.currentDay, academies };
    set({ meta: newMeta, clubs: { ...clubs, [club.id]: newClub } });
    if (newClub !== club) await putClubs(meta.id, [newClub]);
    await persistMeta(newMeta);
    return { ok: res.granted, message: res.message };
  },

  answerPress: async (tone) => {
    const { meta, players } = get();
    if (!meta || !meta.pendingPress) return { ok: false, message: 'No press conference pending.' };
    const res = evaluatePressAnswer(tone, meta.pendingPress.ctx);
    let np = players;
    if (res.squadMoraleDelta) {
      np = { ...players };
      for (const p of Object.values(np)) {
        if (p.contract.clubId === meta.managerClubId) np[p.id] = { ...p, morale: clamp(p.morale + res.squadMoraleDelta) };
      }
    }
    const board = meta.board ? { ...meta.board, confidence: clamp(meta.board.confidence + res.confidenceDelta, 0, 100) } : meta.board;
    const newMeta: SaveMeta = { ...meta, pendingPress: null, board };
    set({ players: np, meta: newMeta });
    if (res.squadMoraleDelta) await putPlayers(meta.id, Object.values(np).filter((p) => p.contract.clubId === meta.managerClubId));
    await persistMeta(newMeta);
    return { ok: true, message: res.message };
  },

  // --- Selectors ---------------------------------------------------------

  getClubPlayers: (clubId) =>
    Object.values(get().players).filter((p) => p.contract.clubId === clubId),

  managerClub: () => {
    const { meta, clubs } = get();
    return meta ? (clubs[meta.managerClubId] ?? null) : null;
  },

  currentSeason: () => {
    const meta = get().meta;
    if (!meta) return null;
    return Object.values(meta.seasons).find((s) => s.current) ?? null;
  },

  currentSeasonMatches: () => {
    const season = get().currentSeason();
    if (!season) return [];
    return Object.values(get().matches).filter((m) => m.seasonId === season.id);
  },

  managerNextMatch: () => {
    const { meta } = get();
    if (!meta) return null;
    const clubId = meta.managerClubId;
    const candidates = get()
      .currentSeasonMatches()
      .filter(
        (m) => !m.played && !m.neutral && (m.homeClubId === clubId || m.awayClubId === clubId),
      )
      .sort((a, b) => a.day - b.day);
    return candidates[0] ?? null;
  },

  lastMatchday: () => {
    const ms = get().currentSeasonMatches().filter((m) => !m.neutral);
    return ms.reduce((mx, m) => Math.max(mx, m.day), 0);
  },

  seasonComplete: () =>
    get().currentSeasonMatches().filter((m) => !m.neutral).every((m) => m.played),
}));

/**
 * Play every unplayed league match with `from <= day < to`, then set
 * currentDay = to. Batches all matches into a single worker dispatch.
 */
async function playDays(
  get: () => GameState,
  set: (partial: Partial<GameState>) => void,
  from: number,
  to: number,
  /** Already-played matches (e.g. a live match) to fold into the aftermath without re-simulating. */
  extraPlayed: Match[] = [],
): Promise<void> {
  const { meta, clubs } = get();
  if (!meta) return;
  const season = get().currentSeason();
  const toYear = season?.year ?? meta.startYear;
  const toPlay = get()
    .currentSeasonMatches()
    .filter((m) => !m.played && !m.neutral && m.day >= from && m.day < to);

  set({ simming: true });
  try {
    // Club-DNA context: flag late-season league fixtures as the "run-in" so
    // bottler clubs wobble when the title race tightens.
    const ctxByMatch: Record<string, MatchContext> = {};
    for (const m of toPlay) {
      const comp = meta.competitions[m.competitionId];
      if (!comp) continue;
      const totalRounds = Math.max(1, (comp.numClubs - 1) * comp.rounds);
      const runIn = m.round >= totalRounds - Math.ceil(totalRounds * 0.25);
      ctxByMatch[m.id] = { kind: 'league', runIn };
    }

    // Simulate the whole range in one worker dispatch…
    const simulated = await simulateMatches(toPlay, clubs, get().players, ctxByMatch);
    // Fold in any already-played (live) matches so their aftermath ticks too.
    const played = [...simulated, ...extraPlayed];

    // …then apply aftermath matchday-by-matchday so injury/suspension
    // counters tick in order. Players evolve cumulatively across the range.
    const byDay = new Map<number, typeof played>();
    for (const m of played) (byDay.get(m.day) ?? byDay.set(m.day, []).get(m.day)!).push(m);

    const matches = { ...get().matches };
    let playersById = { ...get().players };
    const newsItems = [...meta.news];
    const changedIds = new Set<string>();
    const playedMerged: Match[] = [];

    // Physio factors per club ease injuries (§M5).
    const physioByClub: Record<string, number> = {};
    for (const c of Object.values(clubs)) physioByClub[c.id] = physioFactor(c.staff);

    for (const day of [...byDay.keys()].sort((a, b) => a - b)) {
      const dayMatches = byDay.get(day)!;
      const after = processMatchday(dayMatches, playersById, toYear, day ^ meta.seed, physioByClub);
      // Apply player changes.
      if (after.changedPlayers.length) {
        playersById = { ...playersById };
        for (const p of after.changedPlayers) {
          playersById[p.id] = p;
          changedIds.add(p.id);
        }
      }
      // Append injury events to the relevant matches, then store them.
      for (const m of dayMatches) {
        const extra = after.injuryEvents[m.id];
        const merged = extra
          ? { ...m, events: [...m.events, ...extra].sort((a, b) => a.minute - b.minute) }
          : m;
        matches[m.id] = merged;
        playedMerged.push(merged);
      }
      newsItems.push(...after.news);
    }

    // Advance scouting knowledge on assigned targets (§M5).
    const scouting = { ...(meta.scouting ?? {}) };
    const daysAdvanced = Math.max(1, to - from);
    const rate = scoutingRate(clubs[meta.managerClubId]?.staff) * daysAdvanced;
    for (const pid of Object.keys(scouting)) {
      if (scouting[pid] < 100) scouting[pid] = Math.min(100, scouting[pid] + rate);
    }

    // Incoming AI offers for the manager's transfer-/loan-listed players.
    const offerRng = new Rng((meta.seed ^ (to * 2654435761)) >>> 0);
    const newOffers = generateOffers(meta.managerClubId, clubs, playersById, meta.pendingOffers ?? [], offerRng, to, toYear);
    for (const o of newOffers) {
      const pl = playersById[o.playerId];
      const from = clubs[o.fromClubId];
      newsItems.push({
        id: `news_${o.id}`, day: to, category: 'TRANSFER',
        title: o.type === 'BUY' ? `Bid received for ${pl?.name.last}` : `Loan enquiry for ${pl?.name.last}`,
        body: o.type === 'BUY'
          ? `${from?.shortName} offer ${o.fee.toLocaleString()} for ${pl?.name.first} ${pl?.name.last}. Respond on the Transfers screen.`
          : `${from?.shortName} want ${pl?.name.first} ${pl?.name.last} on loan until ${o.loanUntilYear}.`,
        read: false,
      });
    }
    const pendingOffers = [...(meta.pendingOffers ?? []), ...newOffers].slice(-25);

    // Resolve active youth scouting trips → new prospects (§ Academy).
    const scoutsById: Record<string, import('../types/staff').Staff> = {};
    for (const s of clubs[meta.managerClubId]?.staff ?? []) scoutsById[s.id] = s;
    const scoutRng = new Rng((meta.seed ^ (to * 40503)) >>> 0);
    const scoutRes = resolveScoutAssignments(
      meta.scoutAssignments ?? [], scoutsById, meta.managerClubId, toYear, daysAdvanced,
      meta.ratingCap ?? 90, scoutRng,
    );
    newsItems.push(...scoutRes.news);
    const youthProspects = [...(meta.youthProspects ?? []), ...scoutRes.prospects].slice(-40);

    // Resolve market scouting assignments whose report is now due.
    const scoutReports = { ...(meta.scoutReports ?? {}) };
    const remainingAssignments = (meta.playerScoutAssignments ?? []).filter((a) => {
      if (a.dueDay > to) return true; // still travelling
      const scout = scoutsById[a.scoutId];
      const player = playersById[a.playerId];
      if (scout && player) {
        const report = buildScoutReport(player, scout, toYear, to);
        // Keep the more confident read if we already had one.
        const prev = scoutReports[a.playerId];
        if (!prev || report.stars >= prev.stars) scoutReports[a.playerId] = report;
        newsItems.push({
          id: `news_scoutrep_${a.playerId}_${to}`, day: to, category: 'TRANSFER',
          title: `Scout report: ${player.name.first} ${player.name.last}`,
          body: `${report.scoutName} rates him around ${report.estOverall} OVR (${report.stars}★ confidence), valued near ${report.estValue.toLocaleString()}.`,
          read: false,
        });
      }
      return false; // assignment complete
    });

    // Tactical identity: tally the manager's wins under the tactics used, so a
    // body of work resolves into style tags on the Manager screen.
    let managerStyle = meta.managerStyle;
    for (const m of playedMerged) {
      if (m.homeClubId !== meta.managerClubId && m.awayClubId !== meta.managerClubId) continue;
      const isHome = m.homeClubId === meta.managerClubId;
      managerStyle = recordStyleResult(
        managerStyle, clubs[meta.managerClubId]?.tactics,
        (isHome ? m.homeGoals : m.awayGoals) > (isHome ? m.awayGoals : m.homeGoals),
      );
    }

    // The manager's most-recent result this batch (for press, derby, narratives).
    const mgrPlayed = playedMerged
      .filter((m) => m.homeClubId === meta.managerClubId || m.awayClubId === meta.managerClubId)
      .sort((a, b) => b.day - a.day)[0];
    let board = meta.board;

    if (mgrPlayed) {
      const isHome = mgrPlayed.homeClubId === meta.managerClubId;
      const gf = isHome ? mgrPlayed.homeGoals : mgrPlayed.awayGoals;
      const ga = isHome ? mgrPlayed.awayGoals : mgrPlayed.homeGoals;
      const oppId = isHome ? mgrPlayed.awayClubId : mgrPlayed.homeClubId;
      const oppName = clubs[oppId]?.shortName ?? 'the opposition';

      // Derby: extra morale + board swing when it's a traditional rivalry.
      if (clubs[oppId] && areRivals(clubs[meta.managerClubId]?.name ?? '', clubs[oppId].name)) {
        const bonus = derbyResultBonus(gf > ga, gf === ga);
        if (bonus.morale !== 0) {
          for (const p of Object.values(playersById)) {
            if (p.contract.clubId === meta.managerClubId) { playersById[p.id] = { ...p, morale: clamp(p.morale + bonus.morale) }; changedIds.add(p.id); }
          }
          if (board) board = { ...board, confidence: clamp(board.confidence + bonus.confidence, 0, 100) };
          newsItems.push({ id: `news_derby_${mgrPlayed.id}`, day: to, category: 'RESULT',
            title: gf > ga ? `Derby delight vs ${oppName}` : gf === ga ? `Derby honours shared with ${oppName}` : `Derby defeat to ${oppName}`,
            body: gf > ga ? 'Bragging rights secured — the fans are jubilant.' : gf === ga ? 'A hard-fought derby draw.' : 'A chastening derby loss — the fans are hurting.', read: false });
        }
      }

      // Dynamic narratives (streaks, biggest win).
      const managerSeasonPlayed = Object.values(matches).filter(
        (m) => m.played && !m.neutral && (m.homeClubId === meta.managerClubId || m.awayClubId === meta.managerClubId),
      );
      newsItems.push(...generateNarratives(meta.managerClubId, managerSeasonPlayed, mgrPlayed, oppName, to));
    }

    // Press conference from the manager's most recent result (§ Boardroom).
    let pendingPress = meta.pendingPress ?? null;
    if (!pendingPress && mgrPlayed) {
      const pressRng = new Rng((meta.seed ^ (to * 2246822519) ^ hashSeed(mgrPlayed.id)) >>> 0);
      if (pressRng.chance(0.4)) {
        const isHome = mgrPlayed.homeClubId === meta.managerClubId;
        const gf = isHome ? mgrPlayed.homeGoals : mgrPlayed.awayGoals;
        const ga = isHome ? mgrPlayed.awayGoals : mgrPlayed.homeGoals;
        const outcome = gf > ga ? 'WIN' : gf < ga ? 'LOSS' : 'DRAW';
        const oppId = isHome ? mgrPlayed.awayClubId : mgrPlayed.homeClubId;
        const ctx = { outcome: outcome as 'WIN' | 'LOSS' | 'DRAW', margin: Math.abs(gf - ga), opponentName: clubs[oppId]?.shortName ?? 'the opposition' };
        pendingPress = { question: generatePressQuestion(ctx, to, pressRng), ctx };
      }
    }

    // Player unhappiness → transfer requests. A deeply unhappy, ambitious squad
    // player who isn't getting the game time his status warrants may down tools.
    const unhappyRng = new Rng((meta.seed ^ (to * 374761393)) >>> 0);
    for (const p of Object.values(playersById)) {
      if (p.contract.clubId !== meta.managerClubId || p.transferRequested || p.transferListed) continue;
      const wantsOut = p.morale < 32 && p.hidden.ambition > 58
        && (p.squadRole === 'SURPLUS' || p.squadRole === 'BACKUP' || p.contract.expiresYear - toYear <= 1);
      if (wantsOut && unhappyRng.chance(0.14)) {
        playersById[p.id] = { ...p, transferRequested: true };
        changedIds.add(p.id);
        newsItems.push({
          id: `news_treq_${p.id}_${to}`, day: to, category: 'TRANSFER',
          title: `${p.name.first} ${p.name.last} hands in a transfer request`,
          body: `${p.name.last} is unhappy and has asked to leave. Respond on his profile — grant it (list him) or reject it (he'll sulk).`,
          read: false,
        });
      }
    }

    // Position retraining: players learning a new role progress with each day
    // of training (~120 days to master it), then gain the position permanently.
    for (const p of Object.values(playersById)) {
      const t = p.training;
      if (!t?.retrainPosition || p.contract.clubId !== meta.managerClubId) continue;
      const progress = (t.retrainProgress ?? 0) + daysAdvanced * (100 / 120);
      if (progress >= 100) {
        const pos = t.retrainPosition;
        const positions = p.positions.includes(pos) ? p.positions : [...p.positions, pos];
        const newOvr = Math.max(p.overall, overallAt(p.attributes, pos));
        playersById[p.id] = {
          ...p, positions, overall: newOvr,
          training: { ...t, retrainPosition: null, retrainProgress: 0 },
        };
        changedIds.add(p.id);
        newsItems.push({
          id: `news_retrain_${p.id}_${to}`, day: to, category: 'GENERAL',
          title: `${p.name.first} ${p.name.last} learns a new position`,
          body: `Months of extra sessions pay off — he is now comfortable at ${pos}.`,
          read: false,
        });
      } else {
        playersById[p.id] = { ...p, training: { ...t, retrainProgress: progress } };
        changedIds.add(p.id);
      }
    }

    // Transfer window opening (into January): fulfil pre-agreed arrivals — the
    // players who were bought while the window was shut now join — and run a
    // smaller AI-to-AI winter market so the world keeps moving.
    let clubsAfter = clubs;
    let pendingArrivals = meta.pendingArrivals ?? [];
    const maxDayW = get().lastMatchday();
    const wasOpen = isWindowOpen({ ...meta, currentDay: from }, maxDayW);
    const nowOpen = isWindowOpen({ ...meta, currentDay: to }, maxDayW);
    if (wasOpen || nowOpen) {
      const openKind = windowOnDate(currentDate({ ...meta, currentDay: nowOpen ? to : from }, maxDayW));
      if (pendingArrivals.length > 0) {
        playersById = { ...playersById };
        clubsAfter = { ...clubsAfter };
        for (const a of pendingArrivals) {
          const p = playersById[a.playerId];
          if (!p) continue; // player gone — fee already paid, deal lapses
          const prevClub = p.contract.clubId;
          playersById[a.playerId] = { ...p, contract: { ...p.contract, clubId: a.toClubId, wage: a.wage, startYear: toYear, expiresYear: toYear + a.years, releaseClause: a.releaseClause }, squadRole: 'ROTATION', loan: null, transferListed: false };
          const buyerC = clubsAfter[a.toClubId];
          if (buyerC) clubsAfter[a.toClubId] = { ...buyerC, playerIds: [...new Set([...buyerC.playerIds, a.playerId])] };
          if (prevClub && clubsAfter[prevClub]) clubsAfter[prevClub] = { ...clubsAfter[prevClub], playerIds: clubsAfter[prevClub].playerIds.filter((id) => id !== a.playerId) };
          changedIds.add(a.playerId);
          newsItems.push({ id: `news_arrive_${a.playerId}_${to}`, day: to, category: 'TRANSFER', title: `${a.playerName} completes his move`, body: `The pre-agreed transfer to ${clubsAfter[a.toClubId]?.shortName ?? 'his new club'} is now official.`, read: false });
        }
        pendingArrivals = [];
      }
      if (openKind === 'WINTER' && !wasOpen) {
        const winter = runAiToAiTransfers(clubsAfter, playersById, meta.managerClubId, toYear,
          new Rng((meta.seed ^ (toYear * 0x2545f491)) >>> 0), { maxDeals: 12, day: to });
        if (winter.deals.length > 0) {
          playersById = winter.players;
          clubsAfter = winter.clubs;
          for (const d of winter.deals) changedIds.add(d.playerId);
          newsItems.push({ id: `news_winter_${toYear}`, day: to, category: 'TRANSFER', title: '❄️ Winter window', body: `${winter.deals.length} deals done across the leagues in the January market.`, read: false }, ...winter.news);
        }
      }
      await putClubs(meta.id, Object.values(clubsAfter));
    }

    // Autumn awards gala — the Ballon d'Or et al., announced in late October of
    // the new season honouring the prior campaign. Fires once its day arrives.
    let pendingGala = meta.pendingGala ?? null;
    let history = meta.history;
    if (pendingGala && !pendingGala.announced && to >= pendingGala.announceDay) {
      newsItems.push(galaNews(pendingGala, playersById, to));
      playersById = { ...playersById };
      for (const a of pendingGala.awards) {
        if (a.playerId && playersById[a.playerId]) {
          playersById[a.playerId] = { ...playersById[a.playerId], awards: [...playersById[a.playerId].awards, { awardId: a.type, seasonId: a.seasonId, label: a.label }] };
          changedIds.add(a.playerId);
        }
      }
      const gala = pendingGala;
      history = (meta.history ?? []).map((h) => (h.seasonId === gala.seasonId ? { ...h, awards: [...h.awards, ...gala.awards] } : h));
      pendingGala = null;
    }

    const newMeta: SaveMeta = {
      ...meta, currentDay: to, news: newsItems, scouting, pendingOffers, board,
      scoutAssignments: scoutRes.assignments, youthProspects, pendingPress,
      scoutReports, playerScoutAssignments: remainingAssignments,
      pendingGala, history, managerStyle, pendingArrivals,
    };
    set({ matches, players: playersById, clubs: clubsAfter, meta: newMeta });

    await putMatches(meta.id, playedMerged);
    await putPlayers(meta.id, [...changedIds].map((id) => playersById[id]));
    await persistMeta(newMeta);
  } finally {
    set({ simming: false });
  }
}

/** Highest domestic (league) matchday across the current season. */
function maxLeagueDayOf(get: () => GameState): number {
  const { meta } = get();
  if (!meta) return 0;
  let mx = 0;
  for (const m of get().currentSeasonMatches()) {
    if (meta.competitions[m.competitionId] && m.day > mx) mx = m.day;
  }
  return mx;
}

/**
 * Advance every continental competition whose current phase has just finished,
 * drawing the next knockout round onto later calendar days. Returns true if any
 * new fixtures were injected. Called after each sim step so brackets fill in.
 */
async function progressContinental(
  get: () => GameState,
  set: (partial: Partial<GameState>) => void,
): Promise<boolean> {
  const { meta, clubs, players } = get();
  if (!meta?.continental || Object.keys(meta.continental).length === 0) return false;
  const seasonId = get().currentSeason()?.id;
  const seasonMatches = get().currentSeasonMatches();
  const batch = advanceAllContinental(
    meta.continental, seasonMatches, clubs, players, meta.currentDay, maxLeagueDayOf(get), meta.seed,
  );
  if (!batch.changed) return false;

  const matches = { ...get().matches };
  for (const m of batch.newMatches) matches[m.id] = { ...m, seasonId: seasonId ?? m.seasonId };
  for (const m of batch.updatedMatches) matches[m.id] = m;
  const newMeta: SaveMeta = { ...meta, continental: batch.states };
  set({ matches, meta: newMeta });
  await putMatches(meta.id, [...batch.newMatches, ...batch.updatedMatches]);
  await persistMeta(newMeta);
  return true;
}

/** Advance every domestic cup whose current round has finished (draws the next). */
async function progressDomesticCups(
  get: () => GameState,
  set: (partial: Partial<GameState>) => void,
): Promise<boolean> {
  const { meta, clubs } = get();
  if (!meta?.domesticCups || Object.keys(meta.domesticCups).length === 0) return false;
  const seasonId = get().currentSeason()?.id;
  const batch = advanceAllDomesticCups(meta.domesticCups, get().currentSeasonMatches(), clubs, meta.currentDay, meta.seed);
  if (!batch.changed) return false;
  const matches = { ...get().matches };
  for (const m of batch.newMatches) matches[m.id] = { ...m, seasonId: seasonId ?? m.seasonId };
  for (const m of batch.updatedMatches) matches[m.id] = m;
  const newMeta: SaveMeta = { ...meta, domesticCups: batch.states };
  set({ matches, meta: newMeta });
  await putMatches(meta.id, [...batch.newMatches, ...batch.updatedMatches]);
  await persistMeta(newMeta);
  return true;
}

/** Draw any continental or cup round whose prior phase has finished. */
async function progressKnockouts(
  get: () => GameState,
  set: (partial: Partial<GameState>) => void,
): Promise<boolean> {
  const a = await progressContinental(get, set);
  const b = await progressDomesticCups(get, set);
  return a || b;
}

/** Earliest day the sim must pause at to draw a continental or cup round. */
function nextKnockoutStop(get: () => GameState): number {
  const meta = get().meta;
  if (!meta) return Infinity;
  const matches = get().currentSeasonMatches();
  return Math.min(
    nextContinentalStop(meta.continental ?? {}, matches, meta.currentDay),
    nextDomesticCupStop(meta.domesticCups ?? {}, matches, meta.currentDay),
  );
}

/**
 * Advance the calendar to `targetDay`, pausing at each continental phase boundary
 * to draw the next knockout round before the sim overshoots its reserved days —
 * so European ties stay interleaved with league games rather than piling up at
 * the end of the season.
 */
async function simTo(
  get: () => GameState,
  set: (partial: Partial<GameState>) => void,
  targetDay: number,
): Promise<void> {
  for (let guard = 0; guard < 3000; guard++) {
    // Draw any round whose prior phase has finished.
    while (await progressKnockouts(get, set)) { /* drain */ }
    const meta = get().meta;
    if (!meta) return;
    if (meta.currentDay >= targetDay) return;
    const stopAt = nextContinentalStop(meta.continental ?? {}, get().currentSeasonMatches(), meta.currentDay);
    const stop = Math.min(targetDay, stopAt);
    if (stop > meta.currentDay) await playDays(get, set, meta.currentDay, stop);
    else return;
  }
}