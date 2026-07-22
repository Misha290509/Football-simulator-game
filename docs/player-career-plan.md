# Player Career Mode — Implementation Plan

A deep be-a-player career layered on top of the existing manager simulation. The
world keeps simulating exactly as it does today; the difference is **whose eyes
you look through** plus a layer of personal systems. Manager mode is never
broken — everything here is additive and gated behind a save-level mode flag.

## Grounding — confirmed seams (current code)

- **Selection chokepoint:** every club's XI for every match is built in
  `buildLineupProfile(clubId, players, formation, opts)` (`src/engine/lineup.ts`),
  called from `buildProfiles` in `src/engine/simClient.ts`. It runs
  `selectXI(players, formation, opts)` and folds match condition
  (fitness/form/morale) into effective ability. This single hook is the whole
  "am I in the XI?" mechanic — Tier 1 biases it for the manager's club only.
- **Save shape:** `SaveMeta extends SaveGame` (`src/db/db.ts`). New optional
  fields on `SaveGame` (`src/types/league.ts`) are absent-safe; old saves are
  untouched.
- **Migrations:** `migrateSave(meta, clubs, players)` in `src/db/migrations.ts`,
  keyed off `meta.schemaVersion` vs `CURRENT_SCHEMA_VERSION`. Runs on load
  (`store.load`) and re-persists when changed. `careerMode` backfills to
  `'MANAGER'`.
- **Avatar is a normal `Player`** in `world.players`, so it develops
  (`developPlayer`), ages, is rated, scores, and shows up in stats / records /
  Golden-Boot race / potential-decay automatically.
- **Match output:** `Match.playerStats: PlayerMatchStat[]` already carries the
  avatar's per-match rating, minutes, goals, assists, cards.
- **Reuse (~70%):** `Player` model, `developPlayer`, `simulateMatches` /
  `match.ts`, `TrainingPlan` (focus + retraining), transfers/contracts
  (inverted — clubs bid for you), `installNewGameAcademies` (seeds 16-yo
  prospects), internationals, awards, records, storyline engine, morale / form /
  fitness.

Re-confirm signatures before each tier (code may drift); keep the app runnable
after every tier; never break MANAGER mode; everything deterministic under a
fixed seed.

## Data model (additive on `SaveGame`)

```ts
careerMode?: 'MANAGER' | 'PLAYER';   // absent ⇒ MANAGER
playerCareer?: PlayerCareer;         // present only in PLAYER mode
```

`PlayerCareer` (see `src/types/playerCareer.ts`): avatar `playerId`, `origin`,
`archetype`; `managerTrust`, `status` ladder, `clubRelationship`, `fanRating`,
`following`; season HUD tallies; `objectives`, `traits`, `personality`;
`agentId`, `sponsorships`, `international`; `milestones` timeline;
`seasonHistory`. Tier 1 populates only the core (playerId/origin/archetype,
trust, status, season tallies, milestones); later tiers fill the rest.

## Build order (tiered — vertical slice first)

**Tier 1 — Playable vertical slice ("watch your career unfold"):**
1. **Schema + migration + `careerMode`/`playerCareer`** (save/load, no UI). ← *first deliverable; pause for review.*
2. New-game Player path → create/inherit avatar → stub dashboard.
3. **Selection model** (`playerSelectionWeight` bias in `buildLineupProfile` +
   trust-from-ratings). The heart — done early.
4. Player-centric season loop + personal match summary (tallies, milestones,
   feed each matchday) — reuses `advanceMatchday`, reads `playerStats`.
5. My Player / Training / Career screens + nav gating. Polish, tests,
   determinism check.

**Tier 2 — Manager relationship & development:** squad-status ladder, team
talks/conversations, per-match objectives, positional rival, traits/perks,
injuries & form slumps, international call-ups.

**Tier 3 — Interactive match layer:** key-moment decisions + manager in-match
instructions; position-specific moment sets.

**Tier 4 — Off-pitch life & narrative:** agent, inverted contracts/transfers +
role promises, loans out for game time, sponsorships, media/press,
social/following, lifestyle time-budget, storyline-engine integration.

**Tier 5 — Legacy & endgame:** dream-club moves, trophies, Ballon-d'Or,
retirement + testimonial + Hall of Fame, optional player→manager transition
(continue the same save in MANAGER mode).

## Origin & creation (Tier 1–2)

Support all three, default to academy:
- **Academy (default):** spawn as a real 16-yo in a club's academy via
  `installNewGameAcademies`; earn your way up.
- **Existing player:** inherit a young pro (reuse club/dataset pickers).
- **Create-a-player:** name, nationality, DOB, position(s), foot, physique,
  avatar seed, archetype (Academy Graduate / Prodigy / Late Bloomer / Street
  Baller / Journeyman) seeding attribute bias + narrative flavor.

## Screens (dark, data-dense; nav-gated by mode)

My Player (dashboard) · Match Summary · Training · Career/Timeline ·
Off-pitch (Tier 4) · reused read-only (Standings, Fixtures, Squad, Player
Profile, Records). Manager-only screens (Tactics, Transfers-as-buyer, Finances,
Scouting) hidden when `careerMode === 'PLAYER'`.

## Acceptance criteria

- MANAGER mode unaffected; existing saves load and migrate cleanly.
- A Player save runs a full season through the existing engine; the avatar
  appears correctly in stats, records, awards, Golden-Boot race.
- Selection is a real battle: form/fitness/trust/role move me between starting,
  benched, and dropped; I can lose and regain my place.
- Deterministic under a fixed seed (selection, development, injuries,
  storylines, objectives).
- Each tier independently testable (vitest + browser harness); app stays
  runnable.
