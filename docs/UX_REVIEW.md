# UX Review — Full Walkthrough (2025/26 build)

Method: drove the real production build in headless Chromium (Playwright) through
every route and the core loops — new game → dashboard → pre-season → transfer
lowball → academy management → live match to full-time → post-match. No console
errors appeared anywhere; all pages render. Findings below are ranked by how
badly they'd confuse a real player, each with a suggested fix.

## What already works well

- Clean, consistent visual language; fast page loads even with 19k players.
- Board objective + job security pinned at the top — you always know your goal.
- The next-fixture scouting report (tactical warnings, ones to watch) is a
  standout feature.
- Live match: team-talk → kick off → half-time talk → confirm result is a
  clear, complete loop. Pitch layout renders both XIs correctly.
- Lowball negotiation behaves exactly as designed: counter first, "talks off"
  when insulting, with a clear toast.
- Academy shows 18/18/18 with per-band squads and inline coach wage offers.

---

## Critical — will make players think the game is broken

### 1. A page refresh anywhere logs you out to the main menu
Any hard reload (F5, browser restart, following a bookmark to `/squad`) drops
the player back to the title screen. The career is still there, but nothing
says so — it just looks like the game reset. There is also no **Continue**
button; you must know the save row is clickable.
- **Fix:** store the last-loaded save id in `localStorage`; on boot, have the
  `Protected` wrapper auto-load it and stay on the requested page. Add a
  prominent **Continue career** button as the first item on the main menu.

### 2. Pre-season is invisible — "Advance Matchday" appears to do nothing
Immediately after creating a game the header reads **Match 1 / 44** and the
main button says **Advance Matchday**, but it's June 28 and the opener is
Aug 3. Clicking the button just nudges the date (Jun 28 → Jun 30 → Jul 2 …)
with zero other feedback — nine "nothing happened" clicks before football
starts. New players will assume it's bugged.
- **Fix:** during the pre-season, replace the "Match 1 / 44" label with
  **"Pre-season · opener Sun 3 Aug"**, relabel the button **Advance Day**, and
  add a **"Skip to opening day ▸"** button. A one-line banner ("Use the open
  window to shape your squad before the opener") would turn the dead time into
  the feature it's meant to be.

### 3. The global sim controls stay live during a live match
On the Live Match screen the top bar still shows Advance Matchday / To Next
Match / ▶ Watch Live / To Season End — all clickable while a match is set up
or in progress. Clicking any of them mid-match is undefined behaviour, and
leaving the screen silently **discards** the in-progress match (I lost a
half-time 0-1 without warning re-entering later started a fresh match).
- **Fix:** hide (or disable) the play-controls bar while on `/live`, and gate
  navigation away from an in-progress match behind a confirm ("Abandon this
  match?"). "Abandon live match" already exists in the side panel — route all
  exits through it.

## High — recurring friction

### 4. Save rows: no Load affordance, instant-looking Delete
The saved-career row exposes **Export** and a red **Delete**, but the actual
"play this save" action is an invisible click on the row itself.
- **Fix:** add an explicit **Load ▸** (or Continue) button per row; require a
  confirm on Delete if there isn't one.

### 5. Nineteen flat nav items + God Mode
The sidebar lists 19 destinations with no grouping, ordered roughly by
addition date. Rarely-used pages (Nations, Records, History) sit between
daily-use ones. **God Mode** — a save-wrecking cheat console — is presented as
just another page a curious new player will click.
- **Fix:** group into sections (e.g. **Club**: Squad/Tactics/Academy/Club/
  Finances · **Market**: Transfers/Scouting/Compare · **World**: Standings/
  Fixtures/Cups & Europe/Nations/Records/History · **You**: Manager/Inbox).
  Move God Mode to the bottom under a "Cheats" divider with a warning tint.

### 6. Two different "Facilities" systems with the same name
The Club page has a **Facilities** card (Academy L3, Training L2 + upgrade
buttons), and the Academy Overview has a *different* **Facilities** card
(Training/Coaching/Medical/Recruitment with different prices). Same word, two
systems, different money — players won't know which upgrade does what.
- **Fix:** rename the Club card to **Club infrastructure**, and add one line
  under each explaining scope ("club-wide training level" vs "academy-only
  coaching"). Cross-link them.

## Medium — polish that pays off

7. **Dressing-room chips are cryptic.** "National blocs +3", "Time together
   −6", "Wage gap +1" have no explanation. Add tooltips ("Players sharing a
   nationality bond: +3 chemistry").
8. **League position before any football.** Showing "8th · 0 pts" in June is
   noise — show "–" until at least one round is played.
9. **Transfer list caps at "250 shown" without saying of what.** Say
   "top 250 by value — narrow the filters to see others". Also the scout strip
   ("Costa ★★★☆☆ · available") looks like text but is your main scouting tool —
   make the names buttons ("Send").
10. **Wage bill reads "£41K/wk/wk"** on the Club page (double suffix — the
    label already appends /wk).
11. **Inbox welcome says "Welcome to GIR"** — it splits the save name and gets
    the abbreviation. Use the club's full name.
12. **Main-menu footer copy is stale dev jargon:** "Ships with generated player
    data… (M0 + M1)" — it actually ships real players now, and no player knows
    what M0/M1 means. Replace or delete.
13. **New Game screen:** defaults to Argentina (alphabetical) rather than a
    marquee league; club cards give zero indication of strength (add star/
    reputation badges so first-timers don't accidentally pick a relegation
    fighter); "Seed" belongs under an "Advanced" fold.
14. **Academy squad rows are action-dense:** four buttons + a dropdown × 54
    rows, with destructive **Release** sitting directly beside **Pro terms**.
    The confirm dialog saves you, but move Release to the far edge (or behind a
    ⋯ menu) and colour it only on hover.
15. **Momentum bar at 0-0** renders as a big blue-vs-pink split with no centre
    tick — at kickoff it implies someone is dominating. Add a midline marker
    and a label only once xG diverges.

## Low / ideas

16. **No onboarding.** A three-item first-run checklist ("Review your tactics →
    Check the transfer budget → Advance to the opener") would orient new
    players better than any tooltip pass.
17. **"Match 1 / 44"** counts every competition; consider "League round 1/38 ·
    44 games total" on hover.
18. **Post-match**, the Last result card is plain text — link it to the match
    detail page (the data is already there).

---

*Walkthrough artifacts: ~30 screenshots across main menu, new game, dashboard,
squad, tactics, transfers (incl. lowball → talks-off), scouting, academy
(overview/squads/release confirm), club, finances, standings, fixtures,
cups & Europe, manager, inbox, compare, records, history, God Mode, and a full
live match (kickoff → HT talk → FT → confirm result).*
