# The `/ship` agent pipeline

A four-stage autonomous pipeline for turning a one-line feature request into
built, tested, reviewed code: **planner → coder → tester → reviewer**. Each
stage is a separate Claude Code subagent (`.claude/agents/*.md`); they hand
context to each other exclusively through plain files in `.pipeline/`, because
each subagent call starts with a blank memory — the only thing it knows is
what's on disk.

## Usage

```
/ship add a filter to the Transfer Market so you can hide players whose contract expires this season
```

That one line runs the whole chain and ends with a report like:

```
Verdict: SHIP
- Implements a "Hide expiring contracts" checkbox in TransferMarket.tsx filter bar
- Filters on contract.expiresYear === currentSeasonYear
- 6 tests added, all pass; 214/214 existing tests still pass
- Non-blocking note: consider persisting the checkbox state like the other filters do
```

Nothing is committed automatically — see [Why nothing auto-commits](#why-nothing-auto-commits) below.

## The four stages

| Stage | Agent | Model | Reads | Writes |
|---|---|---|---|---|
| 1. Plan | `planner` | Opus | your request + the codebase | `.pipeline/specs.md` |
| 2. Build | `coder` | Sonnet | `specs.md` | the actual code + `.pipeline/changes.md` |
| 3. Test | `tester` | Sonnet | `specs.md`, `changes.md`, the diff | tests + `.pipeline/tests.md` |
| 4. Review | `reviewer` | Opus | all three files above + `git diff` | `.pipeline/review.md` (verdict only) |

**Why Opus for planner and reviewer, Sonnet for coder and tester:** the plan
sets the ceiling for every stage after it — a vague or wrong spec produces
wrong code no matter how good the coder is — so it's worth the strongest model
up front. The reviewer is the last thing standing between a mistake and
`main`, so it's worth the strongest model at the end too. The coder and tester
are executing an already-precise spec, where a faster/cheaper model does just
as well.

**Why the reviewer can't edit anything:** if the reviewer could "helpfully"
patch a bug it found, you'd never know the bug existed, and the pipeline would
quietly ship the same class of mistake next time. Read-only-with-a-verdict
means every problem is visible, on paper, before it ships.

## Why nothing auto-commits

The video this pipeline is based on frames it as "ship features while you
sleep" — implying it commits and pushes on its own. This setup deliberately
stops one step short of that: it builds, tests, and gates the feature, then
hands you the verdict. You decide whether to commit.

Two different risk levels are being separated here:
- **Building code in the working tree** is fully reversible — nothing is
  shared, nothing is public, you can always `git checkout .` or ask Claude to
  start over.
- **Committing and pushing** changes shared/remote state and can trigger CI,
  deploys, and collaborators pulling your branch. That's worth a deliberate,
  separate decision each time, not something that happens as a side effect of
  a verdict a model produced unattended.

If you want to fold committing into your own workflow after a SHIP verdict,
just say so in the same session — Claude will follow the repo's normal commit
conventions (author identity, message style, `git push -u origin <branch>`)
at that point.

## What it's good for, and what it isn't

Good fits: a scoped, describable feature that touches a handful of files —
add a filter, add a new stat column, wire up a new store action and its UI,
fix a specific bug with a known repro. The planner needs enough signal in your
one-liner to write a spec that a coder with zero other context can act on.

Poor fits: "make the game better," multi-system architectural changes, or
anything where the right design genuinely depends on a conversation (taste
calls, trade-offs only you can make). For those, talk it through with Claude
directly first — the pipeline has no back-and-forth once it starts.

## Re-running after a NO-SHIP verdict

If the reviewer blocks it, `.pipeline/review.md` has a concrete, prioritized
list of what to fix. Ask Claude to re-run just the coder → tester → reviewer
stages with that feedback (no need to re-plan from scratch unless the
reviewer's issue is with the spec itself, not the implementation).

## Files

```
.claude/agents/planner.md    subagent definition (Opus)
.claude/agents/coder.md      subagent definition (Sonnet)
.claude/agents/tester.md     subagent definition (Sonnet)
.claude/agents/reviewer.md   subagent definition (Opus, read-only)
.claude/commands/ship.md     the /ship slash command that chains all four
.pipeline/                   gitignored scratch hand-off files, regenerated each run
```
