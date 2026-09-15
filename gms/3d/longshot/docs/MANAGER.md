# LONGSHOT — tiptop improvement campaign

Manager: Claude (Opus 5). **Parallel workers in isolated worktrees** (was one at a time; owner lifted that on 2026-09-15). Started 2026-09-15.

Shared tree warning: another session is live in `yru/site` (ragdojo, games/,
lib/auth). **Only ever stage `gms/3d/longshot` paths.** Never `git add -A`.

## Shape of the campaign

- **R0 Reviewer** — deep audit, produces `docs/IMPROVEMENTS.md`: a ranked backlog
  grouped into themed batches, each batch sized for one worker.
- **B1..Bn Workers** — one at a time, each handed one batch as a checklist.
  Every worker must leave `node tools/test_ballistics.mjs` green and tick its
  items off in IMPROVEMENTS.md with a note on what it actually verified.
- **Manager verification between batches** — Claude-in-Chrome screenshots +
  headless CDP runs, and a blind critic where the change is visual.

## Log

| # | agent | scope | status |
|---|-------|-------|--------|
| R0 | Reviewer | full audit → ranked backlog | DONE — docs/IMPROVEMENTS.md, 9 batches |
| B1 | Worker | correctness: 10 systems switched off | DONE 10/10, committed bbc7af81, tests 17→21 |
| B2 | Worker | city visual identity | KILLED by spend limit at ~95%; work salvaged, corridor regression found + fixed + verified by manager |
| B3 | Worker | opening framing / find the mark | running — main tree, owns missions.js+city.js+config.js+scope.js, http 8843 / cdp 9223 |
| B4 | Worker | populate the city (owner's #2) | running — worktree, owns people.js+charrig.js, http 8845 / cdp 9225 |
| B7 | Worker | teach the game | DONE, pre-verified, awaiting merge (blocked on B3 holding missions.js) |
| B8a | Worker | unlock node testing + test_utils | running — worktree, owns tools/ + guards in config.js/save.js, http 8849 / cdp 9229 |
| B6b | Worker | THE NEST escalation + daily balance | running — worktree, owns events.js ONLY, http 8851 / cdp 9231 |

## Parallel rules

Each worker owns a file territory and its own http + CDP port, so three can run
without fighting. Shared-file edits (`missions.js`) must stay tight and local —
the manager merges the worktrees in turn and a sprawling diff is what makes that
painful. Merge order: B3 (main tree) first, then B4, then B7.

**Before merging a worktree, verify its branch base**, and never `git add -A` a
conflicted merge.

## File ownership map (checked before every launch)

`missions.js` is the contended file — 1116 lines that nearly every batch wants.
Ownership is by LINE REGION, verified with `git diff -U0 | grep '^@@'` before
launching anything new:

- B3 holds `missions.js` lines 8-548 + `city.js` + `config.js` + `scope.js`
- B7 (done) added a single +8 method at line ~938 — **no overlap with B3**
- B4 holds `people.js` + `charrig.js` + the civilian-spawn region
- B8a holds `tools/` + 1-line guards in `config.js`/`save.js`
- B6b holds `events.js` and nothing else

Merge order: **B3 (main tree) → B7 → B4 → B8a → B6b**, full gate after each.
`git apply --check --3way` each worktree patch against the live tree BEFORE
merging; it names the conflicting file instead of leaving a half-merged tree.

## Merge dry-run (done 2026-09-15, before touching the real tree)

Stacked every worker's patch onto a pristine `git archive HEAD` copy in a scratch
repo and applied them in order. Result:

    b3  : APPLIED CLEAN
    b7  : APPLIED CLEAN
    b4  : APPLIED CLEAN
    b8a : CONFLICT — js/city.js, one line

**The only conflict in the whole campaign is one line of `perchReach`:**

    <<<<<<< ours      (B3)  return Math.max(3, edge - back);
    =======
    >>>>>>> theirs    (B8a) return Math.max(0, edge - 3);

Both edits are wanted and they compose — B3 parameterised the standoff distance,
B8a fixed the floor that could put the shooter outside his own footprint.
**Resolve to `Math.max(0, edge - back)`** after confirming B3's `back` semantics
in its own diff. Do NOT take one side.

Dry-running the stack costs a minute and turns the merge into a mechanical step.
Do it before every merge round.
