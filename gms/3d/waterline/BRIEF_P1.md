# P1 — world truth: the fleet frames, the flagship, the gun camera, the deckhead

You are the only coder agent running. Aaron played the shipped build on a phone and filed six
things; this brief is the three that are one problem in the world, not in the UI.

Read first, in this order: `DECISIONS.md` **D30 and D31** (they are the rulings this brief
implements, and they carry the measurements), then `HANDOFF_SHIP.md` §fleet, `HANDOFF_CINE.md`.
`MANAGER.md` has the standing traps. The standing rules at the bottom of `DECISIONS.md` bind you —
particularly the comment style and "prove visual work by looking at it".

## What is wrong

Measured live, mid-match, on the current build:

```
your fleet   (side 0)  z 798 … 923      the enemy fleet (side 1)  z −9 … −152
the gun fire_out looks at:  859 m from the camera
camera at the end of open_flyover:  y 20.71–20.75 for ~2.3 s, deckhead is at 20.68
```

Your own fleet is 850 m out the window. The enemy fleet is parked on top of the bridge. And the
resting bridge camera is above the ceiling.

### 1. `fleet.layout()` mixes local and world space

`js/world/fleet.js` `layout()` does `const p = api.cellToWorld(side, def.r, def.c)` — that is
`sides[side].localToWorld(local)`, a **world** position — and then
`handle.object3D.position.copy(p)` with the handle parented to `sides[side]`. Side 0 double-counts
the 450 m standoff. Side 1 has `rotation.y = π`, so it cancels instead.

`cellToWorld` itself is correct and other callers (`present.js`, `sequences.js`, `mark()`) depend on
it returning world space. Do not change its contract. Place ships in **side-local** coordinates.

### 2. The world is the wrong way round

Right now side 0 sits at +standoff/2 and side 1 at −standoff/2, with the bridge window facing +Z.
Even with the frame bug fixed, that puts your own fleet out the window and the enemy behind you.

**D30 rules the layout:** your own side is centred on the bridge (frame at z ≈ 0); the enemy is out
the window (frame at +standoff). You stand in your own formation and shoot at theirs.

### 3. There is no ship under the bridge

`bridge.js`'s `foredeck()` was scenario dressing, and `flow.js`'s `playScene()` strips every `_bd*`
object, so in a real match the bridge is a glass room floating at y = 18 with nothing under it.
Aaron: *"The bridge is not in a ship! it is floating."* He offered two fixes — put it in a ship, or
make the exaggeration explicit with callout lines. **Take the first.** The numbers already work:

- a 5-cell battleship is L = 5 × 12 × 1.50 = **90 m**, beam 90/7 = **12.9 m**
- `superstructure()` builds the bridge tower as a stack of frusta from `dk(0.36)`, and the bridge
  wings are `B * 0.92` = **11.8 m** across
- `ROOM.w` is **11.4 m**. The room is almost exactly the width of the wings.

So: **pin one ship of side 0 at the origin, bow +Z, and sit the bridge room on its bridge tier.**
Measure where that tier actually is rather than trusting my arithmetic — `ROOM.deck` is 18 and the
tier may not land there. You may move `ROOM.deck`, or scale the flagship (it is the flagship; bigger
than its escorts is fine and reads well), or both. What you may not do is leave a visible seam: from
outside, the room must look like it belongs to that hull; from inside, no hull geometry may poke
through the deck, the deckhead or the window glass. The kit's own bridge-glass block sits roughly
where our room goes — hide or omit it on the flagship.

Every other side-0 ship keeps a clear radius around the origin so nothing parks inside the bridge.

### 4. `fire_out` never has the firing ship in frame

`js/cine/sequences.js` `fire_out` flies to `outNear()` / `outWide()`, both authored as offsets from
the **window anchor**, and only the look target comes from `ctx.gun`. With the fleet fixed, your
guns are near — but the pose is still anchored to the window, so a ship 200 m abeam is a speck.

Make the last two beats pose **relative to `ctx.gun`**: leave the window, then take up a station off
the firing ship's beam at a distance scaled by the shell size, so the hull fills a real part of the
frame and the muzzle flash goes off in the lens. Keep the window transit — it is what motivates the
exposure change (`CINE.exposure`, D23) and it must still read as going *through the glass*.

Two related defects while you are here, both in `js/ui/present.js` / `sequences.js`:

- `gunPos(shot.side, results.find(x => x.shipId != null)?.shipId ?? null)` looks up a **target**
  ship's id in the **firing** side's ship list. It is an id collision that happens to return
  something. The firing ship should be one of yours, chosen deliberately.
- `const flash = fleet.gunFor?.(shot.side, null)` can pick a different ship from the one `gun` came
  from, so the flash and the camera can disagree. One ship, one anchor, both.

### 5. The camera sits above the deckhead — D31

`sequences.js`: `atTable()` is `table + (−0.62, 1.80, −3.15)`. The table is at y 18.95, so the pose
is 20.75. `ROOM.deck` 18 + `ROOM.h` 2.68 = **20.68**. `bridge_settle` starts higher still (21.17).
Aaron sees the inside of the roof for about two seconds at the end of every fly-in.

`UI.camera.ceiling` is 1.30 and is the correct number. Drop `atTable()`'s 1.80 to 1.30. Check
`bridge_settle`'s start pose and `open_flyover`'s approach through the window for the same fault —
the approach passes `w + (3.2, 1.6, 12)`, y 21.2, and looks down into the room from outside it.

**Do not** make the roof glass or fade it. That was Aaron's guess at a fix; the cause is the camera.

## What you own

`js/world/fleet.js`, `js/cine/sequences.js`, `js/ui/present.js`, the `FLEET` block in
`js/config.js`. You may edit `js/world/bridge.js` and `js/ui/flow.js`'s `playScene()` for the
flagship, and `ROOM` if the tier height needs it. `js/main.js` is frozen — if you need wiring there,
say so in your handoff and I will rule on it.

**Do not touch:** `js/sim/`, `js/ui/hud.js`, `js/ui/setup.js`, `js/world/sky.js`. Two other agents
follow you into `flow.js` and `sky.js`; keep your diff there minimal and obvious.

The three scored gunnery scenarios (`guns_fire`, `guns_broadside`, `fleet_wide`) use `fleet.stage()`
rather than `layout()`. They must render **identically** afterwards. Prove it: render each before
and after and compare. `tools/shot.mjs --shot=<id> --dpr=1 --w=1600 --h=900` (do not use
`--dpr=2 --w=1280 --h=720`; it has hung for three independent parties).

## How to prove it

A screenshot of a static scenario will not show any of this. Drive the **real game** headless over
CDP. There is a working harness at
`/private/tmp/claude-501/-Users-aaronair-cc/15d17c89-707f-4970-b598-403e046bb422/scratchpad/wl_probe2.mjs`
— copy it, do not edit it in place. It serves the project on its own port, boots `index.html`, clicks
Battle, and samples the camera every frame through a shot. Note that it sets
`Network.setCacheDisabled` and a fresh `--user-data-dir`; both are load-bearing (D28).

Deliver, as measurements and as images:

1. side 0 and side 1 world positions after `layout()`, showing your fleet around the bridge and the
   enemy at the standoff
2. the flagship's hull visible from inside the bridge through the window, and the bridge visibly
   part of a ship in the opening flyover — **read both PNGs back with the Read tool**
3. a sampled camera-y trace through `open_flyover` + `bridge_settle` with no sample above 20.4
4. a frame from `fire_out` at the muzzle flash with the firing ship filling a real part of the frame
5. before/after renders of the three gunnery scenarios, unchanged
6. draw calls in a live match before and after. The ceiling is 120 main; the last integration
   measured 167 main / 136 after Wave C's fix, and the salvo transient touches 125. A flagship hull
   at hero detail is 16–18 calls — if you spend them, say so and say what you took back.

## Budget

Two passes, then I review. A crash or an API error does not consume a pass. Write
`HANDOFF_P1.md` when you are done: what you changed, what you measured, what you could not fix and
why, and anything you found that belongs in `DECISIONS.md`.
