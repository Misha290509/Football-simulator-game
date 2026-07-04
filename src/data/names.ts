// ---------------------------------------------------------------------------
// Generic name pools for the fictional fallback generator (§9). These are
// invented/common names used only to fill gaps and future youth intakes — the
// app ships NO protected/real player data. Users supply licensed datasets.
// ---------------------------------------------------------------------------

export const FIRST_NAMES: string[] = [
  'Alex', 'Liam', 'Noah', 'Mason', 'Ethan', 'Oliver', 'Harry', 'Jack', 'George',
  'Charlie', 'Leo', 'Oscar', 'Arthur', 'Freddie', 'Theo', 'Lucas', 'Adam', 'Daniel',
  'Marco', 'Luca', 'Mateo', 'Diego', 'Bruno', 'Joao', 'Pedro', 'Carlos', 'Sergio',
  'Pablo', 'Andre', 'Nico', 'Felix', 'Jonas', 'Lars', 'Sven', 'Kai', 'Finn',
  'Sami', 'Yusuf', 'Omar', 'Karim', 'Tariq', 'Mehdi', 'Hassan', 'Ali',
  'Mathis', 'Hugo', 'Louis', 'Jules', 'Enzo', 'Nathan', 'Gabriel', 'Rafael',
];

export const LAST_NAMES: string[] = [
  'Smith', 'Brown', 'Walker', 'Hughes', 'Cole', 'Wright', 'Hunter', 'Frost',
  'Reed', 'Stone', 'Marsh', 'Hart', 'Vale', 'Lake', 'Webb', 'Knight',
  'Rossi', 'Bianchi', 'Romano', 'Conti', 'Greco', 'Ferraro',
  'Silva', 'Santos', 'Costa', 'Pereira', 'Almeida', 'Carvalho',
  'Garcia', 'Martinez', 'Lopez', 'Sanchez', 'Torres', 'Ramos', 'Morales',
  'Mueller', 'Schmidt', 'Becker', 'Wagner', 'Hoffmann', 'Krause',
  'Dubois', 'Laurent', 'Moreau', 'Lefevre', 'Girard', 'Mercier',
  'Haddad', 'Nasser', 'Saleh', 'Mansour', 'Aziz', 'Rahman',
];

/** Country id → small weighting toward typical name pools (cosmetic only). */
export const COUNTRY_NAME_BIAS: Record<string, { first: [number, number]; last: [number, number] }> = {
  // ranges index into the arrays above; purely flavor.
  GB: { first: [0, 18], last: [0, 16] },
  IT: { first: [18, 24], last: [16, 22] },
  PT: { first: [24, 30], last: [22, 28] },
  ES: { first: [18, 30], last: [28, 35] },
  DE: { first: [30, 38], last: [35, 41] },
  FR: { first: [44, 52], last: [41, 47] },
  SA: { first: [38, 44], last: [47, 53] },
};
