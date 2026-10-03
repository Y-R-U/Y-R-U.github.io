# Idle Western 2: business plots (lane P)

Owner: lane P. The files are `js/render/plots/*`. Each business has one file. The shared helpers are in `western.js`, and the Mulligan Brothers' building site is in `construction.js`.

## Coordinates
- Every position below is **plot-local**. To get world space, convert with `plot.group.localToWorld(new THREE.Vector3(...a))`, or apply `plot.group.matrixWorld`.
- Plots sit on the north side of the street and face +z.
- The lot spans `x ∈ ±LOT_W/2`, using the widths from `data/plots.js` (shine 12, tubs 13, livery 16, saloon 16, dentist 12, garter 14, undertaker 13, jail 13, bank 14).
- Facades stand at z ≈ 0.2–0.7. Porches/boardwalks run to z ≈ 2.4–3.0. The street starts at z = 5.
- People use the crowd at scale 1.08 (about 1.65 m). Hats are lane A's **in-rig** hats: `hatted(crowd, kinds, colours, sizes)` (western.js) only sets `crowd.look(i, {hat, hatScale, hatColor})` (extras cycle `EXTRA_HATS`, scale capped at 0.8×), and named characters use `crowd.dress(i, name)` (fingers, pickles, mabel, lulu, pete, thrupp, mortimer, wendell, nubbin, wife, longjohns, mulligan1–3). No plot hat meshes remain except garter's flying `lostHat`.

## What every plot returns (on top of the kit contract)
- `plot.anchors` is an object of named plot-local `[x, y, z]` points.
  - These always include `site`, `yard` and `sign` from the construction kit.
  - Each plot adds its own (table below).
- `plot.tapTargets` holds the kit's `pile` target plus any plot targets.
  - A `{ id: 'site' }` target is pushed **only while `stats.building`** is set (W7: a tap on it means `build:hurry`), and removed when the build is done.
- `plot.construction` is the stage kit (`root`, `site`, `crew`, `stakes`).

## Construction (`construction.js`, W10/W13)
- `createConstruction(kit, P, site)` takes `site = { x, fz, w, d, h, fh, parapet, ext, yard, stake, stakes }`. It builds everything at boot:
  - The yard: stakes and string, a theodolite aimed at the wrong building, a lumber pile, the mule cart and a plan table.
  - One InstancedMesh holding every timber and plank, each with its own stage, reveal time and colour.
  - A raw false front hinged at its foot, and a blank sign.
  - An extension scaffold, 3 identical Mulligans plus the manager, instanced hammers synced to the `work` clip's arm, bonk stars and a dust pool.
- It is driven by `stats.building = { stage, t, T, p01, acq }`:
  - **0 survey:** one brother stakes the corners, one squints through the theodolite, one walks the string.
  - **1 frame:** posts grow, then plates, studs, braces, rafters, the scaffold and the ladder. One brother carries planks and now and then swings one into a brother, who sits seeing stars.
  - **2 walls:** planks clad the walls bottom-up with door and window gaps, then the roof boards go on.
  - **3 false front:** the front lies flat on the street and swings up on two ropes hauled from the roof, with a settle wobble, a THUMP and dust. The brother reading the plan under it dives clear and sees stars.
  - **4 sign:** the sign is hoisted crooked on a rope, a brother on the roof whacks it level, and the manager runs out and cheers.
- A stage change is a visibility swap plus a 0.4 s squash pop. Progress inside a stage is per frame. No geometry is created at runtime.
- **Hurry taps** are detected from jumps in `building.t`. Each one sends a splinter puff and the crew hammers 2.2× for 0.6 s, so no wiring is needed.
- **Extension bustle:** when `visualTier` rises (Lv25/Lv100), a scaffold and the crew hammer at `site.ext` for 4.5 s with dust. plotbase already pops the tier mesh.
- **Acquisition types:**
  - `acq: 'rebrand'` (gen 2) shows the finished shell and plays only the sign stage.
  - `poker`, `takeover` and `bought` (saloon, undertaker, jail, bank) hide the site. Their `P.lot` is **Pomfrey's version of the same building** (purple board, gold trim), shown until the purchase completes, after which the static mesh pops in your colours (W3).
- **Empty lots** for built businesses show a FOR SALE stake (cream board, brass coin) when `stats.districtOpen`, and otherwise a RESERVED · POMFREY stake (purple board, gold crest).

## Per-plot notes and anchors
| Plot | Silhouette / tiers | Stock pile | Gag (wordless, 40 px) | Anchors / tap targets |
|---|---|---|---|---|
| shine | Mustard shack with an arched front and a giant wooden boot on the roof. L25: second throne plus a striped awning. L100: teal display storey and a gilded boot | Coin heap at the tip jar | Nubbin spits (droplet arc) and buffs, and the boot flashes a star glint | `throne`, `boot`, `tipJar`, `roofBoot` |
| tubs | Sage bathhouse with a gabled front, a deck of tubs, a boiler and a line of red long johns. L25: third tub behind a rose screen. L100: water tower piping to the deck | Barrels of murky bathwater | Bathers in tubs; one leaps up every 7.5 s and his rubber duck flies; steam | `tub1`, `tub2`, `duck`, `laundry`, `barrels` |
| livery | Barn-red gambrel barn with a hayloft, pulley and corral horses. L25: lean-to stalls with horse heads. L100: gilded horseshoe and a horse weather vane | Manure heap with orbiting flies | The mule bucks and double-kicks the barn wall every 6 s, a plank flies off; the smith sparks the anvil | `mule`, `kickWall`, `anvil`, `hayloft`, `manure` |
| saloon | Barn-red two-storey with a stepped front and a spindle balcony; teal card-room annex at L25; hotel storey, gold sign frame and water tank at L100 | Rotgut crates with bottles | Bat-wing doors (2 instanced leaves, `plot.kickDoors()`); Fingers at the piano, lid flapping, notes rising; drunk slumped on barrels; barkeep in a tiny bowler | **tapTarget `piano`** `{pos, r: 1.05, box:{min,max}}`; `plot.piano(k)` speeds Fingers up, flaps the lid and sends notes (call on every piano tap). Anchors: `doors`, `doorsOut` (fling start), `porch`, `piano`, `pianist`, `trough` (lane A's trough at −5.2, 4.4), `balcony`, `upstairs`, `street` |
| dentist | Narrow teal two-storey with a peak front, a giant tooth and a barber pole. L25: shaving chair plus apothecary lean-to. L100: gilded tooth and a second pole | Glass jar of teeth (gold ones above 40%) | The chair reclines **way** too far, Pete yanks with giant pliers, a tooth flies out with stars | `chair`, `chairLanding` (fling target "dentist's chair"), `pole`, `jar`, `bench` |
| garter | Dusty-rose two-storey with an arched front, boas on the balcony rail and pink lanterns. L25: lantern gazebo. L100: onion-dome cupola with a heart vane | Heap of abandoned hats | Can-can leg kicking behind the lit window; **window exit** (below) | `window`, `windowSill`, `hayCart`, `door`, `balcony`, `lanterns` |
| undertaker | Plum parlour with a stepped front and three vultures (heads bob, instanced). L25: little Boot Hill of crosses. L100: bell tower with a gilded coffin vane | Coffins standing like dominoes; they topple in a wave every 20 s, then spring back | Mortimer (stovepipe) measures passers-by with his tape; upright coffins at the door | `door`, `coffins`, `vultures`, `hearse`, `dominoes`, `mortimer` |
| jail | Adobe office with vigas plus an open barred stone cell block. L25: jail wagon. L100: lookout tower with a bell | Bail sacks | Three drunks sway arm-in-arm and sing (notes); Wendell rocks nervously (huge hat); badge weather vane spins | `cell`, `cellDoor`, `jailWagon` (fling target), `sheriff`, `door`, `vane` |
| bank | Brick bank with cream columns, a barred teller window and a round vault door swinging in the annex. L25: gold bars plus a porch safe. L100: clock pediment and gilded dome | Money bags | Thrupp polishes the vault, then faints flat on his back with stars every 16 s; NO GUNS sign (pistol in a slashed ring, 7 bullet holes) | `vault`, `door`, `noGuns`, `teller`, `thrupp`, `robberyExit` |

### Garter window exit (W4), agreed split with lane S
- Lane P animates it in the plot's own tick, so it runs with no spectacle wiring. It loops every 24 s, plays on the card as well as in the hero, and stays within the actor budget (it uses the plot's own crowd).
- Timeline:
  - 0–1.2 s: the shutter bangs open.
  - 1.2–2.6 s: he climbs onto the sill.
  - 2.6–3.6 s: he drops; the hat lags and lands after him.
  - 3.6–4.6 s: he hits the hay cart legs-up in a hay burst.
  - 4.6–6.8 s: he scrambles off down the street.
  - The wife, in a bonnet and with a rolling pin, marches in from the west from 2.4 to 5.6 s and storms in at the door.
- If S wants to schedule it, for example as a director beat:
  - Call `plot.windowExitAuto(false)` once.
  - Then call `plot.windowExit()` to play one run from the start.
  - Use the anchors `window`, `windowSill` and `hayCart`.

### Saloon ejection (lane S)
- Lane P provides the doors and the landing points; S owns the fling actor.
- Start at `doors`, or at `doorsOut` (bottom of the porch step).
- Call `plot.kickDoors()` when Mabel throws someone, so the bat-wings fly open.
- The landing table targets are:
  - trough: saloon `trough`
  - dentist's chair: dentist `chairLanding`
  - jail wagon: jail `jailWagon` (L25+)
  - hay cart: garter `hayCart`
- Pomfrey's window is the town lane's.

## Budgets — round 1 (superseded, see Round 2)
- **Total card draw calls, including town/terrain/ambient:**
  - shine 28, tubs 28, livery 27, saloon 27, garter 26, undertaker 29, jail 27, bank 24, dentist 32.
  - During a build, shine reaches 28–30 at the sign stage.
- **What a plot itself uses:**
  - The static tier mesh: 1 draw plus 1 shadow.
  - Contacts: 1.
  - One crowd: 2 draws (body plus blob).
  - One hat mesh: 1.
  - Piles: 1 plus 1 shadow.
  - Dynamics: 1–3, with no shadow casting except the big ones.
  - Particle pools: 1 each, invisible when owned is false; `step()` skips idle pools.
- The construction meshes are invisible (0 draws) unless building.
- Geometry is never made after boot. The only exception is plotbase's own tier merge on a tier change.

## Shots (round 1)
- Run `tools/artshot.mjs` on CDP 9341 for each plot; output goes to `docs/art/shots/p_<plot>_*.png` (gitignored).
- Build stages are injected through artlab's `js=` hook (see the lane P notes in MANAGER_STATE when merged).
- Honest comparison with `refs/a_clay_card_saloon.jpg`:
  - **Ahead:** silhouettes, paint variety (red, teal, mustard, sage, rose, plum, adobe, brick) and each card reading its gag.
  - **Behind:** the ref has richer clutter and warm window glow, shows the crowd at ground level, and its faces read. Our elevated card camera makes the big hats dominate the people, and faces are not legible at 40 px.

## Round 2 (2026-10-04)

### Card cameras (ROUND2 row P, refs/a_clay_card_saloon.jpg)
- `cardCam(look, yaw, elev, dist, fov)` (western.js) is now a **facade camera**: it faces the frontage from the street at 24–28° elevation (yaw 12–14° from the west, fov 40–44), aimed at the joke. `dist` is the final portrait distance: the card rig multiplies portrait cameras by 1.15 and widens to `bounds.w`, so `cardCam` pre-divides and `finishPlot` sets `cardW` to 0.5 whenever `camera.facade` is set (the framing is authored, not fitted). Landscape cards come out ~13% closer.
- Elevation can't go much below ~24°: `keepInWorld` (cameras.js) steepens any frame whose top ray misses the ground, so cards show backyard dirt above the roofline, never sky. With A's new sky dome, S could allow sky in cards (request below).
- Cameras sit in the street (local z ≈ 11–14), in front of the south frontages; A's `prepare(line)` already hides the far town and everything outside ±40 m.

### Saloon (the reference card)
- Fingers' piano moved out from under the balcony shadow line to the porch left of the doors (`PIANO = [BX−1.85, 0.35, FZ+1.2]`), turned so the keys face west: the card sees Fingers (CLIP.piano, speeds up with `plot.piano(k)`) in profile at a white keyboard, with a lantern overhead, the lit window behind, and a sleeping hound. The tap target box covers the turned piano (r 1.2).
- Mabel (bouncer, tiny bowler) stands by the doors; Pickles slumps on the barrels; Lulu waves from the balcony with a cowboy sipping; the queue runs along the porch.
- Clutter: posters, spittoon, broom, rotgut crates, a hay cart (`haycart`), the sheriff's paddy wagon parked in the street (`wagon`), tufts, horse in the foreground.
- Windows everywhere (`win()`): the glass now glows warm amber by day (`glass` g 0.3; the old night-only slot is `glassN`) and carries **interior silhouettes** (drinkers, hats, raised glasses; hashed per window, `sil: n` or `sil: false`). Zero extra draws (static mesh).

### Construction card (W13)
- The buildable plots (shine, tubs, livery, dentist, garter) aim their camera between the site and their gag, so a build fills the frame: the timber frame centre-left, crew in front, and the **mule cart (own mesh, +1 draw only while building) parked front-left**, facing up the street. It bolts clear while the false front swings down (stage 3) and comes back for the sign. Lumber stacks lie beside the site turned toward the street (`placed()` builder view in western.js); a sawhorse, nail kegs and offcuts fill the foreground. Wheels now stand the right way.
- The Mulligans are `dress`ed mulligan1–3 (cap/derby/stetson, beards, overalls) with in-rig hats; the manager wears a bowler. The hammer hand follows each brother's own scale.
- Card cameras are fixed per plot (cameras.js caches `plot.camera` at first fit), so one framing serves both states. A per-state build camera needs the S hook below.

### Anchors S asked for (`plot.anchors`, plot-local)
| plot | added |
|---|---|
| saloon | `haycart`/`hayCart` (the hay cart east of the porch), `wagon` (paddy wagon in the street, fling ↓), `center`; `pianist` follows the turned piano |
| hub | `mud` (the mud wallow in front of the saloon steps; the hub's well moved west to clear the wagon), `center` |
| garter | `haycart`, `doors`, `center` (`window`, `windowSill`, `hayCart` as before) |
| dentist | `doors`, `center` (`chair` already existed; the chair moved out from under the awning to `[2.5, 1.85]`) |
| undertaker | `doors`, `center` |
| jail | `wagon` (= `jailWagon`, L25+), `doors`, `center` |
| bank | `doors`, `center` |

### Perf
- **P#7, construction shaders pre-warmed.** The construction root is visible until the first plot update, so the boot warm-up (`host.warm`, which runs before any `world.update`) links its instanced shadow-depth program. Measured in the real game (fresh save, first build): programs 25 → 25 during the build. Falsified: with the root hidden at boot, 24 → 25. A warm after a renderer re-create (context loss or tier change) still misses it; the fix is `world.warmup` calling `plot.warm?.(true)` (request to A/M).
- **P#4, fewer plot draws.** The per-plot hat InstancedMeshes are gone (in-rig hats): −1 draw per plot, plus garter's bonnet, undertaker's pipe and the crew hats. Idle particle pools no longer draw: `particles()` reports `visible` only while it is wanted and has a live particle; hand-posed pools set `.manual = true`. Each plot's statics were already one merged tier mesh.
- **P#6, off-focus throttle.** `finishPlot` wraps `update`. A plot runs every frame only while it is in focus, meaning drawn by its own card camera, or drawn by a camera whose ground look-point is on or next to the lot. Otherwise it ticks at 16 Hz with the accumulated dt. Focus is sniffed with `onBeforeRender` on the plot's meshes, so `world.update` needs no change. `?plotHz=60` turns it off.
- **A/B, artlab** (412×520, tod 17.5, no post, draws include the shadow pass; vertex invocations from a WebGL wrap). Base is HEAD's plots/ with today's kit:

  | view | round 1 | round 2 |
  |---|---|---|
  | hero (saloon) | 118 draws / 1.93 M v | **104 / 1.96 M** |
  | saloon card | 22 / 370 k | 21 / 422 k (+2 balcony people, clutter, wagon, hay cart) |
  | shine card | 23 / 302 k | 20 / 262 k |
  | tubs card | 23 / 301 k | 21 / 288 k |
  | livery card | 28 / 300 k | 25 / 294 k |
  | dentist card | 27 / 313 k | 25 / 305 k |
  | garter card | 26 / 365 k | 22 / 358 k |
  | undertaker card | 24 / 299 k | 21 / 267 k |
  | jail card | 22 / 270 k | 21 / 267 k |
  | bank card | 23 / 278 k | 21 / 276 k |
- Tests on CDP 9341: test-boot PASS; test-scroll PASS (phone rAF p95 6.0 ms, hero 111 / card 25 draws max; desktop 2.9 ms). An earlier run at load average 14 read 8.5 ms (contention). test-spectacle PASS.

### Shots and sheets (gitignored)
- `docs/art/shots/r2/`: `cards_r2.png` (all 9 cards, 412×520), `build_r2.png` (shine stages 0/1/2/3/4 plus tubs, livery, dentist and garter mid-frame), and per-card `<plot>.png` and `b_<plot>.png`. Regenerate with the scratch harness: artlab card view, `frames=300`, and a `js=` hook that wraps `p.update` to inject `stats.building`.
- Side-by-side sheets: `docs/art/critic/p_{saloon,garter,dentist,jail}_card_r2p.png` against `a_clay_card_saloon.jpg`, and `p_b_shine_r2p.png`, `p_b_tubs_r2p.png` and `p_b_shine_3_r2p.png` against `a_clay_build.jpg`. The answer key is `KEY_r2p.md`.
- **Compared with the refs:**
  - **Fixed since round 1:** the facades now face the camera. The porch life reads: doors, Fingers at a visible piano, Mabel, the queue, Lulu on the balcony and silhouettes in amber windows. Hats are varied and no longer bury the faces. The build card shows the frame, crew and mule cart instead of empty dirt.
  - **Still behind the ref:**
    - No sky or mesas in cards. The top 10–20% is backyard dirt (camera rule).
    - The ref's open, glowing saloon interior full of people is only suggested by window silhouettes.
    - The saloon's balcony band still takes about 30% of the frame.
    - A town bulb-string wire crosses the saloon and garter cards.
    - Passers-by walking the street edge come out big and hat-heavy in the foreground.
    - The build card's site is a one-storey skeleton under backyard dirt, against the ref's two-storey frame on a sky. Its crew reads smaller than the ref's chibi trio, and the brother carrying planks gets cut at the right edge.
    - The lite rig drops some named props (Pete's pliers accessory, Mortimer's tails, the rolling pin), so the separate pliers and pin meshes still carry those gags.
