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

**Both windows are spent and specific to those batches. Revert to one agent at a time.** The reason
is Aaron's usage limits, not speed.

## Phase status

| | phase | state |
|---|---|---|
| P0a | shared manager brief | ✅ `MANAGER_BRIEF.md` |
| P0b | **4 planning docs in parallel** — architecture / design / art / story+audio | 🔄 running |
| P0c | manager reconciles the four docs, resolves REQUESTs, writes `BUILD_PLAN.md` | 🔄 A/B still editing |
| P0d | E — gouache drift A/B on hard-surface/FX subjects (`ART_AB_FINDINGS.md`) | 🔄 blocks the terrain atlas |
| P0e | F — local Kokoro pipeline proof + one-line-per-character audition (`VO_AUDITION.md`) | 🔄 |
| P1 | scaffold + renderer port + **sustained-audio layer** + test harness | ⬜ |
| P2 | sky, parallax, art pipeline first plates | ⬜ |
| P3 | **flight model → PORTRAIT GATE** (keep portrait or pivot to landscape) | ⬜ |
| P4 | combat + parachute crates | ⬜ |
| P5 | level format + generator → **FIRST PLAYABLE, first commit + projects.js entry** | ⬜ |
| P6 | story delivery + the 100 levels | ⬜ |
| P7 | the other five modes | ⬜ |
| P8 | hangar, upgrades, economy, save | ⬜ |
| P9 | audio: aviation SFX set (`SFX.md`) + SUNO/Kokoro assets | ⬜ |
| P10 | art pass + blind critic rounds | ⬜ |
| P11 | polish, perf, ship | ⬜ |

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
