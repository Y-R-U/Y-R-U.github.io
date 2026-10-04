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

## Round 3 (2026-10-04)

### Card cameras: a three-quarter diorama with a sky band
- The new signature is `cardCam(look, yaw, elev, dist, fov, sky, build)` (in `western.js`).
  - The camera stands `dist` from `look`, at `yaw` (degrees from the west) and `elev`.
  - It then pitches so the top `sky`° of the frame sits above the horizon.
  - A high camera with a shallow pitch keeps the building whole under a sky band and the street foreground short.
- The open framings are all `[x≈−0.9…−1.5, 2, 2.5]`, yaw 24–26, elev 20, fov 38, sky 7. The `dist` values are:

  | plot | dist |
  |---|---|
  | shine | 22 |
  | dentist | 22 |
  | undertaker | 23 |
  | jail | 24 |
  | bank | 24 |
  | tubs | 25 |
  | garter | 25 |
  | livery | 27 |
  | saloon | 27 |
- `build` is the framing while the Mulligans build. For shine, tubs, livery, dentist and garter it is yaw 24, elev 10, sky 12 and dist 19–22.
  - The camera sits low enough that the frame, the worker on the beam and the gin pole stand against the sky.
  - It sits high enough that the south frontage's blade signs stay out of the bottom of the frame.
- The rig hook (cameras.js `createCardRig.load`) uses `plot.camera.build` while `construction.root` is visible. It is logged in CONTRACT.md.
- Card distance is authored. finishPlot sets `cardW` to 0.5, so `fit` never widens the shot.

### Gags and props
- **Saloon ejection (new, card only).** Every 8.5 s Mabel punches toward the doors and the bat-wings kick open.
  - The cowboy (folk 11) tumbles out on an arc, lands in the street at `[DOOR+1.7, 0, FZ+4.1]` and throws a 12-ball dust puff (a new `puff` particle pool, +1 draw only while live).
  - He lies sprawled, sits up dizzy and staggers off east while Mabel tips her hat.
  - It is gated by `out.inCard()`, a new helper in construction.js `throttle`: true for 0.7 s after the plot's own card camera drew it. The hero never sees it, so it never doubles lane S's hero ejection.
- **Existing gags, now framed.** Dentist chair recline + pliers, tubs steam + flying duck, livery mule kick, Garter window exit, undertaker coffins + vultures + Mortimer, jail singing drunks, bank NO GUNS + vault, shoeshine spit.
- **Vignettes.** Every plot has a `vignette(b, x, z)` (western.js) at its front-left corner: three barrels, two crates with bottles, a lying bottle, and a lantern hung on a post with an arm. It is static, so 0 draws, and it also dresses the hero foreground.
- **Signs.** Lane A now letters every board. The P icons that sat on the boards (boot, tub, tooth, hearts, badge, coffin, coins, bottle) moved beside or above them, so the text reads.
- **CROWD_K.** It is imported from kit/crowd.js; it was hard-coded at 1.22. Lane A raised it to 1.4, so hand-posed `tilt()` actors (Thrupp, the dentist patient, the Garter window man) and the crew's hammer hands stay in scale.
- **Lot-mesh fix.** finishPlot used to pick the first new mesh as the lot. Lane A's sign-text meshes broke that, and the Garter's unowned lot stayed visible over its build site. It now picks the unnamed lot mesh plus the `signs:<id>:lot` text.

### Build card (construction.js)
- While framing, the frame reads as two storeys: back posts and plates go up to the false-front height (stage 1 only, the new `until` field).
- A gin pole with a boom and a dangling plank stands beside the frame through stages 1–2.
- A brother stands on the front plate hammering against the sky (stage 1 past 45%, and all of stage 2).
- The foreman (crew 3) stands at the front right through stages 0–3, holding an open plan (a `PLAN` timber instance).
- The plank bonk with stars now comes every 4–7 s (it was 9–15 s).
- The mule cart is unchanged. None of this adds draws: all of it is instances in the existing timber mesh.

### Shots (real game, `tools/camshot.mjs` on CDP 9341; gitignored)
- `docs/art/shots/r3/sheet_cards_open_r3.jpg` holds the 9 open cards (tod 17.5), and `sheet_cards_build_r3.jpg` the `camshot build` run.
  - The camshot build run has no blank cards.
  - Most builds finish within camshot's 6 s per card, so most of these frames show finished shops.
- `sheet_build_frames_r3.jpg` shows the five built businesses mid-frame, taken with T slowed in a scratch harness.
- `saloon_ejection_burst_r3.jpg` shows the ejection at 0.5 s steps.
- `vs_refs_r3.jpg` is our saloon and build cards beside `a_clay_card_saloon` and `a_clay_build`.
- **Draws.** `renderer.info` max per card render, including the shadow pass and the town, is 44–84 with the cams on the lot. Before this change it was 44–72. The plot itself adds +1 (the saloon puff, only while live). The ≤30 target is not met in the real game; the town and shadow pass dominate.
- **Compared with the refs, gained:**
  - Whole silhouettes with ground and sky.
  - Uncropped people at readable size.
  - One gag per card in frame.
  - Lettered signs.
  - Prop clusters and a lantern on a post.
  - The build card's worker on the beam and the gin pole against the sky.
- **Compared with the refs, still behind:**
  - (1) The sky band is a pale empty desert, because cards hide `town:far` (the mesas). Forced on, the mesas fill it like the ref for +1 draw. Request to A is in CONTRACT.md.
  - (2) Flat afternoon light: no warm rim, no glowing open interior (lane A).
  - (3) The ref's buildings are much bigger than its people. Ours read small next to A's 1.4× crowd, so the frames look like toy sheds.
  - (4) The build card's crew and mule cart stand in front of the frame and hide its lower half. The ref stages the crew in the foreground with the frame clear behind.
  - (5) Pomfrey's south blade signs and a covered wagon still poke into the lower edge of some cards.

## Round 4 (2026-10-04)

### Saloon (the reference card)
- **Deep porch:** it runs to `PZ1 = 3.9` on stout posts. The porch roof is raised (`H1` is now 3.9, `H2` 6.8, `FH` 7.9) and the balcony is shallow (to `BALZ = FZ + 1.75`).
- **Glowing interior card:** the open doorway is 3.3 × 2.75 m. Through it you see a painted bar: a warm back wall, a mirror, two shelves of bottles, two hanging lamps, the counter and three drinkers in silhouette. It is part of the static mesh, so 0 draws. It uses the new glow slots `inGlow`, `inDeep`, `mirror` and `inLamp`.
- **Lanterns:** three hang on porch posts facing the street, and two flank the doorway.
- **Barrel/crate pyramid:** it sits at the right front of the porch (3-2-1 barrels plus crates and bottles). The queue (now 3 people) stands behind it. Pickles slumps in front of it, and Mabel stands left of the doors.
- **Paddy wagon:** moved from the doors to the street east of the card (`WAGON = [9.8, 8.8]`). The `wagon` anchor follows it.
- **Ejection:** the cowboy lands face-down in open dirt straight out from the steps (`[DOOR − 0.4, 0, PZ1 + 2.5]`). The flight is slower and lower, so he stays under the porch roof, and the 18-clod dirt puff is smaller. `doorsOut` moved to the step foot.
- **Camera:** `cardCam([-0.3, 3.0, 2.8], 22, 11, 22, 40)`, which is lower and closer so it sees under the porch roof.
- **Hub loafers:** they are crowd-scale 1.08 (they were 1.36, giants) and their paths stay off the ejection lane.

### Construction (construction.js), in chunky readable stages
- **Stage 0, survey + deck:** stakes and string (stage 0 only), then piers, sills, joists and deck boards laid front to back. The deck top is at 0.43 m and runs out to `zf + 1.5` as a porch. Instances now also grow inside stage 0.
- **Stage 1, frame:**
  - posts 0.3 thick and plates 0.28;
  - X-braces in both front end bays and on both side walls;
  - roof joists and an upper-storey front (posts and a head plate) against the sky;
  - a chunky ladder leaning from the deck onto the top plate.
- **Removed:** the thin scaffold, the gin pole with its floating plank, and the white plan table.
- **Stage 2, walls:** thick planks clad the walls bottom-up from the deck, then the roof deck goes on.
- **Stage 3:** the false front is hinged on the deck. The arched/peak parapet is three stepped boards (it was a giant disc).
- **Yard:**
  - the lumber stack front-left with a chunky theodolite beside it;
  - the toolbox and nail kegs at the deck edge;
  - the sawhorse front-right;
  - the mule cart parked right of the frame facing the street. It no longer bolts.
- **Crew jobs:**
  - A hammers on the deck, climbs the ladder (stage 1, 30–40%), then hammers on the top plate.
  - B surveys, then saws at the sawhorse. He is the bonk victim.
  - C carries a plank on his shoulder from the stack.
  - The foreman reads the blueprint front-right.
- **Site cleared:** while a plot is being built and not owned, its own walkers and regulars (crowd meshes) are hidden.
- **One build camera:** `finishPlot` derives every buildable plot's `camera.build` from its site with the exported `BC` constants (yaw 22, elev 18, fov 42, dist = max(17, (w + 4.2) × 1.8)). The per-plot `build` args are now only a flag.

### Foreground framing (all cards)
- `fgProp(b, cam, f)` (western.js) places a near prop in a bottom corner of a card camera. The kinds are `saguaro`, `post` (rails run out of frame, with a WANTED bill), `pole` and `barrels`.
- `finishPlot` builds them as one extra mesh per state (`spec.fg`, by default a saguaro plus a post with the side chosen by id hash; the build state gets `FG_BUILD`).
- They are drawn only by the plot's own card camera in the matching state. `onBeforeRender` zero-scales the mesh for every other camera, and the mesh has `frustumCulled = false` and casts no shadow. Cost: +1 draw, card only. The hero never sees them.

### Checks (CDP 9341, real game)
- test-boot PASS, test-cards PASS, and test-scroll PASS. On desktop: p95 rAF 4.1 ms, 215 max draws, card 37.
- Shots in `docs/art/shots/r4/` (gitignored):
  - `p_vs_refs_r4.jpg` (saloon and build cards beside the refs);
  - `p_cards_open_r4.jpg`;
  - `p_build_mid_r4.jpg`;
  - `p_build_stages_r4.jpg`;
  - `p_saloon_ejection_r4.jpg`.
- **Open issue:** lane S's hero saloon vignette (`vignettes.js`, a 1.7× Mabel plus a thrown drunk with a white puff) also renders in the saloon card. It sits in front of the doors and doubles P's card ejection. S should skip its actors for `camera.userData.iw2Line === 'saloon'`, or ask P to drop the card gag.

## Round 5 (2026-10-04)

### Build card (construction.js, critic r4 fix 6)
- **Camera:** `buildCam(site)` replaces the cardCam build framing. It is low and wide: yaw 14, pitch 8, fov 46, height 0.34 × D, and D = clamp((w + 3) × 1.2, 9.2, 10.8). The horizon sits about a third of the way down, and the site is centred and fills the width.
  - D is capped so the camera stays in the street (plot-local z < ~12.5). Behind that line, Pomfrey's side signs (`town:signs`, which are never culled) and awnings block the view.
  - The card rig reads its lens from `plot.camera.fov`, so `finishPlot` turns that into a getter that returns the build fov while the site is up. **Cameras.js owner:** `load()` should use `auth.fov`. Then the getter can go.
- **Backdrop (card only, inside the build `fg` mesh, 0 draws):** a water tower behind the lot to the left and a tin-roofed shed behind it to the right.
- **Yard, pulled in toward the deck so the crew isn't giant in the foreground:**
  - the lumber stack is front-left;
  - the theodolite and a crate of shingles sit by the left deck corner;
  - the sawhorse is centre-right;
  - the toolbox and three kegs are by the mule on the right;
  - foreground stones.
- **Crew:** `CREW_SCALE` is 0.96. The roles are swapped so the tall grump (mulligan3) hammers on the top joists.
  - B (mulligan2) stands on the deck edge behind the sawhorse, facing the camera, and saws. The saw is a `timbers` instance: it strokes while he works and is left on the plank when he is bonked.
  - When B is bonked, he sits in front of the sawhorse under stars.
  - C carries planks from the lumber stack to the sawhorse.
  - The foreman reads the blueprint front-right.
- `FG_BUILD` is now a smaller ribbed cactus at the left corner plus a post at the right.

### Saloon card ejection (fix 4)
- The thrown cowboy is drawn at 1.45× (`place` `s`) with a smaller hat (0.62). He lands on the card's centre line (`LAND = [DOOR − 1.1, 0, PZ1 + 1.9]`).
- His flight is a low arc that stays under the porch roof and then drops, with hang time in the middle.
- **Squash/stretch** is done by post-multiplying the instance matrix (`squash()`): he stretches through the flight, then pancakes on landing with a damped wobble.
- **Dust:** the puff pool is 40. There is a 6-puff spray at the doors and a 30-puff ring burst on landing.

### Foreground and porches (fix 8)
- `ribbed(b, x, y, z, r, h)` (western.js) is a dark core with ellipsoid ribs, a domed crown and spine dots.
- The fgProp `saguaro` is now a ribbed trunk with two sphere-swept elbow arms. They are raised into the visible part of the frame.
- `porch()` now adds `clutter()` clusters beside each post, or at the porch ends when there is no awning. Each cluster is one of 8 knee-high items: bucket, sacks, crate + bottles, spittoon, broom, firewood, jug + basin, stool.
  - The clusters keep clear of the step.
  - Opt out with `clutter: false`, or pass `clutterSkip: [x…]` to keep a spot clear.
  - They are static, so they cost 0 draws.

### Checks (CDP 9341, real game)
- test-boot PASS, test-cards PASS, test-scroll PASS (163 max draws, p95 3.8 ms). Plot draws are unchanged: everything new is static, an instance, or in an existing pool.
- Shots in `docs/art/shots/r5/` (gitignored): `p_build_vs_ref_r5.jpg` (r4 → r5 → ref), `p_build_stages_r5.jpg`, `p_saloon_vs_ref_r5.jpg`, `p_cards_open_a_r5.jpg`, `p_cards_open_b_r5.jpg`.
- **Open:** the open-state cards (other than the saloon) still show a lot of sky and sand above the roofs. That is the next framing pass.
