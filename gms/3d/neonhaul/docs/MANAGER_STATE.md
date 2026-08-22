# Manager state — NEONHAUL

Live run state for the managing session. **If you are a fresh or compacted manager, read this
first, then `DECISIONS.md` (all of it, including Tracked obligations), then `MANAGER_BRIEF.md`,
then `ART_PASS.md`.** `BUILD_PLAN.md` is 218 KB — never read it whole; each phase brief names its
own sections.

Last updated: 2026-08-18, after **P11**. Read the P11 section first, then P7b, then the integration section.

## ⚠ THREE AGENTS IN PARALLEL — A ONE-OFF BATCH, NOT THE NEW DEFAULT

Aaron lifted the one-agent limit on 2026-08-18 **for this batch only**. His instruction, same day:

> "once the current agents finish, we go back to running a single agent at a time."

**So: when P6, P7a and P8 have all reported, revert to one build agent (plus at most one blind
critic) and do not spawn a second without asking.** The reason for the limit is Aaron's **usage
limits** — he needs the 5-hour block to last and wants spare capacity for other work. Tell future
agents the reason, not just the number; one that hears only "three critics" will run eight.

**The binding constraint while parallel is `js/main.js`,** which every phase wires through and which
three agents editing concurrently would corrupt. So ownership is assigned, not negotiated:

| agent | owns exclusively | must not touch |
|---|---|---|
| **P6** cockpit/HUD | `main.js`, `hud.js`, `minimap.js`, `ui.js`, `index.html`, `style.css` | `audio.js`, `missions.js`, `economy.js`, `zones.js` |
| **P7a** missions/economy | `missions.js`, `economy.js`, `zones.js`, `tools/gates_p7a.mjs`, `tools/sim_p7a.mjs` | `main.js`, all HUD files, `audio.js`, `save.js` |
| **P8** audio | `js/audio.js`, `tools/gates_p8.mjs`, `SUNO.md` | `main.js`, `index.html`, all HUD files, mission files |

`tools/shot.mjs` and the other `tools/gates_*.mjs` are **the manager's** — P6 was told T10 is
already done there, and no agent may edit them.

**P7a and P8 cannot wire themselves in.** Each writes `docs/P7A_WIRING.md` / `docs/P8_WIRING.md`
with the exact patch it needs (imports, call sites, state) and **the manager applies it after P6
lands `main.js`.** Both were told to flag the pending wiring in their reports. **Do not accept
"done" from either without checking whether its wiring is still unapplied.**

## How this run works

- **One agent at a time.** Aaron's rule, and the reason is **usage limits**, not speed — he needs
  the 5-hour block to last and wants spare capacity for other work. He has twice granted a
  temporary 1-hour window for one *additional* agent; both have expired. **Tell agents the reason,
  not just the number** — one that only hears "three critics" will happily run eight in parallel,
  which already happened once.
- The only standing exception is a blind critic alongside a builder.
- Manager spawns a phase agent, waits, **verifies its claims**, then spawns the next.
- A 30-minute cron check-in fires at :13 and :43 (job `c6f226ad`, session-only, dies with the
  session — **recreate it after any restart**).
- ~~**Nothing is committed yet.**~~ **SHIPPED 2026-08-18 as `a0627f0` on `main`.** Builders were
  told not to commit and not to run git; other Claude sessions have uncommitted work in this repo,
  so P10 staged only paths under `gms/3d/neonhaul/`, plus one hunk of `projects.js` and
  `assets/screenshots/neonhaul.jpg`. That discipline still applies to every later commit.

## Phase status

| | phase | state |
|---|---|---|
| P0 | scaffold, harness, platform lifecycle | ✅ |
| P1a | atlases, materials, sky, ACES grade | ✅ |
| P1b | offline signage bake (2048² greyscale, 225 KB, 250 tiles) | ✅ |
| P2 | city generation, LOD fields, authored core | ✅ |
| P3a | signage placement, strips, strobes, structures | ✅ 13/13 |
| P3b | weather, reflections, halos, silhouettes, aerial vista, 1st critic | ✅ 12/12 |
| P4 | flight, two-thumb controls, camera, soft collision | ✅ 19/19 both presets |
| P9 | 16 client portraits + talking loops (ran early) | ✅ 1.26 MB |
| P5 | vehicles + traffic | ✅ 16/16 both presets; round-6 critics done |
| P6 | cockpit, dash, holo, minimap, toasts | ✅ 19/19 × 4 configs |
| P7a | zones, missions, economy | ✅ 30/30 · **wiring APPLIED** |
| P7b | the docking panel + the ledge fix + T8 | ✅ 20/20 incl. 6/6 falsification · `docs/P7B_NOTES.md` |
| P8 | audio + SUNO manifest loader | ✅ 30/30 · **wiring APPLIED** |
| P11 | **Aaron's art pass** — see `ART_PASS.md` | ✅ 8/8 both presets · round 7 scored · `docs/SUBLEVELS.md` written |
| P10 | polish, perf, ship (commit + push) | ✅ **SHIPPED 2026-08-18** — see the P10 SHIP section |

Budget before vehicles: HIGH **37–42 draws / 118–144k tris** against gates of 65 / 260k.

## P11 — COMPLETE. 8/8 both presets, round 7 scored, every other suite still green.

**`tools/gates_p11.mjs` is the record** (`shots/p11/_gates.json`, `_gates_low.json`), `SCORES.md`
round 7 is the critic round, and `docs/SUBLEVELS.md` is the design note ART_PASS asked for and
explicitly told the builder not to implement.

### The headline, and it is a mixed one

**The colour half of the diagnosis is answered and is no longer named by any critic. The lighting
half is not.** Six fresh `fp-critic` critics, three per shot, same pool and prompt as round 6:

| | ours | ref | gap | round 6 |
|---|---|---|---|---|
| `fog_city` | 3.0 / 3.0 / 3.5 | 8.0 / 8.0 / 8.5 | −5.00 | −5.17 |
| `canyon_dive` | 4.0 / 4.5 / 4.0 | 9.0 / 8.5 / 9.0 | −4.67 | −4.83 |

Both moves are 0.17 of a point against a ±1.5 noise floor: **the number did not move.** What moved
is the differences lists, which is what DECISIONS 12 says to read. *"The window grid is a tiling
decal"*, *"every window is the same white at the same brightness"*, *"one window value"* and *"the
same flat blue ambient"* are **all gone**, and critics now name our colours (*"a green tower, a
magenta tower, a maroon tower"*). **"Every light source in this image is a sticker" is still six of
six.** Full table in `SCORES.md`.

### What landed

| | what | cost |
|---|---|---|
| §1 | Per-building and intra-building colour: a 10-colour pool per district, ~40 % of any block drawn from outside its home hue, **2–3 vertical zones with hard boundaries quantised to §3.4's 3.6 m floor pitch**, an unlit band (34 %), an unlit crown (24 %), **10.9 % of buildings unlit entirely**, and the same spread on LOD2's far skyline | **2 instanced attributes, 7 floats. 0 draws, 0 geometry.** |
| §2 | A lighting model: a baked spill halo + sill per window pane, a per-fragment wall spill, a warm street wash falling off over 34 m, and a per-face key so the four wall orientations of one box differ | ~30 ALU in the shell fragment shader |
| §2 | A lit spandrel band at every floor line (round-7 fix) | 3 ALU |
| §3 | Close-up detail per PIXEL: bays of curtain glass and solid panel alternating on the window column grid, with **different roughness and metalness** — the answer to "one material everywhere" — plus floor/mullion rules and grime that gathers low | ~12 ALU |
| §4 | The road: lane markings, kerbs, junction hatching, drain grates and street lighting, computed from WORLD XZ on §3.1's own 51.2 m lot / 13.2 m road pitch, with an `fwidth()` fade so they never moire; plus the water film's missing Fresnel term | ~35 ALU on one plane |
| §2 (signs) | Hero billboards are a per-prototype PROBABILITY rather than a `spire`/`bridged` boolean, and authored landmarks carry a **megahero** class of 80–190 m. Signage now spans **3.2 m → 150.8 m = 47×** (was 21.5×); 746850_03 spans about 30× | 0 draws (existing field, cap 48 → 160) |

**Budget:** HIGH 50–55 draws / 135–162k tris / mean 1.6–2.1 ms; LOW 36–41 draws / 48–66k tris.
Gates are 65 / 260k / 6.0 ms. The city gains **one** draw over pre-P11's 49, and it is the hero
field going from count 0 to non-zero — a field that already existed.

**Determinism held: golden hash `f29beaf9`, 25,039 buildings, unchanged.** That is not luck. Every
new per-building value is derived from a dedicated `PAINT_SALT` hash of the quantised world
position and **draws nothing from the chunk rng stream**, because `hashRegion` mixes `cell` and
`jitter` and one extra draw would move every building in the world.

### THE GROUND — it was a defect, and the mirror was not it

ART_PASS said check for a bug before styling. Measured first (`tools/p11_ground.mjs`, both controls
reported):

| | mirror off | film off | null control | positive control |
|---|---|---|---|---|
| `canyon_dive` | Δ **0.005** / 255 | Δ 0.039 | 0.000 | 1.81 |
| `wet_street` | Δ **0.145** | Δ **3.344** | 0.000 | 3.27 |

The §3.7(b) mirror group — the obvious suspect, and the thing that would literally paint an
inverted city below the floor — moves the frame by **0.145 of a channel in the one shot built to
show it off**. It was never what Aaron saw. Two things were:

1. **§3.6 specifies "faint lane markings, drain grates" and `atlas.js` baked NEITHER.** The deck was
   slab joints, grime and 22 puddles on near-black asphalt. Nothing on it said "road", so there was
   nothing to read as a surface — and a surface you cannot read reads as haze.
2. **The water film had no Fresnel term.** An additive env reflection at fixed strength washes the
   deck equally hard from every angle instead of falling to a few per cent when you look down at
   it. That is the semi-transparency, and it is a missing term, not a look choice.

Both fixed. **0 of 4,132 seeded footprints encroach on the painted road corridor; widen the
corridor to 26.4 m and 3,777 of them do** — the alignment is measured and the probe can fail.

### ⚠ P11 FOUND A VACUOUS GATE IN `gates_p3b` — instance SEVENTEEN, and it had passed for two phases

§3.7(b)'s occlusion gate sampled "the right quarter of frame, which the near tower fills". Rendered
with the grid drawn on it, the tower fills that quarter's **top half**; the bottom half is open
road, where the mirror is supposed to show. So the gate was measuring the road and calling it the
facade. It went red under P11 only because the corner strips got wider and their reflections pushed
those road cells over the threshold.

Narrowing the cell set to the top half made it green again — **and the falsification leg then
reported 0.00000 as well**, i.e. those cells have no mirrored geometry behind them and the gate
could not have failed. Measured properly at the STREET camera the depthTest-off pass is
**byte-identical** to the shipped one (sum 0.1623 vs 0.1623, zero cells differing): the mirror lives
at `y < 0`, the only thing exposing `y < 0` is the non-depth-writing road, and at a level camera
nothing is ever in front of a mirrored fragment. **The gate's premise was unsatisfiable at its own
camera from the day it was written.**

It now (a) derives the occluded set from a depthTest-forced-off pass rather than assuming where a
tower is, so with depthTest off no cell can qualify and the gate fails by construction, and (b) runs
at `[1280, 45, 420]` pitch −18, found by sweeping five candidate cameras, where the premise is
satisfiable: **8 cells the mirror wants to paint at up to 0.0198 are cut to a worst survivor of
0.0002.** `p3b` is 12/12 and 13/13 `--lite --halocost` again.

### Gate results at P11's final code state

`p11` **8/8 both presets** · `determinism` 9/9 golden **f29beaf9** · `p1a` 10/10 · `p2` 8/8 ·
`p3a` 13/13 · `p3b` 12/12 and **13/13 `--lite --halocost`** · `p4` 19/19 both presets ·
`p5` 16/16 both presets · `p6` 19/19 both presets · `p7a` 24/24 · `p7b` 14/14 · `p8` 30/30 ·
`wire` 11/11 · `t10` 4/4 · `budget --headed` and `--headed --lite` both pass.

### Two gate files P11 edited, and why (they are the manager's — read these)

- **`tools/gates_p3a.mjs`** — one new class exception beside the existing `poster` one, so an
  authored landmark's megahero is checked against 80–190 m instead of §3.5.5's 60–110 m. A seeded
  hero at 150 m still fails. §3.5.5's band was derived against §3.1's 51.2 m lot (DECISIONS T6.1)
  and a landmark is explicitly not lot-limited; ART_PASS item 2 option 2 asks for exactly this.
- **`tools/gates_p3b.mjs`** — the vacuous occlusion gate above.

### What P11 did NOT do, and the manager should decide

- **Sub-levels: NOT implemented, by instruction.** `docs/SUBLEVELS.md` answers ART_PASS's four
  questions plus a fifth, prices three options, and recommends the cheapest. It also records that
  the observation which motivated the idea has been answered by a different fix.
- **A rooftop sign class** (ART_PASS item 2, option 3) was not built. Options 1 and 2 are the stated
  preference order and both landed; option 3 would need a sixth signage layer and a matching
  extension to `gates_p3a`'s per-layer size-band and on-a-facade audits, which is a bigger edit to
  a standing gate than the megahero exception.
- **The remaining converged complaints** are in `SCORES.md` round 7 and none is cheap: roof
  furniture at LOD1, a sky that is lighter than the towers in front of it, rain that picks up
  colour and attenuates with depth, wet specular on facades, and AA on the tower/sky boundary.

## P5 — what is done and what is not

**Landed:** `js/craft.js` (56 KB), `js/traffic.js` (26 KB), `tools/gates_p5.mjs`,
`tools/craftsheet.mjs`; `main.js` wired with `BODY_TINTS, TRIM_TINTS, TRIM_RUNS, RIM_DIM,
LIGHT_RIG, POLICE_RIG, Traffic`; shot defs carry `craft: true`; evidence shots in `shots/p5/`.

Hull colours verified by the manager and they match Aaron's spec — near-black with a hue:
`wisp 0x0a0b0e · kestrel 0x090e18 · lance 0x15090c · drayman 0x1a1005 · nocturne 0x120b18 ·
mammoth 0x14161a`, varied trim per craft, police trim explicitly non-varying.

**P5 gates PASSED — 16 ok / 0 fail on both presets** (`shots/p5/_gates.json` 13:19,
`_gates_low.json` 12:24). Vehicle layer is **5 draws**; scene **43 draws / 143k tris** against
gates of 65 / 260k; sim 0.23 ms. `noTrim` = **180 of 892 craft (21.8 %)** carry no trim at all, with
8 distinct body colours, 8 trim colours, 6 run lengths — Aaron's vehicle-colour spec is met and
measured. Decision 6 held: `patrol` never steers, no pursuit/heat anywhere. T7 handled — the
vehicle layers hide with `signage.setVisible`. The suite contains **four genuine falsification
tests** (part collapse, hull reflectivity, yield-sign flip, seed determinism).

**P5 owes nothing. It is COMPLETE.** Round 6 in `SCORES.md` scored all three shots with three fresh
`fp-critic` critics each, inter-critic variance 0.0–0.5 — the tightest instrument this project has
had, and evidence the three-critic method works.

**Decision 14's answer — read this before planning P11.** A craft in frame was tested with the
camera byte-identical to the P3b freeze, so the subject was the only new thing. Verdict: **half
right.** The "no focal subject" complaint is *gone* and composition is now the highest-scoring
criterion on both shots. **But the gap did not close** — six of six critics led with a version of
*"every light source in this image is a sticker"*: emissives that light nothing, no occlusion, one
material, one window value. Absolute numbers moved *down* only because the pool changed to
`fp-critic`, which marks both halves harder (plates now score 8.0–9.0 vs 6.0–7.5 in rounds 1–5).
**Read round 6 only against round 6.**

**This is now THREE independent observers converging on the same root cause** — P3b's critics,
Aaron in `ART_PASS.md`, and round 6. The city has no lighting model. That is **P11's** work and it
is the highest-value art work remaining. Do not re-litigate it in P6–P8.

**WITHDRAWN — do not action:** an earlier instruction to re-shoot `family.png` in the night variant
because the hulls "read red". Aaron was testing a mid-build state and the colour was corrected
while he was typing the report. **There was never a red-car defect.** The 23:19 gate run confirms
"every body colour is a NEAR-BLACK with a hue in it" against the shipped palette. His *substantive*
vehicle-colour spec in `ART_PASS.md` — dark bodies with a hue, reflective, neon trim, varied,
some partial or none — stands unchanged and is already met.

### ⚠ Gate files use TWO different schemas — read the right key

`p1a`–`p4` write `{preset, at, results:[{name,pass,detail}]}`. **`p5` writes
`{ok:[…], fail:[…], geo, mat, palette, traffic, vehicles, state, soak, …}`** — no `results` key.
A parser doing `d.get('results', [])` returns `[]` on a P5 file and reports **0/0 on a suite that
fully passed**. The manager made exactly this mistake twice and spawned an agent to "fix" work that
was already complete. Use a schema-agnostic tally. This is the project's dominant failure mode —
a measurement that silently measures nothing — committed by the manager, against its own warning.

**And a third time, the same day:** `grep -c '^| ' SCORES.md` was used as a proxy for "has a P5
critic round been logged?" It counts markdown table rows, but round 6's findings live largely in
prose — so it reported "no P5 round" on a file containing a complete, careful one. **Never proxy a
question you can answer directly. Read the file.** A count is not an answer; it is a guess with a
number attached.

**Also: the crash-window results are not trustworthy.** Aaron was crashing the Mac from another
session between ~12:15 and 13:20. Three high-preset gates fail with timing-sensitive margins —
`p2` §3.2.3 gen 1.500 ms vs a 1.4 gate, `p2` §3.2.2 dither cross-fade, `p4` §3.11 worst 13.7 ms —
while **every low-preset equivalent passes**.

**⚠ That machine-contention theory is now DISPROVEN for §3.2.2.** P6 ran `gates_p2` twice on a quiet
machine:

| run | dither | vs control | levels | cell/step | verdict |
|---|---|---|---|---|---|
| 1 | 0.00530 | 24.7 % | 1.4 | 152 / 14 | PASS |
| 2 | 0.05510 | **255.1 %** | 14.1 | 411 / 8 | FAIL |

A 10× swing between consecutive quiet-machine runs is **non-determinism in the gate**, not load. A
gate that swings 10× run-to-run cannot certify anything — it would pass or fail at random forever.

**The incoherence that localises it:** run 2's dither residue is **2.5× the control**, and the
control hides the *entire* LOD1 field. Nothing a cross-fade does to one cell can exceed removing all
the geometry, so run 2's worst cell is not measuring the cross-fade at all.

**✅ RESOLVED — the hypothesis was correct and P6 proved it.** The R0 sweep *was* racing chunk
streaming. P6's finding, in its own words: *"The previous version waited 40 frames instead and swept
with **126 chunks still queued**, which is what made this gate swing 24.7 % → 255.1 % between
consecutive runs."*

**The fix quiesces the world instead of counting frames** — queue drained in 1105 ms over 14 polls,
with an 8-field signature `[queued|chunks|near|lod0|lod1|lod2|far|aabbs]` asserted **stable across
all 52 samples**. `settle()` on frames is not a stable chunk set; this is.

**Determinism verified by the manager across six runs:**

| run | dither | residue | |
|---|---|---|---|
| 1 | 0.00530 | 24.7 % | pre-fix, passed by luck |
| 2 | 0.05510 | **255.1 %** | pre-fix, FAIL |
| 3–6 | 0.00530–0.00540 | **24.7–25.1 %** | post-fix, stable |

Variance collapsed from **10×** to ~2 %. **The threshold was NOT tuned** — P6 fixed the cause and
recorded both pre-fix runs in the gate's own comments so the history cannot be lost.

**Still open — §3.2.3 is marginal, not raced.** It failed once in six runs: worst `ms.gen`
**1.600 ms** against a **1.4 ms** gate (run 4 only; runs 1/3/5/6 pass). This is a *worst-single-frame*
metric against a tight threshold, a different problem from §3.2.2's non-determinism. Do not assume
the quiesce fix covers it.

The §3.2.2 gate is otherwise **well built** and worth preserving: it carries a `control` (0.02150 —
hide the whole LOD1 field) that proves the probe can see the geometry that swaps, "without which the
rest is vacuous", plus a `hard` comparison (0.01470) for the collapsed-fade case.

## P6 — COMPLETE, 19/19 on ALL FOUR configs. Verified by the manager.

HIGH, LOW, mobile portrait 390×844, mobile landscape 844×390 — all 19/19, verified from the gate
files. No `alert`/`confirm`/`prompt` anywhere. Boot clean. **Portrait verified visually by the
manager** (`shots/p6/portrait_cockpit.png`): a real instrument panel — 62 m/s dial, `ALT 90m`,
`CELL 100%`, thumb buttons — legible at arm's length, black slab gone.

**Cabin costs 5 draws / 208 tris** against §8's own estimate of 10 draws / 4.4k tris, by merging the
metal, the edge rules and all three holo panels each into one geometry. Scene 48 draws / 151.6k tris
against gates of 65 / 260k.

**Seven bugs its own gates caught, all real.** The two worth remembering:
- **T7 isolation was defeated by the game loop** — `setSignVisible(false,true)` set
  `group.visible=false` and `updateHud()` set it back next frame, so the isolation **reported
  success and measured the cabin anyway.** Now a `hidden` override that outranks game logic.
- **`gates_p4` §6.4 flake** — `hover()` reset the flight but not the input layer, so a button held
  by the earlier touch gate made `climb = 1−1 = 0` and a *working* Space key measured exactly 0.00.
  Another "difference of exactly zero is a broken experiment" instance. Fixed with an asserted
  (non-`&&`) `releaseControls` hook.

**Manager accepts P6's design call (its defect 4):** `save.js` ships `camera: 'chase'`, so in the
*default* view there was no speed, altitude or cell reading at all — the exact gap this phase
exists to close. It added a DOM chase strip at 0 draws sharing the cabin's data model. Correct call.

**Minor ownership deviation, approved retroactively:** P6 added `cityStreamSig()` and `quiesce()` to
`tools/shot.mjs`, which this file assigns to the manager. It was the right place for them and the
manager would have approved; noted only so the ownership table is not read as having held perfectly.

**P6 did NOT run the critic round** on the regenerated `shots/cockpit.png` — correctly left to the
manager. §12.1's `cockpit` shot needs `shot.mjs --hud` or the default `&nohud` suppresses the DOM
minimap.

## P6 — (historical) the boot break during the phase

P6 has been interrupted **three times by API 529 overloads** (plus two earlier machine crashes on
P5). Its files on disk are mid-refactor. `js/hud.js` (751 lines), `js/minimap.js` (322),
`js/ui.js` (173) are written; `index.html`, `style.css`, `config.js`, `main.js`, `save.js`,
`settings.js` updated; `shots/p6/` has `cockpit_shot.png`, `cockpit_free.png`, `chase.png`.

**Three boot errors were found by the manager. Two are FIXED, one is P6's to finish:**

1. ✅ `hud.js` — `layoutFor(opts.aspect || 16/9)` referenced an `opts` that is not a constructor
   parameter (`Cockpit(scene, Q, sky, atlas)`). Replaced with a new `aspectNow()` method reading
   the live viewport, floored so a 0-height frame cannot hand `layoutFor` a NaN.
2. ✅ `main.js` — `now: () => simTime` was read by a toast during module init while `simTime` was
   declared 340 lines later with `let`, so the read hit its **temporal dead zone and threw**.
   `simTime` is now declared above the `UI` construction, with a comment saying why.
3. ✅ **`dashGeo` written by P6** (`hud.js:131`). **Boot verified by the manager at 00:18** —
   `__ready` true, `__game` present, `__state.errors` empty, clean console. The blocker is cleared.

### P6 acted on both cockpit notes, with measurements

- **The dash slab** was a 0.72 m-deep lip centred at 0.66 m, bringing its near edge within 0.30 m
  of the eye and projecting to the bottom ~40 % of frame as featureless black. Pushed back and
  thinned to a visible wedge of **~18 %**, with §8.2's instrument plane covering most of the rest.
- **The illegible labels** were measured, not guessed: in portrait the dash plane is ~0.35 m across,
  so the 512×160 landscape sheet rendered into ~180 device pixels and its 8 px labels landed at
  **three**. There are now TWO dash sheets, not one scaled down — the portrait sheet is squarer,
  carries a third of the information and sets it **4× larger**.

### P6 found a real defect in the MANAGER's T10 test — worth remembering

`tools/t10_falsify.mjs` as the manager first wrote it observed `__state.city.signsVisible`, **which
does not exist**, and its pass condition contained `|| before === null` — so it would have PASSED
with both readings `null`, proving nothing. P6's words: *"the project's dominant failure mode wearing
the costume of a T10 test."* It replaced the observable with the live mesh flags the isolation
actually flips (`neon`/`box`/`hero`) plus the count of T7 derived layers carried with them, and
added a restore check so a later gate on the same page is not measuring a hidden city. **The lesson
applies to the manager as much as to any agent: a test whose observable does not exist is not a
test.** That is now four instances of this failure mode from the manager alone in one session.

### P6's two deliberate §8 deviations — both sharp, both accepted

1. **§8.1 asks for a 0.45 m cabin at camera near 0.1; `CAMERA.near` is 0.5.** Dropping it would take
   the depth ratio from 8,000 to 40,000 and put z-fighting in the city to buy nothing. The cabin is
   built at `HUD.CABIN_Z` 1.10 m at a proportionally larger scale — identical on screen.
2. **The cabin is anchored to the CRAFT, not the camera.** §8.1 says camera, §8.3 wants panels to
   fade on the dot product with camera forward — **those cannot both be true.** Geometry parented to
   the camera holds a constant dot product by construction, so §8.3's fade would be **dead code that
   looks alive**. Anchoring to the craft makes the look-away real and the frame lean into turns.

### Two cockpit problems the manager found by LOOKING at `shots/p6/cockpit_shot.png`

Both get worse in portrait, and both were passed to P6:
- **The dash slab spends the bottom ~40 % of frame on featureless black** — the largest element in
  frame and the least informative.
- **`ALT`/`CELL`/`CARGO` are illegible** at 1000 px on a desktop, so worse on a phone at arm's length.

## P7a — COMPLETE, 30/30 (incl. 6 falsification tests). Verified by the manager.

Built `js/zones.js`, `js/missions.js`, `js/economy.js`, `tools/sim_p7a.mjs`, `tools/gates_p7a.mjs`.
**Manager verified:** `shots/p7a/_gates.json` really is 30/30 and is written in **both** gate
schemas (`results` *and* `ok`/`fail`), so no parser can read 0/0 off it — a direct answer to the
manager's own earlier mistake. **Ownership held:** `main.js` contains no P7a import; the mtime
touches on `main.js`/`hud.js`/`minimap.js` are P6's, and `shot.mjs` was the manager's. P6's
`minimap.js` documents the boundary itself — *"Zones are P7a's, so this file takes them as DATA
through `setZones()`"*. Two agents built to a shared interface without touching each other's files.

The core is **pure** (no three.js, no DOM, no wall clock); `zones.js` takes `THREE` as an argument
so the analytic half still loads in node, and gate T20 scans for a regression.

**Balance, measured over ~5,500 deliveries:** no route dominates — the three legitimate policies sit
inside a **1.07×** spread; grinding one pad returns **59 %** of varied play and HUB-camping **61 %**.
That falls out of the geometry (the pickup is the pad you land on, so the natural loop never flies
an empty leg) rather than from tuning. 0 of 1,590 board slots unreachable, exhaustively not sampled.
0 stranded events in 1,680 careers × 20 min.

**Two errors it caught in its own work** — both the right instinct:
- Its harness's `burn()` discarded the unflown remainder of a leg, so a tow **teleported** the craft
  and "never charge, live on free tows" came out as the best policy in the game. Caught *because* a
  strategy beating every other strategy is a broken experiment, not a finding. `reckless` is now
  worst at 243 CRD/min.
- A falsification test that didn't falsify: F1 perturbed `PER_KM` 130→131 and `round5` snapped it
  back to 415, so it passed. F1 now sweeps and **reports the gate's resolution: 2 CRD/km (1.5 %)**.

### MANAGER DECISION on D1 — the time bonus. Direction chosen; constant NOT yet set.

Measured `timeBonusMean` **0.4500** and `overdueRate` **0.000** on 100 % of deliveries: §7's limit
(`60 + 77.8·km`) gives a 1.8 km job 130 s for **29 s** of flight, so the "bonus" is an unmissable
+45 % markup and its HUD row always reads the same number.

**Decision: make it real (P7a's option 1 in direction), NOT fold it into base pay.** Reasons: §7
clearly intended a losable bonus; decision 6 explicitly allows it (*"running past a limit costs the
bonus and nothing else"* — no fail state, so time pressure stays consistent with the game's tone);
and a UI row that always reads +45 % teaches the player nothing.

**But the manager is NOT setting the constant by hand.** P7a's ~31 makes saturation ≈ exact flight
time, which would flip the bug from always-win to always-lose. **The harness must find it against a
target distribution: bonus fully saturated on roughly 50–60 % of deliveries, fully lost on under
10 %.** This is queued for P7a, not yet done.

**Accepted cost:** this changes §7.4.6's payout of **650** and §7.3's mock "3:20", both of which
§13 states as done-criteria. Those numbers derive from the broken premise, so the criteria are
wrong, not the fix. **Flag to Aaron — reversible, and his call if he wants the markup instead.**

### P7a's other plan defects — recorded, not resolved

- **D2:** §7.4.6's *"~25 s to the pickup"* contradicts §7.4.5's *"pickup is the pad you are standing
  on"*. Implementation follows §7.4.5, the one that describes a mechanism.
- **D3:** §7.4.0's targets 1–3 are solved against 60 s of flight per job; the tier-1 band flies in
  ~30. Fuel is **5.8 %** of base, not the planned 8–12 %. Tier 2 arrives at **2.9 min**, not 8.2.
- **T14 subtlety:** `grep -rn "heat" js/` cannot return nothing — the 6 hits are comments recording
  decision 6. The gate strips comments/strings and scans code: **0 in code, 6 in comments**, and F5
  injects a real one to prove the scan catches it.

### ⚠ P7a WIRING IS PENDING — nothing it built is live in the game

`docs/P7A_WIRING.md` holds the exact patch: `save.js` (`cellUnits`, 4 stat counters, credits 250),
`main.js` (imports, construction, per-frame cell tick, `zonesNear`→`minimap.setZones`, docking, tow,
`__state`/`__game` fields **including a mandatory non-`&&` `setZonesVisible` hook for T7**), and a
board/shop description for `ui.js`. **The manager applies this after P6 lands `main.js`.**

**Live conflict to resolve when wiring:** `HUD.CELL_PER_MIN` (`config.js:290`, used at
`main.js:591/594/598`) is **wrong by 5×** against §7.4.1 and must be deleted once `economy.js`
supplies the real drain curve. P6 has correctly labelled it a placeholder in both files, so the
swap is anticipated — but it is a cross-agent edit and will be missed if not done deliberately.

**Two things P7a could NOT verify, and they are the real gap:** `createZoneVisuals()` has **never
run in a browser**, and §13's two browser done-criteria — the CDP three-delivery script and the
`?auto=1` soak — **were not run**. Its node equivalents pass with margin, but *the analytic flight
model cannot see a wall the autopilot gets stuck on.* **These must run after wiring.**

## P8 — COMPLETE, 30/30. Verified by the manager.

Built `js/audio.js` (656 ln), `js/radio.js` (831 ln), `assets/audio/manifest.json` (73 slots),
`tools/gates_p8.mjs`, `tools/audio_harness.html`, `docs/P8_WIRING.md`, SUNO.md STATUS.

**Manager verified:** gates really are 30/30 and written in **both** schemas. **`assets/audio/` is
genuinely restored** — 31 mp3s (26 chatter + 5 music), 13 MB, none truncated. This mattered: P8
deletes the directory as a test. **Ownership held** — the one `audio.js` hit in `main.js` is a
*comment P6 wrote* anticipating P8, not a P8 edit.

**The silence check is the important one, and it can fail.** All 31 clips carry real decoded energy
(−18.49 to −6.92 dBFS). Falsified against a `volume=0` re-encode of `dispatch_01`: **7.69 s,
65,705 bytes, decodes cleanly — passes exists/decodes/non-zero-length, and is caught by RMS 0.0.**
That is precisely the trap that once let silent clips be reported OK on this project. Enforced in
three places (load, `playClip()`, and an analyser tap on streamed music).

**Music is not on the critical path, measured:** **0 GET requests and 0 bytes** under
`assets/audio/music/` before `__ready`. The mechanism is not ordering — music is an
`HTMLMediaElement` with `preload="none"` whose `src` is assigned only when a pool starts, which
cannot happen before a gesture. TTI medians 302 → 277 ms wired (inside noise). **The "~12 MB" in
this file was `du` block size; the real total is 9.99 MB.**

**Delete-`assets/audio/` runs both ways:** clips gone → boots 488 ms, foreground lines degrade to
text-only popups, synth bed still audible; whole directory gone → boots 300 ms, 43 draws, **0
throws, 0 unhandled rejections**.

**Mobile gesture** tested under `--autoplay-policy=document-user-activation-required` with a
touch-only path (no click ever sent): suspended → running, master bus −11.98 dBFS. **Note for future
gates: `--autoplay-policy=user-gesture-required` does NOT gate Web Audio in headless Chrome** — that
flag would have made the gate unable to fail.

### P8's plan defects

1. **§10.4's repeat arithmetic is wrong in its own favour.** "No foreground line repeats inside
   21 minutes" — 21 min is one bag *cycle*, i.e. a mean, not a floor. Measured: bags alone give
   **0/200 clean 25-min runs**, earliest repeat at 280 s. Fixed with a held-back tail *plus* a
   per-slot cooldown; shortest gap over 60 hour-long runs is now **1500.0 s exactly**. §13's gate
   passes 200/200 — **but the cooldown earns it**, and A4/A5/A6 assert each mechanism separately so
   neither can silently stop working behind the other.
2. **§10.3's boot-time HEAD sweep is 73 requests during startup**, 42 of them 404s. Deferred behind
   ready and throttled to 4; the real safety net is per-load failure handling.
3. **Music must not be `decodeAudioData`'d** — ~76 MB resident per 4-min track, ~380 MB for five.
   Streamed via `MediaElementAudioSourceNode`. §10.3 doesn't say, and a literal reading kills a phone.
4. **§13's `tools/split_chatter.py` deliberately NOT built** — §11 specifies a silence-splitter then
   explains why silence-splitting fails here; `tools/vo/split_take.py` already solves it by
   script-alignment and produced the 22 lines on disk.
5. **`music/menu.mp3` has nothing to play it** — `main.js` has `free|shot|auto|fly`, no menu state.
   Flagged rather than wired to something plausible. **Manager: revisit at P10.**
6. §10.2's "bandpass(300–3400 Hz, Q 0.7)" is self-contradictory (that band is Q≈0.33) — implemented
   as HP300 + LP3400.
7. `settings.js` has no music/sfx/radio rows although `save.js` stores all three — 3 lines, in the
   wiring doc.
8. ✅ **FIXED by the manager:** `tools/shot.mjs`'s MIME table had no `.mp3`, so a gate driving
   `<audio>` through that server would test a coin flip. Added `.mp3/.m4a/.ogg/.wav`.

**P8 was bitten twice by the standing failure mode and caught both:** `JSON.stringify(promise)` is
`"{}"`, so its CDP helper silently returned an empty object that read as a number; and
`radio.update({})` legitimately resolves to the cruise state and **starts streaming music**, which
contaminated the "bed plays with zero files" gate — B4 now asserts its own isolation rather than
assuming it.

### ⚠ P8 WIRING IS PENDING — the audio layer is unreachable from the game

`docs/P8_WIRING.md`: **6 edits to `main.js`**, 3 calls for whoever owns missions/economy, 3 settings
rows. **`index.html` needs no change.** Every field name was checked against real identifiers rather
than guessed, and **Leg D injects the exact patch into the real game** via
`Page.addScriptToEvaluateOnNewDocument`, so D1–D4/E1–E3 are the pending patch working end to end.

## ⚠ INTEGRATION found the defect the analytic model could not see

The manager refused to accept W4's `force-docked — the approach missed` on a green gate count and
required an explicit answer. Chasing it produced a real, game-breaking defect:

**`LEDGE`-placed pads are buried inside buildings — 12 of 12 pad centres INSIDE solid geometry.**
`ROOF`-placed pads: **0 of 12**. Measured, per pad, with the containing volume named:

```
LEDGE  6,-5   PAD       y= 40   INSIDE a bridged whose top is  94 m
LEDGE -2,-4   WORKSHOP  y=243   INSIDE a spire   whose top is 577 m
LEDGE -6,0    CHARGE    y= 59   INSIDE a taper   whose top is 141 m
=> LEDGE: 12/12 pad centres are inside solid geometry
=> ROOF :  0/12
```

A pad inside a building cannot be flown to. The economy's analytic harness scored 0 unreachable
jobs across 1,590 board slots because **its flight model has no geometry** — this is precisely
P7a's own warning: *"the analytic flight model cannot see a wall the autopilot gets stuck on."*

**The autopilot was also wrong, separately.** It levelled off at `pad.y + 8` inside 220 m and flew
a *horizontal* final approach, so any building between it and the pad stopped it dead — measured
**seven escapes in a row on the same pad** (`-6,0`, CHARGE "Ashlock Upper"). Fix: a **vertical**
final descent from directly over the pad, plus `clearance` that buys 45 m more approach altitude per
escape, because without it a pilot that escaped a wall at 20 m out dived straight back into it.

**Lesson worth keeping: a workaround inside a gate hides the bug it works around.** `force-docked`
made W4 pass while leaving the game unflyable at those pads. This is the thirteenth instance of the
project's dominant failure mode, and the first one caught by a manager refusing a green number.

## INTEGRATION PASS — both wirings applied, the game is playable end to end

`docs/P7A_WIRING.md` and `docs/P8_WIRING.md` are **APPLIED**, and each now carries a "what actually
landed" section listing the identifiers that were wrong. Files touched: `main.js`, `save.js`,
`ui.js`, `config.js`, `settings.js`, `missions.js`, `economy.js`, `zones.js`, `radio.js`,
`autopilot.js`, `style.css`, plus `tools/gates_p4.mjs`, `tools/gates_p7a.mjs`, `tools/gates_p8.mjs`
and a new `tools/gates_wire.mjs`.

### The two browser done-criteria nobody had run — BOTH PASS

- **Three deliveries under CDP, portrait 390×844, real touch events on real buttons.**
  250 → 1,495 CRD, **2,467 m actually flown** over 79.8 s of sim, 0 errors. **3 of the 4 docks
  happened on §7.2's own 0.6 s hold**; the 4th was the DOCK button, and only because the craft
  starts standing on the HUB (see the arm rule below).
- **The navigating soak reaches licence tier 2 at 3.55–3.75 min of SIM time** against §7.4.8's
  9-minute gate, 5 deliveries, 0 tows, 60 fps, 0 errors — and within 0.8 min of `sim_p7a.mjs`'s
  analytic prediction of 2.9 min, which cross-validates the harness the whole economy was balanced
  on.
- `createZoneVisuals()` had **never drawn a frame** before this pass. It works: **6 draws / 462
  tris** for the whole zone layer against a 7-draw budget, measured by difference with the layer
  hidden and restored.

### ⚠ `?auto=1` is NOT the soak flag — `?courier=1` is

§13 words P7a's soak criterion as "`?auto=1` reaches tier 2". `?auto=1` is `js/autopilot.js`'s
**fixed 120 s route**, and `gates_p2`, `gates_p4`, `gates_p5`, `budget.mjs` and `soak.mjs` all
measure against it; a navigator that goes wherever the board sends it cannot be the same flag. A
`Courier` class and a `?courier=1` flag were added; **`?auto=1` is byte-for-byte unchanged.** §13 is
updated.

### ⚠ THE DEFECT THIS PASS EXISTS TO HAVE FOUND — ledge pads are inside their own building

**About a third of every pad in the city cannot be docked at.** `zones.js:_site()` returns the
building CENTRE for both pad kinds and only changes the height: a roof pad sits at `h + 1.2`
(clear), a **ledge pad at `0.42·h` — which is inside the mass**. Measured with the chunks streamed,
**8/8 sampled ledge pads are inside solid geometry and 0/8 roof pads are**, over a block where
**21 of 66 pads (31.8 %)** are ledge pads. CHARGE and WORKSHOP pads are affected.

Placed at a ledge pad's centre, §6.3's proximity repulsion pushes the craft **24 m clear** and it
can never get back in. This is not fiddly, it is impossible.

**✅ FIXED BY P7b — see the P7b section above.** The cause was not the height: `render_city.js`
gives every building ONE collision AABB covering its whole footprint, so any point inside it below
the roof is solid and no prototype shelf can help. A ledge pad is now a cantilevered deck OUTSIDE
the tower, 15 m clear of the facade. Measured after the fix, streamed and asserted live: **0/74
ledge and 0/238 roof pad centres inside solid geometry.** `gates_wire` W8 was deliberately a FAILING
gate so a green suite could never be read as "no problem"; it now passes honestly and is kept as the
regression guard, with W10 (station-keeping, old placement as the control) and W11 (a job dropping
at a ledge pad, flown and completed) beside it.

**Read this before trusting any `solidAt()` result — and there is now a hook for it,
`__game.cityChunkLive(x, z)`, which every remote `solidAt` probe must assert first:** `solidAt()` only answers for LIVE chunks and
returns `null` — indistinguishable from "open air" — for one that was never generated. The FIRST
version of this measurement probed 242 pads from the spawn, got `null` almost everywhere, and
**concluded the defect did not exist.** It is measurement-that-measures-nothing instance thirteen,
caught only because the flight model disagreed with the probe. Stream the chunk, `quiesce()`, then
probe.

### The D1 time-bonus rebalance — done, by sweep, not by hand

`PAY.LIMIT_BASE` 60 → **20**, `PAY.LIMIT_PER_KM` 77.78 → **26**, `PAY.RUSH_LIMIT_MUL` 0.6 → **0.85**.
Swept with `tools/sim_p7a.mjs` against a target DISTRIBUTION over ~13,100 deliveries: **56.5 %
fully saturated, 2.9 % fully lost** (target: 50–60 % and under 10 %).

**P7a's own suggestion of `LIMIT_PER_KM ≈ 31` would not have worked** — swept alone it still leaves
the bonus saturated on **97.2 %** of deliveries, because `LIMIT_BASE = 60` dominates the tier-1
band. Both constants had to move; that was not visible without the sweep.

The shape is now right: `dawdle` (0.72 skill) sits ON the ramp at 0 % saturated / 1 % lost, and
`chain` pays 13.1 % fully lost for the parcel waiting in the hold — the routing trade-off §7.4.2
says the chain bonus exists to create, which did not exist before.

**Criteria changed, deliberately:** §7.4.6's *payout of 650 is unchanged* and so is §7.4.7's method;
what moved is the CLOCK — 3:20 → 1:05, 2:10 → 0:42 — and §7.4.7's payout by one round5 step,
1,115 → 1,120. §7.3's mock, §7.4.6, §7.4.7, §13 and gates T2/T3/F1 are all updated.
**Reversible, and Aaron's call if he wants the flat markup instead.**

### Four real bugs the wiring exposed, all fixed

1. **TWO AudioContexts.** `audio.installGestureHooks` binds with `capture: true`, so it always won
   the race against `main.js`'s bubble-phase `resumeAudio`, created its own context, and
   `audio.attach(ours)` correctly refused to switch — leaving audio.js `running` and main.js's
   permanently `suspended`. `__state.audio` read the suspended one, so **the game reported silence
   while playing sound.** `resumeAudio` now adopts whichever context exists.
2. **`radio.state()` threw when the manifest was absent** (`this.dir.state()` unguarded). Because
   `__state` is one getter, that took the WHOLE debug surface down in exactly the deleted-assets
   case the game is supposed to degrade gracefully in. Killed `gates_p8` leg E.
3. **`__game.setZones()` was undone by the game loop** one frame later, so `gates_p6`'s minimap
   fixture was overwritten and the gate failed on code that was fine. Same shape as P6's own
   cabin-isolation bug; the override now outranks the loop.
4. **Missing optional audio polluted `__state.errors`.** A 404 on a track Aaron has not generated
   yet is not a §2.8 error, but four suites assert `errors` is empty and `gates_p4` started failing
   for a missing mp3. Audio-layer issues now have their own visible bucket, `__state.audioIssues`.

### Two gates that had quietly stopped measuring anything

- **`gates_p8` leg D built a SECOND audio layer** on a page that now has one. Two Radios, two
  requests for the same 404. It now ADOPTS `__game.audio`/`__game.radio`, so leg D finally tests the
  shipped wiring rather than an injected copy of it.
- **Leg D's D1 compared "plain" against "wired" — and both were wired.** A `?noaudio=1` flag now
  builds no audio layer at all, so the control arm is a real control.

### Docking ARMS on leaving a cylinder — do not remove this

§3.1.1 spawns the craft ON the HUB deck, inside a zone cylinder at zero speed, so §7.2's 0.6 s hold
fires on the first second of every session. Left alone, `?auto=1` docks at boot and never flies,
taking `gates_p2`/`p4`/`p5`, `budget.mjs` and `soak.mjs` with it. Automatic docking therefore arms
only after the craft has been OUTSIDE a cylinder; §7.2's own **DOCK button** covers "I am already
standing on one", and `gates_p4` turns docking off entirely through an asserted `setDocking` hook.

### Gate results at P7b's final code state (2026-08-18)

`p7b` **20/20** incl. 6/6 falsification · `wire` **15/15** incl. 4/4 falsification (W8 now a green
regression guard, plus W10 station-keeping and W11 a completed ledge-pad drop) · `p1a` 10/10 ·
`p2` **8/8 on six of seven runs**, `ms.gen` worst `1.1 / 0.8 / 1.7 / 1.4 / 1.0 / 1.0 / 0.9` against
1.4 — the one red is §3.2.3's known heavy tail, unchanged and untouched · `p3a` 13/13 · `p3b` 12/12
and **13/13 `--lite --halocost` on two of three runs** (the one red measured a halo cost of
**−0.071 ms**, i.e. noise crossing zero on a proxy; re-runs gave +0.062 and +0.018) · `p4` 19/19
both presets · `p5` 16/16 both presets · `p6` 19/19 on all four configs · `p7a` **30/30** incl. 6/6
falsification, **no threshold touched** · `p8` 30/30 · `determinism` 9/9 with the golden hash
**`f29beaf9` unchanged** (25,039 buildings — the city is byte-identical, which it would not be if
the pad siting had reached into generation) · `t10_falsify` 4/4.

**The one mechanism by which P7b could have moved `ms.gen` was measured and cleared.**
`zones.js:_clearance()` is a new non-renderer caller of `city.js`'s descriptor cache, and that cache
evicts **wholesale** at 900. Over the exact 30 s `?auto=1` flight §3.2.3 measures:
`gens 265 · hits 592 · **wholesale clears 0** · high-water **265** of the 900 cap`. The cliff never
comes near firing. `city.js` keeps the four counters and `__game.cityCache()` so the next agent can
ask the same question in one call.

### Gate results at the integration code state

`p1a` 10/10 · `p2` 8/8 ×3 (worst `ms.gen` 1.2 / 1.0 / 0.9 against 1.4 — §3.2.3 passed all three)
· `p3a` 13/13 · `p3b` 12/12 and 13/13 `--lite --halocost` · `p4` 19/19 both presets · `p5` 16/16
both presets · `p6` 19/19 on all four configs · `p7a` 30/30 incl. 6/6 falsification · `p8` 30/30 ·
`determinism` 9/9 · `t10_falsify` 4/4 · `budget --headed` both presets pass · `gates_wire` **12/13,
the one red being W8, which is the ledge-pad defect and is meant to be red.**

## P7b — COMPLETE. The ledge defect is FIXED, T8 is CLEARED, and the panel exists.

Full write-up in **`docs/P7B_NOTES.md`** — read that before re-opening any of it. Headlines:

### The ledge-pad defect — fixed, and the fix is measured against the same probe

The cause was never "the height is wrong". `render_city.js` gives every building **one collision
AABB** — the full `w × d` footprint extruded from the ground to `h`, with no knowledge of a
prototype's setbacks — so **any** point inside the footprint below the roof is solid, and `0.42·h`
was inside by construction. `blocks.js` *does* have real shelves (`podium` at 0.30 h, `bridged`'s
sky bridge at 0.60 h) and **none of them helps**: collision cannot see them, and the widest is ~9 m
on a footprint capped at 38 m by §3.1's lot, against a **14 m-radius** docking cylinder.

So a ledge pad is now a **cantilevered deck outside the tower**: `LEDGE.OUT = 15 m` from the facade
(> `FLIGHT.REPEL_RANGE` = 12, so the parent tower contributes **exactly zero** repulsion at the pad
centre), on the first of four faces with `LEDGE.CLEAR = 13 m` against every other mass that reaches
the pad's height — one test that also keeps the vertical descent column open. No face clears → it
falls back to a roof.

**Blast radius is deliberately tiny**: the ledge roll is still drawn from the same rng stream in the
same place, and the face/height rolls come from a separate salt, so which chunks have pads, which
are RUSH, and where every roof pad sits are **unchanged**. `gates_p7a` is 30/30 with no threshold
touched.

| 29×29 chunk block | before | after |
|---|---|---|
| **LEDGE centres inside solid** | **74 / 74** | **0 / 74** |
| **ROOF centres inside solid** (positive control) | 1 / 238 | **0 / 238** |
| ledge horizontal clearance | 0.0 m everywhere | min **13.0**, median **15.0** |

**A second defect the same measurement found: 1 of 45 sampled ROOF pads was buried under a taller
neighbour.** The original 8-pad browser sample missed it. `_site` now walks outward from its biased
index to the first candidate with an open roof, using no extra rng draw.

### W8 passes honestly, and two things make it trustworthy

- **`__game.cityChunkLive(x, z)`, asserted before every probe.** `solidAt()` returns `null` for open
  air *and* for an ungenerated chunk — the ambiguity that made an earlier 242-pad sweep conclude the
  defect did not exist. W8 now **throws** on an unstreamed chunk instead of banking it as clear.
  **Any future gate probing `solidAt` at a remote point must call this first.**
- **The predicate is a depth, not a boolean.** `solidAt` tests `y <= top`, so a pad resting exactly
  on a deck reads solid at depth 0 — which the **HUB** does, because §3.1.1 authors it *at* the
  spindle's 92 m podium. Burial is `top − y > 0.5 m`, with the raw count reported beside it.

Two gates W8 alone cannot answer, both added:
- **W10** — a craft holds station at a ledge pad under the real flight model, with **the old
  placement as the control**: fixed pad drifts **0 m** with repulsion **0** and the nearest AABB
  15 m away; the tower centre drifts **21 m** with repulsion **4.35**.
- **W11** — a job whose **DROP** is a ledge pad is flown to and completed, found by walking real
  boards. This is the direct answer to "can you complete a ledge-pad job".

`gates_wire` W4 no longer filters `!z.ledge` when picking a CHARGE pad; that filter existed only
because of the defect.

**Cost:** `createZoneVisuals` gained one `InstancedMesh` for the deck (a slab, a facade bracket and
three lit rails in one geometry, vertex colour carrying the dark/bright split). `visible = false` at
count 0, so the zone layer is still **6 draws** in the common case and **7** with a ledge pad among
the nearest three — one over `zones.js`'s own stated 7-draw worst case, 49 of §3.8's 65 overall.

### T8 is CLEARED — see the table now at the top of DECISIONS' T8 entry

D1 inline under an iPhone UA · D2 the forced `play()` rejection → still-with-shimmer, `<video>`
removed, 0 errors · D3 **0 `.mp4`** from the board (3 thumbs, 0 stills) · D4 `assets/clients/`
**actually deleted**, game boots with 0 errors and is fully playable, then restored byte-for-byte
and re-verified in the running game. `muted playsinline webkit-playsinline` read off the live
element.

### The panel: `js/dock.js`, and why the board and the panel are two screens

§9.1 requires the board to use only the 96 px thumb and the video's `src` to be set only when the
panel opens, and §13 asserts zero `.mp4` from the board — **a board with the video inlined cannot
pass that gate however it is written.** So `#ui` stays the board (list, HOLD, CHARGE·SHOP, now with
thumbs) and `#dock` is §7.3's deal panel. Every existing gate selector is untouched, so no prior
suite needed editing.

§7.3's checklist is worked through item by item in `P7B_NOTES.md` §2, including the measured ones:
**three type sizes exactly (10/14/28)**, one family, one weight change, tabular numerals, the only
round thing is the reliability meter, **0 `backdrop-filter` declarations**, and landscape is a pure
CSS grid switch with **1,440 characters of identical HTML** across the flip.

### The two board defects

- **Every job was the same client.** Fixed by varying the **client**, not the line: `clients.json`
  gives each client one line, and the panel shows a portrait and a faction that would not vary
  either. §7.1 is kept — **slot 0 is still the pad's own operator** — and the other slots are offset
  by a hash of (pad, gen) **plus the slot index**, so a 3-slot board can never repeat a client. A
  per-slot random offset would repeat about 7 % of the time with sixteen clients.
- **The boot toast covered the sticky header.** Fixed with a **measured** reservation, not a magic
  offset: `UI._reserve()` writes the rail's real bottom edge into `--toast-h` and the panel layers
  take `max(safe-area, rail + 8px)`. B2 measures the rect intersection (0 px²); F4 zeroes the
  reservation and shows the probe seeing 4,426 px² of overlap.

### P7b's plan defects — reported, not resolved

1. **§13's `backdrop-filter` grep criterion cannot be satisfied as written** — same shape as P7a's
   D5 (`grep heat js/`). The three mentions in `style.css` are comments recording why it is banned.
   Gate P3 strips comments and counts **declarations** (0), reporting the mention count beside it.
2. **§7.3's "the zone's tint" and T8's "`tint_hex`" contradict each other.** Resolved for `tint_hex`
   — it is the colour the portrait was lit with, so the UI agrees with the image. Consequence worth
   knowing before it is reported as a bug: two of the sixteen clients are authored *cold white* and
   *pale ice-blue*, so their panels read near-white. That is P9's palette rotation.
3. **§7.3's reliability meter has no data behind it.** Implemented as a documented hash of the
   client id and flagged as derived in the source.
4. **§7.3's mock is a single-job panel; §7.4.5 puts 2–3 jobs on a board.** The plan never says these
   are different screens, and a builder reading §7.3 alone would build one.
5. **`tools/shot.mjs`'s static server had no `Range` support** — a `<video>` got a chunked 200 with
   no `content-length` and could not report a duration. Added (206 + `accept-ranges` +
   `content-length`); same class of fix as P8's missing `.mp3` MIME type.

---

## P10 SHIP — DONE. `a0627f0`, live and flown on the live URL.

### ⚠ THE LIVE URL IS NOT `y-r-u.github.io` — it is **https://yru.br8t.com/**

The repo has a `CNAME` of `yru.br8t.com`, so `y-r-u.github.io/gms/3d/neonhaul/` answers **301** and
redirects. A verification loop polling the `github.io` host without `curl -L` reads `301` forever
and never sees the deploy — which is exactly what P10's first check did for ten minutes. **A status
code from a URL you did not follow is not a measurement of the resource.** Instance eighteen, and
the first one committed against the *live site* rather than a gate.

Game: **https://yru.br8t.com/gms/3d/neonhaul/**

### What shipped

`a0627f0` on `main`, **178 files / 14.25 MB**: the whole of `gms/3d/neonhaul/` minus the ignores,
one hunk of `projects.js`, and `assets/screenshots/neonhaul.jpg` (the frozen `hero_craft` render at
1600×900, q88 JPEG, 285 KB — in line with the other 99 screenshots). Committed with `commit-tree`
against `main` from a **temporary index**, because the checkout was on another session's
`claude/forge-game-checkpoint` branch (3 ahead / 17 behind `main`, full of FORGE work). The working
tree was never switched and nothing of anyone else's was staged; `git diff --cached main` was read
in full first.

`.gitignore` gained `shots/*/` in place of a hand-list of four phase dirs — `p4 p5 p6 p7a p7b p8
p11 wire` had appeared under it since, and **25 MB of evidence renders were about to be committed
by a rule whose own comment says renders are not.** A glob cannot fall behind that way.
`CLAUDE.md` written (§2.1 assigns it to P10).

### Verified ON THE LIVE URL, not locally

| | desktop 1280×800 | mobile 390×844 dpr 2, touch |
|---|---|---|
| document | **200** | **200** |
| `__ready` | **true**, 2 s | **true**, 1 s |
| `__state.errors` / console errors / thrown | **0 / 0 / 0** | **0 / 0 / 0** |
| draws / tris / chunks | **49 / 160,944 / 169** | **49 / 160,944** |
| non-audio 4xx/5xx | **0** | **0** |

Byte sizes on the wire match disk (`main.js` 113,658, `style.css` 30,558, screenshot 285,020).
The **42** 4xx are all `assets/audio/` — the optional SUNO slots (police, pirate, ad, distress,
weather, life, `bg_dock`, `music/chase`, `music/first_flight`) that Aaron has not generated. They
land in `__state.audioIssues`, not `__state.errors`, which is P8's design working.

**And it PLAYS live, which "it booted" does not prove.** `?courier=1` on the live URL in mobile
portrait for 180 s: **4 jobs taken, 3 delivered, 0 failed, 0 tows, 250 → 1,735 CRD** (lifetime
1,485), **60 fps**, 0 errors, 0 thrown exceptions.

Projects page: the card is on `https://yru.br8t.com/`, badge `Game`, link `/gms/3d/neonhaul/`,
and its `<img>` reports **naturalWidth 1600 × 900** — the JPEG decoded, not merely 200'd.

**Both verification scripts were falsified before their green was believed.** The boot checker was
run with `js/main.js` renamed away: it returned `docStatus 200, ready false, 404 Script` — the
precise "200 on the HTML, 404 on the JS" case, caught. `main.js` was restored and the re-run
reproduced 49 draws / 160,944 tris exactly. The card checker was run for `NEONHAULX` and returned
`found: false` on the same 12-card page.

### What P10 did NOT do

- **§13's real-device measurement (§3.11.2) — Aaron's phone, cannot be done from here.** The four
  `?perf` numbers in portrait and landscape at default and `?lite=1` are still owed.
- **No critic round, and `day_smog` is unscored.** P10 ran as a single agent under Aaron's usage
  limit; a critic round is three `fp-critic` subagents per shot and was not authorised. Round 7
  stands as the last scored round.
- **T6.2 (the six landmark sign words) — NOT done, and its recipe does not work.** See below.

### ⚠ PLAN DEFECT — T6.2's prescription is impossible as written

DECISIONS T6.2 says: at P10, "add the six words to `data/signwords.json`, re-run
`tools/bake_signs.mjs`, drop the alias table in `signage.js`". **The baker takes the FIRST n
entries of each list** (`signwords.json`'s own `_readme` says so) and **`board_en` is already
exactly n = 40** — so words appended at the end are never read, and the file's advice to "add words
at the END" guarantees they are ignored. Including them means editing the `KINDS` table in
`tools/signbake.html` (40 → 46), which takes the sheet from 250 regions to 256, **repacks the atlas
and moves every UV in it**, invalidating `assets/signs.png`, `data/signs.json`, `gates_p3a`,
`gates_p3b` and possibly the golden hash — on ship day, for six words that are already aliased to
plausible substitutes. That is precisely what T6.2's own "**do not re-bake `assets/signs.png`
mid-run**" warning exists to prevent. **Left aliased. Reopen it only with a phase budget.**

### Two dead counters, reported not fixed

`stats.distance` and `stats.playtime` are declared in `js/save.js` and `js/economy.js` and are
**never incremented anywhere** — they read 0 after a 180 s flight with three deliveries. Neither is
displayed to the player or read by progression (tier comes from `lifetime`), so they are dormant
save fields rather than a visible bug. Noted because a stored number that can only ever be zero is
this project's signature failure mode in miniature. `stats.spentFuel` **is** wired
(`economy.js:310`); it read 0 only because the pilot never needed a recharge inside three minutes.

---

## P10 SHIP — the original instruction, 2026-08-18

> "as part of commit, add to projects so it can be tested externally."

**So the commit MUST make the game reachable from the live site**, not just present in the repo.
Concretely:

1. **Add a `projects.js` entry** — visible, **NOT `hidden: true`**. The point is external testing.
   Format, matching the existing 3D game entries:
   ```js
   { name: "NEONHAUL",  path: "/gms/3d/neonhaul/",  screenshot: "neonhaul",  type: "game",
     desc: "<one line — cyberpunk courier flying: fly a hover-craft between rooftop pads, take
            parcel jobs, dock, get paid, upgrade the craft>",
     date: "2026-08-18", creator: "Opus 5" },
   ```
   `type: "game"` puts it on the Projects page. `creator: "Opus 5"` is the value already in use for
   this model (45 entries use `"Claude"`, 11 use `"Opus 5"`).
2. **Add `assets/screenshots/neonhaul.jpg`** — the registry expects `.jpg` at that exact name.
   Pick a frame that sells it; the P11 `canyon_dive` render or a cockpit portrait shot are the
   candidates.
3. **Verify the live path works**, remembering the site is served from the repo root, so the game
   lives at `/gms/3d/neonhaul/` and every asset path must resolve **relative to that**, not to a
   local dev server root. A path that works on `127.0.0.1:8232` and 404s on Pages is the failure
   mode to check for — actually load it after the push.

**Staging discipline is unchanged and still matters:** stage ONLY paths under `gms/3d/neonhaul/`,
plus **your own hunk** of `projects.js` and `assets/screenshots/neonhaul.jpg`. Other Claude sessions
have uncommitted work in this repo — never `git add -A`, never `git commit -a`.

Note the home Projects grid groups by month and defaults to the current month (see the user's
`projects-page-month-reveal` memory), so an entry dated `2026-08-18` shows immediately.

## Carry-forward

- **T10 — the helper and the fix are DONE by the manager; verification is BLOCKED on P6's boot.**
  - `tools/shot.mjs` now exports **`hook(S, name, ...args)`**, which throws a T10-named error when
    an isolation hook is missing instead of letting it no-op.
  - All **five** real sites are converted in `tools/gates_p2.mjs` (lines 210/225/226/227/267:
    `setSignVisible` ×2, `setRain`, `setSilhouettes`, `freezeTime`).
  - **`DECISIONS`' T10 text overstates the scope.** It says "every gate file"; the actual
    `X && X(...)` isolation pattern existed **only in `gates_p2.mjs`**. The other files' `&&`
    occurrences are legitimate boolean logic and must NOT be touched. There are no `?.()` or
    `typeof`-guarded variants anywhere.
  - `tools/t10_falsify.mjs` is written and **proves the fix three ways**: an existing hook is called
    with observable effect; a missing hook **throws** with T10 named; and the OLD `X && X(...)` form
    on the same missing name resolves quietly to `undefined`, measuring the fix against the real
    defect. **It has not run yet — it needs the game to boot.** Run it, then `gates_p2` ×3 and
    report the dither residue each time.
- ~~**P7b inherits four of P9's gates** (T8)~~ — **CLEARED 2026-08-18.** All four measured in
  `tools/gates_p7b.mjs`; see DECISIONS' T8 entry for the table.
- ~~**P11 is Aaron's art pass**~~ — **DONE 2026-08-18.** See the P11 section. Colour, signage scale
  range, close-up detail and the ground are all landed and measured; the ground was a defect and the
  mirror was not it; sub-levels are a written design note (`docs/SUBLEVELS.md`) and nothing more, by
  instruction. **Aaron flies it next and has the final say** (ART_PASS). The one thing P11 did NOT
  close is the complaint every critic still leads with — *"every light source in this image is a
  sticker"* — and `SCORES.md` round 7 lists what six critics say would close it.
- **Decision 14:** the low critic scores are a *composition* problem — every reference plate has a
  hero craft, ours were city-only. P5's re-score of `fog_city`/`canyon_dive` with a craft in frame
  is the experiment that tests it.

## The dominant failure mode on this project

**Measurements that silently measure nothing.** **The count is now SEVENTEEN.** P11 added one and
it is the oldest yet: `gates_p3b`'s §3.7(b) occlusion gate asserted that the mirror moves none of
the cells a near tower covers — at a camera where the mirror group (`y < 0`) is only ever visible on
the non-depth-writing road, so nothing could have moved those cells under any circumstances. It had
passed for two phases. See the P11 section. The correction is worth carrying forward as a method:
**derive the set of cells you are asserting about from a pass with the mechanism deliberately
broken**, so a set that could not fail cannot be mistaken for a set that passed.

Earlier instances: silent audio clips reported
OK; a layer compared against itself returning exactly 0.0; a frame counter reading an absent header
field; a PSNR check that measured the encoder not the edit; a collision gate racing chunk
streaming; `&&`-guarded isolation that no-ops; and an empty gate file that looks like a suite.

**Standing rule in every brief:** when you assert a gate works, prove it can fail — break what it
guards and confirm it catches it. A difference of exactly zero is a broken experiment far more
often than a real result. A test may never use `&&` to make its own setup optional.

**P7b added two more instances, both caught by its own falsification pass, and both are the same
shape wearing new clothes:** a `.mp4` counter that read zero because Chrome reused an `<img>` from
the document's memory cache and the board made no requests *at all* (a real zero and a vacuous zero
are the same number — `F3` now proves the counter can see an `.mp4` before D3's zero is allowed to
mean anything); and a playback test comparing `currentTime` t1 > t0 that failed on a perfectly
healthy clip which happened to wrap between the two samples. **The count is now sixteen.**

## Audio — done by the manager via Chrome automation, not an agent

**26 chatter clips + 5 music tracks** in `assets/audio/{chatter,music}/`; every *required* slot in
`SUNO.md` is filled. `dispatch_01–06`, `dispatch_confirm_01–08`, `dispatch_pay_01–08` all came from
**one 22-line take** so the operator is one voice. `bg_net_01–04` from one ambient take. Music:
`menu, cruise_a, cruise_b, cruise_day, docked` (~12 MB — **P8 must lazy-load, not block startup**).

**Still to generate, all optional:** police, pirate, ad, distress, weather, life, `bg_dock`.

**Pipeline:** `tools/vo/split_take.py` aligns a known script against whisper's word stream and cuts
per-line mp3s; `tools/vo/vw/` is its venv. Both gitignored, as is `tools/vo/raw/`.
- Suno UI download is 3 clicks per track — instead scrape the title→id map off the page and pull
  `https://cdn1.suno.ai/<clip-id>.mp3` directly.
- Set a **Song Title** on every generation; downloads and the id map key off it.
- Music: Lyrics → **Instrumental** *and* "vocals, singing, voice" in **Exclude styles**.
- Typing a long lyric freezes the page ~30–60 s and the CDP call times out; the text still lands.
- **Traps paid for:** `-ss` after `-i` leaves the filter graph on original timestamps so
  `afade=t=out:st=<n>` silences the whole clip — put `-ss` before `-i` and `asetpts=PTS-STARTPTS`
  first. Whisper mis-assigns opening words to the previous segment — put boundaries at the
  **midpoint of the gap**, not at matched word edges.
- **Aaron's rule:** a take at ~7:59 hit the 8:00 cap and never resolved — discard it. Other length
  differences are normal and are a musical judgement the manager cannot make. Raw variants stay in
  `tools/vo/raw/` so a swap is a re-encode, not a regeneration.

## Reference art

`~/cc/yru/gms/3d/aaa_refs/cyber/` — outside `site/`, never committed, never shipped. All six
scoring plates audited; `plates.json` carries an `audit` field on each (DECISIONS T1).

**Standing lesson:** verify a crop rect by **rendering it and looking at it**. Arithmetic has passed
two rects on this project that leaked contamination when rendered.

## Local servers (die with the session — restart after any restart)

```
cd ~/cc/yru/site                       && python3 -m http.server 8232 --bind 127.0.0.1 &
cd ~/cc/yru/gms/3d/aaa_refs/cyber      && python3 -m http.server 8231 --bind 127.0.0.1 &
```
- `127.0.0.1:8232/gms/3d/neonhaul/` — the game, its `shots/`, `assets/clients/`, `assets/audio/`
- `127.0.0.1:8231/cyber_reference_board.html` — the reference board

## Aaron's preferences established this run

- **People in the 3D world: SUPERSEDED as of pass 2-M (2026-08-23).** The old rule was "none at
  all — docking-panel portraits only, distant cloth silhouettes the one optional exception, audio
  carries the populated feel". Aaron then played the shipped build and asked for the opposite
  inside the shopfronts: *"People in the shops are too clearly 2d black silhouettes. Maybe make
  cute simple cloth people (people wearing from top to bottom a cloak). Eyes have a colour band,
  futuristic look. Have simple movements for the people. E.g taking a drink/ talking etc."*
  So: **figures ARE wanted where the player is close enough to read them**, as cloaked shapes with
  a lit eye band, and the "no people" rule now means no walking crowds on the street and no rigs —
  not no depiction. Do not "correct" the shop figures back to silhouettes.
  Note also that `js/silhouettes.js` carries an explicit kill criterion in its own header ("if a
  critic round calls them flat, cardboard or sprites, DELETE THIS FILE"). Aaron's wording is that
  criterion firing — but it fired at the SHOPFRONT figures in `materials.js`'s `SHOP_ROOM`, which
  are a different feature that happened to have the same defect. The rooftop silhouettes were not
  what he was looking at.
- **Signage:** mostly English + abstract; a small set of real Japanese only because it is cheap.
- **Flying high must be possible, but most play is low** — gate the aerial treatment on altitude so
  the common path costs nothing. Done in P3b's fog shader, verified at exactly 0.0 cost below 340 m.
- **Vehicles:** very dark bodies with a hue, **reflective**, colour from highlights/trim, varied,
  some with partial or no trim. Full spec at the end of `ART_PASS.md`.
- **"my initial flight was easy. promising."** — P4's core requirement met.
- He watches work-in-progress renders, and **this has now produced two false alarms** (the second:
  cars "reading red", already fixed while he was typing). **Before turning any of his observations
  into an agent instruction, establish whether he was looking at a finished surface.** Ask him, or
  check the file timestamp against the agent's activity. His *design* notes are always worth
  keeping even when the *defect* report turns out to be stale — separate the two: log the design
  intent, verify the defect before acting.
- He wants to play it before discussing gameplay. Until it is pushed, the manager decides.
