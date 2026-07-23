# Football GM — Audit & Feature Backlog

> Written after reading the codebase (not the specs). Where a system is thin, it
> says so. Insertion points name real files/functions/models. Nothing proposed
> in §3 already exists — §1 is what guarantees that.

---

## 1. Current State (what actually exists)

**Stack & architecture.** React + TypeScript + Vite; Zustand store
(`src/state/store.ts`, ~3.8k lines) over Dexie/IndexedDB; lazy-loaded routes.
Clean layering: `types/` → `engine/` (pure, deterministic) → `game/`
(orchestration) → `state/store.ts` → `ui/`. One seeded RNG everywhere
(`engine/rng.ts`, mulberry32). Code is genuinely clean — **zero** `TODO/FIXME/HACK`
markers in `src/`.

**Data layer.** Real dataset (`src/data/realDataset.json`, 14 MB): **26 nations,
34 leagues, 607 clubs, 16,575 real players** with full attributes. England has 4
tiers, Germany 3, France/Italy/Spain 2, the rest 1 (synthesised 2nd tiers where
needed). Save = a single meta blob + club/player/match rows in IndexedDB;
migrations are additive and disciplined (`db/migrations.ts`, `CURRENT_SCHEMA_VERSION = 13`).

**Screens (31 routes).** MainMenu, NewGame, Dashboard, Squad, Tactics,
PlayerProfile, Standings, Fixtures, MatchDetail, TransferMarket, Contracts,
Scouting, Club, Academy, LiveMatch (2D), Manager, Compare, Nations, Continental,
Records, Finances, History, Sandbox (God Mode), Inbox — plus the full
player-career set (My Player, Training, Career, Off-Pitch, Legacy, Retrospective,
InteractiveMatch).

**Systems — status by honesty:**

| System | State | Notes |
|---|---|---|
| Match sim (`engine/match.ts`) | **Complete** | Chance-based (xG), Poisson shots, per-player ratings/stats, subs, cards, saves, event timeline. Only 286 lines — tight. |
| Live match 2D (`engine/liveMatch.ts`) | **Complete** | Phases, momentum meter, manual penalty shootout with aim. |
| Interactive match (player Tier 3) | **Complete** | Replay-based key moments. |
| **Tactics** | **Shallow** | `Tactics = { defensive: DEEP/BALANCED/PRESSING, offensive: POSSESSION/COUNTER/DIRECT }` → two small multipliers. **No player roles, no familiarity, no formation counters, no set-piece routines, no sliders.** |
| Leagues + promotion/relegation | **Complete** | Rule-driven (`Competition.promotion`), promotion playoffs, MLS `conference_playoff`. |
| Domestic cups (`game/cups/domesticCups.ts`) | **Partial/generic** | Every country gets a generic "Cup" + "League Cup" + "Super Cup". **Not real-named, not real-format.** |
| Continental (`game/continental/`) | **UEFA-only** | CL/EL/Conference (Swiss phase) + FIFA Club World Cup (every 4y). **No Libertadores/Sudamericana, AFC CL, CONCACAF** — even though Brazil, Argentina, Saudi, Korea, China, USA are all in the dataset. |
| Internationals (`game/internationals.ts`) | **Partial** | World Cup (48), Euros, Copa América (group→knockout). **No qualifying campaigns, no AFCON/Asian Cup/Gold Cup, no youth internationals.** International management (`nationalJob`) exists. |
| Transfers | **Good** | AI-to-AI market, bidding, fee negotiation (instalments, sell-on, add-ons), Bosman frees, contract-expiry hub, loans (wage split, option-to-buy), deadline handling. **No swaps, buy-backs, matching clauses, rumour mill, live deadline feed, agent fees.** |
| Contracts | **Complete** | Renewals, expiry, wage demands, unhappiness. |
| Finances | **Shallow** | Reputation-driven budgets; season gate/broadcast/prize; FFP (strikes/embargo/points/forced sale). Finances screen = balance chart + last-season summary. **No sponsorship negotiation, debt, TV-by-position, ticket pricing, takeovers.** |
| Scouting | **Good** | Fog-of-war (`engine/scouting.ts` knowledge→revealed ranges), assignments, reports, youth scouting. |
| Staff | **Good** | Market, roles, coaching/physio factors, refreshable pool. |
| Youth / Academy | **Deep** | Intake, age groups, development, dual registration, youth competitions, facilities, mentoring, flywheel. |
| Development / aging | **Complete** | `developPlayer` (physical-first decline), `shouldRetire`, potential as a living ceiling. |
| Injuries | **Complete** | Arcs, match sharpness, travel fatigue on continental trips (`engine/progression.ts`). |
| Awards | **Complete** | League/global Golden Boot, POTY, Ballon d'Or gala, TOTS, Puskás, Yashin, Kopa, WC awards. |
| Records / History | **Partial** | Golden-Boot races, career scorers, appearances, achievements, roll of honour, Hall of Fame. **Few record *types*** (no "youngest to X", most-in-a-season, unbeaten runs, club records). |
| Storylines | **Good** | Wonderkid, nemesis, saga, objective-memory; hardcoded derby pairs (`game/rivalries.ts`). |
| Board | **Partial** | Single confidence meter + objectives + sacking. **No separate fan confidence.** |
| Save/God-Mode | **Complete** | Sandbox: add funds, heal, boost, force signings. |
| **Player Career (Tiers 1–5)** | **Complete** | Selection, trust, status ladder, conversations, objectives, rival, traits, injuries, internationals; interactive match; off-pitch (agent, inverted transfers, contracts, loans, media, sponsors, lifestyle); legacy & endgame (ambitions, decline, retirement, testimonial, HoF, player→manager). |

**Tests.** 68 test files, **362 tests** — strong engine/game coverage; lighter on
UI routes.

**Modes / replay.** MANAGER + PLAYER careers; 4 challenge scenarios; God Mode.
Fixed `START_YEAR`. **No fantasy draft, no expansion clubs, no custom
creation, no start-in-any-season, no auto-play-multiple-seasons.**

---

## 2. Health Report (fix-first candidates)

**Performance — the one real structural risk.** The store holds **every match
ever played** in memory (`matches: Record<string, Match>`), and `loadSave` reads
all match rows up front (`db/db.ts`). `currentSeasonMatches()` filters that whole
set in-memory on each call. A 20-season save = ~200k+ match records (each with an
event timeline + 22 `playerStats`) resident in RAM and re-hydrated on every load.
Load time and memory grow without bound. **This should be addressed before
building anything that adds per-match data (shot maps, game logs, xG history).**
Fix: archive old-season match *detail* (keep result + `playerStats` aggregates,
drop `events`) or lazy-load matches by season.

**Determinism — one leak.** `store.ts:1974` mixes `Math.random()` into the
staff-market refresh seed (`meta.seed ^ Math.floor(Math.random()*…)`). It's a
deliberate "fresh pool per click," but it means staff refreshes aren't
reproducible from the save seed. Everything else is clean — `Date.now()` appears
only in ID minting (`generator.ts`, `staff.ts`) and the new-game seed fallback,
none of which affect match/season outcomes. Fix: seed off `(seed ^ day ^ used)`.

**Save/migration.** Healthy. The additive-migration discipline (v2→v13, each
guarded, `careerMode`-scoped) is a real asset — proposals below can lean on it.

**Balance (from reading, not a fresh headless run).** Match engine looks
calibrated: `HOME_ADVANTAGE = 9`, a widened strength spread so weak sides don't
win leagues, tuned finish/GK mods. The visible weakness is **tactics being
inert** — the two enum choices apply only small multipliers, so tactical decisions
barely move outcomes. That's a depth gap, not a bug.

**Code debt that will bite the proposals.**
- **Tactics is a two-enum stub.** Roles, familiarity, sliders, opposition plans
  all need `Tactics` + `LineupProfile` + `buildLineupProfile` + `match.ts`
  extended. Doing the roles refactor (feature #9) *first* de-risks a whole
  category.
- **Continental is UEFA-hardcoded** (`continental/install.ts`). Non-UEFA
  competitions need a confederation abstraction; `qualification.ts`/`schedule.ts`
  are already semi-generic, `install.ts` is not.
- **Calendar is single Aug→May** (`game/gameCalendar.ts`). Per-country calendars
  (#17) touch scheduling core — the biggest structural bet here.
- **The store is a 3.8k-line monolith**; `playDays` is the sim orchestrator.
  Not incorrect, but extracting transfers/sim/player-career would speed everything
  after it.

---

## 3. Feature Backlog

Grouped by category, numbered continuously. Each: **what · why · insertion ·
effort · impact · deps · risks.** Effort = S (hours) / M (a day or two) / L (a
week+).

### A. Match engine & presentation

**1. Shot map + per-shot log.**
What: persist each shot (`{minute, playerId, xg, onTarget, goal}`) and draw a
shot map on MatchDetail. Why: `match.ts` already *computes* per-shot chance
quality and shooter, then throws it away — this is free realism. Insertion: emit
in `simulateSide`, new optional `shots?` on `Match`, render on
`ui/routes/MatchDetail.tsx`. Effort: S–M. Impact: **High** (data depth players
love). Deps: none. Risks: match-storage growth (small) → do #70 first-ish; save
migration additive.

**2. Surface xG everywhere.**
What: xG already exists (`homeXg/awayXg`) but shows only as one number on
MatchDetail — add it to Fixtures results, a league xG-for/against column, and
player logs. Why: turns an existing-but-hidden metric into a feature. Insertion:
`ui/routes/Fixtures.tsx`, `Standings.tsx`. Effort: S. Impact: Medium. Deps: none.
Risks: none. **Cheap win.**

**3. Per-player match game logs.**
What: a match-by-match table on PlayerProfile (mins, goals, assists, rating).
Why: `playerStats` per match exist but aren't aggregated into a browsable log.
Insertion: read stored matches, render on `ui/routes/PlayerProfile.tsx`. Effort:
S–M. Impact: Medium–High. Deps: #70 (reads history). Risks: perf on long saves.

**4. Referees with tendencies.**
What: assign a seeded referee per match (strict/lenient, penalty-happy) that
modulates `simulateCards` and penalty frequency. Why: variety + realism, tiny
code. Insertion: new `Referee` list, seed in `match.ts`, tweak `yellowLambda`.
Effort: S–M. Impact: Medium. Deps: none. Risks: determinism (seed the ref),
migration additive.

**5. Match commentary generator.**
What: templated, seeded commentary lines per event (goals, big chances, cards,
subs) for MatchDetail and the live view. Why: the batch sim emits terse
"Goal"/"Yellow card" strings; live match has texture, batch doesn't. Insertion: a
`game/commentary.ts` consumed by MatchDetail + `liveMatch`. Effort: M. Impact:
Medium. Deps: none. Risks: determinism (seeded picks).

**6. Title / relegation / top-4 probabilities.**
What: Monte-Carlo the remaining fixtures (N seeded sims) from current standings;
show % on Standings. Why: the single most engaging "GM" widget, and the sim is
cheap and pure. Insertion: worker task over `engine/match.ts`, render on
`Standings.tsx`. Effort: M. Impact: **High**. Deps: none. Risks: perf → bound N,
run in the sim worker, cache per matchday.

**7. In-match injuries surfaced.**
What: emit an `INJURY` event mid-match instead of only applying it in
`processMatchday` afterward. Why: drama + it explains a rating/sub. Insertion:
`match.ts` + `MatchEventType`. Effort: S. Impact: Low–Medium. Deps: none. Risks:
migration additive.

**8. Weather, pitch & climate.**
What: seeded per-match weather (rain → more errors/lower chance quality; Saudi
summer heat → extra fatigue). Why: authentic, and extends the *existing* travel-
fatigue model rather than duplicating it. Insertion: `match.ts` mods +
`progression.ts` fatigue; climate keyed off `Club.countryId`. Effort: S–M.
Impact: Medium. Deps: none. Risks: determinism (seed weather), balance.

### B. Tactics depth (the biggest inert system)

**9. Player roles.** ⭐
What: a `role` per team-sheet slot — false 9, mezzala, inverted full-back,
target man, ball-playing/​libero CB, wing-back, poacher, deep-lying playmaker —
that reshapes chance generation, not just aggregate strength (a false 9 drops in,
raising `chanceQualityMod` and midfield presence while lowering box presence).
Why: this is the depth ceiling for the whole match/tactics category, and the
current two-enum system is nearly inert. Insertion: extend `Tactics` +
`LineupProfile` + `buildLineupProfile` (`engine/lineup.ts`) → new mods consumed in
`simulateSide`. Effort: **L**. Impact: **Very High**. Deps: none. Risks: balance
retune, migration additive. *Build this before the rest of B/opposition-plan work.*

**10. Tactical familiarity.**
What: `familiarity` 0–100 per club per (formation+style), rising with matches,
decaying on change; low familiarity damps the tactic mods. Why: makes tactical
identity a commitment, punishes tinkering. Insertion: `Club` field + apply in
`buildLineupProfile`. Effort: M. Impact: Medium–High. Deps: #9 (optional). Risks:
migration additive.

**11. Width / tempo / pressing-intensity sliders.**
What: numeric sliders beyond the two enums, feeding `shotVolumeMod` /
`chanceQualityMod` / `aggression`. Why: granular control, cheap given the mod
plumbing exists. Insertion: `Tactics` + `lineup.ts` + `ui/routes/Tactics.tsx`.
Effort: S–M. Impact: Medium. Deps: none. Risks: balance.

**12. Opposition dossier + pre-match plan.**
What: deepen `game/oppositionReport.ts` into a pre-match screen with a suggested
counter (shape/role tweaks) and a small in-match edge for setting instructions
against their shape. Why: rewards preparation; the report already exists.
Insertion: `oppositionReport.ts` + a new pre-match UI + a `buildLineupProfile`
matchup bonus. Effort: M. Impact: Medium–High. Deps: #9.

**13. Set-piece routines.**
What: routines (near-post corner, training-ground FK, zonal vs man marking) that
shift set-piece goal probability, tied to taker attributes. Why: set-piece
*takers* exist but routines don't. Insertion: `engine/lineup.ts` set-piece share
+ `match.ts`. Effort: M. Impact: Medium. Deps: takers (exist).

**14. Formation matchup matrix.**
What: a rock-paper-scissors modifier from the two formations' shapes (back-three
vs two-striker, etc.) in `simulateSide`. Why: makes formation choice matter.
Insertion: `match.ts` + a small matrix. Effort: S–M. Impact: Medium. Deps: none.
Risks: balance.

### C. Per-country realism (this game's biggest untapped edge)

**15. Squad-registration rules.** ⭐
What: homegrown quotas (PL 8/25), non-EU/foreign limits (La Liga 3 non-EU, Serie
A, Saudi 8+1, Brazil's foreigner cap), enforced when registering/signing. Why:
**the dataset spans 26 nations and models none of their rules** — this is the
single most distinctive realism edge available. Insertion: `registration` config
on `Competition` + a check in `game/transfers.ts` `evaluateBid` and at season
registration. Effort: M–L. Impact: **Very High**. Deps: per-league rule data.
Risks: migration additive, AI must respect it too.

**16. MLS roster & cap rules.**
What: salary cap, 3 Designated Players (cap-exempt), TAM/GAM, international slots,
no promotion/relegation (already), conference playoffs (already). Why: the USA is
fully in the dataset with 30 clubs but plays like a European league. Insertion: a
US-specific ruleset gating `transfers` + a cap view in `Finances`. Effort: L.
Impact: High. Deps: #15 framework.

**17. Misaligned league calendars.** ⭐ (big bet)
What: MLS Feb–Dec, Brazil/Argentina Apr–Dec, Scandinavia spring–autumn vs Europe
Aug–May — real season windows, which realigns transfer windows and cross-
hemisphere moves. Why: transforms the world from "one global season" into a
living calendar; unlocks authentic winter-window MLS signings etc. Insertion:
per-`Competition` calendar offset in `game/gameCalendar.ts` + `engine/schedule.ts`
+ rollover timing in `game/season.ts`. Effort: **L**. Impact: **High**. Deps:
none. Risks: touches the scheduling/rollover core — highest structural risk here;
determinism of generated dates; migration.

**18. Real domestic cups.**
What: replace the generic Cup/League Cup with named cups + real formats — Copa do
Brasil (two-legged), King's Cup, US Open Cup (lower-league entrants), Coupe de
France (amateurs), DFB-Pokal. Why: flavour + authenticity for cheap. Insertion:
per-country name/field/format in `game/cups/domesticCups.ts`. Effort: M. Impact:
High. Deps: none. Risks: migration additive.

**19. CONMEBOL Libertadores & Sudamericana.**
What: continental football for Brazil & Argentina (both in the dataset).
Insertion: a confederation abstraction in `continental/install.ts` +
CONMEBOL qualification. Effort: L. Impact: High. Deps: continental refactor.
Risks: schedule interplay, migration.

**20. AFC Champions League & CONCACAF Champions Cup.**
What: continental for Saudi/Korea/China + USA/Mexico, on the same confederation
framework. Insertion: `continental/install.ts` (post-#19). Effort: L (M once #19
exists). Impact: Medium–High. Deps: #19.

**21. Work permits / GBE (post-Brexit England).**
What: non-UK signings need a points-based permit (from caps, league tier,
minutes); fail → blocked or a hard sell. Why: extremely authentic, changes who
English clubs can buy. Insertion: `game/transfers.ts` `evaluateBid` + a GBE
calculator. Effort: M. Impact: Medium–High. Deps: #15 framework.

**22. Brazilian state championships.**
What: Paulista/Carioca etc. run Jan–Apr before Série A — a regional pre-season
comp for Brazilian clubs. Insertion: `game/competitions.ts` +
`schedule.ts`. Effort: M–L. Impact: Medium (authentic, niche). Deps: #17.

**23. Winter breaks & festive congestion.**
What: Bundesliga winter break; English festive pile-up (fatigue spike).
Insertion: `engine/schedule.ts` gaps + `progression.ts` fatigue. Effort: S–M.
Impact: Medium. Deps: none (extends existing fatigue).

**24. Coefficient-driven slot reallocation.**
What: country coefficients already evolve — let them actually *move CL/EL slots*
between nations over decades (a rising Saudi/MLS gains places). Insertion:
`continental/qualification.ts`. Effort: S–M. Impact: Medium (longevity). Deps:
continental.

### D. Competitions & international football

**25. International qualifying campaigns.**
What: home-and-away qualifying groups feeding the World Cup/Euros/Copa, so
nations rise and fall and qualification is earned. Why: turns international
management from an exhibition into a campaign. Insertion: a qualifying phase
before the finals in `game/internationals.ts`. Effort: L. Impact: High (for
international managers). Deps: none. Risks: schedule/calendar interplay.

**26. AFCON / Asian Cup / Gold Cup.**
What: more confederation tournaments (African, Asian, CONCACAF nations are all in
the data). Insertion: `internationals.ts` `runTournament` with new fields. Effort:
M (framework exists). Impact: Medium–High. Deps: none.

**27. Youth internationals (U21).**
What: a U21 Euros / youth tournament your academy graduates get called to (feeds
development + prestige). Insertion: `internationals.ts` + `game/academy.ts`.
Effort: M. Impact: Medium. Deps: academy (exists).

**28. Interactive competition draws.**
What: a draw-ceremony screen for CL/cup rounds (currently silently auto-drawn).
Insertion: surface `continental/schedule.ts` `drawRound` in a UI ceremony.
Effort: S–M. Impact: Medium (presentation). Deps: none.

**29. Extra time in knockouts.**
What: 30′ of extra time (a mini continuation-sim) before a level knockout goes to
penalties. Why: currently level-after-90 jumps straight to a shootout.
Insertion: `match.ts` / the `liveMatch` shootout path. Effort: S–M. Impact:
Medium. Deps: none.

### E. Transfer-market depth

**30. Rumour mill / transfer news.** ⭐
What: a seeded gossip generator (AI clubs eyeing players, price speculation) into
the Inbox that escalates into real bids. Why: the market runs silently; this makes
it feel alive. Insertion: hook `game/aiTransfers.ts` + `storylines.ts` → Inbox.
Effort: M. Impact: **High** (immersion). Deps: none. Risks: determinism (seeded).

**31. Live deadline-day feed.**
What: on the final window day, a ticking feed of AI deals and your pending ones.
Why: deadline day is peak drama and currently invisible. Insertion: window
processing in `store.playDays` + a UI. Effort: M. Impact: High. Deps: #30
(shared feed) helps.

**32. Swap / part-exchange deals.**
What: offer a player + cash in a bid. Insertion: `game/transfers.ts`
`evaluateBid` (credit the offered player's value) + TransferMarket UI. Effort: M.
Impact: Medium. Deps: none. Risks: migration additive.

**33. Buy-back & matching clauses.**
What: sell with a buy-back option or a matching right honoured at a future sale.
Insertion: a field on the transfer/`Contract` record + AI honouring in
`aiTransfers.ts`. Effort: M. Impact: Medium. Deps: none. Risks: migration additive.

**34. Pre-contract Bosman agreements (January).**
What: sign an out-of-contract player for next season from January. Why: Bosman
*frees* exist at rollover, but the January pre-agree — a huge real-world lever —
doesn't. Insertion: `game/transfers.ts` + window logic in `store.playDays`.
Effort: M. Impact: High (authentic). Deps: none.

**35. Agent fees (manager side).**
What: signings carry agent fees that inflate the true cost. Why: the *player*
career has agents; the manager market has none. Insertion: `game/feeNegotiation.ts`.
Effort: S–M. Impact: Medium. Deps: none.

**36. Market inflation over decades.**
What: a save-level, year-scaled inflation index nudging fees/wages up over long
saves. Insertion: a multiplier in `engine/valuation.ts` from a stored index.
Effort: S. Impact: Medium (longevity). Deps: none. Risks: balance, determinism
(seeded/derived).

### F. Finances & ownership

**37. Sponsorship & commercial deals.**
What: negotiate shirt/naming-rights sponsors scaling with reputation/results,
feeding income. Insertion: `engine/finances.ts` `computeSeasonFinances` + a
Finances-screen negotiation. Effort: M. Impact: Medium–High. Deps: none.

**38. Club takeovers / rich owners.** ⭐
What: an AI club lands a wealthy owner (budget injection + reputation surge),
reshaping the world (a Newcastle/Saudi arc). Why: the biggest lever for a *living*
world over decades. Insertion: a rollover world-sim event (near `game/aiManagers.ts`)
mutating `Club.finances`/`reputation`. Effort: M. Impact: **High**. Deps: none.
Risks: balance, migration additive.

**39. Debt, interest & administration.**
What: clubs carry debt; sustained losses → administration → points deduction.
Why: `game/ffp.ts` already has points-deduction plumbing to reuse. Insertion:
`ffp.ts` + `finances.ts`. Effort: M. Impact: Medium. Deps: none.

**40. TV money by finish + ticket pricing.**
What: merit payments scaling with league position; a ticket-price lever trading
attendance for gate. Insertion: `computeSeasonFinances` + Finances screen. Effort:
S–M. Impact: Medium. Deps: none.

**41. Stadium expansion / naming rights.**
What: invest to grow capacity → gate income. Insertion: `Club.stadium` +
`finances.ts` + a Club-screen action. Effort: M. Impact: Medium. Deps: #37 (naming).

### G. Board, fans & manager career

**42. Split board vs fan confidence.** ⭐
What: a separate supporter-confidence meter (reacts to results, signings, ticket
prices, playing style) that can pressure the board. Why: the board is currently a
single number; fan/board tension is core football-management drama. Insertion:
`game/board.ts` + `BoardState`. Effort: M. Impact: **High**. Deps: none. Risks:
migration additive.

**43. Club vision / philosophy mandates.**
What: a multi-season board vision (attacking football, youth development, fiscal
prudence) judged over time, not just league position. Insertion: `board.ts`
objectives → multi-year. Effort: M. Impact: Medium–High. Deps: none.

**44. Job interviews & sack race.**
What: an interview when taking a job (answers shape expectations) + a visible
sack-race among pressured AI managers. Insertion: `game/careers.ts` +
`game/aiManagers.ts`. Effort: M. Impact: Medium–High. Deps: none.

**45. Manager attributes & identity.**
What: give the manager attributes (man-management, tactical, youth focus,
financial) that modestly bias development/morale/negotiation. Insertion:
`meta.managerStyle` + hooks in `morale.ts`/`development.ts`. Effort: M. Impact:
Medium. Deps: none. Risks: balance.

**46. Supporter protests / fan-mood events.**
What: low fan confidence → protests/boycotts (attendance + finance hit).
Insertion: #42 + `finances.ts` + Inbox. Effort: S–M. Impact: Medium. Deps: #42.

### H. Squad & human systems

**47. Dressing-room cliques & leadership.**
What: deepen `engine/chemistry.ts` into cliques + a leadership hierarchy where an
influential player's unhappiness spreads. Insertion: `chemistry.ts` + `morale.ts`.
Effort: M. Impact: Medium–High. Deps: none.

**48. Manager team talks & individual chats.**
What: pre-match/half-time talks and 1:1s affecting morale/form — the *manager*
mirror of the player-career conversation system. Insertion: `morale.ts` + a UI;
reuse the `playerConversations` pattern. Effort: M. Impact: Medium. Deps: none.

**49. Squad status & promises (manager side).**
What: give your own players squad-status promises (playing time, role) mirroring
the player-career promises, with unhappiness when broken. Insertion: `morale.ts`
+ `contracts.ts`. Effort: M. Impact: Medium. Deps: willingness-to-leave (exists).

### I. World simulation & longevity

**50. Rising/falling league reputation.**
What: league strength drifts over decades (Saudi rising via takeovers, others
declining) rather than staying static. Insertion: rollover world-sim + country
reputation. Effort: M. Impact: Medium–High (longevity). Deps: #38.

**51. Named AI managers & rivalries.**
What: extend `game/aiManagers.ts` into named managers with reputations, a manager
table, and personal rivalries with you. Insertion: `aiManagers.ts`. Effort: S–M
(extend). Impact: Medium. Deps: none.

**52. Retired legends re-enter as managers.**
What: a retired star (or your own retired avatar) returns as an AI manager.
Insertion: retirement in `game/season.ts` + `aiManagers.ts`. Effort: S–M. Impact:
Medium (nice, compounds with player→manager which exists). Deps: none.

**53. Dynasty & all-time records.**
What: accumulate all-time club honours, manager trophy counts, an all-time XI /
"greatest ever" board across decades. Insertion: `history` + `Records`. Effort: M.
Impact: Medium (longevity payoff). Deps: records depth. Risks: perf on huge
histories → store aggregates, not raw.

### J. Replayability (Basketball-GM DNA — steal it)

**54. Start in any season / any club.**
What: a free start beyond the fixed `START_YEAR` + challenges — pick any club, any
tier. Insertion: `ui/routes/NewGame.tsx` + `game/newGame.ts`. Effort: S–M.
Impact: **High** (replayability). Deps: none. **Cheap-ish win.**

**55. More challenge scenarios.**
What: 10+ new challenges (survive relegation, Saudi galácticos, MLS build, youth-
only, take a tier-4 side up). Why: 4 exist; they're pure data. Insertion:
`game/challenges.ts`. Effort: S. Impact: Medium–High. Deps: none. **Cheap win.**

**56. Auto-play / holiday multiple seasons.**
What: sim N seasons watching the world evolve (great alongside the longevity
features and for testing balance). Insertion: a `store.playDays` loop over
rollovers. Effort: M. Impact: High. Deps: none. Risks: perf → ties to #70.

**57. Watch lists / shortlists.**
What: flag players to track world-wide with alerts (form spike, expiring
contract, price drop). Insertion: `meta` list + `TransferMarket`/`Scouting`.
Effort: S. Impact: Medium. Deps: none. **Cheap win.**

**58. Achievements expansion.**
What: many more achievements (domestic double, treble, tier-4-to-top climb).
Insertion: data in `game/achievements.ts`. Effort: S. Impact: Medium. Deps: none.
**Cheap win.**

**59. Season-review / awards ceremony.**
What: deepen the existing `game/seasonReview.ts` into a proper end-of-season
ceremony (TOTS reveal, awards, a grade for your season). Insertion: `seasonReview.ts`
+ a screen (Dashboard already surfaces a summary). Effort: S–M. Impact: Medium.
Deps: none. **Cheap-ish win.**

**60. Fantasy draft mode.**
What: draft a squad from a global pool at game start. Insertion: a `newGame`
variant + a draft UI. Effort: L. Impact: High (replay). Deps: none. Risks:
balance.

**61. Expansion & custom clubs.**
What: add a club to a league (MLS-style) or create/rename/recolor one. Insertion:
a world-edit action (Sandbox-adjacent) + schedule regen + dataset overlay. Effort:
L. Impact: Medium–High. Deps: schedule regen.

### K. UX & tooling

**62. Advanced player search + saved filters.**
What: per-attribute sliders, position/foot/nationality, saved filters — beyond
TransferMarket's current age/OVR/POT/value/wage boxes. Insertion:
`ui/routes/TransferMarket.tsx` + `Compare.tsx`. Effort: S–M. Impact: Medium–High.
Deps: none. **Cheap win.**

**63. Power rankings & form table.**
What: a global power ranking + a last-6 form table (neither exists). Insertion:
`engine/standings.ts` + a UI. Effort: S. Impact: Medium. Deps: none. **Cheap win.**

**64. Comparison tool deepening.**
What: radar overlays, side-by-side career stats, "similar players" on `Compare`.
Effort: S–M. Impact: Medium. Deps: none.

**65. Keyboard shortcuts & quick-advance.**
What: advance/continue with a key, jump between screens. Effort: S. Impact: Medium.
Deps: none. **Cheap win.**

**66. In-game help / attribute tooltips.**
What: explain attributes and systems inline. Effort: S. Impact: Medium (onboarding).
Deps: none. **Cheap win.**

### L. Health / tech (build some of these first)

**67. Match-storage archival (perf).** ⭐
What: at rollover, strip old-season `events` (keep result + `playerStats`
aggregates), or lazy-load matches by season. Why: the one real scaling risk (see
§2). Insertion: `db/db.ts` + `store` load + a `season.ts` archival step. Effort:
M. Impact: **High** (keeps long saves fast; unblocks #1/#3/#6/#56). Deps: none.
Risks: migration, and records/history reads must still resolve.

**68. Seed the staff-market refresh (determinism).**
What: replace `Math.random()` at `store.ts:1974` with `(seed ^ day ^ used)`.
Effort: S. Impact: Low (correctness). Deps: none. **Cheap win.**

**69. Extract the store monolith.**
What: split `store.ts` into player-career / transfers / sim-orchestration
modules. Why: 3.8k lines slows every feature after it. Effort: M. Impact: Medium
(dev velocity). Deps: none. Risks: pure refactor — needs the test suite as a net
(it's strong).

**70. Confederation abstraction for continental football.**
What: refactor `continental/install.ts` from UEFA-hardcoded to a confederation
config, so #19–#21 slot in cleanly. Effort: M. Impact: Medium (enabler). Deps:
none. *Prerequisite for the CONMEBOL/AFC/CONCACAF bets.*

---

## 4. Top 10 Recommendations (ranked)

1. **#9 Player roles** — the depth ceiling for the whole match/tactics half of
   the game; the current system is nearly inert, and roles make every other
   tactical feature meaningful.
2. **#15 Squad-registration rules** — the single most distinctive edge available;
   26 nations are modelled and *none* of their rules are. Nothing else here is as
   unique.
3. **#67 Match-storage archival** — the one structural risk; do it before the
   data-heavy features so long saves stay fast.
4. **#6 Title/relegation probabilities** — the highest-engagement GM widget, and
   the pure sim makes it cheap.
5. **#30 Rumour mill + #31 deadline-day feed** — turns a silent market into the
   game's best theatre.
6. **#42 Split board vs fan confidence** — core management drama the single-meter
   board is missing.
7. **#38 Club takeovers / rich owners** — the biggest lever for a world that
   actually changes over decades.
8. **#1 Shot map + xG surfacing (#2)** — free realism from data the sim already
   computes and discards.
9. **#54 Start-anywhere + #55 more challenges** — cheap, huge replayability.
10. **#17 Misaligned league calendars** — the most transformative realism bet,
    though the highest-risk (accept it as a deliberate big investment).

## 5. Cheap Wins (high impact, small effort — build first)

- **#2** Surface xG across Fixtures/Standings/logs.
- **#55** More challenge scenarios (pure data).
- **#58** Achievements expansion (pure data).
- **#57** Watch lists / shortlists.
- **#63** Power rankings + form table.
- **#62** Advanced player search + saved filters.
- **#68** Seed the staff-market refresh (determinism cleanup).
- **#54** Start in any season / any club.
- **#65 / #66** Keyboard shortcuts + attribute tooltips.
- **#18** Real domestic cup names/formats (data-heavy but mechanical).

## 6. Big Bets (large, potentially transformative)

- **#17 Misaligned league calendars** — reshapes the whole world clock and the
  transfer market; the deepest structural change.
- **#9 Player roles** — redefines the match engine's tactical surface.
- **#19–#21 Non-UEFA continental football** (via **#70**) — Libertadores/AFC/
  CONCACAF give half the dataset a continental stage.
- **#16 MLS roster & cap rules** — a genuinely different game mode inside the game.
- **#60 Fantasy draft** — a whole new way to start.
- **#25 International qualifying campaigns** — makes international management a
  real career arc.

## 7. Suggested Roadmap

**Phase 0 — Foundations & cheap wins (unblock everything):**
#67 match-storage archival · #68 seed staff refresh · #69 store split (optional) ·
then the cheap wins (#2, #55, #58, #57, #63, #62, #54). Ship momentum + a faster
long-save + the perf headroom the data features need.

**Phase 1 — Match & tactics depth:**
#9 player roles (anchor) → #10 familiarity → #11 sliders → #14 matchup matrix →
#12 opposition plan → #13 set-pieces. Then the presentation payoff on top of the
roles data: #1 shot map, #6 probabilities, #5 commentary, #4 referees, #8 weather.

**Phase 2 — Living market & club:**
#30 rumour mill → #31 deadline feed → #34 pre-contract Bosman → #32 swaps → #33
clauses. In parallel: #42 board/fan split → #38 takeovers → #37 sponsorship → #40
TV/tickets → #43 vision.

**Phase 3 — Per-country realism (the edge):**
#15 registration framework → #21 GBE → #16 MLS rules; #18 real cups; #70
confederation refactor → #19 CONMEBOL → #20 AFC/CONCACAF; #24 coefficient slots.

**Phase 4 — International & longevity:**
#25 qualifying → #26 AFCON/Asian/Gold → #27 youth internationals; #50 league drift
→ #51 named managers → #52 legends-as-managers → #53 dynasty records.

**Phase 5 — The big calendar bet & replay modes:**
#17 misaligned calendars (with #22 Brazilian states, #23 winter breaks) once the
world is rich enough to make it worth the structural cost; then #56 auto-play,
#60 fantasy draft, #61 expansion/custom clubs.

> **Dependency spine:** #67 unblocks the data features · #9 unblocks category B and
> #12 · #70 unblocks #19–#21 · #42 unblocks #46 · #38 unblocks #50 · #15 unblocks
> #16/#21 · #17 is the long pole and should come after the world is worth the
> re-clocking.
