# UI NOTES

Owner: **UI agent**. Files owned: `js/ui/**`, `css/ui.css`, `tools/lab/ui.html`, this file.
Nothing else is touched. `js/data/**` is **read**, never written.

## Status

| Thing | State |
|---|---|
| `js/ui/hitrects.js` — the input fence | done, frozen shape |
| `js/ui/hud.js` — in-flight canvas HUD | done |
| Title / attract (live AI dogfight) | done, attract art is a placeholder — see D-U6 |
| Mission brief | done |
| Hangar / shop / loadout editor | done |
| Results / debrief | done |
| Pause | done |
| Settings | done |
| Level select (acts, stars, locks) | done |
| Mode select | done |
| `js/ui/units.js` — currency / speed / altitude / distance | **new, stint 2** |
| Altitude ribbon on the HUD | **new, stint 2** |
| Track list + per-track switches in Settings | **new, stint 2** |
| `tools/lab/ui.html` — isolated preview + audit | done |
| Wiring into `js/main.js` | **manager's call** — see "What main.js must do" |

## What main.js must do (the only integration surface)

```js
import { createUI } from './ui/ui.js';
import { drawHud, resetHud } from './ui/hud.js';
import { hitTest } from './ui/hitrects.js';   // core/input.js already owns this call

const ui = await createUI({
  root: document.getElementById('ui'),        // a plain <div id="ui"> over the canvases
  save, audio,                                // core/save.js, core/audio.js
  start(levelId, mode) { ... },               // begin flying; call ui.close() first
  resume() { ... },                           // un-pause
  quit()   { ... },                           // abandon the run
});
ui.go('title');
```

- `createUI` is **async** (it dynamic-imports `js/data/**`, including tables that do not exist yet).
- `ui.close()` drops the menu, clears the hit-rects and resets the HUD. Call it when flying starts.
- `ui.go('pause', { levelId, mode, stats:{ t, kills, money } })` on pause.
- `ui.go('results', { levelId, mode, result:{ win, time, kills, ground, accuracy, money, stars } })`
  on level end. **Results records the level and banks the money itself** unless you pass
  `record:false` / `moneyAlreadyBanked:true`. Manager decides which side owns that — see D-U4.
- Per frame, last: `drawHud(hudCtx, world, { w, h, dpr })`. Pass `dpr` only if you want the HUD to
  own the transform; omit it if you already scaled the context.

## Contracts I depend on, and what I do when they are missing

Everything is read defensively, because three agents are writing these files concurrently.

| I read | If absent |
|---|---|
| `save.data.{money,planes,planeId,upgrades,weapons,loadout,levels,settings}` | created on first read; a flat `save` without `.data` also works |
| `world.player.slots[i] = { id, ammo, cd, cdMax }` | falls back to `save.loadout` + `WEAPONS[id].ammo`, cooldown 0 |
| `world.player.{fuel,fuelMax}` | fuel bar shows full |
| `world.player.landed` | TAKE OFF button never appears |
| `ent.objective === true` | no off-screen chevron, no gold minimap ticks |
| `world.mission.objectives[i].{have\|progress, count\|seconds, done}` | objective line hidden |
| `data/modes.js`, `story.js`, `economy.js`, `acts.js` | menu falls back to a built-in five-mode list; no story beats |

**The sim only has to add `objective: true` to the ents that count and `have` to each objective
row** for the chevron, the gold minimap ticks and the progress line to light up.

## Decisions / deviations

### D-U1 — `createUI()` is the router, and it is async
CONTRACTS §11 lists a `ctx` with `go()` but never says who builds it. `js/ui/ui.js` does, and
`main.js` gets `ctx` back. It is async because `data/modes.js` did not exist when this was
written; the loader tolerates every table being absent.

### D-U2 — upgrades are stored **per plane**
`save.data.upgrades[planeId][upgradeId] = level`. Aircraft Evolution does the same, and a global
upgrade pool makes the plane carousel meaningless. A legacy flat `{ armor: 3 }` object is still
read (as "applies to the current plane") so nothing breaks if ENGINE ships that shape first.
**If the manager wants upgrades global, say so — it is a one-line change in `model.js`.**

### D-U3 — `UPGRADES[].step(level)` is read as the **cumulative** bonus at that level
`data/planes.js` has `step:(v)=>v*14` for armour, which only makes sense as a total, not a
per-step delta. Displayed value = `plane.hp + step(level)`. Price = `base * ECON.upgradeCurve^level`.
If DESIGN meant otherwise, only `model.js: upgradeStat/upgradePrice` change.

### D-U4 — the results screen banks the money and records the star by default
It is the only screen that knows the outcome, so it does it rather than duplicating the logic in
`main.js`. Pass `record:false` (and/or `moneyAlreadyBanked:true`) to make it purely a display.
The lab always passes `record:false`.

### D-U5 — the hangar has **no tab bar**; the armoury is an overlay
A 44 px tab strip plus five 44 px upgrade rows plus the topbar and the loadout bar does not fit in
390 px without something scrolling or something dropping below the 44 px touch floor. Upgrades are
therefore always visible, and **+ ARMOURY** (in the stores strip, next to the hardpoints) opens a
full-panel armoury over the same screen. Buying and equipping still both live in the hangar, as
briefed — buying a weapon drops it straight onto a hardpoint.

### D-U6 — the attract background is mine only until the renderer lands
`js/ui/attract.js` paints its own canvas: dawn sky per ART.md §4, three parallax cloud bands, a
sun, two mountain ridges, an earth band, and six AI aircraft dogfighting in **two lanes** (high
sky, low over the ridge) so the logo and PLAY are never behind a plane. When `gfx/renderer.js`
can run a player-less world, swap `startAttract()` for it — `title.js` touches it in exactly two
places. Keep the lanes idea: a dogfight through the middle of the logo is unreadable.

### D-U7 — a slot is cleared by tapping the already-selected slot
The first draft had a 20×20 `×` on each filled hardpoint. That failed the 44 px audit and looked
cluttered at 52 px. Tap a hardpoint to select it; tap the selected one again to clear it. The
label above the row says so while a full slot is selected.

### D-U8 — the HUD computes its own world→screen scale
CONTRACTS §14 warns the overlay canvas may not match the WebGL canvas pixel for pixel, so
`hud.js` derives `sc = screen.h / cam.vh` and the camera offsets from `world.cam` rather than
trusting `cam.scale`. It also saves/restores and resets `globalAlpha`, `globalCompositeOperation`,
`shadowBlur`, the line dash and the text alignment around its pass.

### D-U9 — `data/modes.js` exports rule tables, not a menu
`MODES` there is an object keyed by id (`survival`/`timeattack`/`bossrush`) with no Story row and
no event row. `ui.js: buildModes()` assembles the menu from it, prepends Story and appends
`getWeeklyEvent()`. A new mode added to that object shows up in the menu with no UI change.

## The HUD

- **Layout is cached** and recomputed only when `screen.w/h`, handedness or the slot count change.
  There is no per-frame allocation: icons are prerendered into an offscreen cache keyed by
  `name|size|colour`, and the slot state is read into one reused scratch object.
- **Thumb buttons**: `max(64, min(84, h * 0.20))` px square, gap `13%`, bottom-right, mirrored to
  bottom-left when `prefs.hand === 'left'` with slot 1 kept nearest the screen edge. Icon, ammo
  count, and a radial cooldown sweep. Empty/exhausted slots go grey with a red `—`.
- **Minimap**: a `min(320, w * 0.34) × 20` strip, top-centre. It tests every balloon / pickup /
  fighter / boss / flak against its own screen rect each frame and drops to **35 % alpha** when one
  is behind it. Proven in both states — `shots/ui/hud_clear_*.png` (opaque) vs `hud_*.png` (faded,
  a balloon sits behind it).
- **Enemy/prop health bars** are drawn in the HUD pass at `COMBAT.hpBarWidth/Height` world units ×
  the HUD's own scale, so smoke can never occlude them.
- **Damage**: a red vignette above 35 % damage, plus a 0.28 s red edge flash triggered by the
  player's hp dropping between frames (no event subscription needed, though one can be added).
- **Handedness never restricts steering.** The HUD only registers the rects it actually draws;
  everything else on screen is steering territory, on either side.

## Hit-rects — the fence with `core/input.js`

`register(id, {x,y,w,h})` / `unregister(id)` / `clear()` / `hitTest(x,y)` / `all()`. CSS px,
screen space, top-left origin. `hitTest` returns the **last-registered** containing rect's id.

- Rects are **snug**: each is exactly the drawn button, never padded out.
- `ui.js` calls `clear()` on every screen change, and `ui.close()` also calls `resetHud()`, so a
  rect from a previous screen can never swallow a steering touch.
- The HUD is the only thing that registers during flight: `slot0..slot3`, `pause`, and `takeoff`
  (only while landed).

## Verification

```bash
node tools/shot.mjs --url "/tools/lab/ui.html?screen=hangar" --size 844x390 --dpr 1 --out shots/ui --console
```

`tools/lab/ui.html` query parameters:

| param | effect |
|---|---|
| `screen=` | `title hangar brief results levelselect modeselect settings pause hud` |
| `save=` | `new` (broke, nothing owned) · `mid` (default) · `rich` (jets, most ordnance) |
| `hand=left` | mirrors the HUD thumb buttons |
| `level=a1-04` | which level brief/results/pause use |
| `occlude=0` | moves the two ents that sit behind the minimap, to show it opaque |
| `lose=1` | results renders the shot-down state |
| `bar=0` | hides the lab's debug strip |

The lab exposes `window.__audit()` (returns and logs every interactive rect with its size, and
names any whose short side is under 44 CSS px) and `window.__rasterise()`.

**Why the lab draws itself into a canvas.** `tools/shot.mjs` is frozen and captures
`document.querySelector('canvas').toDataURL()` — it cannot see DOM. The lab therefore clones `#ui`,
swaps each inline `<canvas>` for an `<img>` of its `toDataURL()`, inlines `css/ui.css`, and draws
the lot through an SVG `<foreignObject>` into `#shot`, which is the page's **first** canvas. This
is a lab-only trick; the shipped game never does it.

### Gates, falsified (house rule 13)

Both were run against a deliberately broken build and **confirmed to fail**:

- **zero page errors** — `--eval "setTimeout(()=>{null.boom()},10)"` with `--at 0.6`
  → `--- 1 page error(s) --- [EXCEPTION] TypeError: Cannot read properties of null`.
  **Caveat found while falsifying it:** with no `--at`, capture and teardown happen before a
  deferred throw lands and the gate reports clean. Always give the page a beat before trusting it.
- **44 px touch floor** — `--eval "…forEach(n=>{n.style.width='30px';…}); window.__audit()"`
  → `tooSmall:["16 32x32","212 32x32","3— 32x32"]`. Note the audit runs once at 350 ms, so a
  mutation after that needs an explicit `window.__audit()` in the eval to be seen.

### Result, 2026-08-26

Zero console errors and zero rects under 44 px on every screen at **844×390** and **932×430**:

```
title 7 · hangar 17 (22 with the armoury open) · brief 4 · results 4
levelselect 23 · modeselect 12 · settings 9 · pause 4 · hud 5
```

## Open for the manager

1. **Who banks the money** — results screen (current) or `main.js`. See D-U4.
2. **Upgrades per plane vs global.** See D-U2, and whether `step()` is cumulative (D-U3).
3. **`ECON.upgradeCurve` and `UPGRADES[].base`** put a level-4 Armour on the Harrow at £580 while
   the plane itself is £1,400. That is DESIGN's call, not a UI bug, but it reads oddly in the
   screenshot — worth a look now that `data/economy.js` exists.
4. **Attract swap** — when `gfx/renderer.js` can run a player-less world, D-U6.
5. **Story beats**: act intros show on the brief, `MILESTONE_BEATS` show on results. `data/story.js`
   says milestones belong on "the hangar screen"; there is no room for a prose block in a 390 px
   hangar, so they landed on the debrief the player sees immediately before it. Say if that is wrong.
6. **`ENEMIES` tag labels** in `brief.js` (`light` → "light structures", etc.) are hard-coded for
   five tags. If DESIGN adds tags, either add a `label` field to the enemy rows or tell me the list.

---

# STINT 2 — units, the altitude ribbon, and the music track list

## `js/ui/units.js` — the only place a unit label is written

Every screen formats through it. **Grep gate:** no currency symbol may appear anywhere in
`js/ui/**`, `css/ui.css` or `tools/lab/` except `units.js`:

```bash
grep -rnE "[£€¥]|['\"]\$['\"]" js/ui css/ui.css tools/lab | grep -v "^js/ui/units.js:"
```

Falsified: planting `'£' + (stats.money || 0)` back into `pause.js` makes it print that line;
removing it makes it silent again.

| Setting | Options | Default | Stored as |
|---|---|---|---|
| Currency | `£ $ € ¥` + credits | `£` (`gbp`) | `settings.currency` |
| Speed | mph / km/h / knots | mph | `settings.speedUnit` |
| Altitude | feet / metres | feet | `settings.altUnit` |

### D-U10 — currency is a **symbol swap**, never a conversion
It is game money. `cash(4820)` → `£4,820` / `$4,820` / `4,820 cr`. The credits option carries a
suffix instead of a symbol, which is why `cash()` exists rather than a `symbol()` the callers
concatenate themselves.

### D-U11 — world scale is **1 unit = 10 ft = 3 m**, and it applies to camera space only
The manager's ruling makes `PHYS.ceiling` 2400 read as a 24,000 ft / 7,200 m service ceiling.
It also drives the brief's map-length badge, which now reads **30 mi / 48 km / 26 nmi** instead of
the old hard-coded `16 km` (the length family follows the chosen speed unit).
It deliberately does **not** apply to sprite-space sizes: a 120-unit aeroplane is not 1,200 ft
long, so the armoury's weapon line dropped its bogus `m` and reads `300 blast` as a bare stat.
If DESIGN wants a real blast-radius unit, give the weapon rows a metres field and I will use it.

### D-U12 — mph is 1:1 with the number the hangar already showed
The brief said "keep whatever display scale the hangar already uses; only the unit and label
switch". So the raw stat is treated as mph (it was mislabelled `kph` before), and km/h ×1.609 and
knots ×0.869 convert from it. `SPEED_UNITS[].k` in `units.js` is the one place to change if the
manager would rather the raw number *be* km/h — every consumer follows.

### Live, without a reload
`prefs.setPref` now notifies subscribers (`onPrefsChange`) and every screen is rebuilt on
navigation, so leaving Settings repaints the hangar/brief/results in the new units. The HUD reads
`prefs` every frame. The coin chip on the Settings screen itself is refreshed in place the moment
the currency button is tapped — proven in `shots/ui2/curlive_844x390_t1p6.png`.

## The altitude ribbon (`hud.js: drawAltitude`)

**Why it exists:** D26 capped ground AA at 1800 against a 2400 ceiling, so the top quarter of the
sky is a sanctuary — and that rule was completely invisible. The gauge teaches that one thing.

- Screen edge **opposite the thumb buttons**, below the hp/fuel bars, mirrored by `prefs.hand`.
  9 px track, labels on the inboard side. It registers **no hit-rect**, so it never eats a steering
  touch even though it sits in steering territory.
- Bands, bottom to top: **AA threat** (red), **safe** (blue, labelled `SAFE`), **thin air** above
  `PHYS.ceiling` where `ceilingBite` costs you 45% of your turn rate.
- The threat top is **not the constant 1800** — it is `max(ent.y + row.range)` over the live AA in
  the level, recomputed every 0.25 s. So act 1 shows a low line and act 5 a high one, and the line
  **drops as you destroy the guns**. `row` is `ent.def` for `flak`, or `ENEMIES[ent.def.shoots]`
  for a ground ent that shoots.
- `hot` (band brightens, `AA` label lights) uses the sim's own firing gate from
  `behaviour.js: aaFire` — `dist < range && p.y - e.y >= 40` — so the shaded band means exactly
  "it can shoot me here", not an approximation of it.
- **Fade:** full opacity only when AA is actually in range, or you are above 80% of the threat top,
  or above 88% of the ceiling, or stalling. Otherwise it eases to 0.28 and all but disappears —
  see `shots/ui2/r2_alt_600_aa_none_*.png`.
- The **numeric readout wins every collision**: the `CEILING` / `AA` / `SAFE` labels stand down
  when they would sit within 12 px of it. The lines themselves are always drawn, so nothing that
  marks an altitude is ever hidden.
- `STALL` blinks off `p.stalling` (falling back to `speed < def.stall * 1.06`) — the real reason a
  climb to the ceiling goes wrong.

### Is it worth the space? — yes, but only because of the fade
Full-brightness the whole time it would be clutter: it is a 264 px vertical object on a 390 px
screen and nothing else on the HUD is that tall. Faded to 0.28 in ordinary low flight it reads as
a faint tick mark, and it only asserts itself when altitude is the question. **If the fade is ever
removed, remove the ribbon with it.**

## Settings — three columns, and the track list

`.set-body` is a flex row of **Audio & feel · Units · Tracks**, each with its own scroller. A
single column at 390 px tall gave ~6 rows of viewport, which buried both the unit pickers and the
whole track list. Three columns puts every unit picker on screen without scrolling and gives the
track list a 280 px scroller of its own.

- Tracks are read from `ctx.data.MUSIC` (loaded dynamically by `ui.js`; `js/data/music.js` is the
  manager's file and is never written here). An **empty manifest is a first-class state** — the
  panel says so and hides the bulk buttons.
- Grouped **Menu · Hangar · Battle · Boss · Stings** with sticky group headers, a per-group
  `ON`/`OFF`, `ALL ON` / `ALL OFF` at the top, and a live `n of m on` count.
- Off ids are stored as `settings.musicOff = { [id]: true }` — the exact shape `pickTrack()` and
  `pairedTrack()` take. The UI never reimplements selection. Helpers: `setTrackOn`,
  `setTracksOn` in `prefs.js`.
- **Everything off is allowed.** No minimum is enforced; `pickTrack` returns `null` and that is
  silence, which is a legitimate request.
- **Verified against the real manifest** once it landed: 22 tracks, 5 groups, `1442/556` px of
  scroll in the panel, preview plays a real mp3 with no error toast
  (`shots/ui2/set_real_844x720_t1p2.png`, `shots/ui2/prev_844x390_t2p2.png`).
- **Preview works.** One `HTMLAudioElement` at a time, built from the manifest's bare filename
  against `assets/audio/music/`, stopped on unmount and on switching rows. It does not touch
  `core/audio.js` at all, so there is nothing to fight — that module is a procedural synth stub
  with no file playback. `prefs.apply()` does call `audio.setDisabledTracks(prefs.musicOff)` if
  that method ever appears, so the audio agent has a hook waiting.

## Lab additions

| param | effect |
|---|---|
| `music=16` | inject a fake 16-track manifest (the real one is empty) |
| `off=id,id` | start with those track ids switched off |
| `cur= su= au=` | currency / speed unit / altitude unit |
| `alt=1900` | player world y, for the ribbon |
| `aa=flakLight\|none` | which AA row the lab's flak carries, or none at all |
| `stall=1` | force the stall warning |
| `speed=` | player speed |

**Rasteriser caveat found this stint:** the SVG `foreignObject` trick clones the DOM, and a clone
does not carry `scrollTop`. A scrolled column cannot be screenshotted. To see what is below the
fold, capture at a taller viewport (`--size 844x720`) and check scrollability separately with an
`--eval` that logs `scrollHeight/clientHeight`.

## Result, stint 2

Zero console errors and zero rects under 44 CSS px on every screen at **844×390** and **932×430**:

```
title 7 · hangar 17 (22 on a rich save, 32 with the armoury open) · brief 4 · results 4
levelselect 23 · modeselect 12 · settings 70 with the real 22-track manifest (21 when it is empty) · pause 4 · hud 5
```

Both inherited gates re-falsified against a deliberately broken build: the error gate reports
`[EXCEPTION] TypeError` with `--at 0.6`, and shrinking every `.switch` to 30 px produces 20
`[audit-fail]` lines. The new currency gate is falsified above.

## Still open for the manager

7. **Speed base unit** — D-U12. One constant in `units.js` if you want the raw stat to mean km/h.
8. **Map length** now reads 30 mi / 48 km rather than 16 km. Same ruling as the ceiling; say if the
   level `length` field was authored as metres and you want it left alone.
9. **Blast radius** lost its `m`. It needs a real field if it is to carry a unit.
10. **`audio.setDisabledTracks(map)`** is the hook `prefs.js` will call if `core/audio.js` adds it.

---

# STINT 3 — the HUD against the REAL renderer

The manager's composited capture showed the HUD smeared across the frame: green stair-stepping
ribbons hundreds of pixels long and orange curved bands. Two separate defects, plus a third found
while fixing them. **All three were invisible in `tools/lab/ui.html` and always would have been.**

## D-U14 — the HUD clears its own overlay, and that was the whole smear

**This was the visible bug, and it was not the transform.** The probe says only **one** entity in
that frame qualified for a health bar; the ribbons were one bar redrawn every frame onto a
canvas nobody clears. The "stair-stepping" is the camera panning a pixel or two per frame, and
the orange bands are the off-screen chevron sweeping its ring.

Since D14 the HUD lives on a **separate transparent overlay**. `main.js` does not clear it and
`gfx/renderer.js` only ever *sizes* it — so the only thing that can clear it is `drawHud`, and it
now does, first thing in the pass.

**The one exception is `gfx/debug.js`**, which paints the entire world into that same canvas
before `drawHud` runs. Clearing there would leave `?gfx=debug` a black screen, and that mode is how
we tell a sim bug from an art bug. `debug.js` asks for `getContext('2d', { alpha: false })` and
`main.js` does not, and a canvas only ever has one context — so **`getContextAttributes().alpha
=== false` is an exact signal that someone else owns the canvas**, and the clear stands down.
`screen.clear` overrides it either way; `tools/lab/ui.html` passes `clear: false` because it too
paints its stand-in scenery underneath. Verified: `shots/ui3/dbg_844x390_t6.png` still shows the
debug world with the HUD over it.

## D-U15 — `drawHud` owns the dpr transform, derived rather than declared

`renderer.resize()` sets `hud.width = cssWidth * dpr`, and `main.js` calls
`drawHud(ctx, world, { w, h })` with **no `dpr`** — so on a dpr-2 phone the whole HUD would have
drawn at half size in the top-left corner. It never showed up because every capture so far ran at
`dpr=1`. `drawHud` now derives `dpr = screen.dpr || canvas.width / screen.w` and always sets the
transform, which removes the unstated contract instead of documenting it.
Proven at `--dpr 2`: `shots/ui3/dpr2_844x390_t7.png` (real game) and
`shots/ui3/sweep/hud_dpr2_844x390_t1p4.png` (lab).

## D-U13 — world-anchored marks go through `renderer.project()`

Per GFX_NOTES §10. Measured on the real renderer at 844×390, a prop at ground level:

```
screen x:    0     211    422    633    844
flat error:  18.7   4.7    0.0    4.7   18.7   px
```

Zero at the centre, **18.7 px at the edges** — a 5 px-tall health bar is completely detached from
its prop out there. Now converted: enemy/prop health bars, the off-screen chevron, and the
minimap's occlusion test (which asks whether an entity visually sits behind the strip). The
minimap *ticks* are unchanged — they are a fraction of `level.length`, not a projection.

`main.js`, **one line, the only thing I need from you**:

```js
const m = await import('./ui/hud.js');
drawHud = m.drawHud;
m.setProjector(renderer);        // <-- this; accepts the renderer or a bare project function
```

A setter rather than a per-frame argument so the frame loop cannot quietly drop it in a refactor.
`drawHud` also reads `screen.project` if you would rather pass it per frame. With neither, it
falls back to the flat transform and accepts the drift, which is what keeps `?gfx=debug` working.

**Cost, stated honestly:** `renderer.project()` returns a fresh object, so the HUD now allocates
roughly one small object per visible entity per frame, against the "no per-frame allocation" claim
above. If it ever shows in a profile, ask GFX for `projectInto(x, y, out)`.

## The two gates, and the first version of one of them was a lie

`tools/lab/ui.html` now exposes two **mechanism** tests. They do not look at how the HUD looks;
they assert the two things that broke.

| gate | asserts | falsified by |
|---|---|---|
| `window.__cleartest()` | frame A then frame B is **pixel-identical** to frame B alone | removing the clear → `41899 px of frame A survived` |
| `window.__projtest()` | with a pinned projector a health bar **leaves** its flat position and **appears** at the pinned one | reverting `drawWorldBars` to the flat transform → `flatBefore 192, flatAfter 192, hitAfter 0` |

Each gate passes while the other's bug is live, so they are independent.

```bash
node tools/shot.mjs --url "/tools/lab/ui.html?screen=hud&bar=0" --size 844x390 --dpr 1 --at 1.4 \
  --out shots/ui3 --name gates --console \
  --eval "setTimeout(()=>{window.__cleartest();window.__projtest();},700)"
```

**The first `__cleartest` passed against a build that plainly smeared.** It counted painted
pixels, and the damage vignette paints 43% of the screen, so the smear vanished into the total —
`{pass:true, a:142972, b:142972}`, three identical numbers that should have looked wrong
immediately. Replaced with an exact pixel diff, and the test worlds now run at full health so the
vignette is off at all. Same fault twice: `__projtest`'s first probe box overlapped the thumb
buttons and read 466 px of button as "the bar is still there".

A third trap, kept as a comment in the lab: the threat scan is throttled on `world.t`, so drawing
two frames at the **same** `t` leaves the second reading the first's `hot` flag. That is a test
artefact — the game never draws two frames at one `t` — but it is a real pixel difference and it
masqueraded as a smear until a **control run** (draw B twice, expect zero diff) proved the HUD
deterministic. Every before/after gate here now carries that control.

## The lab cannot catch this class of bug

Its fake world is flat, its canvas is shared with its own backdrop, and it draws one frame at a
time. **Anything world-anchored must now be checked against the real renderer:**

```bash
node tools/shot.mjs --url "/index.html?level=a1-01&auto=1&nofs=1&dpr=1&preserve=1" \
  --size 844x390 --at 8 --out shots/ui --name real --console
```

`&preserve=1` is required (`preserveDrawingBuffer` for `toDataURL`). Before/after:
`shots/ui3/real_844x390_t8.png` (smeared) → `shots/ui3/fixed_clear_844x390_t8.png` (clean) →
`shots/ui3/edge_proj_844x390_t6.png` (a bar sitting correctly on a hut).

