# Manager state — KITEHAWK

## ⏸ PAUSED 2026-08-25 ~09:45, weekly usage at max. START HERE.

**Aaron paused the run because the weekly limit was reached; it resets ~13:55 the same day.** Nothing
is broken and nothing is half-written — the pause was clean and the handoff docs are current.

### Resume in this order

1. **`--p5gates` RAN and finished: 5/10.** It is no longer unrun. Read this before treating it as a
   regression — most of it is not:
   - **C4, C5 and C6 were already failing and are deliberately stale** — D89 says so by name, and D83
     recorded counter-play at 4 of 11. **Do not re-fit them here**; they belong to P11's balance pass.
   - **C2 fails** (player TTK 9.78 s) — check against `P5_NOTES` before assuming it moved.
   - **C7 IS THE ONE TO CHECK FIRST: 46.0% of 774 decisive (±1.8).** D87 recorded **48.9% ± 1.8**
     across five airframes and 49.6% over 1,200 duels. The interval has moved from one that contained
     50% to one that does not. **The obvious suspect is D128's minimum enemy hull 64 → 66 wu** — if
     that constant reaches a collider or damage geometry rather than only framing and art, it changed
     every duel. **Establish whether it does before touching anything**, and do it the way this project
     does: re-run C7 with the hull pinned back to 64 and see whether the interval returns. If it does,
     the fix is to split the constant, not to move it back — Aaron ratified 66 (D128) and the P3 guard
     depends on it.

2. **Finish the K5 re-specification (D139).** The P9 agent was stopped at the exact moment it started
   this and no part of it landed. Re-specify K5 onto **HP per sortie** (continuous), keep the death
   rate as a reported secondary so the regression stays visible, and **falsify it — remove the
   reinforcement ladder and the new number must go flat or negative.** `--p6gates` currently reads
   8/10 with K5 at 0 points, and D139 explains why the ladder is fine and the instrument is not.
3. **Finish P9**: `level.js`/`act.js` (written to satisfy the validator, not the reverse), then
   `terrain.js`, `spawner.js`, `genlevels.mjs`, the four worked levels, `level.html`.
   `docs/P9_NOTES.md` has a status board and the next concrete action at its top.
4. Then **P10 FIRST PLAYABLE** — commit, push, `projects.js` with `wip: true`. Three things at that
   point, in order:
   - **`git pull --rebase` FIRST, and only once no agent is writing.** Other sessions are committing
     to this tree; `main` moved to `47ffad5` during P9 (a structural restructure — `q m m2 e e2 k d d2
     mcaddons` are now under `app/`, and `ai/ t5/ n/ i2.html` are deleted). Nothing under
     `gms/2d/kitehawk/` was touched.
   - **Run a `projects.js` validator before adding the KITEHAWK entry** — walk `PROJECTS`, and
     `fs.existsSync` both the `path` and `assets/screenshots/<screenshot>.jpg`. Four lines of node.
     Session cc-91 ran exactly this tonight and it found **four dead entries where eyeballing had
     found one**, including a tile dead long before that session started. **A registry-driven page's
     "is this referenced?" has to be asked of the registry, not of the page that looks like the index.**
   - **Stage explicitly by path.** Never `git add -A`: other sessions have open work in this tree.

**Landed and verified before the pause**, so do not redo: the D137 skygate frame guard, `world.js` §2
+ `worldgate` 9/9, `validate.js`'s W1 7/7, and REQUEST-8 (`CARD_MAX_CHARS` now lives in
`js/core/content.js`).

### The standing rule that came out of this run

**A re-specified criterion is not evidence until its break-switch has been RUN and seen to go red.**
Five criteria were re-specified between P8 and P9, and **D114 — the manager's own — was wrong exactly
because that step was skipped**: the deliberately-broken controller scored *greener* than the shipped
one. Eight metrics on this project have now read clean while the thing they measured was broken.

---

## ▶ RESUMED 2026-08-25. Context for the above.

**Read order for a fresh or compacted manager: this section → `DECISIONS.md` (all of it, D1–D117;
it is the authority and it overrides every other document) → `MANAGER_BRIEF.md` → the phase brief you
need from `BUILD_PLAN.md`. Never read `BUILD_PLAN.md` whole — it is 128 KB and each brief is
self-contained.**

### Where the build actually is

Everything through **P7 is done, verified and pushed**. The game is **not playable yet** — first
playable is **P10**, three phases out.

| done | P0 planning · P1 renderer · P2 core/camera/input · audio engine · P3 sky+atlases · P4 flight · P5 combat/AI/duel · P6 crates · P7 HUD · camera-anchor fix |
|---|---|
| **in flight** | **P8a — the portrait gate's INSTRUMENT.** One agent builds `tools/gates_portrait.mjs`; the manager keeps the verdict (D117). |
| then | P8 verdict (manager) → P9 world/level format → **P10 FIRST PLAYABLE** (commit, push, `projects.js` with `wip: true`) → P11 the 100 levels → P12 story → P13 hangar → P14 modes → P15 audio content → P16 art pass → P17 ship |

### P8 has RUN. It does not return a clean verdict, and one call is Aaron's

Read **D113–D122**. The instrument exists (`tools/gates_portrait.mjs`, `p8engage.mjs`,
`p8stability.mjs`; record at `shots/portrait/gate.json`), measured over **121 engagements /
95,449 engaged ticks**, portrait *and* landscape, every criterion with a break-switch that was run.

**The two results that matter:**

1. **P0 fails for a reason that is not portrait, and is fixable.** `zoomLockRange` (1400 wu) serves two
   opposite jobs: capping zoom-IN in `camera.js:267`, and admitting framing-box members in
   `entities.js:552`. `boxW` is therefore a restatement of the admission radius, p90 reads **935.6 wu
   against a 585 wu pivot signal, and BOTH orientations fail.** Separate the jobs and portrait P0
   **passes at 0.1654 against a 0.06 bar**, for 0.5 points of on-screen time; landscape stays NEITHER
   at 0.0337 at every radius, because it is height-bound. **D120. The 700 wu value is a sweep point and
   is still underived — derive it before it ships.**
2. **P2 is the real portrait verdict and it is geometry.** In-frame warning median **0.03 s portrait vs
   1.28 s landscape**; 25.7% of attackers reach gun range having never been on screen, vs 3.9%.
   Falsified at portrait's best possible case — pinning the camera at `zoomWide` leaves it FAIL. Cause:
   the frame reaches **404 wu ahead at the clamp floor against a 440 wu gun range**, so an attacker
   becomes visible as he opens fire. Landscape reaches 888 wu. **D121.**

Portrait still gets the full **1.75 s** of warning — via the altitude tape and edge chevrons (§4.2),
not via the picture. **Whether that is enough is a playtest question, not a measurement one.**

**Also recorded, and not to be quietly re-litigated:** D118 — `?track=sticky` is inert against every
real driver, so D61's headline evidence is void and Z6 tests a dead code path. D119 — **my own D114
re-specification was wrong**: its break-switch stayed *greener* than shipped; superseded by PUMP
windows, which falsify in both directions. D122 — P3b cannot fail, P1 has a gap the shipped 263 wu
sits in, P3c restates P0, and §4.4.1's spec figures have drifted from the shipped gates (1,053 wu dive
recovery vs a measured 585).

### ✅ AARON RATIFIED THE PIVOT, 2026-08-25: LANDSCAPE-PRIMARY (D123)

Decided on D121: portrait gives **0.03 s** of in-frame warning against landscape's **1.28 s**, and no
legal zoom changes it — portrait's frame reaches 404 wu ahead against a 440 wu gun range. **D1's
"mobile-first portrait" is superseded. §4.4 is now read-only history.** `VIEW_PROFILE.landscape` is the
tuning target; portrait stays a first-class supported config; **no code moves** — §4.1's two profiles
are the insurance and this is the first time it has been spent.

**The pivot is not free — read D124 before treating landscape as sound.** Landscape's own P0 is
**NEITHER at 0.0337**, it is *height*-bound on the 585 wu dive recovery, and **no art lever moves it**
(raising the hull grows raw overlap but the in-clamp width stays pinned by the clamp floor). Verified
on the harness: clamp floor **`zoomWide` 0.78 → 0.74** *plus* **minimum enemy hull ≥ 66 wu** gives
**0.0737 — PASS**. Both are needed and both are named levers (§11, §4.4.1). **Raising `zoomFill` to
0.90 also passes and is rejected** — it is the manoeuvre the brief forbids by name.

### P8 IS CLOSED. The next action is P9 → P10 FIRST PLAYABLE.

P8a built the instrument, P8b audited landscape measure-only, P8c retuned it (D128–D132). Read
`docs/P8C_NOTES.md` (1,152 lines) for the detail. Where landscape now stands, verified by the manager:

| | value | |
|---|---|---|
| P0 in-clamp | **0.0737** | PASS, 23% clear |
| P3 at the floor | **34.01 px** | PASS by 0.03% — knowingly (D128), guarded by `tools/p3guard.mjs` |
| P2 in-frame median | **1.23 s** | vs portrait's 0.02 s |
| P2 p05 | **0.35 s** | **still FAILS** against 0.45 |
| H5 | **0.00%** | was 23.92% |
| clamp-discarded lead | **6.0%** | was 49.8% |
| H11 | **median 15.4%, 9/10 runs over the 2% cap** | **FAILS** — D132, routed to P13/P16 |

**Two reds are open and deliberately not chased: P2's p05 and H11.** Both are ergonomics, and D84 and
D40 both say the same thing — **playable beats exhaustive, and playtest is the only checkpoint.** They
get decided with a controller in hand at P10, not by another gate round.

### Before P10 ships, one shipped-code bug must land (D131)

**`js/core/input.js` loses the held stick on `view:change`** — rotate a real phone and the player's
control drops. `orient.mjs`'s "a held stick survives every rotation" passes *because* of it, so **the
fix and the assert land together or neither is evidence.** Small, and it is the last of its class.

### Do not touch the cloud atlas (D131)

`tools/pages/sky.html:26` hardcodes `worldH: 1000`, so P8B's landscape A4 failure was measured on a
frame the game never draws. Fix the harness first; the variety budget may not be wrong at all.

### Then P9 — world, terrain, level format, generator

`BUILD_PLAN.md` §P9. Its first job under D126 is re-proportioning how the altitude ladder *reads* in a
560 wu frame — signature elements, crossfade timing, the establishing crane — **not its metres**, which
are physics-facing and fixed by D26. **P4/P4b have never been measurable** and P9 is what makes them so.

Then **P10 FIRST PLAYABLE**: commit, push, `projects.js` with `wip: true`. **That commit needs a
separate worktree for `main`** — this tree is on another session's branch (see below).

### The rule the whole resume turned on

**Falsify the instrument.** Every number above was distrusted until a positive control moved it.
Three metrics on this project have already read *clean* while the thing they measured was broken
(D99, D105, D109); D115 is the fourth and the most consequential, because the number it would have
produced decides the orientation of the entire game.

### Usage — the binding constraint this week

Aaron has **little weekly usage left as of 2026-08-25**; it resets later the same day. He said plainly
that an agent will probably **not finish**. So: **one agent, briefed to checkpoint into
`docs/P8_NOTES.md` as it goes and to treat that file as a resumable handoff**, not a report written at
the end. A killed agent must leave the next one able to continue.

### The check-in cron is still DELETED, on purpose

Recreate it only when a run is genuinely unattended. The prompt is in the run log; it leads with
`node ~/cc/usage/usage.mjs`, reports usage as information only, and enforces one agent at a time.

### The repo is back on `main` (2026-08-25, fixed by another session)

`~/cc/yru/site` was parked on `claude/forge-game-checkpoint` — 35 commits behind `origin/main`, 0
ahead, everything on it already in main — which is why the whole game read as untracked. Session
`cc-91` moved HEAD back to `main` @ `e31f0dc` with `symbolic-ref` + `reset`, touching nothing on disk.
Confirmed here: `## main...origin/main`. **The separate-worktree workaround is no longer needed.**

**KITEHAWK now shows as real modifications, which is correct.** Other sessions are committing to this
tree, so the staging rule matters more than before: **stage paths under `gms/2d/kitehawk/` explicitly,
plus one `projects.js` hunk and the screenshot. Never `git add -A`** — there are ~21 uncommitted paths
outside kitehawk belonging to other live sessions.

**cc-91 has been asked not to commit under `gms/2d/kitehawk/`** and to tell us if it needs to sooner;
message it when P10 lands so it knows the prefix is free.

### Two things waiting on Aaron, neither blocking

1. **The voice audition** — 15 clips in `docs/vo_audition/`. Mainly: is Drach menacing enough, or is
   the one SUNO take worth generating?
2. **One `/usage` reading** to recalibrate `~/cc/usage/usage.mjs`. See `~/cc/usage/VERIFY.md`.

---


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

## ⚠ P7 IS RESUMABLE — RESUME IT, DO NOT RESPAWN IT

**2026-08-24 ~16:00: P7 (HUD) has been killed twice by server-side `529 Overloaded` errors**, not by
any fault in its work. The second kill produced no new files, so the API is under sustained load —
**do not retry in a tight loop.**

Its partial work is intact on disk: `js/ui/{theme,alttape,overlay,stick,cards,layout,hud}.js`
(~63 KB) plus `tools/pages/hud.html` and `rigdef.json`. **Resume the existing agent with
SendMessage — a fresh spawn throws away both those files' context and everything it had worked out.**
Its agent ref is in the run log; if it cannot be resumed, tell the new agent the files already exist
and to continue rather than restart.

The next check-in is the natural backoff (~30 min cadence). If 529s persist across several
check-ins, say so plainly rather than burning attempts.

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
