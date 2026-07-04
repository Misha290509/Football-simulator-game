# Football Simulator — Code Guide

A practical map of the codebase so you can find and change things confidently.
It focuses on **what each part does** and **where to tune common behaviours**.

> Golden rule of this project: the **simulation is deterministic**. Anything that
> affects match results is driven by a seeded RNG (`src/engine/rng.ts`). If you
> change how many times the RNG is called in a hot path, *every* downstream
> result shifts. Prefer changes that don't add/remove RNG calls, or expect to
> re-baseline tests.

---

## 1. Big picture — how the folders fit together

```
src/
  types/     Plain data shapes (no logic). The vocabulary of the game.
  engine/    Pure, deterministic simulation. No React, no storage. Unit-tested.
  game/      Orchestration: season rollover, awards, transfers, calendar, AI.
  state/     One Zustand store (store.ts) — the bridge between engine/game and UI.
  data/      Datasets (clubs, real players, names, nations) + loaders.
  db/        IndexedDB persistence (Dexie) + save migrations.
  ui/        React screens (routes/) and shared components/.
```

Data flows **types → engine → game → state → ui**. The UI never runs the sim
directly; it calls **store actions**, which call **game/engine** functions, then
write results back into the store (and IndexedDB).

Two processes worth knowing:
- **Match simulation** runs in a Web Worker (`src/engine/worker/`, `simClient.ts`)
  for the batch "simulate these fixtures" path, with a synchronous fallback used
  by tests.
- **Live match** (`engine/liveMatch.ts`) is a separate, tick-by-tick engine for
  the interactive match screen.

---

## 2. The data model (`src/types/`)

Read these first — everything else is operations on these shapes.

- **`player.ts`** — `Player` (attributes, hidden traits, contract, stats, awards,
  `training`, `ego`), `SeasonStats` (per-season/per-competition tallies incl.
  `saves`), `AwardRef` (an honour stamped on a player), `TrainingPlan`.
- **`attributes.ts`** — the `Position` union (the 13 FIFA positions), `POSITION_GROUP`
  (GK/DEF/MID/ATT buckets), `MIRROR_POSITION` (left↔right pairs for the wrong-side
  penalty), the attribute groups, and `translateLegacyPosition()` (old→new codes).
- **`club.ts`** — `Club` (finances, stadium, staff, tactics, formation, traits).
- **`staff.ts`** — `Staff` (role, rating, wage, `expiresYear`), `StaffRole`, `Facilities`.
- **`competition.ts` / `league.ts`** — competitions, standings, and the big
  **`SaveGame`** (a.k.a. `SaveMeta`) blob that holds the entire save: seasons,
  competitions, history, awards, `pendingGala`, `staffMarket`, `pendingArrivals`,
  `aiManagers`, `managerStyle`, etc. Almost every new feature adds a field here.
- **`match.ts`** — `Match`, `PlayerMatchStat` (incl. `saves`), `MatchEvent`,
  `LineupProfile` (the serializable team-strength summary the sim consumes).
- **`continental.ts` / `cup.ts`** — European competitions and domestic cups state.

---

## 3. The engine (`src/engine/`) — pure simulation

All deterministic, all unit-tested in `engine/__tests__/`.

### Ratings & generation
- **`ratings.ts`** — `overallAt(attrs, position)` computes an OVR for a player at a
  given position from per-position **weight tables** (`WEIGHTS`). *To make a
  position value different attributes, edit its weight table here.*
- **`generator.ts`** — creates fictional players/squads. `SQUAD_TEMPLATE` sets how
  many of each position a generated club gets; `OUTFIELD` is the pool for
  secondary positions; `reputationToAbility()` maps club reputation → target
  quality. *Tune squad shape / strength here.*

### Match sim
- **`match.ts`** — the batch match engine. `simulateSide()` turns team strength into
  shots → goals via xG-style rolls. **Goalkeeper saves** are attributed here
  (`gs.saves`). *Tune scoring rates, save frequency, home advantage here.*
- **`lineup.ts`** — turns a squad into a `LineupProfile`:
  - `FORMATIONS` — the back-four-only formation shapes (GK, LB, LCB, RCB, RB…).
  - `slotPenalty()` / `effectiveOverall()` — the **wrong-position penalty** (CB on
    his wrong side −1; full-backs/wingers/wide-mids inverted −4; fully out of role
    more). *Tune positional flexibility here.*
  - `buildLineupProfile()` — folds in **match condition** (fitness/morale/form),
    **ego** (scorer vs creator split), **chemistry**, tactics and set-piece takers.
    The `condition()` formula is the "how tired/sharp is he" knob.
- **`liveMatch.ts`** — the interactive tick engine (`createLiveMatch`, `tickLiveMatch`,
  `applyManagerChange`, team talks, shootouts). Stores each side's `formation` for
  the pitch view.

### Player state over time
- **`progression.ts`** — per-matchday aftermath: **fitness/fatigue recovery**,
  injuries, cards/suspensions, form/morale shifts. *This is where "players tire /
  recover" is tuned* (the `rng.int(...)` fitness/fatigue numbers).
- **`development.ts`** — season-end aging & growth. `performanceScore()` rewards
  playing well; `applyDelta()` applies growth, biased by **training focus**
  (`FOCUS_KEYS`). `estimateValue()` is the market-value curve. `shouldRetire()`.
- **`morale.ts`** — team-talk tones (`TONE_LABEL`, incl. the FURIOUS "Aggressive"
  tone), player interactions (Praise/Reassure/Warn) and `egoOf()` (ego default).

### Squad chemistry & scouting
- **`chemistry.ts`** — `squadChemistry()` scores the dressing room 0–100 from
  nationality blocs, tenure, morale, big-ego friction and wage envy; `chemistryMod()`
  is the ±4% team multiplier fed into `buildLineupProfile`. *Tune the factors here.*
- **`marketScout.ts`** — the fog-of-war-free market read. `marketView()` returns an
  **estimate** for any player, skewed by your department (`departmentEstimate`,
  `clubScoutRating`); own/elite players are exact; a dispatched scout gives a
  sharper `buildScoutReport`. *Tune scouting accuracy here.*
- **`staff.ts`** — backroom staff: `staffWage(rating, role)` (role-scaled wages),
  `evaluateStaffTerms()` (accept/reject contract offers), `generateStaffPool()`,
  and the multipliers `coachingFactor` / `scoutingRate` / `physioFactor` that feed
  development, scouting and injuries.

---

## 4. The game layer (`src/game/`) — orchestration

This is where per-season and per-day logic lives, wiring engine pieces together.

### The season loop
- **`season.ts`** — **`resolveAndRollover()`** is the heart of the game: it takes a
  finished season and produces the next one. In order it: computes final
  standings → resolves cups/continental/awards → promotes/relegates → runs
  player development & retirement → youth intake → international tournaments →
  **individual awards** → **rival-manager churn** → **AI summer transfers** →
  finances/FFP → builds next season's fixtures. Returns a big `RolloverResult`.
  *If you want something to happen "each season", it goes here.*
- **`newGame.ts`** — builds a fresh save (loads a dataset, schedules season 1).
- **`schedule.ts`** (engine) & **`calendar.ts`** (game) — the abstract fixture
  scheduler. League round *r* sits on **day index `r × 3`**; continental/cup games
  take the days between (the "stride"). These are *abstract* day indices.

### Real dates & transfer windows
- **`gameCalendar.ts`** — maps the abstract day indices onto a **real Aug→May
  calendar**. `matchDate()` snaps each fixture to a real weekday by competition
  (league weekends, CL Tue/Wed, EL/Conf Thu, cups midweek). `isWindowOpen()` /
  `windowOnDate()` gate the **transfer windows** (summer = August, winter =
  January). `currentDate()` is "today". *All date/window logic lives here.*

### Transfers
- **`transfers.ts`** — core transfer maths: `askingPrice`, `wageDemand`,
  `applyTransfer` (the immutable "move player + move money" function),
  `runAiTransferWindow` (contract expiries + free-agent signings at rollover).
- **`feeNegotiation.ts` / `contracts.ts`** — fee haggling and player contract terms
  (used by the signing modal).
- **`aiTransfers.ts`** — **AI-to-AI market**. `runAiToAiTransfers()` has each AI club
  find its weakest position group and buy an upgrade within budget. Runs summer
  (rollover) and winter (January). *Tune AI activity / deal volume here.*

### Awards & honours
- **`awards.ts`** — **`computeSeasonAwards()`** computes every individual award from
  the season's matches + international tournaments: per-league & global Golden
  Boot, Playmaker, Player of the Season, confederation/UEFA/continental best,
  Team of the Season (World XI), plus the "gala" set (Ballon d'Or, Kopa, Yashin,
  Puskás). *Add/retune awards here.*
- **`gala.ts`** — the deferred autumn gala (Ballon d'Or et al.) — schedules it for
  late October of the following season (`scheduleGala`) and builds its news.
- **`awardMeta.ts`** — display metadata (emoji + label) and helpers
  (`isTeamTrophy`, `isIndividualAward`) used by the UI trophy cabinet & Records.

### The living world
- **`aiManagers.ts`** — persistent named managers for AI clubs (`aiManagerOf`),
  season-end churn (sackings/appointments, `rolloverAiManagers`), and **your**
  tactical identity (`recordStyleResult` → `styleTags`).
- **`internationals.ts`** — World Cup / Euros / Copa América simulation at rollover.
- **`board.ts` / `boardroom.ts`** — season objectives, job security, board requests.
- **`competitions.ts` / `continental/` / `cups/`** — resolving league/European/cup
  competitions and their awards.
- **`clubTraits.ts` / `rivalries.ts` / `narratives.ts` / `achievements.ts`** — club
  DNA, derbies, dynamic news, and milestone achievements.

---

## 5. The state store (`src/state/store.ts`)

One big Zustand store. It's the API the UI uses. Two things to understand:

1. **Actions** — every user action is a method here (e.g. `completeSigning`,
   `hireStaff`, `fireStaff`, `setTraining`, `interactWithPlayer`,
   `refreshStaffMarket`, `beginLiveMatch`). They read `get()`, call game/engine
   functions, then `set(...)` the new state and persist to IndexedDB.

2. **`playDays(from, to)`** — the day-advance loop (near the bottom). When you
   advance time it: simulates the fixtures in that range, applies matchday
   aftermath (via `progression.ts`), then runs the "things that happen as time
   passes": scout reports, AI offers, **position retraining**, **transfer-window
   opening** (fulfilling pre-agreed `pendingArrivals`, running the AI winter
   market), the **awards gala**, **manager style** tracking, press conferences,
   unhappiness/transfer requests. *If something should happen "as days pass", it
   goes in `playDays`.*

`transferWindow()` is a store getter the UI uses to know if the window is open,
which one, and when it reopens.

---

## 6. The UI (`src/ui/`)

- **`App.tsx`** — the router. Every screen is lazy-loaded (code-split).
- **`routes/`** — one file per screen. Notables you've touched:
  - `Dashboard.tsx` — home: date/window readout, board objective, next fixture
    (with opposition + rival manager), season review, key players.
  - `Tactics.tsx` — formation pitch (rendered from the manager's perspective:
    attack at top, GK at bottom), drag-and-drop XI, set-piece takers.
  - `PlayerProfile.tsx` — the big player page: fog-aware header, career record,
    **trophy cabinet**, **training panel**, attributes (own/elite only), dev chart.
  - `TransferMarket.tsx` — the market: rich filters, window banner, pending
    arrivals, signing/scout/loan modals.
  - `Club.tsx` — facilities, training focus, and the **backroom staff** UI
    (grouped by role, fire/negotiate, window-gated market with 3 refreshes).
  - `LiveMatch.tsx` — the interactive match, with the 2D pitch and commentary.
  - `Records.tsx` / `Manager.tsx` / `Nations.tsx` / `Fixtures.tsx` — records &
    awards, manager identity, national teams, fixture browser.
- **`components/`** — shared bits: `PitchView.tsx` (the 2D SVG pitch),
  `DataTable.tsx`, `AttributeRadar.tsx`, `PlayMenu.tsx` (the advance controls),
  `Rating.tsx`, etc.
- **`format.ts`** — formatting helpers (money, wage, age, names).

---

## 7. Saves & migrations (`src/db/`)

- **`db.ts`** — Dexie schema + `putPlayers/putClubs/persistMeta`.
- **`migrations.ts`** — **crucial** for changing shapes on existing saves.
  `CURRENT_SCHEMA_VERSION` + a `migrateToVN()` per bump. Examples already there:
  v5 translated positions to the FIFA codes; v6 recomputed staff wages and seeded
  the staff market. **If you add/rename a field that old saves need, write a
  migration** — or gate the field with `?? default` so old saves don't crash.

---

## 8. "How do I change X?" — quick cookbook

| Want to change… | Edit… |
|---|---|
| How tired players get / bench recovery | `engine/progression.ts` (the fitness/fatigue `rng.int` lines) |
| Goal scoring rates, save frequency | `engine/match.ts` (`shotsLambda`, `pGoal`, save branch) |
| What a position values (OVR weights) | `engine/ratings.ts` (`WEIGHTS`) |
| Wrong-position penalty size | `engine/lineup.ts` (`slotPenalty`) |
| Formations available | `engine/lineup.ts` (`FORMATIONS`) |
| Player growth / training effect | `engine/development.ts` (`performanceScore`, `applyDelta`, `FOCUS_KEYS`) |
| Chemistry factors & impact | `engine/chemistry.ts` |
| Scouting accuracy / market noise | `engine/marketScout.ts` (`departmentEstimate`) |
| Staff wages / hire acceptance | `engine/staff.ts` (`staffWage`, `evaluateStaffTerms`) |
| Transfer-window dates | `game/gameCalendar.ts` (`windowOnDate`) |
| Match dates / weekdays | `game/gameCalendar.ts` (`matchDate`, `KIND_WEEKDAYS`) |
| AI transfer activity | `game/aiTransfers.ts` |
| Which awards exist / winners | `game/awards.ts` |
| Season-end sequence | `game/season.ts` (`resolveAndRollover`) |
| Things that happen as days pass | `state/store.ts` (`playDays`) |
| A new per-save field | add to `types/league.ts` `SaveGame`, default-guard it, add a migration in `db/migrations.ts` |

---

## 9. Workflow tips

- **Run the tests**: `npx vitest run` (there are ~210). They guard the sim's
  determinism — if you change a hot RNG path and tests fail on *values*, that's
  the cascade warning, not necessarily a bug.
- **Typecheck**: `npx tsc --noEmit`. **Build**: `npm run build`.
- Start from a **types** file to learn a system, then follow it into `engine/`
  (pure logic), then `game/` (orchestration), then `state/store.ts` (wiring), then
  the `ui/` screen. That top-down path answers "what does this do" fastest.
