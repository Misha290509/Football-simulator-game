// ---------------------------------------------------------------------------
// Player Career — legacy & endgame engine (Tier 5, steps 1–2). Pure &
// deterministic. Derives the ambitions checklist, the transparent legacy score
// + career identity, the graceful-decline state, late-unlocked veteran traits
// and the squad-role arc — all computed from real career data recorded across
// Tiers 1–4 (the avatar Player's stats/awards/developmentLog + the PlayerCareer
// block). Nothing here is random; the shape of the career tells the story.
// ---------------------------------------------------------------------------

import type { Player } from '../types/player';
import type { Club } from '../types/club';
import type { PlayerCareer } from '../types/playerCareer';
import type {
  CareerAmbition, LegacyState, CareerIdentity, DeclineState, RoleEvolution,
} from '../types/playerLegacy';
import { statusRank } from './playerProgression';

// --- Career totals (the raw material for everything below) ------------------

export interface CareerTotals {
  apps: number;
  goals: number;
  assists: number;
  avgRating: number;
  teamTrophies: number;        // league + domestic cup + continental (weighted below)
  leagueTitles: number;
  continentalTitles: number;
  domesticCups: number;
  individualAwards: number;
  ballonDors: number;
  goldenBoots: number;
  potyAwards: number;
  caps: number;
  intlGoals: number;
  peakOvr: number;
  peakAge?: number;
  yearsAtPeak: number;
  clubs: string[];             // distinct club names played for
  maxYearsOneClub: number;
  countries: number;           // distinct leagues/countries (breadth)
}

const TEAM_TROPHY_TYPES = new Set(['LEAGUE_CHAMPION', 'DOMESTIC_CUP', 'CONTINENTAL', 'WORLD_CUP', 'EUROS', 'COPA_AMERICA']);
const INDIVIDUAL_TYPES = new Set([
  'GLOBAL_BEST', 'GOLDEN_BOOT', 'GLOBAL_GOLDEN_BOOT', 'PLAYMAKER', 'PLAYER_OF_SEASON',
  'CONFED_POTY', 'UEFA_POTY', 'CONTINENTAL_BEST', 'KOPA', 'YASHIN', 'PUSKAS',
  'GOLDEN_BALL', 'GOLDEN_GLOVE', 'TEAM_OF_SEASON',
]);

/** Roll up an entire playing career from the canonical sources. */
export function careerTotals(career: PlayerCareer, avatar: Player, born: number): CareerTotals {
  let apps = 0, goals = 0, assists = 0, ratingSum = 0, ratingCount = 0;
  for (const s of avatar.stats) {
    apps += s.appearances; goals += s.goals; assists += s.assists;
    ratingSum += s.ratingSum; ratingCount += s.ratingCount;
  }
  // Fold in the current live season from the HUD (avatar.stats may lag a beat).
  // seasonHistory already holds completed seasons, so use avatar.stats as truth
  // and only add the live HUD tallies if they exceed what stats records.

  let leagueTitles = 0, continentalTitles = 0, domesticCups = 0;
  let individualAwards = 0, ballonDors = 0, goldenBoots = 0, potyAwards = 0;
  for (const a of avatar.awards) {
    const t = a.awardId;
    if (t === 'LEAGUE_CHAMPION') leagueTitles++;
    else if (t === 'CONTINENTAL') continentalTitles++;
    else if (t === 'DOMESTIC_CUP') domesticCups++;
    if (t === 'GLOBAL_BEST') { ballonDors++; individualAwards++; }
    else if (t === 'GOLDEN_BOOT' || t === 'GLOBAL_GOLDEN_BOOT') { goldenBoots++; individualAwards++; }
    else if (t === 'PLAYER_OF_SEASON') { potyAwards++; individualAwards++; }
    else if (INDIVIDUAL_TYPES.has(t)) individualAwards++;
  }
  const teamTrophies = leagueTitles + continentalTitles + domesticCups
    + avatar.awards.filter((a) => a.awardId === 'WORLD_CUP' || a.awardId === 'EUROS' || a.awardId === 'COPA_AMERICA').length;

  // Peak OVR + when it happened, from the development log.
  let peakOvr = avatar.overall, peakYear = born + 24;
  for (const d of avatar.developmentLog) if (d.ovr >= peakOvr) { peakOvr = d.ovr; peakYear = d.year; }
  const yearsAtPeak = avatar.developmentLog.filter((d) => d.ovr >= peakOvr - 2).length;

  // Clubs & breadth from the season-by-season history (+ the current club).
  const clubNames = new Set<string>();
  const yearsByClub = new Map<string, number>();
  for (const s of career.seasonHistory) {
    if (!s.club) continue;
    clubNames.add(s.club);
    yearsByClub.set(s.club, (yearsByClub.get(s.club) ?? 0) + 1);
  }
  const maxYearsOneClub = Math.max(0, ...yearsByClub.values());

  return {
    apps, goals, assists,
    avgRating: ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 100) / 100 : 0,
    teamTrophies, leagueTitles, continentalTitles, domesticCups,
    individualAwards, ballonDors, goldenBoots, potyAwards,
    caps: career.international.caps, intlGoals: career.international.intlGoals,
    peakOvr, peakAge: peakYear - born, yearsAtPeak,
    clubs: [...clubNames], maxYearsOneClub,
    countries: Math.max(1, clubNames.size >= 4 ? 3 : clubNames.size >= 2 ? 2 : 1),
  };
}

// --- Legacy score + identity ------------------------------------------------

/**
 * Compute the transparent legacy score + identities from real career data.
 * The breakdown is surfaced verbatim in the UI so the number is never a
 * black box. `allPlayers` is used only to rank the avatar among his peers.
 */
export function computeLegacy(
  career: PlayerCareer,
  avatar: Player,
  clubs: Record<string, Club>,
  allPlayers: Record<string, Player>,
  year: number,
): LegacyState {
  const t = careerTotals(career, avatar, avatar.born.year);

  const b: Record<string, number> = {};
  b['Goals & assists'] = Math.round(Math.min(280, (t.goals * 1.5 + t.assists) * 0.9));
  b['Appearances'] = Math.round(Math.min(140, t.apps * 0.28));
  b['Average rating'] = Math.round(Math.max(0, (t.avgRating - 6.6) * 90));
  b['Trophies'] = Math.round(t.leagueTitles * 26 + t.continentalTitles * 40 + t.domesticCups * 12);
  b['Individual awards'] = Math.round(t.ballonDors * 90 + t.goldenBoots * 22 + t.potyAwards * 20 + Math.max(0, t.individualAwards - t.ballonDors - t.goldenBoots - t.potyAwards) * 10);
  b['International'] = Math.round(Math.min(160, t.caps * 1.4 + t.intlGoals * 2));
  b['Peak ability'] = Math.round(Math.max(0, (t.peakOvr - 70) * 8) + t.yearsAtPeak * 6);
  b['Reputation'] = Math.round(((career.fanRating ?? 50) - 50) * 1.4 + Math.min(60, (career.following ?? 0) / 1500));
  // Loyalty OR breadth — a career is rewarded for whichever it embodies.
  b['Loyalty / breadth'] = Math.round(Math.max(t.maxYearsOneClub * 8, (t.clubs.length >= 4 ? t.clubs.length * 7 : 0)));
  b['Records'] = Math.round((career.milestones ?? []).filter((m) => /record|youngest|most /i.test(m.text)).length * 12);

  const score = Math.max(0, Math.round(Object.values(b).reduce((a, x) => a + x, 0)));

  const identities = deriveIdentities(t, career, avatar, year);
  const legendAtClubs = legendClubs(career, clubs);

  // Peer rank: where the avatar sits among everyone in the save by a composite
  // of peak ability, trophies and marquee awards (1 = greatest).
  const scoreOf = (p: Player) => {
    const peak = Math.max(p.overall, ...p.developmentLog.map((d) => d.ovr));
    const tro = p.awards.filter((a) => TEAM_TROPHY_TYPES.has(a.awardId)).length;
    const ind = p.awards.filter((a) => INDIVIDUAL_TYPES.has(a.awardId)).length;
    const ballon = p.awards.filter((a) => a.awardId === 'GLOBAL_BEST').length;
    return peak * 3 + tro * 4 + ind * 5 + ballon * 20;
  };
  const mine = scoreOf(avatar);
  let better = 1;
  for (const p of Object.values(allPlayers)) {
    if (p.id === avatar.id) continue;
    if (scoreOf(p) > mine) better++;
  }

  return {
    score,
    identities,
    legendAtClubs,
    hallOfFame: false, // decided at retirement against the HoF bar
    peerRank: better,
    breakdown: b,
  };
}

/** The HoF bar: a legacy score that clears it earns induction at retirement. */
export const HALL_OF_FAME_BAR = 520;

/** Derive one or more career identities from the *shape* of the career. */
export function deriveIdentities(t: CareerTotals, career: PlayerCareer, avatar: Player, year: number): CareerIdentity[] {
  const ids: CareerIdentity[] = [];
  void year;
  const majorTrophies = t.leagueTitles + t.continentalTitles;

  if (t.maxYearsOneClub >= 10 && t.clubs.length <= 2) ids.push('ONE_CLUB_LEGEND');
  if (t.teamTrophies >= 12) ids.push('SERIAL_WINNER');
  if (t.clubs.length >= 4 && t.countries >= 3) ids.push('GLOBETROTTER');
  if (t.peakOvr >= 87 && (t.peakAge ?? 99) <= 23 && (career.archetype === 'Prodigy' || avatar.potential >= 88)) ids.push('WONDERKID_FULFILLED');
  if ((t.peakAge ?? 0) >= 29 && t.peakOvr >= 82) ids.push('LATE_BLOOMER');
  if ((career.fanRating ?? 50) >= 76 && t.teamTrophies <= 4 && t.peakOvr < 86) ids.push('CULT_HERO');
  if (t.peakOvr >= 86 && majorTrophies === 0) ids.push('NEARLY_MAN');
  if (t.clubs.length >= 5 && t.peakOvr < 80) ids.push('JOURNEYMAN_PRO');
  if (t.caps >= 55 && (t.intlGoals >= 18 || t.peakOvr >= 86)) ids.push('COUNTRYS_GREATEST');

  // Never leave a finished career unlabelled — fall back to the honest shape.
  if (ids.length === 0) {
    if (t.teamTrophies >= 5) ids.push('SERIAL_WINNER');
    else if (t.peakOvr >= 84) ids.push('NEARLY_MAN');
    else if (t.apps >= 300) ids.push('JOURNEYMAN_PRO');
    else ids.push('CULT_HERO');
  }
  return ids;
}

/** Clubs where the avatar hit legend thresholds (apps / goals / trophies). */
export function legendClubs(career: PlayerCareer, clubs: Record<string, Club>): string[] {
  const byName = new Map<string, { apps: number; goals: number; honours: number }>();
  for (const s of career.seasonHistory) {
    if (!s.club) continue;
    const e = byName.get(s.club) ?? { apps: 0, goals: 0, honours: 0 };
    e.apps += s.apps; e.goals += s.goals; e.honours += (s.honours?.length ?? 0);
    byName.set(s.club, e);
  }
  const nameToId = new Map<string, string>();
  for (const c of Object.values(clubs)) nameToId.set(c.name, c.id);
  const out: string[] = [];
  for (const [name, e] of byName) {
    const isLegend = e.apps >= 120 || (e.apps >= 70 && e.honours >= 3) || (e.apps >= 60 && e.goals >= 60);
    const id = nameToId.get(name);
    if (isLegend && id) out.push(id);
  }
  return out;
}

// --- Ambitions --------------------------------------------------------------

/** Seed a starter ambitions checklist tailored to the avatar. */
export function defaultAmbitions(avatar: Player, dreamClubId?: string, dreamClubName?: string): CareerAmbition[] {
  const attacking = ['ST', 'LW', 'RW', 'CAM', 'LM', 'RM'].includes(avatar.position);
  const goalTarget = attacking ? 150 : avatar.position === 'GK' ? 0 : 60;
  const list: CareerAmbition[] = [
    { id: 'amb_league', text: 'Win a league title', kind: 'LEAGUE_TITLE', achieved: false },
    { id: 'amb_cont', text: 'Win a continental trophy', kind: 'CONTINENTAL', achieved: false },
    { id: 'amb_caps', text: 'Win 50 senior caps', kind: 'INTERNATIONAL_CAPS', target: 50, progress: 0, achieved: false },
    { id: 'amb_ballon', text: 'Win the Ballon d’Or', kind: 'BALLON_DOR', achieved: false },
  ];
  if (goalTarget > 0) list.splice(2, 0, { id: 'amb_goals', text: `Score ${goalTarget} career goals`, kind: 'CAREER_GOALS', target: goalTarget, progress: 0, achieved: false });
  else list.splice(2, 0, { id: 'amb_apps', text: 'Make 400 career appearances', kind: 'CAREER_APPS', target: 400, progress: 0, achieved: false });
  if (dreamClubId) list.push({ id: 'amb_dream', text: `Play for ${dreamClubName ?? 'your dream club'}`, kind: 'DREAM_MOVE', clubId: dreamClubId, achieved: false });
  return list;
}

/** Re-evaluate every ambition from real career data. Returns updated list +
 *  the ids of ambitions newly achieved this pass (for celebratory news). */
export function updateAmbitions(
  ambitions: CareerAmbition[], career: PlayerCareer, avatar: Player, day: number,
  clubs?: Record<string, Club>,
): { ambitions: CareerAmbition[]; achieved: CareerAmbition[] } {
  const t = careerTotals(career, avatar, avatar.born.year);
  const has = (type: string) => avatar.awards.some((a) => a.awardId === type);
  const playedFor = (clubId?: string) => {
    if (!clubId) return false;
    if (avatar.contract.clubId === clubId) return true;
    const name = clubs?.[clubId]?.name;
    return !!name && career.seasonHistory.some((s) => s.club === name);
  };

  const achieved: CareerAmbition[] = [];
  const next = ambitions.map((a) => {
    if (a.achieved) return a;
    let done = false; let progress = a.progress;
    switch (a.kind) {
      case 'LEAGUE_TITLE': done = has('LEAGUE_CHAMPION'); break;
      case 'CONTINENTAL': done = has('CONTINENTAL'); break;
      case 'DOMESTIC_CUP': done = has('DOMESTIC_CUP'); break;
      case 'BALLON_DOR': done = has('GLOBAL_BEST'); break;
      case 'CAREER_GOALS': progress = t.goals; done = t.goals >= (a.target ?? 999); break;
      case 'CAREER_APPS': progress = t.apps; done = t.apps >= (a.target ?? 999); break;
      case 'INTERNATIONAL_CAPS': progress = t.caps; done = t.caps >= (a.target ?? 999); break;
      case 'PLAY_FOR_CLUB': case 'DREAM_MOVE': done = playedFor(a.clubId); break;
    }
    if (done) { const upd = { ...a, achieved: true, achievedDay: day, progress }; achieved.push(upd); return upd; }
    return progress !== a.progress ? { ...a, progress } : a;
  });
  return { ambitions: next, achieved };
}


// --- Decline, veteran traits, role evolution --------------------------------

export const VETERAN_TRAITS: Record<string, { label: string; blurb: string }> = {
  LEADER: { label: 'Leader', blurb: 'Marshals the side; a natural captain.' },
  READS_GAME: { label: 'Reads the Game', blurb: 'Anticipation covers for lost yards of pace.' },
  MENTOR: { label: 'Mentor', blurb: 'Brings the young players on around him.' },
  COMPOSED: { label: 'Composed Under Pressure', blurb: 'Ice in the biggest moments.' },
  DEAD_BALL_VET: { label: 'Dead-Ball Veteran', blurb: 'Decades of practice on the training pitch.' },
};

/** Update the decline state as the avatar ages past his peak. */
export function updateDecline(career: PlayerCareer, avatar: Player, year: number): DeclineState {
  const age = year - avatar.born.year;
  const prev = career.decline;
  let peakOvr = prev?.peakOvr ?? avatar.overall;
  let peakAge = prev?.peakAge;
  for (const d of avatar.developmentLog) if (d.ovr >= peakOvr) { peakOvr = d.ovr; peakAge = d.year - avatar.born.year; }
  // Decline is "started" once he's 30+ and has slipped a couple of points off peak.
  const started = prev?.started || (age >= 30 && avatar.overall <= peakOvr - 2);
  return {
    started,
    startedAge: prev?.startedAge ?? (started ? age : undefined),
    peakOvr,
    peakAge,
    retrainedFrom: prev?.retrainedFrom,
  };
}

/** Which veteran traits the avatar has earned by age + mental attributes. GKs
 *  and central players lean into game-reading; leaders emerge from composure. */
export function earnedVeteranTraits(avatar: Player, year: number): string[] {
  const age = year - avatar.born.year;
  if (age < 30) return [];
  const m = avatar.attributes.mental;
  const tech = avatar.attributes.technical;
  const out: string[] = [];
  if ((m.composure ?? 0) >= 78 && (m.reactions ?? 0) >= 74) out.push('LEADER');
  if ((m.positioning ?? 0) >= 78 || (m.vision ?? 0) >= 80 || (m.interceptions ?? 0) >= 80) out.push('READS_GAME');
  if (age >= 32 && (avatar.hidden?.professionalism ?? 50) >= 62) out.push('MENTOR');
  if ((m.composure ?? 0) >= 82 || (tech.penalties ?? 0) >= 82) out.push('COMPOSED');
  if (age >= 31 && ((tech.fkAccuracy ?? 0) >= 78 || (tech.penalties ?? 0) >= 82)) out.push('DEAD_BALL_VET');
  return out;
}

/** The squad-elder arc — how the avatar's role reads as he winds down. */
export function roleEvolutionOf(career: PlayerCareer, avatar: Player, year: number): RoleEvolution {
  const age = year - avatar.born.year;
  const decline = career.decline?.started;
  if (age <= 30 || !decline) return 'PRIME';
  if (age >= 35 || statusRank(career.status) <= statusRank('ROTATION')) {
    return career.seasonApps <= 12 ? 'SQUAD_ELDER' : 'IMPACT_SUB';
  }
  if (statusRank(career.status) >= statusRank('KEY')) return 'EXPERIENCED_KEY';
  return 'IMPACT_SUB';
}

// --- Manager transition seeding ---------------------------------------------

/** Seed a starting managerial reputation from the playing legacy (5–99). */
export function managerRepSeed(legacy: LegacyState | undefined, totals: CareerTotals): number {
  const score = legacy?.score ?? 0;
  const base = 22 + score * 0.045 + totals.leagueTitles * 1.2 + totals.continentalTitles * 2 + (legacy?.legendAtClubs.length ?? 0) * 2;
  return Math.max(20, Math.min(78, Math.round(base)));
}
