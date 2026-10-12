# RAGDOJO online — manager state

Design: `docs/ONLINE.md`. Shared agent rules: the manager's BRIEF (scratchpad, not in repo).
Nothing deploys to the br8t box without Aaron approving the named steps.

## Phase 1 (started 2026-10-13)
- **A — arena**: Go arena server `server/`, net layer `js/net/`, 1v1 best of 3, friend link, real ping, stats recording.
  Owns main.js / ui.js / index.html / css for this phase.
- **B — events engine**: `js/events/` pure logic (picture reveal, Vines & Ladders with the turn-replay rule,
  seeded dice, points), `dev/events.html` preview, gates, first Flux image candidates (not committed until Aaron approves).
