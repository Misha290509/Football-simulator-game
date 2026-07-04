// ---------------------------------------------------------------------------
// Pre-match opposition report (§ Matchday). A pure scouting briefing derived
// from the opponent's squad, tactics and recent results: their strength, form,
// style, main threat, an exploitable weakness, and the danger men to watch.
// ---------------------------------------------------------------------------

import type { Club } from '../types/club';
import type { Player } from '../types/player';
import type { Match } from '../types/match';
import { POSITION_GROUP } from '../types/attributes';

export interface OppositionReport {
  strength: number;
  form: string; // most-recent-first, e.g. "W W L D W"
  style: string;
  threat: string;
  weakness: string;
  onesToWatch: { id: string; name: string; ovr: number; position: string }[];
}

const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

function styleOf(club: Club): string {
  const d = club.tactics?.defensive ?? 'BALANCED';
  const o = club.tactics?.offensive ?? 'POSSESSION';
  const dd = d === 'DEEP' ? 'sit deep and soak up pressure' : d === 'PRESSING' ? 'press aggressively high up' : 'hold a balanced line';
  const oo = o === 'COUNTER' ? 'break quickly on the counter' : o === 'DIRECT' ? 'play direct, forward football' : 'keep the ball and build patiently';
  return `They ${dd} and ${oo}.`;
}

function formString(clubId: string, matches: Match[]): string {
  const recent = matches
    .filter((m) => m.played && (m.homeClubId === clubId || m.awayClubId === clubId))
    .sort((a, b) => b.day - a.day)
    .slice(0, 5);
  return recent.map((m) => {
    const home = m.homeClubId === clubId;
    const gf = home ? m.homeGoals : m.awayGoals;
    const ga = home ? m.awayGoals : m.homeGoals;
    return gf > ga ? 'W' : gf < ga ? 'L' : 'D';
  }).join(' ') || '—';
}

export function buildOppositionReport(opp: Club, players: Player[], seasonMatches: Match[]): OppositionReport {
  const squad = [...players].sort((a, b) => b.overall - a.overall);
  const xi = squad.slice(0, 11);
  const strength = mean(xi.map((p) => p.overall));

  const grp = (p: Player) => POSITION_GROUP[p.position];
  const att = mean(squad.filter((p) => grp(p) === 'ATT').slice(0, 4).map((p) => p.overall));
  const def = mean(squad.filter((p) => grp(p) === 'DEF').slice(0, 4).map((p) => p.overall));
  const mid = mean(squad.filter((p) => grp(p) === 'MID').slice(0, 4).map((p) => p.overall));

  // Threat = their strongest line; weakness = their weakest.
  const lines: [string, number][] = [['attack', att], ['midfield', mid], ['defence', def]];
  const strong = [...lines].sort((a, b) => b[1] - a[1])[0][0];
  const weak = [...lines].sort((a, b) => a[1] - b[1])[0][0];
  const threat = strong === 'attack' ? 'A potent attack — stay compact and deny space in behind.'
    : strong === 'midfield' ? 'They dominate midfield — win the battle in the centre.'
    : 'A resolute defence — you may need patience and width to break them down.';
  const weakness = weak === 'defence' ? 'Their defence is the weak link — get runners in behind.'
    : weak === 'midfield' ? 'Their midfield can be overrun — flood the centre.'
    : 'Limited threat up top — push your full-backs on and take the initiative.';

  const onesToWatch = squad
    .filter((p) => grp(p) === 'ATT' || grp(p) === 'MID')
    .slice(0, 3)
    .map((p) => ({ id: p.id, name: `${p.name.first} ${p.name.last}`, ovr: p.overall, position: p.position }));

  return { strength, form: formString(opp.id, seasonMatches), style: styleOf(opp), threat, weakness, onesToWatch };
}
