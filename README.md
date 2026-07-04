# Football GM

A browser-based, single-player **football (soccer) management simulator**, in the
spirit of Basketball GM and Football Sporting Director. You play a **Sporting
Director / General Manager**: squad building, recruitment, contracts, finances,
and high-level tactics — not minute-by-minute touchline control.

Everything runs **locally in the browser** — no backend, no login. Saves live in
IndexedDB; leagues export/import as JSON.

> **Current status: Milestones M0–M7 complete — feature-complete per the spec.**
> Deterministic engine core, swappable dataset loader + fallback generator, and
> a full career loop across **all eleven nations**: a hybrid (xG-style) match
> engine with minute-by-minute timelines, configurable standings/tiebreakers,
> promotion/relegation & play-offs, the MLS conference/playoff format, the
> granular "Play" menu, season rollover with aging/development/injuries/youth,
> finances + a transfer market with AI, scouting (uncertainty ranges), staff &
> facilities, board objectives & job security, domestic cups, confederation
> continental competitions, awards, Hall of Fame and a history archive — plus a
> God Mode sandbox, lossless JSON export/import, and an offline PWA. Match
> simulation runs in a Web Worker.

## Tech stack (locked)

React + TypeScript + Vite · Tailwind · Zustand · Dexie/IndexedDB · seeded PRNG
(mulberry32) for determinism · Recharts · Web Worker (simulation, from M2) ·
PWA + JSON export/import (from M7).

## Architecture

```
UI (React components, routes, data tables)
  ▲  Game State Store (Zustand)            src/state
  ▲  Game Logic / Orchestration            src/game
  ▲  Simulation Engine (pure, deterministic) src/engine   ← no DOM, no I/O
  ▲  Data Access Layer (Dexie repositories) src/db
  ▲  Persistence (IndexedDB) + Dataset Loader src/data
```

The simulation engine (`src/engine`) is **pure and deterministic**: same seed +
inputs → identical results. All country/league/competition rules
(`src/types/competition.ts`) are **data**, not code branches — pro/rel slots,
playoff flags, MLS conferences, and tiebreakers are per-competition config.

### Key directories

| Path | Purpose |
|---|---|
| `src/types` | Core domain types incl. the versioned **dataset schema** |
| `src/engine` | Seeded RNG, per-position OVR ratings, fallback generator, balance harness |
| `src/data` | Dataset loader + the bundled **England** structural dataset |
| `src/db` | Dexie schema + save/load repositories |
| `src/state` | Zustand store |
| `src/game` | New-game orchestration |
| `src/ui` | React shell, routes, and reusable data-dense components |

## Run it

```bash
npm install
npm run dev        # start the dev server (Vite prints the local URL)
```

Then: **New Game → manager name → pick a country &amp; club (any of the eleven
nations) → Start Career**. Explore the **Squad**, **Transfers** (bid/negotiate),
**Scouting** (assign targets, watch ranges tighten), **Club** (staff, facilities,
training), **Finances**, **History** (honours &amp; Hall of Fame) and **God Mode**.

Use the **Play menu** in the header (or press **n**) to *Advance Matchday*,
fast-forward *To Next Match* or *To Season End*. Standings update live, click any
played match for its **event timeline + player ratings**, then *Start Next Season*
to trigger promotion/relegation, play-offs, cups, continental finals, awards,
development, retirements and youth intake. Saves **export/import** as JSON from
the main menu, and the app works **offline** as an installable PWA.

Other commands:

```bash
npm run build         # type-check + production build
npm run test          # unit tests (RNG determinism, ratings, generator)
npm run sim:harness   # headless world-generation balance report
```

## Play with 100% real players

The game ships with a generated world, but it can run on **real players with real
attributes**. The data layer uses the industry-standard **34-attribute model**
(crossing, finishing, short/long passing, dribbling, ball control, interceptions,
standing/sliding tackle, marking, acceleration, sprint speed, GK diving/handling/
reflexes, …), so a real dataset maps 1:1.

1. Download a real-player CSV — e.g. an **EA Sports FC / FIFA "complete player
   dataset"** (`players_*.csv`, freely available on Kaggle; SoFIFA-derived).
2. Import it:
   ```bash
   npm run import:dataset -- path/to/players_24.csv
   ```
   This writes `src/data/realDataset.json`, filtered to the eleven leagues, with
   real squads, attributes, overalls, positions, ages and nationalities.
   Competition **rules** (pro/rel, playoffs, conferences, tiebreakers) still come
   from the structural dataset.
3. Run the game — **New Game** now shows “✓ real players” and loads them
   automatically. (No file = it falls back to the generated world.)

The importer prints any league names it couldn't match; tweak `LEAGUE_MAP` in
`scripts/importDataset.ts` to fit your CSV's exact `league_name` values.

## Real player data & licensing

Real players are the intended default, loaded from a **swappable, external
dataset** that conforms to `src/types/dataset.ts`. **This repo ships no
protected data.** The bundled England dataset contains only structural facts
(club/stadium names, reputations) and **generates player attributes** via the
fallback generator. Real player names, club crests, and league branding are
frequently protected — you are responsible for sourcing an appropriately
licensed or open dataset to populate real players. Crests are generic and
recolorable, never copyrighted logos.

## Determinism

A career is seeded once at New Game. The same seed reproduces the same world.
The RNG (`src/engine/rng.ts`) is threaded explicitly through generation; from
M2, each match also carries its own derived seed for reproducible replay.

## Roadmap

- **M0** ✅ Scaffolding, types, RNG, Dexie save/load, dataset loader + generator.
- **M1** ✅ New Game wizard, England dataset, Squad view, Player Profile (OVR/POT).
- **M2** Match engine + event timeline, schedule, standings + pro/rel, "Play" menu, season rollover.
- **M3** Aging, development, form/fitness/morale, injuries/suspensions, youth intake.
- **M4** ✅ Finances, transfer market + AI, negotiations, contracts, windows.
- **M5** ✅ Scouting, youth academy, staff, training, facilities, board objectives.
- **M6** ✅ Other ten countries + second tiers, domestic cups, confederation-correct continental comps, MLS/playoff rule flags, awards & history.
- **M7** ✅ Charts, PWA/offline, export/import, God Mode, balance harness, performance, a11y.
