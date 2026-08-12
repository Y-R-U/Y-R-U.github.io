# SF-LEVEL — movement four

Owns `game/js/sim/level.js` and `game/js/sim/glade.js` (new), plus `tools/level4.mjs` (new, tests).
Nothing else was touched.

The road no longer stops at 7700. Movement four — the breach, the scorched approach, the Glyphglade
and the arena the Seam is fought in — is built and walked. All of contract §3.5 is delivered.

---

## 1. The marks

`buildLevel(world)` returns `{marks, statics}` as before. New entries, exact shapes:

```js
marks.stones = { x: 7550, brazier: <prop>, a: 7500, b: 7600, stones: [<prop>, <prop>] }
marks.gate   = { x: 7770, y: 149.72, w: 240, open: false }      // `open` flips in openGate
marks.glade  = { x: 8760, staffX: 8790, ring: [<prop> x8], a: 8520, b: 9100 }
marks.arena  = { x: 10300, y: -240, w: 1900, h: 1000,
                 bossX: 10300, bossY: -233.04,                  // = groundAt(10300) - 330
                 piers: [...], arches: [...], courses: [...], deck: [...],
                 props: [ ...72 props... ] }
marks.seal   = { x: 9620, closed: false }                       // `closed` flips in sealArena
marks.approach  = { a: 7960, b: 8520 }
marks.gladeFire = [<brazier prop>, <brazier prop>]              // extra, flanking the staff
```

Everything the contract named is there and at the contract's values. `marks.arena` carries extra
keys beyond `{x,y,w,h,bossX,bossY}`; they are additive, and `d.arena = o.arena` in `theseam.js`
ignores them.

`marks.arena.bossY` lands on -233 rather than exactly -240 because it is derived
(`groundAt(10300) - 330`) and the arena floor is at y≈97. The profile was tuned so those two agree
to within 7px — `marks.arena.y` is the contract's -240 verbatim.

## 2. The two functions

```js
import { openGate, sealArena } from './level.js';   // re-exported from glade.js
openGate(world, marks)   -> bool   // false if already open
sealArena(world, marks)  -> bool   // false if already closed
```

Both are **idempotent** (they flip `marks.gate.open` / `marks.seal.closed` and no-op afterwards) and
both are safe to call cold, in any order, from a skipped cutscene.

`buildLevel` also binds `world.openGate = () => openGate(world, marks)` and the same for
`sealArena`, so the §3.3 cue table's `world.openGate()` works with no wiring. **SF-ACT's
`act.rebuild()` overwrites both with its own idempotent wrappers that delegate to these** — that is
fine and is the live path; mine are the fallback when `act.js` is absent.

`openGate` emits `gate:open {x}`; `sealArena` emits `arena:sealed {x}`. Neither is required by
anything; they are there if you want them.

## 3. Region boundaries — SF-ACT triggers off these

Exported as `REGION` from `sim/glade.js`, so import it rather than copying numbers.

| x | what |
|---|---|
| 7500 / 7550 / 7600 | standing stone, brazier, standing stone — `marks.stones` |
| **7660 – 7900** | the rock face. Impassable and `NOBREAK` until `openGate` |
| 7770 | `marks.gate.x`, centre of the breach |
| 7600 – 7970 | what `openGate` carves out |
| **7960 – 8520** | the approach — scorched track climbing 280px |
| **8520 – 9100** | the Glyphglade plateau, flat at y≈-92 |
| 8790 | `staffX`. Ring centre. **Keep this spot clear** — SF-STORY's staff stands here |
| 8490 / 8675 / 8905 / 9067 | the ring stones' x positions (radius 300, near and far arcs paired) |
| **9100 – 9500** | the descent into the bowl, 200px down |
| **9500 – 11160** | the arena floor, y≈97 down to y≈87 |
| 9620 | `marks.seal.x` — SF-ACT fires `sealArena` when `player.x > 9620` |
| 9300 – 9540 | where the seal's plug lands. **West of the trigger**, so he is never inside it |
| 10300 | `bossX`. The tear hangs in the widest arch |
| 11160 – 11264 | the arena's east cliff. The terrain grid ends at 11264 |

`world.bounds` is now `{x0: -240, x1: 11400, y0: -2100, y1: 780}`. `bounds` only clamps the
**camera** — it does not clamp the player, which is why every edge of movement four is real geometry.

`groundAt(x)` is unchanged below x=7100 and defined out to 11300. The road's `+0.18` ramp now stops
at x=7960 instead of running forever (past 8000 it put the ground below the terrain grid);
`gladeProfile(x)` in `glade.js` adds the climb and the bowl on top, smoothstepped, peak slope 0.75.

## 4. The arena

72 props between 9450 and 11260, 52 of them in support chains, deepest chain **5 links**:

```
pier (grounded)  ->  arch  ->  spandrel course  ->  gallery deck  ->  tower  ->  tower cap
```

Six piers at 9660/9910/10160/10440/10690/10940, five arches spanning them (the centre bay is the
widest — the boss is 150 across and a 178px doorway would have been a coffin), two spandrel courses
per arch, a nine-segment gallery on the courses with **two bays already missing**, a parapet, and two
towers. Plus an east buttress stack, ground clutter, three braziers and two standing stones.

Measured against the real boss: **`collectArena` returns 86** (the 72 arena props plus 14 in the
glade, which fall inside its 1900px radius), and `tearArena` at phases 2/3/4 puts 34 → 74 → 86 of
them down — four distinguishable stages, and the cascade does most of the work, not the direct tear.

Two raised ledges per side, one-way terrain, stepped 150 apart (floor → step at ground-150 → shelf
at ground-300), placed between piers so they slot under the arcade's springing.

**Every arena prop is `solid: false`** and every raised surface is one-way terrain. That is what
makes the floor un-blockable no matter how much of the place ends up on it — settled rubble is
non-solid too. Verified: a headless player crosses 9660 → 11128 at every phase.

### The sort order gotcha, if you add props out here

`collectArena` grabs everything within `max(w,h)` = **1900px of (10300, -240)** and sorts it by
`|x - 10300|` **descending**, so the tear eats the farthest first. The glade's ring (|dx| 1233–1810)
therefore sorts ahead of every arena prop (|dx| ≤ 880) and is torn first, off camera. That is why
nothing on the approach is placed east of **x = 8340** — a prop at 8400 is inside the radius and
would burn tear budget on scenery nobody can see. Keep that line.

## 5. `sealArena` — why it holds

The wall climb beats walls. It also beats *tall* walls: the terrain grid's ceiling at y=-2560 is open
air, so anything reaching the top of the grid is a ladder out of the world. A headless player proved
it by climbing the arena's first east wall and leaving at x=11685.

So every vertical face in movement four ends in an overhang, built by `cliff()` in `glade.js`:

- **plug** x 9300–9540, floor up to y=-1400
- **brow** x 9300–10260, y -2100 to -1400 — 720px deep, and it covers the plug as well as the gap

A wall jump leaves at vy -940 into gravity ~3120: 0.6s above its launch height, ~350px of travel.
720 is twice that. From the floor the brow's underside is 1490px up and the highest ledge is 300.

The same shape guards the arena's **east cliff** (wall 11160–11264, brow 10600–11300 above -1400)
and the **rock face** at 7660–7900 (cap -1300, brow 7380–7900) — without the last one, 40 seconds of
wall-jumping at the pre-gate rock face skips the whole of act two.

All three are `FLAG.NOBREAK`, because acid and void both eat ROCK and none of these is a door you
chew. `openGate` lifts the flag over the breach before carving (`carve` honours `NOBREAK`).

Proven: 20s of jump-spam holding *into* the plug tops out at y=-1316 against the brow, x never below
9575; then 12s holding *away* never gets above the brow line at all. See §7.

`sealArena` nudges the player east if he is within 90px of the plug when it fires — being read a
frame late and buried inside the rock is unrecoverable.

## 6. Recognisability — the glade

Matched to `intro/stage.js`'s `clearing` preset: ring of standing glyph stones (r=430 there, 300
here), ward burnt into the ground, Vayne where he fell.

- The ring is drawn **as a ring**: far arc smaller, dimmer, higher in the frame and into
  `TERRAIN_BACK`; near arc bigger and into `TERRAIN_FRONT`. Side-on it reads as a circle you are
  standing inside rather than a row of stones.
- The ward circle is `T.scorch` on the real terrain (the floor is actually charred) with a
  cold-blue glyph line drawn as `statics` along an ellipse — the shape a player watched crack for
  forty seconds in the cinematic.
- Two braziers flank the staff at ±150. They started on the ring's rim and the middle of the glade —
  where the whole scene plays and where Rook kneels — was unlit black in both orientations.
  **`staffX` = 8790 is clear**; nothing is placed within 145px of it.

## 7. Verification — `tools/level4.mjs`

Raw CDP, real input via `input.setAction`, `--enable-unsafe-swiftshader --use-gl=angle`, every URL
carries `&nosave`.

```
node tools/level4.mjs walk | seal | tear | shots | all
```

Current results:

| test | result |
|---|---|
| `walk` | 7400 → 10373 holding **right only**. `wall-frames = 0`, never below pitY, no stall. **PASS** |
| `seal` | 20s jump-spam into the plug: minX 9575, tops out at y=-1316. 12s the other way: never above the brow. **PASS** |
| `tear` | `collectArena` = 86; phases 2/3/4 reached; 34 → 74 → 86 down; **0 floor gaps** at every phase; player crosses 9660 → 11128 at every phase. **PASS** |
| `shots` | 4 spots x {1440x900, 390x844} into `docs/shots/m4-*.png`. **PASS** |

Two things the harness has to do that are worth knowing:

1. **`__t.quiet()`** stands down SF-ACT (`ctx.act.update = () => {}`) and skips any playing scene,
   then hands `playerControl` back. Without it the walk test stops dead at the stones cutscene.
2. **It dismisses `.sf-modal`.** `main.js` gates the sim on `ui.blocked`, and during the boss test
   the Seam's beam kills its own adds, Rook banks the xp, the spell offer opens and *the world stops*.
   That looks exactly like a hung level and cost an hour. The tear test also flips the boss onto
   team 0 so it cannot kill the test subject while still shifting phase and chewing the floor.

## 8. Gotchas for whoever is next

- **`bounds` does not clamp the player.** Only the camera. Every wall out here is terrain.
- **The terrain grid ends at x=11264** (`createTerrain` defaults, owned by `world.js`). There is no
  ground past it. `bounds.x1` is 11400 so the camera can frame the far side of the fight; the east
  cliff at 11160 is what actually stops him. If anyone widens the level, the grid has to grow first.
- **A prop placed above the ground line needs `grounded: true`** or `solve()` finds it unsupported on
  frame one and topples it. The far arc of the ring sits 20–44px above the ground line on purpose.
  (Three Sunderwood props — the crate at 2700, the barrel at 3060, the mushrooms at 3420 — had this
  bug since the level was written and were toppling at level start. Fixed; their bottoms now sit
  flush with the ledge tops at -136 / -286 / -436.)
- **A small isolated terrain block renders as a glowing white bar.** The renderer puts a lit lip on
  every exposed face, which sells the ground line everywhere else; a 150x70 shelf is *all* exposed
  face. The raised ledges are `T.scorch`ed to 0.22 to knock them down, which is also true — this
  floor has had a seam burning through it. If you add ledges, char them.
- **`stepUp` is 52** and physics substeps at 8px, so slope is never the problem; head height is.
  Player is 46x152.
- The vertical **dotted line at ~1400px intervals** in the screenshots is a parallax band tile seam
  and predates this work (see `sim/index.js`'s note on `*_near`/`*_fg` unfeathered edges). It is not
  terrain.
- **Portrait framing:** below the ground line, roughly the bottom third of a 390x844 frame is flat
  sub-ground. That is `LEAD_PORTRAIT = 0.22` in `sim/index.js`, held down deliberately because
  lifting the camera drags an unfeathered art band into the sky. Movement four inherits it; it is an
  art-side fix, not a level one.

## 9. What I would do next

- The gallery's parapet and the two towers top out around y=-950, which is off the top of a
  landscape frame (visible band is about ground-830). They are worth their prop cost when they fall
  *through* the frame, but a shorter, denser arcade would show more of the collapse.
- The tear list's first tranche is the glade ring, off camera behind the seal. Nothing in my files
  can reorder it (the sort lives in `theseam.js`). If someone owns that file later, sorting by true
  distance from the arena rect rather than `|dx|` would put every phase-two casualty on screen.
- The approach (7960–8520) is the thinnest section: one brazier, ten props, 560px. It earns its keep
  as a breather between the breach and the glade but it would take another pass of dressing.
