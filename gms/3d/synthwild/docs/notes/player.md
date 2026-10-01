# Lane 3 (PLAYER / CONTROLS / BRUSH) notes

Owner of `js/player/*` and `tools/player_*`. Status: **M1 done**, **wave 2 done** (2026-10-02): build power tools, aim assist, textured hand, climbing.

## Files
| file | what |
|---|---|
| `input.js` | `ctx.input`: the one action map. Keyboard/mouse, gamepad polling, auto driver hook, events |
| `touch.js` | Bedrock-style touch widgets (DOM in `#ui-root`, `.swp-*` CSS injected at boot) |
| `physics.js` | pure AABB vs fine-grid collision (node-testable): sweep, auto-step 0.5, crouch edge guard, unstick |
| `player.js` | `ctx.player`: movement, swim, fly, fixed 60 Hz physics + render interpolation, camera rig, avatar, hand |
| `camera.js` | first person + over-the-shoulder chase camera that never sits in blocks; FOV setting + sprint FOV kick |
| `avatar.js` | procedural suit (pearl shell, graphite bands, teal emissive seams, amber visor) + walk/swim/crouch anim; first-person arm holding the selected block |
| `brush.js` | `ctx.brush`: targeting, break/place, survival mining timing and cost, volume drag → preview → confirm |
| `brushmath.js` | pure snapping + cost maths (node-testable) |
| `brushview.js` | 3D outline (thick edge bars + faint faces), scale readout chip, volume confirm strip |
| `auto.js` | `?auto=1` soak driver |
| `edits.js` | pure: readBox, RLE, greedy box decomposition, writeBox, rotate/mirror, stampBox, undo history |
| `tools.js` | build power tools on the brush: undo/redo, copy → paste stamp with ghost preview, eyedropper; `ACTIONS` list |

## Controls (one action map)
Held actions: `jump crouch primary secondary sprint`; axes `input.move {x,y}` (y forward) and `input.look {dx,dy}` (radians this frame).
Edges: `input.pressed(a)`, `input.released(a)`. A tap shorter than a frame is latched so it still counts as one press.
Events: `input.on(type, fn)` → `hotbar {slot}` · `wheel` · `inventory` · `pause` · `toggleView` · `scale (+1|-1)` · `mode (+1|-1)` ·
`confirm` · `cancel` · `device ('touch'|'mouse'|'gamepad')`. They are also mirrored on the bus as `input:<type>`.
- **Touch**: floating left stick (push past the rim while forward = sprint), right-side drag = look, Break (hold, and drag
  to aim while holding), Place (tap; drag to aim), Jump (hold; double-tap in build = fly), Crouch toggle (left side above the stick),
  view toggle (eye). Pinch = scale (64 px per step). Two-finger parallel drag = volume. Left-handed setting mirrors everything.
  Wheel/inventory/pause buttons are drawn only when lane 5's HUD is absent (the HUD has its own).
- **Mouse/keyboard**: click locks the pointer; WASD/arrows, Space, Shift crouch, Ctrl or double-tap W sprint, 1–9, wheel or `[ ]` = scale,
  B = brush mode, LMB break, RMB place, hold + sweep = volume, Enter/Backspace confirm/cancel, E inventory, Q wheel, V/F5 view, Esc/P pause.
- **Gamepad** (standard mapping): L stick move, R stick look, A jump, B crouch, RT break, LT place, LB/RB hotbar, X wheel,
  Y inventory, d-pad up/down scale, d-pad left/right brush mode, Start pause, Back undo (LB+Back redo), R3 eyedropper, L3 sprint.
  While a volume or paste is pending (`input.modal`): A confirm/stamp, B cancel, X rotate, Y mirror. View toggle is on the wheel.
- **Build tools on keys**: Ctrl/Cmd+Z undo, Ctrl+Y or Ctrl+Shift+Z redo, Ctrl+C copy (with a volume up), Ctrl+V paste, R rotate,
  M mirror, middle click or G eyedropper.
- **Build tools on touch**: top-left ↶ ↷ buttons (build mode, dimmed when empty) and a 📋 paste button once something is copied;
  the volume strip has ⧉ Copy; the paste strip has Rotate / Mirror / ✓ Stamp / ✕; tapping Place while pasting stamps again;
  holding Place still on a block for 0.6 s is the eyedropper (the outline fills while it charges).
- Keys 1–9 and LB/RB call `inv.select()` themselves, then emit `hotbar {slot}` as a notification (don't select again on it).

## Player API (`ctx.player`)
`pos` (feet, THREE.Vector3), `rpos` (interpolated render pos), `vel`, `yaw`, `pitch`, `h`, `eyeH`, `onGround`, `inWater`, `headInWater`/`underwater`,
`flying`, `crouching`, `sprinting`, `speed`, `view`, `dead`, `ready`, `target` (brush target or mob), `eye()`, `aabb()`,
`spawn(x, z)` (waits for the chunk, stands on `surfaceY`), `teleport(x,y,z)`, `knock({x,y,z})`, `setView('first'|'third')`, `swing()`,
`serialize()` / `load(d)`. Listens: `player:death`, `player:respawn {pos}`, `player:knockback {vel}`.
Emits: `player:jump`, `player:land {fall}`, `player:step {mat, sprint}` (for footstep SFX), `player:cantPlace {reason}`.
Physics: 0.6×1.8 box (crouch 1.5), eye 1.62 (crouch 1.27), gravity 32, jump 9 (≈1.27 m), walk 4.3, sprint 5.8, swim 2.2, fly 10.5.
Auto-step 0.5 (so 0.25 and 0.5 ledges are walked), auto-jump for 1-unit steps when the setting is on, crouch never walks off
an edge, water and `waterlogged` (kelp) cells are swimmable with buoyancy and a climb-out boost, double-tap jump flies in build.

## Brush API (`ctx.brush`)
`scale` ∈ {0.25,0.5,1,2,4,8} (survival max 1), `mode` ∈ {fill,hollow,shell,replace}, `dims [W,H,D]` (build only),
`setScale(s)`, `stepScale(±1)`, `setMode(m)`, `setDims(w,h,d)`, `target` (world raycast hit), `mobTarget`, `placeTarget`/`breakTarget` (sub boxes),
`vol` (pending volume), `confirm()`, `cancel()`, `heldBlock()`. Emits `brush:change {scale,mode,dims}`.
- Aim is from the camera (third person too); reach is measured from the eye: 6 in survival, 12 + scale in build.
- **Place box**: flush against the hit face, scale-aligned on the two in-plane axes (dims centre in-plane, extend off the face).
  Plants are replaced in place. **Break box**: the scale-aligned box containing the hit sub (dims go into the surface).
- Outline: cyan = place, orange = break (fills as mining progresses), magenta = volume, red = clear, grey = blocked (inside you).
  `highContrast` switches to yellow/white.
- Survival: hold break mines with `game.breakTime(mat, held, scale)`; tap/hold place (repeat every 0.25 s); not inside the player or a mob
  (uses `mobs.list` + `mobs.box`). Mob in front of the block → `game.attack(mob, dir)`.
- Build: break on press; place on release, so a press-and-sweep (aim moves > 4°) turns into a **volume**; two-finger drag does the same
  on touch. Release → confirm strip (Fill / Hollow / Shell / Replace / Clear, ✓ ✕). `setBox` gets `{ wall: scale*4 }` (lane 1).
  Volumes are capped at 64 units per side.
- Held non-block items (food, tools) never place (lane 4 eats on a held secondary).

## Build power tools (wave 2)
- **Undo/redo**: every build-mode brush edit (place, break, volume, stamp) goes through `tools.edit()`, which snapshots the box
  first (`readBox`, RLE). Restore uses `world.writeBox` if lane 1 adds one, else a greedy decomposition into `setBox` fills with
  `{flow:false, support:false}`. Cap: 50 steps and 48 MB of RLE across undo+redo; boxes over 8M subs (≈ 50³ blocks) are applied but
  not recorded (`brush:notUndoable`). Survival never records. Real-world exact restore is tested in node.
  Known gap: water that *flows* outside the edited box after a break isn't part of the snapshot.
- **Copy/paste**: Copy reads the volume into `tools.clip {size, data}` and goes straight into paste mode. The preview is the magenta
  outline plus an instanced ghost of the stamp (sub resolution up to ~48k subs, cell resolution above, capped at 24k cubes).
  Placement: flush to the face, bottom at the hit level on side faces, centred, snapped to the brush scale grid. Air in the stamp
  leaves the world alone. Rotate = 90° about Y, Mirror = X flip. Stamps are undoable.
- **Eyedropper**: build puts the block in the held slot (`inv.setSlot(sel, mat, 64)`) or selects it if it's already on the hotbar;
  survival only selects a hotbar slot that already has it. Emits `brush:pick {mat, found}`.
- **`brush.actions`** → `[{id, label, icon, key, enabled}]` for undo, redo, copy, paste, rotate, mirror, pick; **`brush.run(id)`** runs one.
  Bus: `brush:undo|redo {minSub,maxSub}`, `brush:copy {size}`, `brush:notUndoable {size}`, `brush:pick`.

## Aim assist (touch, `aimAssist` setting, default on)
- Stickiness: a mob within 4.5 m and ~12° of the crosshair slows look to 55% and drifts the view gently onto it (player.js).
- Near misses: when the centre ray hits nothing, 8 rays in a small cone (1.4°, 2.6° on screens under 500 px) take the nearest hit,
  so a block edge is easy to grab on a phone. Mouse and gamepad are never assisted.

## Hand, climbing, kelp
- First-person hand: blocks use lane 2's atlas (`ctx.render.atlas`, sampler2DArray, per-face tile layers); tools, food and other
  items show lane 5's inventory icon (`ui/icons.js iconURL`) as a cut-out, a tool held diagonally like a pickaxe.
- Climbing: data vines, `climb_rail`, or any block with `climb: true` are ladders. Walk forward or hold jump to climb (2.8 m/s),
  crouch to hang, otherwise slide (2.2 m/s); off the ground forward turns into climbing, so a free-hanging vine isn't walked through.
  `player.climbing` is exposed; fall tracking resets while climbing.
- Kelp (waterlogged plants): 55% horizontal and 70% vertical swim speed.

## Survival cost of partial placements (lane 4)
One helper: `costUnits(box, mode, wall)` in `brushmath.js`, in **1/64-block units = 1 sub**. 0.25 = 1 unit, 0.5 = 8, 1 = 64, 2 = 512.
Lane 4's inventory already stores 64ths, so the brush calls `inv.canAfford(units/64)` then `inv.consume(changed/64)` (pays only for subs
actually written). `payUnits()` is a credit-ledger fallback for an integer-only inventory; `subsToBlocks()` is there for drop maths.

## Testing
- `node tools/player_test.mjs` — 44 checks: collision vs a fixed stub world (landing, tunnelling, flush walls, 0.25/0.5 staircase,
  1-unit ledge, auto-jump, crouch edge, unstick), snapping, cost fractions, lane 4 inventory 64 × 0.25 = 1 block, and lane 1's real
  World in node (lands on `surfaceY`, refuses own-feet block, hollow `wall` cost matches `setBox`).
- `tools/player_harness.html[?mode=build][&auto=1][&lh][&view=third]` — standalone page on the stub world (+ lane 4's game when it loads).
- `tools/player_cdp.mjs <url> <outdir> touch|build|desktop|auto` drives headless Chrome on port 9313 (`CDP_PORT`), 915×412 touch
  emulation via `Input.dispatchTouchEvent`, waits for `player.ready` and `input.enabled`. Verified on `?play=1` (real game):
  stick walk, look drag, place tap (consumed the item), hold-break with progress fill, jump, pinch scale, crouch toggle,
  two-finger volume → confirm hollow/fill, pinch to 8, double-tap fly, third person. Desktop: WASD, Space, 1–9, wheel. Fake gamepad: move, look, d-pad, RB.
- `node tools/player_sim_test.mjs` — 10 checks driving the real `player.js` headless (node THREE + stub world): jump height equal at
  60 Hz and 10 Hz frames, climbing up a free vine / crouch hang / slow slide / landing, kelp drag, aim assist pulls on touch only and
  only with the setting on.
- `player_test.mjs` now also covers readBox, RLE, greedy decomposition, undo/redo exactness, step/byte caps, rotate ×4 = identity,
  mirror, stamp placement, keepAir paste, and exact undo on lane 1's real World.
- `player_cdp.mjs … tools` (real game, build, touch at 915×412): place → ↶ undo → ↷ redo, two-finger volume → ⧉ Copy → paste ghost
  → Rotate → Place stamps (704 subs) → ✕, hold-Place eyedropper, hand screenshots with a block, a cutter and a food item.
- `player_cdp.mjs … gamepad` injects a fake `navigator.getGamepads` with `Page.addScriptToEvaluateOnNewDocument` (real game, survival):
  L stick walk, R stick look, A jump, RB/RB/LB hotbar, d-pad scale, RT hold-mining with progress then the break.
- `tools/player_stubworld.js` is a **test fixture** (fixed geometry: steps of 0.25/0.5/1/2, a 2-high ledge, a pool); runtime code never imports it.

## Open issues / later
- Undo doesn't capture water that flows outside the edited box; restoring a very large box costs one relight per greedy box.
- Stamps don't rotate block orientation (no oriented blocks exist yet).
- Volume replace mode is costed as the full box (build only, so no survival impact).
- Physics uses one sub-grid AABB; the third-person camera collision is a ray plus a small probe box (fine for M1).

## Requests to other lanes
### Wave 2
- **Lane 1**: (1) please add a **`climb_rail`** block (climbable, non-solid or thin, `climb: true`); the player already treats
  `climb: true`, `data_vine` and `climb_rail` as ladders. (2) Optional speed-up for undo/paste: `world.readBox(minSub, maxSub)` →
  dense Uint8Array (x-fastest, then z, then y) and `world.writeBox(minSub, maxSub, data, { keepAir })` with one relight; edits.js
  uses them automatically when present.
- **Lane 4**: your fall tracking should reset the peak while `ctx.player.climbing` is true (as it does for `flying`); otherwise a
  long vine slide lands with fall damage. Eyedropper in build calls `inv.setSlot(inv.sel, blockId, 64)`.
- **Lane 5**: wheel entries for the build tools: read `ctx.brush.actions` (`{id,label,icon,key,enabled}`: undo, redo, copy, paste,
  rotate, mirror, pick) and call `ctx.brush.run(id)`; grey out entries with `enabled:false`. Icons wanted: undo, redo, copy, paste,
  rotate, mirror, pick (eyedropper). The gamepad view toggle moved to your wheel's camera buttons (Back is undo now).
  `.swp-scale` now hides while `ctx.ui.blocking`. Toasts you may want: `brush:notUndoable` ("Too big to undo"), `brush:copy`
  ("Copied W×H×D — tap to stamp"), `brush:pick {found:false}` ("Not on your hotbar").

### M1
- **Lane 4**: fall damage is computed by both of us. The player skips its own `player:damage` for falls whenever `ctx.game.survival`
  exists, so yours is authoritative; `player:land {fall}` is available if you'd rather not track the peak yourself.
  `game.breakTime(mat, held, scale)` is used for mining (scale is passed as the third arg, as your signature has it).
- **Lane 5**: your HUD draws the crosshair, scale chip, bag and pause buttons; mine hide while `ctx.ui.hud` exists. The scale
  readout next to the crosshair (`.swp-scale`, tap = next scale) stays (the DESIGN "hologram readout on the tool"). Keep interactive
  HUD elements above `.swp-touch` (z-index 4), and keep the hotbar row within ~210..705 px at 915 wide (the right cluster uses the
  rightmost ~200 px; the crouch button sits above the stick on the left). `toggleView` → you set the `view` setting; the player follows
  the setting (it only toggles itself when there is no ui). Disable input (`input.enabled = false`) on title/loading, as you do.
- **Lane 2**: main.js calls `brush.update` after `player.update`; `player.update` also calls it, but it dedups per input frame, so either is fine.
  fx calls: `spark(pos /*[x,y,z]*/, hexColor, n)`, `hologram(minSub, maxSub, hexColor)`.
