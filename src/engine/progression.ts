// ---------------------------------------------------------------------------
// Match-day aftermath (§8, §11-M3). Pure & deterministic. After a matchday is
// simulated, this updates fitness/fatigue/form/morale, accumulates cards →
// suspensions, rolls injuries, and recovers resting/injured/suspended players.
// Runs in the orchestration layer (uses full Player objects); injuries are
// appended to the match timeline for display.
// ---------------------------------------------------------------------------

import type { Player, Injury, InjuryType } from '../types/player';
import type { Match, MatchEvent } from '../types/match';
import type { NewsItem } from '../types/league';
import { Rng, clamp } from './rng';

export interface AftermathResult {
  /** Players whose state changed this matchday (clone-on-write). */
  changedPlayers: Player[];
  /** matchId → INJURY events to append to that match's timeline. */
  injuryEvents: Record<string, MatchEvent[]>;
  news: NewsItem[];
}

const YELLOW_BAN_THRESHOLD = 5;

const INJURY_TABLE: { type: InjuryType; desc: string; weeks: [number, number]; w: number }[] = [
  { type: 'KNOCK', desc: 'Knock', weeks: [1, 2], w: 5 },
  { type: 'MUSCLE', desc: 'Muscle strain', weeks: [2, 5], w: 4 },
  { type: 'ILLNESS', desc: 'Illness', weeks: [1, 2], w: 2 },
  { type: 'LIGAMENT', desc: 'Ligament damage', weeks: [6, 16], w: 1.2 },
  { type: 'FRACTURE', desc: 'Fracture', weeks: [8, 20], w: 0.8 },
];

function rollInjury(rng: Rng, day: number): Injury {
  const total = INJURY_TABLE.reduce((s, x) => s + x.w, 0);
  let r = rng.next() * total;
  let chosen = INJURY_TABLE[0];
  for (const inj of INJURY_TABLE) {
    r -= inj.w;
    if (r <= 0) { chosen = inj; break; }
  }
  return {
    type: chosen.type,
    description: chosen.desc,
    weeksOut: rng.int(chosen.weeks[0], chosen.weeks[1]),
    occurredOnDay: day,
  };
}

let _seq = 0;
function news(day: number, category: NewsItem['category'], title: string, body: string): NewsItem {
  return { id: `news_a_${day}_${_seq++}`, day, category, title, body, read: false };
}

export function processMatchday(
  dayMatches: Match[],
  playersById: Record<string, Player>,
  toYear: number,
  seed: number,
  /** clubId → physio factor (≤1 reduces injury risk/severity), default 1. */
  physioByClub: Record<string, number> = {},
): AftermathResult {
  const rng = new Rng(seed);
  const day = dayMatches[0]?.day ?? 0;
  const changed = new Map<string, Player>();
  const injuryEvents: Record<string, MatchEvent[]> = {};
  const newsItems: NewsItem[] = [];

  const edit = (id: string): Player | null => {
    if (!playersById[id]) return null;
    let p = changed.get(id);
    if (!p) {
      p = structuredClone(playersById[id]);
      changed.set(id, p);
    }
    return p;
  };

  const clubsPlayed = new Set<string>();
  for (const m of dayMatches) {
    clubsPlayed.add(m.homeClubId);
    clubsPlayed.add(m.awayClubId);
  }

  // Who featured this matchday?
  const appeared = new Set<string>();
  for (const m of dayMatches) for (const s of m.playerStats) appeared.add(s.playerId);

  // 1) Recovery + counter ticks for everyone.
  for (const base of Object.values(playersById)) {
    const clubPlayed = base.contract.clubId != null && clubsPlayed.has(base.contract.clubId);
    if (base.injury) {
      const p = edit(base.id)!;
      p.injury!.weeksOut -= 1;
      if (p.injury!.weeksOut <= 0) {
        p.injury = null;
        p.fitness = Math.max(p.fitness, 82);
        newsItems.push(news(day, 'INJURY', `${p.name.first} ${p.name.last} returns`, 'Back in training after injury.'));
      }
    }
    if (base.cards.suspendedFor > 0 && clubPlayed) {
      const p = edit(base.id)!;
      p.cards.suspendedFor = Math.max(0, p.cards.suspendedFor - 1);
    }
    if (!appeared.has(base.id)) {
      const p = edit(base.id)!;
      // Rested players (bench / not in the squad) recover briskly.
      p.fitness = clamp(p.fitness + rng.int(16, 26));
      p.fatigueLoad = clamp(p.fatigueLoad - 20);
      p.form = p.form * 0.85; // drift toward neutral
    }
  }

  // 2) Per-appearance effects.
  for (const m of dayMatches) {
    const homeWin = m.homeGoals > m.awayGoals;
    const draw = m.homeGoals === m.awayGoals;
    for (const stat of m.playerStats) {
      const p = edit(stat.playerId);
      if (!p) continue;
      const isHome = p.contract.clubId === m.homeClubId;
      const won = isHome ? homeWin : !homeWin && !draw;
      const lost = !won && !draw;
      const age = toYear - p.born.year;

      // Goalkeepers barely cover ground, so a match costs them far less.
      const isGk = p.position === 'GK';
      p.fitness = clamp(p.fitness - (isGk ? rng.int(1, 3) : rng.int(4, 9)) - Math.max(0, age - 30));
      p.fatigueLoad = clamp(p.fatigueLoad + (isGk ? rng.int(2, 4) : rng.int(6, 11)));
      // Travel fatigue: continental away trips (long midweek journeys) take an
      // extra toll, rewarding squad rotation in Europe.
      const continental = m.competitionId.startsWith('UEFA_') || m.competitionId.startsWith('FIFA_');
      if (continental && !isHome) {
        p.fatigueLoad = clamp(p.fatigueLoad + rng.int(5, 10));
        p.fitness = clamp(p.fitness - rng.int(3, 6));
      }
      const target = (stat.rating - 6.6) * 22;
      p.form = clamp(p.form * 0.6 + target * 0.4, -100, 100);
      p.morale = clamp(p.morale + (won ? 3 : lost ? -3 : 0) + (stat.rating > 7.3 ? 1 : 0));

      if (stat.yellow) {
        p.cards.yellow += 1;
        if (p.cards.yellow % YELLOW_BAN_THRESHOLD === 0) {
          p.cards.suspendedFor += 1;
          newsItems.push(news(day, 'GENERAL', `${p.name.first} ${p.name.last} suspended`,
            `Banned for one match after ${YELLOW_BAN_THRESHOLD} bookings.`));
        }
      }
      if (stat.red) {
        p.cards.red += 1;
        const ban = stat.yellow ? 1 : 3; // 2nd yellow vs straight red
        p.cards.suspendedFor += ban;
        newsItems.push(news(day, 'GENERAL', `${p.name.first} ${p.name.last} sent off`,
          `Suspended for ${ban} match${ban > 1 ? 'es' : ''}.`));
      }

      // Injury roll, weighted by proneness / age / fatigue, eased by physios.
      const physio = (p.contract.clubId && physioByClub[p.contract.clubId]) || 1;
      const risk =
        0.006 *
        (0.6 + p.hidden.injuryProneness / 100) *
        (1 + Math.max(0, age - 27) * 0.03) *
        (1 + p.fatigueLoad / 300) *
        physio;
      if (rng.chance(risk)) {
        const injury = rollInjury(rng, day);
        if (physio < 1) injury.weeksOut = Math.max(1, Math.round(injury.weeksOut * physio));
        p.injury = injury;
        p.fitness = clamp(40);
        (injuryEvents[m.id] ??= []).push({
          minute: rng.int(10, 88),
          type: 'INJURY',
          side: isHome ? 'home' : 'away',
          playerId: p.id,
          description: `${injury.description} (~${injury.weeksOut}w)`,
        });
        newsItems.push(news(day, 'INJURY', `${p.name.first} ${p.name.last} injured`,
          `${injury.description}, expected out ~${injury.weeksOut} weeks.`));
      }
    }
  }

  return { changedPlayers: [...changed.values()], injuryEvents, news: newsItems };
}
