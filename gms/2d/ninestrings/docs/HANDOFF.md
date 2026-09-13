# NINE STRINGS — Handoff log

Append-only. Newest entry at the bottom. The most current truth lives here.

---

## 2026-09-14 — manager — Phase 0 opened

Project created at `gms/2d/ninestrings`. Design, contracts and build plan
written before any code, deliberately: the last multi-agent build in this repo
found that cross-file contracts are the wall, so the contracts are frozen up
front and agents build to signatures rather than negotiating them.

Decisions already taken (see DECISIONS.md): WebGL2 not Canvas2D, procedural
sprite atlas not generated PNG sprites, DOM menus + canvas HUD, procedural
audio, fixed 60Hz sim step, `world.events` as the only sim→host channel.

`tools/cdp.mjs` copied verbatim from SILT — it is a proven headless harness and
there is no reason to write a second one.

## 2026-09-14 — manager — Phase 0 DONE

Spine is up. `index.html` + `css/style.css` + all of `js/core/**` are real and
tested; every module in CONTRACTS exists as a contract-shaped stub; `js/main.js`
is the host with a fixed-step loop, `?auto` bot, and a Canvas2D placeholder
renderer so the page is never blank during the build.

`node tools/boot.mjs --allow-placeholder` → boots, ticks, soaks 600 frames, no
console errors. `--falsify boot` goes red as it should.

Two gotchas already paid for, recorded so nobody re-pays them:
- `window.__ns` is defined as a **data** property. An accessor swallows the
  falsify arm's poke and turns the gate green when it should be red.
- `js/main.js` loads every subsystem through `optional()`, which records
  failures in `window.__ns.missing` instead of taking the page down. The boot
  gate asserts that list is EMPTY, so a module that quietly fails to load is a
  gate failure, not a silent degradation.

Lane status files created at `docs/lanes/*.md`.

## 2026-09-14 — manager — portrait is a rule, not a preference

Aaron restated mobile-first portrait mid-build. It was already the spine (fixed
420 world units of visible width, safe-area insets measured by `viewport.js`,
drag-anywhere thumb stick, boot gate on a 390x844 viewport), but "already
implied" is how requirements quietly rot, so it is now written down as
**DESIGN 8.5** and as **standing order 0** in BUILD_PLAN, with the three gate
viewports named: 390x844, 360x640, 430x932 at DPR 2.

The load-bearing parts for any lane picking this up later: bottom-half reach for
anything touched during a run, >=44px hit targets, no body text under 12px, and
the strings must read by GLOW rather than by precision because a 1px line does
not survive a phone screen.

## 2026-09-14 — manager — Lane A-fx accepted, CONTRACTS §9.3 widened

`particles.js`, `camera.js`, `postfx.js` are in and verified in a **real**
WebGL2 context (shaders compiled and linked, zero `gl.getError()` at every
quality level, pixel readback shows a lit vignetted composite — not the
NaN-black failure).

Four additive contract requests accepted and written into §9.3: camera
`update(dt, world)` / `punch(z)` / `trauma`, particles `setBudget` +
`setSpriteResolver` + exported `PRESETS`, postfx `resize()` and the fact that
`makePost` returns a no-op object rather than null.

Two things worth keeping in mind for later lanes:
- **Do not feed `camera.trauma` into the postfx `shake` uniform.** The camera
  already shakes the world; the post uniform exists only for wobbles the camera
  should NOT have (a boss screen-wobble with the camera locked). Doubling them
  looks broken.
- The shake ladder was **measured, not guessed** — the first pass was invisible
  (1.4% of screen width) because a 62 rad/s spring low-passes a 27Hz noise
  target into nothing. This is the kind of thing that reads as "feels flat" and
  gets mis-diagnosed as a design problem. Amplitudes are tabulated in the lane
  file; `shake(3)` = 15.7u = 3.7% of the 420u width.

`postfx.js` is written but **NOT wired**; the exact lines are in the lane file
and belong to whoever finishes `renderer.js`.

## 2026-09-14 — manager — Lane C-content accepted; CONTRACTS §8.1/§8.2 widened

24 enemies (incl. 4 Choirmasters with 3 descending phases each), 12 stages
(480s→1200s, maxAlive 60→380), 16 weapons, 12 passives, 10 evolutions. All in.

**The lane falsified its own validator before trusting it** — four deliberate
breaks (bogus timeline enemy id, `maxAlive: 480`, a 6-delta weapon, a bogus rig)
all went red, then green on revert. That is the only reason its "passes clean"
means anything, and it caught four real defects on first run: two evolutions
that changed only numbers (now chain→aura and strike→zone), a Conductor cadence
outside the 60–90s band, and a stage whose mid-point out-paced its own finale.

Three contract requests granted, all additive:
- **R2 `WeaponDef.target`** — the important one. Four weapons' entire identity is
  *what they aim at*; without this the sim would hard-code four weapon ids.
- **R1 `levels[].flags`** — a level step may carry behaviour, not only numbers.
  `js/sim/weapon.js` owns the vocabulary and must record it in its lane file.
- **R3 `EnemyDef.hover`** — was being smuggled through `aiParams.hover`.

Lane C-content's file also holds the `aiParams` vocabulary per AI kind, the boss
`phases` schema, the TTK/DPS curve the numbers were written against, the 24
sprite keys by rig (120-frame atlas budget — Lane A-render should check this
against its own occupancy figure), and the ambiguous `base` field meanings:
**`orbit.speed` is rad/s, `chain.count` is jumps, and `knock` may be negative**
(a pull). Anyone implementing `js/sim/weapon.js` must read that section.

## 2026-09-14 — manager — the lanes died mid-flight; solo completion

A spend limit killed all five running lanes at once, mid-edit. What survived was
more than expected: every file was syntactically valid, all 16 Flux images had
generated, and `world.js` had been written with a `_lanes` indirection that lets
a missing module degrade instead of crashing. **No lane wrote its status file**,
so everything below was reverse-engineered from the code.

### What was missing entirely, and is now written (by the manager)
`js/sim/strings.js`, `conductor.js`, `weapon.js`, `projectile.js`, `pickup.js`,
`boss.js`, `behaviours.js`, and `js/gfx/hud.js`. That was the whole combat and
strings system — the sim ran, but nothing could fire, cut, or be picked up.

### Cross-lane defects found at integration (the expected failure mode)
These are what "cross-file contracts are the wall" looks like in practice:

1. **Choir colour convention clash.** The renderer read `choirColour` as an
   INDEX into `stage.palette.choir`; `scenefx` read it as a packed 0xRRGGBB int.
   Unified on the index — it is what gives each act its own palette. `scenefx`
   now takes `setStage(stage)` from the host.
2. **Shake scale mismatch.** The sim authors shake on a 0..25 intensity scale;
   the camera saturates at 3.5. Passing it through raw made *every* hit a
   maximum screen slam. One documented conversion now lives in `scenefx`
   (`SHAKE_SCALE`), and the duplicate shake events in `damage.js` were removed
   because `scenefx` already shakes for those events.
3. **Chromatic aberration was ~50x too strong.** `off = d * uChroma * (0.25 +
   dot*2.0)` shifted red and blue by 28% of the screen. The HUD was unreadable
   rainbow ghosting. Now `(0.006 + dot*0.030)`, max ~2.6px.
4. **`ui-*` classes were never styled.** Lane D wrote its CSS *inside*
   `js/ui/components.js` (id `ns-ui-lane-d`) because it was told not to edit
   `css/ui.css`. Adding the same rules to `ui.css` made two stylesheets fight.
   **`css/ui.css` must NOT define `ui-*` rules** — there is a note in it saying so.
5. **`.ui-title` / `.ui-lu` were `position: relative`**, so they sized to content
   and pinned to the top: the title filled 40% of the phone and the level-up
   sheet — the most-used screen in the game — sat under the notch instead of
   rising to the thumb. Both are now `absolute; inset: 0`.
6. **Menus had no background**, so a live run rendered through the results text.

### Design problems the balance harness found (not bugs — design)
Each of these was found by measurement, not by reading the code:
- **The starting weapon could not hit anything above or below you.** `fireArc`
  used `p.facing` (±1 on x). On a portrait phone that is most of the screen.
  Arcs now sweep a cone and **seek a target** — the player controls position,
  not aim, which is the premise of the genre.
- **Kiting was a dominant strategy.** 480 seconds, 418 swings, *zero kills*, and
  a victory on the survival timer. Three causes, all fixed: the spawn ring was
  uniform (now leans into the player's heading), enemies the player outran still
  occupied `maxAlive` (now recycled in front), and the player was simply too
  fast — 90 against a median enemy 26. **Player speed is now 62**, chosen so a
  crawler (62) matches you and fenlice (78) outruns you.
- **Later acts were arithmetically unreachable, not hard.** A level-1 character
  entering Stage 11 died in 9s having killed nothing. Three fixes: a 90s spawn
  **warmup** so every stage opens gently and grows into its own ceiling; an
  act-scaled **seeded build** (`ACT_SEED` in `world.js`) so you arrive in Act IV
  experienced rather than naked, granted silently; and **armour is now a
  percentage**, not a flat subtraction — flat armour 26 against 20-damage hits
  made multi-hit weapons do 15% chip damage forever.
- **The HP and damage curves were compressed** (see the note at the top of
  `js/data/enemies.js`). HP ran 273x across the game against a weapon set that
  grows about 12x.

### State: playable end to end
`title -> BEGIN -> story -> run -> level-up -> results -> souls -> Sanctum
unlocks` all verified by a scripted CDP run from a genuinely empty save.
All 12 stages run headless to completion with no crashes, no cap breaches, and a
**1.5-2.0ms peak sim step** against a 16.6ms budget.

### Known gaps — the honest list
- **Balance beyond Act II is not finished.** A generic bot clears Stage 1 and
  dies at 1-9 minutes on the rest; Stage 11 is still the weakest (47s). A real
  player specialises and carries Sanctum upgrades, and the bot does neither, but
  this needs a proper pass with `tools/` harnesses, not more guessing.
- **Sigils, relics and curse tiers are DATA ONLY.** `js/data/sigils.js` and
  `relics.js` are written and validated, but nothing in the sim reads a sigil's
  rule yet. `stats.js` folds relic `apply()`, so relics partly work; sigils do not.
- **Bosses are implemented but never reached** in any test run.
- **Art:** the `bloat` rig still reads closer to a ghost than a swollen corpse,
  and the `crawler` reads as a starfish. `docs/lanes/A-render.md` was never
  written; the last thing that agent said was that it was mid-rebuild of the rig
  proportions.
- **Audio is written but unheard.** `js/audio/**` is complete and never throws,
  but nobody has listened to it — the gates run with `--mute-audio`.
