// ---------------------------------------------------------------------------
// Presentation metadata for awards (emoji + a short label), shared by the UI.
// Keyed by award type; also covers the legacy tournament award ids stamped onto
// player award refs (WORLD_CUP / EUROS / COPA_AMERICA).
// ---------------------------------------------------------------------------

export interface AwardMeta { label: string; emoji: string }

export const AWARD_META: Record<string, AwardMeta> = {
  // Individual — season end
  GOLDEN_BOOT: { label: 'Golden Boot', emoji: '👟' },
  GLOBAL_GOLDEN_BOOT: { label: 'Global Golden Boot', emoji: '👟' },
  PLAYMAKER: { label: 'Playmaker of the Season', emoji: '🎯' },
  PLAYER_OF_SEASON: { label: 'Player of the Season', emoji: '⭐' },
  CONFED_POTY: { label: 'Footballer of the Year', emoji: '🌍' },
  UEFA_POTY: { label: 'UEFA Player of the Year', emoji: '🌟' },
  CONTINENTAL_BEST: { label: 'Player of the Season', emoji: '🌟' },
  TEAM_OF_SEASON: { label: 'Team of the Season', emoji: '🧩' },
  // Individual — the autumn gala
  GLOBAL_BEST: { label: 'Ballon d’Or', emoji: '🏆' },
  KOPA: { label: 'Kopa Trophy', emoji: '🥇' },
  YASHIN: { label: 'Yashin Trophy', emoji: '🧤' },
  PUSKAS: { label: 'Puskás Award', emoji: '⚽' },
  // International tournament honours
  GOLDEN_BALL: { label: 'Golden Ball', emoji: '🏅' },
  GOLDEN_GLOVE: { label: 'Golden Glove', emoji: '🧤' },
  WC_YOUNG_PLAYER: { label: 'Young Player', emoji: '🌱' },
  TOURNAMENT_BEST: { label: 'Player of the Tournament', emoji: '🏅' },
  // Team trophies
  LEAGUE_CHAMPION: { label: 'League Title', emoji: '🏆' },
  DOMESTIC_CUP: { label: 'Domestic Cup', emoji: '🏆' },
  CONTINENTAL: { label: 'Continental Title', emoji: '🌍' },
  // Manager + legacy
  MANAGER_OF_YEAR: { label: 'Manager of the Year', emoji: '📋' },
  YOUNG_PLAYER: { label: 'Young Player of the Season', emoji: '🌱' },
  // Legacy tournament award ids stamped on player refs
  WORLD_CUP: { label: 'World Cup Winner', emoji: '🌍' },
  EUROS: { label: 'Euros Winner', emoji: '🌍' },
  COPA_AMERICA: { label: 'Copa América Winner', emoji: '🌎' },
};

/** Individual (player) award types, in rough prestige order for display. */
export const INDIVIDUAL_AWARD_ORDER: string[] = [
  'GLOBAL_BEST', 'GLOBAL_GOLDEN_BOOT', 'GOLDEN_BALL', 'UEFA_POTY', 'CONFED_POTY',
  'PLAYER_OF_SEASON', 'CONTINENTAL_BEST', 'KOPA', 'YASHIN', 'PUSKAS', 'PLAYMAKER',
  'GOLDEN_BOOT', 'GOLDEN_GLOVE', 'WC_YOUNG_PLAYER', 'TOURNAMENT_BEST', 'TEAM_OF_SEASON',
];

const INDIVIDUAL_SET = new Set(INDIVIDUAL_AWARD_ORDER.concat(['YOUNG_PLAYER']));
export const isIndividualAward = (type: string): boolean => INDIVIDUAL_SET.has(type);

/** Team trophies (club titles + nation tournament wins) as stamped on players. */
const TEAM_TROPHY_SET = new Set(['LEAGUE_CHAMPION', 'DOMESTIC_CUP', 'CONTINENTAL', 'WORLD_CUP', 'EUROS', 'COPA_AMERICA']);
export const isTeamTrophy = (type: string): boolean => TEAM_TROPHY_SET.has(type);

export const awardMeta = (type: string): AwardMeta => AWARD_META[type] ?? { label: type, emoji: '🏵️' };
