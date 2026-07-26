# Player Career Mode — Audit & Prioritized Feature Backlog

> **Wave 2 (match & identity overhaul).** On top of Wave 1, the interactive match now has **off-the-ball positioning intent** (a pre-match movement choice — run in behind / come short / press / hold shape — that deterministically reshapes which moments come your way and how many), a **SofaScore-style post-match breakdown** (rating ring, Player-of-the-Match, moments-won bar, big-moment tally, decision recap), a **PlayStyles** system (10 signature abilities derived from attributes, with modest targeted in-match effects and card display), and a **records chase** (career goal & appearance landmarks on the timeline). Determinism + additive-migration preserved; suite green with new PlayStyles, positioning-intent and cameo coverage. The genuine moonshots — a full 2D pitch engine, a complete branching story campaign, playable international tournaments, broadcast-grade presentation, and the full off-pitch life sim — remain deliberately staged (each a multi-month build), not stubbed.

> **Wave 3 (relationships — the mentor).** The narrative layer already had the manager (trust/promises/conversations), the agent, and a shirt rival; the missing piece was a named peer who's *on your side*. Early in a career a fitting senior team-mate now takes the young avatar **under his wing** — a named `CareerMentor` whose bond grows with shared success, who has a quiet word that lifts morale on a cold streak, backs the avatar publicly on a hot one, and gets a proper send-off (bond remembered) when he moves on. Pure & deterministic (hash-seeded beats, no RNG-stream draw), surfaced on the Player hub and the feed, covered by new tests.

> **Wave 4 (relationships come alive).** The rival gained a real story — a decisive head-to-head lead fires a "the shirt is yours" milestone, losing it draws a public jab, and a rival who leaves the club gets a send-off. Both the rival jab and the mentor's rough-patch word are now **interactive pick-a-line flashpoints** (reusing the conversation channel, extended to ripple fan rating, following, confidence and the rival bond): fire back at your rival or stay classy; open up to your mentor or back yourself. And a new **Relationships hub** (`/relationships`, in the "Me" nav) draws the whole human web — manager, mentor, rival, agent, country, public — into one screen. Deterministic; tests cover the new ripple fields, the queued flashpoints and the interactive/auto fallback.

> **Wave 5 (the dressing room).** Beyond the single mentor and rival, a career is lived among a group. A new dressing-room system tracks the avatar's **standing** in that room (drifting with his status and form) and a few **named team-mate bonds** (allies he clicks with), fires the beats that bring it alive — a friend struck up, the captain backing him, senior pros questioning a struggling newcomer, becoming one of the leaders — and occasionally hands him a real **dressing-room dilemma** (carry the group's grievance to the manager and trade trust for standing, or side with the gaffer). Surfaced on the Relationships hub with a standing meter and bond chips. Deterministic; covered by new tests.

> **Wave 6 (half-time tactical shift).** The interactive match now lets the avatar **change his off-the-ball movement at half-time** — a real second-half adjustment, not just the confidence beat. It re-weights only the minute≥45 moment types (the same number of RNG draws), so the first half replays byte-identically and the whole match stays a pure function of (seed, decisionLog); a test locks the first-half-unchanged invariant. The switch shows in the post-match breakdown as `first → second`.

> **Wave 7 (legacy & recognition).** Two payoffs that make a long career feel like it *added up*. **Full circle:** once the once-mentored avatar is a senior veteran (30+, a leader or high dressing-room standing), a one-time beat marks him becoming the mentor himself — the young lads now look to him the way he once looked to his own mentor. **Personal award recognition:** the game already had a full awards gala (Ballon d’Or, Player of the Season, Golden Boot, Team of the Season…) that the avatar can win as a real player; now when *he* is among the winners it’s a celebratory feed moment and a genuine morale lift, not just a line in the roll-call. Both deterministic; the full-circle beat is covered by a test.

> **Wave 8 (derby framing in the match).** The rivalries data now feeds the interactive match: when the avatar's fixture is a traditional derby it's detected up front, the stakes are raised (importance → more pressure and nerves in the moments), and the team-talk screen carries a distinct derby banner instead of the generic big-occasion one. Covered by a new `buildInteractiveInput` test.

> **Wave 9 (injury comeback arc).** A serious injury (≈6+ weeks) is no longer a one-line knock: it opens a three-beat comeback arc — a heavier diagnosis (bigger sharpness + confidence hit), an emotional return to the squad after N weeks out, and an "all the way back" milestone when full sharpness is regained — surfaced on the hub with a live "comeback trail" banner. Minor knocks stay the simple sidelining they were. Deterministic; covered by new tests.

> **Wave 10 (persona cohesion).** The public persona (Fan Favourite / Outspoken / Model Professional / Bad Boy / Enigma), already derived from fan rating + controversy and moved by the press/rival flashpoints, is now visible where it belongs: a persona chip on the Player hub next to the PlayStyles, and a persona badge + a controversy meter on the Relationships hub. Pure presentation — no logic change.

> **Wave 11 (former-club reunion).** Facing a club the avatar has played for before is now its own occasion: detected from his season history (by club name, excluding the current club), it raises the stakes and shows a distinct "Return to …" banner on the team-talk screen — old faces, familiar stands. Sits between the derby and generic big-match framings. Covered by a new test.

> **Wave 12 (international landmarks).** Caps already accrued season-to-season; now they're *celebrated*. Crossing 25 / 50 / 100 / 150 caps raises a milestone, and the avatar's first senior goal for his country gets its own beat — alongside the existing tournament-squad recognition. Landmarks that make an international career feel like it accumulates.

> **Wave 13 (season report card).** The end-of-season review is no longer a bare stat line: a pure `seasonReportCard` helper now grades the campaign (A+ … D) by synthesising rating, involvement, end-product and silverware — attackers judged more on goals, everyone judged first on how they actually played — and gives it a headline. The grade rides in the review's title. Deterministic; covered by new tests.

> **Wave 14 (goal of the season).** A spectacular strike in the interactive match — a long-range screamer or a set-piece special — is now recognised as such: a "WHAT A GOAL!" ticker call, a little extra rating shine, and a goal-of-the-season standout line on the timeline and post-match screen. Deterministic; an end-to-end test confirms a screamer earns the standout.

> **Implementation status (this branch).** Most of the backlog below has now been built. **Shipped (37):** #1–#7, #9–#12, #15–#24, #26–#29, #31, #32, #35, #38, #40, #42, #43, #45, #47–#50. **Partial / intentionally-scoped (4):** #8 & #14 (training-ground progress + breakthroughs shipped; a fully-interactive "prove-it" training moment is not), #13 (half-time confidence beat only — the deterministic match input is deliberately never mutated mid-game), #44 (legacy already scores records; no new concrete record-chases). **Deferred big-bets / higher-risk (9):** #25 youth graduation arc, #30 dressing-room bridge, #33 personal-terms counter-offer, #34 media rivalry, #36 brand identity, #37 life events, #39 playable international matches, #41 tournament runs, #46 interactive testimonial. All shipped work keeps the suite green (478 tests) and respects the determinism + additive-migration rules. See the commit for specifics.

---


_Scope: **Player Career Mode only** (`careerMode === 'PLAYER'`; the human is a single avatar in `world.players`, referenced by `playerCareer.playerId`). Manager mode is out of scope except at the shared engine and the player→manager transition. This document is an audit + proposal; no game code was modified to produce it._

Design rules every proposal below respects: **attributes rule outcomes** (decisions modify, never override), **failure is always escapable**, **off-pitch content is opt-in with sane defaults**, **timers optional**, **determinism** (seed + decision log), **additive migration** (career saves keep working — new `PlayerCareer` fields are optional with `?? default`).

---

## 1. Current State — Tier-by-Tier Inventory

| Tier | Status | Evidence |
|---|---|---|
| **1 — Core loop, creation, selection, matchday, screens** | ✅ Complete | `game/playerCareer.ts`: `createPlayerCareerGame`, `buildCreatedAvatar` (ability scaled `clubRep*0.8+7`), `PLAYER_ARCHETYPES` (5), `avatarSelectionBias`/`playerSelectionWeight` (±8 trust + 0–4 status) + `positionalScarcityBoost` (0/2/5), `applyAvatarMatchday`, `trustFromMatch` (±3.5, PAR 6.7). Store pipeline `state/store.ts` ~3994–4093. Screens: `PlayerHome.tsx`, `PlayerProfile.tsx`, `PlayerCareerScreen.tsx`, `PlayerTraining.tsx`, `PlayerPlayMenu.tsx`. |
| **2 — Status / objectives / conversations / promises / rival / traits / injuries / internationals** | 🟡 Mostly built; **rival + international are thin** | `playerProgression.ts`: `deriveSquadStatus`/`updateStatus`, `updateRival` (**display-only, empty `if (pick.injury){}` stub, not wired to selection**), `updateTraits`, `updateAdversity` (sharpness→35 / +9 recover, confidence, always escapable), `updateInternational` (**binary `capped`**). `playerObjectives.ts` (solid). `playerConversations.ts` (**only 2 generators**: `roleMeetingConversation`, `postDropConversation`; `evaluatePromises`). |
| **3 — Interactive key-moments match** | ✅ Complete — strongest system; **gated behind starting** | `engine/interactiveMatch.ts` `runInteractiveMatch` (pure replay, deterministic, resumable), `game/momentLibrary.ts` (27 moment types × 6 roles, 5 game plans), `game/interactivePlay.ts` `buildInteractiveInput`. Store flow ~526–634. **`beginPlayerMatch` returns `'AUTO'` when `!willStart`** — benched/sub games never interactive. **No engine test file.** |
| **4 — Agent / inverted transfers / contracts / loans / media / sponsors / lifestyle** | ✅ Complete, opt-in, deterministic | `playerOffPitch.ts`: `advanceOffPitch`, `marketHeat`/`updateInterest`, sagas, `askingPrice`, renewals, loans-out, sponsors, event-driven press, persona/controversy, lifestyle, wealth, `AGENT_ROSTER` + auto-negotiate. `OffPitch.tsx`. |
| **5 — Legacy / decline / retirement / HoF / player→manager** | ✅ Complete | `playerLegacy.ts`: `computeLegacy` (HoF bar 520, peer rank, transparent breakdown), 9 identities, ambitions, `updateDecline`, veteran traits, role evolution, `managerRepSeed`. `playerEndgame.ts`: twilight offers, `retirementAvailable`/`forcedRetirement`, `buildSendOff`, `buildTestimonial`, `managerStartClub`. `Legacy.tsx`, `Retrospective.tsx`, `retireAvatarNow` (store ~4155). |

**Determinism & migration:** seeded `Rng` (mulberry32) throughout; interactive match = seed + `decisionLog`. All Tier 2–5 `PlayerCareer` fields optional → additive migration; legacy manager saves unaffected (`careerModeOf` defaults MANAGER).
**Tests present (9):** `playerCareerGame`, `playerLegacy`, `playerMatchdayLoop`, `playerObjectives`, `playerOffPitch`, `playerProgression`, `playerTrust`, `careers`, `academyLegacy`.
**Coverage gap:** no test for `engine/interactiveMatch.ts` (the most complex, most fun system).

---

## 2. Is It Fun? — Honest Assessment + Fix-First List

**Verdict: the endgame/career-arc layer is genuinely compelling; the minute-to-minute and week-to-week core loop is NOT yet fun — and the causes are structural, fixable without new features.**

The mode advertises two things loudest — *the battle for your place* and *the rival for your shirt* — and those are exactly the two systems with the least mechanical depth, while the one genuinely excellent system (the interactive match) is locked behind starting.

**Structural weaknesses (ranked):**

1. **The selection battle is mostly pre-decided.** `avatarSelectionBias` is only ~±15 over `effectiveOverall = overallAt − slotPenalty`, and **form/fitness/sharpness don't feed selection at all** (only injury exclusion + the slow trust trickle). The avatar effectively always-plays or never-plays from raw overall. PlayerHome's headline "will I start?" is usually a foregone conclusion — no week-to-week jeopardy.
2. **The rival is cosmetic.** `updateRival` renders a "Battle for the shirt" card but has an empty injury stub and is never read by selection. The most resonant framing in the mode has no teeth.
3. **Benched = dead air, precisely when it shouldn't be.** Young/created players (YOUTH/PROSPECT, low overall) *can't start*, so they *can't play Tier 3*. The opening act is a click-through; no cameo, impact-sub, or "earn a start" beat.
4. **In-season progression is invisible.** Growth lands once a year as `lastSeasonChange` at rollover. Training is a set-and-forget focus toggle with no weekly feedback, drills, or breakthroughs.
5. **Agency is thin off the pitch and in pacing.** Outside the match you mostly watch/react; the interactive match is the only real agency and it's gated. PlayerPlayMenu rides the full manager calendar with no "sim to my next moment."
6. **Macro pull is strong, micro pull is weak.** Legacy/ambitions/HoF/decline/player→manager create a great "one more *season*" pull, but the "one more *match*" hook is under-powered.

**Fix-first list — do these BEFORE any new Tier-4/5 feature (they are backlog items #1–#8 below):**
- **A.** Dynamic selection: feed form + sharpness + recent-rating momentum + the specific rival into `avatarSelectionBias`; widen the contested band.
- **B.** Wire the rival into selection; fill the injury stub; make beating him move start-odds.
- **C.** Un-gate Tier 3 for a cameo/impact-sub moment set so benched & young players have something to play.
- **D.** In-season progression feedback (micro-progress bar + mid-season training payoff).
- **E.** "Sim to my next moment" pacing compression for player mode.
- **F.** Add an `interactiveMatch` engine test to lock determinism before extending it.

---

## 3. Feature Backlog (numbered continuously, grouped by category)

Each: **[effort S/M/L]** insertion point · impact & feeling · dependencies / risk. 🟢 = cheap win. 🎯 = fix-first.

### A. The Selection Battle & Rival (the core-loop fix)

1. 🎯 **Form & sharpness feed selection** — **[S]** `playerCareer.ts` `playerSelectionWeight`/`avatarSelectionBias`: add `clamp(form,-30,30)*k + (sharpness-80)*k2`. _Feeling: agency — a good run earns the shirt._ Dep: none. Risk: rebalance the ±band so it never fully overrides overall (design rule); add a `playerTrust`/matchday test.
2. 🎯 **Recent-rating momentum** — **[S]** new `career.recentRatings: number[]` (rolling 5), read into selection bias. _Feeling: "I'm on fire and the gaffer noticed."_ Dep: #1. Risk: additive field (migration-safe).
3. 🎯 **Rival wired to selection** — **[M]** `playerProgression.ts` `updateRival` + `playerCareer.ts`: the specific rival's form/overall becomes the contest, replacing generic `positionalScarcityBoost` when a rival exists. _Feeling: a named man to dislodge._ Dep: #1. Risk: determinism (rival pick already seeded).
4. 🎯 **Fill the rival injury stub** — **[S]** `updateRival` (the empty `if (pick.injury){}`): rival injury opens a start window + a "your chance" news beat. _Feeling: seize the moment._ 🟢 Dep: #3.
5. **Rival relationship arc** — **[M]** extend `CareerRival.relationship` into events (mentor/friend/enemy) surfaced as conversations; a friendly rival lifts dressing-room, a bitter one costs it. _Feeling: rivalry with a story._ Dep: #3, category D. Risk: content volume.
6. **Positional competition panel** — **[S]** PlayerHome: show the full depth chart at your position with your rank + what closes the gap. 🟢 _Feeling: legibility of the fight._ Dep: none.
7. **"Manager's message" on selection changes** — **[S]** when status/XI odds shift, a one-line inbox note explaining why (form dip, tactic change, rival hot). 🟢 _Feeling: the world reacts to you._ Dep: #1.
8. **Squad-role negotiation on the training ground** — **[M]** a mid-season "prove-it" mini-decision that, if met, grants a start (see #14). _Feeling: earn your place, don't wait for it._ Dep: category C.

### B. Matchday & Interactive Moments (Tier 3 extensions)

9. 🎯 **Impact-sub moment set** — **[M]** `interactivePlay.ts` `buildInteractiveInput` + `beginPlayerMatch`: when benched but likely to come on, play a short 2–4 moment cameo from ~65'. _Feeling: bench-to-hero, the missing early-career loop._ Dep: `momentLibrary` sub-weighted set. Risk: keep deterministic (seed off match + sub minute).
10. 🎯 **`interactiveMatch` engine test** — **[S]** new `engine/__tests__/interactiveMatch.test.ts`: same seed + decisions ⇒ identical Match. 🟢 _Feeling: (dev) safe to extend._ Dep: none.
11. **Big-match pressure framing** — **[S]** `momentLibrary`/`resolveMoment`: derbies, finals, debuts already scale pressure — surface it in the UI header ("Cup final · nerves matter"). 🟢 _Feeling: occasion._ Dep: none.
12. **Teammate & manager reactions to moments** — **[M]** post-moment ticker lines from key teammates/manager tied to `momentStats`. _Feeling: you're in a living team._ Dep: none. Risk: content.
13. **In-match manager tweaks** — **[M]** at half-time (`acknowledgeHalfTime`), let the manager change the game plan and ask you to adapt; adherence still feeds trust. _Feeling: tactical dialogue._ Dep: none. Risk: keep the deterministic input frozen (boost stays narrative, as today).
14. **Training-ground moments** — **[M]** a lightweight `runInteractiveMatch`-style decision in the training week that nudges sharpness/trust and can earn a start. _Feeling: the week between games matters._ Dep: category C, #8. Risk: new seeded stream.
15. **Set-piece specialist role** — **[S]** if attributes qualify, dedicated free-kick/penalty moments regardless of general frequency. 🟢 _Feeling: your signature._ Dep: none.
16. **Momentum/streak modifier** — **[S]** `resolveMoment` confidence term already exists; expose a visible "in-form" glow that compounds within a match. 🟢 _Feeling: heater._ Dep: none.
17. **Post-match player interview → the press** — **[S]** wire `MatchDone` into the existing `pressPromptFor` so the media beat flows straight from the match. 🟢 _Feeling: seamless._ Dep: Tier 4 (already built).

### C. Progression, Training & Development Feel

18. 🎯 **Visible attribute micro-progress** — **[M]** PlayerTraining + development: a per-focus progress bar toward the next tick, ticking within the season not just at rollover. _Feeling: getting better every week._ Dep: development engine. Risk: don't double-count at rollover.
19. 🎯 **Mid-season breakthroughs** — **[S]** a seeded chance that a focus + good form triggers a "skill clicked" news + immediate small bump. 🟢 _Feeling: dopamine._ Dep: #18.
20. **Weekly training report** — **[S]** PlayerTraining: "this week you sharpened X, Y dipped from fatigue." 🟢 _Feeling: legible growth._ Dep: #18.
21. **Coach relationship & advice** — **[M]** a position coach who recommends a focus and reacts to your work; ties to `personality.professionalism`. _Feeling: mentorship._ Dep: none. Risk: content.
22. **Trait unlock quests** — **[M]** `updateTraits`/`traitProgress`: surface "3 more assists to unlock Playmaker" style goals. _Feeling: build the player you want._ Dep: none.
23. **Position-battle retraining payoff** — **[S]** retraining already exists (`PlayerTraining`); when complete, immediately widen selection eligibility + a news beat. 🟢 _Feeling: versatility pays._ Dep: none.
24. **Fatigue & rotation reality** — **[M]** heavy minutes lower sharpness/injury-risk; a smart rest (lifestyle) protects you — surfaced as an opt-in choice, never forced. _Feeling: manage your body._ Dep: `updateAdversity`. Risk: keep escapable.
25. **Youth-to-first-team graduation arc** — **[M]** for ACADEMY/CREATED origins, an explicit U18→U21→first-team ladder with milestone unlocks. _Feeling: earn the badge._ Dep: academy system. Risk: origin-specific branching.

### D. Manager Relationship, Trust & Conversations (Tier 2)

26. **Conversation library expansion** — **[M]** `playerConversations.ts` currently has 2 generators; add contract, captaincy, transfer-request, bust-up, praise, ultimatum conversations. _Feeling: a real relationship._ Dep: none. Risk: content volume; keep deterministic triggers.
27. **Manager personality** — **[M]** give each manager a style (loyal / ruthless / rotator / youth-focused) that shifts trust dynamics + selection. _Feeling: every club feels different._ Dep: selection (#1). Risk: needs a manager-trait source (derive from club).
28. **Captaincy arc** — **[M]** `CareerPromise` kind `CAPTAINCY` exists but is under-used; make the armband a real earned milestone with leadership duties. _Feeling: status._ Dep: `deriveSquadStatus` CAPTAIN path (exists). 
29. **Broken-promise fallout → transfer** — **[S]** `evaluatePromises` already stings; escalate a repeatedly-broken promise into an offered exit (Tier 4 hook). 🟢 _Feeling: consequences._ Dep: Tier 4.
30. **Dressing-room standing** — **[M]** tie the avatar into the existing squad chemistry/dressing-room system so teammates rate you. _Feeling: belonging._ Dep: `engine/chemistry.ts`. Risk: bridging two systems.
31. **Player-initiated meetings, expanded** — **[S]** `requestMinutesOutcome` exists; add "ask about my role / a new deal / the tactics." 🟢 _Feeling: voice._ Dep: none.

### E. Off-Pitch, Media & Transfers (Tier 4 — already strong; deepen selectively)

32. **Transfer-request follow-through** — **[M]** `transferRequestPending` is a flag; make it drive sagas harder + risk manager fallout. _Feeling: force a move._ Dep: `advanceOffPitch` (built). Risk: pacing (don't spam sagas).
33. **Personal-terms negotiation mini-game** — **[M]** counter-offer wage/role/clause instead of accept/decline; agent skill sets the room. _Feeling: get your worth._ Dep: `personalTerms`. Risk: keep skippable (auto-negotiate stays).
34. **Rivalry with a media narrative** — **[S]** persona/controversy (`derivePersona`) already exists; let the press stoke a rival storyline. 🟢 _Feeling: headlines._ Dep: #3, Tier 4.
35. **Social-media following as a loop** — **[S]** `following` drives sponsors; surface it as a small growable meter with milestone unlocks. 🟢 _Feeling: fame._ Dep: none.
36. **Boot/brand deal choices with identity** — **[S]** sponsor tiers exist; let a deal reflect persona (grounded vs bad-boy) with tiny gameplay flavour. 🟢 _Feeling: express yourself._ Dep: Tier 4.
37. **Family / life events (fully opt-in)** — **[L]** rare, skippable life beats (relocation reluctance, homecoming pull) that colour transfer decisions. _Feeling: a person, not a stat._ Dep: Tier 4. Risk: tone; must default-off / auto-resolve.

### F. International Career (the thinnest tier — high upside)

38. 🎯 **Real call-up decisions** — **[M]** replace binary `updateInternational` `capped` with an actual call-up event + accept/withdraw choice. _Feeling: represent your country._ Dep: nations data (`Nations.tsx` exists). Risk: additive `PlayerCareer.international` shape.
39. **Play international matches interactively** — **[M]** route call-ups through `runInteractiveMatch` (friendlies/qualifiers). _Feeling: the biggest stage._ Dep: #38, Tier 3. Risk: fixture generation for internationals.
40. **International manager trust** — **[S]** `intlManagerTrust` is defined but unused — wire it like club trust for squad selection. 🟢 _Feeling: a second pecking order._ Dep: #38.
41. **Tournament runs** — **[M]** `tournamentSquads` records squads; make a World Cup/Euros a playable multi-match arc with its own objectives. _Feeling: a summer to remember._ Dep: #39, existing tournament system. Risk: L-ward scope; stage it.
42. **International legacy identity** — **[S]** `COUNTRYS_GREATEST` identity exists; feed caps/int'l goals into it properly once #38 lands. 🟢 Dep: #38.

### G. Legacy, Endgame & Meta (Tier 5 — complete; polish only)

43. **Rival-for-the-era** — **[M]** a peer generated at your level whose career you race across seasons (Ballon d'Or, trophies). _Feeling: a career-long duel._ Dep: `computeLegacy` peerRank (exists). Risk: determinism of the peer pick.
44. **Records chase** — **[S]** `legacy.breakdown['Records']` already scans milestones; add concrete chasable records (youngest to X, most goals in a season). 🟢 _Feeling: history-making._ Dep: none.
45. **Ambition editing** — **[S]** let the player set/pin their own ambitions beyond defaults (`defaultAmbitions`). 🟢 _Feeling: your story, your goals._ Dep: none.
46. **Retirement testimonial as an interactive send-off** — **[S]** `buildTestimonial` auto-resolves; optionally play it via Tier 3. 🟢 _Feeling: one last time._ Dep: Tier 3.

### H. UX, Pacing & Presentation

47. 🎯 **"Sim to my next moment"** — **[S]** `PlayerPlayMenu`: a control that fast-forwards dead calendar straight to the avatar's next fixture/decision. 🟢 _Feeling: no busywork._ Dep: none.
48. **Season-in-review card** — **[S]** at rollover, a one-screen "your season" (apps/goals/rating/honours/growth). 🟢 _Feeling: closure + pride._ Dep: `seasonHistory` (exists).
49. **Career timeline visualisation** — **[M]** PlayerCareerScreen: a spark-line of overall/rating/status across seasons. _Feeling: see the arc._ Dep: `developmentLog`, `seasonHistory`.
50. **Matchday anticipation screen** — **[S]** pre-fixture: opponent, your objectives, selection odds, the rival — one focused build-up beat. 🟢 _Feeling: get up for it._ Dep: #6.

---

## 4. Top 10 Recommendations (ranked)

1. **#1 Form & sharpness feed selection** — the single biggest fun unlock; makes the core promise real. [S]
2. **#3 Rival wired to selection** (+ **#4** injury stub) — turns the cosmetic card into the emotional heart of the mode. [M]
3. **#9 Impact-sub moment set** — un-gates the best system for young/benched players; fixes the dead opening act. [M]
4. **#18/#19 Visible progression + breakthroughs** — supplies the missing week-to-week dopamine. [M/S]
5. **#47 Sim to my next moment** — removes the biggest pacing tax; cheap. [S]
6. **#10 interactiveMatch engine test** — must land before Tier 3 gets extended. [S]
7. **#38/#39 Real international call-ups + play** — biggest content upside; the thinnest tier. [M/M]
8. **#26 Conversation library expansion** — the relationship is currently 2 dialogs deep. [M]
9. **#2 Recent-rating momentum** + **#7 manager message on selection changes** — make the fight legible and reactive. [S/S]
10. **#48 Season-in-review** — closes the loop and feeds the "one more season" pull. [S]

## 5. Cheap Wins (S, high ratio) 🟢

#4 rival injury stub · #6 positional panel · #7 selection-change messages · #10 engine test · #11 pressure framing · #15 set-piece role · #16 momentum glow · #17 match→press wiring · #19 breakthroughs · #20 weekly report · #23 retrain payoff · #29 broken-promise exit · #31 more meetings · #34 media rivalry · #35 following meter · #36 brand identity · #40 int'l trust wiring · #42 int'l identity · #44 records · #45 ambition editing · #47 sim-to-moment · #48 season review · #50 build-up screen.

## 6. Big Bets (L / multi-system)

- **#41 Playable tournament runs** — a World Cup/Euros summer arc through Tier 3; the marquee international payoff.
- **#37 Opt-in life events** — the "person, not a stat" layer; high tone-risk, must default-off.
- **#25 Youth-to-first-team graduation arc** — a distinct, structured opening act for CREATED/ACADEMY origins.
- **#43 Rival-for-the-era** — a career-long peer duel spanning the whole save.

## 7. Suggested Roadmap

- **Phase 0 — Make the core loop fun (fix-first).** #10 (test) → #1 → #2 → #3 → #4 → #7 → #47. _Small/medium, no migration risk. After this the selection battle is real and pacing is clean._
- **Phase 1 — Give everyone something to play.** #9 (impact-sub) → #18/#19/#20 (progression feel) → #6/#50 (build-up UX) → #48 (season review). _The early career and the between-games week now hold attention._
- **Phase 2 — Deepen the relationship.** #26 conversations → #27 manager personality → #28 captaincy → #29/#31 → #30 dressing room. _The club feels alive and reactive._
- **Phase 3 — Internationals (thinnest tier, big upside).** #38 → #40 → #42 → #39 → #41. _Build the second career the mode currently only stubs._
- **Phase 4 — Off-pitch depth + meta polish.** #32/#33 transfers → #34/#35/#36 media → #43/#44/#45/#46 legacy polish.
- **Phase 5 — Big bets.** #25 graduation arc, #37 life events, #41 tournaments (if not already staged in Phase 3).

_Guardrails carried through every phase: attributes still rule outcomes; every failure state stays escapable; all off-pitch/life content defaults to auto/opt-out; new `PlayerCareer` fields are optional (additive migration); every new RNG use derives from the save seed + a stable tag so replays stay deterministic._
