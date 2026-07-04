/* eslint-disable no-console */
// ---------------------------------------------------------------------------
// Real-player dataset importer.
//
// Converts an EA Sports FC / FIFA "complete player dataset" CSV (the SoFIFA-
// derived files on Kaggle — e.g. FC26_*.csv / players_*.csv) into the game's
// Dataset schema, with the full 34-attribute model mapped 1:1.
//
// It builds the WHOLE world from the data: each league's country is inferred
// from its players' dominant nationality, leagues are grouped into national
// pyramids, tiers are ordered by squad strength, and promotion/relegation is
// wired up automatically. Every league with enough clubs is included.
//
//   npm run import:dataset -- path/to/FC26.csv
//
// Output: src/data/realDataset.json  (loaded automatically by New Game).
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Dataset, DatasetClub, DatasetPlayer } from '../src/types/dataset';
import type { Confederation, Tiebreaker } from '../src/types/competition';
import type { Position } from '../src/types/attributes';

const MIN_CLUBS_PER_LEAGUE = 8;   // skip leagues the dataset only partly covers
const MIN_PLAYERS_PER_CLUB = 11;  // skip thin/placeholder clubs
const MAX_PLAYERS_PER_CLUB = 30;
const STD_TB: Tiebreaker[] = ['points', 'goalDifference', 'goalsFor', 'headToHead'];

// --- CSV parsing (handles quoted fields & embedded commas) -----------------
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch === '\r') { /* skip */ }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift() ?? [];
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] ?? ''])));
}

const col = (r: Record<string, string>, ...names: string[]): string => {
  for (const n of names) if (r[n] !== undefined && r[n] !== '') return r[n];
  return '';
};
const num = (r: Record<string, string>, ...names: string[]): number => {
  const n = parseFloat(col(r, ...names));
  return Number.isFinite(n) ? n : 0;
};

// --- Nationality → country (id, friendly name, confederation) --------------
interface CountryMeta { id: string; name: string; conf: Confederation }
const COUNTRY_META: Record<string, CountryMeta> = {
  'England': { id: 'GB', name: 'England', conf: 'UEFA' },
  'Spain': { id: 'ES', name: 'Spain', conf: 'UEFA' },
  'Italy': { id: 'IT', name: 'Italy', conf: 'UEFA' },
  'Germany': { id: 'DE', name: 'Germany', conf: 'UEFA' },
  'France': { id: 'FR', name: 'France', conf: 'UEFA' },
  'Netherlands': { id: 'NL', name: 'Netherlands', conf: 'UEFA' },
  'Portugal': { id: 'PT', name: 'Portugal', conf: 'UEFA' },
  'Belgium': { id: 'BE', name: 'Belgium', conf: 'UEFA' },
  'Poland': { id: 'PL', name: 'Poland', conf: 'UEFA' },
  'Türkiye': { id: 'TR', name: 'Turkey', conf: 'UEFA' },
  'Turkey': { id: 'TR', name: 'Turkey', conf: 'UEFA' },
  'Romania': { id: 'RO', name: 'Romania', conf: 'UEFA' },
  'Norway': { id: 'NO', name: 'Norway', conf: 'UEFA' },
  'Sweden': { id: 'SE', name: 'Sweden', conf: 'UEFA' },
  'Denmark': { id: 'DK', name: 'Denmark', conf: 'UEFA' },
  'Austria': { id: 'AT', name: 'Austria', conf: 'UEFA' },
  'Switzerland': { id: 'CH', name: 'Switzerland', conf: 'UEFA' },
  'Scotland': { id: 'SCO', name: 'Scotland', conf: 'UEFA' },
  'Republic of Ireland': { id: 'IE', name: 'Ireland', conf: 'UEFA' },
  'Greece': { id: 'GR', name: 'Greece', conf: 'UEFA' },
  'Czechia': { id: 'CZ', name: 'Czechia', conf: 'UEFA' },
  'Croatia': { id: 'HR', name: 'Croatia', conf: 'UEFA' },
  'Ukraine': { id: 'UA', name: 'Ukraine', conf: 'UEFA' },
  'Hungary': { id: 'HU', name: 'Hungary', conf: 'UEFA' },
  'Finland': { id: 'FI', name: 'Finland', conf: 'UEFA' },
  'Cyprus': { id: 'CY', name: 'Cyprus', conf: 'UEFA' },
  'Azerbaijan': { id: 'AZ', name: 'Azerbaijan', conf: 'UEFA' },
  'United States': { id: 'US', name: 'United States', conf: 'CONCACAF' },
  'Mexico': { id: 'MX', name: 'Mexico', conf: 'CONCACAF' },
  'Canada': { id: 'CA', name: 'Canada', conf: 'CONCACAF' },
  'Argentina': { id: 'AR', name: 'Argentina', conf: 'CONMEBOL' },
  'Brazil': { id: 'BR', name: 'Brazil', conf: 'CONMEBOL' },
  'Chile': { id: 'CL', name: 'Chile', conf: 'CONMEBOL' },
  'Peru': { id: 'PE', name: 'Peru', conf: 'CONMEBOL' },
  'Paraguay': { id: 'PY', name: 'Paraguay', conf: 'CONMEBOL' },
  'Uruguay': { id: 'UY', name: 'Uruguay', conf: 'CONMEBOL' },
  'Bolivia': { id: 'BO', name: 'Bolivia', conf: 'CONMEBOL' },
  'Venezuela': { id: 'VE', name: 'Venezuela', conf: 'CONMEBOL' },
  'Ecuador': { id: 'EC', name: 'Ecuador', conf: 'CONMEBOL' },
  'Colombia': { id: 'CO', name: 'Colombia', conf: 'CONMEBOL' },
  'Saudi Arabia': { id: 'SA', name: 'Saudi Arabia', conf: 'AFC' },
  'China PR': { id: 'CN', name: 'China', conf: 'AFC' },
  'Korea Republic': { id: 'KR', name: 'South Korea', conf: 'AFC' },
  'India': { id: 'IN', name: 'India', conf: 'AFC' },
  'Australia': { id: 'AU', name: 'Australia', conf: 'AFC' },
  'Qatar': { id: 'QA', name: 'Qatar', conf: 'AFC' },
  'United Arab Emirates': { id: 'AE', name: 'UAE', conf: 'AFC' },
  'Japan': { id: 'JP', name: 'Japan', conf: 'AFC' },
};
function countryFor(nat: string): CountryMeta {
  return COUNTRY_META[nat] ?? { id: (nat || 'XX').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'XX', name: nat || 'Unknown', conf: 'UEFA' };
}

// FIFA position token → our Position enum. Generic centre-backs default to RCB;
// the loader refines LCB/RCB by foot at load time.
const POS_MAP: Record<string, Position> = {
  GK: 'GK', CB: 'RCB', LCB: 'LCB', RCB: 'RCB',
  LB: 'LB', LWB: 'LB', RB: 'RB', RWB: 'RB',
  CDM: 'CDM', LDM: 'CDM', RDM: 'CDM',
  CM: 'CM', LCM: 'CM', RCM: 'CM', LM: 'LM', RM: 'RM',
  CAM: 'CAM', LAM: 'CAM', RAM: 'CAM',
  LW: 'LW', RW: 'RW', CF: 'ST', LF: 'ST', RF: 'ST', ST: 'ST', LS: 'ST', RS: 'ST',
};
function mapPositions(raw: string): Position[] {
  const out: Position[] = [];
  for (const tok of raw.split(',').map((t) => t.trim().toUpperCase())) {
    const p = POS_MAP[tok];
    if (p && !out.includes(p)) out.push(p);
  }
  return out.length ? out : ['CM'];
}

function abbrevFor(name: string, used: Set<string>): string {
  const letters = name.replace(/[^A-Za-z ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  let base = letters.split(' ').map((w) => w[0]).join('').slice(0, 3);
  if (base.length < 3) base = letters.replace(/ /g, '').slice(0, 3);
  let abbrev = base.padEnd(3, 'X');
  let i = 1;
  while (used.has(abbrev)) abbrev = (base.slice(0, 2) + i++).toUpperCase();
  used.add(abbrev);
  return abbrev;
}

function mapPlayer(r: Record<string, string>): DatasetPlayer {
  const positions = mapPositions(col(r, 'player_positions', 'positions'));
  const display = col(r, 'short_name', 'long_name');
  const sp = display.split(' ').filter(Boolean);
  return {
    firstName: sp.length > 1 ? sp[0] : '',
    lastName: sp.length > 1 ? sp.slice(1).join(' ') : (sp[0] ?? display),
    nationality: col(r, 'nationality_name', 'nationality') || 'XX',
    bornYear: 2024 - (num(r, 'age') || 24),
    position: positions[0],
    positions,
    foot: /left/i.test(col(r, 'preferred_foot')) ? 'L' : 'R',
    height_cm: num(r, 'height_cm') || 180,
    weight_kg: num(r, 'weight_kg') || 75,
    overall: num(r, 'overall'),
    potential: num(r, 'potential') || num(r, 'overall'),
    value: num(r, 'value_eur'),
    isReal: true,
    dataSourceId: col(r, 'player_id', 'sofifa_id', 'fifa_id') || undefined,
    attributes: {
      technical: {
        crossing: num(r, 'attacking_crossing'), finishing: num(r, 'attacking_finishing'),
        headingAccuracy: num(r, 'attacking_heading_accuracy'), shortPassing: num(r, 'attacking_short_passing'),
        longPassing: num(r, 'skill_long_passing'), volleys: num(r, 'attacking_volleys'),
        dribbling: num(r, 'skill_dribbling'), curve: num(r, 'skill_curve'),
        fkAccuracy: num(r, 'skill_fk_accuracy'), ballControl: num(r, 'skill_ball_control'),
        shotPower: num(r, 'power_shot_power'), longShots: num(r, 'power_long_shots'),
        penalties: num(r, 'mentality_penalties'),
      },
      mental: {
        aggression: num(r, 'mentality_aggression'), interceptions: num(r, 'mentality_interceptions'),
        positioning: num(r, 'mentality_positioning'), vision: num(r, 'mentality_vision'),
        composure: num(r, 'mentality_composure'), reactions: num(r, 'movement_reactions'),
        standingTackle: num(r, 'defending_standing_tackle'), slidingTackle: num(r, 'defending_sliding_tackle'),
        marking: num(r, 'defending_marking_awareness', 'defending_marking', 'defending'),
      },
      physical: {
        acceleration: num(r, 'movement_acceleration'), sprintSpeed: num(r, 'movement_sprint_speed'),
        agility: num(r, 'movement_agility'), balance: num(r, 'movement_balance'),
        jumping: num(r, 'power_jumping'), stamina: num(r, 'power_stamina'), strength: num(r, 'power_strength'),
      },
      goalkeeping: {
        gkDiving: num(r, 'goalkeeping_diving'), gkHandling: num(r, 'goalkeeping_handling'),
        gkKicking: num(r, 'goalkeeping_kicking'), gkPositioning: num(r, 'goalkeeping_positioning'),
        gkReflexes: num(r, 'goalkeeping_reflexes'),
      },
    },
  };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const mode = (xs: string[]) => {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
};

interface RawLeague { name: string; country: CountryMeta; avg: number; clubs: { name: string; rows: Record<string, string>[] }[] }

function main() {
  const csvPath = process.argv[2];
  if (!csvPath) { console.error('Usage: npm run import:dataset -- path/to/players.csv'); process.exit(1); }

  const rows = parseCsv(readFileSync(resolve(csvPath), 'utf8'));
  console.log(`Parsed ${rows.length} player rows.`);

  // 1) Group rows by unique league id.
  const byLeague = new Map<string, Record<string, string>[]>();
  for (const r of rows) {
    const id = col(r, 'league_id', 'league_name');
    if (!id) continue;
    (byLeague.get(id) ?? byLeague.set(id, []).get(id)!).push(r);
  }

  // 2) Build a RawLeague per league: infer country, group clubs, score strength.
  const raw: RawLeague[] = [];
  const skipped: string[] = [];
  for (const lr of byLeague.values()) {
    const name = col(lr[0], 'league_name') || 'League';
    const country = countryFor(mode(lr.map((r) => col(r, 'nationality_name'))));

    const clubMap = new Map<string, Record<string, string>[]>();
    for (const r of lr) {
      const cn = col(r, 'club_name');
      if (!cn) continue;
      (clubMap.get(cn) ?? clubMap.set(cn, []).get(cn)!).push(r);
    }
    const clubs = [...clubMap.entries()]
      .filter(([, rs]) => rs.length >= MIN_PLAYERS_PER_CLUB)
      .map(([cn, rs]) => ({ name: cn, rows: rs }));
    if (clubs.length < MIN_CLUBS_PER_LEAGUE) { skipped.push(`${name} (${country.name}, ${clubs.length} clubs)`); continue; }

    raw.push({ name, country, avg: mean(lr.map((r) => num(r, 'overall'))), clubs });
  }

  // 3) Group leagues into national pyramids; order tiers by squad strength.
  const byCountry = new Map<string, RawLeague[]>();
  for (const l of raw) (byCountry.get(l.country.id) ?? byCountry.set(l.country.id, []).get(l.country.id)!).push(l);

  const out: Dataset = {
    schemaVersion: 1,
    name: 'Real players (imported)',
    description: `Imported from ${csvPath}. Real squads, attributes & ratings; ${raw.length} leagues across ${byCountry.size} nations.`,
    countries: [],
  };

  for (const [, leagues] of byCountry) {
    leagues.sort((a, b) => b.avg - a.avg);
    const n = leagues.length;
    const meta = leagues[0].country;
    const usedAbbrev = new Set<string>();

    const builtLeagues = leagues.map((lg, idx) => {
      const tier = idx + 1;
      const isMls = /major league soccer/i.test(lg.name);

      const promotion = (n === 1 || isMls) ? null : {
        autoPromote: tier === 1 ? 0 : 2,
        autoRelegate: tier === n ? 0 : 3,
        promotionPlayoffSlots: tier === 1 ? 0 : 4,
        relegationPlayoffSlots: 0,
      };

      const datasetClubs: DatasetClub[] = lg.clubs.map((c) => {
        const ranked = c.rows.sort((a, b) => num(b, 'overall') - num(a, 'overall')).slice(0, MAX_PLAYERS_PER_CLUB);
        const rep = Math.round(mean(ranked.slice(0, 18).map((r) => num(r, 'overall'))));
        return {
          name: c.name,
          abbrev: abbrevFor(c.name, usedAbbrev),
          reputation: Math.max(35, Math.min(95, rep)),
          players: ranked.map(mapPlayer),
        };
      });

      return {
        name: lg.name,
        tier,
        format: isMls ? ('conference_playoff' as const) : ('round_robin' as const),
        numClubs: datasetClubs.length,
        rounds: 2,
        tiebreakers: STD_TB,
        promotion,
        conferences: isMls ? { names: ['Eastern', 'Western'], playoffQualifiersPerConference: 7 } : null,
        clubs: datasetClubs,
      };
    });

    out.countries.push({ id: meta.id, name: meta.name, confederation: meta.conf, leagues: builtLeagues });
  }

  out.countries.sort((a, b) => a.name.localeCompare(b.name));

  const totalClubs = out.countries.reduce((s, c) => s + c.leagues.reduce((t, l) => t + l.clubs.length, 0), 0);
  const totalPlayers = out.countries.reduce((s, c) => s + c.leagues.reduce((t, l) => t + l.clubs.reduce((u, cl) => u + (cl.players?.length ?? 0), 0), 0), 0);

  writeFileSync(resolve('src/data/realDataset.json'), JSON.stringify(out));
  console.log(`\nWrote src/data/realDataset.json`);
  console.log(`Nations: ${out.countries.length}  Leagues: ${out.countries.reduce((s, c) => s + c.leagues.length, 0)}  Clubs: ${totalClubs}  Players: ${totalPlayers}\n`);
  for (const c of out.countries) {
    console.log(`  ${c.name.padEnd(16)} ${c.leagues.map((l) => `${l.name} (${l.clubs.length})`).join('  ·  ')}`);
  }
  if (skipped.length) console.log(`\nSkipped ${skipped.length} partial leagues (< ${MIN_CLUBS_PER_LEAGUE} clubs): ${skipped.join('; ')}`);
}

main();
