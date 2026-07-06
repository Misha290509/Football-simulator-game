---
description: Run a feature through the full planner → coder → tester → reviewer pipeline
argument-hint: [feature description]
---

Run the following feature request through the complete autonomous pipeline: **$ARGUMENTS**

This repo defines four specialized subagents for exactly this purpose — `planner`, `coder`, `tester`, `reviewer` — each documented in `.claude/agents/`. They hand context to each other exclusively through files in `.pipeline/`, since each subagent call starts fresh with no memory of this conversation. Run them **strictly in sequence, each one waiting for the previous to finish** — do not parallelize; each stage depends on the last stage's output file.

## Steps

1. **Prepare.** Ensure a `.pipeline/` directory exists at the repo root (create it if missing). If old `specs.md` / `changes.md` / `tests.md` / `review.md` exist from a previous run, that's fine — each agent overwrites its own file completely.

2. **Plan.** Invoke the `planner` subagent in the foreground (you need its result before continuing — do not run it in the background). Give it the feature request verbatim, plus the instruction to write its spec to `.pipeline/specs.md`.

3. **Build.** Once planning is done, invoke the `coder` subagent in the foreground. Tell it to read `.pipeline/specs.md` and implement exactly what it specifies, writing its summary to `.pipeline/changes.md`.

4. **Test.** Once the build is done, invoke the `tester` subagent in the foreground. Tell it to read `.pipeline/specs.md` and `.pipeline/changes.md`, write and run tests, and record results in `.pipeline/tests.md`.

5. **Review.** Once testing is done, invoke the `reviewer` subagent in the foreground. Tell it to read all three prior `.pipeline/*.md` files plus the real diff, and write its verdict to `.pipeline/review.md`. Remind it explicitly that it must not edit any code — verdict only.

6. **Report back to the user; don't act further on your own:**
   - Show the reviewer's verdict (SHIP / NO-SHIP) and its key reasoning, summarized — don't just dump the file.
   - Point to the four `.pipeline/*.md` files for the full trail.
   - **Do not commit or push automatically**, regardless of verdict. This pipeline builds and gates the feature; committing is a separate, explicit decision the user makes after reviewing the result. If the verdict is SHIP and the user then asks you to commit, follow the repo's normal commit/push conventions.
   - If the verdict is NO-SHIP, summarize what the reviewer flagged as blocking and ask the user whether to re-run the coder → tester → reviewer stages with that feedback folded in, or take it from here themselves.

Each subagent call is a single, self-contained prompt — it has no access to this conversation, only to the files in `.pipeline/` and the repo itself.
