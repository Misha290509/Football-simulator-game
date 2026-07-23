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

**Tier 1 — Playable vertical slice ("watch your career unfold") — ✅ COMPLETE:**
1. ✅ **Schema + migration + `careerMode`/`playerCareer`** (save/load).
2. ✅ New-game Player path → create avatar (first-team-registered young player
   with academy backstory) → lands on My Player. `buildPlayerWorld` seam lets a
   later picker inherit an existing player.
3. ✅ **Selection model** — `selectionBias` threaded through `simulateMatches` →
   `buildLineupProfile` → `assignXI`; `playerSelectionWeight(trust,status)`;
   `trustFromMatch` drifts trust from ratings.
4. ✅ Player-centric matchday loop — `applyAvatarMatchday` refreshes season
   tallies, drifts trust, captures the last-match summary, raises milestones
   (debut, first goal) + a personal feed; wired into `playDays`.
5. ✅ My Player / Training / Career screens + nav gating (`PLAYER_NAV_GROUPS`,
   `PlayerPlayMenu`, `DashboardGate`). Manager tools hidden in Player mode.

**Tier 2 — Manager relationship & development — ✅ COMPLETE:**
1. ✅ **Objectives** — `playerObjectives.ts`: per-match briefs + season targets,
   evaluated from `playerStats`, feeding trust + morale. Migration v9.
2. ✅ **Trust deepening + squad-status ladder** — big-game weighting + discipline
   in the trust drift; `deriveSquadStatus` (trust+apps+ability+form) drives a
   `YOUTH→…→CAPTAIN` ladder with narrative promotion/demotion arcs + history;
   status feeds the selection bump.
3. ✅ **Conversations & promises** — `playerConversations.ts`: choice-driven
   role meeting / post-drop dialogs + player-initiated "ask for minutes"; some
   choices lock a promise that's kept/broken at a deadline.
4. ✅ **Positional rival** — best same-position teammate, shirt-battle widget.
5. ✅ **Traits & personality** — reuses the existing attribute-derived
   `traitsOf`/`traitSimBoost` (already deterministic in the sim); detects newly
   earned traits, shows progress to the next, + personality panel.
6. ✅ **Adversity** — injury arcs, match sharpness (drops on injury, recovers),
   a confidence/slump dimension nudging form (always escapable).
7. ✅ **International** — first call-up on threshold; caps/goals + tournament
   squads accrue at the rollover.

All in `playerProgression.ts` (orchestrated per advance) + the season rollover.
Migration v10 backfills Tier-2 fields on existing Player saves.

**Tier 3 — Interactive key-moments match layer — ✅ COMPLETE:**
- Resumable, deterministic engine (`engine/interactiveMatch.ts`) realised as a
  REPLAY function: `runInteractiveMatch(input, decisions)` re-runs from the seed
  applying the logged decisions, pausing at the first undecided `KeyMoment`. Pure
  fn of `(seed, decisionLog)` → replays/save-reload/tests all bit-reproducible;
  moment RNG drawn only after the decision. Only the avatar's match uses it —
  every other fixture batch-sims unchanged via the worker.
- Position-keyed moment libraries (`game/momentLibrary.ts`) — GK/CB/FB/CM/WIDE/ST
  + set pieces; a keeper never gets a finishing moment. 4–10 moments/match by
  role, minutes, status, frequency setting.
- Resolution model: attributes rule, decision modifies, traits + context
  (fatigue/pressure/confidence) bite; risk/reward; failure is interesting
  (cards, spurned chances). Outcomes write real `playerStats` → records/awards.
- Manager game plan + adherence → Tier-2 trust (defiance forgiven when it works);
  half-time talk.
- Input modes/timers/auto-resolve at every level + settings; migration v11.
- Store flow: `beginPlayerMatch`/`decideMoment`/`autoResolve*`/`finishPlayerMatch`
  fold the interactive result into `playDays` (extraPlayed), so aftermath +
  other fixtures run exactly as before.

**Tier 4 — Off-pitch life & narrative — ✅ COMPLETE:**
All event-driven through the inbox, deterministic under the seed, and always
skippable/automatable — a football-only player hires an agent, ticks
auto-manage, and ignores every menu with a coherent career. Engine in
`game/playerOffPitch.ts`, folded into `playDays` via `advanceOffPitch`.
- **Agent** — hireable roster (negotiation/network/mediaSavvy/commission);
  sweetens terms + widens interest; an auto-negotiate floor (min wage/role) is
  the escape hatch that signs qualifying offers for you.
- **Inverted transfer market** — clubs earn interest from real performance
  (`marketHeat`); an interest board; sagas play out over weeks in the inbox
  (RUMOUR → BID → PERSONAL_TERMS → move / collapse), paced by each saga's clock.
- **Contracts** — renewals in the final year; a role promise from a new club
  becomes a Tier-2 promise to keep; transfer requests (relationship hit, suitors
  circle); release clauses.
- **Loans** — buried youngsters get game-time loan offers; the spell returns the
  avatar to his parent club at the rollover.
- **Media/press** — event-driven prompts (hat-trick, red card, thrashing…);
  choices move fan rating / trust / following / controversy → a `persona`.
- **Sponsorships** — following crosses LOCAL/NATIONAL/GLOBAL tiers → tiered
  offers; expired deals drop at the rollover.
- **Lifestyle** — a set-and-forget weekly routine (auto-managed by default) that
  drifts personality + controversy; lifetime `careerEarnings` (wage less agent
  commission + sponsorships).
Migration v12 backfills every field on existing Player saves; MANAGER untouched.

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
