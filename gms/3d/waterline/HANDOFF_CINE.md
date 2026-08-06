# HANDOFF_CINE — C6, director / sequences / shell / the match cut

**Pass 2 of 2 (D18). This is the last pass.** Everything under "PASS 2" below is current;
everything from "PASS 1" onward is kept for history and is superseded where it says so.

Files owned: `js/cine/rig.js`, `js/cine/director.js`, `js/cine/sequences.js`, `js/cine/caption.js`,
`js/cine/shots.js`, `js/world/shell.js`, `js/world/vfx/round.js`, and — newly, per **D23** — the
`CINE` block of `js/config.js` and nothing else in that file.

Edited this pass: `js/config.js` (`CINE` only), `js/cine/shots.js`, `js/world/shell.js`.
`rig.js`, `director.js`, `caption.js` and `round.js` were not touched. Nothing outside the owned
list was edited; five things that needed a closed file are escalations in §P2.7.

---

# PASS 2

## P2.0 — what changed, in one paragraph

The match cut was rebuilt from four beats into two, so that the only discontinuity anywhere in it
is the cut itself; the anchor is on screen and lit from `t = 0`, holds one screen position and one
screen height on **both** axes by construction, and the exterior camera flies behind and above the
round so a near-horizontal shell projects as a near-vertical rod — the peg's silhouette — with no
camera roll at all. Muzzle flashes and fireballs now light the ships beside them, through a real
`PointLight` added from the scenario. The window apertures blow out and spill onto their surround.
The plot table's lavender bezel was an IBL leak and is fixed. The round is a shell rather than a
sausage. And `CINE.exposure` is now one source for all four sequences that cross the glass.

## P2.1 — the match cut

Round 1's four measured breaks, and what each is now.

| Round 1 break | Round 2, measured |
|---|---|
| the anchor column **does not exist at t = 0** | present, lit and 17.5% of frame height at t = 0; it never appears or disappears inside the move |
| anchor screen-x steps −104.5 px then +2.0 px — **52:1** | largest step 0.29% of frame width, median 0.15%; **max/median 3.7** |
| base-y **reverses direction** | anchor NDC y is −0.109 → −0.103 across all eleven sampled frames; monotone and flat |
| a bloom/bokeh overlay **switches on** between t=0.2 and t=0.4 (p95 65.5 → 221.8 → 255) | the smear is symmetric about the cut and peaks at 0.34 of the card's own ramp; the 40-lane texture that magnified into countable white discs is now 18 smooth angular harmonics |
| **21.3° of dutch roll** unwinds in the last fifth | there is no roll in the sequence at all |
| exposure continuity (the one thing that worked) | unchanged — still one `renderer.toneMappingExposure` across the cut |

### How it is built now

Two beats. Interior `0 → 520 ms`, exterior `520 → 1000 ms`, cut at `CINE.matchCut.cutAt = 0.52`,
so a six-frame strip at `--at=0,0.2,0.4,0.6,0.8,1` lands **three frames each side** — round 1 gave
the exterior two frames out of six, which is why a critic called the exterior half thin.

* **Position.** Both halves aim with `aimFor(pos, anchorCentre, CUT.ndc, fov, aspect)` and both use
  the anchor's **centre** — the peg's mid-height and the round's mesh origin, which is the centre of
  its body. Round 1 aimed at the peg's *top* on one side and let a tracer blob be the visible
  subject on the other, which is why the critic's tracked features disagreed by half a frame height.
* **Size.** The camera distance is *solved* from the anchor, not authored: `distFor(h, frac)` puts
  an `h`-metre object at `frac` of frame height. The peg grows 18% → 34% over the interior on one
  eased curve; the round is placed at the same 34% at the cut and only then relaxes.
* **Orientation.** `outDir` puts the exterior camera behind, above (`CUT.outLift = 0.33`, i.e. 18°)
  and slightly to port of the round, looking down its own flight path. `screenBasis()` derives the
  camera's screen axes from the view direction alone, so `|d·y|` — the round's axis projected onto
  screen-up — is known before any render, and the distance solve uses it. Measured anchor angle:
  **93.6° at the last interior frame, 84.1° at the first exterior frame.**
  The 18° lift is a real trade and the constant carries the comment: above ~24° the camera's
  depression exceeds the half-fov and the exterior frames contain no horizon and no ships at all.
  That is what round 1's version did.

### `matchReport()` — the new assertion, and what it does not cover (D24)

`window.__waterline.cine.matchReport()` samples eleven frames and returns, per frame, the anchor's
NDC x and y, its screen height as a fraction of the frame, and its screen angle; plus the
frame-to-frame steps, the step that straddles the cut, and max/median step magnitude.

Measured, this build:

```
cut step   dxFrac 0.0057   dyFrac 0.0004   dhFrac −0.0096
max step   0.0057          median 0.0015          max/median 3.7
hFrac      .175 .187 .221 .276 .316 .332 | .322 .217 .123 .070 .034
angDeg     93.3 93.3 93.4 93.5 93.6 93.6 | 84.1 83.9 83.6 83.4 83.1
```

**What it does not cover**, because every assertion has blind spots and the useful information is
which:

1. **It measures the anchor and nothing else.** It says nothing about the background, the exposure,
   the horizon, the streak card, or anything else a viewer reads as continuity.
2. **Eleven samples.** A discontinuity narrower than 100 ms of a 1000 ms sequence is invisible to it.
3. **The round's mesh origin and its scaled Y half-extent** are the "anchor" on the exterior side.
   That is the body. The tracer glow that extends behind the body is not measured, and at the cut
   the glow is roughly as large as the body.
4. **The peg's height is taken from `mesh.scale.y`**, which is exact, but the *visible* column is
   the emissive-blown silhouette and is a little wider than the geometry.
5. **`dhFrac` is a projected extent, so it includes perspective**, which is why the paraxial
   distance solve needed `CUT.shellFit = 1.14` — measured, not guessed: without it the shell read
   0.488 against the peg's 0.431.
6. **It does not run under `play()`**, only under `seek()`. A real-time playthrough with `drift`
   and a variable frame time is not asserted on at all.
7. The largest `dhFrac` step in the sequence is **−0.106, between t=0.6 and t=0.7** — that is the
   round deliberately relaxing out of its stretch after the cut, not a discontinuity at it. If a
   later reviewer wants that slower, `CUT.shellStretch` and the `e = u*u` relax curve are the knobs.

`matchError()` still exists and still reports the cut instant only, so anything written against
round 1 keeps running. It is the narrow measurement; `matchReport()` is the one to read.

## P2.2 — emitters that light nothing (the most repeated finding on the project)

C4's emitters register a `warmSource`, which only tints *cards* — smoke, rain, spray. No
`MeshStandardMaterial` in the scene ever saw a muzzle flash or a fireball. The fix needs no edit to
a closed file: `flashLight()` in `shots.js` adds a real `THREE.PointLight` at the flash anchor from
the scenario. Intensity is candela (three r155+ is physically correct), so the helper takes the
**irradiance you want at a stated distance** and squares it for you, which is the only form of the
number anyone can reason about.

Measured, on the exact regions the critic named:

| | round 1 | round 2 |
|---|---|---|
| `shell_flight` superstructure beside the fireball, B−R | **+23.5** (net blue) | **+5.3** |
| `window_out@1.0` hull side facing the flash, B−R | **+47.1** | **−5.0** (net warm) |

Two honest caveats. First, the *far* end of each ship stays blue — `shell_flight`'s upper tower,
about 40 m further from the flash, still measures B−R +24.1, and `window_out@1.0`'s masthead +30.6.
That is inverse-square doing its job and I have not tried to defeat it. Second, half the win in
`shell_flight` came from dropping `setShipAmbient` from 0.92 to 0.58: the hull's ambient fill *is*
the blue sky, and at 0.92 it swamped a 255-white fireball 60 m away. A light alone was not enough,
which is worth knowing for whoever fixes this project-wide.

## P2.3 — `window_out@0.0`, the interior end

**The bezel.** RGB(63,47,72), blue-dominant lavender in a red-only room. Isolated rather than
tuned: forcing `envMapIntensity = 0` on the table's materials moved it to (75,10,14), pure red. It
was the noon sky's IBL at full strength on a metal frame, in a room graded to `bridge.setEnv(0.006)`
— because `bridge.setEnv()` covers the room and nothing covers the table. `tableEnv(0.05)` in
`shots.js` is the workaround; the seam belongs to C2 (§P2.7 E6). Two wrong guesses were tested and
discarded first: the cyan plot practicals (dropping them to 0.03 moved B−R by 8) and the new glare
card (it moved it by 0). Measured now: **B−R +23.9 → −52.8.**

**The windows.** `windowGlare()` builds one merged, vertex-coloured, soft-additive quad set from the
actual glass meshes — two quads per pane, the inner one 1.10 × 1.26 of the aperture so the overhang
*is* the spill onto the mullions. One geometry, one material, **one draw call**, because this shot
had three calls of headroom. `depthTest` is **off**: with it on the mullions and the console occlude
the very cards meant to spill onto them, and the bulkhead beside the aperture measured *darker* than
with no glare at all (23 against 27). The cards are sized to stop above the plot table.

| region | round 1 | round 2 |
|---|---|---|
| window sky | 145.2 mean, max 182.7 | **211.4** mean, max 230.9 |
| window sea | 107.5 | **185.3** |
| mullion beside the aperture | ~13 | **59.2** |
| bulkhead below the windows | 20.5 (critic) / 29.4 (mine) | 23.3 |
| plot table mean | 97.1 (critic) / 107.4 (mine) | **83.7** |

**D22's re-specified gate, and I am reporting it two ways because the answer depends on the sample.**
D22 names "bulkheads, deckhead, console housings".

* Sampling the same two dark patches the critic used (bulkhead below the windows 23.3, overhead box
  33.1): aperture 198 / 28.2 = **7.0 — outside [3.0, 6.0]**.
* Sampling six non-emissive patches across the room — those two plus both console runs (25.3, 21.6),
  the deckhead (108.3) and the port bulkhead (56.1), mean 44.6: **4.7 — inside the band.**

I am not going to claim the second one and hide the first. What is true either way: the aperture is
the brightest region in the frame once the table is excluded (211 against the next non-emissive
surface at 108), and it is **monotone while it is still an aperture** — 211.1 → 211.5 → 216.6 at
t = 0, 0.15, 0.3. Getting the first sampling inside the band means dimming the glare back toward
where round 1 was, which undoes the thing the critic asked for; I chose the glare and I am saying so.

## P2.4 — `CINE.exposure`, per D23

The local hard-code is gone. `CINE.exposure` is now `{ interior: 1.02, exterior: 0.90, ms: 600,
lagMs: 260 }` and `caption.text` is deleted (D2's wording lives in `caption.js` and must not be
configurable). Probed at capture time by seeking each sequence and reading
`renderer.toneMappingExposure`:

| | t=0 | t=1 |
|---|---|---|
| `bridge_settle` | 1.02 | 1.02 |
| `fire_out` | 1.02 | 0.90 |
| `bridge_return` | 0.90 | 1.02 |
| `open_flyover` | 0.90 | 1.02 |
| `window_out` | 1.02 | 0.90 |

`fire_out` and `bridge_return` were rendering the bridge at 1.55; that is what made it a daylit
cabin. C7's `flow.js` carries an `aimExposure: 0.92` override written to work around 1.55 — it is
now within 0.1 of the sequence rest value and can probably go, but that is C7's call and I did not
touch the file.

## P2.5 — the rest of the critic's list

**The round is a shell now.** `shell.js` ran a length/diameter ratio of **9:1**; a real naval shell
is about 4.5:1, and 9:1 is why it read as a sausage as long as the ship it was aimed at. Now
`cal 0.150`, `len 1.35` → 4.5:1. The chase camera also backed off from 26 m to 45 m, which shrinks
the round and leaves the enemy ships — 200 m further on — essentially unmoved.

**The trail no longer narrows backwards.** `alpha ∝ (1−age)^1.15` faded the tail before it had
finished broadening, so the *visible* trail narrowed with age while the geometry widened. Exponent
is 0.55. Separately, the tracer streak cards were being scaled by the match cut's `stretch`, which
put an 80 m flare on a camera seven metres away; the stretch is a stylistic elongation of the body
and the plume is a physical length, so it no longer applies.

**Rain is no longer pink, and is less invisible over the sky.** The pink was the tracer's own
`warmSource` at radius 30 × scale = 78 m: `rain()` lights a streak by the angle it subtends against
that radius, so a 78 m source tinted every drop in frame. Radius is now 11 × scale and intensity
0.34. Measured streak ΔR−ΔB over the sky: **+14.8 → +3.6.**

The sky/sea density ratio went **1:26 → 1:11.6** (my own measure at 1600×900; the critic's 1:19 was
measured on a 900×506 panel and the two are not directly comparable — only the direction is). Raising
`rain({ tone })` from 0.30 to 0.52 is what moved it, and it is where this stops without editing
`fire.js`: see E3, which has the diagnosis. Exposure is not the lever — I tried 0.92 → 0.80 and
probed it at capture time (0.80 confirmed); ACES compresses the sky so hard that the sky mean moved
from 149.7 to 145.0.

**The sky in `window_out@1.0` is no longer a straight line.** `skyCover` 1.05 → 1.55 and
`skyCloudSize` 1.35 → 1.9. The clear-sky patch the critic measured at **4.9 luma levels of total
range** now spans **44** (120 → 164). The straight-line residual over 380 rows is still only 1.71
against the plate's 9.89, so this is better and not fixed.

**Foreground water detail still runs backwards, but by less.** `|dx|` near-field 0.74 → 1.51,
mid-field 3.20 → 4.11; the inversion is 4.3× where the critic measured 8.9×. `seaRipple` 2.2 → 1.2
is what moved it. The cause is in `ocean.js` and is E5.

**Not fixed, not mine:** the unlit black slab under the hull in `shell_flight` (C3's below-waterline
geometry drawn above the water) and the open stern void in `window_out@1.0` (C3's transom). Both are
E4. The "painted boxes" finding — relative surface texture 0.037–0.039 on the big bridge faces
against 0.158–0.298 in the plate — is C2's material work and I have not touched it.

## P2.6 — counts, and the regression sweep

`--preset=high --dpr=1 --w=1600 --h=900`. Counts per D4.

| shot | calls | tris | texMB | was (r1) |
|---|---|---|---|---|
| `shell_flight` | 59 | 78k | 36.94 | 59 / 78k |
| `window_out@0.0` | **89** | 73k | 36.53 | 87 |
| `window_out@1.0` | 63 | 66k | 36.53 | 63 |
| `match_cut@0.0` | 67 (48 main) | 49k | 36.69 | 67 |
| `match_cut@1.0` | 43 | 60k | 36.69 | 48 |

`window_out@0.0` is at **89 of 90** and touches 90 at t = 0.15. One of the two added calls is the
glare mesh; I did not chase the other and it is a live risk — see E7. New texture cost this pass is
one 64² glare ramp, **+0.02 MB**.

**Regression sweep (D21): camera pose probed at capture time on seven scenarios C6 does not own.**

| shot | measured pose | `rig.posed` | calls / tris | matches owner |
|---|---|---|---|---|
| `sea_dusk` | `[0, 18, 0]` fov 14 | false | 3 / 30k | ✓ |
| `guns_fire` | `[-44, 18, 36]` fov 50 | false | 52 / 66k | ✓ |
| `fleet_wide` | `[-196, 46, -152]` fov 30 | false | 54 / 84k | ✓ |
| `splash_miss` | `[0, 19, 0]` fov 33 | false | 48 / 65k | ✓ |
| `night_burn` | `[0, 17, 0]` fov 30 | false | 77 / 78k | ✓ |
| `hit_explode` | `[0, 11, 0]` fov 40 | false | 65 / 74k | ✓ |
| `bridge_table` | `[-0.6, 19.8, -3.1]` fov 48 | false | 95 / 47k | ✓ |

All eleven sequences compile and seek at t = 0, 0.33, 0.66, 1 with no throw.
`shots/bridge_table.png` and `shots/boot.png` re-rendered and looked at — the dusk bridge with the
lit plot table over a sunset sea, and W0's cruiser with its bridge lit through its own glass.

## P2.7 — escalations

**E1 — closed by D23.** `CINE.exposure` is fixed and `caption.text` is gone.

**E2 — still live.** `shot.mjs --dpr=2 --w=1280 --h=720` hangs. Every render here is
`--dpr=1 --w=1600 --h=900`.

**E3 — `rain()` streak contrast is background-dependent by construction.** `js/world/vfx/fire.js`.
Two causes, both measured. (a) The streak colour is a fixed additive quantity set by `tone`, so its
contrast against the background is whatever the background leaves. (b) `rainField` composites
through `softAdd`, `dst' = src·(1−dst) + dst`, which gives a 145-luma sky **1.75× less** increment
than a 65-luma sea before any other term. Raising `tone` 0.30 → 0.52 moved the sky delta only
23.3 → 26.5, which is the knee, not a tuning failure. Cheapest real fix inside `fire.js`: an
optional `skyTone` applied to drops whose world y is above the camera's, so drops silhouetted
against sky can be brightened independently of drops over water. Three lines. I did not write it
because it is C4's file.

**E4 — C3's hull geometry, two defects, both in scored frames.** (a) The below-waterline section is
drawn above the water in `shell_flight`: a slab at min RGB (13,11,18) against a sea whose *minimum*
is luma 54, with an unfiltered silhouette (171 → 12 in one pixel). Wants an ambient floor, a clip at
the water plane, and a wet collar at the interface. (b) `window_out@1.0` has an open transom — a
hard-edged rectangle at luma 11–19 against a 66–125 hull. Both are visible in `critique/*_r2.png`.

**E5 — `ocean.js` needs a `setFlatten(a, b)` on the same override pattern as D14/D15/D17.** The
near-field detail inversion is `flatten = smoothstep(uFlatA, uFlatB, log2(vDist / max(-V.y,
0.0015)))`: dividing range by the grazing term means a near pixel seen at 3° depression is treated
as *further* than a mid-field pixel seen at 12°, so a level camera over water gets its smoothest
water nearest the lens. `uFlatA` / `uFlatB` come from the grade and `setDetailFade()` cannot reach
them. This bites every shot with a level camera low over the sea, which is most of C6's and all of
`shell_chase`.

**E6 — C2 should own `table.setEnv()`.** `bridge.setEnv()` grades the room's IBL and nothing grades
the table's, which is how the plot bezel ended up taking the noon sky at full strength in a room at
0.006. `tableEnv()` in `shots.js` traverses the table's materials and writes `envMapIntensity`
directly — that mutates a material C2 owns, and it is only safe because each scored scenario is its
own page load. It should be a setter on C2's side before anything runs two of these in one session.

**E7 — `window_out@0.0` is at 89 of 90 draw calls** and hits 90 mid-move. It is the only shot on the
project that draws the bridge interior, the ocean and the fleet at once. The lever if it has to
give is `bridge.setCrew(false)` (already set, worth 5) and then the glare mesh (worth 1, and it is
the shot's best single improvement this pass). Wave C should assume this shot has no headroom.

## P2.8 — what is weak, ranked, honestly

1. **The exterior half of the match cut is 7 m from a shell.** That is what holding the anchor at
   34% of frame height costs when the anchor is 8 m long. It reads, and the enemy line is in frame
   behind it, but the round is a large smooth white object for two of six frames and there is no
   surface detail on it at that range to reward the close-up.
2. **`window_out@0.0` fails D22's gate on the critic's own sampling (7.0 against [3,6]).** §P2.3
   explains the trade and I stand behind the choice, but a reviewer who takes the two-patch sample
   as canonical should read this as a fail, not a pass.
3. **Rain over the sky is still 1:11.6 where the plate is 1:1.6.** E3 is the fix and it is three
   lines in a file I do not own.
4. **Near-field water is still inverted (4.3×).** E5.
5. **The room is still painted boxes.** Surface texture on the big bridge faces measures 4× below
   the plate. C2's.
6. **The unlit hull slab and the stern void are still there.** E4. Both are single dark rectangles
   in otherwise decent frames and both cost Finish.
7. **The far end of every ship is still net blue.** Inverse-square from a single flash light does
   not reach 40 m of superstructure. A second, much dimmer, much wider fill light at the flash would
   close it and I ran out of confidence that it would not read as a second sun.
8. **`open_flyover` has still never been scored or played**, only posed. Six seconds is long for a
   phone.
9. **Free-look is still untested by a human.** The maths poses and eases; nobody has dragged it.
10. **`vfx.hit`'s `out` normal is still not computed** — `resolve()` passes none, so every hit's
    fireball is built around `(0,0,1)`. Carried from pass 1; still the cheapest unclaimed win in
    `sequences.js`.
11. **`depthTest: false` on C4's water patches is still a live risk** for `shell_chase` and
    `enemy_volley`, which have never been played with a live splash in front of a hull.

## P2.9 — measurement notes for whoever reads the numbers

* Every figure here is from the 1600×900 render, **not** from the sheet panel. The critic's figures
  are from the 900×506 panel. Absolute densities and pixel coordinates are therefore not comparable
  between the two; ratios and colour differences are. D19 says measure the panel the critic scores,
  and where I quote a critic figure alongside mine I have said which is which.
* No pixel-diff conclusions are drawn anywhere in this handoff (D13). Every claim is a targeted
  probe of a named region.
* Everything visual was verified by rendering the PNG and looking at it, not by reasoning about the
  code. The `tableEnv` finding in particular came out of an isolation run (`--pre` forcing
  `envMapIntensity = 0`), not out of reading the material.

---

# PASS 1

Kept for history. **§5, §9 and §10 below are superseded** by §P2.1, §P2.7 and §P2.8. §1's counts
are superseded by §P2.6. The rest — the sequence table, the `seek()` contract, the two C7 seams,
the rig verbs, the quality knobs, and §11's account of the camera regression — is still current.


---

## 0. What changed in one paragraph

The rig no longer writes the camera. Tweens write pose fields (`pos`, `target`, `fovDeg`,
`rollRad`) and `commit()` composes pose + jolt + handheld sway + free-look into the camera exactly
once per frame. That split is what makes free-look (brief step 2) possible at all — previously the
timeline and any live offset both wrote `camera.quaternion` and whichever ran last won. The eight
frozen sequences are authored against real scene anchors; three more sequences carry the scored
shots. The round in flight is a real object with an ogive body, a tracer, a vapour trail that
lights itself, and a sea-light so the water under it brightens. `present(events)` plays a whole
resolved shot from C5's event list and is the only call C7 needs.

---

## 1. Scored shots — measured

`--preset=high --dpr=1 --w=1600 --h=900`. Counts per D4; budget 90 calls / 300k tris / 45 MB
texture (**project total**, D16) / 60 fps.

| shot | plate | calls | tris | texMB | fps |
|---|---|---|---|---|---|
| `shell_flight` | `242050_01` | **59** | 78k | 36.94 | 60 |
| `window_out@0.0` | `1272010_02` | **87** | 73k | 36.51 | 60 |
| `window_out@0.5` | — | 67 | 69k | 36.51 | 60 |
| `window_out@1.0` | `236390_14` | **63** | 66k | 36.51 | 60 |
| `match_cut@0.0` (interior) | none | 67 | 49k | 36.69 | 60 |
| `match_cut@1.0` (exterior) | none | 48 | 66k | 36.69 | 60 |

`window_out@0.0` is the worst case at **87 / 90** — it is the only shot on the project that draws
the bridge interior, the ocean and the fleet in one frame. It is under budget with three calls to
spare and the lever if it ever isn't is `bridge.setCrew(false)`, which is already set for this
scenario and was worth **5 calls**.

**C6's own texture cost is one 96² canvas, `cine:streak`, 0.047 MB.** The shell's glow and its
vapour trail take slots in C4's existing `hotField` / `smokeField`, so a round in flight adds **one**
draw call (its own body) and **no** new texture.

`tools/exposure.mjs`, ours against the plate measured the way `compare.mjs` actually crops it (D19):

| | p1 | p5 | median | p99 | verdict |
|---|---|---|---|---|---|
| `shell_flight` | 38 | 44 | 114 | 195 | `LIFTED` |
| plate `242050_01` | 54 | 65 | 122 | 212 | `LIFTED` |
| `window_out@0.0` | 3 | 8 | 39 | 212 | ok |
| plate `1272010_02` | 1 | 2 | 6 | 166 | `CRUSHED` |
| `window_out@1.0` | 13 | 19 | 120 | 160 | ok |
| plate `236390_14` | 13 | 27 | 131 | 195 | ok |
| `match_cut@1.0` | 21 | 25 | 94 | 231 | `LIFTED` |

`shell_flight` trips `LIFTED` and **so does its plate, harder** — a bright silvery rainstorm has no
blacks in it. We are still a stop darker than the plate at every percentile. `window_out@1.0` lands
within 6 luma of its plate at the median and is short at the top end (160 vs 195).

**Regression sweep over every scored scenario on the project** (after the §11 fix), camera pose
probed at capture time on each and counts compared against what each component recorded:

| shot | calls / tris | recorded by its owner |
|---|---|---|
| `sea_noon` | 9 / 30k | 9 / 30k (C3 §0P3.9, quoting C1) ✓ |
| `guns_fire` | 52 / 66k | 52 / 66k ✓ |
| `guns_broadside` | 48 / 62k | 48 / 62k ✓ |
| `fleet_wide` | 54 / 84k | 54 / 84k ✓ |
| `hit_explode` | 65 / 74k | 65 / 74k ✓ |
| `night_burn` | 77 / 78k | 77 / 78k ✓ |

Four components' recorded figures reproduce exactly, and every one of the fourteen scenarios I do
not own reports `rig.posed: false` at capture — the rig never touches their camera. (`fleet_wide`
also completed normally here, against the stall C4 recorded in HANDOFF_VFX §6.)

---

## 2. The eleven sequences

`director.play(id, ctx)` → `Promise`. `director.seek(id, t)` poses. Ids of the first eight are
frozen.

| id | ms (`full`) | ctx | what it does |
|---|---|---|---|
| `open_flyover` | 6100 | `{ at }` fleet centre | wide arc across the fleet, climbs the tower, comes in through the bay and settles on the table. Exposure exterior→interior on the last beat. |
| `bridge_settle` | 900 | — | small settle onto the board. **Enables free-look**, which nothing else does. |
| `fire_out` | 2180 | `{ gun, aim, size }` world V3s | table → sill → through the glass → out and wide, then a `kick` as the guns go. |
| `shell_chase` | 2600 / 1800 / 0 | `{ round, from, to, size }` | trails the round down its own arc, easing outboard and lifting so the impact is already in frame. `ctx.round` is a tracer handle; `from`/`to` are the dry-run fallback. |
| `impact_miss` | 1100 | `{ at, eye }` | sits off the column and pushes in. |
| `impact_hit` | 1250 | `{ at, eye }` | closer, with a `kick`. |
| `enemy_volley` | 2720 | `{ own, foe, at }` | over your own rail at the enemy flashes, then swings to the struck plating — brief step 7. |
| `bridge_return` | 1240 | `{ from }` | back in through the bay to the table, exposure back to interior, free-look on again. |
| `shell_flight` | 2400 | — | **scored.** The chase pose held over one arc; `t = 0.5` is the money frame. |
| `window_out` | 1700 | `{ ms }` | **scored pair.** One curve from the interior pose to the exterior pose, with the exposure ramp and a sun ramp. |
| `match_cut` | 1000 | — | **scored.** Peg → shell, four beats, cut between C and D. |

`ctx.pace` is injected by the director (`'full' | 'short' | 'instant'`); `fire_out`,
`enemy_volley` and `bridge_return` shorten themselves off it and `shell_chase` returns immediately
at `instant`, because `CINE.shellMs.instant` is 0.

### Rig verbs

Everything BUILD_PLAN §2.3 declares is still there and still means the same thing
(`at`, `look`, `cut`, `dolly`, `orbit`, `hold`, `shake`, `exposure`, `fov`). Added:

```js
rig.move(fromPos, toPos, fromLook, toLook, ms, ease)   // the pair that makes up most beats
rig.path(points[], ms, { ease, look: points[]|[one] }) // Catmull-Rom; a lerp reads as a slide
rig.pose(ms, u => ({ pos, look, fov, roll }))          // the general parametric beat
rig.roll(deg, ms)          rig.fov(deg, ms)
rig.kick(amp, ms, hz)      // DETERMINISTIC shake: decaying oscillation of u, poses under seek
rig.drift(pos, aim, hz)    // handheld float, driven by the playhead, so it also poses
rig.exposure(from, to, ms, lag)   // lag in ms — the ramp trails the camera (BUILD_PLAN §7.1)
rig.freeLook(bool)  rig.nudge(dxPx, dyPx)  rig.lookOffset()
rig.adopt()                // take the camera's current transform as the pose, so a cut from a
                           // scenario's frameCamera does not snap on frame 1. Also poses the rig.
rig.release()              // hand the camera back; commit() goes inert until something poses again
rig.posedByTimeline()      // has the director claimed the camera yet?
aimFor(pos, subject, [ndcX, ndcY], fovDeg, aspect) → look   // exported from rig.js
```

`aimFor` is the one worth knowing about. It returns the look target that puts a world point at a
chosen NDC, so composition is arithmetic instead of nudging numbers — and it re-solves itself every
frame as the subject moves, which is what a chase camera needs. It is also what makes the match
cut's screen-position assertion true by construction (§5).

**`shake()` is still random and still edge-triggered — use it only in gameplay.** For anything that
has to appear in a scored still, use `kick()`.

---

## 3. `seek(id, t)` — the contract

`window.__waterline.seek(id, t, ctx)` → `director.seek()`. `t ∈ [0,1]`, clamped.

1. The generator is compiled **once per seek**, and every tween from every beat with `t0 ≤ ms` is
   applied in order. A later beat overwriting an earlier one is how the exterior half of
   `match_cut` wins over the interior half.
2. `rig.on(fn)` side effects are **never** fired under seek.
3. `rig.now` is set to the absolute ms before evaluation, so `drift` and `kick` are pure functions
   of `t` and pose identically on every call.
4. A tween may **write** world state (visibility, a light's intensity, a round's phase) as long as
   the write is a pure function of `u`. `match_cut` toggles the bridge and fleet roots and poses the
   round this way. It may **not read** live world state — that is the rule that keeps two seeks at
   the same `t` identical.
5. `seek()` clears `director.current`, so a seek during playback stops playback rather than
   fighting it.

Every scored scenario ends its `setup()` with a seek of its own sequence, so `--shot=x` and
`--shot=x --at=…` take the same code path.

Verified: all eleven sequences compile and seek at `t = 0, 0.33, 0.66, 1` without throwing.

---

## 4. The two seams with C7

C7 owns game flow and must not implement either of these.

### 4.1 The caption — `window.__waterline.cine.caption` (built by `main.js`, C6's module)

```js
caption.forShot(turn, kind)   // THE call. Returns the text shown, or null if this shot gets none.
caption.follow(() => V3)      // sit above a world point; call with no argument to stop
caption.unfollow()
caption.reset()               // new match — the long form is owed again
```

- Wording is D2 and is **not** a parameter. `forShot` returns the long form
  *"Ship and impact positions are dramatised."* the **first** time it fires in a match and
  *"Positions dramatised"* every time after. Do not pass your own text.
- Policy: shows on turn ≤ 1 and on the **first shot of each new ordnance kind**, never otherwise
  (BUILD_PLAN §7.4). `caption.shouldShow(turn, kind)` if you need to ask first.
- It auto-hides after `CINE.caption.ms`. You never call `show()` or `hide()`.
- `caption.reset()` on every `newGame`. **That is C7's one obligation here.**
- It is pumped from a system C6 registers on `app`; positioning is inline `left`/`top`/`transform`
  on `.caption` only, so every other property of `.caption` in `style.css` is still C7's.
- It lives inside `#ui`, which `body.shotmode` hides — so it is correctly absent from the blind
  sheets and correctly present in the game.

### 4.2 The turn hand-off — `window.__waterline.cine.present(events, opts)`

```js
const events = sim.fire(game, mySide, { kind, r, c });    // C5's redacted delta, unmodified
await __waterline.cine.present(events, {
  mySide: 0,          // the session's viewer — MUST match game.localSide
  turn: game.turns,   // picks the pace; nothing else reads it
  caption: __waterline.cine.caption,   // omit and no caption is shown
  pace: null,         // null = auto from turn. 'full' | 'short' | 'instant' to pin
});
```

`present` resolves when the camera is back where it started the turn. It:

1. picks the pace (`director.paceForTurn(turn)` unless you pin one),
2. reads the single `shot` event to decide **whose** turn this is (`shot.side === mySide`) and
   therefore whether to play `fire_out` or `enemy_volley`,
3. resolves gun and target world positions through `fleet.gunFor()` / `fleet.cellToWorld()`,
4. fires the muzzle, spawns the round, shows the caption and plays `shell_chase`,
5. calls `resolve(events)` — splash / hit / fire / **the red indicator on your own hull** / table
   pulses — and then `impact_hit` or `impact_miss`,
6. plays `bridge_return` if it was your shot.

At `instant` pace it skips straight to `resolve()` and waits `PACE.instant.ms`, camera untouched —
that is BUILD_PLAN §7.4's "impact only, the camera never leaves the table".

Also on `cine`:

```js
cine.resolve(events, { mySide, size })  // world consequences with no camera work; for replay/skip
cine.opening()        // open_flyover
cine.toBridge()       // bridge_settle — call this after placement, it turns free-look on
cine.fastForward(on)  // hold-anywhere 4x. NOT a skip: the result still lands
cine.skip()           // run the current sequence to its end state, firing pending side effects
cine.director, cine.rig, cine.caption, cine.SEQUENCE_IDS
```

**Two things C7 must do that `present` cannot do for itself.**

- **Lay the fleets out first.** `present` reads `fleet.cellToWorld` / `fleet.gunFor` / `fleet.shipAt`,
  and those need `fleet.layout(side, view)` to have been called for both sides. Without it every
  shot fires from a fallback position 60 m off the origin.
- **Drive free-look.** The rig implements it; nothing owns the pointer. On the bridge:
  `rig.nudge(dx, dy)` per pointermove while dragging, and nothing else — the ease back to the board
  after `LOOK.idleMs` is automatic and runs at `LOOK.easeMs`, per brief step 2 ("ease, don't snap").
  `rig.freeLook()` is turned on and off by the sequences themselves; do not call it.
- **If a screen wants the camera back, call `rig.release()`.** The rig writes nothing until a
  sequence has posed, and once one has, it keeps holding that pose every frame — which is what you
  want between turns and not what you want if a menu or a placement screen poses the camera itself.
  `release()` makes the rig inert again; the next `play()`/`seek()` takes it back. See §11.

`present` was smoke-tested end to end against a real `sim.fire()` (3 events: `shot`, `result`,
`turn`) at `setRate(10)`: resolved, no throw, splash placed, camera returned.

---

## 5. The match cut

BUILD_PLAN §7.3's design, built. Four beats, 1000 ms total, and the cut is the C/D boundary at
700 ms so the six-frame sheet (`--at=0,0.2,0.4,0.6,0.8,1`) lands one frame in each phase.

- **A (0–300 ms)** the peg lights and stretches ×8 on Y, camera easing in.
- **B (300–560)** stretch held, push finishes at the distance that makes the peg **44% of frame
  height** (`CUT.pegFrac`; §7.3 says ~30%, which measured too small to read on a phone).
- **C (560–700)** a 90° whip about the peg with the peg **locked in frame**, a soft-additive radial
  streak card standing in for motion blur, and the camera rolling to 1.02 rad.
- **D (700–1000)** the cut. Same subject, same screen position, same apparent size, still stretched
  and still rolled; it relaxes to its real proportions and rights itself while the camera closes
  from 76 m to 16 m.

**The screen-position assertion is satisfied by construction, and measured anyway.** Both halves
aim with `aimFor(pos, subject, CUT.ndc, fov, aspect)`, so the peg and the round project to the same
NDC by arithmetic. `window.__waterline.cine.matchError()` seeks one millisecond either side of the
cut and reports:

```
peg [-0.1365, 0.6090]   shell [-0.1276, 0.5968]   dxFrac 0.0044   dyFrac 0.0034
```

**0.44% of frame width against the 4% gate** — an order of magnitude of margin. (`matchError`
forces `updateMatrixWorld` before projecting; without it the measurement is taken against the
previous frame's camera and reports nonsense. It did, and reported 5.4.)

The round could not simply take the peg's ×8 on Y: a 0.38 m shell stretched eight times is a
four-pixel needle where the peg is a rod. It takes `CUT.shellStretch 3.4` with a matching
`shellFat 3.4`, and the distance is derived from that, so the apparent *length* still matches.

---

## 6. The round — `js/world/shell.js` + `js/world/vfx/round.js`

```js
vfx.tracer(from, to, ms, { size, seed, arc, trail, light, sea })  → handle
handle.at(t, out)   handle.head(out)   handle.pose(u, stretch, fat)   handle.round
setShellPhase(u)    // pin every live round at u — the shot harness needs this; null releases
ballistic(from, to, { arc })  → { at(u), dir(u), range, apex, from, to }
arcHeight(from, to)           // apex in metres, = range * 0.16
```

- **Body**: one 16-segment lathe, base at local `y = 0`, nose at `y = len`, because `poseAt` maps
  local +Y to the flight direction — build it the other way round and the round flies backwards.
  It did, and read as a blimp. Vertex-coloured: gunmetal body, copper driving band, incandescent
  base. One material, one draw call.
- **Tracer**: one bright base blob, one streak card and two long faint streaks — deliberately
  *not* five equal cards spaced along the axis, which is the countable-sprite finding drawn in
  fire. Screen-space angle from `screenAngle()`, so the streak lies along the flight path.
- **Trail**: cards laid **along** the path (`sy` is the along-path length, `sx` the width) and
  overlapping by **2.4× their spacing**. A card narrower than the gap between cards is exactly what
  makes a trail read as a dotted line of sprites; that is what pass 1 looked like before the fix.
  Every card clamps to `y ≥ seaHeight + width·0.65`, which is C4's §0 PASS 3 item 6 — a card
  straddling the surface is depth-clipped by the sea along its triangle edges and comes back as a
  hard unlit polygon.
- **It lights its surroundings.** A `seaSource` (radius **38 m**, in C4's stated 24–52 m working
  range, because `ocean.js` attenuates as `(r/(r+d))²` and a value in the low hundreds tints the
  whole sea rather than making a pool), a `warmSource` so rain streaks crossing it warm, and the
  trail's own cards tinted toward the tracer near the head and cooling to sun-lit grey behind.
  A `PointLight` only on `{ light: true }` — the ocean is a raw `ShaderMaterial` and no `PointLight`
  reaches it, so a light on open water is wasted (C4's note, and it holds).
- The `smoke` emitter was rewritten to take its colour from `warmSources()`, so a puff near a
  muzzle or a fire takes that light instead of reading as a flat grey decal.

**Everything above rides C4's shared fields.** No new field, no new texture, no bloom pass.

---

## 7. Driving C4's effects

`present()`/`resolve()` is the only caller.

| event | call |
|---|---|
| `result` miss | `vfx.splash(cellWorld, { size, seed: (r*131 + c*17) })` — a distinct seed per cell, so a salvo is four different columns rather than one column four times |
| `result` hit | `vfx.hit(ship.hullSide(t, 1), { size, seconds: 6 })`, then `fleet.mark(side, r, c, 'hit')` when the struck side is yours |
| `result` with `repeat:true` | **nothing** — no new column, no table pulse. C5 measured 6,686 of these across 5,000 games |
| `sunk` | `vfx.fire(ship.object3D, worldToLocal(hullPoint(t)), { seconds: 0, size: 9 })` |

Scenario staging uses `setImpactPhase`, `setMuzzlePhase`, `setShellPhase` and per-effect `{ at }`
so every scored still is reproducible. `resetGunOrder()` / `resetImpactOrder()` run in C6's own
`scene()` preamble.

`rain()` is called **last** in `shell_flight`, after the camera is posed, because it lays streaks
out around the *current* camera and does not follow a moving one. **If C7 ever flies the camera
during rain it must `kill()` the handle and re-issue it.**

One number that cost time: `rain({ tone: 0 })` does not make rain neutral, it makes it **orange**.
`tone` is the *cool base* term; with it at zero only the warm term survives and every streak in
frame comes back cream. `tone: 0.30` is the value in use.

---

## 8. Quality knobs

No new knob. Everything scales through existing seams:

- `PACE` — `full` / `short` / `instant` auto-select on turn count, `director.setPace()` to pin,
  `director.setRate(PACE.fastForward)` for hold-anywhere.
- `CINE.shellMs[pace]` sets the chase length; `0` skips the beat entirely.
- `VFX[size].cards` ladders the round's trail card count with the ordnance size, same as every
  other emitter.
- `LOOK.*` owns free-look sensitivity, limits and the ease-back timing.

The shot harness's own seams: `--at=`, `?shot=`, and `window.__waterline.cine.shot` (the live
staging object, for probes).

---

## 9. Escalated / requested

**Nothing blocking.** Two requests, both against files C6 does not own:

- **E1 — `CINE.exposure` needs a retune, and `CINE.caption.text` is now dead.** `config.js` is on
  C6's do-not-edit list, so `window_out` carries its own explicit exposure pair (**1.02 → 0.90**)
  rather than `CINE.exposure`'s **1.55 → 0.85**. 1.55 was written for a room lit only by its
  practicals; the room as C2 built it has a self-luminous plotting table in it and 1.55 renders it
  as a daylit cabin. `fire_out` / `bridge_return` / `open_flyover` still read `CINE.exposure` and
  are therefore **inconsistent with the scored shot** — whoever can edit `config.js` should set
  `interior: 1.02, exterior: 0.90` and delete `caption.text` (D2's wording is `SHORT`/`LONG` in
  `caption.js` and must not be configurable).
- **E2 — `shot.mjs` at `--dpr=2 --w=1280 --h=720` hangs on this machine.** Two runs sat with
  chrome alive and node blocked inside a CDP call for 4+ and 5+ minutes on a load-2.3 box with zero
  stray browsers; `--dpr=1 --w=1600 --h=900` on the identical scene completes in 20–30 s. Same
  shape as the `fleet_wide` stall C4 recorded in HANDOFF_VFX §6, and it is not in a component's
  code. **All C6 renders are `--dpr=1 --w=1600 --h=900`.** Anyone comparing against a `dpr=2`
  archive must re-render first (D13 rule 3).

Confirming C3's E4 from the other side: no bloom pass was asked for and none is wanted. The streak
card uses `softAdd()` from `field.js`, which is the same two-line blend, and its ramp is
premultiplied because that blend puts the factor on the source colour.

---

## 10. What is weak — ranked, honestly

1. **`window_out`'s luma continuity gate is not met and cannot be met with this framing.**
   BUILD_PLAN §4.3 wants mean frame luma monotone across `t = 0…1` with a 0→1 ratio in [3.0, 6.0].
   Measured: **62.7 / 58.5 / 106.6 / 103.6 / 101.7** — ratio **1.62**, and not monotone (a dip at
   0.25, a slow decline after 0.5). The gate was written for a dark room with a small bright
   window; our interior contains a self-luminous plotting table that is the game's whole identity,
   and it alone holds the frame at ~60. The plate itself sits at 17.7 → 118.3, i.e. a ratio of 6.7.
   Either the interior loses the table (and the shot loses the game) or the gate's band is wrong
   for this room. **I could not have both and chose the table.** This is the first thing a pass 2
   should be given an explicit ruling on.
2. **`shell_flight` is still a stop darker than its plate at every percentile** (p1 38 vs 54,
   median 114 vs 122, p99 195 vs 212) after raising exposure to 0.92 and `seaHaze` to 1.9. What is
   missing is not exposure, it is *veil*: the plate's whole frame is behind rain. More `murk` and a
   nearer fog would close it and would also hide the ocean's near-field facets (below).
3. **The ocean's near-field polygons show in `shell_flight`'s bottom-left corner.** A hard faceted
   crest edge at 4×, visible at 1:1 as a smooth dark blob. It is `ocean.js`'s radial LOD seen at a
   grazing angle from 45 m up, not C6's geometry, but the camera is what puts it in frame; a
   slightly higher camera or a nearer fog would take it out.
4. **The shell body reads as slate blue-grey, not steel.** Metalness 0.14 with a 0.46 vertex grey
   under a noon sky picks up the sea. It reads correctly as *a shell* at 4× — nose leading, driving
   band, hot base — but the colour is the weakest thing about it and the fix is a proper two-tone
   with a warm rim rather than a flatter material.
5. **`match_cut`'s exterior half is thin.** At `t = 0.8` the bolt is bright but narrow and sits
   close to the frame edge; the enemy line behind it is small. The interior half is much stronger
   than the exterior half, which is the wrong way round for a beat whose point is the arrival.
6. **The whip streak is a lane texture, not motion.** It reads at 1:1 and shows its 40 lanes at 4×.
   A real radial smear wants either a second card at a different rotation or a genuine directional
   blur, and there is no post chain to hang one on.
7. **`open_flyover` has never been scored and I have only watched it posed, not played.** Six
   seconds is long for a phone; the first two beats are strong, the arrival through the bay clips
   the window mullions on the way past and I have not tuned that.
8. **Free-look is implemented and untested by a human.** The maths poses and eases correctly and
   the limits come from `LOOK`, but nobody has dragged it on a touchscreen, and "does the ease-back
   feel like a bug" is exactly the question a headless harness cannot answer.
9. **C3's E3 will bite in motion.** The sea's specular glint is evaluated per fragment against an
   un-mip-filtered normal, so it is constant-frequency to the horizon. Every shot here moves the
   camera across it. I could not measure crawl from stills and I expect it to be the first thing a
   human notices when the game runs.
10. **`vfx.hit`'s `out` normal is not computed.** `resolve()` passes no `out`, so every hit's
    fireball is built around the default `(0,0,1)` rather than the plating's actual outward normal.
    C4 says it is "the one field worth getting right". It needs the struck ship's heading and side,
    both of which `fleet.shipAt()` can give; I ran out of pass.
11. **`depthTest: false` on C4's water patches is now a live risk.** C4 flagged it: foam and rings
    draw through anything between them and the camera. Nothing in the scored set is between them,
    but `shell_chase` flies the camera low across the water toward an impact and `enemy_volley`
    swings behind a hull. It has not been caught yet because those two beats have never been played
    with a live splash in front of a hull.

---

## 11. The regression I shipped mid-pass, and the rule it belongs to

**What broke.** `main.js:67` pumps `director.update(dt)` unconditionally from boot. My
`director.update()` ended by calling `rig.update(dt)` whether or not a sequence was playing, and
`rig.update()` called `commit()` — which by its own comment is the only place the camera is written.
So on every frame from boot, `commit()` stamped the rig's **constructor defaults** — App's boot pose,
`(24, 12, 34)` looking at the origin — over the camera. Any scenario that posed its own camera had
that pose overwritten on the very next frame. That is C1's `seaCamera()` shots, C2's and C3's
`frameCamera()` shots and C4's, i.e. every scored scenario on the project except the three I own,
because mine end their `setup()` with a `director.seek()` and were therefore the only ones the rig
was entitled to write.

**The fix.** `Rig.posed` — false until a timeline actually applies a beat. `commit()` and
`update()` both return immediately while it is false, so the rig does not touch the camera at all
until it is asked to. `Director.evaluate()` sets it, because evaluating a timeline *is* the director
claiming the camera; `compile()`/`duration()` do not evaluate and therefore do not claim it.
`rig.adopt()` sets it explicitly (that is the "take the camera from here" call), and the new
`rig.release()` hands it back — a screen or scenario that wants the camera after a sequence has run
calls that.

**Verified by probing the effect at capture time**, on scenarios I do not own, against the pose each
one authors:

| shot | authored | measured at capture | `rig.posed` |
|---|---|---|---|
| `splash_miss` | `seaCamera({ y: 19, fov: 33, horizon: 0.50 })` | pos `[0, 19, 0]` fov `33` dir `[0, 0, -1]` | false |
| `bridge_table` | `frameCamera({ pos: [-0.62, 19.80, -3.15], fov: 48 })` | pos `[-0.6, 19.8, -3.1]` fov `48` | false |
| `sea_dusk` | `seaCamera({ y: 18, fov: 14, horizon: 0.775, yaw: 0.06 })` | pos `[0, 18, 0]` fov `14` dir `[0.06, 0.07, -1]` | false |
| `guns_fire` | `frameCamera({ pos: [-44, 18, 36], fov: 50 })` | pos `[-44, 18, 36]` fov `50` | false |

`horizon: 0.50` is a level camera and measures dead level; `horizon: 0.775` with `yaw: 0.06` pitches
up and yaws, and both terms are present. Every one reports `posed: false`, i.e. the rig never
touched the camera.

C6's own three shots are unchanged by the fix — `posed: true`, poses exactly as authored
(`window_out@1.0` measures `[18, 12.5, 186]` against `WIN.eye1`), and **identical draw calls and
triangles** to the pre-fix numbers in §1 (59 / 87 / 67 / 63 / 63). `matchError()` still reports
`dxFrac 0.0044`.

`shots/bridge_table.png` and `shots/boot.png` re-rendered at `--preset=high --dpr=1 --w=1600 --h=900`
and both looked at: `bridge_table` is C2's dusk bridge with the lit plot table against a sunset sea,
`boot` is W0's cruiser at 16.5h with the bridge visible through its own glass. The scored sheets in
`critique/` were never rebuilt from the broken captures, so nothing historical moved.

**The rule, and why I of all people should have seen it.** This is D12/D15/D17 for the fourth time
and the first one where I wrote the offending side: *a value written once at setup and also written
by something that runs every frame belongs to the thing that runs every frame.* The camera is now
that value and the rig is that thing, so the rig has to stay out of the way until it is asked for.

The reason it survived my own regression check is worth recording separately, because it is a
different mistake: **I checked draw calls and triangles and concluded "nothing of theirs moved".**
`guns_fire` reported 52 calls / 66k tris from the boot pose — bit-identical to C3's recorded figure,
because the ship is at the origin and the boot pose still had it in frame. Counts are invariant to
where the camera points as long as the subject does not leave the frustum, so a count check cannot
detect a wrong camera. **I never opened the PNG.** Standing rule 6 says prove visual work by looking
at it; I looked at my own three shots and trusted numbers for everyone else's.

Worse, the one count that *did* disagree was the evidence and I explained it away: `hit_explode`
read **58 / 61k** against C4's recorded **65 / 74k**, and I wrote that off as "fewer live effects at
capture, not a cost change". It was the camera — from the boot pose part of C4's staging was outside
the frustum. Post-fix it reads exactly 65 / 74k. A number that does not reconcile is a finding, not
noise, and I had no control render to justify calling it noise (D13).

The check that catches this in one line is the one the manager sent: probe `camera.position` from
inside `--eval` and compare it against the pose the scenario authored. It is now the first table in
§1 and it should be run by anyone who touches `js/cine/` again.
