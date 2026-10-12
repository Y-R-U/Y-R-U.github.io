# RAGDOJO online — manager state

Design: `docs/ONLINE.md`. Shared agent rules: the manager's BRIEF (scratchpad, not in repo).
Nothing deploys to the br8t box without Aaron approving the named steps.

## Phase 1 (started 2026-10-13)
- **A — arena**: Go arena server `server/`, net layer `js/net/`, 1v1 best of 3, friend link, real ping, stats recording.
  Owns main.js / ui.js / index.html / css for this phase.
- **B — events engine**: `js/events/` pure logic (picture reveal, Vines & Ladders with the turn-replay rule,
  seeded dice, points), `dev/events.html` preview, gates, first Flux image candidates (not committed until Aaron approves).

### B status (2026-10-13)
Done: `js/events/` (hash, calendar, points, vines, reveal, state), `docs/EVENTS.md` (engine + server
contract + golden vectors), `dev/events.html` preview, `tools/eventsgate.mjs` (132 checks, `--falsify`
16/16 red), `tools/eventsshot.mjs` (Chrome, real touches, 0 console errors). 12 Flux candidates in the
manager's scratchpad (`ragdojo-online/B/images/contact.html`), NOT in the repo, awaiting Aaron.
Not done: in-game wiring (phase 3/4, main.js/ui.js belong to A), server endpoints, image review page.
Open for Aaron: what `oppDmg` means for LMS / best-of-3; campaign-fight cap per day for any-battle events;
the guess bonus currency (engine returns `guessBonus` points; game decides ink).
