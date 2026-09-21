# TINPOT — verification

Written 2026-09-22 from harness output, not from memory. Every number below was printed by a
command in this folder and every screenshot named is in `docs/evidence/`. Where something is
unproven it says so.

**Reproduce the whole lot:**

```sh
node tools/sim.mjs
~/.claude/bin/cdp stop 9223; ~/.claude/bin/cdp start --port 9223 -- --use-angle=metal
node tools/browser.mjs shell   # and m2 m3 m4 m5 m6 m7 m8 art
node tools/release.mjs
python3 tools/artgate.py docs/evidence/m1b-portrait.png
```

`--use-angle=metal` is not optional. The default `cdp` launcher hardcodes SwiftShader and this
game software-renders at roughly 9 fps in it — which makes every timing number meaningless and
some touch gates flaky. See `STATE.md`.

---

## M0 — shell that cannot silently fail

| Claim | Evidence |
|---|---|
| Boots at DPR 2 in portrait, no page scroll, no console errors | `browser-shell.json`, `m0-shell.png` |
| A broken module import produces a readable panel, not a silent hang | `m0-broken-import.png`. The `shell` suite intercepts `js/main.mjs` over CDP `Fetch`, replaces it with an import of a missing file, and asserts `window.__ready === false` and the retry button visible |

The watchdog is **falsified, not assumed**: the suite makes the failure happen and watches the
panel appear.

## M1 / M1.5 — the look

### The camera, measured rather than asserted

`tools/browser.mjs art` projects `(x, 0, z)` and `(x, height, z)` for every tree ≥3 m in frame
with the live camera and prints the screen-space separation:

```
pitchDegrees 16.000   fov 38   cameraHeight 78.54 m   cameraZ 22.52 m
worldOffsetPerMetre (tan pitch) 0.2867        16 deg implies 0.287
60 trees in frame
canopy vs its own trunk base:  median 23.13 css px · min 4.84 px · 96.7% up-screen
foreshortening gradient near-to-far: 8.88x    (1.0 would be orthographic)
```

Read that honestly:

* The **tilt was never wrong.** It measured 16.000° in the two earlier builds that were
  criticised for looking top-down. What was wrong was the 26° lens from 110 m, which is
  near-orthographic: every tree in frame was seen from the same angle and none showed a side.
* 96.7%, not 100%, because the camera sits at z = +22.5 and the two sampled trees beyond it
  project the other way. That is the perspective, and the suite allows ≥90% for that reason.
* Trees at the bottom of frame (under the camera) are still close to plan view. The 8.88×
  gradient is what makes near and far trees look different.

### The frame

`docs/evidence/m1b-portrait.png`, shot by `node tools/art.mjs` on the empty-map fixture.

```
python3 tools/artgate.py docs/evidence/m1b-portrait.png   →  exit 0
 hi_frac 0.0077 · lum_p05 0.1083 · lum_p50 0.3104 · lum_p95 0.6634
 lum_std 0.1615 · contrast_ratio 4.508 · hue_buckets 6 · warm_frac 0.1628
 diff_pct 99.01
 redrawn_vs_baseline>=50%   true
 contrast_ratio>=3.0        true
 dark_anchor lum_p05<=0.16  true
 lum_std>=0.16              true
 hue_buckets>=6             true
 warm_frac>=0.05            true
 midtone 0.28<=p50<=0.52    true
 PASS                       true
```

The gate is falsified: the same command against the frame it replaced,
`python3 tools/artgate.py docs/evidence/m1-portrait.png`, exits 1 and fails six of the seven
checks (`lum_p05 0.266`, `lum_std 0.139`, `contrast_ratio 2.36`, `hue_buckets 5`,
`lum_p50 0.588`, `diff_pct 0.0`). `tools/artgate.py` has not been edited.

Side by side at thumbnail size: `docs/evidence/m1-vs-m1b-thumbnails.png`. **Left is the old
frame, right is the new one.** They are not confusable.

### By eye

Present in the new frame and absent from the old one: a bent corridor that pinches and opens
into bays with islands of trees in it; four tree species (yellow-green broadleaf, dark blue-green
conifer, rusty low scrub, bare dead trunk) with a 14% oversized "emergent" tier; a treeline
interior dark enough to be the value anchor; a scrub/sapling band loosening out of it; a ground
palette blended from straw, mud, damp hollow, moss; a dirt track with wheel ruts, a gravel edge
and puddles that wanders into the trees; boulders, a fallen log, stumps, a broken cart, a stone
wall, four shell craters with upthrown clods and a crooked signpost; long raking dawn shadows;
haze, a warm/cool split-tone grade and a vignette applied in the engine rather than as a CSS
overlay.

Honest remaining weaknesses: the canopy is 6 hue buckets, exactly on the gate, and could stand
more separation; the soldier torso reads slightly boxy from above; trees directly under the
camera are still nearly plan view.

### Soldiers

`m4-squad.png`, `m4-hold.png`, `m9-mission-5-start.png`. Helmet, shoulders, chest, webbing,
pack, two boots that swing, a rifle held out in front; idle, running and firing silhouettes
differ. They lean 11° toward the camera inside their own group so the hat does not eclipse the
body (see `STATE.md` D15). Merged into four meshes each: a full squad plus enemies is part of a
355-draw-call frame, not 200 calls on its own.

## M2–M8 — the game

`node tools/sim.mjs` — pure core, no browser:

| Test | Result |
|---|---|
| walks the whole corridor without teleporting or entering a blocked cell | 30.00 m travelled, arrives at (0.5, −19.5) |
| negative control: an unmoving soldier fails the same arrival gate | throws, as required |
| deterministic fixed-step movement | two runs identical |
| autonomous duel, projectile damage and death | 6 shots, survivor on 83.75 HP |
| grenade destroys an impassable wall, a soldier walks the new route, friendly fire lands | 16 trees burned, thrower down to 56.2 HP |
| negative control: the unburned wall is impassable | route length 0 before the grenade |
| blocked direct route takes a real detour | 13 m for a 9 m straight line |
| last active death hands orders to a living soldier | passes |
| economy rejects locked, maxed and unaffordable purchases | passes |

`node tools/browser.mjs <suite>` with real CDP touch events, 390×844 at DPR 2:

| Suite | What it proves |
|---|---|
| `shell` | boot, no scroll, the broken-import watchdog |
| `m2` | a real tap makes him walk around trees and arrive |
| `m3` | automatic firefight, a death, a claret stain that persists |
| `m4` | four cards, hold toggle, the one-active minimum, formation move, pause; every `#hud` button ≥44×44 px and fully on screen |
| `m5` | per-card pips, a grenade lobbed by touch, fire spreading, burn scars, the rail setting the whole squad |
| `m6` | campaign victory, promotion, sandbags on the reused map, save and reload mid-mission |
| `m7` | earned credits, a purchase, roster assignment, briefing, deploy with the bought armour |
| `m8` | the title screen running a real AI-vs-AI battle (asserted by state changing between frames), audio unlocked and playing, volume slider, deploy |
| `art` | the camera measurements above, plus the `m1b-portrait.png` capture |

All green. Evidence JSON per suite in `docs/evidence/browser-*.json`.

## M9 — the slice

`node tools/release.mjs`, one continuous session driven by touch:

| Mission | Result | Kills | Losses | Seconds | Reward |
|---|---|---|---|---|---|
| 0 Beachhead | victory | 2 | 0 | 9 | 80 |
| 1 Dig In | victory | 7 | 0 | 36 | 110 |
| 2 Push North | victory | 6 | 0 | 9 | 140 |
| 3 A Slight Detour | victory | 16 | 1 | 37 | 160 |
| 4 Special Delivery | victory | 8 | 0 | 45 | 180 |
| 5 The Last Post | victory | 17 | 0 | 51 | 250 |

Three upgrades bought between missions (armour, extra slot, rifle). Campaign ends at mission 6.
22 screenshots written, `m9-*.png`. `assert.deepEqual(p.errors, [])` covers console errors,
uncaught exceptions, shader-compile warnings, failed requests and any HTTP ≥400 — **zero**. Every
request stays on `127.0.0.1:8888`; nothing external is fetched.

Layout re-checked at three phone widths (`m9-phone-320.png`, `-390`, `-430`): every HUD button
≥44×44 px and inside the viewport, `scrollWidth` equal to the viewport width, and every deployed
soldier projecting at least 10 px above the top of the unit cards.

### Performance — what it actually hits

```
Apple M5 · headless Chrome 153 · ANGLE Metal · 390x844 DPR 2 · CPU throttled 4x
scene: the live title battle, which is the heaviest thing in the game
    60.00 fps · median frame 16.7 ms · p95 16.8 ms
    355 draw calls · 276 017 triangles · 116 geometries
```

**Do not read that as "60 fps on a phone".** It is pinned to vsync, so 16.7 ms is the floor the
measurement can see and it says nothing about headroom. The profile is a fast desktop GPU with a
slow CPU; a mid-range phone is the opposite shape. What is genuinely established is that the CPU
side has 4× of margin at 60 fps and that the geometry budget is modest. **The game has never been
run on a phone, or played by a human.** That is the single biggest gap in this document.

## Still open

* No human has played it. Everything above is a machine agreeing with a machine.
* `docs/evidence/tinpot.jpg` is the store screenshot, staged but not copied to
  `/assets/screenshots/`. That copy and the `projects.js` entry are Aaron's, at ship time.

---

## V2 — the playtest pass (2026-09-22, fourth relay session)

All seven items ticked. Commands, all green on ANGLE Metal
(`~/.claude/bin/cdp start --port 9223 -- --use-angle=metal`):

```
node tools/sim.mjs
node tools/campaign.mjs
node tools/browser.mjs <shell|m2|m3|m4|m5|m6|m7|m8|art|v1|v3|v4|v6>
node tools/release.mjs
python3 tools/artgate.py docs/evidence/m1b-portrait.png      # exit 0, thresholds unedited
```

New gates and the evidence they produced:

| gate | what it proves | evidence |
|---|---|---|
| `sim.mjs` fire block | parked man dies at 4.5 s, man 7 m away untouched; intensity .644 → .204 → 0 with distance; burnt-out scar costs nothing; panic runs 8.25 m out and lives; AI holds off a burning treeline for 8.0 s then walks the gap | `docs/evidence/sim.json` |
| `sim.mjs` flamer block | clears a three-man wedge in 0.83 s, man behind on 100 HP, own mate to 0, owner burned by his own pool, tank cooks off | `sim.json` |
| `sim.mjs` enemy block | heavy takes 125 of 250 rifle damage and all of the fire; rusher closes 22 m while the heavy makes 6 | `sim.json` |
| `sim.mjs` emplacement block | sandbags stop a bullet, never a boot, never the man hugging them; a grenade opens a lane; a won mission leaves works + scars | `sim.json` |
| `browser.mjs v1` | men marched through fire catch light and lose >20 HP; the ground fire burns out and the cold scar is free | `v1-men-on-fire.png`, `v1-burning-meadow.png`, `v1-cold-scar.png` |
| `browser.mjs v3` | three rail buttons in the right order, one tap arms the squad, the cone leaves fire and kills | `v3-flame-cone.png`, `v3-aftermath.png` |
| `browser.mjs v4` | the three kinds differ in stats **and** in rendered extent (`tinpotTest.actorSizes()`) | `v4-lineup.png` |
| `browser.mjs v6` | a hit puts claret in the air; the telegram appears, is `pointer-events:none`, and stays above 42% of screen height | `v6-hit.png`, `v6-telegram.png` |
| `release.mjs` retry stage | a deliberate defeat at 320/390/430 offers a ≥44 px Retry, and one tap restores the buried man and clears the failed attempt from history | `v2-defeat-retry.png` |
| landscape | the rotate card shows in landscape, dismisses, and stays gone in portrait | `v7-rotate.png` |

Release campaign result (harness pilot, flamer carried from mission 4):
all six won, 0 men lost. Headless `tools/campaign.mjs` with rifles only loses 1 man on
*A Slight Detour*. Perf unchanged: 60.00 fps, p95 16.7 ms, 362 calls, 276 k triangles at
390x844 DPR 2 with a 4x CPU throttle.
