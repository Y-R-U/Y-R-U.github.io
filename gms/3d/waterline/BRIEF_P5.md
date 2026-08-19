# P5 — four things Aaron asked for after playing on his phone

You are the only coder agent running. P1–P4 have landed; skim `HANDOFF_P4.md` and `HANDOFF_P3.md`
for what moved recently.

Read `DECISIONS.md` **D43, D44, D45 and D46** first — they are the rulings this brief implements and
they carry my measurements. I reproduced items 2 and 3 before writing this, so you are not
diagnosing, you are fixing. Then the standing rules at the bottom of that file, and `MANAGER.md`.

---

## 1. A privacy blank on the own-fleet box

> Have an icon on the small your fleet view (top right corner) to flip screen/show black or grey
> there instead - e.g. if 2 people are playing in the same room.

Two people on one phone. The top-right box shows **your** grid and your ship positions, which is
exactly what the other player must not see while looking over your shoulder.

Add a small control on that box that blanks it — a plain filled panel, and an icon that says which
state it is in. Tapping it again brings the grid back. It is a comfort control, not a security
feature; don't build a password.

Watch three things:

- **The box is already a button** (`[data-fleet]` in `js/ui/hud.js`) and P3 made it open the layout
  editor. The blank control must not eat that tap, and the box must not open the editor when you
  meant to hide it. Both targets need to be 44 px.
- **The blank must survive `paint()`**, which rewrites the grid's classes every turn, and it must
  survive a save/resume — if it did not persist it would flash your fleet at exactly the moment you
  hid it for.
- **The roster line under the grid** (`[data-roster]`) states how many of your ships are still
  afloat and their sunk lengths. Decide whether that is private too and say why in your handoff.
  Then be consistent: hiding the grid and leaving a full readout of your fleet beside it is not
  hiding anything.

There is a settings dialog (`flow.js`, `showSettings`) if you judge this belongs there as well as on
the box. Aaron asked for it **on the box**, so the box is the requirement and settings is optional.

## 2. Pull the chase camera back — D45

> when following the bullets/missiles, zoom out a little more when it travels

`shell_chase` in `js/cine/sequences.js` sets `rig.fov(42)` and stations the camera about 15 m off
the round on fixed offsets scaled only by shell calibre. In portrait that is roughly **5.3 m of
frame width** at the round; landscape gets ~20.5 m. Aaron is reading the 5.3.

D38/D42/D45: solve it from the subject and `ctx.aspect`. Do not simply raise the number until the
portrait still looks right — landscape must not lose the intimacy it currently has, and the same
constant cannot serve both. Verify at 390×844 **and** 1600×900 and state both frame widths.

`impact_miss` and `enemy_volley` have the same hard-coded-offset shape. D45 covers them. Fix them in
the same pass and report their numbers; if you judge one of them already reads correctly in
portrait, say so with the measurement rather than skipping it silently.

## 3. A hit must land on a visible ship — D43 and D44

> the main problem when you hit someone there is no visible ship being hit. we should see a ship
> being hit - atm it looks like the water being hit instead. We need to ensure the explosion on the
> ship looks great

**This is the big one and it is a real design problem, not a bug you can patch in a line.**

The enemy fleet you can see is drawn from `dramaSeed` in `flow.js` `layoutFleets()` and has no
relationship to where the enemy's ships actually are — it cannot have one, because the sim will not
tell the renderer the enemy layout and must not. So `fleet.shipAt(1, r, c)` in `sequences.js`
`resolve()` returns null for nearly every hit, `at` falls back to the bare grid cell, and the
explosion goes off on open water.

Reproduced, portrait, first hit of a real match: **nearest dramatised enemy hull 46.3 m from the
explosion.** My probes are in the scratchpad —
`/private/tmp/claude-501/-Users-aaronair-cc/15d17c89-707f-4970-b598-403e046bb422/scratchpad/`:
`wl_cdp.mjs` (the harness), `wl_hit2.mjs` (fires at a true enemy cell with cinematics on, traps
`vfx.hit`, measures the nearest hull, and captures the beat). `impact_0.png` and `impact_2.png` are
what Aaron is describing. Copy, don't edit in place.

**D43 is the ruling: the dramatised fleet must stay consistent with everything the player has been
shown.** Every revealed hit has a hull on it, every revealed miss has open water, a sunk ship's
revealed cells are covered by a hull of exactly that length — and nothing about the *unrevealed*
board may leak into the arrangement. Check that last point deliberately and say in your handoff how
you know it holds; a dramatisation that quietly tracks the truth is a cheat that hands the player
the enemy's layout, which is D8's whole subject.

The machinery exists: `fleet.reform()` (P3) steams escorts along Bézier courses, and a shell has
1.5–2.5 s of flight during which the camera is chasing the round and not looking at the target. A
ship moving to be where the shell is about to land is legal in this fiction and is masked.

Two ordering facts you will need. `present()` receives `events` **already resolved** — the outcome
of the shot is known before the first beat plays, so there is time to move a hull into place. And
`resolve()` is called *after* `shell_chase` and before the impact beat.

Sunk is the case that will catch you out: a sunk ship reveals its exact cells and length (D6), so
whatever hull you moved over those cells earlier must turn out to be the right length. Work out what
happens when it isn't, and handle it — a re-pack under the full constraint set is one answer, and it
is not the only one. Say which you chose and what it costs.

**Then make the hit look like a hit — D44.** The vocabulary is already built and blind-scored: the
`hit_explode` scenario in `js/world/vfx/impact.js` uses `emit.hit(target.hullSide(...))`, two
**hull-attached** `emit.fire()` and `target.setDamage()`. Live play uses a bare point explosion and
only reaches for `vfx.fire` on a sink. Bring the scored look into play. Fire that rides the ship,
damage that stays on the model, and a struck hull at the waterline rather than a fireball on the
sea.

`impact_hit` must then frame **the struck hull**, not the grid cell — with an aspect term, per D45.
Its current eye is `at + (-40, 26, -66)`, about 83 m out, which is ~29 m of portrait frame against a
ship up to 115 m long.

Costs to watch: `hit_explode` is a heavy scenario and this is a live match with a 120-call ceiling.
Report draw calls and texture MB in a real match with three burning ships in frame, and if you have
to spend the look down to afford it, say by how much.

## 4. Say plainly that the sea view is a mock-up — D46

> we also need the message to be clear (at top of screen?) that tells you ship/ship location and hit
> location is not being shown reflected. i.e. mock view only being shown.

The notice exists — `js/cine/caption.js`, fixed by D2 at "Positions dramatised", long form once per
match, 1.4 s, tracking the shell. Aaron has played whole matches and is asking for it as though it
were not there. That is the only evidence that counts.

D46: D2's brevity stands **for the in-flight caption**; it is not the whole notice. Make it possible
to learn, early and in a fixed place, that the ships and the impacts on the sea are illustration and
that the chart is the truth. Aaron suggests the top of the screen. D2's ban on legal padding stands
— no "for illustration only", no "not to scale". Say the true thing plainly.

You own the wording. Show me what you chose, in a portrait screenshot, at the moment a player would
first meet it.

---

## What you own

`js/ui/hud.js`, `js/ui/flow.js`, `js/cine/sequences.js`, `js/cine/caption.js`, `js/world/fleet.js`,
`js/world/vfx/` where item 3 needs it, `style.css`, and the relevant blocks of `js/config.js`.

**Do not touch:** `js/sim/` — the dramatisation must never read the true enemy board, so if you find
yourself wanting a sim change to make item 3 work, stop and say so, because that is the cheat D8
forbids. `js/main.js` is frozen; ask and I will rule.

Scenario renders: `tools/shot.mjs --shot=<id> --dpr=1 --w=1600 --h=900` — never
`--dpr=2 --w=1280 --h=720`, which hangs. Per D13 a pixel diff means nothing without a same-code
control, rendered next to what it controls for.

## How to prove it

Drive the real game headless over CDP. The harness is `wl_cdp.mjs` in the scratchpad above; it
boots a portrait phone emulation, disables the cache and uses a fresh profile (D28). Traps that have
already cost this project time: `awaitPromise: true` on `flow.fire()` waits for the whole turn
(D36); `document.querySelectorAll('button')` finds the **hidden** HUD, so identify a screen by
`document.body.dataset.screen` (D39); and a screenshot taken on a guess will miss a two-frame effect
— trap the emitter and capture on the frame it fires (that is how D42's numbers were confirmed).

Deliver, as images read back with the Read tool and as measurements:

1. the own-fleet box blanked and unblanked, portrait, and proof the blank survives a paint and a
   resume
2. `shell_chase` frame width at the round, portrait and landscape, before and after; same for
   `impact_miss` and `enemy_volley`
3. **a real hit in a real match, portrait, with a hull under the explosion** — the same shot as
   `impact_0.png` and unmistakably different; plus the measurement that replaces "46.3 m"
4. evidence the dramatisation leaks nothing: fire a series of shots and show that the shown fleet is
   consistent with the revealed board and **not** with the unrevealed part of it
5. the notice, portrait, at the moment a player first meets it
6. a full soak after your changes — ten turns, portrait, save, reload, resume — **zero console
   errors**; draw calls and texture MB in a live match with damage on screen. Ceiling 120 main.

## Budget

Two passes, then I review. A crash or an API error does not consume a pass. Write `HANDOFF_P5.md`:
what changed, what you measured, **what your tests could not have caught**, and anything that
belongs in `DECISIONS.md`.
