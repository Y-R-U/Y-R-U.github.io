# BREACHPOINT II — handoff

Written at the end of the build, for somebody who has never seen this project. It is the state of play, the
navigation map, the traps, and what was left undone on purpose. It does not repeat the design rationale —
that is in `BUILD_PLAN.md` (specs + AS-BUILT), `IMPROVEMENTS.md` (backlog), `BALANCE.md` (the numbers
argument) and `PIPELINE.md` (verified measurements, phase log, harness traps). **`PIPELINE.md` is the one
to read second.**

**Updated at the close of P5d.** The first draft of this document was written while P5b held `js/engine.js`
and it said so on every page; P5b (perf), P5c (the stuck player) and P5d (ship prep) have all landed since,
and everything below describes the tree as it stands. What changed: the enemy rigs render through baked
vertex colours and three detail tiers, **L1 114 → 46-55 and L8 302 → 128-142 draw calls**; the debrief
escalates with consecutive losses and there is a RECRUIT difficulty; the profile schema is **v2**; every
`spTarget` was re-set against *measured* earnings; `LEVELS[5].maxAttackers` is 4; the `p4b_test` §10 corner
failure was traced to a real map defect and fixed at the cause; and **the test suites now live in the repo**
at `tests/`, not in a session scratchpad.

What is still true, and is the only thing that matters now: **the game is committed but not registered.**
There is no `projects.js` entry, on purpose — `LISTING.md` holds the draft and says why. **Aaron has not
played it.** Every claim in this project is headless evidence about correctness and no evidence at all about
whether it is fun. `docs/PLAYTEST.md` is the list of things only he can answer.

---

## 1. What it is, and how to run it

A mobile-first 3D FPS campaign in the browser. You learn to shoot at a paintball park; the PA cuts to an
emergency broadcast mid-sentence; you are conscripted on the strength of your paintball record and sent to
take the dock at the far end of the same yard. Nine levels (plus an ENDLESS marker) over **one** shipping
yard, re-lit, re-populated and physically relaid out each time, wrapped in an RPG-lite upgrade economy whose
central mechanic is an armour-penetration **gate**.

**To run it: open `index.html`. That is the whole procedure.** No build step, no server, no install.

- One local copy of three.js r128 at `../../lib/three/r128/three.min.js`. **Not a CDN** — a CDN `three`
  import hangs games in this repo with no error at all.
- Six classic `<script>` tags, in order, plus a two-line inline guard that paints "THREE.JS FAILED TO LOAD"
  into the loading panel if the library did not arrive.
- The CDP tests navigate to a `file://` URL, so `file://` is a supported target, not an accident.

### Why it must never become ES modules

`type="module"` is **CORS-blocked over `file://`**. The moment any script tag gains `type="module"`, the
game stops opening off disk — for the player and for the entire test harness at once. Classic scripts also
dodge the stale-module-cache failure that has silently hung two other games in this repo on their loading
screen (headless Chrome will happily serve you a cached module and hide your own edit). There is a standing
rule in `PIPELINE.md`: **classic `<script>` only, never `type="module"`.** A suite asserts zero
`type="module"` tags. Treat that as a hard constraint on the architecture, not a preference.

The corollary: there is no bundler, no transpile and no import graph. Load order *is* the dependency graph
(§3), and shared values are passed on one global (`window.BP2`).

---

## 2. The file map

Seven files, ~7.6k lines. Every one carries a `§ANCHOR` map in its header comment. **The navigation rule
for this project is: never read a whole file.** `grep -n '§NAME'` for the anchor, then `sed -n 'A,Bp'` the
region. `js/engine.js` alone is ~5,200 lines and reading it whole is the single most expensive mistake
available here.

| file | lines | owns |
|---|---|---|
| `index.html` | 251 | DOM skeleton + the six script tags. No logic beyond the THREE-missing guard. |
| `css/game.css` | 472 | every style. Unreadable from JS over `file://` (`document.styleSheets[0].cssRules` throws) — nothing reads it today. |
| `js/data.js` | 200 | pure tables. **No dependencies.** Loaded first. |
| `js/profile.js` | 162 | `localStorage` career save (**schema v2**), SP economy, the shop, `upg()`. |
| `js/engine.js` | 5,344 | the inherited engine, one IIFE. Renderer, world, nav, weapons, enemies, HUD, input, objectives, ranks, game loop, `window.__game`. |
| `js/tutorial.js` | 319 | instruction screen + the 8-step interactive drill. |
| `js/armoury.js` | 492 | upgrade screen, threat readout, **the survival model**, the escalating debrief, respec/reset. |
| `js/campaign.js` | 384 | radio, the war beat, objective HUD, boss banner/bar, the hub. |

The engine is **not refactored**. It moved out of the original single file verbatim in P1.5, keeps its one
enclosing IIFE and its anchor map, and only ever takes surgical edits. All new growth goes in the small
files. Unpicking 5k lines of working closure-scoped game code into modules is plumbing risk with no payoff.

### `index.html`
No anchors. `#hud` and its children, the five touch controls, and one `<div class="screen">` per screen:
`#startScreen #endScreen #pauseScreen #setScreen #introScreen #warScreen #hubScreen #armScreen #cfmScreen`,
plus `#tutHud`, `#objHud`, `#bossBar`, `#bossBanner`, `#radio`, `#loadWrap`. New UI adds a screen div here
and drives it from one of the small JS files. **Popups are screens. There is no `alert()` in this game and
there must not be one.**

### `css/game.css`
| anchor | what |
|---|---|
| `§CSS-HUD` | crosshair, vitals, ammo, minimap, kill feed, scope, damage flash |
| `§CSS-TOUCH` | the two thumb sticks, weapon buttons, reload/ADS buttons |
| `§CSS-SCREENS` | the shared `.screen` overlay chrome |
| `§CSS-INTRO` | instruction screen cards + the tutorial step bar |
| `§CSS-ARMOURY` | debrief SP breakdown + the upgrade screen |
| `§CSS-CAMPAIGN` | objective meter, boss bar/banner, radio band, hub cards |
| `§CSS-DEBRIEF` | the escalating end-screen debrief (`#debrief:empty{display:none}` is load-bearing) |

### `js/data.js` — pure tables, no dependencies
| anchor | what |
|---|---|
| `§TIERS` | six enemy stat tiers (`hp/dmg/apPen/dmgTakenMul/accuracy/reaction`), `BOSS_MUL`, `tierErrMul` |
| `§LAYOUTS` | five complete container maps — 98 placements, `[x,z,stack,rot,ci]`, each with its own 5-colour palette |
| `§LEVELS` | the ten-entry campaign table: layout, insertion point, objective, roster, time, light, `maxAttackers`, `spTarget`, zone/hold/waves |
| `§UPGRADES` | six tracks x five ranks, `UPG_COSTS`, the weapon unlock ladder |

### `js/profile.js`
| anchor | what |
|---|---|
| `§PROFILE` | `bp2_profile` in `localStorage`; `SCHEMA = 2`, `blank()`, `migrate()`, defensive `load()`, `award/spend/buyRank/buyWeapon/respec/clearLevel`, and `upg(track, rank)`. **v2 adds `fails{}` (consecutive losses per level) and `recruit{}` (which clears were made on RECRUIT)** — both additive, and a v0 or v1 save migrates keeping every field and is rewritten at v2, never dropped. |

`upg()` lives here and **not** in `data.js` because it reads the live profile — putting it in the
dependency-free table file was a layering inversion that only worked through a lazy global lookup.

### `js/engine.js`
The anchor map is in the file header. One line each:

| anchor | what |
|---|---|
| `§SETTINGS` | `S.*` defaults + `bp2_settings` persistence |
| `§AUDIO` | procedural Web Audio — guns, footsteps, hum, thunder. No files. |
| `§RENDER` | renderer, cameras, the three-lights-forever rig, bloom/vignette/grade post |
| `§TEXTURES` | canvas-generated textures (`TEX.*`) |
| `§MATERIALS` | the shared world materials (`MAT.*`) — the merge buckets |
| `§WORLD` | the yard: floor, fence, building, parapet, ramp, the dock, cranes, and the five container layouts built once and toggled |
| `§COLLISION` | `groundAt` / `moveCollide` / `pointBlocked` / `ceilingAt` |
| `§NAV` | 80x80 nav grid at 0.75 m, cover points, A* (`NAV.bake()` refills, never reallocates) |
| `§VIEWMODELS` | gun builders. Local frame: −Z = muzzle, +X = right, +Y = up |
| `§HANDS` | the gloved hand rig shared by every viewmodel |
| `§GUN-RIFLE` `§GUN-SHOTGUN` `§GUN-PISTOL` `§GUN-SNIPER` | one builder each |
| `§FX` | muzzle flash, casings, impacts, decals, tracers, and the **paint splat persistence** (`savePaint`/`restorePaint`/`reseatSplat`) |
| `§PLAYER` | movement, jump/double jump, mantle, camera, `player.spawn()` (reads the level's insertion point) |
| `§WEAPONS` | `WDEF` stats, firing, spread, recoil, ADS, reload animation |
| `§ENEMIES` | the rig, hit boxes, AI states, cover, ragdoll, tier application, patrol/spawn selection |
| `§ENEMY-LOD` | three detail tiers; past ~30 m every far enemy is drawn through **one** `InstancedMesh` (§9) |
| `§HUD` | crosshair sizing, minimap, kill feed, name tags (`drawTag`) |
| `§INPUT` | keyboard/mouse/pointer-lock + the touch schemes |
| `§SETTINGSUI` | settings rows + `applySettings()` |
| `§LIGHT` | eight presets; `Light.sight()` couples fog to AI vision |
| `§OBJECTIVES` | `eliminate` / `capture` / `hold` / `waves`, the zone marker, out-of-bounds |
| `§RANKS` | the six upgrade tracks applied to the live player at `startRound()` |
| `§GAME` | round flow, main loop, and `window.__game` at the very bottom |

Two conventions inside the engine worth knowing before you touch it:
- `WBASE` holds **pristine** weapon stats. `§RANKS` multiplies `WDEF` from `WBASE` every round, so five
  consecutive rounds give identical numbers and rank changes never compound.
- `mergeGeos()` is a hand-rolled minimal merger (non-indexed, `position`/`normal`/`uv`/`color`). P5b
  extended it to carry `color`, defaulting to white where a source has none, so untinted world geometry
  merges through the same function unchanged. If you add a vertex attribute, it has to be added here too or
  it is **silently dropped**.

### `js/tutorial.js` — publishes `BP2.Tutorial`
| anchor | what |
|---|---|
| `§CARDS` | the control cards on the instruction screen (portrait and landscape) |
| `§STEPS` | the 8 steps — move / look / fire / hit / reload / ADS / down / down. Each `test()` reads live game state via a poll-kept counter, so a step cannot be faked. |
| `§INTRO` | the boot gate (the game starts **paused** on it) and CONTROLS from the pause screen |
| `§RUN` | the poll loop, SKIP, and completion → +300 SP → hands off to `Campaign.warBeat()` |

### `js/armoury.js` — publishes `BP2.Armoury`
| anchor | what |
|---|---|
| `§THREAT` | the fire-cadence derivation (`cadenceOf`, `burstOf`), the severity `BANDS`, and the readout painter |
| `§SURVIVAL` | **the one survival model.** `survival(lvl, platingRank, vitRank)` — the hub calls the same function |
| `§STUCK` | the escalating debrief: nothing on loss 1, a BEST BUY row on 2, the honest "the wall is N SP high" line on 3, the replay route on 4+ |
| `§TRACKS` | the six upgrade rows, including the "same SP in the other track buys more" line |
| `§WEAPONS` | the SP unlock ladder rows |
| `§CONFIRM` | respec and RESET PROGRESS, on a screen, never an `alert()` |

### `js/campaign.js` — publishes `BP2.Campaign`
| anchor | what |
|---|---|
| `§RADIO` | a queue of lower-third lines. Never blocks play; `#radio` is `pointer-events:none` and one tap on the band kills the **whole** queue |
| `§WAR` | the six-line conscription beat that ends the paintball drill **without ending the round** |
| `§OBJHUD` | the capture / hold / wave meter + the minimap arc |
| `§BOSS` | announce banner + health bar, latched (§4) |
| `§HUB` | the campaign screen: nine cards, lock state and lock reason, best time, recommended power, and the threat readout |

---

## 3. Load order is the dependency order

```
three.min.js  →  data.js  →  profile.js  →  engine.js  →  tutorial.js  →  armoury.js  →  campaign.js
```

Every file attaches to one global, `window.BP2`. There is no module system to enforce this, so the order in
`index.html` is the only thing holding it up — **changing it will break the game silently**, because a
destructure of an absent property yields `undefined` rather than an error, and the failure surfaces later
and somewhere else.

- `data.js` publishes tables and depends on nothing.
- `profile.js` destructures `{LEVELS, UPGRADES, UPG_TRACKS, CAMPAIGN_LEVELS, WEAPON_UNLOCK}` from `BP2` and
  publishes `BP2.Profile` and `BP2.upg`.
- `engine.js` takes everything it needs in **one destructuring line** near the top — this is the entire
  seam between the engine IIFE and the file split:

  ```js
  const {TIERS, BOSS_MUL, tierErrMul, LEVELS, LAYOUTS, CAMPAIGN_LEVELS, levelById,
         UPG_COSTS, UPGRADES, UPG_TRACKS, upg, WEAPON_UNLOCK, Profile} = BP2;
  ```

  Anything new the engine needs from the data layer goes on that line. It runs at script evaluation time,
  which is why `data.js` and `profile.js` must be fully loaded first.
- `tutorial.js`, `armoury.js` and `campaign.js` capture `window.__game` as `G` at their top and drive the
  engine entirely through it (§5). They publish onto both `BP2` and `G`, so `__game.Armoury` and
  `BP2.Armoury` are the same object.
- `campaign.js` is **last** because it wraps `GAME.start` / `GAME.end` and reads `BP2.Armoury` for the
  threat readout. `tutorial.js` wraps `GAME.startRound`. **Both wrappers call through — keep that chain
  intact.** If you add a fourth file that wraps a game entry point, it goes after the ones it depends on and
  it calls through too.

`clamp` is deliberately defined three times (data, profile, engine) rather than sharing a `util.js`: a
shared file would add a load-order dependency for less code than it removes. Revisit only if a third thing
wants sharing.

---

## 4. The mechanics a newcomer will get wrong

### 4.1 The armour gate — this is the game

Everything else is scaffolding around this:

```
effAbsorb = clamp(PLATING.absorb − enemy.apPen, 0, 0.92)
absorbed  = min(player.armor, dmg × effAbsorb)
player.armor −= absorbed
player.hp    −= (dmg − absorbed)
```

Armour regenerates at `PLATING.regen`/s after `PLATING.delay` s without damage. Each enemy tier carries an
`apPen` that eats into the fraction your plating absorbs, so **the same investment is worth an order of
magnitude more on level 1 than on level 8**. At PLATING 5: militia cost **0.900 HP** a hit, shock **6.480**,
praetor **9.680** — a 10.76x spread, which is the "shields make you nearly invulnerable in level 1 but
level 2 can still hit you" the design was asked for.

**`apPen` is deliberately capped low, and this is the thing a newcomer will undo.** The original table ran
`apPen` to **0.60** at praetor. That looks dramatic and it is broken: at 0.60, a player who has just
finished buying PLATING rank 5 — the most expensive track, and the one the threat readout points at —
absorbs **0.30**, which is *less* than PLATING rank 0 absorbs against early enemies (0.50). Their primary
defensive investment stops scaling at the exact moment it is fully paid off. `BALANCE.md` variant C pulled
the ladder back to **0 / 0 / 0.10 / 0.18 / 0.26 / 0.34** and late-tier damage with it. praetor at PLATING 5
now absorbs 0.56, more than militia at PLATING 0, so armour scales all the way up — and the gate still reads
as a 10.76x spread. Widening `apPen` again "for drama" re-breaks levels 6–8. Read `BALANCE.md` before
touching `TIERS`; the md5 of the `§TIERS` block was recorded (`c0f0aa0c76059ece81d5f1ceeb94efaa`) so a
change is visible.

### 4.2 `§SURVIVAL` is the single source of truth, and the hub reads it

`survival()` in `js/armoury.js` answers "how many seconds of open ground does this level give this build".
It is called by the armoury threat readout **and** by the campaign hub (`campaign.js` calls
`A.survival(lvl)`). **Do not fork it.** Two divergent survival numbers on two screens is the exact failure
the shared function exists to prevent, and a suite asserts they agree.

What it models, and what it does not:
- **Per-tier fire cadence**, derived from `§ENEMIES`' own constants rather than assumed: burst `randi(3,5)`
  (mean 4) **+1 above accuracy 0.7**, shots 0.115 s apart, cooldown `rand(0.75,1.6)` mean plus 0.5 s past
  22 m, all scaled by `lerp(1, reaction, 0.5)`. **`fireCD` runs DURING the burst**, so the period is
  `max(cooldown, burst length)` — *not* their sum, which is the easy mistake and was made once.
- **The armour pool**, in two phases: the pool absorbs `dmg × effAbsorb` per round until empty, then every
  round lands whole. Regen is in the model but never fires under sustained fire (measured: 0 regen on all
  eight levels).
- `HIT_RATE = 0.6` is **invented** and is now the only invented constant left. Absolute seconds are soft;
  the *shape* of the curve is what is robust, because scaling the hit rate scales every level equally.

Checked against the real `damagePlayer` pipeline on all eight levels, worst margin **4.0%**, and the model
is always on the pessimistic side. `MODEL`, `cadenceOf` and `burstOf` are exported so a test can recompute
from the constants instead of copying numbers out.

Severity bands: `>=30 s TRIVIAL · >=15 LIGHT · >=8 SERIOUS · >=4 SEVERE · else LETHAL`.

**The plating trap is a feature, and the readout exists to make it legible.** At L6 from P4V1, PLATING 4→5
(2,200 SP) buys 3.46 → 4.23 s while the *same* 2,200 SP in VITALITY 1→3 buys 4.98 s. Dumping everything
into the advertised defensive stat is genuinely a mistake there. The PLATING row says so in words. Showing
HP-per-hit alone would mislead the player straight into it — which is why survival time is the headline and
HP-per-hit is the footnote.

### 4.3 Levels are data

A level is a row in `§LEVELS` carrying `layout`, `insert`, `objective`, `roster`, `time`, `light`,
`maxAttackers`, `spTarget` and the objective's own fields (`zone`, `hold`, `waves`). Adding a level is a
table edit. Four things vary per level and all four are data:

- **Layout.** Five container maps; level → layout is `0,0,1,2,3,4,1,3,4,0`. Every layout is merged **once**
  at load into its own mesh set and added invisible; `setLayout(id)` flips `visible`, flips `.off` on that
  layout's solids and minimap rects, swaps meshes in `worldColliders` and calls `NAV.bake()`. Nothing is
  rebuilt or reallocated. A layout costs **exactly 6 draw calls** (5 palette body meshes + 1 frame mesh), so
  five layouts cost what one used to — **a sixth palette colour would cost a seventh draw call; keep `pal`
  at five.**
- **Insertion point.** `LEVELS[n].insert = {x, z, yaw, y?}`. Nine distinct points over ten levels; L3 starts
  you on the parapet at y 4.4, L4 inside the building. `player.spawn()` and the enemy spawn exclusion both
  read it.
- **Lighting.** Eight presets. `Light.apply()` **never changes the world light count — it is 4, always** —
  it only mutates `sun`/`hemi`/`amb`/`scene.fog`. Fog cuts **both** ways: `canSee()` uses `Light.sight()`
  (day 48 m → nightfog 18 m) and aim assist uses `min(70, scene.fog.far)`. LOW quality may only *shorten*
  the preset's fog and never touches AI sight.
- **Objective.** `eliminate` / `capture` / `hold` / `waves` in `§OBJECTIVES`, HUD in `§OBJHUD`. Capture and
  hold share one meter; the difference is decay weighting. Contested progress **decays**, it does not pause.
  `GAME.onKill` no longer ends the round — `OBJ.onKill()` decides.

`maxAttackers` is the other per-level dial and it is now `1,2,2,3,3,4,4,4,4,4`. **L5 is a 4 on purpose**:
L4 NIGHTFALL is at night and L5 SUPPLY LINE is day + haze, so at identical raw threat L5 would have played
*easier* than the level before it — a real inversion, not a modelling artefact. L6/L7 sitting flat is fine
and deliberate: the model measures incoming damage, not difficulty, and it cannot see that L7 is night +
fog + **two** bosses where L6 is dusk with one.

`spTarget` is **measured, not guessed**. P5c drove a clean first playthrough — every level loaded, every
enemy killed through the real award path, every objective completed, every `end()` run — and career SP on
arrival reads 300 / 700 / 1560 / 2830 / 4450 / 6570 / 9190 / 12400, 16140 after L8. Every target is ~65% of
that (`0 · 0 · 450 · 1000 · 1800 · 2900 · 4300 · 4900 · 8000`), so the hub's recommendation is always
reachable without grinding. L7 is the one exception at 53%, because L6 and L7 are the same tier with the
same attacker cap and *any* budget gap that crosses a rank-cost boundary makes L7 read easier than L6.

### 4.4 The enemy pool is 20 rigs, activated per level

`Enemies.init()` builds to the **largest** roster (20) once. `reset(levelDef)` activates only what the level
needs and marks the rest `.off`; `loadLevel(1)` gives 5 militia with 15 of 20 deactivated. Waves activate
pool rigs a group at a time. **Nothing is allocated mid-round**, and `rosterSize()` keeps reporting the full
roster regardless of how many are currently live. If you need a bigger roster than 20, the pool size is the
thing to change — not the per-level path.

### 4.5 Things that are easy to get wrong in passing

- A spawn point must be **reachable**, not merely free: `spawnPoints()`'s `free()` test ends with an A* to
  the insertion point. Without it a spawn can land in a quay pocket and that enemy never moves for the whole
  round — invisible in a screenshot.
- `applyRanks()` does **not** touch `player.armorMax`; that is set in `player.spawn()`. Reading `armorMax`
  after `applyRanks()` alone measures the last spawn, not the ranks.
- `announced` resets in `GAME.start()`, **not** in `loadLevel()`.
- The zone marker is **one** mesh rebuilt on level load. Do not build it per frame and do not split it.
- The training paint persists into L1 at full strength, 0.55 in L2, 0.25 in L3, gone at L4, and is reseated
  onto the yard when the next layout does not have the container it was sprayed on.

### 4.6 How an enemy is drawn, and why you must not undo it

This is the other thing a newcomer will break in passing, because it looks like it is only about looks.

- **The palette is baked into the geometry.** `mergeGeos()` carries a `color` attribute (3 floats a vertex,
  **filled white** where a source geometry has none, so the world merges through the same function
  unchanged — its materials have `vertexColors` false and a white attribute is inert). `ECOL` holds the
  colours and `tintGeo()` bakes them per part. **`EMAT` is two materials**, `rig` (one
  `MeshLambertMaterial({vertexColors:true})`) and `eye` (the unlit visor) — it was ten. A drawn rig is
  **12 meshes on 2 materials**, was 15 on 8. `EMAT_BOSS` is one cloned pair, not a `Map` over the palette:
  `color` **multiplies** the vertex colours (`0xff8a72`) and `emissive` is `0x531008`, so boss cost no
  longer scales with palette size. **If you add a vertex attribute anywhere, it has to be added to
  `mergeGeos()` too or it is silently dropped.**
- **Three detail tiers** (`§ENEMY-LOD`), with hysteresis on both boundaries. **0 NEAR** under 22 m, the
  articulated rig, 12 meshes. **1 MID** 25-34 m: head and visor fold into the torso, the knee folds into
  the thigh — 8 meshes. **2 FAR** past 34 m (back to mid under 30 m): one shared baked geometry through an
  `InstancedMesh`, capacity 20, so **every far enemy together is one draw call** — two when the squad is
  split between the slung and the aiming pose, because there are two baked poses. A far enemy in combat
  still reads as aiming; one frozen patrol pose would have been a readability regression.
- **Bosses and the paintball drill never leave tier 0**, at any distance. Name tags are hidden at tier 2
  (a `Sprite` does not batch, and they are unreadable past 30 m anyway).
- **Hit detection does not follow the drawn mesh and must never start to.** `rayTest()` works from `e.pos`,
  `e.yaw` and `e.scaleY()`. If it ever follows the LOD, long-range shots start missing enemies you visibly
  hit — and that only shows up at distance, which is exactly where nobody tests by hand. `p5b_test` §4 is
  the guard; see §9.

What it bought, `quality:'low'` pinned at the reference pose `teleport(1.5,24.5); look(0,0)`: **L1 114 →
46-55** and **L8 302 → 128-142** (peaks 151-163), with the static world unchanged at 36/35. Vertex colours
are a flat **3 draw calls per rig in the frustum**; the detail tiers are the rest of it (-124 on L8 alone);
the tag cull is worth only 1-2, because the old rule already hid a tag past 38 m and the far tier starts at
34. The world renders identically: mean absolute pixel difference **4.27** before vs after, against a
**before-vs-before noise floor of 4.63** measured on the same build twice — the change is below the
renderer's own frame-to-frame grain, which is why a byte compare would have been useless.

The mid tier's 22 in / 25 out is the one number here chosen to land the target band rather than derived.
At 25 m the knee bend is ~9 px of foot travel and the head nod is under a pixel; moving it out to 30 would
cost ~20 draw calls on L8.

---

## 5. `window.__game` — the test surface

Defined at the bottom of `§GAME`. **Every suite drives the game through it, and so do `tutorial.js`,
`armoury.js` and `campaign.js`.** It is not a debug afterthought; it is the project's public API. The rule
from `BUILD_PLAN.md` is: keep it working and **extend** it rather than inventing a second surface.

Roughly what it exposes:

| group | members |
|---|---|
| objects | `GAME player Weapons Enemies HUD NAV S Light OBJ FX Input scene camera renderer` |
| data | `Profile LEVELS TIERS UPGRADES BOSS_MUL WEAPON_UNLOCK LAYOUTS LIGHT_PRESETS WDEF WBASE PAINT RANKS` |
| flow | `loadLevel(n) start() grantSP(n) god(v) applySettings onResize` |
| state readers | `levelInfo() layoutInfo() insertPoint() objState() lightState() enemyInfo() poolInfo() ammo() paintball() weaponAllowed()` |
| driving the player | `teleport(x,z,y) look(yaw,pitch) fire() setWeapon(i) ads(v) hurt(n,src)` |
| world queries | `navPath() navBlocked() groundAt pointBlocked moveCollide depenetrate insideSolid() losClear() probe()` |
| balance | `gateCalc effAbsorb upg applyRanks rankReadout FALL_SAFE ASSIST_ANGLE` |
| perf | `drawCalls() tris() fps()` |
| screens | `Tutorial Armoury Campaign` (each with a `state()` returning a plain object) |

`S.recruit` is the RECRUIT difficulty: off by default, chosen in settings (first row of a new **DIFFICULTY**
section, above CONTROLS), **never pushed after a loss**. It is exactly one line — `if(S.recruit) amount *=
RECRUIT_MUL` with `RECRUIT_MUL = 0.6` — at the top of the non-paint branch of `damagePlayer`, so it scales
rounds, falls and the out-of-bounds dunk alike and the armour bite and the HP bite scale together. A clear
made on RECRUIT is stamped into `Profile.recruit[n]` and the hub card says so.

Two of these deserve calling out because the suites lean on them hard:
- **`probe()`** ray-casts the crosshair and reports what it hits — world object, enemy, part, distance —
  plus weapon state, ADS amount, FOV and spread. It is how a headless test knows what the player is
  actually looking at.
- **`hurt(n, src)`** pushes damage through the **real** `damagePlayer` pipeline and returns `{hp, armor,
  alive}`. That is what let the survival model be validated against the game rather than against itself.

---

## 6. Testing

### The approach

**No puppeteer on this machine.** Headless Chrome is launched with `~/.claude/bin/cdp start --port 9223`
and driven from node over a raw CDP WebSocket. `scratchpad/lib.mjs` is the whole client: connect to
`/json/list`, open the page's `webSocketDebuggerUrl`, `Runtime.evaluate` with `returnByValue`, and collect
`Runtime.exceptionThrown` / `Runtime.consoleAPICalled` / `Log.entryAdded` into an `errors` array. Suites
navigate to the `file://` URL and assert against `window.__game`.

Touch emulation: `Emulation.setTouchEmulationEnabled` **before** navigating, and `touchEnd` needs an
**empty `touchPoints` array**.

Each suite ends with "zero console errors" and most carry **canaries** — assertions deliberately constructed
to fail if the feature under test were absent — because an assertion never proven capable of failing is not
evidence.

> **The suites live in the repo now, at `gms/3d/breachpoint2/tests/`.** For the whole of the original build
> they sat in a session-scoped scratchpad, which meant one closed session would have destroyed the entire
> evidence base for "this game works". `tests/` holds the nine suites plus `lib.mjs` and the two balance
> scripts; `tests/probes/` holds 60 one-off probes; `tests/README.md` carries the measurement discipline.
> **Anything a later phase writes in a scratchpad has to be copied back here.**

### The suites

| suite | checks | covers |
|---|---|---|
| `desktop.mjs` | 7 | the keyboard/mouse path: boot, pointer lock, movement, locked weapons ignoring the 1–4 keys |
| `split_test.mjs` | 40 | the P1.5 file split: `file://` boot, no `type="module"`, load order, and the **draw-call/triangle measurements** for L1 and L8 |
| `p2_test.mjs` | 56 | instruction screen gating, `doubletap` fire, the 8-step drill, paintball rules, rifle-only, level rosters |
| `p3_test.mjs` | 70 | all six tracks on the live player, costs and refunds, the SP economy, weapon unlocks, the threat readout's numbers |
| `p4_test.mjs` | 97 | dock geometry, out-of-bounds, eight lighting presets + AI sight, all four objectives completing **and failing**, boss presentation, the war beat, the hub in both orientations |
| `p4b_test.mjs` | 63 | the five layouts, nav rebake, flood-fill connectivity, reachable spawns, paint reseating, per-level insertion |
| `p4c_test.mjs` | 33 | variant C in `data.js`, the gate arithmetic, the shared survival model, the plating-trap wording |
| `p5_test.mjs` | 26 | derived cadence, model-vs-pipeline on all eight levels, the TTD curve, `TIERS` integrity, the boss latch, profile migration |
| `p5b_test.mjs` | 41 | the draw-call bands, the collapsed material set, the white-fill `mergeGeos` claim, the three detail tiers, **the hit boxes at 40 m**, thrash, bosses, paintball |
| `p5c_test.mjs` | 60 | the debrief tiers, v1→v2 migration, RECRUIT through the live pipeline, the L5 attacker change, the measured `spTarget` curve, the §10 corner fix **and its falsification** |
| `boot.mjs` | 44 | boot over **`file://` and `http://`** in **portrait 390x844 and landscape 844x390**: THREE/BP2/`__game` up, a canvas drawing, zero `type="module"`, the gate fitting the viewport, one tap starting the drill, both hold-drag thumb sticks raising fully on screen, no horizontal page scroll, zero console errors, an error canary in each of the four |

Last recorded full-suite state — the P5d ship run, every suite on its own browser, nothing else on the
machine: **`p5c_test` 60 · `p5b_test` 41 · `p5_test` 26 · `p4c_test` 33 · `p4b_test` 63 · `p4_test` 97 ·
`p2_test` 56 · `split_test` 40 · `desktop` 7 · `boot` 44**, with `p3_test` **69/70** (the documented STEADY
timing flake) and three low-rate flakes characterised in §7 rather than papered over. `split_test` reported
`L1: 46  L8: 134` draw calls at that run.

**One browser on this machine at a time.** Three separate phantom failures in this project have been traced
to a second CDP client or another session's browser sharing port 9223: a `mag 8 → 30` in `p2_test`, a
nonsense `quality:'high'` reading, and a 4 cm miss on the 40 m hit-box sweep. `cdp stop && cdp start`
between suites and run them one at a time.

### The harness traps — verbatim from `PIPELINE.md`

These have cost four different workers hours. They fabricate regressions that are not there.

- **`split_test.mjs` poisons its own draw-call baseline**: it writes `S` to `bp2_settings`, including a
  quality the auto-quality net may have lowered, so run 1 on a fresh browser profile and run 2 measure
  different frustums. Clear `bp2_settings` between runs or pin quality explicitly.
- **`Emulation.setDeviceMetricsOverride` resizes the real headless window and does not self-restore.**
  Snapshot and restore the window bounds, as `p2_test.mjs` does.
- **The auto-quality net is the 112 vs 208 draw-call figure.** `quality:'high'` turns the shadow pass on;
  `_autoQ` drops the page to `low` the moment fps < 34, at a nondeterministic point inside a 1.6 s peak
  sample. P3 measured the **P1 baseline build itself** at 208 and the current build at 112 in the same
  run, then both at exactly **112 / 316** once quality was pinned. `split_test.mjs` now pins
  `S.quality='low'` inside `peakDraw`. Never compare draw calls without pinning quality.
- **A headless window with no CDP traffic throttles `requestAnimationFrame`**, and `dt` is clamped to
  0.06, so the world runs in slow motion and any "hold a key for N ms then measure" check under-reads.
  `desktop.mjs` now polls while the key is held. The game's real walk speed is 4.75 m/s either way.
- **Re-using touch id 1 after a tap the browser never landed** (e.g. one dispatched below the fold)
  makes the NEXT `touchStart` a silent no-op. `p3_test.mjs` uses a fresh id per press.
- **The L8 draw-call figure was never stable and never can be.** 19 rigs are ~14.7 draw calls each
  and they start patrolling the moment the level loads, so a 1.6 s peak sample lands anywhere in
  291–317 on the *same build*. Do not treat a number in that band as a regression. To measure
  anything about the static world, hide every rig first and take the **median**, not the peak —
  a peak sample silently absorbs the delta you are trying to isolate. (P4a lost twenty minutes to
  "the zone marker costs 0 draw calls" when an enemy tag had wandered into the peak.)
- **`Log.enable` replays Chrome's buffered log**, so a CANARY thrown by a previous run can show up
  in a later run's error list. Splice CANARY out again before the final "zero errors" assertion.
- **A dead Chrome reads as a hung suite.** Several sessions share port 9223 on this machine; if another
  `cdp stop` (or the idle-kill) takes the browser out mid-run, `lib.mjs` just blocks on a dead socket with
  no output at all — it looks like an infinite loop in the test. `cdp stop && cdp start` before each suite
  and run them one at a time.
- **A draw-call figure is a function of the camera pose, not just the build.** Now that every level has
  its own insertion point, `loadLevel(n)` no longer leaves the camera where the 112/114 figures were
  measured. Pin the pose (`teleport(1.5,24.5); look(0,0)`) as well as `quality:'low'`, or the number
  moves 30% for no reason. L1 reads 114 posed and 82 at its own insertion point on the same build.
- **A boss-announce test can pass on an announce it did not cause.** `loadLevel(n)` leaves the round
  running, and the boss spawns in front of you, so the banner can fire by SIGHT during the setup sleep —
  the check then "passes" while the latch is broken. Load with `GAME.state='menu'`, park the camera and
  the boss, and only then set `'play'`; assert the banner is shut at t=0 and that the announce took
  **longer than 2 s** (a latch announce cannot be instant, a sight announce cannot be slow).
- **The survival model's cadence is the continuous limit and the game runs in frames**, so a
  frame-stepped Monte-Carlo of the same loop reads ~1% LOW at 60 fps and further below at 30. Assert a
  one-sided band, not equality.
- **Two diagonals prove nothing about connectivity.** The first version of that check passed on four
  layouts and only caught OPEN GROUND by luck of which corner it started in. Flood-fill instead.
- **The permanent world already has small nav pockets — YARD is the baseline, not zero.** Do not chase
  "zero stranded cells"; assert the main component is >=98% and that the level's own insertion point
  reaches all four corners.
- **`NAV.path()` is a lying instrument for "is this point reachable".** `nearestFree()` silently retargets
  a blocked *target* to a free neighbour, so blocking a cell can turn a failing path into a passing one.
  Flood-fill from the source and ask whether the cell is in the component. (`p4b_test` §10 keeps this shape
  on purpose — it is a *player*-reachability check and the retarget is arguably right there — but never
  read its pass as proof of map coverage. `p5c_test` §7 is the coverage check.)
- **`loadLevel(n)` does not rebake NAV if the level's layout is already active** — `setLayout` returns early
  on `id===activeLayout`. A probe that toggles `solids[].off` and then calls `loadLevel` to "refresh"
  measures the **stale** grid. Call `NAV.bake()` explicitly. This made an entire prop-isolation experiment
  read "props make no difference" for twenty minutes.
- **"Keep props a walkable clearance off the walls" makes connectivity WORSE.** Measured: stranded cells per
  layout went from 8-41 up to 11-27 and the corner still failed. A prop pushed to the middle of a gap makes
  two sub-agent-width slots where there was one flush wall. A prop against a wall costs nothing. Reverted.
- **Two screenshots of the same build are not identical.** The post chain moves ~4.6 mean absolute
  difference frame to frame, so any before/after image claim must measure the **before-vs-before floor
  first** or it will "detect" a regression that is only the grain.
- **`updateLod()` runs every frame, so forcing `e.lodTier` from a test is overwritten before the next
  render.** Pin the tier with the game's own lever (`e.boss`), not by poking the field. And a test that
  hides rigs with `e.rig.root.visible=false` still works only because the instanced far mesh is gated on
  `e.rig.root.visible` — the tier machinery hides `rig.body`, never `rig.root`. Do not change that.
- **`__game.probe()` reads `camera.matrixWorld`, which only the render loop refreshes.** `look(); probe()`
  back to back reads the **previous** frame's camera and produces nonsense that looks like a hit-box bug.
  Wait two `requestAnimationFrame`s between them.
- **A test that freezes an enemy and then measures it has not frozen it.** The game loop keeps running: an
  enemy reset to `(0, -20)` reads `(0.0763, -19.9915)` a few frames later. Re-freeze immediately before the
  read, or assert a band. This is the whole of `p5b_test` §4's range flake (§7).
- **Hip-fire spread at 40 m is wider than the torso box**, so a single `fire()` at that range misses about
  half the time and the miss looks like a broken hit path. Go to ADS (spread 0.0028) and fire until one
  lands.
- **CDP wants every active touch point in each `Input.dispatchTouchEvent`, not just the new one.** Sending
  a second `touchStart` with only the second finger drops the first, intermittently — which reads as "the
  thumb stick did not appear". `boot.mjs` drives one finger at a time for exactly this reason.
- **Distrust the harness before the code when a number moves for no reason.**

And the one that has now cost three separate phantom failures, so it is stated last and plainly: **two
headless WebGL contexts software-rendering on this machine corrupt each other's draw-call and timing
numbers.** Never run a browser-driving worker alongside a perf-measuring one. Two workers may run concurrently only if
neither pair is (a) both editing `js/engine.js` or (b) both driving a browser.

---

## 7. Known flakes, and which are pre-existing

| flake | verdict | evidence |
|---|---|---|
| `p3_test` §3 "STEADY rank 5 widens the assist cone" | **pre-existing, ~1 run in 5, both arms** | P4b measured it 12 ways in isolation. As written, 4 of 6 passed; the failures were the **rank-0** arm acquiring a target 0.42 rad off a 0.28 cone (readings 0/0/0/0/0.42/0.42). With the target pinned 300 ms before the look, 5 of 6 passed and rank-0 read 0 every time — but one **rank-5** arm then failed to converge. `RANKS.assist` read 1.00 / 2.50 correctly in **all twelve** runs, so the feature is fine. The cause is the window: the check gives the assist 900 ms and convergence is `k = dt*(6.5*strength+1.2)`, which at the 20–40 fps this headless renderer manages is only ~20–35 frames — marginal at both ends. **Fix the test** (convergence loop with a deadline, pin the target before aiming). **Do not change the game for it.** |
| `p3_test` §4 "MARKSMAN rank 5 really does 1.50x damage" | **pre-existing, same family, seen once** | `dmg5` came back `null` (120 attempts, no landed shot) while the rank-0 arm read 23 HP in the same run; passed next run on identical code. It depends on a live enemy staying alive and in front of the muzzle at 20–40 fps. |
| `p4b_test` §10 "from every level's insertion point the whole yard is walkable" | **was a real defect; FIXED at the cause by P5c** | Two defects stacked. **The map:** OPEN GROUND's `[23.2,20]` block left a 1.75 m diagonal mouth into the SE quay corner, of which only ~0.87 m was walkable after NAV's `AGENT_R` 0.44 inflation — narrower than the 1.66 m band one barrel blocks — and `barrelStack(24.0,24.5,4)` scatters into exactly that mouth. Neither the containers nor the barrels caused it alone; the **conjunction** did, 5 rolls in 6. The player's collision radius is *under* the nav inflation, so he could walk into a corner nothing could follow him into. **The instrument:** `navPath()` runs `nearestFree()` on its *target*, so a barrel landing on the target cell silently retargeted the search to a reachable neighbour and the check passed — which is why a 5-in-6 defect presented as a 1-in-3 flake. Fixed in the layout (`[23.2,20] → [23.2,18]`, a 3.75 m mouth with ~2.87 m walkable) and measured by flood fill in `p5c_test` §7, which falsifies itself by putting the old block back. **A "flaky" test is a hypothesis, not a diagnosis.** |
| `p4_test` §8 "the boss announce banner appears, by NAME" | **was pre-existing; FIXED in the game by P5a** | It failed 2 of 4 P4c runs on *identical* code. P4c falsified it properly: the same isolated probe failed **5/5 with the pre-P4c `data.js` restored**, which proved it had nothing to do with the balance change. The real cause was a **gameplay** bug — `announce()` fired only on the frame `bossOnScreen()` first turned true, so a player who never looked at the boss was never told there was one, which on the night and fog levels is likely. P5a latched the announce (first sight **or** 3 s alive within 42 m) and `p4_test` went to 97/97. |
| `p5b_test` §4 "and it lands at the same range to the centimetre" | **harness artefact, diagnosed in P5d, ~1 run in 2** | The headline claim it sits under — *every* sampled ray hits the same part in both LOD states, at the same pitch, and a real fired round does 21.6365 vs 21.6364 damage — passes every time. Only the *range* readout disagrees, by 2-11 cm. P5d re-ran the same sweep logging the enemy's position at each read and caught it: between the check's `freeze` and its `probe()` the enemy had drifted to `x 0.0763, z -19.9915` — **7.6 cm, in the frames the game keeps running**. Sampled at three fixed pitches with no time in between, the two states give byte-identical distances and `scaleY`, `epos` and the camera all match. The tolerance is 1 cm against a target the test does not actually hold still. **Fix the test** — re-freeze immediately before the read, or drop the redundant range clause; the hit boxes are proven not to move by the other four assertions in the same section. |
| `p5c_test` §0 "the error collector can see a thrown error" | **start-up race, 2 of 4 P5d runs** | The canary is thrown ~280 ms after a navigate + 2.8 s settle, and on a browser that has just been started the `Runtime`/`Log` subscription is occasionally not yet delivering. It passes on the following run on identical code, and every *other* canary in the same suite fires. Give it a retry-with-deadline rather than a single 280 ms sleep. |
| `p5c_test` §7 "all four corners are reachable from every insertion point" | **a REAL defect, rare, characterised in P5d — see §9.6** | This is the `navPath` sub-check, not the flood-fill coverage check beside it (which passed 5/5 on every run, with its falsification). The signature is always the same: **L5, all four corners at once**, which is what a blocked *source* looks like. P5d flood-filled it: on those rolls L5's insertion point (24, 18) is in a component that is **1.02% of the free grid** — a 41-cell pocket in the quay strip. Measured rate **4 in 222 prop rolls (~2%)**. Not a test bug. |
| `pickPatrol` null-deref killing the round | **pre-existing in form, exposed by P4b** | It samples 8 random free cells and keeps the farthest **under 42 m**; an enemy spawned in a far corner can have all eight land past 42 m and `best` stays null. The function is not P4b's, but P4b's per-level insertion points changed where enemies start, which is what decides how often it is hit. It killed one `p4b_test` run and not the three before it. Fixed by keeping the nearest sample as a fallback. |
| `scratchpad/test.mjs` | **dead** | Renamed `test.mjs.stale-orphan-p1`. It asserted `L8 maxAttackers = 6`, which has not been true for two phases. `split_test.mjs` supersedes it. |
| L8 draw calls anywhere in 291–317 | **not a flake, physics of the measurement** | See the trap above. |
| L7's boss banner naming a specific boss | **will flake by design** | L7 fields **two** bosses and both announce; the banner names whichever fired last. That is correct behaviour. A test asserting one specific name there is wrong. |

---

## 8. What is deliberately not done

All of it is specced in `IMPROVEMENTS.md`. None of it is blocked on anything; it was scope, not difficulty.

- **Story mode beyond the war beat.** The radio system, the three voices (PARK / CPL VANCE / CONTROL) and
  the paint-persistence trick all exist and work. What exists is **Act I's turn only** — the six-line
  conscription beat. Acts II–IV, the PARK callback late in Act III, and the epilogue are written as beats in
  `IMPROVEMENTS.md` "P6 — STORY MODE" and not implemented. The delivery mechanism is done; the script is not.
- **THE RANGE.** The paintball park was supposed to stay open forever as the place you go to find out what a
  rank is worth — spar any tier you have met, in paint, no fail state, with a TRY IT button on every armoury
  row. It is the cheapest large feature left (it reuses level 0 wholesale) and the **stuck-player flow
  depends on it**. Full spec in `IMPROVEMENTS.md`. Not started.
- ~~**The stuck-player debrief and RECRUIT mode**~~ **done in P5c** — see §4.3 and `§STUCK`. The one part of
  it still missing is the THE RANGE pointer in the tier-3 line, because THE RANGE does not exist yet.
- **Endless balance.** `LEVELS[9]` is a marker with `light:'rotate'` and `layout:0`. Nobody has balanced it,
  it uses the YARD layout every round, and its `spTarget` is a copy of L8's. The designed shape (tier ladder
  by wave, a boss every 5th, escalation by per-wave damage/`apPen` scalar and **never** by more bodies) is
  in `IMPROVEMENTS.md`.
- **Commissions** — rotating date-seeded modifiers on cleared levels, so the difficulty valve is interesting
  rather than a grind.
- **Music.** The audio is entirely procedural Web Audio, which is right for guns and wrong for a theme. The
  one idea worth building around is written down: the mundane, slightly naff L0 paintball-park theme
  returning in the epilogue, slower and in a minor key. Constraints are recorded (generate locally,
  <~1.5 MB total, lazy-load, **never block boot**).
- **Loadout choice** (pick 2 of 4 weapons) and the **codex / dog tags**, both post-ship.
- ~~**Perf.**~~ **done in P5b** (§9). L8 landed at 128-142 against a 120-150 target.
- **Shipping.** The screenshot exists (`/assets/screenshots/breachpoint2.jpg`) and the game is committed
  locally, but there is **no `projects.js` entry and nothing is pushed**. `LISTING.md` holds the draft entry
  and it explicitly says **do not add it until Aaron has played it on a phone**. That is not a judgement
  call for the next worker either.
- **The L5 quay-strip spawn pocket** (§9.6). Found and measured in P5d, deliberately not fixed during ship
  prep: it is a ~2% prop-roll defect in world geometry that predates every phase that found it, and fixing
  it means editing `js/engine.js` and re-running five suites for a build that is about to be played by hand
  rather than shipped to anyone.

---

## 9. What looks wrong or surprising in the code right now

**Re-checked at the close of P5d.** The first draft of this section was written blind, while P5b held
`js/engine.js` and no browser was allowed to run, and it flagged five things "to check, don't assume".
Four of the five are now resolved and are recorded here as resolved rather than deleted, because what they
were and how they were settled is the useful part. One new one has been added.

**9.1 — RESOLVED. `applyTier()` against the collapsed `EMAT`.** The worry was that `applyTier()` still
traversed the rig for `o.userData.baseMat`, compared against `EMAT.vest` / `EMAT.vest2` which the new
`EMAT` no longer defines, and called `EMAT_BOSS.get(base)` on what had become a plain object — in which
case the boss tint and the paintball bib colours would be **silently lost**, not thrown. They are not.
`p5b_test` asserts the boss tint **off the rig material rather than the name tag**: a boss reads
`color 0xff8a72` / `emissive 0x531008` against a grunt's `0xffffff` / `0x000000`, on a different material
instance, and P4a's shape-first tag identification is intact (chevron alpha 235 vs 0, tag coverage 9805 vs
5258). The drill's targets still each wear a bib in a distinct `PAINT.targets` colour on an emissive
material, and nothing in the drill LODs even parked 47 m away.

**9.2 — STILL TRUE, and deliberate. The paintball bib is on its own render path.** `e.bibMat` is a plain
`MeshLambertMaterial` with no `vertexColors`, so the bib is the one rig mesh not drawn through `EMAT.rig`.
That is on purpose — the bib wants its emissive — but it means the drill costs one extra draw call per
target (six targets, all close: 6 calls) and the bib cannot be folded into the torso the way the normal
webbing is. The torso underneath swaps to a webbing-free geometry so nothing z-fights.

**9.3 — RESOLVED. `LEVELS[5].maxAttackers` is 4.** P5c applied the coordinator's call and re-ran the curve;
see §4.3.

**9.4 — RESOLVED. `LEVELS[8].spTarget` is 8,000, not 11,000.** P5c *measured* what a clean first playthrough
pays instead of estimating it (§4.3). P5a's 7,300 turned out to be the clear bonuses only; with kills,
bounties and the flawless row counted a clean run pays **16,140**, so the old 11,000 was technically
earnable at 89% of a perfect run — which in practice meant the hub said "under-equipped" for the whole
campaign. Every target is now ~65% of the running total. ENDLESS copies L8's 8,000, which is still
meaningless (it escalates per wave, so no single number describes it) and should probably print no
recommendation at all.

**9.5 — RESOLVED. The suites are in the repo.** `tests/`, nine suites and 60 probes. See §6.

**9.6 — NEW, and the one open defect in the game. L5's insertion point can be sealed into a 41-cell
pocket by the random prop scatter.** `LEVELS[5].insert` is `(24, 18)`, which is inside the quay strip —
the corridor between the QUAY WALL container line at x≈20 and the kerb at x≈25.8. Flood-filled from that
point over 222 fresh prop rolls, it lands in a component that is **1.02% of the free grid on 4 of them
(~2%)**; the distribution is bimodal, either 1.0% or 98.8%, never marginal. What walls it in, measured on a
failing roll: the kerb east, the container line west, **two crane legs 1.20 m apart** at z≈15.6 to the
south, and to the north a barrel from `barrelStack(24.0, 24.5, 4)` landing beside a bollard. It is the same
`barrelStack` P5c caught plugging the SE quay corner, scattering into the same corridor from the other end.
Consequences, in order of how much they matter: `spawnPoints()`'s A* to the insertion point rejects almost
every candidate and falls through to its last try, so the roster spawns somewhere it cannot path to you;
the props are `climb:true`, so the player can very probably mantle out, which is the difference between a
wart and a soft-lock and **has not been verified** — the seal could not be reproduced on demand. It is not
a P5b or P5c regression: the props, the corridor and the crane legs all predate them, and P5c's own §10
fix was the other end of the same corridor. **The lever, if someone takes it, is `barrelStack(24.0, 24.5, 4)`
in `§WORLD` or L5's insertion point — not the nav inflation, and not a clearance margin around props**
(that was tried in P5c and measurably made connectivity worse; see `PIPELINE.md`).

The two things the first draft could not determine are now determined:

- **It boots.** `node --check` is clean on all six JS files, and `boot.mjs` proves the page comes up over
  **`file://` and `http://`**, in **portrait and landscape**, with zero console errors in all four and an
  error canary in each proving the collector was alive. The only 404 anywhere is `/favicon.ico`, which is
  the browser's own request and never happens over `file://`.
- **P5b landed inside its target, and the hit boxes did not move.** L1 114 → 46-55, L8 302 → 128-142
  (target 120-150), and the "`rayTest()` works from `e.pos`/`e.yaw`/`e.scaleY()`" comment is now a test:
  37 rays across a frozen enemy at 40 m hit the identical part in both LOD states, head/torso/leg
  discrimination survives the swap, and a real round fired at the instanced far enemy does 21.6365 damage
  against the articulated rig's 21.6364. It was falsified three ways — patch `rayTest` to follow the drawn
  mesh and the far enemy becomes unhittable; drift the far hit box 1 m and the sweep shifts; restore it and
  it matches again.

And the third is still open, which is the whole point of `docs/PLAYTEST.md`:

- **How it feels.** Nobody has played this game.

## 10. The lessons this build produced

Stated plainly, because each one cost somebody hours.

**Re-confirm interrupted work.** P4b was cut off by a usage limit after recording its numbers but before its
final sweep completed. The numbers were real; the sweep was not finished. P5a's first action was to re-run
it — and it **crashed**, on a `pickPatrol` null-deref that kills the round and fires only sometimes (one run
in four). A recorded pass count from a completed-looking phase can hide a crash that only fires sometimes.
Interrupted work is not "probably fine"; re-run it.

**Falsify every check.** A sweep built from an assertion never proven capable of failing is not evidence.
This is the rule that turned the boss-banner flake from a mystery into a fix: P4c ran the same isolated probe
against the *pre-change* `data.js` and watched it fail 5/5, which proved the flake predated the change — and
that pointed at the real defect, which was in the game, not the test. Every suite here carries canaries for
the same reason. The corollary: **do not "fix" a flaky check by making it try harder** (sweeping the camera
until it finds the boss) — that hides the defect the flake was reporting.

**Distrust the instrument before the code when a number moves for no reason.** Two examples, both of which
looked like real regressions:
- The **112 vs 208 draw calls**. It was the auto-quality net: `_autoQ` drops the page to `low` mid-sample at
  a nondeterministic moment. P3 measured the *P1 baseline build itself* at 208 and the current build at 112
  in the **same run**, then got exactly 112 / 316 from both once quality was pinned. The earlier "112 every
  run" readings were luck, not stability.
- The **visibility metric that read 0% for two different layouts and passed**. The first version of the
  ray-traced sightline check aimed its samples at x = 10, which sits inside the YARD corridor rows, so YARD
  and THE STACKS both scored 0% and the check passed without distinguishing them. Sampling the whole yard
  gave 39% and 1% — an enormous real difference the instrument had flattened. A metric that measures a
  different quantity well is more dangerous than one that measures the right quantity badly, because its
  believable rows are believable.

**A "flaky" test is a hypothesis, not a diagnosis.** `p4b_test` §10 was dismissed as intermittent twice
before P5c took it apart and found *two* defects stacked: a real one-way pocket in the map, and an
instrument (`navPath`, which retargets a blocked destination through `nearestFree()`) that turned a 5-in-6
failure into a 1-in-3 flake by sometimes passing on a search it had not made. The same shape came back in
P5d: `p5c_test` §7's `navPath` sub-check failing on L5 turned out to be a genuine 2%-of-rolls spawn pocket
(§9.6), sitting underneath a noisy instrument, while `p5b_test` §4's range clause failing at 2-11 cm turned
out to be the enemy drifting 7.6 cm between the test's own freeze and its read. **Both had to be measured
to tell them apart, and "it passed on the re-run" would have told you nothing about either.**

**A model is a guide, not evidence.** The survival model in this game was wrong **three separate ways** and
the game was right every time: a flat fire cadence that understated late close-range fire by up to 78%; no
armour pool, which made the L1 headline print 229 s against a real 53.8 s; and an optimiser that chose
builds against raw absorb rather than the real `gateCalc`. Each was found by running the *real* pipeline —
driving rounds through `damagePlayer` one at a time with the game's own update loop running — and comparing.
The model is now within 4.0% on all eight levels and is always on the pessimistic side. **When the model and
the game disagree, the game is right, and the model gets re-derived.** The one constant still invented is
`HIT_RATE = 0.6`; it is flagged everywhere it matters, and because it scales every level equally, the
*shape* of the curve survives it.
