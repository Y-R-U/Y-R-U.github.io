# LONGSHOT — tiptop improvement campaign

Manager: Claude (Opus 5). **One sub-agent at a time.** Started 2026-09-15.

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
