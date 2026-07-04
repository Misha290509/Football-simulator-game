// ---------------------------------------------------------------------------
// Academy orchestration (§ Academy). Composes the pure academy engine with the
// player/intake engines to install academies into a world and seed their youth
// rosters. Grows across phases (intake cycle, scouting, promotion). Phase 1:
// build tailored academies + an initial parallel-roster intake for new games.
// ---------------------------------------------------------------------------

import type { Club } from '../types/club';
import type { Player } from '../types/player';
import type { NewsItem } from '../types/league';
import type { Academy, AcademyPlayer } from '../types/academy';
import { Rng, clamp } from '../engine/rng';
import {
  buildAcademy, ageGroupForAge, ageOfPlayer, computeReadiness,
  applyPhilosophy, pickYouthPosition, youthCoachQuality, youthGrowthFactor,
  ageGroupPerformanceFor, academyRatingFor, academyPotential, PRODIGY_POTENTIAL,
} from '../engine/academy';
import { developPlayer } from '../engine/development';
import { generatePlayer } from '../engine/generator';
import { marketWage } from '../engine/finances';

// Every academy carries a healthy squad so the youth pipeline never runs dry:
// at least 18 prospects, capped at 25 to keep the roster manageable.
export const ACADEMY_MIN_SQUAD = 18;
export const ACADEMY_MAX_SQUAD = 25;

export interface AcademyInstallResult {
  academies: Record<string, Academy>;
  academyPlayers: Record<string, AcademyPlayer>;
  newPlayers: Player[]; // freshly generated youth (parallel roster)
}

/** Turn a generated youth into a parallel-roster academy player + overlay. */
export function enrollProspect(
  player: Player,
  club: Club,
  year: number,
  firstTeamAvg: number,
  rng: Rng,
  opts: { prodigy?: boolean } = {},
): AcademyPlayer {
  // Parallel roster: not owned by the first team (kept out of the squad cap),
  // owned by the academy via academyClubId.
  player.contract.clubId = null;
  player.academyClubId = club.id;
  player.squadRole = 'PROSPECT';

  const age = ageOfPlayer(player, year);
  const prof = clamp(player.hidden?.professionalism ?? rng.int(35, 80));
  const amb = clamp(player.hidden?.ambition ?? rng.int(35, 85));
  const det = clamp(player.hidden?.consistency ?? rng.int(35, 80));
  return {
    playerId: player.id,
    clubId: club.id,
    ageGroup: ageGroupForAge(age),
    playedUp: false,
    heldBack: false,
    ageGroupPerformance: 50,
    readiness: computeReadiness(player.overall, player.potential, 50, firstTeamAvg),
    contractStatus: age >= 17 ? 'scholar' : 'schoolboy',
    dualRegistered: false,
    personality: { determination: det, professionalism: prof, ambition: amb },
    flameOutRisk: clamp(0.5 - (prof + det + amb) / 600, 0, 0.5) as number,
    isProdigy: opts.prodigy ?? false,
  };
}

/**
 * Install academies for every club and seed an initial youth roster. Used by
 * new games. Deterministic given the seed.
 */
export function installNewGameAcademies(
  clubs: Record<string, Club>,
  players: Record<string, Player>,
  year: number,
  ratingCap: number,
  seed: number,
): AcademyInstallResult {
  const rng = new Rng((seed ^ 0xaca0d111) >>> 0);
  const academies: Record<string, Academy> = {};
  const academyPlayers: Record<string, AcademyPlayer> = {};
  const newPlayers: Player[] = [];

  // First-team averages for readiness, computed from the senior squads.
  const squadByClub: Record<string, Player[]> = {};
  for (const p of Object.values(players)) {
    if (p.contract.clubId) (squadByClub[p.contract.clubId] ??= []).push(p);
  }

  for (const club of Object.values(clubs)) {
    const { academy, coaches } = buildAcademy(club, rng);
    academies[club.id] = academy;
    club.staff = [...(club.staff ?? []), ...coaches];

    const squad = squadByClub[club.id] ?? [];
    const firstTeamAvg = squad.length
      ? squad.reduce((s, p) => s + p.overall, 0) / squad.length
      : Math.max(50, club.reputation * 0.85);

    // Seed a starting roster sized by academy rating (parallel roster). A spread
    // of intake years gives ages across U16/U18/U21.
    const before = newPlayers.length;
    const batches = academy.rating >= 4 ? 3 : academy.rating >= 2 ? 2 : 1;
    for (let b = 0; b < batches; b++) {
      const intake = generateAcademyIntake(club, academy, year - b * 2, rng, ratingCap);
      for (const youth of intake) {
        academyPlayers[youth.id] = enrollProspect(youth, club, year, firstTeamAvg, rng, { prodigy: youth.__prodigy });
        delete youth.__prodigy;
        newPlayers.push(youth);
      }
    }
    // Top the academy up to a full squad (18–25), spread across the age bands.
    for (let salt = 0; newPlayers.length - before < ACADEMY_MIN_SQUAD && salt < 40; salt++) {
      const room = ACADEMY_MAX_SQUAD - (newPlayers.length - before);
      const take = Math.min(room, ACADEMY_MIN_SQUAD - (newPlayers.length - before), 4);
      if (take <= 0) break;
      const intake = generateAcademyIntake(club, academy, year - (salt % 3) * 2, rng, ratingCap, take, `t${salt}_`);
      for (const youth of intake) {
        academyPlayers[youth.id] = enrollProspect(youth, club, year, firstTeamAvg, rng, { prodigy: youth.__prodigy });
        delete youth.__prodigy;
        newPlayers.push(youth);
      }
    }
  }

  return { academies, academyPlayers, newPlayers };
}

// A transient flag stashed on freshly generated youth so the caller can mark
// prodigies when enrolling (stripped before persistence).
type YouthGen = Player & { __prodigy?: boolean };

/**
 * Generate a philosophy-biased, tier-scaled youth intake for one academy
 * (Ideas 1–3, 16). Higher-rated academies produce more and better prospects and
 * a greater chance of a standout. Deterministic. Players come back as raw
 * Player objects (not yet enrolled).
 */
export function generateAcademyIntake(
  club: Club,
  academy: Academy,
  year: number,
  rng: Rng,
  ratingCap: number,
  /** Force an exact intake size (used to top a roster up to a healthy minimum). */
  forceCount?: number,
  /** Salt to keep ids unique when generating extra top-up batches. */
  idSalt = '',
): YouthGen[] {
  const stars = academy.rating;
  // Quantity scales with the star rating (unless a top-up size is forced).
  let count = forceCount ?? (stars >= 5 ? rng.int(3, 5) : stars >= 4 ? rng.int(2, 4)
    : stars >= 3 ? rng.int(1, 3) : stars >= 2 ? rng.int(1, 2) : rng.chance(0.6) ? 1 : 0);
  if (count === 0) return [];

  const out: YouthGen[] = [];
  for (let i = 0; i < count; i++) {
    // Realistic ceiling: usually mid-70s to low-80s; 85+ rare, 90+ generational.
    const potential = academyPotential(stars, academy.reputation, rng);
    // Current ability is far below — they're projects. Generate within the world
    // cap, then set the (uncapped) potential for display.
    const target = clamp(Math.min(potential, ratingCap) - rng.int(16, 30), 28, Math.min(potential, ratingCap) - 5);
    const youth = generatePlayer({
      rng,
      currentYear: year,
      target,
      position: pickYouthPosition(rng, academy.philosophyId),
      ageRange: [15, 16],
      nationality: club.countryId,
      ratingCap,
      squadRole: 'PROSPECT',
    }) as YouthGen;
    applyPhilosophy(youth, academy.philosophyId, ratingCap);
    // Deterministic id (the generator's default id uses Date.now): same seed →
    // same world, which the acceptance criteria require.
    youth.id = `pa_${club.id}_${year}_${idSalt}${i}`;
    youth.potential = Math.max(youth.overall + 3, potential);
    youth.developmentLog = [{ year, ovr: youth.overall, pot: youth.potential }];
    youth.contract.wage = Math.round((youth.overall * 60) / 5) * 5;
    youth.contract.expiresYear = year + rng.int(2, 4);
    youth.__prodigy = youth.potential >= PRODIGY_POTENTIAL;
    out.push(youth);
  }
  return out;
}

/**
 * Append a graduate to an academy's legacy (graduates list + "Class of" cohort),
 * returning a new Academy. Used for manual promotions in the store.
 */
export function recordGraduateInAcademy(academy: Academy | undefined, p: Player, gradYear: number): Academy {
  if (!academy) {
    return { clubId: p.academyGraduateOf ?? '', rating: 1, reputation: 0, philosophyId: 'BALANCED', facilities: { training: 1, coaching: 1, medical: 1, recruitment: 1 }, youthCoachIds: [], graduates: [], cohorts: [], trophies: [] };
  }
  const peakOvr = Math.max(p.overall, ...p.developmentLog.map((d) => d.ovr));
  const label = `Class of '${String(gradYear % 100).padStart(2, '0')}`;
  const cohorts = academy.cohorts.some((c) => c.year === gradYear)
    ? academy.cohorts.map((c) => (c.year === gradYear ? { ...c, playerIds: [...c.playerIds, p.id] } : c))
    : [...academy.cohorts, { year: gradYear, label, playerIds: [p.id] }];
  return {
    ...academy,
    graduates: [...academy.graduates, { playerId: p.id, name: `${p.name.first} ${p.name.last}`, graduatedYear: gradYear, peakOvr, awards: p.awards.length }],
    cohorts,
  };
}

export interface AcademyRolloverResult {
  /** Youth still in the academy (developed + aged), parallel roster. */
  carriedPlayers: Record<string, Player>;
  /** Updated per-player overlay for carried youth + new intake. */
  overlay: Record<string, AcademyPlayer>;
  /** Prospects graduated to the first team (contract.clubId now set). */
  graduates: Player[];
  /** Prospects released to free agency (not good enough at 22). */
  released: Player[];
  /** Prospects poached by rivals or otherwise lost (remove from the world). */
  lostPlayerIds: string[];
  academies: Record<string, Academy>;
  news: NewsItem[];
}

let _acNewsSeq = 0;
const acNews = (day: number, title: string, body: string): NewsItem => ({
  id: `news_ac_${day}_${_acNewsSeq++}`, day, category: 'MILESTONE', title, body, read: false,
});

type Personality = AcademyPlayer['personality'];

/** A mentor's personality, whether he's a senior pro or an older academy player. */
function mentorPersonality(
  mentorId: string,
  seniors: Record<string, Player>,
  overlay: Record<string, AcademyPlayer>,
): Personality | null {
  const o = overlay[mentorId];
  if (o) return o.personality;
  const p = seniors[mentorId];
  if (p?.hidden) return { determination: p.hidden.consistency ?? 60, professionalism: p.hidden.professionalism ?? 60, ambition: p.hidden.ambition ?? 60 };
  return null;
}

/** Nudge a youngster's personality toward his mentor's (Idea 13). */
function driftToward(a: Personality, b: Personality, k: number): Personality {
  return {
    determination: clamp(Math.round(a.determination + (b.determination - a.determination) * k)) as number,
    professionalism: clamp(Math.round(a.professionalism + (b.professionalism - a.professionalism) * k)) as number,
    ambition: clamp(Math.round(a.ambition + (b.ambition - a.ambition) * k)) as number,
  };
}

/**
 * Advance every academy one season (Idea 4 + 10): develop & age prospects,
 * graduate or release the over-age, recompute age groups / performance /
 * readiness, then take a fresh philosophy-biased intake of U16s. Pure &
 * deterministic. Senior development + the AI window are handled by the caller.
 */
export function processAcademyRollover(
  academiesIn: Record<string, Academy>,
  overlayIn: Record<string, AcademyPlayer>,
  academyPlayerObjs: Player[],
  clubs: Record<string, Club>,
  firstTeamAvgByClub: Record<string, number>,
  nextYear: number,
  ratingCap: number,
  rng: Rng,
  managerClubId: string,
  day: number,
  /** Developed senior players this rollover, for dual-registration upkeep. */
  seniorPlayers: Record<string, Player> = {},
  /** clubId → age-group performance boost from youth-competition success. */
  perfBoostByClub: Record<string, number> = {},
): AcademyRolloverResult {
  // Clone so the function never mutates its inputs (keeps it deterministic when
  // called repeatedly on the same source academies).
  const academies: Record<string, Academy> = structuredClone(academiesIn);
  const carriedPlayers: Record<string, Player> = {};
  const overlay: Record<string, AcademyPlayer> = {};
  const graduates: Player[] = [];
  const released: Player[] = [];
  const lostPlayerIds: string[] = [];
  const news: NewsItem[] = [];

  /** Record a graduate in the academy's legacy (mutates the given academy). */
  const recordGraduate = (academy: Academy, p: Player, gradYear: number) => {
    const peakOvr = Math.max(p.overall, ...p.developmentLog.map((d) => d.ovr));
    academy.graduates = [...academy.graduates, { playerId: p.id, name: `${p.name.first} ${p.name.last}`, graduatedYear: gradYear, peakOvr, awards: p.awards.length }];
    const label = `Class of '${String(gradYear % 100).padStart(2, '0')}`;
    const cohort = academy.cohorts.find((c) => c.year === gradYear);
    if (cohort) cohort.playerIds = [...cohort.playerIds, p.id];
    else academy.cohorts = [...academy.cohorts, { year: gradYear, label, playerIds: [p.id] }];
  };

  // Dual-registered youngsters are developed as seniors; keep their academy
  // overlay alive (refreshed) until they outgrow the academy at 20+, then drop
  // it so they become full first-teamers (Idea: dual registration).
  for (const ap of Object.values(overlayIn)) {
    if (!ap.dualRegistered) continue;
    const p = seniorPlayers[ap.playerId];
    if (!p || !p.contract.clubId) continue;
    const age = nextYear - p.born.year;
    if (age > 19) { p.academyClubId = undefined; continue; }
    const fta = firstTeamAvgByClub[ap.clubId] ?? Math.max(50, (clubs[ap.clubId]?.reputation ?? 60) * 0.85);
    overlay[ap.playerId] = {
      ...ap,
      ageGroup: ageGroupForAge(age),
      readiness: computeReadiness(p.overall, p.potential, ap.ageGroupPerformance, fta),
    };
  }

  // Pass 1: develop + age each prospect; classify graduate / release / stay.
  const stayers: { player: Player; ap: AcademyPlayer; clubId: string }[] = [];
  const gradByClub: Record<string, number> = {};
  for (const obj of academyPlayerObjs) {
    let ap = overlayIn[obj.id];
    if (!ap) continue; // overlay missing → drop quietly (shouldn't happen)
    const club = clubs[ap.clubId];
    const academy = academies[ap.clubId];
    if (!club || !academy) { carriedPlayers[obj.id] = obj; overlay[obj.id] = ap; continue; }

    const coachQ = youthCoachQuality(academy, club.staff);
    // Played-up prospects grow faster but risk a confidence dent if their
    // temperament is weak; held-back prospects grow a touch slower but steadier.
    let gf = youthGrowthFactor(academy, coachQ, ap.playedUp);
    if (ap.heldBack) gf *= 0.95;
    if (ap.playedUp && ap.personality.determination < 45 && rng.chance(0.35)) gf *= 0.85; // flunked the step up
    // Mentoring: a good mentor accelerates growth and rubs off on attitude.
    if (ap.mentorId) {
      const mp = mentorPersonality(ap.mentorId, seniorPlayers, overlayIn);
      if (mp) {
        gf *= 1.06;
        const personality = driftToward(ap.personality, mp, 0.15);
        ap = { ...ap, personality, flameOutRisk: clamp(0.5 - (personality.determination + personality.professionalism + personality.ambition) / 600, 0, 0.5) as number };
      }
    }
    const developed = developPlayer(obj, nextYear, rng, { growthFactor: gf, ratingCap });
    developed.academyClubId = club.id;
    developed.contract.clubId = null;

    // Flame-out (Idea 16): high potential is never guaranteed — weak-temperament
    // prospects can stall and see their ceiling revised down.
    if (developed.potential > developed.overall + 4 && rng.chance(ap.flameOutRisk * 0.14)) {
      developed.potential = Math.max(developed.overall, developed.potential - rng.int(4, 10));
      if (ap.isProdigy && club.id === managerClubId) {
        news.push(acNews(day, `${developed.name.last} hits a wall`,
          `Your prodigy ${developed.name.first} ${developed.name.last} has stalled — his projected ceiling looks lower than hoped.`));
      }
    }

    const age = nextYear - developed.born.year;
    const firstTeamAvg = firstTeamAvgByClub[club.id] ?? Math.max(50, club.reputation * 0.85);

    if (age > 21) {
      // Graduate the good ones to the first team; release the rest.
      const goodEnough = developed.overall >= firstTeamAvg * 0.84 || developed.potential >= firstTeamAvg + 2;
      if (goodEnough) {
        developed.contract.clubId = club.id;
        developed.academyClubId = undefined; // fully graduated; legacy tracked in academy.graduates
        developed.academyGraduateOf = club.id;
        developed.squadRole = 'PROSPECT';
        developed.contract.wage = Math.max(developed.contract.wage, marketWage(developed.overall));
        developed.contract.startYear = nextYear;
        developed.contract.expiresYear = nextYear + rng.int(2, 4);
        recordGraduate(academy, developed, nextYear);
        graduates.push(developed);
        gradByClub[club.id] = (gradByClub[club.id] ?? 0) + 1;
        if (club.id === managerClubId) {
          news.push(acNews(day, `${developed.name.first} ${developed.name.last} graduates to the first team`,
            `The ${developed.position} (OVR ${developed.overall}, POT ${developed.potential}) steps up from the academy.`));
        }
      } else {
        developed.academyClubId = undefined; // leaves the academy
        released.push(developed);
        if (club.id === managerClubId) {
          news.push(acNews(day, `${developed.name.first} ${developed.name.last} released`,
            `The academy ${developed.position} is released at the end of his youth eligibility.`));
        }
      }
      continue;
    }
    stayers.push({ player: developed, ap, clubId: club.id });
  }

  // Fresh U16 intake per club (after aging, so it lands in the youngest group).
  for (const club of Object.values(clubs)) {
    const academy = academies[club.id];
    if (!academy) continue;
    const intake = generateAcademyIntake(club, academy, nextYear, rng, ratingCap);
    let hypeProdigy: Player | null = null;
    for (const youth of intake as (Player & { __prodigy?: boolean })[]) {
      youth.contract.clubId = null;
      youth.academyClubId = club.id;
      const prodigy = youth.__prodigy ?? false;
      delete (youth as { __prodigy?: boolean }).__prodigy;
      if (prodigy) hypeProdigy = youth;
      const prof = clamp(youth.hidden?.professionalism ?? 50);
      const amb = clamp(youth.hidden?.ambition ?? 50);
      const det = clamp(youth.hidden?.consistency ?? 50);
      stayers.push({
        player: youth,
        clubId: club.id,
        ap: {
          playerId: youth.id, clubId: club.id, ageGroup: 'U16', playedUp: false, heldBack: false,
          ageGroupPerformance: 50, readiness: 0, contractStatus: 'schoolboy', dualRegistered: false,
          personality: { determination: det, professionalism: prof, ambition: amb },
          flameOutRisk: clamp(0.5 - (prof + det + amb) / 600, 0, 0.5) as number, isProdigy: prodigy,
        },
      });
    }
    if (club.id === managerClubId && intake.length > 0) {
      news.push(acNews(day, `${intake.length} youngster${intake.length > 1 ? 's' : ''} join the academy`,
        `New intake: ${intake.map((p) => `${p.name.last} (${p.position})`).join(', ')}.`));
      // Media hype for a once-in-a-generation talent (Idea 16).
      if (hypeProdigy) {
        news.push(acNews(day, `WONDERKID: ${hypeProdigy.name.first} ${hypeProdigy.name.last} joins the academy`,
          `The press are calling the ${hypeProdigy.position} a generational talent. Handle with care — hype is not a guarantee.`));
      }
    }
  }

  // Keep every academy stocked: after graduations/releases/losses, top clubs
  // that have fallen below the healthy minimum back up (spread across the age
  // bands so it isn't all U16s). Never exceeds the cap.
  const countByClub: Record<string, number> = {};
  for (const s of stayers) countByClub[s.clubId] = (countByClub[s.clubId] ?? 0) + 1;
  for (const club of Object.values(clubs)) {
    const academy = academies[club.id];
    if (!academy) continue;
    const firstTeamAvg = firstTeamAvgByClub[club.id] ?? Math.max(50, club.reputation * 0.85);
    for (let salt = 0; (countByClub[club.id] ?? 0) < ACADEMY_MIN_SQUAD && salt < 40; salt++) {
      const have = countByClub[club.id] ?? 0;
      const take = Math.min(ACADEMY_MAX_SQUAD - have, ACADEMY_MIN_SQUAD - have, 4);
      if (take <= 0) break;
      const intake = generateAcademyIntake(club, academy, nextYear, rng, ratingCap, take, `r${nextYear}_${salt}_`);
      for (const youth of intake as (Player & { __prodigy?: boolean })[]) {
        youth.contract.clubId = null;
        youth.academyClubId = club.id;
        delete (youth as { __prodigy?: boolean }).__prodigy;
        const age = nextYear - youth.born.year;
        const prof = clamp(youth.hidden?.professionalism ?? 50);
        const amb = clamp(youth.hidden?.ambition ?? 50);
        const det = clamp(youth.hidden?.consistency ?? 50);
        stayers.push({
          player: youth,
          clubId: club.id,
          ap: {
            playerId: youth.id, clubId: club.id, ageGroup: ageGroupForAge(age), playedUp: false, heldBack: false,
            ageGroupPerformance: 50, readiness: computeReadiness(youth.overall, youth.potential, 50, firstTeamAvg),
            contractStatus: age >= 17 ? 'scholar' : 'schoolboy', dualRegistered: false,
            personality: { determination: det, professionalism: prof, ambition: amb },
            flameOutRisk: clamp(0.5 - (prof + det + amb) / 600, 0, 0.5) as number, isProdigy: false,
          },
        });
        countByClub[club.id] = have + 1;
      }
    }
  }

  // Pass 2: recompute age group, performance (vs cohort) and readiness.
  const cohorts = new Map<string, number[]>();
  for (const s of stayers) {
    const age = nextYear - s.player.born.year;
    const group = ageGroupForAge(age);
    const key = `${s.clubId}_${group}`;
    (cohorts.get(key) ?? cohorts.set(key, []).get(key)!).push(s.player.overall);
  }
  for (const s of stayers) {
    const age = nextYear - s.player.born.year;
    const group = ageGroupForAge(age);
    const club = clubs[s.clubId];
    const academy = academies[s.clubId];
    const coachQ = academy ? youthCoachQuality(academy, club?.staff) : 50;
    const perf = clamp(
      ageGroupPerformanceFor(s.player, cohorts.get(`${s.clubId}_${group}`) ?? []) + (perfBoostByClub[s.clubId] ?? 0),
      0, 100,
    ) as number;
    const firstTeamAvg = firstTeamAvgByClub[s.clubId] ?? Math.max(50, (club?.reputation ?? 60) * 0.85);
    const updatedAp: AcademyPlayer = {
      ...s.ap,
      ageGroup: group,
      ageGroupPerformance: perf,
      readiness: computeReadiness(s.player.overall, s.player.potential, perf, firstTeamAvg, coachQ),
    };

    // Rival poaching (Idea 9, moderate + protectable): unprotected, talented
    // teenagers can be lured away by bigger academies. A professional contract
    // (offered at 17) protects them. Resolved for the manager's club (visible).
    const protectedByDeal = updatedAp.contractStatus === 'professional' || updatedAp.dualRegistered;
    const poachable = s.clubId === managerClubId && !protectedByDeal && s.player.potential >= 72 && age >= 15;
    if (poachable && rng.chance(0.1 + (s.player.potential - 72) * 0.01)) {
      lostPlayerIds.push(s.player.id);
      news.push(acNews(day, `Lost ${s.player.name.last} to a rival academy`,
        `A bigger club has lured ${s.player.name.first} ${s.player.name.last} (POT ${s.player.potential}) away — you never offered him professional terms.`));
      continue;
    }

    carriedPlayers[s.player.id] = s.player;
    overlay[s.player.id] = updatedAp;
  }

  // Reputation flywheel (Idea 5): academies that produce first-team graduates
  // rise; quiet academies slowly decay. Rating re-derives from the new rep.
  for (const club of Object.values(clubs)) {
    const academy = academies[club.id];
    if (!academy) continue;
    const repDelta = (gradByClub[club.id] ?? 0) * 2 - 1;
    academy.reputation = clamp(academy.reputation + repDelta, 0, 100) as number;
    academy.rating = academyRatingFor(club, academy.reputation);
  }

  return { carriedPlayers, overlay, graduates, released, lostPlayerIds, academies, news };
}
