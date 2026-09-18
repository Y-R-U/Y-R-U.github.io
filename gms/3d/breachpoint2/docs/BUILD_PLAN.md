# BREACHPOINT II — build plan

Single HTML file at `gms/3d/breachpoint2/index.html`, cloned from `gms/3d/breachpoint`.
Same map (warehouse/shipping yard), same engine, same `§ANCHOR` navigation.
**No build step. three.js r128 from `../../lib/three/r128/three.min.js` (local, NOT a CDN).**

## READ THIS FIRST (rules for every worker)

1. **Never read the whole file.** It is ~4.6k lines. `grep -n '§NAME'` to find a section,
   then `sed -n 'A,Bp'`. Edit with `sed`/`python3` patches or the Edit tool on exact strings.
2. **Keep the `MAP OF THIS FILE` table of contents at the top in sync** with any new `§ANCHOR`.
3. **Keep `window.__game` working and extend it** — the headless tests drive the game through it.
4. Mobile-first. Nothing may require a keyboard. Aaron plays on a phone.
5. **Popups are screens, never `alert()`.**
6. Comments: far fewer than you think. Only where the code is genuinely non-obvious.
7. After your phase, boot the page headless and confirm zero console errors before reporting.

## What this game is

Breachpoint was one 3-minute round against ten hostiles. Breachpoint II is a campaign:

- You start in a **paintball training yard** with **2 targets** and **only the rifle**.
- The game **starts paused on an instruction screen** that teaches the mobile controls.
- Training earns **SP** (service points) you spend on **RPG-lite upgrades**.
- After enough training, **war breaks out**, you are conscripted, handed a live rifle, and
  told to take the dock.
- **Level 1 is the same dock, live.** You replay a level until you can win it; replaying
  earns SP, so grinding is the difficulty valve.
- Levels get markedly harder. **Upgrades gate that difficulty** — see ARMOUR GATE below.
- Most levels from L2 on have a **boss**: the same NPC rig, slightly bigger, red rim glow.

## ARMOUR GATE — the central balance mechanism

This is the thing Aaron explicitly asked for: "shields may make you almost invulnerable in
level 1, but in level 2 they can still hit you easily". It is implemented as **armour
penetration per enemy tier**:

```
effAbsorb = clamp(PLATING.absorb - enemy.apPen, 0, 0.92)
absorbed  = min(player.armor, dmg * effAbsorb)
player.armor -= absorbed
player.hp    -= (dmg - absorbed)
```

Armour regenerates at `PLATING.regen`/s after `PLATING.delay` s without taking damage.

| PLATING rank | pool | absorb | delay | regen/s | cost |
|---|---|---|---|---|---|
| 0 | 50  | 0.50 | 6.0 | 0  | — |
| 1 | 90  | 0.58 | 5.2 | 8  | 150 |
| 2 | 140 | 0.66 | 4.4 | 12 | 350 |
| 3 | 200 | 0.74 | 3.6 | 16 | 700 |
| 4 | 270 | 0.82 | 2.8 | 22 | 1300 |
| 5 | 350 | 0.90 | 2.0 | 30 | 2200 |

| Enemy tier | hp | dmg | apPen | dmgTakenMul | accuracy | reaction s |
|---|---|---|---|---|---|---|
| `paint`    | 60  | 5  | 0.00 | 1.00 | 0.30 | 1.10 |
| `militia`  | 80  | 9  | 0.00 | 1.00 | 0.42 | 0.85 |
| `regular`  | 100 | 14 | 0.15 | 1.00 | 0.55 | 0.65 |
| `veteran`  | 130 | 19 | 0.30 | 0.90 | 0.66 | 0.52 |
| `shock`    | 170 | 25 | 0.45 | 0.82 | 0.76 | 0.42 |
| `praetor`  | 220 | 32 | 0.60 | 0.74 | 0.85 | 0.34 |

Boss = its tier with `hp×2.2`, `dmg×1.25`, `apPen +0.10`, `dmgTakenMul ×0.85`, `scale 1.18`,
red emissive rim + a name tag in red. Head shots still multiply, so a boss is a marksmanship
test, not a bullet sponge.

**Verify the gate holds** (a balance worker must assert these numerically):
- PLATING 5 vs `militia`: effAbsorb 0.90 → 0.9 HP per hit against 30/s regen → effectively
  invulnerable on L1. **Intended.**
- PLATING 5 vs `shock`: effAbsorb 0.45 → 13.75 HP per hit. Dangerous.
- PLATING 5 vs `praetor`: effAbsorb 0.30 → 22.4 HP per hit. Three hits is most of your health.
- PLATING 0 vs `militia`: ~9 HP per hit once the 50 pool is gone → 11 hits to die.

## Upgrade tracks (6 tracks × 5 ranks, costs 150 / 350 / 700 / 1300 / 2200)

| Track | Rank 0 → 5 |
|---|---|
| **VITALITY** maxHp | 100, 125, 150, 180, 215, 260 |
| **PLATING** | see table above |
| **MARKSMAN** damage × | 1.00, 1.08, 1.17, 1.27, 1.38, 1.50 |
| **STEADY** assist angle ×, spread × | 1.0/1.0, 1.25/0.94, 1.5/0.88, 1.8/0.82, 2.1/0.76, 2.5/0.70 |
| **LOGISTICS** mag ×, reserve ×, reload × | 1.0/1.0/1.0, 1.1/1.2/0.94, 1.2/1.4/0.88, 1.35/1.6/0.82, 1.5/1.9/0.76, 1.7/2.2/0.70 |
| **MOBILITY** sprint ×, extras | 1.0, 1.05, 1.10 (+double jump), 1.16, 1.22, 1.30 (+fall-damage immunity) |

Full clear of every track = 28,200 SP. That is the long tail; nobody needs it to finish.

### SP economy
- kill `10 × levelMul`, headshot `+6`, boss kill `+120`
- first clear of a level: `250 × level`; replay clear: `100 × level` (40%)
- accuracy bonus up to `+60`, flawless (no damage taken) `+100`
- training completion: `+300`

### Weapon unlocks (bought with SP, gated by level reached)
| Weapon | Unlocks at | Cost |
|---|---|---|
| K-7 CARBINE (rifle) | start | — |
| VP-9 SIDEARM | L1 clear | 400 |
| M-90 BREACHER (shotgun) | L3 clear | 1200 |
| LR-50 LONGBOW (sniper) | L5 clear | 2600 |

## Level table (one map, re-lit and re-populated)

| # | Name | Objective | Roster | Time | Light | MAX_ATTACKERS |
|---|---|---|---|---|---|---|
| 0 | TRAINING GROUND | paintball: 2 downs + tutorial steps | 2 × `paint` | none | day | 1 |
| 1 | THE DOCK | capture: clear dock zone, then hold it 20 s | 5 × `militia` | 4:00 | day | 2 |
| 2 | CONTAINER ROW | eliminate all | 6 × `regular` + boss SERGEANT | 3:30 | overcast | 2 |
| 3 | THE OVERLOOK | hold the parapet 45 s | 9 × `regular` + boss | 3:30 | dusk | 3 |
| 4 | NIGHTFALL | eliminate all | 9 × `veteran` + boss WARDEN | 3:30 | night | 3 |
| 5 | SUPPLY LINE | two waves, eliminate all | 12 × `veteran` + boss | 4:00 | day+haze | 4 |
| 6 | THE SIEGE | survive 3 waves | 14 × `shock` + boss ARBITER | 4:00 | dusk+fog | 4 |
| 7 | BLACKOUT | eliminate all | 14 × `shock` + 2 bosses | 4:00 | night+fog | 5 |
| 8 | BREACHPOINT | eliminate all + THE MARSHAL | 18 × `praetor` + final boss | 5:00 | storm | 6 |
| ∞ | ENDLESS | after L8, escalating waves | scaling | — | rotates | 6 |

Soft power targets (SP *spent* that should make a level fair, not a hard gate — a player who
replays can always out-grind it): L1 0, L2 300, L3 800, L4 1800, L5 3200, L6 5000, L7 7500,
L8 11000.

## Phases — ONE worker at a time, in this order

### P1 — Foundation
Rebrand to BREACHPOINT II. Make everything currently hardcoded to "ten hostiles" data-driven
from a level definition. Add the profile/save layer and the new damage model.
- `§PROFILE` — localStorage `bp2_profile`: `{sp, spent, level, cleared:{}, ranks:{}, unlocked:[], trainingDone, stats}`; load/save/reset.
- `§LEVELS` — the `LEVELS` table and `TIERS` table above as data. `Enemies.init()` must build
  to the largest roster (20) and `reset(levelDef)` activates only what the level needs.
- Enemy tier fields (`hp/dmg/apPen/dmgTakenMul/accuracy/reaction`) drive the existing AI —
  find where enemy damage, reaction and accuracy are currently constants and route them
  through the tier. `MAX_ATTACKERS` becomes per-level.
- Boss support: `e.boss` → `scaleY`/scale 1.18, red emissive rim, red name tag, tier buffs.
- New `damagePlayer` using the armour-gate formula + armour regen in `updatePlayer`.
- `HUD` kill counter reads the level roster, not `/ 10`.
- `window.__game` additions: `profile`, `loadLevel(n)`, `grantSP(n)`, `levelInfo()`.
- Everything still boots and L0/L1 are playable with placeholder flow.

### P2 — Training, instructions and mobile controls
- **Boot into a paused instruction screen** (`§TUTORIAL`) before anything moves. Cards for
  the mobile scheme, laid out for a phone in portrait AND landscape.
- **New default touch mode `'doubletap'`**: drag or hold on the right half = look;
  **double-tap the right half = fire**; hold the second tap down to keep firing.
  Keep `twofinger` and `tapfire` as settings options. `lookStyle:'hold'` stays default —
  swipe-only looking was rejected once already.
- **Interactive tutorial** in L0: a step list that advances only when the player does the
  thing (move, look, fire, hit a target, reload, switch to ADS, down a target). Each step
  shows one short instruction; the round cannot be failed.
- **Paintball mode**: `GAME.paintball` — paint splat decals and puffs instead of blood,
  paint-tinted tracers, targets wear bright bibs, hits register as splats, the player cannot
  die (a paint hit just flashes and costs accuracy). Rifle only; weapon buttons hide the rest.
- Training completes on 2 downs + all steps → award 300 SP → hand off to P4's war beat
  (for now: a placeholder screen saying WAR DECLARED).

### P3 — Progression
- `§UPGRADE` — the upgrade/armoury screen. Reachable from the hub and from the debrief.
  6 track rows with 5 pips each, cost, BUY button, live "what this does" line.
  Mobile-first: big tap targets, vertical scroll, no modals.
- Apply ranks at `startRound()`: `player.maxHp`, armour pool/absorb/delay/regen, weapon damage
  (`MARKSMAN`), spread and aim-assist (`STEADY`), mag/reserve/reload (`LOGISTICS`), sprint /
  double jump / fall damage (`MOBILITY`).
- Weapon unlock purchases; locked weapons must not appear in the weapon buttons or the 1–4 keys.
- SP award breakdown on the debrief screen, itemised and animated up.
- Persist through `§PROFILE`. A RESET PROGRESS button, behind a confirm screen, in settings.

### P4 — Campaign flow, levels and bosses
- `§CAMPAIGN` — the hub/level-select screen: level cards with name, objective, recommended
  power, best time, clear state, and a REPLAY vs NEXT distinction. Locked levels show what
  unlocks them.
- The **war beat**: after training, a full-screen sequence (text over the yard with the light
  changing) — war declared, conscription notice, rifle issued, take the dock. Skippable.
- Objectives: `eliminate`, `capture` (clear a zone then hold it N s), `hold` (stand in a zone
  N s under pressure), `waves`. A zone marker in the world + on the minimap + a progress ring.
- **The dock zone**: the existing map has no dock. Add one at the east end — quay edge, water
  plane beyond the fence, two cranes, mooring bollards, stacked containers on the quay. Keep
  it cheap: boxes and cylinders, same texture set, merged into the existing buckets.
- Lighting presets per level (day / overcast / dusk / night / haze / fog / storm) driving sun
  colour+intensity, ambient, fog colour+density and the grade in `§RENDER`.
- Bosses: spawn last, announce with a banner, red rim, larger tag, a health bar across the
  top while visible.
- Wave spawning for `waves` levels.

### P5 — Balance, tests, polish
- Headless CDP suites under the scratchpad (see the `cdp start` recipe): a desktop suite and a
  mobile touch suite. Assert: boot with no console errors, the instruction screen blocks play,
  the double-tap fire mode fires, training completes, SP is awarded and persists, upgrades
  apply to the live player, the armour gate numbers above hold exactly, every level loads and
  its roster spawns, bosses spawn with the right stats, each objective can complete.
- A pure-numbers balance check (no browser): time-to-kill and time-to-die per level at the
  soft power target, printed as a table. Tune until each level is losable at rank 0 and
  comfortably winnable at its soft target.
- Perf: keep draw calls near the original on the biggest roster. Check `__game.drawCalls()`.
- `docs/HANDOFF.md`, a screenshot, and the `projects.js` registration.

---

## FILE LAYOUT (decided after P1 — supersedes "single file" above)

The game is **multi-file, using plain classic `<script>` tags**. It is NOT ES modules and must
never become ES modules: `type="module"` is blocked by CORS over `file://`, and these games are
opened straight off disk (the CDP tests navigate to a `file://` URL). Classic scripts also dodge
the stale-module-cache failure mode that has silently hung two other games on their loading screen.

```
index.html      250   HTML skeleton + <script> tags only
css/game.css    445   all styles (§CSS-HUD / §CSS-TOUCH / §CSS-SCREENS / §CSS-INTRO /
                      §CSS-ARMOURY / §CSS-CAMPAIGN)
js/data.js      108   TIERS, LEVELS, UPGRADES, weapon unlock ladder — pure data, NO dependencies
js/profile.js   123   localStorage profile, SP economy, the shop (buyRank/buyWeapon/respec), upg()
js/engine.js   5072   the inherited engine IIFE, § anchors intact (+ §RANKS §LIGHT §OBJECTIVES)
js/tutorial.js  319   instruction overlay + interactive tutorial steps            (P2, landed)
                      §CARDS / §STEPS / §INTRO / §RUN — publishes BP2.Tutorial
js/armoury.js   256   upgrade screen, threat readout, respec, reset confirm       (P3, landed)
                      §THREAT / §TRACKS / §WEAPONS / §CONFIRM — publishes BP2.Armoury
js/campaign.js  365   radio beat, objective HUD, boss banner/bar, campaign hub    (P4a, landed)
                      §RADIO / §WAR / §OBJHUD / §BOSS / §HUB — publishes BP2.Campaign
```

Load order in `index.html` is three.js, `data.js`, `profile.js`, `engine.js`, `tutorial.js`,
`armoury.js`, `campaign.js`. `campaign.js` is last because it wraps `GAME.start` / `GAME.end`
and reads `BP2.Armoury` for the threat readout.

`upg()` lives in `profile.js`, not `data.js`: it reads the live profile, so putting it in the
dependency-free table file was a layering inversion that only worked through a lazy global lookup.

**Load order is the dependency order.** `data.js` and `profile.js` publish onto a single global
`window.BP2` before `engine.js` runs, so the engine IIFE can read them directly. `campaign.js` and
`tutorial.js` load last and drive the engine through `window.__game`, which already exists as the
test surface — extend it rather than inventing a second one.

**The inherited engine is not refactored.** It moves to `js/engine.js` verbatim, keeps its one
enclosing IIFE and its `§ANCHOR` map, and only ever receives surgical hook edits. Unpicking 4.5k
lines of working closure-scoped game code into modules is plumbing risk with no payoff. All new
growth goes in the new files.

### P1.5 — the split (mechanical, runs between P1 and P2)
Move code out of `index.html` into the files above with **zero behaviour change**. Success is
"boots identically, no console errors, and every P1 test still passes with the same numbers".
Anything that looks like it wants a redesign during the split is out of scope — note it and move on.

---

# P4 SPEC (written from the real world geometry — split into P4a and P4b)

P4 as originally scoped is too big for one worker. Split it.

## Map facts (verified in `js/engine.js` §WORLD)
- `MAP_HALF = 30`. Player spawns at **(1.5, 0, 24.5)** facing **−Z**.
- Two-storey building + ramp + parapet sniper nest: **west**.
- Container corridor: rows at **x = 8.4** and **x = 14.6**; scattered singles elsewhere.
- Vehicle wreck at **(−3.4, −2.2)** with a walkable roof.
- Containers are placed by `container(x, z, stack, rotY, ci)` calls — **already a data-driven
  call list**, which is exactly what P4b needs.
- Lighting today: `sun` `0xfff0dd @1.5`; `HemisphereLight 0xbdd3e0/0x3a3630 @0.85`;
  `AmbientLight 0x5a6166 @0.32`; `scene.fog = Fog(FOG_COL, 26, 96)`; `renderer.setClearColor(FOG_COL)`.

---

## P4a — hub, war beat, objectives, the dock, lighting, boss presentation

### The dock is PERMANENT geometry, not per-level
Simpler and lower-risk than conditional building, and it improves every level. The yard becomes a
dock-side yard; L1's objective is to capture the quay that has been there all along.
- **Quay**: concrete deck x **22 → 26**, full z span, level with the yard, with a **0.4 m kerb** at
  x = 26 so you cannot walk off by accident.
- **Water**: flat plane at **y = −1.2**, x from 26 out to ~120, dark blue-green, existing fog hides the
  far edge. Keep it cheap — no custom shader, no reflections.
- **Out of bounds**: if the player does get into the water, teleport back to the quay with minor damage.
  Handle it explicitly or it is a bug.
- **Two gantry cranes**: legs + a boom over the water + a trolley. Landmarks, **not climbable**
  (the parapet is the sniper perch and should stay the only one). Solid so bullets stop.
- **Mooring bollards** along the kerb as low cover; container stacks on the quay via `container()`.
- The east perimeter fence is replaced by the quay edge.

### Lighting presets (concrete — derive from the day values above)
| preset | sun | hemi | ambient | fog col | fog near→far |
|---|---|---|---|---|---|
| `day` | `0xfff0dd` 1.5 | `0xbdd3e0/0x3a3630` 0.85 | `0x5a6166` 0.32 | current | 26 → 96 |
| `overcast` | `0xdfe4e6` 0.75 | `0xc4ccd2/0x3a3a38` 0.95 | `0x6a7075` 0.40 | `0x9aa3a8` | 20 → 80 |
| `dusk` | `0xff9d5c` 1.05 low angle | `0x8a6f7a/0x2a2620` 0.55 | `0x4a4048` 0.30 | `0x6d5560` | 22 → 85 |
| `night` | `0x7a93c8` 0.32 | `0x2c3a52/0x141618` 0.35 | `0x2a3038` 0.22 | `0x0e131a` | 16 → 60 |
| `haze` | `0xffe9c8` 1.25 | — | `0x6a6560` 0.40 | `0xc9bda6` | 14 → 52 |
| `fog` | `0xcfd6d8` 0.55 | — | `0x606a70` 0.42 | `0x8d979c` | **8 → 34** |
| `storm` | `0x9fb0c0` 0.60 | — | `0x3e464e` 0.30 | `0x4a5359` | 12 → 44 + lightning |

Storm lightning reuses the **existing** `_postParams.flash` uniform (already there for hurt) plus a
brief sun-intensity spike. Do not add a post pass.
**Never add or remove lights at runtime** — the file already warns about this; mutate intensity/colour
on the existing light objects.

### Fog must cut BOTH ways
On `fog` and `night`, shorten the **enemy** sight range and the player's aim-assist `maxDist` to match
the fog far value. Fog that only limits the player is a filter over the screen, not a mechanic.

### Objectives
`eliminate` | `capture` (clear a zone, then hold it N s) | `hold` (stand in a zone N s under pressure) |
`waves` (N waves, each spawning on the last one's death). A zone needs: a world marker (a cheap
ground decal + corner posts), a minimap overlay, and a progress ring on the HUD. Capture/hold progress
must **pause and visibly decay** while an enemy is contesting the zone, or holding is not a decision.

### The war beat
Replaces the WAR DECLARED placeholder at the `// P4:` marker in `tutorial.js` `finish()`.
Per `IMPROVEMENTS.md` P6: the park PA cuts to an emergency broadcast **mid-sentence**; no tanks, no
montage. Radio lower-thirds with a callsign, queued, timed, **skippable in one tap**, never blocking.
**The paint stays on the containers** — persist the training splat decals into L1 and fade them over
the next two levels. This is the cheapest, best beat in the game; do not skip it.

### Campaign hub
Level cards: name, objective, recommended power, best time, clear state, REPLAY vs NEXT, and the
**THREAT READOUT** P3 built (`"their rounds cost you 13.8 HP per hit"` + severity band). Locked levels
state what unlocks them. Replaces the start-screen fallback at the second `// P4:` marker.

### Boss presentation
Announce banner + a health bar across the top while the boss is visible. Per `IMPROVEMENTS.md` item 5:
**the name tag and banner are the primary cue, colour is reinforcement** — red-on-dark is the classic
colour-blind failure and two levels are at night.

---

## P4a — AS BUILT (landed; the spec above is what was asked for, this is what exists)

- **The dock is permanent.** `§WORLD` `dock()`: quay deck x 22→26 (flush, `solid:false`, merged
  into the `wallDark` bucket), a 0.4 m `climb:false` kerb at x = 26, a water plane at y = −1.2
  from x = 26 out to 120, nine mooring bollards, and two gantry cranes (legs, portal beams, boom
  over the water, trolley, spreader, counterweight) — **every crane part `climb:false`, so the
  parapet is still the only perch**. The east perimeter wall and fence are gone. The yard plane
  was shrunk to x ≤ 26 so the water is not hidden by invisible tarmac.
- **Out of bounds.** `groundAt()` returns 0 for anywhere with no solid under it, so a body past
  the kerb would otherwise stand on invisible tarmac over the sea. An invisible `climb:false` cap
  at x 26.2→30.2 keeps the player, the AI and the nav grid inside; `checkOutOfBounds()` is the
  backstop: same z, back on the quay, 14 HP, 0.6 s re-arm — no i-frames, no repositioning.
- **`§LIGHT`.** Eight presets (the seven in the table plus `nightfog` for L7's `light:'nightfog'`;
  `rotate` picks one at random for ENDLESS). `Light.apply()` only ever mutates `sun`/`hemi`/`amb`
  and `scene.fog` — the world light count is 4, always, and a test asserts it.
  `applySettings()` now calls `Light.applyFog()`: LOW quality may only *shorten* the preset's fog,
  never rewrite it, and it never touches AI sight.
- **Fog cuts both ways.** `canSee()`'s hard-coded 48 m became `Light.sight()`; the aim-assist
  `maxDist` became `min(70, scene.fog.far)`. Measured: a lone enemy on a clear 40 m line spots you
  in `day` and does not in `fog`; at 30 m it still does in `day` and still does not in `fog`; at
  18 m in fog it sees you again.
- **`§OBJECTIVES`.** `eliminate` / `capture` / `hold` / `waves`, all from the existing level data.
  Capture and hold share one meter; the difference is the decay weights (capture punishes being
  contested 2×, hold punishes leaving 2×). Contested progress **decays**, it does not pause.
  `GAME.onKill` no longer wins the round — `OBJ.onKill()` decides. Waves activate pool rigs a
  group at a time; nothing is allocated mid-round and `rosterSize` still reports the full roster.
- **Zone marker.** One `MeshBasicMaterial` mesh (`fog:false`, so the objective stays findable in
  fog) rebuilt per level: ground ring, inner ring, four posts. One draw call, and only on a zone
  level. Plus a minimap overlay whose filled arc *is* the meter.
- **Boss presentation.** `campaign.js` `§BOSS`: announce banner on first sight, health bar across
  the top while visible (2 s lag-out so ducking behind a container does not strobe it). Per
  IMPROVEMENTS 5, identification is **shape**: `drawTag` gives a boss a diamond over the name,
  chevron brackets either side and a second rule around the bar. Verified by reading only the
  **alpha channel** of the tag canvases — colour never enters the assertion.
- **The war beat.** Per IMPROVEMENTS P6 the round does **not** end. `tutorial.js finish()` keeps
  `state==='play'`, saves the paint, and hands off to `Campaign.warBeat()`: PARK PA cut off
  mid-sentence, two emergency-broadcast lines (the light shifts to `overcast` on the first), two
  from CPL VANCE, one from CONTROL. `#radio` is `pointer-events:none`; only the band itself takes
  a tap, and that one tap ends the **whole** queue. `Tutorial.warVisible()` now means "the beat is
  running", not "a screen is up".
- **The paint.** `FX.savePaint()` / `restorePaint(levelId)` persist the training splats through
  `localStorage`, full strength in L1, 0.55 in L2, 0.25 in L3, cleared at L4.
- **The hub.** `#hubScreen`: nine cards with objective, roster, boss names, clock, light, best
  time, recommended power vs your career SP, clear state, REPLAY/NEXT/LOCKED, the P3 threat
  readout (asserted equal to `gateCalc`), and a lock reason naming the mission that opens it.
  The list scrolls, DEPLOY does not. Reachable from the start screen, the debrief, and after the
  war beat; it has its own ARMOURY entry and settings returns to it.

### Left for P4b / P5
- `LEVELS[1].light` is still `day` on purpose — "the same yard, before the paint dries". If P4b
  wants the dock overcast, that is a data change, not a code one.
- The water is a flat plane with a 3.5 cm bob. No shader, no reflection, as specified.
- Storm lightning reuses `_postParams.flash` plus a sun spike; there is a `Audio_.thunder()`.
- ENDLESS `light:'rotate'` picks a random preset per round; nobody has balanced that.

---

## P4b — level variety (the biggest risk in the design)

Nine levels on one map will read as the same yard nine times without this.

1. **Per-level container layouts** (`IMPROVEMENTS.md` V1). The `container()` call list becomes a
   per-level table. **The nav grid must rebake** — `NAV` bakes from `solids`, so world rebuild and
   nav rebake have to happen together on level load. This is the real work; budget for it.
   Watch the A* heap sizing gotcha: it must stay well above cell count or every path silently fails
   and every enemy freezes.
2. **Per-level insertion point** (V2) — attack the dock from the west, then defend it from inside the
   building. One vector in the level table, opposite read.
3. **Altitude intent** (V4) — some objectives lock the parapet, some demand it.
4. Verify cover points and enemy spawn points are still valid after every relayout — a spawn inside a
   moved container is the obvious failure.

---

# P4b APPROACH (decided from the real `§NAV` / `§WORLD` code — do not improvise this)

## What the code actually does
- `NAV`: `CELL 0.75`, `N = 80`, so **6,400 cells**. `blocked` (Uint8Array) and `coverH` (Float32Array)
  are allocated **once** at `N*N` — a rebake **refills** them, it does not reallocate. Good.
- The bake loop reads the **`solids` and `ramps` arrays**; `cover[]` is a plain array built during the
  bake and must be **cleared and rebuilt** with it.
- The A* heap is already `Int32Array(N*N*10+1)` — the known "heap must exceed cell count" gotcha is
  **already handled**. Do not resize it; do not let it shrink.
- `§WORLD` merges everything into **shared geometry buckets** by material. `container()` pushes into those
  buckets and appends to `solids` / `mapRects`.

## The trap
The obvious implementation — rebuild the world per level — means **re-merging every bucket on every level
load**. That is expensive, invasive, and puts the whole static world at risk to change some container
positions. Do not do it.

## Do this instead
1. **Build every layout once, each as its own merged mesh.** For each distinct per-level container layout,
   merge that layout's containers into their own mesh set (still merged by material, so it stays ~1–2 draw
   calls per layout) and add all of them to the scene at load. Per level, set `visible` on the chosen
   layout and false on the rest. Draw cost is unchanged because only one layout is ever visible; the only
   cost is geometry memory for N layouts, which is trivial.
2. **Tag solids with their layout.** Each layout's solids get a layout id. Add a single
   `if(s.off) continue;` guard to the solid loops in `moveCollide`, `groundAt`, `pointBlocked`,
   `depenetrate` and the NAV bake. Per level, flip `off` on the layouts that are not active.
3. **Rebake NAV on level load**: refill `blocked`/`coverH` from the active solids, clear and rebuild
   `cover[]`. Keep the arrays; only the contents change.
4. **Revalidate after every relayout** — this is where the bugs will be:
   - enemy spawn points (a spawn inside a moved container is the obvious failure)
   - cover points (stale `cover[]` entries pointing at containers that are no longer there)
   - the objective zones from P4a (a zone that a new layout has walled off is unwinnable)
   - the player insertion point for that level

## Verification that actually proves it
- After each layout swap assert **every** enemy can path to the player's insertion point. A silently
  failing A* shows up as enemies standing still, and a screenshot will not catch it.
- Assert `cover.length` changes between layouts and that no cover point sits inside an active solid.
- Assert draw calls do not grow with the number of layouts (build 5, show 1, compare against 1 layout).
  Pin `quality:'low'` and take a **median with rigs hidden** — per PIPELINE's traps, a peak sample will
  absorb the delta you are trying to measure.

---

# P5 SPEC — split into P5a (make it right) and P5b (ship it)

P5 as originally scoped has accumulated four balance follow-ups, a perf problem, a save-format risk and
the whole shipping checklist. That is two phases.

## P5a — make it right

### 1. The four follow-ups from P4c *(all four are in `PIPELINE.md` under "P5 FOLLOW-UPS")*
- **Per-tier fire cadence in the survival model.** Real rates are militia 2.59/s → praetor 3.67/s, not a
  flat 2.50. The readout currently understates late close-range fire by up to 47%. `MODEL:{BURST,CADENCE,
  HIT_RATE}` is already exported for this. The readout's job is honesty — take it.
- **Model the armour pool.** Below PLATING 4 the pool empties before the player does, so real TTD runs
  8–25% under the model (L1 prints 229 s, real is 53.8 s).
- **Make the curve monotone via `spTarget`, not `TIERS`.** L5 is gentler than L4 and L7 than L6 purely
  because the SP targets jump while the tier does not.
- Endless `maxAttackers` is already 6 → 4 (done by the coordinator).

### 2. Perf — `docs/IMPROVEMENTS.md` item **4b** has the full diagnosis
L8 sits around 288 (median, rigs visible); static world with rigs hidden is 271. A rig is ~14.7 calls
because it is split by animation group **and again by material** (`EMAT` has 10). Two fixes, both specced:
**vertex colours** to collapse the material split (~11/rig, and it stops scaling with palette size), and
**distance LOD** past ~30 m (1 call/rig) which is where the L8 win actually is.
**The LOD must not change hit boxes** — `rayTest` uses the real boxes and must keep doing so, or long-range
shots start missing enemies you visibly hit. That is how you break the sniper without noticing.
Target ~120–150 on L8. Verify on a phone, not the Mac, and pin quality first.

### 3. Profile schema versioning — `docs/IMPROVEMENTS.md` "PROFILE SCHEMA VERSIONING"
`Profile.load()` is defensive against corrupt JSON but **not versioned**. Add `v:1` and a migration that
fills missing fields from defaults. Test by loading a **v0 save with current code** — loading a current
save proves nothing. Cheap now, expensive after the first player exists.

### 4. The stuck-player debrief — `docs/IMPROVEMENTS.md` "THE STUCK PLAYER"
The game is a gate, so stuck players are a first-class state, not an edge case. Track consecutive failures
per level and escalate what the debrief offers (nothing / best purchase / the honest survival-time line +
THE RANGE / the replay route). **No rubber-banding, no paid skip, no hiding the wall.** RECRUIT mode is the
one concession and it must be chosen in settings, never pushed after a loss.

## P5b — ship it

1. **A human has to play it first.** Everything in this game has been verified headless. That is real
   evidence about correctness and no evidence at all about whether it is fun, whether the double-tap fire
   scheme feels right under a thumb, or whether the yard reads differently across nine levels. **Do not
   register it in `projects.js` until Aaron has played it on a phone.**
2. `docs/HANDOFF.md` — the state of play, the § anchor map across all seven files, the harness traps, the
   known flakes, and what is deliberately left for later.
3. Screenshot → `/assets/screenshots/breachpoint2.jpg`.
4. `projects.js` entry (path `/gms/3d/breachpoint2/`, `type:"game"`, a description in the house style).
5. Final full-suite run, every level, both orientations, `file://` and over http.
6. Commit and push — **stage selectively**, the repo has other sessions' work in it. Check behind/ahead
   before any rebase; `--autostash` will stash someone else's live work.

---

# P5a — AS BUILT

## What changed
- **`js/armoury.js` §SURVIVAL** — the model is derived, not flat. `cadenceOf(tier)` reproduces
  §ENEMIES' fire loop (burst `randi(3,5)` +1 above accuracy 0.7, 0.115 s spacing, cooldown
  `mean(0.75,1.6)+0.5` past 22 m scaled by `lerp(1,reaction,0.5)`, period = `max(cooldown, burst)`),
  and `survival()` now runs the **armour pool** in two phases with the regen rule in it.
  `MODEL` still exports `BURST/CADENCE/HIT_RATE` plus the new constants, and `cadenceOf`/`burstOf`
  are exported so a test can recompute without copying numbers.
- **`js/data.js`** — `spTarget` L5 3200 → **2000**, L7 7500 → **5200**. Nothing else. `TIERS` is
  byte-identical (md5 `c0f0aa0c76059ece81d5f1ceeb94efaa`).
- **`js/campaign.js` §BOSS** — the announce is latched: first sight **or** `ANN_DELAY` 3 s of the
  boss being alive and inside `ANN_RANGE` 42 m (or already hunting you). `annT` resets with
  `announced`.
- **`js/profile.js` §PROFILE** — `SCHEMA = 1`, `v:1` in `blank()`, `migrate()` reports the version a
  save arrived at, and `load()` rewrites anything older. v0 is "no `v` field" and needs no field work.
- **`js/engine.js` `pickPatrol`** — null-deref fix; it threw and killed the round when all eight
  sampled patrol points landed past 42 m. Found by the P4b confirmation sweep.

## What it does NOT do (P5b/P5c/P5d)
The perf pass, the stuck-player debrief, RECRUIT mode, HANDOFF, the screenshot and `projects.js`.

## The one thing to read before touching the curve
`spTarget` **cannot** make the TTD curve strictly decreasing: L4 and L5 are the same threat (veteran,
3 attackers) and L6 and L7 are the same (shock, 4), so the only way L5 could be harsher than L4 is
for the player to have *less* SP at L5. The curve is now flat across those two pairs and falling
everywhere else. Changing that needs a threat lever — L5 `maxAttackers` 3 → 4 is the clean one; L7
has none left short of counting its two bosses in the model. Both are balance calls.

---

# P4b — AS BUILT

## What exists
- **`§LAYOUTS` in `js/data.js`** — five complete container maps, 98 placements in total (22 / 24 / 17 / 18 / 17).
  A placement is `[x, z, stack, rot, ci]`; `rot` is 0 (long axis X) or 1 (long axis Z) and `ci`
  indexes the layout's own five-colour `pal`, so each layout also reads as its own palette.
- **`§WORLD` builds every layout once**, each into its own merged mesh set, and adds them all at
  load with `visible=false`. `setLayout(id)` flips `visible`, flips `.off` on that layout's solids
  and minimap rects, swaps the layout's meshes in `worldColliders`, and calls `NAV.bake()`.
  Nothing is re-merged, nothing is allocated, and the world is never rebuilt.
- **The budget is deliberate**: a layout is exactly `pal.length` body meshes + one `darkSteel` frame
  mesh = **6 draw calls**, which is what the six shared `cont0..5` buckets used to cost. That is why
  `pal` is five and why the container door bars moved from `steel` into the frame mesh. A sixth
  palette colour in a layout would cost a seventh draw call — keep it at five.
- **`§NAV` bakes in a function now.** `blocked`, `coverH` and `cover[]` are allocated once and
  **refilled**; `cover[]` is cleared and rebuilt with the grid so no cover point can point at a
  container that is no longer there. The A* heap is untouched at `N*N*10+1`.
- **`.off` guards** are in `groundAt`, `resolveAxis`, `depenetrate`, `ceilingAt`, `pointBlocked`,
  the NAV bake and the minimap loop. `spotFree` deliberately has **no** guard: crates and barrels
  are placed against *every* layout's containers, so a prop can never end up inside a container in
  any level.
- **Insertion points** (`LEVELS[n].insert = {x, z, yaw, y?}`). `player.spawn()` reads the level, not
  a constant, and `Enemies.spawnPoints()` keeps its 12 m exclusion around the level's insertion
  point instead of around `(1.5, 24.5)`.
- **A spawn point must now be REACHABLE, not merely free.** `spawnPoints()`'s `free()` ends with an
  A* to the insertion point. Without it, seed 7 `(22,10)` lands in a pocket on the quay on the YARD
  layout and that enemy stands still for the whole round — caught by the pathing assertion, invisible
  in a screenshot.
- **The training paint is reseated on a layout swap.** A splat saved against a container that the
  next level's layout does not have is dropped flat onto the yard instead of hanging in mid-air
  (`FX.reseatSplat`). The fade schedule (1.00 / 0.55 / 0.25 / gone) is unchanged.

## The five layouts and what each changes about play
| # | name | levels | what it does to the fight |
|---|---|---|---|
| 0 | **YARD** | 0, 1, 9 | the original: two long N–S corridor rows at x 8.4 / 14.6 plus yard scatter. Open west approach, open quay. Unchanged so the training paint still lands on the containers it was sprayed on. |
| 1 | **THE STACKS** | 2, 6 | five **E–W** lanes with staggered 3 m gaps — every approach crosses the map sideways instead of running with it. A 3-high **blinder wall** at x −13.2 along the building's east face takes the parapet's sightline into the yard away, so this one is a ground-level fight (V4). |
| 2 | **OPEN GROUND** | 3 | pushed to the edges — three short west blocks, two staggered edge rows, three quayside stacks — and a bare middle with three lonely blocks of cover. Long sightlines; the parapet dominates. L3 inserts you **on the parapet** and puts its hold zone in the open below it: the perch shows you the ground you then have to go and take. |
| 3 | **THE FUNNEL** | 4, 7 | one diagonal spine of 2-high stacks from the south-west to the north-east with two gaps in it, plus pockets north and south. Crossing sides is a commitment. Both night levels. |
| 4 | **QUAY WALL** | 5, 8 | a 2-high rampart across the dock approach at x 20 with two gates, forward outposts, and a swept killing field between the yard and the quay. Fewest cover cells of any layout (≈960 vs YARD's ≈1150) — the last stand. |

## What the layouts actually do to play (154 ray-traced sample points across the yard)
| layout | yard visible FROM THE PARAPET | from a ground position at (−12) | cover cells |
|---|---|---|---|
| YARD (pre-P4b baseline) | 39% | 42% | ~1150 |
| THE STACKS | **1%** | 16% | ~1215 |
| OPEN GROUND | **72%** | 65% | ~1120 |
| THE FUNNEL | 51% | 51% | ~1065 |
| QUAY WALL | 68% | 48% | ~950 |

The perch is worth 1% of the yard on THE STACKS and 72% on OPEN GROUND. That is the same map.

## Insertion points
`L0 (1.5,24.5)` · `L1 (−12,16)` facing the quay · `L2 (11.5,−26)` into the lanes from the south ·
`L3 (−19.5, y 4.4, 0)` **on the parapet** facing east · `L4 (−24,−2)` **inside the building** at
ground level looking out · `L5 (24,18)` behind the rampart on the quay · `L6 (1,0)` dropped in the
middle of the maze · `L7 (−26,−26)` far south-west corner · `L8 (24,−26)` south end of the quay ·
`L9 (1.5,24.5)`. Nine distinct points across ten levels.

## Known, measured, and deliberately left alone
- The permanent world has small nav pockets behind the crane feet and kerb corners. Flood-filled, the
  **pre-P4b YARD list already strands 8 cells of 3770**; the four new layouts strand 6 / 3 / 22 / 41.
  Nothing spawns in one (`spawnPoints()` requires a path to the insertion point) and every insertion
  point reaches all four corners, so these are cosmetic, not reachability bugs.
- `p3_test` §3's STEADY assist check is timing-flaky ~1 run in 5 on this machine, in BOTH arms.
  Measured 12 ways; `RANKS.assist` is correct every time. See PIPELINE's flake list — it is the
  900 ms window against a 20-40 fps headless renderer, not the cone and not P4b.

## Left for P5
- `LAYOUTS` is data, so more layouts are a table edit — but keep the five-colour palette rule.
- ENDLESS uses YARD every round. Rotating the layout per round the way `light:'rotate'` rotates the
  preset is one line and nobody has balanced it.
- The draw-call suites now **pin the camera pose** as well as the quality, because the spawn pose is
  per-level. `114` is the figure from `(1.5, 24.5)` facing −Z; at L1's own insertion point the same
  build reads 82. Neither is wrong; only one is comparable to the P1 baseline.

---

# P5b APPROACH — perf (read before touching the rig)

> **P5b is DONE (2026-09-18).** L1 114 -> ~50, L8 302 -> ~134, 41/41 in `scratchpad/p5b_test.mjs`.
> The results, the corrections to this plan and the new traps are in `PIPELINE.md` under "P5b CLOSED".
> Kept below as written, because the trap it names was real and cost nothing thanks to this note.

Diagnosis is in `IMPROVEMENTS.md` item **4b**. This is the implementation approach, written from the code.

## The trap that will cost you an hour if you miss it
**`mergeGeos()` (engine.js ~244) is a hand-rolled minimal merger that copies `position`, `normal` and `uv`
ONLY.** It does not carry a `color` attribute. If you add vertex colours to the source geometries and merge
through it unchanged, **the colours are silently dropped** and everything renders untinted. Extend
`mergeGeos()` to carry `color` (3 floats/vertex, defaulting to white when a source geometry has none — the
world geometry merges through this same function and must not change appearance).
Output is non-indexed, so the colour array is a straight per-vertex fill.

## Fix 1 — vertex colours collapse the material split
`EMAT` has 10 materials; `EPART`/`mergeParts()` already merge geometry per animation group, so the rig is
split by group **and again by material**. Bake the palette into vertex colours and give the rig a single
`MeshLambertMaterial({vertexColors:true})`. Each animation group then becomes **one mesh**.
- Keep the visor (`MeshBasicMaterial`, emissive) as its own small mesh — it is meant to be unlit.
- **Bosses:** `material.color` multiplies vertex colours, so a boss is the same geometry with **one cloned
  material** carrying a red `color` and an `emissive`. That replaces `EMAT_BOSS` cloning the whole set, and
  it means boss cost stops scaling with palette size.

## Fix 2 — instanced distance LOD *(this is where the L8 win actually is)*
Past ~30 m an enemy is a few dozen pixels and its elbow articulation is invisible.
- Bake **one shared LOD geometry**: the rig in a neutral pose, all part transforms applied, merged to a
  single geometry. Every enemy is the same geometry, so build it once.
- Render all far enemies through **one `InstancedMesh`** (capacity 20) with a per-instance matrix carrying
  position and yaw. **Far enemies then cost 1 draw call in total**, not 1 each.
- Keep bosses on the full rig regardless of distance — there are few, and they are what the player is
  looking at.
- **Hysteresis** on the swap (~30 m in, ~34 m out) or rigs thrash at the boundary.

## Fix 3 — the name tags are draw calls too
Each enemy carries a `Sprite` name tag and **sprites do not batch** — that is one call per living enemy on
top of the rig. Hide tags beyond the LOD distance; they are unreadable at that range anyway.

## The thing that must not break
**Hit boxes must not move.** `rayTest()` uses `HITBOX` scaled by `e.scaleY()` and must keep doing so no
matter which mesh is drawn. If hit detection ever follows the LOD mesh, long-range shots start missing
enemies you visibly hit — which only shows up at distance, which is exactly where nobody tests by hand.
**Assert it directly**: fire at a far enemy in LOD state and confirm the hit registers at the same
coordinates it did with the full rig.

## Targets and how to measure
L8 is ~288 median (rigs visible), 271 static world, ~14.7 per rig. Target **~120–150** on L8.
Per PIPELINE's traps: pin `quality:'low'` **and** the reference pose (`teleport(1.5,24.5); look(0,0)`),
take a **median with rigs hidden** when isolating static cost, never a peak. Report before/after for
L1 and L8 and confirm the game still looks right — a perf win that greys the enemies out is not a win.
