// ---------------------------------------------------------------------------
// The other ten football nations (§1A, §11-M6). Top divisions use real club
// names (factual structural data); second divisions are synthesized to provide
// the promotion/relegation pyramid (no protected player data ships — see §9).
// All structure is data: club counts, formats, pro/rel & playoff rule flags,
// conferences and tiebreakers are per-competition config.
// ---------------------------------------------------------------------------

import type {
  Dataset,
  DatasetClub,
  DatasetCountry,
  DatasetLeague,
} from '../types/dataset';
import type { Confederation, PromotionRule, Tiebreaker } from '../types/competition';

type Mini = [name: string, abbrev: string, reputation: number];

const STD_TB: Tiebreaker[] = ['points', 'goalDifference', 'goalsFor', 'headToHead'];

const club = ([name, abbrev, reputation]: Mini): DatasetClub => ({
  name,
  shortName: name,
  abbrev,
  reputation,
});

/** Synthesize a plausible second-tier division to complete the pyramid. */
const SYNTH_CITIES = [
  'Riverton', 'Lakeside', 'Hillcrest', 'Eastgate', 'Westbrook', 'Northvale',
  'Southport', 'Fairview', 'Kingsbridge', 'Ashford', 'Brookfield', 'Stonehaven',
  'Maplewood', 'Castleton', 'Crestwood', 'Bayford', 'Elmsworth', 'Highbury',
  'Marlowe', 'Redhill', 'Thornbury', 'Whitfield', 'Glenmore', 'Oakhampton',
  'Pinedale', 'Cliffside', 'Harborview', 'Wexford',
];

function synthTier2(countryId: string, count: number, baseRep: number): DatasetClub[] {
  return Array.from({ length: count }, (_, i) => {
    const cityIdx = i % SYNTH_CITIES.length;
    const name = `${SYNTH_CITIES[cityIdx]} ${i % 2 === 0 ? 'FC' : 'United'}`;
    const abbrev = (SYNTH_CITIES[cityIdx].slice(0, 2) + countryId).toUpperCase().slice(0, 3);
    return club([name, abbrev + i, baseRep + ((i * 7) % 10) - 5]);
  });
}

function league(
  name: string,
  tier: number,
  numClubs: number,
  clubs: DatasetClub[],
  promotion: PromotionRule | null,
  extras: Partial<DatasetLeague> = {},
): DatasetLeague {
  return {
    name,
    tier,
    format: 'round_robin',
    numClubs,
    rounds: 2,
    tiebreakers: STD_TB,
    promotion,
    conferences: null,
    clubs,
    ...extras,
  };
}

const proRel = (up: number, down: number, promoPlayoff = 0, relPlayoff = 0): PromotionRule => ({
  autoPromote: up,
  autoRelegate: down,
  promotionPlayoffSlots: promoPlayoff,
  relegationPlayoffSlots: relPlayoff,
});

function country(
  id: string,
  name: string,
  confederation: Confederation,
  leagues: DatasetLeague[],
): DatasetCountry {
  return { id, name, confederation, leagues };
}

// --- Top divisions (real clubs) --------------------------------------------

const FRANCE_T1: Mini[] = [
  ['Paris Saint-Germain', 'PSG', 90], ['Marseille', 'OM', 78], ['Monaco', 'ASM', 77],
  ['Lyon', 'OL', 75], ['Lille', 'LIL', 74], ['Nice', 'NIC', 72], ['Rennes', 'REN', 72],
  ['Lens', 'RCL', 71], ['Strasbourg', 'RCS', 66], ['Nantes', 'FCN', 66],
  ['Montpellier', 'MHS', 65], ['Toulouse', 'TFC', 65], ['Reims', 'SDR', 65],
  ['Brest', 'B29', 64], ['Le Havre', 'HAC', 61], ['Auxerre', 'AJA', 61],
  ['Angers', 'SCO', 60], ['Saint-Étienne', 'ASS', 63],
];

const SPAIN_T1: Mini[] = [
  ['Real Madrid', 'RMA', 92], ['Barcelona', 'BAR', 89], ['Atlético Madrid', 'ATM', 84],
  ['Athletic Club', 'ATH', 76], ['Real Sociedad', 'RSO', 75], ['Real Betis', 'BET', 73],
  ['Villarreal', 'VIL', 73], ['Valencia', 'VAL', 72], ['Sevilla', 'SEV', 74],
  ['Girona', 'GIR', 70], ['Osasuna', 'OSA', 68], ['Celta Vigo', 'CEL', 68],
  ['Rayo Vallecano', 'RAY', 66], ['Mallorca', 'MLL', 66], ['Getafe', 'GET', 66],
  ['Las Palmas', 'LPA', 64], ['Alavés', 'ALA', 64], ['Espanyol', 'ESP', 65],
  ['Leganés', 'LEG', 60], ['Valladolid', 'VLL', 60],
];

const GERMANY_T1: Mini[] = [
  ['Bayern Munich', 'FCB', 90], ['Bayer Leverkusen', 'B04', 84], ['RB Leipzig', 'RBL', 81],
  ['Borussia Dortmund', 'BVB', 82], ['VfB Stuttgart', 'VFB', 74], ['Eintracht Frankfurt', 'SGE', 74],
  ['Freiburg', 'SCF', 70], ['Wolfsburg', 'WOB', 70], ['Borussia M.gladbach', 'BMG', 70],
  ['Werder Bremen', 'SVW', 68], ['Hoffenheim', 'TSG', 68], ['Mainz', 'M05', 66],
  ['Augsburg', 'FCA', 65], ['Union Berlin', 'FCU', 67], ['VfL Bochum', 'BOC', 62],
  ['Heidenheim', 'HDH', 61], ['St. Pauli', 'STP', 61], ['Holstein Kiel', 'KSV', 60],
];

const ITALY_T1: Mini[] = [
  ['Inter', 'INT', 86], ['Juventus', 'JUV', 84], ['AC Milan', 'MIL', 83],
  ['Napoli', 'NAP', 82], ['Atalanta', 'ATA', 79], ['Roma', 'ROM', 77],
  ['Lazio', 'LAZ', 76], ['Fiorentina', 'FIO', 73], ['Bologna', 'BOL', 72],
  ['Torino', 'TOR', 69], ['Udinese', 'UDI', 67], ['Genoa', 'GEN', 66],
  ['Monza', 'MON', 64], ['Cagliari', 'CAG', 64], ['Verona', 'VER', 64],
  ['Lecce', 'LEC', 63], ['Empoli', 'EMP', 63], ['Parma', 'PAR', 63],
  ['Como', 'COM', 64], ['Venezia', 'VEN', 60],
];

const PORTUGAL_T1: Mini[] = [
  ['Benfica', 'SLB', 82], ['Porto', 'POR', 81], ['Sporting CP', 'SCP', 81],
  ['Braga', 'SCB', 74], ['Vitória SC', 'VSC', 68], ['Famalicão', 'FAM', 64],
  ['Moreirense', 'MOR', 61], ['Estoril', 'EST', 61], ['Gil Vicente', 'GIL', 61],
  ['Boavista', 'BOA', 62], ['Casa Pia', 'CAS', 60], ['Rio Ave', 'RIO', 60],
  ['Estrela Amadora', 'EAM', 58], ['Arouca', 'ARO', 59], ['Nacional', 'NAC', 58],
  ['Farense', 'FAR', 57], ['Santa Clara', 'STC', 58], ['AVS', 'AVS', 56],
];

const NETHERLANDS_T1: Mini[] = [
  ['Ajax', 'AJA', 80], ['PSV', 'PSV', 82], ['Feyenoord', 'FEY', 80],
  ['AZ Alkmaar', 'AZ', 72], ['Twente', 'TWE', 70], ['Utrecht', 'UTR', 67],
  ['Sparta Rotterdam', 'SPA', 62], ['Heerenveen', 'HEE', 63], ['Go Ahead Eagles', 'GAE', 60],
  ['NEC Nijmegen', 'NEC', 62], ['Fortuna Sittard', 'FOR', 60], ['PEC Zwolle', 'PEC', 59],
  ['Heracles', 'HER', 59], ['Groningen', 'GRO', 61], ['NAC Breda', 'NAC', 59],
  ['Willem II', 'WIL', 58], ['Almere City', 'ALM', 57], ['RKC Waalwijk', 'RKC', 57],
];

const USA_MLS: Mini[] = [
  // East
  ['Inter Miami', 'MIA', 74], ['Columbus Crew', 'CLB', 72], ['FC Cincinnati', 'CIN', 71],
  ['Orlando City', 'ORL', 68], ['Philadelphia Union', 'PHI', 68], ['Atlanta United', 'ATL', 69],
  ['New York City FC', 'NYC', 68], ['New York Red Bulls', 'RBNY', 67], ['Charlotte FC', 'CLT', 64],
  ['Nashville SC', 'NSH', 66], ['CF Montréal', 'MTL', 62], ['Toronto FC', 'TOR', 63],
  ['New England', 'NE', 63], ['Chicago Fire', 'CHI', 62], ['D.C. United', 'DC', 62],
  // West
  ['LA Galaxy', 'LA', 71], ['Los Angeles FC', 'LAFC', 73], ['Seattle Sounders', 'SEA', 71],
  ['Real Salt Lake', 'RSL', 66], ['Houston Dynamo', 'HOU', 65], ['Vancouver Whitecaps', 'VAN', 64],
  ['Portland Timbers', 'POR', 66], ['Minnesota United', 'MIN', 65], ['FC Dallas', 'DAL', 64],
  ['Austin FC', 'ATX', 64], ['Colorado Rapids', 'COL', 62], ['Sporting KC', 'SKC', 64],
  ['San Jose', 'SJ', 61], ['St. Louis City', 'STL', 65],
];

const BRAZIL_T1: Mini[] = [
  ['Palmeiras', 'PAL', 81], ['Flamengo', 'FLA', 82], ['Botafogo', 'BOT', 76],
  ['Fortaleza', 'FOR', 72], ['São Paulo', 'SAO', 76], ['Internacional', 'INT', 73],
  ['Corinthians', 'COR', 74], ['Cruzeiro', 'CRU', 72], ['Bahia', 'BAH', 69],
  ['Grêmio', 'GRE', 72], ['Atlético Mineiro', 'CAM', 74], ['Vasco da Gama', 'VAS', 68],
  ['Fluminense', 'FLU', 71], ['Juventude', 'JUV', 62], ['Bragantino', 'RBB', 67],
  ['Criciúma', 'CRI', 60], ['Vitória', 'VIT', 61], ['Athletico PR', 'CAP', 70],
  ['Cuiabá', 'CUI', 60], ['Atlético GO', 'ACG', 59],
];

const ARGENTINA_T1: Mini[] = [
  ['River Plate', 'RIV', 80], ['Boca Juniors', 'BOC', 79], ['Racing Club', 'RAC', 72],
  ['Independiente', 'IND', 70], ['San Lorenzo', 'SL', 68], ['Estudiantes', 'EST', 70],
  ['Vélez Sarsfield', 'VEL', 70], ['Talleres', 'TAL', 69], ['Argentinos Jrs', 'AAAJ', 65],
  ['Lanús', 'LAN', 65], ['Defensa y Justicia', 'DYJ', 65], ['Huracán', 'HUR', 63],
  ['Rosario Central', 'CAR', 66], ['Newells Old Boys', 'NOB', 64], ['Godoy Cruz', 'GOD', 63],
  ['Banfield', 'BAN', 61], ['Gimnasia LP', 'GIM', 62], ['Belgrano', 'BEL', 62],
  ['Instituto', 'INS', 59], ['Platense', 'PLA', 58], ['Tigre', 'TIG', 60],
  ['Barracas Central', 'BCE', 58], ['Sarmiento', 'SAR', 57], ['Central Córdoba', 'CCO', 58],
  ['Independiente Riv.', 'IRV', 56], ['Unión', 'UNI', 60], ['Atlético Tucumán', 'ATU', 59],
  ['Deportivo Riestra', 'RIE', 55],
];

const SAUDI_T1: Mini[] = [
  ['Al-Hilal', 'HIL', 82], ['Al-Nassr', 'NAS', 80], ['Al-Ittihad', 'ITT', 78],
  ['Al-Ahli', 'AHL', 76], ['Al-Ettifaq', 'ETT', 68], ['Al-Shabab', 'SHB', 67],
  ['Al-Taawoun', 'TAA', 64], ['Al-Fateh', 'FAT', 62], ['Al-Fayha', 'FAY', 61],
  ['Al-Khaleej', 'KHA', 60], ['Al-Riyadh', 'RIY', 59], ['Damac', 'DAM', 59],
  ['Al-Wehda', 'WEH', 59], ['Al-Raed', 'RAE', 58], ['Al-Qadsiah', 'QAD', 64],
  ['Al-Orobah', 'ORO', 56], ['Al-Kholood', 'KHO', 55], ['Al-Okhdood', 'OKH', 55],
];

// Conferences for MLS (East = first 15, West = last 14 by data order).
const mlsLeague: DatasetLeague = {
  name: 'Major League Soccer',
  tier: 1,
  format: 'conference_playoff',
  numClubs: USA_MLS.length,
  rounds: 2,
  tiebreakers: ['points', 'wins', 'goalDifference', 'goalsFor'],
  promotion: null, // no pro/rel
  conferences: { names: ['Eastern', 'Western'], playoffQualifiersPerConference: 7 },
  clubs: USA_MLS.map(club),
};

export const OTHER_COUNTRIES: DatasetCountry[] = [
  country('FR', 'France', 'UEFA', [
    league('Ligue 1', 1, 18, FRANCE_T1.map(club), proRel(0, 3)),
    league('Ligue 2', 2, 18, synthTier2('FR', 18, 55), proRel(2, 3, 4)),
  ]),
  country('ES', 'Spain', 'UEFA', [
    league('La Liga', 1, 20, SPAIN_T1.map(club), proRel(0, 3)),
    league('La Liga 2', 2, 22, synthTier2('ES', 22, 55), proRel(2, 3, 4)),
  ]),
  country('DE', 'Germany', 'UEFA', [
    // Bundesliga relegation playoff slot modeled as a rule flag.
    league('Bundesliga', 1, 18, GERMANY_T1.map(club), proRel(0, 2, 0, 1)),
    league('2. Bundesliga', 2, 18, synthTier2('DE', 18, 56), proRel(2, 2, 0, 1)),
  ]),
  country('IT', 'Italy', 'UEFA', [
    league('Serie A', 1, 20, ITALY_T1.map(club), proRel(0, 3)),
    league('Serie B', 2, 20, synthTier2('IT', 20, 56), proRel(2, 3, 4)),
  ]),
  country('PT', 'Portugal', 'UEFA', [
    league('Primeira Liga', 1, 18, PORTUGAL_T1.map(club), proRel(0, 2)),
    league('Liga Portugal 2', 2, 18, synthTier2('PT', 18, 52), proRel(2, 2)),
  ]),
  country('NL', 'Netherlands', 'UEFA', [
    // Eredivisie promotion via play-offs modeled as a rule flag.
    league('Eredivisie', 1, 18, NETHERLANDS_T1.map(club), proRel(0, 1, 0, 1)),
    league('Eerste Divisie', 2, 20, synthTier2('NL', 20, 50), proRel(1, 0, 4)),
  ]),
  country('US', 'United States', 'CONCACAF', [mlsLeague]),
  country('BR', 'Brazil', 'CONMEBOL', [
    league('Brasileirão Série A', 1, 20, BRAZIL_T1.map(club), proRel(0, 4)),
    league('Série B', 2, 20, synthTier2('BR', 20, 56), proRel(4, 4)),
  ]),
  country('AR', 'Argentina', 'CONMEBOL', [
    // Single table by default; cup-style splits are left as a future hook.
    league('Liga Profesional', 1, 28, ARGENTINA_T1.map(club), proRel(0, 2)),
    league('Primera Nacional', 2, 20, synthTier2('AR', 20, 52), proRel(2, 0, 4)),
  ]),
  country('SA', 'Saudi Arabia', 'AFC', [
    league('Saudi Pro League', 1, 18, SAUDI_T1.map(club), proRel(0, 3)),
    league('First Division League', 2, 18, synthTier2('SA', 18, 52), proRel(3, 0)),
  ]),
];

/** Build a single combined dataset spanning all eleven nations. */
export function buildGlobalDataset(england: DatasetCountry): Dataset {
  return {
    schemaVersion: 1,
    name: 'World (11 nations)',
    description:
      'All eleven nations from the build spec. Top divisions use real club ' +
      'names; second divisions are synthesized. Player attributes are generated.',
    countries: [england, ...OTHER_COUNTRIES],
  };
}
