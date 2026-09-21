# TINPOT — living state

> Update this **as you work**, not at the end. You may be cut off mid-sentence by a usage limit.
> The next agent inherits this file and the ticked boxes in `PLAN.md`, and nothing else.

## Now

**Milestone:** V1 slice shipped; the **V2 playtest pass (V1–V7) is complete**. Every box in
`PLAN.md` is ticked except the `projects.js` entry, which is deliberately Aaron's.

**Nobody has played this with their thumbs yet.** Every gate here is still a harness gate. The
next useful thing remains a human holding a phone — and there is now a lot more to feel.

Green as of this session, on ANGLE Metal:
`node tools/sim.mjs` · `node tools/campaign.mjs` · `node tools/browser.mjs`
(`shell m2 m3 m4 m5 m6 m7 m8 art v1 v3 v4 v6`) · `node tools/release.mjs` ·
`python3 tools/artgate.py docs/evidence/m1b-portrait.png` (exit 0, unedited).

## V2 playtest pass — in progress (2026-09-22, fourth relay session)

Working `PLAN.md`'s **V2 — the playtest pass**, V1→V7 in order. Nothing above that section is
being touched.

### V1 — fire damage: core done, sim green, browser not yet reshot

`js/core/forestSim.mjs` is now the fire *field*, not just the spread automaton:

* `fireIntensityAt(w,x,z)` → 0..1.35, read off a cached `w.burning` list plus `w.fires`
  (ground fires). Falls off linearly with distance and with `min(1, burn/3)`, so a fresh blaze
  is full strength and the last three seconds taper. A burnt-out tree scores 0 — charred ground
  is safe, which is the whole point of burning a route open.
* `FIRE = {dps:27, selfDps:10, linger:2.8, panic:.14}`. Standing in a fierce cell is ~35 dps;
  crossing a 2 m band at a run costs ~20 HP. A man who catches light keeps burning for ~2.8 s
  after he leaves, runs 1.6x faster while alight, and **sets fire to trees he runs past**.
* `damage()` gained a `cause`. Armour (V4) does not apply to `cause==='fire'` — the heavy is
  meant to be answered with a grenade or a flame, not a rifle.
* `escapeRoute()` + panic: a unit in fire re-paths to the nearest cool walkable cell. Panic is
  suppressed when his current path already leads somewhere cool, or he oscillates on the spot.
* `rebuildFireMask(w)` builds a per-cell danger mask one cell fatter than the damage field.
  `grid.route(from,x,z,danger)` treats it as wall. **The AI routes with it and has no fallback**
  (`ai.mjs` `safeRoute`, `u.ai='waits'`); **the player's orders fall back to the plain route**,
  so marching your own men into a firestorm stays possible and stays your fault.
* Trees gained `charred`. Without it a trunk that outlives its own burn is relit by the ground
  fire it just made and the wood never stops burning. Found by a sim test that hung on it.

Sim evidence (`node tools/sim.mjs`, all green):

```
fire kills the man standing in it and spares the man beside him   parked 0 HP at 4.53 s, beside 100 HP
intensity ramps with distance; burnt-out scar is safe             close .644  far .204  outside 0
a man in fire panics out rather than standing in it politely      72.7 HP, ran 8.25 m
burning treeline is a wall the AI waits behind                    held off 8.0 s, then advanced
the player can march men into a firestorm                         crossed a 9-tree blaze for 23 HP
```

Every one of those has a negative control beside it in `tools/sim.mjs`.

### V2 — instant retry: done

A losing debrief now leads with **"Again. Nobody saw →"** and keeps "Send in the replacements"
as the secondary. `markDeployment(c)` snapshots roster, slots, credits, upgrades, maps and the
mission index at every deploy; `rewind(c)` restores all of them together and pops the failed
attempt off `history`. Rolling them back *together* matters — restoring only the roster would
let you farm brass off your own casualties.

`tools/release.mjs` now loses a mission on purpose at 320/390/430 (`tinpotTest.smite()`),
asserts the retry button exists and is a ≥44 px on-screen target, taps it, and checks the dead
man is alive again and `history` is empty. Negative controls: he is alive before, and the loss
really does bury him. Evidence: `docs/evidence/v2-defeat-retry.png`.

**One real bug fell out of this.** `platform/audio.mjs` created a fresh `Audio` per cue and set
`src=''` on fade-out. Tapping Retry a second after losing cancels the in-flight `defeat.mp3`
fetch → `net::ERR_ABORTED`, which the release gate counts as a console/network error. Audio
elements are now pooled one per track and never have their src cleared.

### V3 — flamethrower: done

`WEAPONS.flamer` — range 6.4 m, `cone` 0.46 rad half-angle, 0.4 s cadence, 8.5 damage a lick.
No projectile and no accuracy roll: `spray()` in `combat.mjs` hits *everything* in the wedge
including your own men, sets them alight, drops a `groundFire` at 72% of range and ignites the
trees around it. `tank:{radius:5.4,damage:150}` cooks off when its owner dies — pushed through
the existing grenade path, which now reads `g.radius`/`g.damage`.

Unlocks with `mission>=3 && upgrades.slots>=2`, so it is live from *A Slight Detour*. Sim:
clears a three-man wedge in 0.83 s, leaves the man standing behind him on 100 HP, takes his own
mate to 0, and burns its owner when the player marches him into his own pool.

**The layout cost of the third weapon, which is the part that nearly broke the release gate:**
three 44 px pips do not fit across a 73 px card. `.weapon-pips` now wraps globally with
`.pip{flex:1 0 44px}` — 3 rows at 320, 2 rows at 390/430 — the card body is compressed under
`max-width:370px`, and `hud.mjs` sets a `kit3` class that lifts the weapon rail and the order
hint clear of the taller cards. Without that the lowest rail button sat on top of the leftmost
card's pips and ate the tap. Measured clear at all three widths; release re-run green with a
flamer carried through missions 4–6.

### V4 — three kinds of enemy: done

`data/soldiers.mjs` is now a stat block per type and `units.applyKind(u,kind)` applies it;
`data/missions.mjs` carries a `mix` per mission and per wave, cycled by `pickKind(mix,i)`.

| | hp | speed | armour | weapon |
|---|---|---|---|---|
| grunt  |  65 | 2.5  | 0    | rifle (12 m) |
| heavy  | 170 | 1.5  | 0.46 | rifle, +34% damage |
| rusher |  34 | 5.4  | 0    | bayonet (2.4 m) |

Armour is skipped for `cause==='fire'` and `'flame'`, so a heavy is roughly 315 effective HP
against rifles and 170 against a grenade or the flamer — that is the whole point of him.
`ai.mjs` gives each kind its own sight and hold distance, and **the rusher does not brake**: at
under 7 m he commits to a point 1.9 m *past* you (`ai:'lunge'`) and sorts it out afterwards.

Visually: `KIND` in `actors.mjs` — the heavy is 1.32x wide with a riveted iron chest slab and a
dark red helmet, the rusher 0.83x with a bright amber helmet and a 24° forward lean, and their
leg cadences differ (3.4 / 5.0 / 6.4 per metre) so one plods and one scurries. Measured off the
real meshes by `tinpotTest.actorSizes()` in `tools/browser.mjs v4`, not asserted off the stats.

**Balance, and the mistake worth recording.** My first mix roughly doubled the effective enemy
HP of every mission and `tools/release.mjs` lost *A Slight Detour* outright. Two separate
causes, found by building a 2-second headless loop instead of re-running the 5-minute browser
gate:
1. The mix itself. Mission 4 went from 520 effective HP to 1860.
2. **The flamer.** Handing one of four men a 6.4 m weapon costs a quarter of the squad's
   firepower at rifle range, and in the browser the ravine caught: 146 trees burnt and 51
   ground fires in 37 s. `spray()` was igniting a 3 m circle at 55% every 0.4 s and ground
   fires were re-igniting at 16% a tick. Both are now much lower (`pool*.8` at 28%, and 9%),
   the flamer reaches 7.4 m, and the heavy came down to 170/0.46.

Final: all six missions win on both loadouts with the naive harness pilot, mission 4 being the
pinch (1 man lost with rifles only). `tools/campaign.mjs` and `tools/release.mjs` both green.

### V5 — the emplacement: done

`fortify(w)` in `core/world.mjs` builds nine sandbag works plus a mortar pit, laid out relative
to `centre(-1, map)` so they sit in the corridor however it bends (D18). They are **low cover**:
never in the pathing grid, so boots walk over them, but `lineClear` stops a bullet that crosses
one — *unless* either end of the shot is within `HUG` (1.6 m) of that bag. So the side holding
the bags fires out and cannot be fired at, which is the entire reason to hold ground.

`blastTrees` flattens them, `props.mjs` now draws them from `w.works` rather than hard-coded
coordinates (so what you can see is exactly what stops a bullet, and a flattened bag vanishes),
and `snapshotWorld` carries them through a save. `ai.mjs` gained one behaviour to go with them:
a red with no line of sight and bags within 7 m goes and hugs the bags instead of standing in
the open. Territory was already persisted by `finishMission`; the sim now asserts it, with a
negative control that nothing is dug in on the first visit and that trees you did not burn are
still trees.

### V6 — juice: done

* `platform/haptics.mjs` — 11 ms on a kill, 46 ms on a grenade, 26/40/70 on a flamer cooking
  off, and a triple stutter when one of your own catches light. Feature-checked, try/catch'd,
  rate-limited to one buzz per 60 ms so a firefight is not a doorbell, and muted with the SFX
  slider.
* **Flinch.** `damage()` stamps `u.hurt`; `actors.mjs` gives him 0.2 s of being knocked off his
  axis, arms up. A new `hit` event (non-fire, ≥3 damage) throws jam in the air proportional to
  the damage and stains the grass on a big one.
* **The telegram.** A named man dying puts a small gold-edged card under the mission banner for
  2.8 s: his name, his kills, and one of eight lines ("He owed the mess three shillings."). It
  lives in the top edge strip, is `pointer-events:none`, and is asserted by `browser.mjs v6` to
  sit above 42% of screen height so it never covers the battlefield.

### V7 — landscape: done (the friendly card)

`@media(orientation:landscape)` puts up a full-screen "Turn me round." card with a tipping
helmet. Pure CSS, so it works even if the module never boots. A `Carry on sideways anyway`
button sets `html.rotate-ok` for anyone on a laptop who cannot rotate anything. Evidence:
`docs/evidence/v7-rotate.png`. The corridor is 26 m across by 55 m along by design; making the
camera fill a landscape window would show the map edge, so this is the honest answer rather
than the lazy one.

## Last done

- 2026-09-22 (managing Opus 5 session, verifying V2 before push): the `v6` juice gate was
  **flaky — 1 failure in 3 runs** on "somebody must actually get hit". Its hit-wait loop gave the
  squad only 12x60 ticks to close the distance and land a shot. Raised to 60 iterations; 5 of 5
  green after. Still bounded and still a real assertion, so the gate is not weakened.
  Also note for future sessions: `tools/browser.mjs` takes the suite as a **positional** argument
  (`node tools/browser.mjs v1`). Passing `--suite v1` silently runs only the generic boot
  scenario and prints PASS — a false green that fooled this session once.

### 2026-09-22 — Opus 5 relay session (third agent): M1.5 art pass finished, M9 closed

**Inherited situation.** The agent before me did a large unrecorded slice of M1.5 between 01:54
and 01:57 (`terrain.mjs`, `scene.mjs`, `forest.mjs`, `landscape.mjs`, `props.mjs`, new
`tools/art.mjs`) and was cut off before writing any of it down. The `m9-*.png` evidence predates
that work. **Never judge this build by an old screenshot — reshoot with `node tools/art.mjs`.**

**The camera. This is the one that had failed twice, and the diagnosis was wrong both times.**
The pitch was never the problem: it measured exactly 16.000° and `tan(pitch) = 0.2867` against
the 0.287 the brief implies, in both earlier builds. What made the frame read as a plan view was
the **lens**: a 26° FOV from 110 m up is near-orthographic, so every tree in frame was seen from
the identical angle and none of them showed a side. The tilt is unchanged at 16°; the lens is now
38° and the camera sits at 78.5 m. Measured on the live camera by `tinpotTest.tilt()`:

```
pitchDegrees 16.000   fov 38   cameraHeight 78.54 m   cameraZ 22.52 m
worldOffsetPerMetre (tan pitch) 0.2867      (16 deg implies 0.287)
60 trees >=3 m in frame · canopy-vs-own-trunk-base screen separation:
    median 23.13 css px, min 4.84 px, 96.7% displaced up-screen
foreshortening gradient near-to-far: 8.88x   (1.0 would be orthographic)
```

Two honest caveats on those numbers, both asserted in `tools/browser.mjs art`:
* **96.7%, not 100%.** The camera sits at z = +22.5, so the two sampled trees that are *beyond*
  it project the other way. That flip is the perspective working, not a bug.
* Trees directly under the camera (bottom of frame) are still close to plan view; the ones at
  the top of frame are seen from ~35° and show a lot of side. That 8.88× spread is exactly the
  "a tree at the top and a tree at the bottom foreshorten differently" the critique asked for.

**Bugs found by looking at pixels rather than at pass counts** (each one confirmed by isolating
it, not by guessing):

1. **The white grass slivers were a normal-flip.** A blade is a vertical sliver; seen from above
   roughly half of them are back-facing, and three's `DOUBLE_SIDED` branch in
   `normal_fragment_begin` multiplies the shading normal by `-1` for those. The old grass was
   `MeshBasicMaterial` so it was unlit and glowed everywhere including in deep shade; my first
   lit version went *black* on the back-facing half. Fixed by forcing `normal = vNormal` after
   the chunk. Grass is now Lambert, shadow-receiving, corridor-only, off the track, thinned by
   the same noise mask that colours the ground, and tinted toward `0xaebe72` from whatever the
   ground under it is — so it is always a *lighter* version of its own ground.
2. **The grade was crushing red and blue to literally zero.** The contrast step was a per-channel
   linear ramp about a 0.25 pivot; every channel below 0.048 clipped. Sampled pixels in the lower
   half of the frame were `(0, 82, 0)` — pure green, no red, no blue. That is where the acid
   green and the "flat black ellipses" came from: the ellipses were ordinary lit props whose
   colour had been clipped away. The contrast is now applied to **luminance only** with a
   monotonic S-curve (`P=0.25, K=1.40`) and the chroma ratio is preserved.
3. **`metalness` with no environment map renders black.** The puddles were `metalness: 0.65`,
   which in a scene with no IBL is a black disc. They are dielectric with `roughness 0.09` now
   and get their wet look from the sun's specular.
4. **The HUD rebuilt its whole `innerHTML` every frame during a firefight** (HP and the clock
   both move, and the signature was the whole model). That silently ate taps: a touchstart landed
   on a button, the DOM was replaced before the touchend, and Chrome then had nothing to fire
   `click` on. The m5 weapon-rail gate caught it. Structure is now rebuilt only when the
   *structure* changes; the moving numbers are written into cached nodes.
5. **Hard-coded enemy spawns landed inside the treeline** once the corridor bent properly, and a
   unit standing in a blocked cell can never route out of one. Three enemies sat in the trees for
   the whole of mission 4 and the "clear" objective could not be met. Deployments are now snapped
   to a walkable cell and the enemy line is laid out relative to `centre(z, map)`.
6. **The enemy AI would stop to fire with no line of sight.** Blue on one side of a boulder, red
   on the other, five metres apart, neither able to shoot, for the remaining eighty seconds of
   the mission. `updateAI` now requires `lineClear` before it stops; no shot, no stopping.

**The art pass itself** — camera lens, a real in-engine grade (haze, warm/cool split tone,
luminance S-curve, vignette) replacing the CSS overlay the title screen used to fake it with,
four tree species with a 14% "emergent" size tier, a blended ground palette with straw/mud/damp/
moss, a separate track ribbon mesh so the ruts stay crisp and the edge feathers, scrub + saplings
at the treeline, craters with real bowls and upthrown clods, a warm ground pool under burning
trees, boot dust, and soldiers with bodies.

**Soldiers.** Rebuilt in `render/actors.mjs` as four merged meshes (body, helmet, each leg,
arms+rifle) so a full squad is ~30 draw calls instead of ~200. Shoulders, chest, webbing, pack,
boots that swing, a rifle held out in front, three readable silhouettes (idle compact with the
rifle down, running with legs fore and aft and a forward lean, firing with a braced stance and
recoil driven off `u.cooldown`). The helmet was deliberately shrunk to 0.63 m across: at 16° a
Cannon-Fodder-sized tin hat eclipses the entire man.

**Final art gate** (`python3 tools/artgate.py docs/evidence/m1b-portrait.png`, exit 0):

```json
{"file":"docs/evidence/m1b-portrait.png","w":780,"h":1688,
 "hi_frac":0.0077,"lum_p05":0.1083,"lum_p50":0.3104,"lum_p95":0.6634,
 "lum_std":0.1615,"contrast_ratio":4.508,"hue_buckets":6,"warm_frac":0.1628,
 "sampled":188092,"diff_pct":99.01,
 "gates":{"redrawn_vs_baseline>=50%":true,"contrast_ratio>=3.0":true,
          "dark_anchor lum_p05<=0.16":true,"lum_std>=0.16":true,
          "hue_buckets>=6":true,"warm_frac>=0.05":true,
          "midtone 0.28<=p50<=0.52":true},
 "PASS":true}
```

`tools/artgate.py` was not edited. Thumbnails side by side in
`docs/evidence/m1-vs-m1b-thumbnails.png` — **left is the old `m1-portrait.png`, right is the new
`m1b-portrait.png`**, and they are trivially distinguishable at 150 px wide.

**M9.** `node tools/release.mjs` plays all six missions with real touch input, buys three
upgrades between them, checks every HUD control at 320/390/430 px wide for 44 px targets and for
soldiers not hiding behind the cards, and asserts zero console/network/shader errors and no
external requests. Green.

### Earlier sessions

- M8: live AI-vs-AI title, procedural insignia, supplied context music with crossfades, synthesised SFX and persistent music/SFX sliders. No soundtrack files changed.
- M7: infantry armour/rifle tiers, progress-gated extra weapon slot, working roster assignment, funny skippable briefings. Test storage uses `tinpot.test.campaign`, separate from player saves.
- M6 browser miss was stale frame state after test reset/advance. Harness allows reset to paint and reads returned simulation snapshots.
- M5: grenade arcs/fuses/friendly fire, falling canopy and stumps, wind-biased fire, live grid rebuild, instanced fire/smoke/embers/scars.
- M4: four cards, per-card pips and squad rail, edge banner/counters/pause.
- M3: auto targeting, line-of-sight, flight/cadence, patrol/advance AI, helmet pop, persistent jam. Feel gate: readable and silly; first duel forgiving, not tense yet (83.75 HP survivor).
- M2: fixed-step pure simulation, blocked-cell grid and flow routes, tap-to-move; deterministic replay, negative arrival control.
- M1: local bloom composer, instanced canopy, moving grass, winding track.
- M0: boot at DPR 2, no scroll, no console errors; blocked import shows a readable reload panel.
- 2026-09-22 — first Opus 5 session: folder tree, ten music tracks from SKYHAMMER into
  `audio/music/` with `tracks.json`, `BRIEF.md`, `ARCHITECTURE.md`, `PLAN.md`, `AGENTS.md`.

## Measured performance — read the profile, not the number

```
Apple M5, headless Chrome 153 with ANGLE Metal, 390x844 at DPR 2,
CPU throttled 4x, real-time live title battle (the heaviest scene in the game):
    60.00 fps · median frame 16.7 ms · p95 16.8 ms
    355 draw calls · 276 017 triangles · 116 geometries
```

That is **pinned to vsync**, not headroom — the p95 of 16.8 ms means the frame never overran, but
it does not tell you how much slack there is, because the measurement cannot see below 16.7 ms.
It is an M5 desktop GPU with a 4× CPU throttle, which models a slow *CPU* and a fast *GPU*; a
real mid-range phone has the opposite shape. **Nobody has run this on a phone.** Treat "60 fps on
a phone" as unproven; what is proven is that the CPU side has 4× of margin and the geometry
budget (276 k triangles, 355 calls) is modest.

### The harness GPU trap — this cost an hour

`~/.claude/bin/cdp start` hardcodes `--use-angle=swiftshader`, so the default headless Chrome
here **software-renders** and this game runs at roughly 9 fps in it. That is not a perf problem
in the game; it is the launcher. Two consequences:

* Any fps number taken without overriding it is meaningless.
* Tests that wait a fixed number of milliseconds for `window.tinpot` to refresh (it is written
  once per `requestAnimationFrame`) become flaky, because a "frame" is 110 ms.

Start it like this instead, and keep the launch and the harness run in one shell execution:

```sh
~/.claude/bin/cdp stop 9223; ~/.claude/bin/cdp start --port 9223 -- --use-angle=metal
node tools/release.mjs
```

## Next

0. **What the V2 pass left undone, honestly:**
   * Difficulty. The harness pilot now wins all six missions losing **one** man in total (on
     *A Slight Detour*, rifles only). That pilot plays better than a thumb does, but if Aaron
     finds it soft the levers are `heavy.damageBonus`, the `mix`/`count` in `data/missions.mjs`,
     and the red damage multiplier `.65` in `combat.mjs`. `tools/campaign.mjs` re-tests in two
     seconds.
   * Nobody actively seeks cover except a blocked red near sandbags. Blue never takes cover on
     its own; the player has to put them there.
   * The flamer is only exercised by the harness on missions 4–6 with one carrier. A squad of
     four flamers has never been played.
   * Grenade and flamer ids diverge by *id only* across a save/reload (`eventId` is not in the
     snapshot). Positions, lives and propagation are identical; asserted above.

1. **Put it in front of a human with a phone.** Every gate in this repo is mechanical.
2. Aaron's `projects.js` entry, and copy `docs/evidence/tinpot.jpg` to
   `/assets/screenshots/tinpot.jpg`. Both are deliberately not an agent's job.
3. Optional polish that was considered and not done: true screen-space heat shimmer over burning
   trees (the warm ground pool covers most of the win for none of the cost); a taper on the
   soldier torso, which from above still reads slightly boxy; more hue separation in the canopy
   (`hue_buckets` is 6, exactly on the gate).

## Known broken / open questions

- **Nothing is known broken.** `node tools/sim.mjs`, `node tools/browser.mjs <shell|m2..m8|art>`
  and `node tools/release.mjs` are all green as of this session, on ANGLE Metal.
- The `art` suite's `minPx` assertion filters to trees ≥3 m tall. Bushes are 1–3 m and legitimately
  project only 4–5 px, which is not evidence about the camera.
- `tinpotTest.advance(n)` runs sim steps synchronously while the rAF loop is *also* stepping, so
  a test that mixes `advance()` with wall-clock `sleep()` is mildly non-deterministic. It has not
  caused a failure since the HUD fix, but it is the first thing to suspect in a flaky gate.
- The corridor is wider and bendier than it was, which changed where hard-coded test coordinates
  land. `tools/browser.mjs m5` now lobs at `(-7, 12)` instead of `(8, 12)`, because `(8, 12)` is
  open meadow on the new clearing map. No assertion was weakened to make anything pass.

## Decisions log

Append one line per decision that a later agent would otherwise re-litigate.

- **D1** Three.js 0.180.0, shared vendored copy at `gms/lib/three/0.180.0/`, never a CDN.
- **D2** Soldiers are procedural Three.js meshes with procedural animation, not rigged GLBs. At
  this camera height the helmet is 12 px across; a rig is cost with no visible return, and the
  repo's rigged PolyPerfect characters are aimed at a far closer camera.
- **D3** `js/core/*` is pure and Node-importable. Balance is tuned in `tools/sim.mjs`, not in the
  browser.
- **D4** Permadeath with a named roster is in from M6. It is the heart of the genre, not a
  hardcore mode.
- **D5** Maps are territory reused across missions; mission N's destruction and fortifications
  persist into mission N+1 on the same map.
- **D6** Warm ochre sunlight against cool teal forest shade; winding meadow has a dirt footpath and clustered broadleaf canopy. All landscape assets are procedural.
- **D7** First duel teaches automatic shooting gently. Formation separation, grenades and later waves provide risk. Pips have real 44 px hit areas; narrow phones may stack pips vertically rather than shrink targets.
- **D8** Grenadiers auto-throw at enemies; with grenade selected, tapping ground designates one volley there. Switch to rifle to issue a march.
- **D9** Six missions across Bramble Common and The Unnecessary Cut. Inspector Biscuit wears gold and follows nearby soldiers. Save schema 1 preserves active combat, RNG state, deaths, promotions, burn scars and fortifications.
- **D10** Grenades unlock after mission 2, and Extra pockets equips the second rail slot. Only infantry is in this slice, so armour applies to that class.
- **D11** Browser touch-release unlocks audio. Title stays silent until interaction. Attract mode is a separate real simulation and never writes campaign progress.
- **D12** Southern deployment moved to z=10 so all four soldiers sit above even stacked 320 px weapon cards. A Slight Detour gets two timed reinforcements.
- **D13** Escort follows within 1.3 m, avoiding a stable 2 m gap behind the formation tail. Save snapshots include the fire automaton substep clock and destination marker.
- **D14** **The camera keeps the brief's 16° tilt and gets a 38° lens.** The tilt was never what
  made the frame read top-down — a narrow lens from 110 m was. Do not "fix" the camera by
  increasing the pitch; measure it with `tinpotTest.tilt()` first.
- **D15** **Soldiers lean 11° toward the camera inside their own group** (`lean` group in
  `actors.mjs`, between position and yaw). It is a character trick, not a camera one, and it
  nearly doubles how far up-screen the helmet sits from the boots. Without it the tin hat covers
  the whole man and you are back to dragging counters. The helmet is 0.63 m across for the same
  reason.
- **D16** **The grade lives in one shader pass in `scene.mjs`, and its contrast step is applied
  to luminance, never per channel.** A per-channel curve clips red and blue to zero in the
  shadows and turns the frame flat green. The title screen's `.title-vignette` CSS overlay stays,
  but it is now decoration on top of a real grade rather than the only grade in the game.
- **D17** **Grass is lit (`MeshLambertMaterial`), with the `DOUBLE_SIDED` normal flip undone in
  `onBeforeCompile`.** Unlit grass glows in shadow; lit grass with the default double-sided
  normal goes black on half the blades. Both have shipped in this project and both looked awful.
- **D18** **Nothing spawns at a hard-coded `x`.** Deployments snap to a walkable cell
  (`snapTo` in `world.mjs`) and enemy lines are laid out relative to `centre(z, map)`. A unit in
  a blocked cell can never path out of one, and `route` is deliberately left strict about that so
  the bug stays visible instead of being papered over with a teleport.
- **D20** **Fire is a field, not a flag.** `fireIntensityAt(w,x,z)` is the single source of
  truth for "how much is this point burning", read by damage, by panic and by the route mask.
  Anything new that burns adds to `w.burning` or `w.fires`; nothing gets its own damage rule.
- **D21** **The AI has no fallback through fire; the player does.** `ai.mjs safeRoute` returns
  an empty path and the unit waits (`u.ai='waits'`). `orderMove` falls back to the plain route.
  Marching your own men into a firestorm must stay possible and must stay the player's idea.
- **D22** **A tree burns once (`t.charred`).** Otherwise the ground fire a tree leaves behind
  relights the tree, and the wood never stops burning. A sim test hung on exactly this.
- **D23** **Armour is skipped for `cause==='fire'` and `'flame'`.** That is the heavy's whole
  design: rifles are the wrong answer, a grenade or a flame is the right one.
- **D24** **A man who is alight ignores new orders until he stops burning** (`u.panicking`).
  Without it, a player (or a harness) tapping once a second drives burning men back into the
  fire they are running out of.
- **D25** **Sandbags are LOW cover: never in the pathing grid, always in `lineClear`, and
  transparent to anyone within `HUG` = 1.6 m.** Blocking the cells would wall the corridor off;
  blocking shots without the hug rule would make the bags useless to their owner.
- **D26** **Retry rolls the whole deployment back together** — roster, slots, credits,
  upgrades, maps and the mission index. Restoring only the roster would let you farm brass off
  your own casualties.
- **D27** **Audio elements are pooled one per track and never have `src` cleared.** Clearing it
  aborts an in-flight media fetch, which the release gate counts as an error and instant retry
  triggers every time.
- **D28** **Landscape gets a card, not a camera.** The corridor is 26 m x 55 m by design; a
  landscape camera shows the map edge and the empty world past it.
- **D19** **Perf must be measured with `-- --use-angle=metal`.** The default `cdp` launcher is
  SwiftShader; see the performance section above.
