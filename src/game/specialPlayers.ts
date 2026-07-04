// ---------------------------------------------------------------------------
// Special / cameo players. A tiny, deterministic registry of hand-authored
// people who join a specific club's academy when a world is built (new game)
// or when an existing save is migrated. Each has a fixed id so injection is
// idempotent — re-running never creates a duplicate.
// ---------------------------------------------------------------------------

import type { Club } from '../types/club';
import type { Player } from '../types/player';
import type { AcademyPlayer } from '../types/academy';
import { Rng } from '../engine/rng';
import { generatePlayer } from '../engine/generator';
import { enrollProspect } from './academy';

interface SpecialSpec {
  id: string;
  /** Which club's academy he belongs to. */
  clubMatch: (c: Club) => boolean;
  /** Build the fully-formed player (id is overwritten with `id`). */
  build: (rng: Rng, year: number, ratingCap: number) => Player;
}

const isGirona = (c: Club): boolean =>
  c.id === 'club_ES_GIR' || (c.abbrev === 'GIR' && c.countryId === 'ES') || /girona/i.test(c.name);

const SPECIALS: SpecialSpec[] = [
  {
    id: 'p_special_pelayo_girona',
    clubMatch: isGirona,
    build: (rng, year, ratingCap) => {
      // A 15-year-old defensive midfielder: OVR 63, POT 88. Generated at the
      // target rating then given his real identity and secondary positions.
      const base = generatePlayer({
        rng,
        currentYear: year,
        target: 63,
        position: 'CDM',
        ageRange: [15, 15],
        nationality: 'ES',
        ratingCap,
        squadRole: 'PROSPECT',
      });
      base.name = { first: 'Pelayo', last: 'Rubió Rodríguez' };
      base.nationality = 'ES';
      base.preferredFoot = 'R';
      base.height_cm = 180;
      base.weight_kg = 72;
      base.position = 'CDM';
      // Mainly CDM, also a CM; can fill in at centre-back (a touch weaker) and
      // right-back (weaker still) — the engine rates the secondary spots lower
      // from his midfield attribute profile.
      base.positions = ['CDM', 'CM', 'RCB', 'RB'];
      base.overall = 63;
      base.potential = 88;
      base.developmentLog = [{ year, ovr: 63, pot: 88 }];
      return base;
    },
  },
];

/**
 * Inject every special player into the world if not already present. Mutates
 * `players` and `academyPlayers`, and returns the ids added (for persistence).
 * Deterministic given the seed.
 */
export function injectSpecialPlayers(
  clubs: Record<string, Club>,
  players: Record<string, Player>,
  academyPlayers: Record<string, AcademyPlayer>,
  year: number,
  ratingCap: number,
  seed: number,
): string[] {
  const rng = new Rng((seed ^ 0x5eec1a10) >>> 0);
  const added: string[] = [];
  for (const spec of SPECIALS) {
    if (players[spec.id]) continue; // already present — idempotent
    const club = Object.values(clubs).find(spec.clubMatch);
    if (!club) continue; // club not in this world
    const squad = Object.values(players).filter((p) => p.contract.clubId === club.id);
    const firstTeamAvg = squad.length
      ? squad.reduce((s, p) => s + p.overall, 0) / squad.length
      : Math.max(50, club.reputation * 0.85);
    const player = spec.build(rng, year, ratingCap);
    player.id = spec.id;
    player.developmentLog = player.developmentLog.map((d) => ({ ...d }));
    const overlay = enrollProspect(player, club, year, firstTeamAvg, rng);
    players[player.id] = player;
    academyPlayers[player.id] = overlay;
    added.push(player.id);
  }
  return added;
}
