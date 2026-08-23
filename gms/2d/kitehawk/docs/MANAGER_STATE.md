# Manager state — KITEHAWK

**If you are a fresh or compacted manager: read this file, then `DECISIONS.md`, then
`MANAGER_BRIEF.md`. Then whichever phase docs exist.**

Last updated: 2026-08-23, immediately after spawning the four planning agents.

## What this is

A painterly 2D biplane game, mobile-first **portrait**, for the Y-R-U site. Altitude is the fight;
parachute-borne supply crates are the economy and the signature mechanic. Six modes, 100-level
story across 5 acts, hangar upgrades. Lives at `gms/2d/kitehawk/`, will be served from
`/gms/2d/kitehawk/`. Full premise in `MANAGER_BRIEF.md`.

## How this run works

- The manager spawns agents, **verifies their claims rather than accepting reports**, then spawns
  the next batch.
- **Default is ONE agent at a time.** The reason is Aaron's **usage limits** — he needs the 5-hour
  block to last and wants spare capacity for other work. *Tell agents the reason, not just the
  number*; an agent that hears only "four agents" will happily run twelve.
- **2026-08-23: Aaron opened a window** — up to 4 concurrent agents, provided they all start within
  15 minutes, because he had ~40 minutes of session left and plenty of usage in it. **That window
  is specific to that batch.** When the four planning agents report, revert to one at a time and do
  not spawn a second without asking.
- Standing exception to the one-agent rule: a blind art critic alongside a builder.
- **Agents do not run git.** The manager stages selectively — paths under `gms/2d/kitehawk/`, plus
  one `projects.js` hunk, plus the screenshot. Other Claude sessions have uncommitted work in this
  repo; `git add -A` would sweep it up.
- **Aaron's standing instruction: at every playable milestone, commit + push and make sure the
  `projects.js` entry exists.** `wip: true` until the game is finished.

## Usage budgeting — run this before deciding concurrency

`node ~/cc/usage/usage.mjs` reports percent used, burn rate %/h and time left in the 5-hour block.
There is no local usage API, so it reads the per-message `usage` records in every session
transcript, weights them by rough relative cost, and works out the block from a calibrated phase
anchor in `~/cc/usage/calibration.json`.

**Calibrated 2026-08-24 02:12 from a real `/usage` reading Aaron gave (15% used, 3h left).** The
gap-inference fallback got the block boundary badly wrong before that — it guessed a start 2h50m
too early — so *do not trust an uncalibrated reading*; ask Aaron for one `/usage` number instead.
Blocks run on a fixed 5-hour cadence from the anchor, so the calibration keeps working across
blocks. Re-calibrate with `node ~/cc/usage/usage.mjs --calibrate <pctUsed> <hoursLeft>`.

**2026-08-24 (D42): report-only. It must NOT justify concurrency until verified.** Budget: average under 19–20%/h. Measured 2026-08-24 with four agents running: **7.5%/h**,
projecting 37% at block end. **Agent count is not burn rate** — an agent waiting on the Flux queue
or Kokoro costs almost nothing, so judge on the measured rate. There is no way to pause a running
agent; the levers are stopping one (loses its work — reserve for genuinely stuck agents) and not
starting the next phase.

## The check-in cron

A 30-minute health check fires at **:13 and :43** — job **`154dea7d`**, created 2026-08-23. It is
**session-only and dies with the session — recreate it after any restart.** It checks agent
liveness, that `:7867`/`:7866` are contactable, and that files are still landing under `docs/`. It
is explicitly told not to restart agents or spawn new ones without asking. Aaron asked for 45 min;
45 does not divide an hour cleanly (`*/45` alternates 45- and 15-minute gaps), so it was rounded to
30, matching the NEONHAUL cadence.

## Concurrency windows granted so far

| when | grant | used for |
|---|---|---|
| 2026-08-23 | up to 4, all starting within 15 min | the four planning agents A–D |
| 2026-08-23 | 2 *additional* agents, 15 min only, "smallish tasks" | E (gouache-drift A/B) and F (Kokoro voice audition) |

| 2026-08-24 | 3 concurrent, "back to single once they all complete" | BUILD_PLAN, G (poster.js + D39), H (audio engine + sustain) |

**Every window is spent and specific to its batch. Revert to one agent at a time.** The reason is
Aaron's usage limits, not speed. He granted the third window because the session had sat idle for
its first two hours — that was the manager wrongly waiting for permission, now fixed by D40.

## Phase status

**The provisional P0–P11 table is superseded by `BUILD_PLAN.md`'s P1–P17.** Read the phase brief
there, not a table here. Planning (the four docs, the two spikes, the build plan) is complete and
committed as `f2d77c9` on `main`.

| | phase | state |
|---|---|---|
| P0 | planning: 4 docs, 2 spikes, BUILD_PLAN | ✅ committed `f2d77c9` |
| P1 | engine port A — `gfx/`, `parts.js`, parallaxY, ramp sampler, painterly geometry | 🔄 |
| P2 | engine port B — `core/`, camera/zoom, input, **sustained audio**, CDP harness | 🔄 audio layer in flight |
| P3 | sky, ramps, art pipeline — `poster.js`, LUTs, cloud/FX/hero atlases | 🔄 both halves in flight |
| P4–P17 | see `BUILD_PLAN.md` | ⬜ |

**P8 is the PORTRAIT GATE** and is manager-run. A FAIL goes to Aaron — it is the one decision D40
does not delegate. **P10 is FIRST PLAYABLE**: commit, push, `projects.js` with `wip: true`.


Phase numbering after P0c is provisional — `BUILD_PLAN.md` supersedes it.

## The four planning agents (batch of 2026-08-23)

Disjoint file ownership, deliberately, so four concurrent agents cannot corrupt each other:

| agent | owns | reconciliation risk |
|---|---|---|
| A architecture | `docs/ARCHITECTURE.md` | renderer port verdict; the portrait gate's numbers |
| B design | `docs/DESIGN.md` | its 100-level table vs D's act beats; economy vs mode list |
| C art | `docs/ART.md`, `docs/refs/` | per-act palettes vs B's act theatres and D's act beats |
| D story/audio | `docs/STORY.md`, `docs/SUNO.md` | act level-ranges vs B's table; cast vs B's ace roster |

**Every one of them was told to flag cross-document assumptions as REQUESTs. The manager reconciles
— the agents cannot, they never see each other's files.** Expect the act structure (5 acts × 20
levels) to be the main seam: B, C and D all independently design against it.

## Decision authority — READ THIS BEFORE ASKING AARON ANYTHING

**2026-08-24, D40: build the complete game without checking in.** When a phase reports and verifies,
spawn the next one immediately. **Playtest is the only checkpoint** — do not ask for design, art or
tuning opinions before there is something to play. Report non-obvious calls as you go; a report is
not a question. One build agent at a time still stands (usage limits).

Both former open decisions are **closed**: the name is **KITEHAWK** (D13) and the renderer is a
**port of Sunderfall's batcher** (D14), both ratified by Aaron on 2026-08-23.

Since 2026-08-23 the manager **makes all subsequent calls without asking** (D15). Decide, proceed,
and surface the *non-obvious* calls in a short summary — a call is non-obvious when a reasonable
person would have chosen differently, when it forecloses something later, or when it changes what
the game *is* rather than how it is built. Most calls are tweakable later; say when one is not.

Still goes to Aaron regardless: anything irreversible or outward-facing, and the portrait→landscape
pivot if the D2 gate fails.

## Verification the manager owes

When the four report, do not accept them at face value:
- Confirm each doc exists, is the size claimed, and that no agent wrote outside its ownership.
- Check A actually read the Sunderfall renderer source rather than describing it from its doc.
- Check C's Flux probe images actually exist on disk in `docs/refs/` and look at them.
- Check B's 100-level table really has 100 rows and that D's act ranges match B's.
