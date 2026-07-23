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
import { recordGraduateInAcademy, fillAcademyBands, ACADEMY_MAX_PER_GROUP } from '../game/academy';
import { resolveScoutAssignments, MAX_SCOUT_POSITIONS, SCOUT_MONTH_DAYS, SCOUT_CONTRACT_COST } from '../engine/youthScouting';
import {
  createLiveMatch, kickOff, tickLiveMatch, startSecondHalf, applyManagerChange, applyTeamTalk, liveOutcome, tickShootout, takeShootoutKick,
  type LiveMatchState, type Side as LiveSide,
} from '../engine/liveMatch';
import { evaluateInteraction, egoOf, type TalkTone, type InteractKind } from '../engine/morale';
import { switchClub, fallbackJobOffers } from '../game/careers';
import { setObjective, tickBoardConfidence, confidenceBand, tickFanConfidence, fanBand, fanConfidenceOf, attackingScore, applyFanPressure } from '../game/board';
import { evaluateBoardRequest, generatePressQuestion, evaluatePressAnswer, type BoardRequestKind } from '../game/boardroom';
import { areRivals, derbyResultBonus } from '../game/rivalries';
import { generateNarratives } from '../game/narratives';
import { storylinesOf, advanceWonderkid, advanceNemesis, advanceSagas, advanceObjectiveMemory } from '../game/storylines';
import { challengeById, evaluateChallenge } from '../game/challenges';
import { nationFinish } from '../game/internationals';
import type { NewsItem } from '../types/league';
import { aiManagerOf } from '../game/aiManagers';
import { computeStandings } from '../engine/standings';
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
import {
  createPlayerCareerGame, playerCareerOf, avatarSelectionBias, applyAvatarMatchday,
  ensureAdvanceObjectives, type NewPlayerCareerConfig,
} from '../game/playerCareer';
import { generateSeasonObjectives } from '../game/playerObjectives';
import { runInteractiveMatch, type InteractiveInput } from '../engine/interactiveMatch';
import { buildInteractiveInput } from '../game/interactivePlay';
import { defaultChoiceId } from '../game/momentLibrary';
import { DEFAULT_CAREER_SETTINGS, EMPTY_MOMENT_STATS } from '../types/interactiveMatch';
import type {
  KeyMoment, MomentDecision, MatchTick, GamePlan, InteractiveMatchRecord, CareerSettings,
} from '../types/interactiveMatch';
import { progressPlayerCareer, statusRank } from '../game/playerProgression';
import {
  advanceOffPitch, executeContractOffer, executeLoanOffer, hireAgent, agentById, derivePersona,
} from '../game/playerOffPitch';
import type { SquadStatus } from '../types/playerCareer';
import {
  updateAmbitions, updateDecline, earnedVeteranTraits, roleEvolutionOf, VETERAN_TRAITS,
  computeLegacy, careerTotals, managerRepSeed,
} from '../game/playerLegacy';
import {
  lateCareerOffers, forcedRetirement, retirementAvailable, buildSendOff, buildTestimonial,
  managerStartClub,
} from '../game/playerEndgame';
import { IDENTITY_LABEL } from '../types/playerLegacy';
import {
  postDropConversation, evaluatePromises, resolveConversation, requestMinutesOutcome, roleMeetingConversation,
} from '../game/playerConversations';
import { simulateMatches } from '../engine/simClient';
import type { MatchContext } from '../game/clubTraits';
import { processMatchday } from '../engine/progression';
import { resolveAndRollover, aggregateSeasonStats } from '../game/season';
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
  evaluateLoanTerms,
  applyLoanMove,
  loanFee,
  generateOffers,
  canAgreePreContract,
  evaluateSwap,
  type BidResult,
} from '../game/transfers';
import { advanceRumours } from '../game/rumours';
import { buildDeadlineFeed } from '../game/deadlineDay';
import { generateSponsorOffers } from '../game/sponsorship';
import { agentDemands, evaluateContractOffer, applyContractOffer, leaveWillingness, type ContractOffer, type NegotiationResult } from '../game/contracts';
import { transferFloor, overpricedAsk, respondToTransferOffer, type FeeOffer } from '../game/feeNegotiation';
import type { TransferTalk, InstalmentPayment } from '../types/league';

/** The club's answer to one fee offer, plus the manager's standing with them. */
export interface FeeTalkResult {
  ok: boolean;
  message: string;
  outcome?: 'ACCEPT' | 'COUNTER' | 'REFUSE';
  counterFee?: number; // the club's updated ask (COUNTER)
  agreedFee?: number;  // the fee that was agreed (ACCEPT)
  grade?: string;      // deal grade (ACCEPT)
  tension?: number;    // 0–100 relationship tension after this round
}
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

// Tactical familiarity (§ Tactics depth): a freshly-changed shape starts at the
// floor and climbs FAMILIARITY_GAIN per match played in it until fully drilled.
const FAMILIARITY_FLOOR = 0.35;
const FAMILIARITY_GAIN = 0.08; // ~8 matches from the floor to full fluency

/** Nudge supporter confidence on the board state (§ #42), clamped 0–100. */
function bumpFan<T extends { fanConfidence?: number } | undefined>(board: T, delta: number): T {
  if (!board) return board;
  return { ...board, fanConfidence: Math.min(100, Math.max(0, Math.round((board.fanConfidence ?? 60) + delta))) };
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

/** Transient state of the avatar's interactive Tier-3 match. */
export interface InteractivePlayState {
  input: InteractiveInput;
  decisions: MomentDecision[];
  pending: KeyMoment | null;
  ticker: MatchTick[];
  done: { match: Match; record: InteractiveMatchRecord } | null;
  phase: 'PREMATCH' | 'PLAYING' | 'HALFTIME' | 'DONE';
  halfTimeSeen: boolean;
  htBoost?: boolean;
}

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
  interactivePlay: InteractivePlayState | null;
  clubs: Record<string, Club>;
  players: Record<string, Player>;
  matches: Record<string, Match>;
  savesList: SaveMeta[];

  refreshSavesList: () => Promise<void>;
  newGame: (config: NewGameConfig) => Promise<string>;
  newPlayerCareer: (config: NewPlayerCareerConfig) => Promise<string>;
  answerConversation: (id: string, choiceIdx: number) => Promise<void>;
  requestMeeting: () => Promise<string>;
  // --- Interactive match (Tier 3) ---
  beginPlayerMatch: () => Promise<'STARTED' | 'AUTO' | 'NONE'>;
  setInteractiveGamePlan: (plan: GamePlan) => void;
  kickOffInteractive: () => void;
  decideMoment: (choiceId: string, autoResolved?: boolean) => void;
  autoResolveMoment: () => void;
  autoResolveRest: () => void;
  acknowledgeHalfTime: (boost: boolean) => void;
  finishPlayerMatch: () => Promise<void>;
  cancelInteractive: () => void;
  setCareerSettings: (patch: Partial<CareerSettings>) => Promise<void>;
  // --- Off-pitch life (Tier 4) ---
  hireAgentAction: (agentId: string) => Promise<void>;
  fireAgentAction: () => Promise<void>;
  setAutoNegotiate: (patch: Partial<{ enabled: boolean; minWage: number; minRole: SquadStatus }>) => Promise<void>;
  acceptContractOffer: (offerId: string) => Promise<string>;
  rejectContractOffer: (offerId: string) => Promise<void>;
  acceptLoanOffer: (offerId: string) => Promise<string>;
  rejectLoanOffer: (offerId: string) => Promise<void>;
  acceptSponsorOffer: (offerId: string) => Promise<void>;
  rejectSponsorOffer: (offerId: string) => Promise<void>;
  answerPlayerPress: (promptId: string, choiceIdx: number) => Promise<void>;
  requestTransfer: () => Promise<void>;
  cancelTransferRequest: () => Promise<void>;
  setLifestyle: (routine: Record<string, number>, autoManage: boolean) => Promise<void>;
  // --- Legacy & endgame (Tier 5) ---
  setDreamClub: (clubId: string | null) => Promise<void>;
  retrainAvatarPosition: (pos: import('../types/attributes').Position | null) => Promise<void>;
  becomeMentor: (menteeId: string) => Promise<string>;
  announceRetirement: (endOfSeason: boolean) => Promise<void>;
  announceInternationalRetirement: () => Promise<void>;
  chooseContinuation: (choice: 'END' | 'MANAGER' | 'AMBASSADOR') => Promise<string>;
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
  completeSigning: (playerId: string, fee: number, offer: ContractOffer, instalmentYears?: number) => Promise<BidResult>;
  /** Agree a Bosman pre-contract with an expiring player (free, joins next summer). */
  agreePreContract: (playerId: string, offer: ContractOffer) => Promise<BidResult>;
  /** Current season year + calendar month (0–11) — for pre-contract eligibility. */
  preContractContext: () => { seasonYear: number; month: number };
  /** One round of haggling over a fee. Returns the club's answer + your standing. */
  submitTransferOffer: (playerId: string, offer: FeeOffer) => Promise<FeeTalkResult>;
  /** Abandon an open transfer talk (a small dent to the relationship). */
  abandonTransferTalk: (playerId: string) => Promise<void>;
  /** Transfer-window state for the current date (open? which? label). */
  transferWindow: () => { open: boolean; kind: 'SUMMER' | 'WINTER' | null; nextLabel: string; key: string | null };
  loanIn: (playerId: string, years: number, wageSplitParent?: number, optionToBuy?: number | null) => Promise<BidResult>;
  triggerLoanOption: (playerId: string) => Promise<BidResult>;
  enquireLoanBuy: (playerId: string, fee: number) => Promise<FeeTalkResult>;
  acceptOffer: (offerId: string, buyBack?: { price: number; years: number }) => Promise<void>;
  /** Re-sign a player under a buy-back clause the manager holds (fixed fee). */
  triggerBuyBack: (playerId: string, offer: ContractOffer) => Promise<BidResult>;
  /** Propose a part-exchange: cash + one of your players for a target (§ #32). */
  proposeSwap: (targetId: string, offeredId: string, cash: number, offer: ContractOffer) => Promise<BidResult>;
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
  dispatchScout: (scoutId: string, positions: string[], country: string, months: number) => Promise<BidResult>;
  recallScout: (scoutId: string) => Promise<void>;
  trialProspect: (playerId: string) => Promise<BidResult>;
  signYouthProspect: (playerId: string) => Promise<BidResult>;
  dismissYouthProspect: (playerId: string) => Promise<BidResult>;
  dismissAllProspects: () => Promise<BidResult>;
  // Man-management (§ Man-management)
  interactWithPlayer: (playerId: string, kind: InteractKind) => Promise<BidResult>;

  // QoL
  toggleShortlist: (playerId: string) => Promise<void>;

  // Manager career (§ Manager career)
  acceptJobOffer: (offerId: string) => Promise<BidResult>;
  declineJobOffer: (offerId: string) => Promise<void>;
  /** Sacked managers must always have somewhere to go — top the offer list back up if it ran dry. */
  ensureJobOffers: () => Promise<void>;

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
  setTacticSlider: (kind: 'width' | 'tempo' | 'pressing', value: number) => Promise<void>;
  setSetPieceTaker: (role: 'penalty' | 'freeKick' | 'corner', playerId: string) => Promise<void>;
  setSetPieceRoutine: (kind: 'corner' | 'freeKick' | 'marking', value: string | null) => Promise<void>;
  /** Set match-day ticket pricing (§ #40), 0–100 (50 = standard). */
  setTicketLevel: (level: number) => Promise<void>;
  /** Accept a shirt-sponsorship offer (§ #37). */
  acceptSponsor: (offerId: string) => Promise<void>;
  expandStadium: (seats: number) => Promise<BidResult>;
  setAutoMode: (on: boolean) => Promise<void>;
  setLockFormation: (on: boolean) => Promise<void>;
  setLineupSlot: (index: number, playerId: string | null) => Promise<void>;
  setSlotRole: (index: number, roleId: string | null) => Promise<void>;
  autoFillLineup: () => Promise<void>;
  /** Persist a manually-edited starting XI + bench (drag-and-drop). */
  saveSquad: (lineup: (string | null)[], bench: (string | null)[]) => Promise<void>;
  /** Snapshot the current team sheet (formation + XI + bench) as a named preset. */
  saveLineupPreset: (name: string) => Promise<BidResult>;
  /** Switch the team sheet to a saved preset, dropping any players no longer available. */
  applyLineupPreset: (index: number) => Promise<BidResult>;
  deleteLineupPreset: (index: number) => Promise<void>;

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
  /** Choose whether to take the shootout yourself (true) or let the assistant do it. */
  liveShootoutMode: (manual: boolean) => void;
  /** Reorder your shootout takers before the first kick. */
  liveShootoutOrder: (order: string[]) => void;
  /** Take your kick, aiming 0=left, 1=centre, 2=right. */
  liveShootoutAim: (aim: number) => void;
  /** Defend the opponent's kick by diving 0=left, 1=centre, 2=right. */
  liveShootoutDive: (dive: number) => void;
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
  seasonRefMaxDay: () => number;
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

/** Most loanees a club may hold at once — loans are a supplement, not a squad. */
const MAX_LOANEES = 3;

/** Whether the save's active challenge bans incoming transfers. */
function challengeBansSignings(meta: SaveMeta): boolean {
  const c = meta.challenge;
  return !!c && c.status === 'ACTIVE' && challengeById(c.id)?.rule === 'NO_SIGNINGS';
}

export const useGameStore = create<GameState>((set, get) => ({
  loaded: false,
  saving: false,
  simming: false,
  stopRequested: false,
  stopSim: () => set({ stopRequested: true }),
  meta: null,
  liveMatch: null,
  interactivePlay: null,
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

  newPlayerCareer: async (config) => {
    const snapshot = createPlayerCareerGame(config);
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

  answerConversation: async (id, choiceIdx) => {
    const { meta, players } = get();
    const pc = playerCareerOf(meta);
    if (!meta || !pc) return;
    const conv = (pc.pendingConversations ?? []).find((c) => c.id === id);
    if (!conv) return;
    const res = resolveConversation(pc, conv, choiceIdx, meta.currentDay);
    const avatar = players[pc.playerId];
    let newPlayers = players;
    if (avatar && res.moraleDelta !== 0) {
      const np: Player = { ...avatar, morale: clamp(avatar.morale + res.moraleDelta) as number };
      newPlayers = { ...players, [pc.playerId]: np };
      await putPlayers(meta.id, [np]);
    }
    const newMeta: SaveMeta = { ...meta, playerCareer: res.career, news: [...meta.news, ...res.news] };
    set({ meta: newMeta, players: newPlayers });
    await persistMeta(newMeta);
  },

  requestMeeting: async () => {
    const { meta, players } = get();
    const pc = playerCareerOf(meta);
    if (!meta || !pc) return 'No active player career.';
    const avatar = players[pc.playerId];
    if (!avatar) return 'No player.';
    const res = requestMinutesOutcome(pc, avatar, meta.currentDay);
    const np: Player = { ...avatar, morale: clamp(avatar.morale + res.moraleDelta) as number };
    const newMeta: SaveMeta = { ...meta, playerCareer: res.career, news: [...meta.news, ...res.news] };
    set({ meta: newMeta, players: { ...players, [pc.playerId]: np } });
    await putPlayers(meta.id, [np]);
    await persistMeta(newMeta);
    return res.news[0]?.body ?? 'You spoke with the manager.';
  },

  // --- Interactive match (Tier 3) ----------------------------------------
  beginPlayerMatch: async () => {
    const { meta, players, clubs } = get();
    const pc = playerCareerOf(meta);
    if (!meta || !pc) return 'NONE';
    const avatar = players[pc.playerId];
    const cid = avatar?.contract.clubId;
    if (!avatar || !cid) return 'NONE';
    const settings = meta.careerSettings ?? DEFAULT_CAREER_SETTINGS;
    const nextM = Object.values(get().matches)
      .filter((m) => !m.played && !m.neutral && (m.homeClubId === cid || m.awayClubId === cid) && m.day >= meta.currentDay)
      .sort((a, b) => a.day - b.day)[0];
    if (!nextM) return 'NONE';
    if (!settings.interactive) return 'AUTO';
    const built = buildInteractiveInput(meta, players, clubs, nextM, avatar, pc);
    if (!built.willStart) return 'AUTO'; // benched → nothing to play interactively
    const input: InteractiveInput = { ...built.input, frequency: settings.momentFrequency };
    set({ interactivePlay: { input, decisions: [], pending: null, ticker: [], done: null, phase: 'PREMATCH', halfTimeSeen: false } });
    return 'STARTED';
  },

  setInteractiveGamePlan: (plan) => {
    const ip = get().interactivePlay;
    if (!ip || ip.phase !== 'PREMATCH') return;
    set({ interactivePlay: { ...ip, input: { ...ip.input, gamePlan: plan } } });
  },

  kickOffInteractive: () => {
    const ip = get().interactivePlay;
    if (!ip || ip.phase !== 'PREMATCH') return;
    stepInteractive(get, set, ip.input, []);
  },

  decideMoment: (choiceId, autoResolved = false) => {
    const ip = get().interactivePlay;
    if (!ip || !ip.pending) return;
    const decision: MomentDecision = {
      momentId: ip.pending.id, choiceId, autoResolved,
      followedGamePlan: ip.pending.gamePlanAligned.includes(choiceId), success: false, effect: '',
    };
    stepInteractive(get, set, ip.input, [...ip.decisions, decision]);
  },

  autoResolveMoment: () => {
    const ip = get().interactivePlay;
    if (!ip || !ip.pending) return;
    get().decideMoment(defaultChoiceId(ip.pending.type, ip.input.gamePlan), true);
  },

  autoResolveRest: () => {
    let guard = 0;
    // Acknowledge any half-time pause, then blitz the remaining moments.
    while (guard++ < 60) {
      const ip = get().interactivePlay;
      if (!ip) break;
      if (ip.phase === 'HALFTIME') { get().acknowledgeHalfTime(false); continue; }
      if (ip.phase === 'PREMATCH') { get().kickOffInteractive(); continue; }
      if (!ip.pending) break; // DONE
      get().autoResolveMoment();
    }
  },

  acknowledgeHalfTime: (boost) => {
    const ip = get().interactivePlay;
    if (!ip) return;
    // Half-time talk is a narrative beat that nudges confidence for the rest of
    // the run WITHOUT changing the deterministic match input.
    set({ interactivePlay: { ...ip, phase: ip.pending ? 'PLAYING' : 'DONE', halfTimeSeen: true, htBoost: boost } as InteractivePlayState });
  },

  finishPlayerMatch: async () => {
    const ip = get().interactivePlay;
    const { meta } = get();
    if (!ip || !ip.done || !meta) return;
    const { match, record } = ip.done;
    // Mark it played so the batch skips it, then commit the matchday.
    set({ matches: { ...get().matches, [match.id]: match }, interactivePlay: null });
    await playDays(get, set, meta.currentDay, match.day + 1, [match]);
    while (await progressKnockouts(get, set)) { /* draw any unlocked round */ }

    // Tier-3 extras on top of the standard matchday processing playDays ran:
    // lifetime moment stats, game-plan adherence → trust, standout milestone.
    const meta2 = get().meta;
    const pc = playerCareerOf(meta2);
    if (!meta2 || !pc) return;
    const avatar = get().players[pc.playerId];
    const av = match.playerStats.find((s) => s.playerId === pc.playerId);
    const won = ip.input.isAvatarHome ? match.homeGoals > match.awayGoals : match.awayGoals > match.homeGoals;
    const ms = { ...(pc.momentStats ?? EMPTY_MOMENT_STATS) };
    ms.bigMomentsWon += record.tally.bigWon; ms.bigMomentsLost += record.tally.bigLost;
    ms.penaltiesScored += record.tally.penScored; ms.penaltiesMissed += record.tally.penMissed;
    ms.penaltiesSaved += record.tally.penSaved; ms.decisiveContributions += record.tally.decisive;

    // Following the plan builds trust, defiance costs it — unless it worked.
    let trustDelta = (record.gamePlanAdherence - 0.6) * 3;
    if (record.gamePlanAdherence < 0.5 && ((av?.goals ?? 0) > 0 || won)) trustDelta = Math.max(trustDelta, 0.6);
    const htBoost = (ip as InteractivePlayState & { htBoost?: boolean }).htBoost ? 4 : 0;

    const milestones = record.standout ? [...pc.milestones, { day: meta2.currentDay, text: record.standout }] : pc.milestones;
    const newPc = {
      ...pc, momentStats: ms, milestones,
      managerTrust: clamp((pc.managerTrust ?? 50) + trustDelta, 0, 100) as number,
      confidence: clamp((pc.confidence ?? 60) + htBoost, 0, 100) as number,
    };
    const newMeta: SaveMeta = { ...meta2, playerCareer: newPc };
    let newPlayers = get().players;
    if (avatar && htBoost) { const np = { ...avatar, morale: clamp(avatar.morale + 2) as number }; newPlayers = { ...newPlayers, [avatar.id]: np }; await putPlayers(meta2.id, [np]); }
    set({ meta: newMeta, players: newPlayers });
    await persistMeta(newMeta);
  },

  cancelInteractive: () => set({ interactivePlay: null }),

  setCareerSettings: async (patch) => {
    const { meta } = get();
    if (!meta) return;
    const careerSettings: CareerSettings = { ...(meta.careerSettings ?? DEFAULT_CAREER_SETTINGS), ...patch };
    const newMeta: SaveMeta = { ...meta, careerSettings };
    set({ meta: newMeta });
    await persistMeta(newMeta);
  },

  // --- Off-pitch life (Tier 4) -------------------------------------------
  hireAgentAction: async (agentId) => {
    const { meta, players } = get();
    const pc = playerCareerOf(meta);
    if (!meta || !pc) return;
    const base = agentById(agentId);
    const avatar = players[pc.playerId];
    if (!base || !avatar) return;
    const agent = hireAgent(base, avatar);
    const news: NewsItem[] = [{ id: `news_pc_agent_${meta.currentDay}`, day: meta.currentDay, category: 'GENERAL', title: `${agent.name} signs on`, body: `${agent.name} is now representing you — expect bigger clubs to come calling, for a ${agent.commissionPct}% cut.`, read: false }];
    const newMeta: SaveMeta = { ...meta, playerCareer: { ...pc, agent, agentId }, news: [...meta.news, ...news] };
    set({ meta: newMeta });
    await persistMeta(newMeta);
  },

  fireAgentAction: async () => {
    const { meta } = get();
    const pc = playerCareerOf(meta);
    if (!meta || !pc || !pc.agent) return;
    const news: NewsItem[] = [{ id: `news_pc_agentfire_${meta.currentDay}`, day: meta.currentDay, category: 'GENERAL', title: `Parted ways with ${pc.agent.name}`, body: `You're self-represented again — you'll handle every negotiation yourself.`, read: false }];
    const newMeta: SaveMeta = { ...meta, playerCareer: { ...pc, agent: null, agentId: undefined }, news: [...meta.news, ...news] };
    set({ meta: newMeta });
    await persistMeta(newMeta);
  },

  setAutoNegotiate: async (patch) => {
    const { meta } = get();
    const pc = playerCareerOf(meta);
    if (!meta || !pc || !pc.agent) return;
    const agent = { ...pc.agent, autoNegotiate: { ...pc.agent.autoNegotiate, ...patch } };
    const newMeta: SaveMeta = { ...meta, playerCareer: { ...pc, agent } };
    set({ meta: newMeta });
    await persistMeta(newMeta);
  },

  acceptContractOffer: async (offerId) => {
    const { meta, players, clubs } = get();
    const pc = playerCareerOf(meta);
    if (!meta || !pc) return 'No career.';
    const offer = (pc.contractOffers ?? []).find((o) => o.id === offerId);
    const avatar = players[pc.playerId];
    if (!offer || !avatar) return 'That offer is no longer available.';
    const year = get().currentSeason()?.year ?? meta.startYear;
    const ex = executeContractOffer(pc, avatar, offer, clubs, year, meta.currentDay);
    const newPlayers = { ...players, [avatar.id]: ex.avatar };
    const newClubs = { ...clubs, ...ex.clubPatches };
    // In Player mode the avatar's club stands in as the "manager club" that all
    // the reused world screens (Fixtures, Standings, next-match) follow — so it
    // must track a transfer, or those views stay stuck on the old club/league.
    const newMeta: SaveMeta = { ...meta, playerCareer: ex.career, news: [...meta.news, ...ex.news], managerClubId: ex.avatar.contract.clubId || meta.managerClubId };
    set({ meta: newMeta, players: newPlayers, clubs: newClubs });
    await putPlayers(meta.id, [ex.avatar]);
    if (Object.keys(ex.clubPatches).length) await putClubs(meta.id, Object.values(ex.clubPatches));
    await persistMeta(newMeta);
    return ex.news[0]?.title ?? 'Signed.';
  },

  rejectContractOffer: async (offerId) => {
    const { meta } = get();
    const pc = playerCareerOf(meta);
    if (!meta || !pc) return;
    const offer = (pc.contractOffers ?? []).find((o) => o.id === offerId);
    const contractOffers = (pc.contractOffers ?? []).filter((o) => o.id !== offerId);
    // A rejected transfer collapses its saga; a rejected renewal just lapses.
    const activeSagas = offer?.kind === 'TRANSFER'
      ? (pc.activeSagas ?? []).map((s) => s.clubId === offer.clubId ? { ...s, stage: 'COLLAPSED' as const, deadline: meta.currentDay } : s)
      : pc.activeSagas;
    const newMeta: SaveMeta = { ...meta, playerCareer: { ...pc, contractOffers, activeSagas } };
    set({ meta: newMeta });
    await persistMeta(newMeta);
  },

  acceptLoanOffer: async (offerId) => {
    const { meta, players, clubs } = get();
    const pc = playerCareerOf(meta);
    if (!meta || !pc) return 'No career.';
    const offer = (pc.loanOffers ?? []).find((o) => o.id === offerId);
    const avatar = players[pc.playerId];
    if (!offer || !avatar) return 'That loan is off the table.';
    const year = get().currentSeason()?.year ?? meta.startYear;
    const ex = executeLoanOffer(pc, avatar, offer, clubs, year, meta.currentDay);
    const newPlayers = { ...players, [avatar.id]: ex.avatar };
    const newClubs = { ...clubs, ...ex.clubPatches };
    // The avatar plays at his loan club, so the world screens follow him there.
    const newMeta: SaveMeta = { ...meta, playerCareer: ex.career, news: [...meta.news, ...ex.news], managerClubId: ex.avatar.contract.clubId || meta.managerClubId };
    set({ meta: newMeta, players: newPlayers, clubs: newClubs });
    await putPlayers(meta.id, [ex.avatar]);
    if (Object.keys(ex.clubPatches).length) await putClubs(meta.id, Object.values(ex.clubPatches));
    await persistMeta(newMeta);
    return ex.news[0]?.title ?? 'Loan agreed.';
  },

  rejectLoanOffer: async (offerId) => {
    const { meta } = get();
    const pc = playerCareerOf(meta);
    if (!meta || !pc) return;
    const loanOffers = (pc.loanOffers ?? []).filter((o) => o.id !== offerId);
    const newMeta: SaveMeta = { ...meta, playerCareer: { ...pc, loanOffers } };
    set({ meta: newMeta });
    await persistMeta(newMeta);
  },

  acceptSponsorOffer: async (offerId) => {
    const { meta } = get();
    const pc = playerCareerOf(meta);
    if (!meta || !pc) return;
    const offer = (pc.pendingSponsorOffers ?? []).find((o) => o.id === offerId);
    if (!offer) return;
    const year = get().currentSeason()?.year ?? meta.startYear;
    const sponsorships = [...(pc.sponsorships ?? []), { brand: offer.brand, value: offer.value, until: year + offer.length }];
    const pendingSponsorOffers = (pc.pendingSponsorOffers ?? []).filter((o) => o.id !== offerId);
    const news: NewsItem[] = [{ id: `news_pc_sponin_${offerId}`, day: meta.currentDay, category: 'GENERAL', title: `${offer.brand} deal signed`, body: `A ${offer.length}-year, €${Math.round(offer.value / 1000)}k/yr endorsement with ${offer.brand} is done.`, read: false }];
    const newMeta: SaveMeta = { ...meta, playerCareer: { ...pc, sponsorships, pendingSponsorOffers }, news: [...meta.news, ...news] };
    set({ meta: newMeta });
    await persistMeta(newMeta);
  },

  rejectSponsorOffer: async (offerId) => {
    const { meta } = get();
    const pc = playerCareerOf(meta);
    if (!meta || !pc) return;
    const pendingSponsorOffers = (pc.pendingSponsorOffers ?? []).filter((o) => o.id !== offerId);
    const newMeta: SaveMeta = { ...meta, playerCareer: { ...pc, pendingSponsorOffers } };
    set({ meta: newMeta });
    await persistMeta(newMeta);
  },

  answerPlayerPress: async (promptId, choiceIdx) => {
    const { meta, players } = get();
    const pc = playerCareerOf(meta);
    if (!meta || !pc) return;
    const prompt = (pc.pendingPress ?? []).find((p) => p.id === promptId);
    if (!prompt) return;
    const choice = prompt.choices[choiceIdx];
    if (!choice) return;
    const image = { ...(pc.publicImage ?? { persona: 'Unknown', controversy: 0 }) };
    image.controversy = clamp(image.controversy + (choice.controversy ?? 0), 0, 100) as number;
    image.persona = derivePersona(image, pc);
    const avatar = players[pc.playerId];
    let rival = pc.rival;
    if (rival && choice.rival) rival = { ...rival, relationship: clamp(rival.relationship + choice.rival, -100, 100) as number };
    const newPc = {
      ...pc,
      fanRating: clamp((pc.fanRating ?? 50) + (choice.fanRating ?? 0), 0, 100) as number,
      managerTrust: clamp((pc.managerTrust ?? 50) + (choice.trust ?? 0), 0, 100) as number,
      clubRelationship: clamp((pc.clubRelationship ?? 55) + (choice.relationship ?? 0), 0, 100) as number,
      following: Math.max(0, (pc.following ?? 0) + (choice.following ?? 0)),
      publicImage: image,
      rival,
      pendingPress: (pc.pendingPress ?? []).filter((p) => p.id !== promptId),
      pressHistory: [...(pc.pressHistory ?? []), { day: meta.currentDay, topic: prompt.topic, choice: choice.text }],
    };
    const news: NewsItem[] = [{ id: `news_pc_press_${promptId}`, day: meta.currentDay, category: 'GENERAL', title: 'You faced the media', body: `"${choice.text}" — the ${choice.tone.toLowerCase()} line does the rounds.`, read: false }];
    let newPlayers = players;
    if (avatar && choice.tone === 'CONTROVERSIAL') { const np = { ...avatar, morale: clamp(avatar.morale + 2) as number }; newPlayers = { ...players, [avatar.id]: np }; await putPlayers(meta.id, [np]); }
    const newMeta: SaveMeta = { ...meta, playerCareer: newPc, news: [...meta.news, ...news] };
    set({ meta: newMeta, players: newPlayers });
    await persistMeta(newMeta);
  },

  requestTransfer: async () => {
    const { meta, players } = get();
    const pc = playerCareerOf(meta);
    if (!meta || !pc) return;
    const avatar = players[pc.playerId];
    const news: NewsItem[] = [{ id: `news_pc_treq_${meta.currentDay}`, day: meta.currentDay, category: 'TRANSFER', title: 'Transfer request handed in', body: `${avatar ? `${avatar.name.first} ${avatar.name.last}` : 'You'} asked to leave. The relationship with the club takes a hit, but suitors will circle.`, read: false }];
    let newPlayers = players;
    if (avatar) { const np = { ...avatar, morale: clamp(avatar.morale - 6) as number, transferListed: true }; newPlayers = { ...players, [avatar.id]: np }; await putPlayers(meta.id, [np]); }
    const newMeta: SaveMeta = { ...meta, playerCareer: { ...pc, transferRequestPending: true, clubRelationship: clamp((pc.clubRelationship ?? 55) - 20, 0, 100) as number }, news: [...meta.news, ...news] };
    set({ meta: newMeta, players: newPlayers });
    await persistMeta(newMeta);
  },

  cancelTransferRequest: async () => {
    const { meta, players } = get();
    const pc = playerCareerOf(meta);
    if (!meta || !pc) return;
    const avatar = players[pc.playerId];
    let newPlayers = players;
    if (avatar) { const np = { ...avatar, transferListed: false }; newPlayers = { ...players, [avatar.id]: np }; await putPlayers(meta.id, [np]); }
    const newMeta: SaveMeta = { ...meta, playerCareer: { ...pc, transferRequestPending: false, clubRelationship: clamp((pc.clubRelationship ?? 55) + 5, 0, 100) as number } };
    set({ meta: newMeta, players: newPlayers });
    await persistMeta(newMeta);
  },

  setLifestyle: async (routine, autoManage) => {
    const { meta } = get();
    const pc = playerCareerOf(meta);
    if (!meta || !pc) return;
    const r = routine as unknown as import('../types/playerOffPitch').Lifestyle['routine'];
    const newMeta: SaveMeta = { ...meta, playerCareer: { ...pc, lifestyle: { routine: r, autoManage } } };
    set({ meta: newMeta });
    await persistMeta(newMeta);
  },

  // --- Legacy & endgame (Tier 5) -----------------------------------------
  setDreamClub: async (clubId) => {
    const { meta, players, clubs } = get();
    const pc = playerCareerOf(meta);
    if (!meta || !pc) return;
    const avatar = players[pc.playerId];
    let ambitions = pc.ambitions ?? [];
    // Keep a single dream-move ambition in sync with the nomination.
    ambitions = ambitions.filter((a) => a.kind !== 'DREAM_MOVE');
    if (clubId && clubs[clubId] && avatar) {
      ambitions = [...ambitions, { id: 'amb_dream', text: `Play for ${clubs[clubId].name}`, kind: 'DREAM_MOVE', clubId, achieved: avatar.contract.clubId === clubId }];
    }
    const newMeta: SaveMeta = { ...meta, playerCareer: { ...pc, dreamClubId: clubId ?? undefined, ambitions } };
    set({ meta: newMeta });
    await persistMeta(newMeta);
  },

  retrainAvatarPosition: async (pos) => {
    const { meta, players } = get();
    const pc = playerCareerOf(meta);
    if (!meta || !pc) return;
    const avatar = players[pc.playerId];
    if (!avatar) return;
    const prev = avatar.training ?? {};
    const np: Player = {
      ...avatar,
      training: { ...prev, retrainPosition: pos, retrainProgress: pos !== prev.retrainPosition ? 0 : prev.retrainProgress ?? 0 },
    };
    let career = pc;
    if (pos) career = { ...pc, decline: { ...(pc.decline ?? { started: false, peakOvr: avatar.overall }), retrainedFrom: avatar.position } };
    const newMeta: SaveMeta = { ...meta, playerCareer: career };
    set({ meta: newMeta, players: { ...players, [avatar.id]: np } });
    await putPlayers(meta.id, [np]);
    await persistMeta(newMeta);
  },

  becomeMentor: async (menteeId) => {
    const { meta, players } = get();
    const pc = playerCareerOf(meta);
    if (!meta || !pc) return 'No career.';
    const mentee = players[menteeId];
    const avatar = players[pc.playerId];
    if (!mentee || !avatar) return 'Player not found.';
    if ((pc.mentorships ?? []).some((m) => m.menteeId === menteeId)) return 'Already mentoring him.';
    const year = get().currentSeason()?.year ?? meta.startYear;
    const bonus = clamp(0.4 + (avatar.hidden?.professionalism ?? 55) / 200, 0.4, 1) as number;
    const mentorships = [...(pc.mentorships ?? []), { menteeId, since: year, developmentBonus: bonus }];
    const news: NewsItem[] = [{ id: `news_pc_mentor_${menteeId}_${meta.currentDay}`, day: meta.currentDay, category: 'GENERAL', title: 'Taking a young player under your wing', body: `${avatar.name.last} will mentor ${mentee.name.first} ${mentee.name.last} — passing on the hard-won lessons of a long career.`, read: false }];
    const newMeta: SaveMeta = { ...meta, playerCareer: { ...pc, mentorships, clubRelationship: clamp((pc.clubRelationship ?? 55) + 4, 0, 100) as number }, news: [...meta.news, ...news] };
    set({ meta: newMeta });
    await persistMeta(newMeta);
    return `You are now mentoring ${mentee.name.first} ${mentee.name.last}.`;
  },

  announceRetirement: async (endOfSeason) => {
    const { meta, players } = get();
    const pc = playerCareerOf(meta);
    if (!meta || !pc) return;
    const avatar = players[pc.playerId];
    const year = get().currentSeason()?.year ?? meta.startYear;
    if (!avatar || !retirementAvailable(pc, avatar, year)) return;
    if (endOfSeason) {
      // A farewell tour — the world knows this is the last dance.
      const retirement = { announced: true, announcedDay: meta.currentDay, finalSeason: year, forced: false, reason: 'CHOICE' as const };
      const news: NewsItem[] = [{ id: `news_pc_farewell_${meta.currentDay}`, day: meta.currentDay, category: 'MILESTONE', title: `${avatar.name.first} ${avatar.name.last} to retire at season's end`, body: `A legend announces this will be his final season. Expect guards of honour and tributes at every ground.`, read: false }];
      const newMeta: SaveMeta = { ...meta, playerCareer: { ...pc, retirement }, news: [...meta.news, ...news] };
      set({ meta: newMeta });
      await persistMeta(newMeta);
    } else {
      await retireAvatarNow(get, set, 'CHOICE');
    }
  },

  announceInternationalRetirement: async () => {
    const { meta, players } = get();
    const pc = playerCareerOf(meta);
    if (!meta || !pc || !pc.international.capped) return;
    const avatar = players[pc.playerId];
    const retirement = { ...(pc.retirement ?? { announced: false, forced: false }), internationalRetiredDay: meta.currentDay };
    const news: NewsItem[] = [{ id: `news_pc_intlret_${meta.currentDay}`, day: meta.currentDay, category: 'MILESTONE', title: 'International retirement', body: `${avatar ? `${avatar.name.first} ${avatar.name.last}` : 'You'} steps away from the national team to focus on club football — ${pc.international.caps} caps, ${pc.international.intlGoals} goals.`, read: false }];
    const newMeta: SaveMeta = { ...meta, playerCareer: { ...pc, retirement, intlManagerTrust: undefined }, news: [...meta.news, ...news] };
    set({ meta: newMeta });
    await persistMeta(newMeta);
  },

  chooseContinuation: async (choice) => {
    const { meta, players, clubs } = get();
    const pc = playerCareerOf(meta) ?? meta?.playerCareer; // may already be past-retirement
    if (!meta || !pc) return 'No career.';
    if (choice === 'END' || choice === 'AMBASSADOR') {
      const newMeta: SaveMeta = { ...meta, playerCareer: { ...pc, continuation: { choice } } };
      set({ meta: newMeta });
      await persistMeta(newMeta);
      return choice === 'AMBASSADOR'
        ? 'You stay on as a club ambassador — watching the world you shaped.'
        : 'Your playing career is complete.';
    }
    // MANAGER: flip the same save to manager mode, seeded from the legacy.
    const avatar = players[pc.playerId];
    const year = get().currentSeason()?.year ?? meta.startYear;
    const totals = careerTotals(pc, avatar ?? ({ stats: [], awards: [], developmentLog: [], born: { year } } as unknown as Player), avatar?.born.year ?? year - 30);
    const repSeed = managerRepSeed(pc.legacy, totals);
    const start = managerStartClub(pc, clubs, repSeed);
    if (!start) return 'No club is available to appoint you right now.';
    const managerComp = Object.values(meta.competitions).find((c) => c.clubIds.includes(start.club.id));
    const board = managerComp ? setObjective(start.club, managerComp) : meta.board;
    const stints = [{ clubId: start.club.id, clubName: start.club.name, fromYear: year, seasons: 0, trophies: 0 }];
    // Fill the new club's academy so the ex-player inherits a full youth setup.
    const nextPlayers = { ...players };
    const academyPlayers = { ...(meta.academyPlayers ?? {}) };
    const academy = meta.academies?.[start.club.id];
    let addedIds: string[] = [];
    if (academy) {
      addedIds = fillAcademyBands(start.club, academy, nextPlayers, academyPlayers, year, meta.ratingCap ?? 90, new Rng((meta.seed ^ hashSeed(`mgr_${start.club.id}`)) >>> 0));
    }
    const news: NewsItem[] = [{
      id: `news_pc_mgr_start_${meta.currentDay}`, day: meta.currentDay, category: 'BOARD',
      title: `${meta.managerName} takes charge of ${start.club.shortName}`,
      body: `${start.reason} From the pitch to the dugout — a new chapter begins, with your playing record still in the books.`, read: false,
    }];
    const newMeta: SaveMeta = {
      ...meta,
      careerMode: 'MANAGER',
      managerClubId: start.club.id,
      managerReputation: repSeed,
      managerStints: stints,
      board,
      sacked: false,
      jobOffers: [],
      declinedJobClubIds: [],
      academyPlayers,
      playerCareer: { ...pc, continuation: { choice: 'MANAGER', managerRepSeed: repSeed } },
      news: [...meta.news, ...news],
    };
    set({ meta: newMeta, players: nextPlayers });
    if (addedIds.length) await putPlayers(meta.id, addedIds.map((id) => nextPlayers[id]));
    await persistMeta(newMeta);
    return `You are the new manager of ${start.club.name}.`;
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

  closeSave: () => { liveRng = null; liveWork = null; set({ loaded: false, meta: null, liveMatch: null, interactivePlay: null, clubs: {}, players: {}, matches: {} }); },

  // --- Transfers ---------------------------------------------------------

  makeBid: async (playerId, fee, wage) => {
    const { meta, clubs, players } = get();
    if (!meta) return { ok: false, message: 'No active save.' };
    if (challengeBansSignings(meta)) return { ok: false, message: 'Challenge rule: no incoming transfers — build from within.' };
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

  submitTransferOffer: async (playerId, offer) => {
    const { meta, clubs, players } = get();
    if (!meta) return { ok: false, message: 'No active save.' };
    if (challengeBansSignings(meta)) return { ok: false, message: 'Challenge rule: no incoming transfers — build from within.' };
    if (meta.ffp?.embargo) return { ok: false, message: 'Under an FFP transfer embargo — you cannot sign players this season.' };
    const player = players[playerId];
    if (!player) return { ok: false, message: 'Player not found.' };
    const buyer = clubs[meta.managerClubId];
    const seller = player.contract.clubId ? clubs[player.contract.clubId] ?? null : null;
    const year = get().currentSeason()?.year ?? meta.startYear;
    if (!seller) return { ok: true, outcome: 'ACCEPT', message: 'Free agent — no fee required.', agreedFee: 0 };

    const rel = meta.clubRelations?.[seller.id] ?? { tension: 0 };
    if (rel.refuseUntil && meta.currentDay < rel.refuseUntil) {
      return { ok: false, outcome: 'REFUSE', message: `${seller.shortName} won't discuss transfers with you right now — you have soured relations. Give it a couple of weeks.`, tension: rel.tension };
    }

    const floor = transferFloor(player, seller, buyer, year);
    const talks = { ...(meta.transferTalks ?? {}) };
    let talk = talks[playerId] as TransferTalk | undefined;
    if (!talk || talk.clubId !== seller.id) {
      const rng = new Rng((meta.seed ^ hashSeed(`talk_${playerId}`) ^ meta.currentDay) >>> 0);
      const initialAsk = overpricedAsk(floor, 1.25 + rng.int(0, 25) / 100);
      talk = { playerId, clubId: seller.id, floor, ask: initialAsk, initialAsk, rounds: 0 };
    }

    const resp = respondToTransferOffer({
      offer, player, sellerName: seller.shortName,
      floor: talk.floor, ask: talk.ask, initialAsk: talk.initialAsk, tension: rel.tension,
    });
    const relations = { ...(meta.clubRelations ?? {}), [seller.id]: { ...rel, tension: resp.tension } };

    if (resp.outcome === 'ACCEPT') {
      delete talks[playerId];
      const newMeta: SaveMeta = { ...meta, clubRelations: relations, transferTalks: talks };
      set({ meta: newMeta }); await persistMeta(newMeta);
      return { ok: true, outcome: 'ACCEPT', message: resp.message, agreedFee: offer.fee, grade: resp.grade, tension: resp.tension };
    }
    if (resp.outcome === 'REFUSE') {
      relations[seller.id] = { tension: resp.tension, refuseUntil: meta.currentDay + 14 };
      delete talks[playerId];
      const newMeta: SaveMeta = { ...meta, clubRelations: relations, transferTalks: talks };
      set({ meta: newMeta }); await persistMeta(newMeta);
      return { ok: false, outcome: 'REFUSE', message: resp.message, tension: resp.tension };
    }
    // COUNTER — remember the drifting ask so the next round resumes from here.
    talks[playerId] = { ...talk, ask: resp.ask, rounds: talk.rounds + 1 };
    const newMeta: SaveMeta = { ...meta, clubRelations: relations, transferTalks: talks };
    set({ meta: newMeta }); await persistMeta(newMeta);
    return { ok: false, outcome: 'COUNTER', message: resp.message, counterFee: resp.ask, tension: resp.tension };
  },

  abandonTransferTalk: async (playerId) => {
    const { meta } = get();
    if (!meta || !meta.transferTalks?.[playerId]) return;
    const talks = { ...meta.transferTalks }; delete talks[playerId];
    const newMeta: SaveMeta = { ...meta, transferTalks: talks };
    set({ meta: newMeta }); await persistMeta(newMeta);
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
    const maxDay = get().seasonRefMaxDay();
    const d = currentDate(meta, maxDay);
    const kind = windowOnDate(d);
    // The next window to open from a shut date: winter (Jan) in autumn, the
    // summer after rollover in spring.
    const nextLabel = kind ? '' : (d.getUTCMonth() >= 8 || d.getUTCMonth() <= 0) ? 'January' : 'the summer window';
    return { open: kind !== null, kind, nextLabel, key: windowKey(meta, maxDay) };
  },

  completeSigning: async (playerId, fee, offer, instalmentYears = 1) => {
    const { meta, clubs, players } = get();
    if (!meta) return { ok: false, message: 'No active save.' };
    if (challengeBansSignings(meta)) return { ok: false, message: 'Challenge rule: no incoming transfers — build from within.' };
    if (meta.ffp?.embargo) return { ok: false, message: 'Under an FFP transfer embargo — you cannot sign players this season.' };
    const player = players[playerId];
    if (!player) return { ok: false, message: 'Player not found.' };
    const buyer = clubs[meta.managerClubId];
    // With installments only this year's slice counts against the budget now.
    const years = Math.max(1, Math.min(4, Math.round(instalmentYears)));
    const perYear = years > 1 ? Math.round(fee / years) : fee;
    if (perYear > buyer.finances.transferBudget) return { ok: false, message: years > 1 ? 'This year’s installment exceeds your transfer budget.' : 'The agreed fee exceeds your transfer budget.' };
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
      // Pre-agreed while shut: pay only this year's slice now; stage the rest.
      const paidBuyer: Club = { ...buyer, finances: { ...buyer.finances, balance: buyer.finances.balance - perYear, transferBudget: buyer.finances.transferBudget - perYear } };
      const paidSeller = seller ? { ...seller, finances: { ...seller.finances, balance: seller.finances.balance + perYear, transferBudget: seller.finances.transferBudget + Math.round(perYear * 0.6) } } : null;
      const staged: InstalmentPayment[] = [];
      for (let i = 1; i < years; i++) {
        staged.push({ dueYear: year + i, payerClubId: buyer.id, payeeClubId: seller?.id ?? null, amount: perYear, playerName: `${player.name.first} ${player.name.last}` });
      }
      const arrival: PendingArrival = {
        playerId, toClubId: buyer.id, fee, wage: offer.wage, years: offer.years,
        releaseClause: offer.releaseClause ?? null, playerName: `${player.name.first} ${player.name.last}`,
        arriveLabel: win.nextLabel,
      };
      const newClubs = { ...clubs, [paidBuyer.id]: paidBuyer };
      if (paidSeller) newClubs[paidSeller.id] = paidSeller;
      const feeText = years > 1 ? `${fee.toLocaleString()} over ${years} years` : `${fee.toLocaleString()}`;
      const news = {
        id: `news_predeal_${player.id}_${Date.now().toString(36)}`, day: meta.currentDay, category: 'TRANSFER' as const,
        title: `Pre-agreed: ${player.name.first} ${player.name.last}`,
        body: `Deal done with ${seller?.shortName ?? 'the player'} for ${feeText} — he joins in ${win.nextLabel}. He stays with his club until the window opens.`,
        read: false,
      };
      const reports = { ...(meta.scoutReports ?? {}) }; delete reports[playerId];
      const newMeta: SaveMeta = {
        ...meta, news: [...meta.news, news], scoutReports: reports,
        installments: [...(meta.installments ?? []), ...staged],
        pendingArrivals: [...(meta.pendingArrivals ?? []), arrival],
        playerScoutAssignments: (meta.playerScoutAssignments ?? []).filter((a) => a.playerId !== playerId),
      };
      set({ clubs: newClubs, meta: newMeta });
      await putClubs(meta.id, [paidBuyer, ...(paidSeller ? [paidSeller] : [])]);
      await persistMeta(newMeta);
      return { ok: true, message: `${player.name.last} agreed — he joins in ${win.nextLabel}.` };
    }

    // Move the player and pay only this year's slice up front (perYear === fee
    // when not staged); the rest is scheduled to fall due in future summers.
    const upd = applyTransfer(buyer, seller, player, perYear, offer.wage, year);
    const signed = applyContractOffer(upd.player, offer, year);
    const newClubs = { ...clubs, [upd.buyer.id]: upd.buyer };
    if (upd.seller) newClubs[upd.seller.id] = upd.seller;
    const staged: InstalmentPayment[] = [];
    for (let i = 1; i < years; i++) {
      staged.push({ dueYear: year + i, payerClubId: buyer.id, payeeClubId: seller?.id ?? null, amount: perYear, playerName: `${player.name.first} ${player.name.last}` });
    }
    const feeText = years > 1 ? `${fee.toLocaleString()} over ${years} years (${perYear.toLocaleString()}/yr)` : `${fee.toLocaleString()}`;
    const news = {
      id: `news_sign_${player.id}_${Date.now().toString(36)}`, day: meta.currentDay, category: 'TRANSFER' as const,
      title: `Signed ${player.name.first} ${player.name.last}`,
      body: `${player.position} joins from ${seller?.shortName ?? 'free agency'} for ${feeText} on ${offer.wage.toLocaleString()}/wk.`,
      read: false,
    };
    // Clear any scout report/assignment now that he's ours.
    const reports = { ...(meta.scoutReports ?? {}) }; delete reports[playerId];
    // A marquee arrival lifts the supporters (§ #42) — the bigger the name, the
    // bigger the buzz.
    const board = bumpFan(meta.board, Math.min(8, Math.max(0, (player.overall - 74) * 0.9)));
    const newMeta: SaveMeta = {
      ...meta, board, news: [...meta.news, news], scoutReports: reports,
      installments: [...(meta.installments ?? []), ...staged],
      playerScoutAssignments: (meta.playerScoutAssignments ?? []).filter((a) => a.playerId !== playerId),
    };
    set({ clubs: newClubs, players: { ...players, [playerId]: signed }, meta: newMeta });
    await putClubs(meta.id, [upd.buyer, ...(upd.seller ? [upd.seller] : [])]);
    await putPlayers(meta.id, [signed]);
    await persistMeta(newMeta);
    return { ok: true, message: `${player.name.last} signs!` };
  },

  preContractContext: () => {
    const { meta } = get();
    if (!meta) return { seasonYear: 0, month: 0 };
    const seasonYear = get().currentSeason()?.year ?? meta.startYear;
    const month = currentDate(meta, get().seasonRefMaxDay()).getUTCMonth();
    return { seasonYear, month };
  },

  agreePreContract: async (playerId, offer) => {
    const { meta, clubs, players } = get();
    if (!meta) return { ok: false, message: 'No active save.' };
    if (challengeBansSignings(meta)) return { ok: false, message: 'Challenge rule: no incoming transfers — build from within.' };
    if (meta.ffp?.embargo) return { ok: false, message: 'Under an FFP transfer embargo — you cannot sign players.' };
    const player = players[playerId];
    if (!player) return { ok: false, message: 'Player not found.' };
    const { seasonYear, month } = get().preContractContext();
    const elig = canAgreePreContract(player, meta.managerClubId, seasonYear, month);
    if (!elig.ok) return { ok: false, message: elig.reason ?? 'He is not available on a pre-contract.' };

    const buyer = clubs[meta.managerClubId];
    const buyerSquad = get().getClubPlayers(buyer.id);
    if (weeklyWageBill(buyerSquad) + offer.wage > buyer.finances.wageBudget) {
      return { ok: false, message: 'Those wages would breach your wage budget.' };
    }
    // Free transfer: no fee paid now, he arrives when the summer window opens.
    const arrival: PendingArrival = {
      playerId, toClubId: buyer.id, fee: 0, wage: offer.wage, years: offer.years,
      releaseClause: offer.releaseClause ?? null, playerName: `${player.name.first} ${player.name.last}`,
      arriveLabel: 'the summer',
    };
    const signed: Player = { ...player, preContract: { toClubId: buyer.id } };
    const seller = player.contract.clubId ? clubs[player.contract.clubId] : null;
    const news = {
      id: `news_bosman_${player.id}_${Date.now().toString(36)}`, day: meta.currentDay, category: 'TRANSFER' as const,
      title: `Pre-contract agreed: ${player.name.first} ${player.name.last}`,
      body: `${player.name.last} will join on a free transfer from ${seller?.shortName ?? 'his club'} when his contract expires this summer, on ${offer.wage.toLocaleString()}/wk. He stays with his club until then.`,
      read: false,
    };
    const reports = { ...(meta.scoutReports ?? {}) }; delete reports[playerId];
    const newMeta: SaveMeta = {
      ...meta, news: [...meta.news, news], scoutReports: reports,
      pendingArrivals: [...(meta.pendingArrivals ?? []), arrival],
      playerScoutAssignments: (meta.playerScoutAssignments ?? []).filter((a) => a.playerId !== playerId),
    };
    set({ players: { ...players, [playerId]: signed }, meta: newMeta });
    await putPlayers(meta.id, [signed]);
    await persistMeta(newMeta);
    return { ok: true, message: `${player.name.last} agreed a pre-contract — he joins on a free next summer.` };
  },

  loanIn: async (playerId, years, wageSplitParent = 0.5, optionToBuy = null) => {
    const { meta, clubs, players } = get();
    if (!meta) return { ok: false, message: 'No active save.' };
    if (challengeBansSignings(meta)) return { ok: false, message: 'Challenge rule: no incoming transfers — build from within.' };
    if (meta.ffp?.embargo) return { ok: false, message: 'Under an FFP transfer embargo — no loan moves this season.' };
    if (!get().transferWindow().open) return { ok: false, message: 'The transfer window is shut — loans can only be arranged when it is open.' };
    const player = players[playerId];
    if (!player) return { ok: false, message: 'Player not found.' };
    const toClub = clubs[meta.managerClubId];
    const fromClub = player.contract.clubId ? clubs[player.contract.clubId] : null;
    if (!fromClub || fromClub.id === toClub.id) return { ok: false, message: 'Cannot loan this player.' };
    // Soured relations shut the door on loans too, until the freeze lifts.
    const rel = meta.clubRelations?.[fromClub.id] ?? { tension: 0 };
    if (rel.refuseUntil && meta.currentDay < rel.refuseUntil) {
      return { ok: false, message: `${fromClub.shortName} won't deal with you right now — relations are strained. Try again in a couple of weeks.` };
    }
    // A squad may hold only so many loanees at once.
    const currentLoanees = get().getClubPlayers(toClub.id).filter((p) => p.loan).length;
    if (currentLoanees >= MAX_LOANEES) {
      return { ok: false, message: `You already have ${MAX_LOANEES} players on loan — that's the limit. End a loan before taking another.` };
    }
    // Clubs won't strengthen a direct rival in the manager's own league.
    const myComp = Object.values(meta.competitions).find((c) => c.clubIds.includes(toClub.id));
    if (myComp && myComp.clubIds.includes(fromClub.id)) {
      return { ok: false, message: `${fromClub.shortName} won't loan a player to a rival in your own league.` };
    }
    // Parent clubs keep their first team — only players outside their best XI are
    // available (young or not, they don't loan out a starter).
    const parentSquad = [...get().getClubPlayers(fromClub.id)].sort((a, b) => b.overall - a.overall);
    const rank = parentSquad.findIndex((p) => p.id === player.id);
    if (rank >= 0 && rank < 11) {
      return { ok: false, message: `${fromClub.shortName} see him as part of their first-team plans and won't loan him out.` };
    }
    // Upfront loan fee, paid from your transfer budget.
    const fee = loanFee(player);
    if (fee > toClub.finances.transferBudget) {
      return { ok: false, message: `You can't afford the ${fee.toLocaleString()} loan fee — it exceeds your transfer budget.` };
    }
    const split = Math.min(1, Math.max(0, wageSplitParent));
    const res = evaluateLoanTerms(player, toClub, fromClub, years, split, optionToBuy);
    if (!res.ok) {
      // A rejected loan nudges tension up (they tire of unrealistic asks).
      const tension = Math.min(100, rel.tension + 6);
      const relations = { ...(meta.clubRelations ?? {}), [fromClub.id]: { ...rel, tension } };
      const newMeta: SaveMeta = { ...meta, clubRelations: relations };
      set({ meta: newMeta }); await persistMeta(newMeta);
      return res;
    }
    const year = get().currentSeason()?.year ?? meta.startYear;
    const mv = applyLoanMove(player, fromClub, toClub, year + years, split, optionToBuy, fee);
    const relations = { ...(meta.clubRelations ?? {}), [fromClub.id]: { ...rel, tension: Math.max(0, rel.tension - 4) } };
    const newMeta: SaveMeta = { ...meta, clubRelations: relations };
    set({
      clubs: { ...clubs, [mv.fromClub.id]: mv.fromClub, [mv.toClub.id]: mv.toClub },
      players: { ...players, [mv.player.id]: mv.player },
      meta: newMeta,
    });
    await putClubs(meta.id, [mv.fromClub, mv.toClub]);
    await putPlayers(meta.id, [mv.player]);
    await persistMeta(newMeta);
    const parentPct = Math.round(split * 100);
    const optText = optionToBuy != null ? ` Option to buy: ${optionToBuy.toLocaleString()}.` : '';
    const feeText = fee > 0 ? ` Loan fee ${fee.toLocaleString()}.` : '';
    return { ok: true, message: `${res.message}${feeText} ${fromClub.shortName} cover ${parentPct}% of his wages.${optText}` };
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

  // Negotiate a permanent mid-loan buy when no option was agreed. Haggles with
  // the parent club round-by-round (same engine as the transfer market), keyed
  // on the loanee so the drifting ask persists between offers.
  enquireLoanBuy: async (playerId, fee) => {
    const { meta, clubs, players } = get();
    if (!meta) return { ok: false, message: 'No active save.' };
    if (challengeBansSignings(meta)) return { ok: false, message: 'Challenge rule: no incoming transfers — build from within.' };
    if (meta.ffp?.embargo) return { ok: false, message: 'Under an FFP transfer embargo — you cannot sign players this season.' };
    const player = players[playerId];
    if (!player?.loan || player.contract.clubId !== meta.managerClubId) return { ok: false, message: 'Not on loan at your club.' };
    const parent = clubs[player.loan.parentClubId] ?? null;
    if (!parent) return { ok: false, message: "The parent club can't be reached." };
    const buyer = clubs[meta.managerClubId];
    const year = get().currentSeason()?.year ?? meta.startYear;

    const rel = meta.clubRelations?.[parent.id] ?? { tension: 0 };
    if (rel.refuseUntil && meta.currentDay < rel.refuseUntil) {
      return { ok: false, outcome: 'REFUSE', message: `${parent.shortName} won't discuss a permanent deal right now — give it a couple of weeks.`, tension: rel.tension };
    }

    // Resume (or open) the haggle. A fresh talk opens above the hidden floor.
    const floor = transferFloor(player, parent, buyer, year);
    const talks = { ...(meta.transferTalks ?? {}) };
    let talk = talks[playerId] as TransferTalk | undefined;
    if (!talk || talk.clubId !== parent.id) {
      const rng = new Rng((meta.seed ^ hashSeed(`loanbuy_${playerId}`) ^ meta.currentDay) >>> 0);
      const initialAsk = overpricedAsk(floor, 1.25 + rng.int(0, 25) / 100);
      talk = { playerId, clubId: parent.id, floor, ask: initialAsk, initialAsk, rounds: 0 };
    }

    const offer: FeeOffer = { fee, instalmentYears: 1, sellOnPct: 0, addOns: 0 };
    const resp = respondToTransferOffer({
      offer, player, sellerName: parent.shortName,
      floor: talk.floor, ask: talk.ask, initialAsk: talk.initialAsk, tension: rel.tension,
    });
    const relations = { ...(meta.clubRelations ?? {}), [parent.id]: { ...rel, tension: resp.tension } };

    if (resp.outcome === 'ACCEPT') {
      if (fee > buyer.finances.transferBudget) {
        // They'd sell, but you can't afford it — hold the talk open to try again.
        const nm: SaveMeta = { ...meta, clubRelations: relations };
        set({ meta: nm }); await persistMeta(nm);
        return { ok: false, message: 'The agreed fee exceeds your transfer budget.' };
      }
      // Make the move permanent: pay the fee, clear the loan, keep his terms.
      const upd = applyTransfer(buyer, parent, { ...player, loan: null }, fee, player.contract.wage, year);
      const permanent = { ...upd.player, loan: null };
      const newClubs = { ...clubs, [upd.buyer.id]: upd.buyer };
      if (upd.seller) newClubs[upd.seller.id] = upd.seller;
      delete talks[playerId];
      const news = { id: `news_loanbuy_${playerId}_${meta.currentDay}`, day: meta.currentDay, category: 'TRANSFER' as const, title: `${player.name.last} signed permanently`, body: `${parent.shortName} agree to sell mid-loan — ${player.name.first} ${player.name.last} joins for ${fee.toLocaleString()}.`, read: false };
      const newMeta: SaveMeta = { ...meta, clubRelations: relations, transferTalks: talks, news: [...meta.news, news] };
      set({ clubs: newClubs, players: { ...players, [playerId]: permanent }, meta: newMeta });
      await putClubs(meta.id, [upd.buyer, ...(upd.seller ? [upd.seller] : [])]);
      await putPlayers(meta.id, [permanent]);
      await persistMeta(newMeta);
      return { ok: true, outcome: 'ACCEPT', message: resp.message, agreedFee: fee, grade: resp.grade, tension: resp.tension };
    }
    if (resp.outcome === 'REFUSE') {
      relations[parent.id] = { tension: resp.tension, refuseUntil: meta.currentDay + 14 };
      delete talks[playerId];
      const newMeta: SaveMeta = { ...meta, clubRelations: relations, transferTalks: talks };
      set({ meta: newMeta }); await persistMeta(newMeta);
      return { ok: false, outcome: 'REFUSE', message: resp.message, tension: resp.tension };
    }
    // COUNTER — remember the drifting ask so the next offer resumes from here.
    talks[playerId] = { ...talk, ask: resp.ask, rounds: talk.rounds + 1 };
    const newMeta: SaveMeta = { ...meta, clubRelations: relations, transferTalks: talks };
    set({ meta: newMeta }); await persistMeta(newMeta);
    return { ok: false, outcome: 'COUNTER', message: resp.message, counterFee: resp.ask, tension: resp.tension };
  },

  acceptOffer: async (offerId, buyBack) => {
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
      // Optional buy-back clause: the manager keeps the right to re-sign him at a
      // fixed price for a few years (a small premium over the sale fee).
      if (buyBack && buyBack.price > 0 && buyBack.years > 0) {
        newPlayers[player.id] = { ...newPlayers[player.id], buyBack: { clubId: managerClub.id, price: Math.round(buyBack.price), untilYear: year + Math.min(5, Math.max(1, Math.round(buyBack.years))) } };
        body += ` A buy-back clause of ${buyBack.price.toLocaleString()} is inserted until ${year + Math.min(5, Math.max(1, Math.round(buyBack.years)))}.`;
      }
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
    // Selling a prized player sours the supporters (§ #42); a loan or a fringe
    // sale barely registers.
    const fanDrop = offer.type === 'BUY'
      ? (player.squadRole === 'KEY' ? 7 : player.squadRole === 'FIRST' ? 4 : 0) + Math.max(0, (player.overall - 80) * 0.6)
      : 0;
    const board = fanDrop > 0 ? bumpFan(meta.board, -fanDrop) : meta.board;
    const newMeta: SaveMeta = { ...meta, board, academies, pendingOffers: (meta.pendingOffers ?? []).filter((o) => o.id !== offerId), news: [...meta.news, newsItem, ...extraNews] };
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

  triggerBuyBack: async (playerId, offer) => {
    const { meta, clubs, players } = get();
    if (!meta) return { ok: false, message: 'No active save.' };
    if (meta.ffp?.embargo) return { ok: false, message: 'Under an FFP transfer embargo — you cannot sign players.' };
    if (!get().transferWindow().open) return { ok: false, message: 'The transfer window is shut — buy-backs can only be triggered when it is open.' };
    const player = players[playerId];
    if (!player) return { ok: false, message: 'Player not found.' };
    const bb = player.buyBack;
    const buyer = clubs[meta.managerClubId];
    const year = get().currentSeason()?.year ?? meta.startYear;
    if (!bb || bb.clubId !== buyer.id) return { ok: false, message: 'You hold no buy-back clause for this player.' };
    if (year > bb.untilYear) return { ok: false, message: 'The buy-back clause has expired.' };
    if (player.contract.clubId === buyer.id) return { ok: false, message: 'He already plays for you.' };
    if (bb.price > buyer.finances.transferBudget) return { ok: false, message: `The buy-back fee (${bb.price.toLocaleString()}) exceeds your transfer budget.` };
    const buyerSquad = get().getClubPlayers(buyer.id);
    if (weeklyWageBill(buyerSquad) + offer.wage > buyer.finances.wageBudget) return { ok: false, message: 'Those wages would breach your wage budget.' };

    const seller = player.contract.clubId ? clubs[player.contract.clubId] ?? null : null;
    const upd = applyTransfer(buyer, seller, player, bb.price, offer.wage, year);
    const signed = applyContractOffer({ ...upd.player, buyBack: null }, offer, year);
    const newClubs = { ...clubs, [upd.buyer.id]: upd.buyer };
    if (upd.seller) newClubs[upd.seller.id] = upd.seller;
    const news = {
      id: `news_buyback_${player.id}_${Date.now().toString(36)}`, day: meta.currentDay, category: 'TRANSFER' as const,
      title: `Buy-back triggered: ${player.name.first} ${player.name.last}`,
      body: `Re-signed ${player.name.last} from ${seller?.shortName ?? 'his club'} for the agreed ${bb.price.toLocaleString()} buy-back fee.`,
      read: false,
    };
    const newMeta: SaveMeta = { ...meta, news: [...meta.news, news] };
    set({ clubs: newClubs, players: { ...players, [playerId]: signed }, meta: newMeta });
    await putClubs(meta.id, [upd.buyer, ...(upd.seller ? [upd.seller] : [])]);
    await putPlayers(meta.id, [signed]);
    await persistMeta(newMeta);
    return { ok: true, message: `${player.name.last} is back!` };
  },

  proposeSwap: async (targetId, offeredId, cash, offer) => {
    const { meta, clubs, players } = get();
    if (!meta) return { ok: false, message: 'No active save.' };
    if (challengeBansSignings(meta)) return { ok: false, message: 'Challenge rule: no incoming transfers — build from within.' };
    if (meta.ffp?.embargo) return { ok: false, message: 'Under an FFP transfer embargo — you cannot sign players.' };
    if (!get().transferWindow().open) return { ok: false, message: 'The transfer window is shut — swaps can only be arranged when it is open.' };
    const target = players[targetId];
    const offered = players[offeredId];
    const buyer = clubs[meta.managerClubId];
    if (!target || !offered) return { ok: false, message: 'Player not found.' };
    if (offered.contract.clubId !== buyer.id) return { ok: false, message: 'You can only offer your own players.' };
    if (offered.loan || target.loan) return { ok: false, message: 'Loaned players cannot be part of a swap.' };
    const seller = target.contract.clubId ? clubs[target.contract.clubId] ?? null : null;
    if (!seller || seller.id === buyer.id) return { ok: false, message: 'That player is not available for a swap.' };
    const cashAmt = Math.max(0, Math.round(cash));
    const year = get().currentSeason()?.year ?? meta.startYear;
    const buyerBill = weeklyWageBill(get().getClubPlayers(buyer.id));
    const evalRes = evaluateSwap(target, seller, offered, cashAmt, offer.wage, buyer, buyerBill, year);
    if (!evalRes.ok) return { ok: false, message: evalRes.message };

    // Cash flows to the seller; the two players change hands.
    const newBuyer: Club = {
      ...buyer,
      playerIds: buyer.playerIds.filter((id) => id !== offeredId).concat(targetId),
      captainId: buyer.captainId === offeredId ? null : buyer.captainId,
      finances: { ...buyer.finances, balance: buyer.finances.balance - cashAmt, transferBudget: buyer.finances.transferBudget - cashAmt },
    };
    const newSeller: Club = {
      ...seller,
      playerIds: seller.playerIds.filter((id) => id !== targetId).concat(offeredId),
      captainId: seller.captainId === targetId ? null : seller.captainId,
      finances: { ...seller.finances, balance: seller.finances.balance + cashAmt, transferBudget: seller.finances.transferBudget + Math.round(cashAmt * 0.6) },
    };
    const signedTarget = applyContractOffer({ ...target, contract: { ...target.contract, clubId: buyer.id }, loan: null, transferListed: false, transferRequested: false }, offer, year);
    const movedOffered: Player = { ...offered, contract: { ...offered.contract, clubId: seller.id }, squadRole: 'ROTATION', transferListed: false, transferRequested: false, loan: null };
    const news = {
      id: `news_swap_${targetId}_${Date.now().toString(36)}`, day: meta.currentDay, category: 'TRANSFER' as const,
      title: `Part-exchange: ${target.name.last} in, ${offered.name.last} out`,
      body: `Signed ${target.name.first} ${target.name.last} from ${seller.shortName}${cashAmt > 0 ? ` for ${cashAmt.toLocaleString()} plus ` : ' in exchange for '}${offered.name.first} ${offered.name.last}.`,
      read: false,
    };
    const reports = { ...(meta.scoutReports ?? {}) }; delete reports[targetId];
    const newMeta: SaveMeta = { ...meta, news: [...meta.news, news], scoutReports: reports };
    set({
      clubs: { ...clubs, [newBuyer.id]: newBuyer, [newSeller.id]: newSeller },
      players: { ...players, [targetId]: signedTarget, [offeredId]: movedOffered },
      meta: newMeta,
    });
    await putClubs(meta.id, [newBuyer, newSeller]);
    await putPlayers(meta.id, [signedTarget, movedOffered]);
    await persistMeta(newMeta);
    return { ok: true, message: `Swap agreed — ${target.name.last} joins, ${offered.name.last} moves the other way.` };
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

  dispatchScout: async (scoutId, positions, country, months) => {
    const { meta, clubs } = get();
    if (!meta) return { ok: false, message: 'No active save.' };
    if (positions.length < 1 || positions.length > MAX_SCOUT_POSITIONS) {
      return { ok: false, message: `Pick 1–${MAX_SCOUT_POSITIONS} target positions.` };
    }
    if (!country) return { ok: false, message: 'Pick a target country.' };
    const cost = SCOUT_CONTRACT_COST[months];
    if (!cost) return { ok: false, message: 'Pick a 3, 6 or 9-month contract.' };
    const club = clubs[meta.managerClubId];
    const scout = (club.staff ?? []).find((s) => s.id === scoutId && s.role === 'SCOUT');
    if (!scout) return { ok: false, message: 'Unknown scout.' };
    const assignments = meta.scoutAssignments ?? [];
    if (assignments.some((a) => a.scoutId === scoutId)) return { ok: false, message: `${scout.name.last} is already under contract.` };
    if (club.finances.balance < cost) return { ok: false, message: `Not enough funds — a ${months}-month contract costs £${cost.toLocaleString()}.` };
    const newAssignment = {
      scoutId, positions: positions as Position[], country,
      monthsTotal: months, reportsDelivered: 0, nextReportDay: meta.currentDay + SCOUT_MONTH_DAYS,
      foundPlayerIds: [],
    };
    const newClub = { ...club, finances: { ...club.finances, balance: club.finances.balance - cost } };
    const newMeta: SaveMeta = { ...meta, scoutAssignments: [...assignments, newAssignment] };
    set({ meta: newMeta, clubs: { ...clubs, [club.id]: newClub } });
    await putClubs(meta.id, [newClub]);
    await persistMeta(newMeta);
    return { ok: true, message: `${scout.name.last} signed to a ${months}-month contract scouting ${country} (£${cost.toLocaleString()}).` };
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
    // Age-band squad cap: each of U16 / U18 / U21 holds at most 25 players.
    const year = get().currentSeason()?.year ?? meta.startYear;
    const band = ageGroupForAge(year - prospect.player.born.year);
    const inBand = Object.values(meta.academyPlayers ?? {}).filter(
      (a) => a.clubId === meta.managerClubId && a.ageGroup === band,
    ).length;
    if (inBand >= ACADEMY_MAX_PER_GROUP) {
      return { ok: false, message: `Maximum squad size reached for ${band} — release a player before signing.` };
    }
    // Enroll into the academy (parallel roster).
    const np: Player = { ...prospect.player, contract: { ...prospect.player.contract, clubId: null }, academyClubId: club.id, squadRole: 'PROSPECT' };
    const academyPlayers = { ...meta.academyPlayers, [playerId]: { ...prospect.academy, clubId: club.id, ageGroup: band } };
    const newMeta: SaveMeta = { ...meta, academyPlayers, youthProspects: prospects.filter((p) => p.player.id !== playerId) };
    set({ players: { ...players, [playerId]: np }, meta: newMeta });
    await putPlayers(meta.id, [np]);
    await persistMeta(newMeta);
    return { ok: true, message: `${prospect.player.name.last} signed to the academy.` };
  },

  dismissYouthProspect: async (playerId) => {
    const { meta } = get();
    if (!meta) return { ok: false, message: 'No active save.' };
    const prospects = meta.youthProspects ?? [];
    const prospect = prospects.find((p) => p.player.id === playerId);
    if (!prospect) return { ok: false, message: 'Prospect not found.' };
    // Drop the report — the player stays out in the world, just off your list.
    const newMeta: SaveMeta = { ...meta, youthProspects: prospects.filter((p) => p.player.id !== playerId) };
    set({ meta: newMeta });
    await persistMeta(newMeta);
    return { ok: true, message: `${prospect.player.name.last} passed over.` };
  },

  dismissAllProspects: async () => {
    const { meta } = get();
    if (!meta) return { ok: false, message: 'No active save.' };
    const prospects = meta.youthProspects ?? [];
    // Clear only your own scouts' reports; leave any others untouched.
    const remaining = prospects.filter((p) => p.discoveredByClubId !== meta.managerClubId);
    const cleared = prospects.length - remaining.length;
    if (cleared === 0) return { ok: false, message: 'No prospect reports to clear.' };
    const newMeta: SaveMeta = { ...meta, youthProspects: remaining };
    set({ meta: newMeta });
    await persistMeta(newMeta);
    return { ok: true, message: `Cleared ${cleared} prospect${cleared === 1 ? '' : 's'} from your reports.` };
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
    const maxDay = get().seasonRefMaxDay();
    const wk = windowKey(meta, maxDay);
    const firstSeed = !meta.staffMarket; // silent one-time init, never gated
    if (!firstSeed) {
      if (!wk) return 'The staff market is shut until the next transfer window.';
      const prev = meta.staffRefreshes;
      const used = prev && prev.windowKey === wk ? prev.used : 0;
      if (used >= 3) return 'No refreshes left this window (3 per window).';
    }
    const usedNow = firstSeed ? 0 : (meta.staffRefreshes && meta.staffRefreshes.windowKey === wk ? meta.staffRefreshes.used : 0) + 1;
    // Deterministic per (save seed · window · refresh count) — a fresh pool each
    // click, but fully reproducible from the seed (no escape to Math.random).
    const rng = new Rng((meta.seed ^ hashSeed(`staff_${wk ?? 'init'}_${usedNow}`)) >>> 0);
    const staffRefreshes = firstSeed
      ? meta.staffRefreshes
      : { windowKey: wk!, used: usedNow };
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
    // Changing shape invalidates the slot-indexed manual lineup, and resets
    // tactical familiarity to its floor — the squad has to be drilled in the new
    // system before it clicks (re-selecting the same shape keeps its progress).
    const familiarity = formation === club.formation
      ? club.familiarity
      : { formation, level: FAMILIARITY_FLOOR };
    const updated = { ...club, formation, lineup: undefined, familiarity };
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

  setTacticSlider: async (kind, value) => {
    const { meta, clubs } = get();
    if (!meta) return;
    const club = clubs[meta.managerClubId];
    const base = club.tactics ?? { defensive: 'BALANCED' as const, offensive: 'POSSESSION' as const };
    const updated = { ...club, tactics: { ...base, [kind]: value } };
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

  setSetPieceRoutine: async (kind, value) => {
    const { meta, clubs } = get();
    if (!meta) return;
    const club = clubs[meta.managerClubId];
    const routine = { ...(club.setPieceRoutine ?? {}), [kind]: value || undefined };
    const updated = { ...club, setPieceRoutine: routine };
    set({ clubs: { ...clubs, [club.id]: updated } });
    await putClubs(meta.id, [updated]);
  },

  setTicketLevel: async (level) => {
    const { meta, clubs } = get();
    if (!meta) return;
    const club = clubs[meta.managerClubId];
    const updated = { ...club, ticketLevel: Math.max(0, Math.min(100, Math.round(level))) };
    set({ clubs: { ...clubs, [club.id]: updated } });
    await putClubs(meta.id, [updated]);
  },

  acceptSponsor: async (offerId) => {
    const { meta, clubs } = get();
    if (!meta) return;
    const offer = (meta.sponsorOffers ?? []).find((o) => o.id === offerId);
    if (!offer) return;
    const club = clubs[meta.managerClubId];
    const year = get().currentSeason()?.year ?? meta.startYear;
    const updated = { ...club, sponsor: { name: offer.name, annual: offer.annual, untilYear: year + offer.years } };
    const news = { id: `news_sponsoraccept_${offerId}`, day: meta.currentDay, category: 'BOARD' as const,
      title: `${offer.name} become shirt sponsor`,
      body: `A ${offer.years}-year shirt deal worth ${offer.annual.toLocaleString()}/season is signed with ${offer.name}.`, read: false };
    const newMeta: SaveMeta = { ...meta, sponsorOffers: undefined, news: [...meta.news, news] };
    set({ clubs: { ...clubs, [club.id]: updated }, meta: newMeta });
    await putClubs(meta.id, [updated]);
    await persistMeta(newMeta);
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

  setSlotRole: async (index, roleId) => {
    const { meta, clubs } = get();
    if (!meta) return;
    const club = clubs[meta.managerClubId];
    const slots = FORMATIONS[club.formation] ?? FORMATIONS['4-3-3'];
    const roles: (string | null)[] = slots.map((_, i) => club.roles?.[i] ?? null);
    roles[index] = roleId;
    const updated = { ...club, roles };
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

  saveLineupPreset: async (name) => {
    const { meta, clubs } = get();
    if (!meta) return { ok: false, message: 'No active save.' };
    const trimmed = name.trim();
    if (!trimmed) return { ok: false, message: 'Give the team sheet a name.' };
    const club = clubs[meta.managerClubId];
    const squad = get().getClubPlayers(club.id);
    // Snapshot the team sheet exactly as it's shown on the Tactics screen. On
    // auto-mode that's the freshly-resolved XI (never a stale saved `lineup`);
    // on manual mode it's the manager's own choices, resolved as a fallback.
    const autoMode = club.autoMode ?? true;
    const lineup = autoMode || !club.lineup
      ? assignXI(squad, club.formation, { autoMode: true }).map((a) => a?.player.id ?? null)
      : club.lineup;
    const bench = (autoMode || !club.bench
      ? resolveBench(squad, club.formation, { autoMode: true }).map((p) => p.id)
      : club.bench).filter((id): id is string => !!id);
    const preset = { name: trimmed, formation: club.formation, lineup: [...lineup], bench: [...bench] };
    const existing = club.lineupPresets ?? [];
    const idx = existing.findIndex((p) => p.name.toLowerCase() === trimmed.toLowerCase());
    const lineupPresets = idx >= 0
      ? existing.map((p, i) => (i === idx ? preset : p))
      : [...existing, preset].slice(0, 6); // keep it manageable
    const updated = { ...club, lineupPresets };
    set({ clubs: { ...clubs, [club.id]: updated } });
    await putClubs(meta.id, [updated]);
    return { ok: true, message: idx >= 0 ? `Updated team sheet “${trimmed}”.` : `Saved team sheet “${trimmed}”.` };
  },

  applyLineupPreset: async (index) => {
    const { meta, clubs } = get();
    if (!meta) return { ok: false, message: 'No active save.' };
    const club = clubs[meta.managerClubId];
    const preset = club.lineupPresets?.[index];
    if (!preset) return { ok: false, message: 'That team sheet is gone.' };
    // Players may have been sold/injured since the preset was saved — drop any
    // who are no longer in the squad rather than field a ghost.
    const inSquad = new Set(get().getClubPlayers(club.id).map((p) => p.id));
    let dropped = 0;
    const lineup = preset.lineup.map((id) => {
      if (id && !inSquad.has(id)) { dropped += 1; return null; }
      return id;
    });
    const bench = preset.bench.filter((id) => inSquad.has(id));
    const updated = { ...club, formation: preset.formation, lineup, bench, autoMode: false };
    set({ clubs: { ...clubs, [club.id]: updated } });
    await putClubs(meta.id, [updated]);
    return {
      ok: true,
      message: dropped > 0
        ? `Loaded “${preset.name}” — ${dropped} player${dropped > 1 ? 's are' : ' is'} no longer available, so ${dropped > 1 ? 'those slots were' : 'that slot was'} left open.`
        : `Loaded team sheet “${preset.name}”.`,
    };
  },

  deleteLineupPreset: async (index) => {
    const { meta, clubs } = get();
    if (!meta) return;
    const club = clubs[meta.managerClubId];
    const lineupPresets = (club.lineupPresets ?? []).filter((_, i) => i !== index);
    const updated = { ...club, lineupPresets };
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
    const startDay = get().meta?.currentDay ?? 0;
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
      if (next.day > meta.currentDay) {
        // Still ahead of the fixture: fast-forward toward it, pausing at any
        // continental/cup boundary so ties stay interleaved. When we land on the
        // match day the loop falls through to the branch below and stops there,
        // leaving it unplayed so the manager can watch or sim it.
        const stopAt = nextKnockoutStop(get);
        const stop = Math.min(next.day, stopAt);
        if (stop > meta.currentDay) await playDays(get, set, meta.currentDay, stop);
        else return; // defensive: no forward progress possible
      } else if (meta.currentDay === startDay) {
        // We began this call already standing on the (unplayed) fixture — the
        // manager has chosen to move on rather than watch, so sim just this
        // matchday and carry on to stop at the *following* match.
        await simTo(get, set, meta.currentDay + 1);
      } else {
        return; // arrived at their next match this click — stop so they can play it
      }
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

      // Challenge scenario: judge the season just finished against the win
      // condition (uses pre-rollover cup kinds to spot fresh cup wins).
      let challenge = meta.challenge;
      const challengeNews: NewsItem[] = [];
      if (challenge && challenge.status === 'ACTIVE') {
        const def = challengeById(challenge.id);
        if (def) {
          const finishedYear = get().currentSeason()?.year ?? meta.startYear;
          const wonCupThisSeason = Object.entries(result.cupHolders ?? {}).some(([cupId, h]) =>
            h.clubId === challenge!.clubId && h.year === finishedYear &&
            (meta.domesticCups?.[cupId]?.kind ?? 'MAJOR') !== 'SUPER');
          const evalRes = evaluateChallenge(challenge, def, {
            managerClubId: result.sacked ? '' : meta.managerClubId,
            finalStandings: result.finalStandings,
            competitions: result.competitions,
            wonCupThisSeason,
            seasonsElapsed: finishedYear - challenge.startYear + 1,
            day: 0,
          });
          challenge = evalRes.state;
          challengeNews.push(...evalRes.news);
        }
      }

      const newMeta: SaveMeta = {
        ...meta,
        challenge,
        competitions: result.competitions,
        seasons,
        currentDay: 0,
        news: [...meta.news, ...result.news, ...challengeNews],
        board: result.board ?? meta.board,
        sacked: result.sacked ?? false,
        history: [...(meta.history ?? []), ...(result.historyEntry ? [result.historyEntry] : [])],
        hallOfFame: [...(meta.hallOfFame ?? []), ...(result.hallOfFameAdds ?? [])],
        pendingOffers: [],
        brokenTalks: {},
        walkedStaff: {},
        declinedJobClubIds: [],
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

      // Shirt sponsorship (§ #37): retire an expired deal, and when the manager
      // has no headline sponsor, table a slate of offers to choose from.
      if (!newMeta.sacked) {
        const newYear = result.newSeason.year;
        const mgrClub = result.clubs[meta.managerClubId];
        if (mgrClub) {
          if (mgrClub.sponsor && mgrClub.sponsor.untilYear < newYear) {
            result.clubs[meta.managerClubId] = { ...mgrClub, sponsor: undefined };
          }
          const active = result.clubs[meta.managerClubId].sponsor;
          if (!active) {
            let pos = 10, size = 20;
            for (const rows of Object.values(result.finalStandings)) {
              const idx = rows.findIndex((r) => r.clubId === meta.managerClubId);
              if (idx >= 0) { pos = idx + 1; size = rows.length; break; }
            }
            const successMult = Math.max(0, 1 - (pos - 1) / Math.max(1, size));
            const offers = generateSponsorOffers(result.clubs[meta.managerClubId], successMult, new Rng((meta.seed ^ (newYear * 0x59074501)) >>> 0));
            newMeta.sponsorOffers = offers;
            newMeta.news = [...newMeta.news, { id: `news_sponsor_${newYear}`, day: 0, category: 'BOARD', title: 'Shirt sponsorship offers', body: 'Commercial partners are courting the club — choose a shirt sponsor on the Club screen.', read: false }];
          } else {
            newMeta.sponsorOffers = undefined; // a live deal — no open offers
          }
        }
      }

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
        // The manager's own campaign: every summer their nation plays, the
        // finish moves their reputation and writes their story — not just wins.
        for (const t of tournaments) {
          if (!meta.nationalJob) continue;
          const finish = nationFinish(t, meta.nationalJob);
          if (!finish) continue;
          newMeta.managerReputation = clamp((newMeta.managerReputation ?? 50) + finish.repDelta, 5, 99);
          if (finish.champion) {
            newMeta.nationalTrophies = [...(meta.nationalTrophies ?? []), { name: t.name, year: t.year }];
            newMeta.news = [...newMeta.news, { id: `news_intlmgr_${t.kind}_${t.year}`, day: 0, category: 'BOARD', title: `${t.name} winner!`, body: `You led ${meta.nationalJob} to glory at the ${t.name} — your reputation soars.`, read: false }];
          } else {
            newMeta.news = [...newMeta.news, {
              id: `news_intlmgr_${t.kind}_${t.year}`, day: 0, category: 'BOARD',
              title: `${t.name}: ${meta.nationalJob} ${finish.label}`,
              body: finish.repDelta >= 0
                ? `A creditable summer with the national side — your stock rises.`
                : `A disappointing exit — questions are asked about your dual role.`,
              read: false,
            }];
          }
        }
      }

      // Staged transfer fees falling due this new season hit the fresh budget —
      // an installment deal only costs its per-year slice each summer.
      if ((meta.installments?.length ?? 0) > 0) {
        const nextYear = result.newSeason.year;
        const due = (meta.installments ?? []).filter((p) => p.dueYear <= nextYear);
        newMeta.installments = (meta.installments ?? []).filter((p) => p.dueYear > nextYear);
        if (due.length) {
          const paidClubs = { ...result.clubs };
          let managerOut = 0;
          for (const p of due) {
            const payer = paidClubs[p.payerClubId];
            if (payer) {
              paidClubs[p.payerClubId] = { ...payer, finances: { ...payer.finances, balance: payer.finances.balance - p.amount, transferBudget: Math.max(0, payer.finances.transferBudget - p.amount) } };
              if (p.payerClubId === meta.managerClubId) managerOut += p.amount;
            }
            if (p.payeeClubId && paidClubs[p.payeeClubId]) {
              const payee = paidClubs[p.payeeClubId];
              paidClubs[p.payeeClubId] = { ...payee, finances: { ...payee.finances, balance: payee.finances.balance + p.amount } };
            }
          }
          result.clubs = paidClubs;
          if (managerOut > 0) newMeta.news = [...newMeta.news, { id: `news_instal_${nextYear}`, day: 0, category: 'BOARD', title: 'Transfer installments due', body: `£${managerOut.toLocaleString()} in staged transfer fees came due this summer.`, read: false }];
        }
      }

      // Player Career: roll the avatar's season — archive the year into their
      // history, hand them fresh season objectives, and clear per-match state.
      if (newMeta.careerMode === 'PLAYER' && newMeta.playerCareer) {
        const pc = newMeta.playerCareer;
        const avatar = result.players[pc.playerId];
        const finished = get().currentSeason();
        const clubName = avatar?.contract.clubId ? (result.clubs[avatar.contract.clubId]?.name ?? '') : '';
        let assists = 0;
        if (avatar && finished) for (const s of avatar.stats) if (s.seasonId === finished.id) assists += s.assists;
        // International: accrue a season of caps/goals + any tournament squad.
        let international = pc.international;
        let tournamentSquads = pc.tournamentSquads ?? [];
        const intlNews: NewsItem[] = [];
        if (pc.international.capped) {
          const capsAdd = pc.status === 'STAR' || pc.status === 'CAPTAIN' ? 8 : pc.status === 'KEY' ? 5 : 3;
          const goalsAdd = Math.round(pc.seasonGoals * 0.18);
          international = { capped: true, caps: pc.international.caps + capsAdd, intlGoals: pc.international.intlGoals + goalsAdd };
          if ((result.tournaments?.length ?? 0) > 0 || result.worldCup) {
            const compName = result.worldCup ? 'World Cup' : (result.tournaments?.[0]?.name ?? 'international tournament');
            tournamentSquads = [...tournamentSquads, { competition: compName, season: finished?.label ?? '' }];
            intlNews.push({ id: `news_pc_tsquad_${result.newSeason.year}`, day: 0, category: 'MILESTONE', title: 'Named in a tournament squad', body: `${avatar ? `${avatar.name.first} ${avatar.name.last}` : 'You'} made the squad for the ${compName}.`, read: false });
          }
        }
        newMeta.news = [...newMeta.news, ...intlNews];

        // Off-pitch rollover (Tier 4): a loan spell that's run its course returns
        // the avatar to his parent club; expired sponsorships drop off. Interest,
        // sagas and offers are cleared for a clean new-season slate.
        let loanSpell = pc.loanSpell ?? null;
        if (loanSpell && avatar && result.newSeason.year >= loanSpell.until) {
          const parent = result.clubs[loanSpell.parentClubId];
          const loanClub = result.clubs[loanSpell.loanClubId];
          if (parent) {
            result.clubs[parent.id] = { ...parent, playerIds: [...new Set([...parent.playerIds, avatar.id])] };
            if (loanClub) result.clubs[loanClub.id] = { ...loanClub, playerIds: loanClub.playerIds.filter((id) => id !== avatar.id) };
            result.players[avatar.id] = { ...avatar, contract: { ...avatar.contract, clubId: parent.id }, loan: null, squadRole: 'ROTATION' };
            newMeta.news = [...newMeta.news, { id: `news_pc_loanback_${result.newSeason.year}`, day: 0, category: 'MILESTONE', title: 'Back from loan', body: `${avatar.name.first} ${avatar.name.last} returns to ${parent.name} after a season out — ${pc.seasonApps} apps, ${pc.seasonGoals} goals — ready to fight for a place.`, read: false }];
          }
          loanSpell = null;
        }
        const survivingSponsors = (pc.sponsorships ?? []).filter((s) => s.until >= result.newSeason.year);

        // Honours the avatar earned this finished season (trophies + individual
        // awards), for the season-by-season table + club-legend recording.
        const seasonHonours = avatar && finished
          ? avatar.awards.filter((a) => a.seasonId === finished.id).map((a) => a.label ?? a.awardId)
          : [];
        newMeta.playerCareer = {
          ...pc,
          seasonHistory: [...pc.seasonHistory, {
            season: finished?.label ?? String(meta.startYear), club: clubName,
            apps: pc.seasonApps, goals: pc.seasonGoals, assists, avgRating: pc.seasonAvgRating, honours: seasonHonours,
          }],
          seasonApps: 0, seasonGoals: 0, seasonAvgRating: 0,
          objectives: avatar ? generateSeasonObjectives(avatar, (meta.seed ^ result.newSeason.year) >>> 0) : [],
          matchObjectives: [],
          lastMatch: null,
          international, tournamentSquads,
          confidence: 60, matchSharpness: 100,
          pendingConversations: [...(pc.pendingConversations ?? []), roleMeetingConversation(0)],
          // Off-pitch: fresh market slate; keep agent, image, following, lifestyle, earnings.
          loanSpell, sponsorships: survivingSponsors,
          transferInterest: [], activeSagas: [], contractOffers: [], loanOffers: [],
          pendingPress: [], pendingSponsorOffers: [], transferRequestPending: false,
        };
        // Keep the stand-in "manager club" on the avatar's club (e.g. after a
        // loan spell ends and he returns to his parent), so the world screens
        // follow him into the new season.
        const avClub = result.players[pc.playerId]?.contract.clubId;
        if (avClub && avClub !== newMeta.managerClubId) newMeta.managerClubId = avClub;
      }

      // Persist playoff/cup/continental (history) + new fixtures + squads.
      await putMatches(meta.id, result.playoffMatches);
      await putMatches(meta.id, result.extraMatches ?? []);
      await putMatches(meta.id, result.newMatches);
      await putPlayers(meta.id, Object.values(result.players));
      await deletePlayers(meta.id, result.retiredIds);
      await putClubs(meta.id, Object.values(result.clubs));
      await persistMeta(newMeta);

      // Archive the finished season's matches: the sim never reads a past
      // season's fixtures again (load + runtime only ever hold the current
      // season), so drop the heavy minute-by-minute event timelines — keeping
      // the decisive PENALTY marker for knockout history + the result and
      // player stats — to cap IndexedDB growth over a long save. Non-destructive
      // to anything the game shows.
      const finished = Object.values(get().matches).filter((m) => m.played && m.events.length > 1);
      if (finished.length) {
        const stripped = finished.map((m) => ({ ...m, events: m.events.filter((e) => e.type === 'PENALTY'), shots: undefined }));
        await putMatches(meta.id, stripped);
      }

      const matches: Record<string, Match> = {};
      for (const m of result.newMatches) matches[m.id] = m;

      set({
        meta: newMeta,
        matches,
        players: result.players,
        clubs: result.clubs,
      });

      // A farewell season that has now finished executes the retirement — the
      // send-off, testimonial and Hall of Fame — on top of the fresh state.
      const rc = newMeta.playerCareer;
      if (newMeta.careerMode === 'PLAYER' && rc?.retirement?.announced && rc.retirement.retiredDay == null
          && rc.retirement.finalSeason != null && (result.newSeason.year - 1) >= rc.retirement.finalSeason) {
        await retireAvatarNow(get, set, rc.retirement.reason ?? 'CHOICE');
      }
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
        roles: club.roles,
        familiarity: club.familiarity && club.familiarity.formation === (club.formation ?? '4-3-3') ? club.familiarity.level : undefined,
        setPieces: { penaltyTakerId: club.penaltyTakerId, freeKickTakerId: club.freeKickTakerId, cornerTakerId: club.cornerTakerId },
        setPieceRoutine: club.setPieceRoutine,
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

  liveShootoutMode: (manual) => {
    const state = get().liveMatch;
    if (!state?.shootout) return;
    const s = structuredClone(state);
    const managed: LiveSide = s.home.managed ? 'home' : 'away';
    if (manual && !s.shootout!.order) {
      // Default taker order: those on the pitch, best finishers first.
      const players = get().players;
      s.shootout!.order = [...s[managed].onPitch].sort(
        (a, b) => (players[b]?.attributes.technical.finishing ?? 0) - (players[a]?.attributes.technical.finishing ?? 0),
      );
    }
    s.shootout!.manual = manual;
    set({ liveMatch: s });
  },

  liveShootoutOrder: (order) => {
    const state = get().liveMatch;
    if (!state?.shootout || state.shootout.kicks.length > 0) return; // locked once kicks begin
    const s = structuredClone(state);
    s.shootout!.order = order;
    set({ liveMatch: s });
  },

  liveShootoutAim: (aim) => {
    const state = get().liveMatch;
    if (!state?.shootout || !liveRng || state.phase !== 'SHOOTOUT') return;
    const managed: LiveSide = state.home.managed ? 'home' : 'away';
    const taken = state.shootout.kicks.filter((k) => k.side === managed).length;
    const order = state.shootout.order ?? [];
    const takerId = order.length ? order[taken % order.length] : undefined;
    const takerSkill = takerId ? get().players[takerId]?.attributes.technical.finishing : undefined;
    const s = structuredClone(state);
    takeShootoutKick(s, liveRng, { aim, takerSkill, takerId });
    set({ liveMatch: s });
  },

  liveShootoutDive: (dive) => {
    const state = get().liveMatch;
    if (!state?.shootout || !liveRng || state.phase !== 'SHOOTOUT') return;
    const s = structuredClone(state);
    takeShootoutKick(s, liveRng, { keeperDive: dive });
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
      events: outcome.events, playerStats: outcome.playerStats, shots: outcome.shots,
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
      jobOffers: [], declinedJobClubIds: [], news: [...meta.news, news], academyPlayers,
    };
    set({ meta: newMeta, players });
    if (addedIds.length) await putPlayers(meta.id, addedIds.map((id) => players[id]));
    await persistMeta(newMeta);
    return { ok: true, message: `You are the new manager of ${newClub.name}.` };
  },

  declineJobOffer: async (offerId) => {
    const { meta, clubs } = get();
    if (!meta) return;
    let jobOffers = (meta.jobOffers ?? []).filter((o) => o.id !== offerId);
    const turnedDown = (meta.jobOffers ?? []).find((o) => o.id === offerId)?.clubId;
    const declinedIds = [...(meta.declinedJobClubIds ?? []), ...(turnedDown ? [turnedDown] : [])];
    // A sacked manager can't play until he takes a job, so the offer list must
    // never run dry: declining the last offer brings fresh (lower-band)
    // approaches in, skipping every club he already turned down.
    if (meta.sacked && jobOffers.length === 0) {
      const declined = new Set(declinedIds);
      const rng = new Rng((meta.seed ^ hashSeed(`jobs_${meta.currentDay}_${declined.size}`)) >>> 0);
      jobOffers = fallbackJobOffers(
        meta.managerReputation ?? 50, meta.managerClubId, clubs, meta.competitions, rng, meta.currentDay, declined,
      );
    }
    const newMeta: SaveMeta = { ...meta, jobOffers, declinedJobClubIds: declinedIds };
    set({ meta: newMeta });
    await persistMeta(newMeta);
  },

  ensureJobOffers: async () => {
    const { meta, clubs } = get();
    if (!meta || !meta.sacked || (meta.jobOffers ?? []).length > 0) return;
    // Heals saves that got stuck between jobs with an empty offer list.
    const rng = new Rng((meta.seed ^ hashSeed(`jobs_heal_${meta.currentDay}`)) >>> 0);
    const jobOffers = fallbackJobOffers(
      meta.managerReputation ?? 50, meta.managerClubId, clubs, meta.competitions, rng, meta.currentDay,
      new Set(meta.declinedJobClubIds ?? []),
    );
    if (jobOffers.length === 0) return; // nowhere to go (shouldn't happen)
    const newMeta: SaveMeta = { ...meta, jobOffers };
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

  // The manager league's own last matchday — the calendar's anchor. Using this
  // (instead of the global max, which the Club World Cup and 30-club leagues
  // inflate) keeps a 20-club league spanning the whole August→May window.
  seasonRefMaxDay: () => {
    const { meta } = get();
    if (!meta) return 0;
    const league = Object.values(meta.competitions).find(
      (c) => c.id.startsWith('comp_') && c.clubIds.includes(meta.managerClubId),
    );
    if (!league) return get().lastMatchday();
    let mx = 0;
    for (const m of get().currentSeasonMatches()) if (m.competitionId === league.id && m.day > mx) mx = m.day;
    return mx || get().lastMatchday();
  },

  seasonComplete: () =>
    get().currentSeasonMatches().filter((m) => !m.neutral).every((m) => m.played),
}));

/**
 * Play every unplayed league match with `from <= day < to`, then set
 * currentDay = to. Batches all matches into a single worker dispatch.
 */
/** Advance the interactive match engine one step and reflect it in state. */
function stepInteractive(
  get: () => GameState,
  set: (partial: Partial<GameState>) => void,
  input: InteractiveInput,
  decisions: MomentDecision[],
): void {
  const cur = get().interactivePlay;
  if (!cur) return;
  const step = runInteractiveMatch(input, decisions);
  if (step.kind === 'DECISION') {
    const halfTime = step.moment.minute >= 45 && !cur.halfTimeSeen;
    set({ interactivePlay: { ...cur, input, decisions, pending: step.moment, ticker: step.ticker, done: null, phase: halfTime ? 'HALFTIME' : 'PLAYING' } });
  } else {
    set({ interactivePlay: { ...cur, input, decisions: step.record.decisionLog, pending: null, ticker: step.ticker, done: { match: step.match, record: step.record }, phase: 'DONE' } });
  }
}

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

    // Player Career: set this advance's objectives for the avatar's fixtures,
    // then bias their club's selection by manager trust (only their club is
    // affected — the bias map holds just the avatar).
    const careerBeforeObj = playerCareerOf(meta);
    const avatarAtStart = careerBeforeObj ? get().players[careerBeforeObj.playerId] : undefined;
    const careerAtStart = careerBeforeObj
      ? ensureAdvanceObjectives(careerBeforeObj, avatarAtStart, toPlay, meta.seed)
      : null;
    const selectionBias = careerAtStart && avatarAtStart
      ? { [careerAtStart.playerId]: avatarSelectionBias(careerAtStart, avatarAtStart, Object.values(get().players).filter((pl) => pl.contract.clubId === avatarAtStart.contract.clubId)) }
      : undefined;

    // Simulate the whole range in one worker dispatch…
    const simulated = await simulateMatches(toPlay, clubs, get().players, ctxByMatch, selectionBias);
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

    // Live in-season stats: refresh the running season tally for everyone who
    // featured this advance, so player career records update every matchday
    // rather than only at the season rollover. Recompute from the full
    // current-season match set (idempotent) and replace this season's rows.
    if (season) {
      const sid = season.id;
      const seasonMatches = Object.values(matches).filter((m) => m.seasonId === sid && m.played && !m.neutral);
      const { stats: freshStats } = aggregateSeasonStats(sid, seasonMatches, playersById);
      const playedIds = new Set<string>();
      for (const m of played) if (!m.neutral) for (const ps of m.playerStats) playedIds.add(ps.playerId);
      if (playedIds.size) playersById = { ...playersById };
      for (const pid of playedIds) {
        const cur = playersById[pid];
        if (!cur) continue;
        const rows = freshStats.get(pid) ?? [];
        playersById[pid] = { ...cur, stats: [...cur.stats.filter((s) => s.seasonId !== sid), ...rows] };
        changedIds.add(pid);
      }
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
    let pendingOffers = [...(meta.pendingOffers ?? []), ...newOffers].slice(-25);

    // Rumour mill (§ Living market): idle gossip that escalates from interest to
    // a valuation to a looming bid, and boils over into a real offer for one of
    // the manager's stars. Runs off its own sub-seed so it stays deterministic.
    const rumourRes = advanceRumours(
      meta.managerClubId, clubs, playersById, meta.rumours ?? [], pendingOffers,
      meta.seed, to, from, toYear,
    );
    newsItems.push(...rumourRes.news);
    if (rumourRes.bids.length) pendingOffers = [...pendingOffers, ...rumourRes.bids].slice(-25);
    const rumours = rumourRes.rumours;

    // Resolve active youth scouting contracts → monthly prospect reports (§ Academy).
    const scoutsById: Record<string, import('../types/staff').Staff> = {};
    for (const s of clubs[meta.managerClubId]?.staff ?? []) scoutsById[s.id] = s;
    const scoutRes = resolveScoutAssignments(
      meta.scoutAssignments ?? [], scoutsById, meta.managerClubId, toYear, from, to,
      meta.ratingCap ?? 90, (meta.seed ^ (to * 40503)) >>> 0,
    );
    newsItems.push(...scoutRes.news);
    // A 9-month contract can file up to ~72 prospects; keep a generous rolling window.
    const youthProspects = [...(meta.youthProspects ?? []), ...scoutRes.prospects].slice(-90);

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

    // Long-running story arcs (wonderkid, nemesis, sagas, objective memory) —
    // mutated in place by the advance* helpers, persisted below.
    const storylines = storylinesOf(meta);
    {
      const candidateIds = Object.values(meta.academyPlayers ?? {})
        .filter((ap) => ap.clubId === meta.managerClubId)
        .map((ap) => ap.playerId)
        .concat(Object.values(playersById).filter((p) => p.contract.clubId === meta.managerClubId).map((p) => p.id));
      newsItems.push(...advanceWonderkid(storylines, playersById, candidateIds, toYear, to));
      newsItems.push(...advanceSagas(storylines, playersById, meta.managerClubId, to));
      const mgrComp = Object.values(meta.competitions).find((c) => c.clubIds.includes(meta.managerClubId));
      if (mgrComp && meta.board) {
        const rows = computeStandings(mgrComp, Object.values(matches));
        const pos = rows.findIndex((r) => r.clubId === meta.managerClubId) + 1;
        const maxDay = Object.values(matches).reduce((mx, m) => Math.max(mx, m.neutral ? 0 : m.day), 0);
        newsItems.push(...advanceObjectiveMemory(storylines, meta.board, pos, to, maxDay, toYear));
      }
    }

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

    // Dynamic board confidence: the board reacts to league results as the season
    // unfolds and voices concern before any end-of-season reckoning.
    {
      const mgrComp = Object.values(meta.competitions).find((c) => c.clubIds.includes(meta.managerClubId));
      if (board && mgrComp) {
        let w = 0, d = 0, l = 0, gfSum = 0;
        for (const m of playedMerged) {
          if (m.competitionId !== mgrComp.id) continue;
          const isH = m.homeClubId === meta.managerClubId;
          const isA = m.awayClubId === meta.managerClubId;
          if (!isH && !isA) continue;
          const gf = isH ? m.homeGoals : m.awayGoals;
          const ga = isH ? m.awayGoals : m.homeGoals;
          gfSum += gf;
          if (gf > ga) w++; else if (gf === ga) d++; else l++;
        }
        if (w + d + l > 0) {
          const rows = computeStandings(mgrComp, Object.values(matches));
          const pos = rows.findIndex((r) => r.clubId === meta.managerClubId) + 1;
          if (pos > 0) {
            const before = confidenceBand(board.confidence);
            const fanBefore = fanBand(fanConfidenceOf(board));
            // Fans react first, then their mood presses on the boardroom.
            const attacking = attackingScore(clubs[meta.managerClubId]?.tactics);
            const fan = tickFanConfidence(board, pos, w, d, l, { attacking, goalsFor: gfSum, games: w + d + l });
            let conf = tickBoardConfidence(board, pos, w, d, l);
            conf = applyFanPressure(conf, fan);
            board = { ...board, confidence: conf, fanConfidence: fan };
            const after = confidenceBand(board.confidence);
            if (after > before) {
              newsItems.push({
                id: `news_boardmood_${to}`, day: to, category: 'BOARD',
                title: after === 2 ? 'The board are reviewing your position' : 'The board have voiced concern',
                body: after === 2
                  ? 'Results have the board weighing your future — a turnaround is needed, and quickly.'
                  : "The board aren't happy with the recent run and expect an improvement.",
                read: false,
              });
            }
            const fanAfter = fanBand(fan);
            if (fanAfter > fanBefore) {
              newsItems.push({
                id: `news_fanmood_${to}`, day: to, category: 'BOARD',
                title: fanAfter === 2 ? 'The supporters are turning' : 'Restless supporters',
                body: fanAfter === 2
                  ? 'The terraces have run out of patience — discontent is spilling over and the board have noticed.'
                  : 'The fans are grumbling about results and the football on offer.',
                read: false,
              });
            }
          }
        }
      }
    }

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

      // Nemesis arc: repeated defeats to the same AI manager become a story.
      if (clubs[oppId]) {
        const oppMgr = aiManagerOf(oppId, clubs[oppId], meta.seed, meta.aiManagers);
        if (oppMgr) newsItems.push(...advanceNemesis(storylines, oppMgr.name, gf > ga, gf === ga, to));
      }
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

    // Player unhappiness → transfer requests. A player who has outgrown a weaker
    // side (team strength) or can't get on the pitch (playing time) grows restless
    // and may down tools — the same willingness that makes rivals easy to prise away.
    const unhappyRng = new Rng((meta.seed ^ (to * 374761393)) >>> 0);
    const mgrClubNow = clubs[meta.managerClubId];
    const mgrGames = season
      ? Object.values(matches).filter((m) => m.seasonId === season.id && m.played && !m.neutral && (m.homeClubId === meta.managerClubId || m.awayClubId === meta.managerClubId)).length
      : 0;
    for (const p of Object.values(playersById)) {
      if (p.contract.clubId !== meta.managerClubId || p.transferRequested || p.transferListed || !mgrClubNow) continue;
      const apps = season ? p.stats.filter((s) => s.seasonId === season.id).reduce((n, s) => n + s.appearances, 0) : 0;
      const w = leaveWillingness(p, mgrClubNow, apps, mgrGames);
      // Keen to go and out of contention → a real chance he asks to leave.
      if (w >= 70 && unhappyRng.chance(0.06 + (w - 70) * 0.006)) {
        playersById[p.id] = { ...p, transferRequested: true };
        changedIds.add(p.id);
        const reason = mgrGames > 0 && apps / mgrGames < 0.4 ? 'wants regular football' : 'feels he has outgrown the club';
        newsItems.push({
          id: `news_treq_${p.id}_${to}`, day: to, category: 'TRANSFER',
          title: `${p.name.first} ${p.name.last} hands in a transfer request`,
          body: `${p.name.last} ${reason} and has asked to leave. Respond on his profile — grant it (list him) or reject it (he'll sulk).`,
          read: false,
        });
      }
    }

    // Position retraining: players learning a new role progress with each day
    // of training (~120 days to master it), then gain the position permanently.
    for (const p of Object.values(playersById)) {
      const t = p.training;
      // Manager's club players retrain; in Player mode the avatar retrains too,
      // wherever he's contracted (a genuine late-career second act, Tier 5).
      if (!t?.retrainPosition) continue;
      if (p.contract.clubId !== meta.managerClubId && p.id !== careerAtStart?.playerId) continue;
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
    const maxDayW = get().seasonRefMaxDay();
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
          playersById[a.playerId] = { ...p, contract: { ...p.contract, clubId: a.toClubId, wage: a.wage, startYear: toYear, expiresYear: toYear + a.years, releaseClause: a.releaseClause }, squadRole: 'ROTATION', loan: null, transferListed: false, preContract: null };
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

    // Deadline day (§ Living market): the window just slammed shut this advance.
    // Run a small burst of last-minute AI business and format the theatre.
    let deadlineFeed = meta.deadlineFeed;
    if (wasOpen && !nowOpen) {
      const closingKind = windowOnDate(currentDate({ ...meta, currentDay: from }, maxDayW));
      const burst = runAiToAiTransfers(clubsAfter, playersById, meta.managerClubId, toYear,
        new Rng((meta.seed ^ (to * 0x0dead1e5)) >>> 0), { maxDeals: 8, day: to });
      if (burst.deals.length > 0) {
        playersById = burst.players;
        clubsAfter = burst.clubs;
        for (const d of burst.deals) changedIds.add(d.playerId);
        await putClubs(meta.id, Object.values(clubsAfter));
      }
      // The manager's own late business folded into the same feed.
      const managerMoves = newsItems
        .filter((n) => n.day === to && n.category === 'TRANSFER' && /completes his move|Signed |Sold /.test(n.title + n.body))
        .slice(-4)
        .map((n) => ({ playerName: n.title, text: n.title }));
      deadlineFeed = buildDeadlineFeed(burst.deals, managerMoves, playersById, clubsAfter, closingKind === 'WINTER' ? 'Winter' : 'Summer', to);
      newsItems.push({
        id: `news_deadline_${to}`, day: to, category: 'TRANSFER',
        title: `⏰ ${deadlineFeed.windowLabel} deadline day`,
        body: `The window slams shut — ${burst.deals.length} late deal${burst.deals.length === 1 ? '' : 's'} across the leagues. See the deadline feed on the Inbox.`,
        read: false,
      });
    }

    // Autumn awards gala — the Ballon d'Or et al., announced in late October of
    // the new season honouring the prior campaign. Fires once its day arrives.
    let pendingGala = meta.pendingGala ?? null;
    let history = meta.history;
    let ballonDor = meta.ballonDor ?? null;
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
      // Crown the reigning Ballon d'Or so the dashboard can carry a standing badge.
      const ballon = gala.awards.find((a) => a.type === 'GLOBAL_BEST');
      const winner = ballon?.playerId ? playersById[ballon.playerId] : undefined;
      if (winner) ballonDor = { playerId: winner.id, name: `${winner.name.first} ${winner.name.last}`, year: gala.year };
      pendingGala = null;
    }

    // Transfer relations cool over time: tension ebbs, and a club that broke off
    // talks is willing again once its two-week freeze has passed (resetting to a
    // calmer baseline so it remembers the friction without holding a grudge).
    let clubRelations = meta.clubRelations;
    if (clubRelations && Object.keys(clubRelations).length) {
      const ease = Math.max(1, Math.round((to - from) * 0.6));
      clubRelations = Object.fromEntries(Object.entries(clubRelations).map(([id, r]) => {
        if (r.refuseUntil && to >= r.refuseUntil) return [id, { tension: Math.min(r.tension, 45) }];
        return [id, { tension: Math.max(0, r.tension - ease), refuseUntil: r.refuseUntil }];
      }));
    }

    // Player Career: fold this advance into the avatar's career — refresh season
    // tallies, drift manager trust from the games played, capture the latest
    // match summary and raise personal milestones + a feed item.
    let playerCareer = meta.playerCareer;
    if (careerAtStart) {
      const avatar = playersById[careerAtStart.playerId];
      if (avatar) {
        // 1) Objectives + trust + summary + milestones.
        const res = applyAvatarMatchday(
          careerAtStart, avatar, played, clubs, meta.competitions, season?.id, to,
        );
        let pc = res.career;
        let moraleDelta = res.moraleDelta;
        newsItems.push(...res.news);

        // 2) Progression: status ladder, rival, traits, adversity, call-up.
        const cid = avatar.contract.clubId;
        const squad = Object.values(playersById).filter((pl) => pl.contract.clubId === cid);
        const prevInjured = !!avatarAtStart?.injury;
        const prog = progressPlayerCareer(pc, avatar, squad, toYear, to, prevInjured);
        pc = prog.career; newsItems.push(...prog.news);

        // 3) A demotion this advance triggers a manager sit-down.
        if (statusRank(pc.status) < statusRank(careerAtStart.status) &&
            !(pc.pendingConversations ?? []).some((c) => c.trigger === 'DROPPED')) {
          pc = { ...pc, pendingConversations: [...(pc.pendingConversations ?? []), postDropConversation(pc.status, to)] };
        }

        // 4) Promises falling due.
        const prom = evaluatePromises(pc, avatar, to);
        pc = prom.career; newsItems.push(...prom.news); moraleDelta += prom.moraleDelta;

        // 5) Off-pitch life (Tier 4): market interest, sagas, renewals, loans,
        //    sponsors, press triggers, wealth. Event-driven + deterministic;
        //    may execute an auto-negotiated move (patches avatar + clubs).
        const off = advanceOffPitch({
          career: pc, avatar, clubs: clubsAfter, year: toYear, day: to,
          daysElapsed: Math.max(1, to - from), seed: meta.seed, newSummary: pc.lastMatch,
        });
        pc = off.career; newsItems.push(...off.news); moraleDelta += off.moraleDelta;
        if (off.clubPatches) {
          clubsAfter = { ...clubsAfter, ...off.clubPatches };
          await putClubs(meta.id, Object.values(off.clubPatches));
        }

        // 6) Legacy & endgame (Tier 5): ambitions, decline, veteran traits, role
        //    arc, live legacy, twilight offers, forced-retirement detection.
        {
          const ambRes = updateAmbitions(pc.ambitions ?? [], pc, avatar, to, clubsAfter);
          pc = { ...pc, ambitions: ambRes.ambitions };
          for (const a of ambRes.achieved) {
            newsItems.push({ id: `news_pc_amb_${a.id}_${to}`, day: to, category: 'MILESTONE', title: 'Ambition achieved', body: `${a.text} — done. A goal you set out to reach, reached.`, read: false });
          }
          const decline = updateDecline(pc, avatar, toYear);
          if (decline.started && !(pc.decline?.started)) {
            newsItems.push({ id: `news_pc_decline_${to}`, day: to, category: 'GENERAL', title: 'A new phase', body: `The legs aren't quite what they were — time to lean on experience, guile and a smarter game.`, read: false });
          }
          const newVet = earnedVeteranTraits(avatar, toYear).filter((v) => !(pc.veteranTraits ?? []).includes(v));
          const veteranTraits = [...(pc.veteranTraits ?? []), ...newVet];
          for (const v of newVet) {
            newsItems.push({ id: `news_pc_vet_${v}_${to}`, day: to, category: 'MILESTONE', title: `Veteran trait: ${VETERAN_TRAITS[v]?.label ?? v}`, body: VETERAN_TRAITS[v]?.blurb ?? '', read: false });
          }
          pc = { ...pc, decline, veteranTraits, roleEvolution: roleEvolutionOf({ ...pc, decline }, avatar, toYear) };
          // A veteran leader firms up morale/confidence — mental game compensates.
          if (newVet.includes('LEADER') || newVet.includes('COMPOSED')) pc = { ...pc, confidence: clamp((pc.confidence ?? 60) + 5, 0, 100) as number };

          // Twilight paths surface through the agent (as flagged contract offers).
          const late = lateCareerOffers(pc, avatar, clubsAfter, toYear, to, meta.seed);
          if (late.offers.length) { pc = { ...pc, contractOffers: [...(pc.contractOffers ?? []), ...late.offers] }; newsItems.push(...late.news); }

          // Forced retirement (career-ending injury / no club) — surfaced as a
          // dignified prompt, never an abrupt cutoff (the human still confirms).
          if (!pc.retirement?.announced && pc.retirement?.retiredDay == null) {
            const fr = forcedRetirement(pc, avatar, toYear);
            if (fr.forced) {
              pc = { ...pc, retirement: { announced: true, announcedDay: to, finalSeason: toYear, forced: true, reason: fr.reason } };
              newsItems.push({ id: `news_pc_forced_${to}`, day: to, category: 'GENERAL', title: fr.reason === 'INJURY' ? 'A cruel blow' : 'The end of the road', body: fr.reason === 'INJURY' ? `A serious injury looks to have ended ${avatar.name.first} ${avatar.name.last}'s playing days. A farewell awaits — confirm your retirement when you're ready.` : `No club has come in for ${avatar.name.first} ${avatar.name.last}. It may be time to bow out with your head held high — announce your retirement in your own time.`, read: false });
            }
          }
        }

        // Apply the avatar's form + morale nudges (+ any off-pitch player patch).
        const newForm = clamp(avatar.form + prog.formDelta) as number;
        const newMorale = clamp(avatar.morale + moraleDelta) as number;
        const offPatch = off.playerPatch ?? {};
        if (newForm !== avatar.form || newMorale !== avatar.morale || Object.keys(offPatch).length) {
          playersById = { ...playersById };
          playersById[avatar.id] = { ...playersById[avatar.id], ...offPatch, form: newForm, morale: newMorale };
          changedIds.add(avatar.id);
        }

        // Pre-set objectives for the next fixture so they show before kickoff.
        const nextM = Object.values(matches)
          .filter((m) => !m.played && !m.neutral && cid && (m.homeClubId === cid || m.awayClubId === cid))
          .sort((a, b) => a.day - b.day)[0];
        if (nextM) pc = ensureAdvanceObjectives(pc, playersById[avatar.id], [nextM], meta.seed);

        playerCareer = pc;
      }
    }

    // Tactical familiarity (§ Tactics depth): the manager's squad drills its
    // current shape a little more with every match played in it, closing on full
    // fluency. Only counts while the familiarity record still tracks the shape
    // being played, so an auto-optimized formation swap stays neutral.
    {
      const mgrId = meta.managerClubId;
      const mgrClub = clubsAfter[mgrId];
      const fam = mgrClub?.familiarity;
      if (mgrClub && fam && fam.formation === mgrClub.formation && fam.level < 1) {
        const mgrMatches = playedMerged.filter((m) => m.homeClubId === mgrId || m.awayClubId === mgrId).length;
        if (mgrMatches > 0) {
          const level = Math.min(1, fam.level + mgrMatches * FAMILIARITY_GAIN);
          const updated = { ...mgrClub, familiarity: { formation: mgrClub.formation, level } };
          clubsAfter = { ...clubsAfter, [mgrId]: updated };
          await putClubs(meta.id, [updated]);
          if (level >= 1) {
            newsItems.push({
              id: `news_fam_${mgrClub.formation}_${to}`, day: to, category: 'GENERAL',
              title: 'System clicks into place',
              body: `The squad now look fully fluent in the ${mgrClub.formation} — no more settling-in rust.`,
              read: false,
            });
          }
        }
      }
    }

    // Player mode: keep the stand-in "manager club" tracking the avatar's actual
    // club, so an auto-negotiated move (or any club change this advance) carries
    // Fixtures / Standings / next-match to where he now plays.
    let managerClubId = meta.managerClubId;
    if (careerAtStart) {
      const avNow = playersById[careerAtStart.playerId];
      if (avNow?.contract.clubId && avNow.contract.clubId !== managerClubId) managerClubId = avNow.contract.clubId;
    }

    const newMeta: SaveMeta = {
      ...meta, currentDay: to, news: newsItems, scouting, pendingOffers, board,
      scoutAssignments: scoutRes.assignments, youthProspects, pendingPress,
      scoutReports, playerScoutAssignments: remainingAssignments,
      pendingGala, history, managerStyle, pendingArrivals, storylines, ballonDor,
      clubRelations, playerCareer, managerClubId, rumours, deadlineFeed,
    };
    set({ matches, players: playersById, clubs: clubsAfter, meta: newMeta });

    await putMatches(meta.id, playedMerged);
    await putPlayers(meta.id, [...changedIds].map((id) => playersById[id]));
    await persistMeta(newMeta);
  } finally {
    set({ simming: false });
  }
}

/**
 * Retire the player-career avatar now (Tier 5). Computes the final legacy,
 * assembles the send-off (club-legend recording, shirt retirements, Hall of Fame
 * induction), stages a testimonial for one-club legends, and steps the avatar
 * out of the active squad — keeping his record in the world for the retrospective
 * and any manager-mode continuation. Pure world edits; then persists.
 */
async function retireAvatarNow(
  get: () => GameState,
  set: (partial: Partial<GameState>) => void,
  reason: 'AGE' | 'INJURY' | 'NO_CLUB' | 'CHOICE',
): Promise<void> {
  const { meta, players, clubs } = get();
  const pc = playerCareerOf(meta);
  if (!meta || !pc) return;
  const avatar = players[pc.playerId];
  if (!avatar) return;
  const year = get().currentSeason()?.year ?? meta.startYear;
  const day = meta.currentDay;

  // Final legacy + send-off.
  const legacy = computeLegacy(pc, avatar, clubs, players, year);
  const sendOff = buildSendOff(pc, avatar, clubs, year, day, legacy);
  let career = sendOff.career;
  const news: NewsItem[] = [...sendOff.news];

  // Testimonial for a club legend — a celebratory exhibition, resolved
  // deterministically (a fun, high-scoring send-off with the avatar on the mark).
  let matchesPatch: Record<string, Match> | undefined;
  const testi = buildTestimonial(career, avatar, clubs, get().currentSeason()?.id ?? 'season', day);
  if (testi && legacy.legendAtClubs.length > 0) {
    const r = new Rng((meta.seed ^ hashSeed(`testi_${avatar.id}`)) >>> 0);
    const hg = r.int(2, 4), ag = r.int(1, 3);
    const played: Match = {
      ...testi.match, played: true, homeGoals: hg, awayGoals: ag, homeXg: hg, awayXg: ag,
      playerStats: [{ playerId: avatar.id, minutes: 60, goals: 1, assists: 1, shots: 3, rating: 8.5, yellow: false, red: false }],
      events: [{ minute: 0, type: 'KICKOFF', side: 'home', description: 'Kick-off' }],
    };
    matchesPatch = { [played.id]: played };
    await putMatches(meta.id, [played]);
    career = { ...career, retirement: { ...(career.retirement ?? { announced: true, forced: false }), testimonialMatchId: played.id } };
    news.push({ id: `news_pc_testi_played_${day}`, day, category: 'MILESTONE', title: 'A fitting send-off', body: `${clubs[testi.match.homeClubId]?.shortName ?? 'The club'} win the testimonial ${hg}–${ag} — and of course, the guest of honour got on the scoresheet.`, read: false });
  }

  // Finalise the retirement record.
  career = {
    ...career,
    retirement: {
      ...(career.retirement ?? { announced: true, forced: reason !== 'CHOICE' }),
      announced: true, retiredDay: day, forced: reason !== 'CHOICE', reason,
      finalSeason: career.retirement?.finalSeason ?? year,
    },
    milestones: [...career.milestones, { day, text: `Retired from professional football (${year}).` }],
  };
  news.push({ id: `news_pc_retire_${day}`, day, category: 'MILESTONE', title: `${avatar.name.first} ${avatar.name.last} retires`, body: `After a career to remember, the boots are hung up. Legacy score: ${legacy.score}. ${legacy.identities.length ? `Remembered as: ${legacy.identities.map((i) => IDENTITY_LABEL[i]).join(', ')}.` : ''}`, read: false });

  // Step the avatar out of his club squad (his record stays in the world).
  const nextPlayers = { ...players };
  const clubsPatch = { ...clubs };
  const cid = avatar.contract.clubId;
  nextPlayers[avatar.id] = { ...avatar, contract: { ...avatar.contract, clubId: '' }, loan: null, injury: null };
  if (cid && clubsPatch[cid]) clubsPatch[cid] = { ...clubsPatch[cid], playerIds: clubsPatch[cid].playerIds.filter((id) => id !== avatar.id) };

  // World records: Hall of Fame + retired shirts persist in the save.
  const hallOfFame = sendOff.hallOfFameAdd ? [...(meta.hallOfFame ?? []), sendOff.hallOfFameAdd] : meta.hallOfFame;
  const retiredShirts = [
    ...(meta.retiredShirts ?? []),
    ...(career.retirement?.shirtRetiredAt ?? []).map((s) => ({ clubId: s.clubId, number: s.number, playerId: avatar.id, playerName: `${avatar.name.first} ${avatar.name.last}`, year })),
  ];

  const newMeta: SaveMeta = {
    ...meta, playerCareer: career, news: [...meta.news, ...news], hallOfFame, retiredShirts,
  };
  set({
    meta: newMeta, players: nextPlayers, clubs: clubsPatch,
    ...(matchesPatch ? { matches: { ...get().matches, ...matchesPatch } } : {}),
  });
  await putPlayers(meta.id, [nextPlayers[avatar.id]]);
  if (cid && clubsPatch[cid]) await putClubs(meta.id, [clubsPatch[cid]]);
  await persistMeta(newMeta);
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
