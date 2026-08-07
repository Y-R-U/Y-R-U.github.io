# P1 — world truth: the fleet frames, the flagship, the gun camera, the deckhead

Pass 1 of 2. Everything in `BRIEF_P1.md` is landed. Below: what changed, what I measured, what I
could not fix, and what I think belongs in `DECISIONS.md`.

Files touched: `js/world/fleet.js`, `js/cine/sequences.js`, `js/config.js` (`FLEET` only),
`js/world/bridge.js`, `js/world/ship.js`, `js/ui/flow.js` (one line). `js/ui/present.js` did **not**
need editing — both defects the brief filed against it (`gunPos`'s id collision, the flash/camera
disagreement) are in `sequences.js`'s `buildPresenter`, and that is where they are fixed. No git
command that writes was run.

**`js/world/ship.js` is not in the brief's "what you own" list.** I edited it. Two options, both
inert unless passed — `opts.bridge` and `opts.moored` — plus one clamp on the bridge-front ladder.
Nothing else builds a ship with either option, and the three scored gunnery scenarios are proven
byte-for-byte unchanged in every counter below. If you would rather that did not happen, the
alternative was leaving the tower's own tiers, its director cap and its glass block standing inside
the playable room; I could not find a way to hide them from outside `ship.js`.

---

## 1. `fleet.layout()` now writes side-local positions

`layout()` builds a `slots` list in side-local space (`cellLocal`), then instantiates. `cellToWorld`
is unchanged in behaviour and still returns world; it is now expressed as
`sides[side].localToWorld(cellLocal(r, c))` so the two cannot drift apart again.

The rng draw order per ship is unchanged (seed, jitter x, jitter z, heading), so every escort keeps
the layout it had.

## 2. The world is round the right way — D30

`sides[0]` is at the origin, `sides[1]` at `+FLEET.standoff` with its π rotation kept.

Measured live, mid-match, from `ships[side][i].handle.object3D.getWorldPosition()`:

| | before | after |
|---|---|---|
| your fleet (side 0) | z 735 … 998 | z **−242 … 176**, x −242 … 235 |
| enemy fleet (side 1) | z −108 … 83 | z **771 … 1030** |
| side frames | 0: z +450 · 1: z −450 | 0: z **0** · 1: z **+900** |
| `fire_out`'s gun anchor | (−6, 14.8, **816**) | (0, 20.0, **37**) |

That last row is the whole of D30 in one number: the gun the camera flies out to look at went from
816 m out of the window to 37 m ahead of it.

Two new `FLEET` knobs: `ownPull` 0.04 (your own side is barely drawn toward its centre — you are
standing in the middle of it) against `pull` 0.42 for the enemy, and `FLEET.flagship.clear` 165 /
`.gap` 95, enforced by `standOff()`: a radial push off the flagship, four relaxation passes against
each other, radius re-applied after each. The relaxation is what stops the push piling every escort
onto one circle. `FLEET.heroRange` is deleted — nothing read it after the detail rule changed.

## 3. The bridge is in a ship

**The flagship** is the longest ship of side 0, pinned at the world origin, bow +Z, `moored`, hero
detail, `cells: 6.4` → **L 115.2 m, B 16.46 m, freeboard 8.36 m**. It is positioned by
`handle.towerX` (the hull station its bridge tower stands on), not by its centre, so the room lands
over the tower and not over the funnels.

Its sizing is not arbitrary. Two constraints fixed it:

- **The window sill sets a down-angle.** Eye 20.25, sill 19.02 at 6.6 m — 10.6° is all you get, and
  nothing below that line beyond the glass can be seen. At 5 cells the forecastle is at 11.9 and A/B
  turret are entirely under it. At 6.4 cells the deck is at **14.0** and turret B's roof at **18.8**,
  which is above the sight line at its range. That is why the foredeck is in shot at all.
- **The beam sets the wings.** `B × 0.92 = 15.1` against `ROOM.w` 11.4, so the wings clear the house
  by ~1.8 m a side — which is what a bridge wing is.

**The tower** is built by `superstructure()` up to `ROOM.deck − FLEET.flagship.drop` = **16.75 m**
and stops: the last tier's height is clamped so its top lands exactly there, the director cap is not
built, and the kit's own bridge-glass block is not built (it is only ever pushed on the tier the
truncation removes). `bridgeTop` — where the masts hang — becomes `ROOM.deck + ROOM.h` so the
foremast house sits above the room rather than inside it. The mast itself is 5.8 m aft of the room
and clears it.

**The house** is new geometry in `bridge.js`: deck slab, pedestal down to the tower, port and
starboard walls (stopping at the bay's outboard corner, `BAY[0]`), aft wall, roof with an eave,
bridge wings with bulwarks and brackets, and an exterior skin over the bay's sill and header bands.
One merged mesh on `getMaterial('hull', 'turret')` — **one extra draw call**.

Three things that had to be got right and were each found by rendering, not by reasoning:

- **The hull material reads vertex colours for its AO.** A `BoxGeometry` has no `color` attribute,
  so the first version of the house rendered **solid black** on a grey ship. Every part now carries
  a white colour attribute.
- **`HOUSE.skin` alone is not enough — `GAP` is.** Flush against the room's own single-sided plates,
  the shell z-fights across the whole surface. My first roof was coplanar with the ceiling and
  striped the entire deckhead of `bridge_night` (mean diff 9.85 against a 0.003 noise floor). Every
  shell face now stands 8 cm off the plate it covers.
- **The bay's sill and header boxes are the compartment's own `panel`,** so from outside the front
  of the bridge was a warm brown wheelhouse bolted to a grey warship. They are skinned.

**Heave.** The flagship is `moored`: no heave, no roll, no trim. The room is fixed in world space
and half a metre of heave under it opens a seam at the deck and the deckhead every few seconds. The
cost is that the flagship's painted waterline no longer tracks the swell exactly; the collar and
skirt foam band is 2.5 m tall and covers it, and nothing I rendered showed it. **This is the thing I
am least sure of** — see §7.

`flow.js`: `layoutFleets()` no longer returns early when cinematics are off. With the flagship
carrying the bridge, skipping the layout is exactly the bug D30 describes.

## 4. `fire_out` is posed from the gun

The last two beats take a station computed from `ctx.gun`:

```
bore  = normalize(aim − gun) in XZ          beam = perpendicular to it
d     = clamp(len × 0.45, 30, 60)           ← len is the FIRING ship's length, passed in ctx
stn   = gun + beam·sign·0.78d + bore·0.30d + (0, 0.30d, 0)
hold  = gun − bore·0.55d                    ← what the camera actually frames
```

`hold` is the correction that made it work. Framed on the muzzle, the ship runs out of one corner
and half the frame is sea — I have the render. Framed a little back down the bore (which is back
down the deck, since the guns point roughly ahead) the bow, both forward turrets and the bridge fill
the diagonal. The final beat drifts the look only `0.55 × 0.5d` further down the bore; the previous
version lerped a fraction of the way to a target **900 m** away, which swung the whole ship out of
shot on the beat's first frame.

The window transit is kept: the second beat still leaves through the glass to a point 22 m out,
which is what motivates `CINE.exposure` (D23).

**The flash now goes off inside the sequence.** `ctx.flash` is fired by `rig.on()` at the top of the
kick beat. Before, `vfx.muzzle()` was called *after* `director.play('fire_out')` resolved, so it
landed on the first frame of `shell_chase` and was never once seen from the pose built to see it.
The same callback calls `fireGun(0)`, so the recoil, the flash and the shake are one event.

`outWide()` is gone (nothing used it). `outNear()` moved from `win + (1.5, −1.5, 34)` to
`win + (1.5, 5.5, 62)` — the old point is now **inside the flagship's forward barrels**.

**One ship, one anchor.** `gunner(side, at)` replaces `gunPos`: it asks `fleet.firingShip(side)`
(the flagship for side 0), trains her guns onto the target, and returns the ship, the anchor and its
world position. The camera pose, the muzzle flash, the tracer origin and the recoil all come from
that one anchor. The old code looked a **target** ship's id up in the **firing** side's list and
separately took `gunFor(side, null)`.

Training angle: a turret's bore is local +X and the hull carries its own heading, so
`ψ = atan2(−dz, dx) − hull.rotation.y`. Verified by the render — the turrets are trained onto the
target in the flash frame.

## 5. The camera is under the deckhead — D31

- `atTable()` 1.80 → **1.30** (`UI.camera.ceiling`).
- `bridge_settle`'s start offset +0.42 → **+0.10**.
- `open_flyover`'s approach `w + (3.2, 1.6, 12)` → `w + (3.2, 0.2, 12)`, and the waypoint before it
  12 → 9. The old point was y 21.2 — outside the room and above its roof, looking down into it. It
  also entered through the header box; the new one crosses the window plane at y ≈ 19.9, inside the
  19.02–20.18 glass band.

Sampled every frame through `open_flyover` + `bridge_settle` + the settle, 900 samples:

| | before | after |
|---|---|---|
| max camera y once inside the room | **21.17** | **20.38** |
| samples above 20.4 inside the room | **133** | **0** |
| samples inside the room | 588 | 596 |

("Inside the room" = z < 3.6 and y < 40, i.e. from the moment the camera crosses the window plane.
The deckhead is 20.68. The exterior half of the flyover peaks at y 150 by design and is excluded.)

Nothing became glass.

---

## 6. Measurements

### The three scored gunnery scenarios — unchanged

`tools/shot.mjs --dpr=1 --w=1600 --h=900`, rendered from a pristine `git show HEAD:` copy of the
tree and from the working tree.

**Every counter is identical**, including individual triangles:

| | calls | main | shadow | tris | mainTris | programs | textures | geometries | texMB |
|---|---|---|---|---|---|---|---|---|---|
| `guns_fire` | 28 | 22 | 6 | 55044 | 47124 | 23 | 24 | 31 | 36.51 |
| `guns_broadside` | 28 | 22 | 6 | 54354 | 46782 | 23 | 24 | 31 | 36.51 |
| `fleet_wide` | 31 | 25 | 6 | 68618 | 61454 | 24 | 24 | 35 | 39.19 |

Pixels differ, and per D13 that means nothing until it is compared with a same-code control. I
rendered the **before** tree twice more to get each scenario's own floor:

| | before-vs-after | same-code control | verdict |
|---|---|---|---|
| `guns_fire` | mean 4.37 | 3.82 / 2.89 / 1.26 (three pairings) | within its own spread |
| `guns_broadside` | mean 0.76 | 0.73 | within |
| `fleet_wide` | mean 0.51 | 0.16 (before) · 0.55 (after) | bracketed |

The cause is visible in the renders: the hull sits at a different point in its heave cycle. The
harness settles a fixed number of frames, not a fixed amount of simulated time.

### The three bridge scenarios — I edited `bridge.js`, so I checked

`bridge_night` and `bridge_lamp` are essentially deterministic (same-code floor **0.003** mean).

| | first attempt | after the `GAP` fix | noise floor |
|---|---|---|---|
| `bridge_night` | 9.85 (deckhead striped) | **0.004** | 0.003 |
| `bridge_lamp` | 3.85 | **0.002** | ~0.002 |
| `bridge_table` | 4.62 | **0.291** | ~0.003 |

`bridge_table` is the one still moving. The difference is 8.6% of pixels at mean 0.29, localised
to the top-right corner (the starboard bay corner, where the exterior side wall stops at `BAY[0]`)
and to two cells on the deck edge. The two renders are indistinguishable to me side by side and I
have read both back. Draw calls, triangles and texture MB are unchanged. I have not chased it
further; it is a real difference, not noise, and I am declaring it rather than rounding it away.

### Draw calls in a live match

Everything below is from one harness (headless, `--headless=new`, cache disabled, fresh profile,
1280×800) so before and after are comparable to each other. **They are not comparable to the 167
main / 136 figures in `MANAGER.md`** — that harness reads much higher absolutes than mine on the
same build, and I did not chase why. Treat the deltas, not the levels.

Because the live fleet is drawn from real entropy, frustum culling differs run to run (55–67 main
across eight runs of the same code). So the row that matters is the **pinned** one: the same
hand-written fleet laid out on both trees, camera at the same settled pose.

| | before | after |
|---|---|---|
| settled, pinned fleet — total | 80 | **77** |
| settled, pinned fleet — main | 59 | **61** |
| settled, pinned fleet — shadow | 21 | **16** |
| settled, pinned fleet — tris | 84.9k | 80.0k |
| peak through a shell shot — total / main | 111 / 90 | **108 / 92** |
| peak through a salvo — total / main | 103 / 82 | **105 / 89** |
| texture MB | 39.03 | 39.03 |

**+2 main settled, +7 main on the salvo transient, −5 shadow. Total is down 3.**

What the flagship's hero detail cost, and what paid for it:

- **spent:** one hero hull (hull · deck · structure · glass · rails · contacts · crew · wake ·
  collar · skirt · turret IM · barrel IM) and **one** more for the bridge house.
- **taken back:** the detail rule was `range > heroRange ? 1 : i < 2 ? 2 : 1`, which gave the enemy
  side **two** hero ships (measured before: side 1 ships 0 and 1 at detail 2). It is now
  "flagship 2, everything else 1" — one hero ship in the world instead of two, and the one that
  remains is the one 40 m from the camera rather than one 900 m away.
- **and:** −5 shadow calls, because the old layout had two hero ships inside the shadow box centred
  on the origin (D20) and now only the flagship is.

All peaks are under the 120 ceiling on this harness.

### What these tests could not have caught

Stating this plainly because the brief asks for it:

- **Everything above is headless software rendering.** No fps, GPU-time or thermal claim is made,
  and D4 says only Aaron's device can gate that.
- **The pinned-fleet draw-call comparison uses one board.** A different fleet composition (more
  ships, a 12×12 ladder rung with 7) will produce different counts. I did not sweep boards.
- **The camera-y trace samples every frame of one flyover at one aspect ratio.** It cannot catch a
  pose that only exceeds the deckhead in portrait, and I did not run portrait at all. C7 measured
  the portrait play camera separately; `atTable` and the play pose now agree at 20.25, so I expect
  no change there, but I did not measure it.
- **A single shell shot and a single salvo.** `heavy` was never fired. `short` and `instant` pace
  were never exercised — every timing above is `full` pace, turn 1.
- **The `moored` flagship was never watched over a long swell cycle.** I have stills, not a video.
  If the sea and the painted waterline disagree visibly, a still at one phase will not show it.
- **`bridge_return` was never seen landing.** The probe's screenshots at that point in the beat
  caught `impact_miss` instead. I moved `outNear()` out of the barrels by arithmetic and confirmed
  no exception, not by looking at the frame.
- **The enemy's guns are trained but do not visibly move.** Enemy ships are detail 1, where the
  turret geometry is merged into the static structure mesh and only the anchor rotates. The flash
  and the tracer come from the right place; the barrels on screen do not follow. Pre-existing —
  `trainGuns` had only ever been called on staged hero ships — but it is now called every enemy
  turn, so it is newly reachable.
- **No console errors in any run** (`Runtime.exceptionThrown` and error/warning console events were
  captured on every probe; all empty). That is not the same as no bugs.

### Images read back with the Read tool

All under the scratchpad, prefix `p1_<tag>_`:

| what | file |
|---|---|
| the flagship's hull through the window, resting pose | `p1_z_window.png` |
| B turret's barrels and the forecastle from the glass | `p1_fin_foredeck.png` |
| the bridge as part of a ship, mid-flyover | `p1_fin_fly3.png`, `p1_a9_fly4.png` |
| the house close up from the port bow | `p1_a8_house.png`, `p1_a9_house.png` |
| the flagship in company, exterior | `p1_a6_exterior.png`, `p1_a2_exterior2.png` |
| **`fire_out` at the muzzle flash** | `p1_a6_f4.png` |
| the enemy line at 900 m, impact beat | `p1_fin2_ret1.png`, `p1_fin2_ret2.png` |
| gunnery before / after / control | `p1_before/`, `p1_after/`, `p1_ctrl/`, `p1_final/` |
| bridge scenarios before / after | `p1_before/bridge_*.png`, `p1_after4/bridge_*.png` |

The probe is `scratchpad/wl_p1.mjs` (a copy of `wl_probe2.mjs`, not an edit of it). `WL_ROOT=<dir>`
serves a different tree, which is how the before/after pairs were taken from
`scratchpad/wl_before/` — a copy of the working tree with the six changed files restored from
`git show HEAD:`. Nothing in the repo was written by any of it.

---

## 7. What I could not fix, and what is still wrong

1. **The tower is short.** From the deck at 14.0 to the room floor at 18 is 4 m of tower, and the
   whole superstructure is ~10 m over a 16.5 m beam. It reads as a deckhouse more than as a bridge
   tower. The lever is `ROOM.deck`, which the brief allows me to move — I did not, because
   `bridge.js`'s `seaContacts()` places its hulls at `ROOM.deck − 15.4` and its lamps at
   `ROOM.deck − 13.0`, so raising the deck lifts every distant contact in `bridge_table` and
   `bridge_night` off the water by the same amount. Those are scored shots I was not asked to move.
   If you want the taller tower, `ROOM.deck` → 21 plus three constants in `seaContacts()` is the
   whole change, and it wants a re-score of the bridge trio.
2. **The flagship does not move on the swell** (§3). Rigid was the right trade for the seam, but it
   is a trade.
3. **`bridge_table` moved by 0.29 mean** (§6) and I have not explained it.
4. **The tower roof outside the window is a bare plate.** From the resting pose you look down on a
   9 m × 5 m featureless slab between you and the forecastle. It wants a signal deck's worth of
   clutter — that is C3/C2 dressing work, not P1's.
5. **The starboard bay corner leaks.** The exterior side walls stop at `BAY[0]` so as not to stand
   in the port view; forward of that corner the room's own side plate is single-sided, so from a
   narrow angle off the bow you see a sliver of warm interior where steel should be. Visible in
   `p1_a9_house.png` at the right-hand end of the window band, about 30 px across.
6. **The house has no fittings.** No door, no ladder to the wings, no windbreak. It is six slabs.

## 8. For `DECISIONS.md`

Three things I think are rulings, not notes:

- **D-next(a) — the flagship is rigid, and the room is why.** Any object fixed in world space that
  sits on a hull forces the hull to stop heaving, or forces the object to become a child of `body`
  and drag every camera anchor with it. We took the first. If a later pass wants the bridge to move
  with the sea, the camera anchors have to move with it too and every `sequences.js` generator that
  reads `table()`/`win()` at compile time becomes frame-dependent — that is a real architectural
  change, not a tuning one.
- **D-next(b) — a shell around a single-sided room needs a standoff, not just a thickness.** `GAP`
  in `bridge.js`. A face flush with one of the compartment's plates z-fights across the whole
  surface, and it is invisible in a screenshot of the *outside* — it only shows from inside. This is
  the same shape as the standing trap in `MANAGER.md`: the value looked configured and was defeated
  downstream. Cost me one full render cycle of the bridge trio to find.
- **D-next(c) — a camera beat whose look target is hundreds of metres away cannot be steered by a
  fraction.** `fire_out`'s old `lerp(gun, aim, 0.5·u)` moved the look 445 m in 460 ms from a camera
  40 m off the subject. Look targets in a close beat have to be authored in metres from the subject,
  not as a fraction of the way to the objective.

One smaller thing worth recording: **`Runtime.evaluate` with `awaitPromise: true` on
`flow.fire()` waits for the entire turn**, so every screenshot timed off it lands after the sequence
it was meant to sample. Two of my early "the framing is wrong" readings were that, not the framing.
Fire without awaiting and time the captures from `performance.now()`.
