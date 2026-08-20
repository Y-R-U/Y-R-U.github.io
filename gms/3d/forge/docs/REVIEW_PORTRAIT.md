# REVIEW_PORTRAIT — adversarial review of the portrait-first change

Reviewed: `js/engine/fov.js`, `js/engine/fov.test.js`, `js/engine/app.js`, `js/scenarios.js`,
`js/game/game.css`, and `session.rotate()`. The concurrent edits to `js/sim/foes.js`,
`js/game/onboard.js`, `js/game/spawner.js`, `data/quests/*.json` and the `this.rng` injection in
`session.js` are another agent's work and are excluded.

**The camera policy is right and I could not break it.** The transpose is exact, not a coincidence
at one aspect pair; the rule is continuous through square; rotating mid-game is clean in every UI
state I could put the game into; nothing clips indoors; and portrait is genuinely cheaper at the
*true* worst traverse station, which the builder never sampled. **Nothing in this change breaks the
game for a player holding a phone in portrait.**

What is wrong is around the edges of it: a new quality knob silently overrides every scenario's
FOV in the render harness, the interior survey covered 29 of the world's 52 rooms and missed the
lowest ceiling by 0.44 m, and the paragraph in `NOTES_PORTRAIT.md` §8 that is about to be pasted
into `CLAUDE.md` states the central claim incorrectly.

---

## 1. The new `fov` knob silently overrides every scenario's FOV — **high**, tooling

`app.js` registers `fov` as a quality knob whose apply is `setFov(v)`, default 55.
`Quality.usePreset()` re-applies *every* registered knob from `this.settings`, and `fov` is in no
preset, so it always re-applies 55. `main.js` runs `shot.setup(app)` at line 139 and
`applyParams()` — which calls `usePreset()` — at line 222. **The scenario sets the FOV first and
the preset stomps it afterwards.** `--dpr` is a second stomp path: `setDprCap → resize →
applyFov`.

Measured, on the current tree:

```
node tools/shot.mjs --shot=wwa_air --set=dev=1 --preset=medium --eval='__forge.app.camera.fov'
  → 55            (the scenario declares fov: 60)
… --pre='(()=>{const b=__forge.app.camera.fov;__forge.setScenario("wwa_air");
                return {before:b, after:__forge.app.camera.fov}})()'
  → {"before":55,"after":60}

node tools/shot.mjs --shot=door_light --set=dev=1 --preset=medium --eval='__forge.app.camera.fov'
  → 55            (the scenario declares fov: 45)
```

The two `door_light` renders — one at the stomped 55, one after re-running `setScenario` — are
visibly different framings. Twenty scenario definitions across `demo.js`, `chicken.js`,
`vermin.js`, `people.js`, `robed.js` and `scatter.js` carry a non-55 `fov`; all of them now render
at 55.

Before this change `frameCamera` wrote `app.camera.fov` directly, `resize()` never touched `fov`,
and no knob could reach it, so this is new.

**Why the builder's own check could not see it.** §2.2 says "verified: `tools/shot.mjs --all`
reproduces the five critic plates unchanged". All five of `wall_day`, `street_dusk`, `gate_night`,
`town_night` and `creek_day` are defined in `demo.js` with **no `fov` field**, so they run at the
default 55 either way, and `--all` only lists the five (the rest need `--set=dev=1`). The
verification was structurally incapable of touching a scenario with a custom FOV.

**Fix (not applied).** Either drop the knob — the field is now derived, and a slider for it is not
worth this — or make the scenario write through the registry, `app.quality.set('fov', fov)` in
`frameCamera`, so `usePreset` re-applies the scenario's value rather than 55. Moving
`applyParams()` above `shot.setup(app)` would fix the boot order but not the `setDprCap` path.

---

## 2. The interior survey covers 29 of 52 rooms; the lowest ceiling is 3.13 m — **high**, design

§3.2 says "I enumerated all 29 doors in the world for this (`__forge.doors.doors` → `roomH`) …
**3.61 m is the floor and only six rooms of 29 are under 4 m**". Two things are wrong with that.

**a. `roomH` is not the ceiling a standing player looks at.** In a `twoUp` house the ground floor's
lid is the loft *deck*, `I.deck = I.ceil + 0.33`. Measured over all 29 doors, the ground-floor lids
are:

```
3.57  3.75  3.91  3.94 ×3  3.99  4.08  4.30  4.46 ×3  4.70  4.83 ×16
```

So the true ground-floor minimum is **3.57 m** (door 27, Blackstone, 10.1 × 6.8 m), not 3.61, and
sixteen of twenty-nine are at 4.83 rather than 4.50.

**b. There are 23 more rooms.** `tools/camfit.mjs` walks 29 ground floors **and 23 lofts** — 52
rooms. `autoStair` defaults to `true` in `doors.js`, so lofts are ordinary walkable space. Loft
ceiling heights:

```
3.13  3.20 ×3  3.68 ×3  4.05 ×16
```

**The lowest ceiling in the game is 3.13 m, in door 10's loft** — the very house §3.2 uses as its
worked example ("door 10 has `wallTop − plinth` = 7.34 m, split 3.61 ground / 0.33 deck / 3.25
loft"). The note's own arithmetic contains the counter-example to its own conclusion.

**Why it matters for the recommendation.** In portrait, if the ceiling is above the eye at all,
it fills everything between the top edge and the horizon. That band is
`(1 − tan(p)/tan(v/2)) / 2`:

| | default pitch 0.26 | `PITCH_MIN` −0.35 |
|---|---|---|
| landscape, v = 55° | 24.4 % of frame | 51 % |
| **portrait, v = 96.8°** | **38.2 %** | **66 %** |

(24.4 % is the same number §2.1 calls landscape's sky fraction, which is the check that the algebra
is right.) The share only falls below the asymptote by however far the ceiling/far-wall junction
sits above the horizon — and in a 3.13 m loft the eye is 2.59 m up, so the ceiling is **0.54 m**
above it and that junction is almost on the horizon. The 26 % §3.2 measured in a 3.61 m room is
not the worst case; something near the 38 % asymptote is, and the 48 % it measured at `PITCH_MIN`
in that room becomes something near 63 % in a loft.

I rendered the lowest *ground* room from the live rig, portrait and landscape, and it is fine —
the ceiling takes about the top 30 % at default pitch and the room reads as low-beamed, exactly as
§3.2 says. I could not get a clean render of a loft (see §10).

**Fix (not applied).** Nothing in the code. Re-run the enumeration through `camfit.mjs`'s room
walk rather than `doors.doors`, look at door 10 / 13 / 19 / 21's lofts in portrait, and re-price
§3.3's "do not raise anything" against 3.13 m instead of 3.61 m. It may still be the right call —
the loft is a store room, not a fight space — but it has not actually been decided yet.

---

## 3. §8's proposed `CLAUDE.md` row states the central claim incorrectly — **high**, docs

> "…holds the 55° field on whichever axis of the viewport is *shorter*, so **every landscape aspect
> keeps exactly the 96.8° horizontal** the K = 1.5 derivation assumes, and **portrait gets 96.8°
> vertical instead**."

Both halves are false as written. Every landscape aspect keeps exactly the **55° vertical**; the
horizontal is 96.8° only at the gate aspect 2.164. Measured in the page:

| viewport | aspect | vFOV | hFOV |
|---|---|---|---|
| 1600 × 900 | 1.778 | 55.0° | **85.6°** |
| 844 × 390 | 2.164 | 55.0° | 96.8° |
| 2560 × 1080 | 2.370 | 55.0° | **102.0°** |
| 390 × 844 | 0.462 | 96.8° | 55.0° |
| 834 × 1194 | 0.699 | **73.4°** | 55.0° |

`fov.js`'s own header comment gets it right ("every landscape aspect — phone, desktop, ultrawide —
keeps exactly the 55° it has today") and so does §2.2 ("Desktop 16:9 keeps its 85.6° horizontal").
Only §8 — the one paragraph destined for the canonical decision list — compresses it wrong.

The same row's "puts the ceiling in the top fifth of the worst interiors" also understates the
note's own measurement (26 % in a 3.61 m room, 48 % looking up) before §2's correction is applied
at all.

**Fix (not applied).** Rewrite the row around the vertical: *"…holds the 55° field on whichever
axis is shorter, so every landscape aspect keeps exactly the 55° vertical it has today and the
844 × 390 gate keeps its 96.8° horizontal; a phone in portrait gets 96.8° vertical and 55°
horizontal, the exact transpose."*

---

## 4. The 100° cap binds at aspect 0.437, not 0.39 — and real phones reach it — **medium**, docs

§2.3 and §7 both say the cap "only binds below `a ≈ 0.39` (a 344 × 882 window)". The threshold is

```
a_cap = tan(27.5°) / tan(50°) = 0.520567 / 1.191754 = 0.43681      (1 : 2.289)
```

Measured by walking the viewport: at 390 × 893 (a = 0.4367) vFOV reads exactly 100.000° and hFOV
is still 54.99° — the cap is just biting. At 390 × 920 (a = 0.4239) hFOV has already fallen to
53.6°.

That difference matters because it moves the cap from "no shipping device" into "a whole phone
family": Sony's 21 : 9 phones are 1644 × 3840 → **a = 0.428**, capped. `fov.js`'s own comment says
"about 1 : 2.2" (a = 0.4545), which is wrong in the other direction.

Consequences at the cap, measured:

- The transpose breaks. A 21 : 9 phone gets 53.4° horizontal in portrait against 55° vertical in
  landscape, so **rotating it rescales the world by about 3 %**. That is invisible in practice but
  it is a real exception to "rotating the phone rescales nothing", which §8 asserts without
  qualification.
- Perf is fine, and "the right way to fail" is correct: solid angle *falls* past the cap —
  1.446 sr at a = 0.437, 1.411 at 0.424, 1.214 at 0.356, 1.078 at 0.311 — all below the 1.468 sr of
  the 21 : 9 landscape they rotate from.
- The frame itself looks fine. `280 × 900` (a = 0.311, the most extreme I rendered) shows the
  building whole with the player small but readable. No stretching artefact.

Note also that the frustum maximum over the whole portrait range is **1.446 sr at a = 0.437**, the
cap boundary itself — higher than the 1.410 sr at the phone aspect. Worth knowing if the gate is
ever re-derived.

**Fix (not applied).** Correct 0.39 → 0.437 in §2.3 and §7 and "1 : 2.2" → "1 : 2.29" in `fov.js`,
and add the 21 : 9 exception to §8's "rescales nothing".

---

## 5. Three comments in the diff state something untrue — **medium**

**a. `session.js` `rotate()`.**

```js
// This only lets go of the pause a save written by an older build could still be holding.
rotate() { if (this.pauses.has('portrait')) this.resume('portrait'); }
```

`this.pauses` is `new Set()` in the constructor (session.js:91) and appears nowhere in `save.js`,
`snapshot()` or `normalise` — a save has never carried a pause set, from any build. Nothing calls
`pause('portrait')` any more (the only occurrence of the string in `js/` is line 435 itself). So
`rotate()` is unconditionally dead code, and the comment invents a persistence path that does not
exist. The honest version is either to delete the method and its two listeners, or to say it is a
deliberate no-op kept so `orientationchange`/`resize` still have a handler.

**b. `app.js` `setFov()`.**

```js
// Scenarios set it too, so a shot's `fov` means the same thing either way up.
```

The code does not do this — see §1. This is the pattern the brief warned about: the comment
describes the intended behaviour correctly while the code does the opposite.

**c. `game.css`, portrait block.**

```css
/* Side by side the cluster is 26 + 60·ui + 30·ui + 76·ui wide, which at uiScale 1.4 is 236px of
   a 390px screen and crosses the midline the move stick owns. Stacked it never can. */
```

26 + 166 × 1.4 = **258.4 px**, not 236. The conclusion holds either way (both exceed the 195 px
midline) but the number is wrong, and `NOTES_PORTRAIT.md` §5 repeats it.

The `--stack` comment above it *is* correct: 26 + 60 + 8 + 10 + 76 + 14 = 194 = 40 + 154 × 1, and
the unscaled/scaled split matches the CSS. So does "46 % of 390 px is narrower than the 190 px the
objective line asks for" (179.4 < 190) and "a 38 % master list is 148 px".

**Also made false by this change, though the line itself is untouched:** `session.js:912`,
"everything that pauses the game — a menu, a hidden tab, portrait — also stops the creatures".
Portrait no longer pauses anything.

---

## 6. The portrait CSS fires on any tall window, including large desktop ones — **medium**

`@media (orientation: portrait)` is true whenever `height > width`, at any size. The audit was done
at 390 × 844 only. At **890 × 900** — a resized desktop browser, one drag away from square — the
game takes the whole phone layout: `--thumb: 0`, the two round buttons stack vertically in the
corner, the slate's three panels collapse to one 300 px column, the journal stacks master over
detail at 34 % / 66 %, and the dialogue bubble goes **full width at 866 px** where the landscape
rule caps it at 670. On a 1200 × 1400 window the bubble would be 1176 px, which is a ~170-character
measure for a script written to two 46-character lines.

The camera is *right* here — `asp_nearsq_port.png` (890 × 900) and `asp_nearsq_land.png`
(900 × 890) are visually indistinguishable in framing, which is exactly what the policy promises.
It is only the HUD that flips wholesale.

**Fix (not applied).** Gate the CSS block on size as well as orientation —
`@media (orientation: portrait) and (max-width: 700px)` — and leave the camera policy keyed on
aspect as it is. The two do not have to agree, and they should not: the camera cares about the
frustum, the HUD cares about whether it is a phone.

---

## 7. In portrait the cog is out of one-handed thumb reach — **medium**, ergonomics

The stacking argument in §5 is correct, and I checked it: the two round buttons never cross the
`innerWidth/2` line `input.js:58` splits on, at any text size —

| uiScale | dial | act | midline |
|---|---|---|---|
| 0.85 | x 313–364 | x 299–364 | 195 |
| 1.0 | x 304–364 | x 288–364 | 195 |
| 1.4 | x 280–364 | x 258–364 | 195 |

— and from a right thumb pivoted at the bottom-right corner of a 390 × 844 viewport the act button
centre is 90 px (~15 mm) away and the dial centre 160 px (~26 mm), both trivially inside a thumb
arc. Stacking is the right call.

But the thing that moved out of reach is the one the stacking argument was not about.
**`.g-cog` sits at (362, 26): 818 px ≈ 135 mm from that pivot in portrait, against 365 px ≈ 60 mm
in landscape.** Its own comment says it is "the only way into pause, journal and settings on
touch", and that is still true — `escape()` is keyboard-only, and the only other touch route is a
500 ms long-press on the quest tracker, which is also top-left and only opens the journal (and is
absent when nothing is tracked). Portrait turns every pause into a two-handed action or a
hand-shuffle.

A DOM sweep for overflow and off-screen elements cannot see this, which is why it survived the
audit.

**Fix (not applied).** Aaron's call, but the cheap option is a portrait-only rule putting the cog
at the bottom of the right-hand stack, under the act button, or a second small cog anchored to the
bottom-left. Do not move it in landscape.

---

## 8. Two docs now describe deleted behaviour — **low**

- `docs/AUDIT_MOBILE.md` ~190–194 still states "**The portrait rotate prompt exists and works.**
  `.g-rotate` (`game.css:618-631`) … and `session.rotate()` (`session.js:319-328`) pauses the
  simulation and the clock", and its real-phone checklist at ~859 asks Aaron to "**Turn it to
  portrait and back mid-game.** §1.11 says this should work; confirm the pause lands and the card
  covers the touch pads." Both describe code that no longer exists. Line ~298 also says portrait
  "gets an overflowing three-panel row with no instruction to turn it", which this change fixed.
- `docs/PHONE_TEST.md` was not touched at all, even though §7 nominates it as where the untested
  items should land. It still instructs "Phone on the same wifi, **landscape**" and carries no
  portrait URL, no safe-area check and no rotate check.

---

## 9. Two small portrait-only fragilities — **low**

- **3 px.** At uiScale 1.4 in portrait, `.g-vitals` measures x 14–248 / y 10–62 and `.g-chip`
  x 238–384 / y 65–96. They overlap 10 px horizontally and clear each other by **3 px** vertically.
  That margin is a Chrome-on-macOS font metric; iOS `system-ui` is a different font and this is
  the same failure the builder fixed in landscape.
- **`body.flip` + portrait.** The block sets `flex-direction: column; align-items: flex-end` on
  both `.g-right` and `body.flip .g-right`, but does not reset the flipped rule's
  `right: auto; left: …`. On the left-handed layout the 60 px dial is therefore right-aligned
  inside the 76 px act's shrink-to-fit box instead of hugging the left edge — a 16 px cosmetic
  misalignment. Input is unaffected: both buttons stay well inside the left half, which `flip`
  correctly gives to look/attack.

---

## Verified sound — including the things I expected to break

**The transpose is exact across the range, not lucky at one pair.** At aspect `a` the frustum is
`(tanX, tanY) = (a·t₀, t₀)` with `t₀ = tan 27.5°`; at `1/a` the rule gives `vFOV = 2·atan(a·t₀)`,
so it is `(t₀, a·t₀)` — the same solid, transposed, by construction. Measured in the page for two
independent pairs:

| pair | solid angle | near corner | shadow `s` |
|---|---|---|---|
| 844 × 390 / 390 × 844 | 1.4103 / 1.4103 sr | 0.1594 / 0.1594 m | 1.5401 / 1.5401 |
| 900 × 890 / 890 × 900 | 0.8671 / 0.8671 sr | — | 0.5481 / 0.5481 |

`lighting.js`'s fit term `tan²(v/2)·(1+a²)` is `tanX² + tanY²`, which is why it is
transpose-invariant. So is `spell.js:243`'s point-size scale `h/2 / tan(v/2)` — 374.6 in portrait
against 374.5 in landscape, so spell motes do not change size when the phone turns. The builder
predicted the first and did not mention the second; both hold.

**Continuity through square.** `fovFor` is continuous at `a = 1` (both branches give 55°); only the
derivative breaks. Swept a 900 px-tall window from 860 to 940 px wide:

```
860 a=0.956 v=57.16 h=55.00   890 a=0.989 v=55.53 h=55.00   920 a=1.022 v=55.00 h=56.04
870 a=0.967 v=56.61 h=55.00   900 a=1.000 v=55.00 h=55.00   940 a=1.044 v=55.00 h=57.07
```

Dragging a desktop window through square does not jump the camera.

**The traverse discrepancy is fully explained and is not a regression.** `TRAVERSE_A8_LONGACRE.json`
records `"step": 25`; the builder's two runs record `"step": 20`, which is `budget.mjs`'s default.
A 20 m grid is not a superset of a 25 m one — only 96 of the 348 A8 stations are in the 426-station
set, and the A8 worst station (−512.44, −71.10) is not one of them. On the 96 common stations the
A8 maximum is 285,046 and the builder's landscape control is 286,762, and row 0 of the two files is
byte-identical (137 calls / 264,766 tris). **Nothing in the tree moved.** I re-ran both orientations
at `--step=25` on the working tree:

| `--step=25`, medium, dpr 1 | worst tris | worst calls | over 350k |
|---|---|---|---|
| landscape 844 × 390 | **316.6k** (186.0k main + 130.6k shadow) at (−512, −71) yaw 0 | 139 | 0 of 348 |
| portrait 390 × 844 | **288.3k** (157.7k main + 130.6k shadow), same station | 120 | 0 of 348 |

Landscape reproduces the A8 figure to the digit. Portrait is cheaper at the true worst station too,
so §4's conclusion survives — but §4's *table* understates the project's real worst landscape frame
by 30k and should not be adopted as the new baseline. The honest margins on the 25 m grid are
**9.5 % landscape / 17.6 % portrait** on triangles, not 18.1 % / 19.9 %. Portrait is only cheaper
at 413 of 426 stations, incidentally — it is worse at 13 — but never by enough to matter.

**No new clipping indoors.** The rig is orientation-independent: `camfit.mjs` reads no camera state
at all, and `player.js`'s arm, `camRadius`, `armMin` and clamp are pure geometry. The one term that
does change is the near plane's top edge, `0.1·tan(v/2)` = **0.1127 m** in portrait against
0.0521 m in landscape, against a 0.26 m collision sphere — still 0.15 m of margin. `camfit`
reports **0 shell escapes over all 52 rooms** and 0.000 m of poke into a 0.51 m wall panel. I stood
the live rig in the lowest ground-floor room (door 27, 3.57 m, Blackstone) and rendered it in both
orientations at default pitch and at `PITCH_MIN`: no clipping, no geometry through the camera, the
window and furniture legible, ceiling roughly the top 30 % at default and 48 % looking up.

**Rotation mid-game is clean.** Five landscape↔portrait cycles in each of seven states: nothing
open, a two-line dialogue, a three-choice dialogue, the journal, the market, the pause menu,
mid-swing, mid-channel. `camPitch`, `camYaw`, `pos`, `camPos`, `paused` and `pauses` come back
identical in every case (the only difference anywhere was sub-millimetre drift from the player
still settling), FOV and aspect track the viewport, and there were **zero console errors or
exceptions** across all of it.

**`hud.js`'s `origin` is not stale — hypothesis killed.** It is not set at construction; it is
recomputed inside `openRadial()` on every long-press, alongside `aimFrom` from a fresh
`getBoundingClientRect()`. The radial also fits: `RADIUS` 96 around x = 195, widest button box
236–346 at uiScale 1.4, inside 390.

**The stacked buttons cannot steal the move stick — hypothesis killed.** `input.js` binds
`pointerdown` only on `#stage` and `#touch`. `#game` is a separate fixed layer at z 40 with
`pointer-events: none`, `auto` only on its controls, so a tap on a button never reaches the stick
and a tap on empty HUD passes straight through. `moveSide()` reads `innerWidth` live, per event.
The full-width bubble is *less* of a dead zone in portrait than in landscape: it covers 9.2 % of
the left (stick) half against landscape's 20.5 %.

**`pickDefaultPreset()` does not give a phone a different preset per orientation — hypothesis
killed.** I expected `innerWidth < 820` to hand a phone `medium` in portrait and `high` in
landscape, and to have measured portrait perf at the wrong preset. It does not: the `/Android|
iPhone|iPad|iPod/` UA test fires first on any real phone. The pre-existing narrow-desktop-window
issue §7 flags is real but unchanged.

**Player pixel size.** Exactly 88 CSS px in both orientations, as claimed:
`PH·cos p / (2·D·t) × h` = 0.1043 × 844 = 88.0 and 0.2256 × 390 = 88.0.

**Both "found, not fixed" items are genuinely pre-existing and genuinely landscape.** The
`.g-chip`/`.g-cog` overlap is `cogWidth − 50 px`, i.e. 3.2 px at uiScale 1.4, from two rules the
diff does not touch — and portrait actually *fixes* it by dropping the chip under the cog.
`.g-jrow i { width: 12px }` is game.css:191, untouched.

**`MAX_LINE`.** The corpus is now **705 lines**, not 676 — the concurrent quest edits grew it — but
`tools/lintText.mjs` still reports `longest 43/46`, so the recommendation to drop the cap to 43
holds exactly, with zero slack (any new 44-character line fails immediately, which is the point).
Measured in the portrait bubble: box width **336 px** as claimed; ordinary prose fits **47**
characters at uiScale 1.0 (the note says 48–49) and **38** at 1.4 (the note says 36). Direction and
conclusion right, both numbers slightly off. `node --test` 548/0, `lintQuests` 1 known warning,
`lintText` 0/0.

---

## 10. What I could not check, and why

**Anything needing a real device.** I confirmed rather than assumed that `env(safe-area-inset-*)`
reads `0px` on all four sides under CDP emulation. What *can* be established without a phone, and
is clean: every portrait rule that touches an edge carries the matching `env()` term — `.g-chip`
top/right, `.g-track` top, `.g-scene`/`.g-open` left/right/bottom, `.g-prompt` bottom, `.g-scene`'s
`max-height` top — and `.g-right` is not repositioned by the block, so it keeps landscape's
`env(right) + 26 / env(bottom) + 26`. The `--stack` arithmetic is correct and scales, so a 34 px
home indicator pushes the whole cluster up rather than under itself.

For `docs/PHONE_TEST.md`, the four things that remain genuinely unknown:

1. **iOS Safari's portrait bottom URL bar**, which does not exist in landscape (Safari goes
   full-screen there). `#stage` and `#game` are both `position: fixed; inset: 0` under
   `viewport-fit=cover`. If the fixed viewport resolves to the large viewport, the act button sits
   under the toolbar. This is portrait-only, it is the single most likely real-device failure, and
   emulation cannot show it.
2. **The Dynamic Island / notch at a 59 px top inset**, which pushes the cog to y 63, the day chip
   to y 115 and the quest tracker to y 147 — arithmetically fine, but nobody has looked.
3. **The 3 px vitals/chip clearance at uiScale 1.4** under iOS `system-ui` metrics (§9).
4. **Whether the cog is genuinely unreachable one-handed** on a real 6.1" phone (§7). My 135 mm is
   a CSS-px-to-millimetre estimate, not a hand.

**A loft interior in portrait.** Two attempts failed — forcing `interior.level` onto the deck
teleported the player outside the shell, and hand-placing the rig under `?shot=` pointed it at a
wall with the perf HUD over the top quarter. §2's loft finding therefore rests on `camfit.mjs`'s
52-room walk and on the frame-share algebra, **not on an image**. Someone should walk a character
up the stairs of door 10, 13, 19 or 21 in portrait and look before §3.3's recommendation is
accepted.

**Real GPU timings.** Everything here is software-rendered headless. I trusted counts and images
and ignored milliseconds, per `CLAUDE.md`. I did not reproduce the `--headed --perf` 60 fps figures
in §4.
