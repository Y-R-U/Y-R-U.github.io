# SKYHAMMER — DECISIONS

Manager-only. Numbered, terse, never rewritten — superseded entries get a follow-up, not an edit.

**D1** — New project, not a KITEHAWK fork. Aaron: "start from scratch". Salvage limited to
`tools/cdp.mjs`, `shot.mjs`, `touch.mjs`.

**D2** — **Landscape**, not portrait. KITEHAWK's late portrait pivot cost it; the threat in a
side-scroller arrives on the horizontal axis, so the screen must be wide.

**D3** — Vanilla ES modules, Canvas 2D, no build step, no CDN imports, no npm. Matches the site
and dodges the repo-wide gotcha where a CDN import hangs a game silently.

**D4** — `js/sim/**` must run under plain node with no DOM. This is what makes balance testable
without a browser, and it is the reason `tools/sim.mjs` can exist.

**D5** — All art is drawn procedurally into offscreen canvases at boot. No image files. KITEHAWK
died partly on badly-keyed generated PNGs; procedural art cannot have a matte artifact, recolours
per era for free, and downloads in bytes.

**D6** — Camera: fixed vertical framing at `CAM.baseY` until the plane enters the top 12%, then
it tracks. Fast up, slow down. Aaron's spec, item 6, and explicitly expected to need retuning.

**D7 — Flight control is POINT-AT-FINGER.** Aaron, mid-build: "you just put your finger down and
the front of the plane kind of follows your finger... finger goes up and around in a circle, the
front of plane follows". This **replaced** the manager's first draft, which was a rate control
(vertical drag on the left half sets pitch *rate*). Position control is more direct, has no drift
to correct, makes a loop fall out of circling the thumb, and turns Manoeuvrability into a clean
stat: how fast the nose can chase the finger. Contract patched before any agent read the draft.

**D8** — Four concurrent P1 agents, on disjoint file sets, only because the `world`, `makeRenderer`
and `hitrects` contracts were written and the data tables seeded first.

**D9** — The player's aeroplane must be the highest-contrast object on screen, enforced in the
drawing and measured by a gate that has been **proven to fail** against a deliberately
sky-coloured plane. KITEHAWK passed a silhouette-size gate ten times while the plane was still
hard to find; that was the right quantity measured badly.

**D10** — The point-at-finger control is **relative, not absolute**. Aaron: "it is relative to
start of finger down, so you can tap on the left hand side of screen and that now represents your
play control start and you can fly from there." So the steering angle comes from the finger's
offset from its own touchdown anchor, never from the plane's screen position. Consequences: the
player may steer from anywhere including either side; only the *angle* of the offset is read, so
small and large thumb movements steer identically; a floating anchor (`CTRL.maxPx`) stops a long
sweep running off the edge. Supersedes the absolute reading in D7.

**D11** — `settings.handedness` mirrors the four special-weapon buttons to the other bottom
corner. It does **not** restrict which side you may steer from — with a relative control that
restriction would be meaningless. Aaron asked for the toggle; this is what it does.

**D12** — **Three.js side-on 2.5D, not Canvas 2D.** Aaron raised it and chose it: he can confirm
code-built 3D models are a strength, whereas painterly 2D is the weaker hand. Gameplay is
unchanged — pure XY side-scrolling, a narrow-FOV perspective camera locked side-on, z used only
for parallax and lighting. The swap cost almost nothing because the renderer was already behind
`makeRenderer(canvas)`; sim, data, levels and UI work were untouched. Supersedes D5's *mechanism*
(procedural canvas painting) while keeping its *reason* intact: geometry built in code cannot
have a matte artifact and recolours per era for free.

**D13** — Narrow-FOV **perspective** camera, not orthographic. Ortho gives no parallax from z, so
background separation would have to be faked per layer; a 20° perspective camera far back reads
just as flat in the gameplay plane and gets parallax, depth-correct lighting and fog for free.

**D14** — The HUD moves to a **separate 2D overlay canvas** above the WebGL canvas. A WebGL and a
2D context cannot share one canvas. `js/ui/hud.js`'s signature is unaffected.

**D15** — Three.js is **vendored** at `vendor/three/` (r180, copied from `gms/lib/three/0.180.0`,
including `UnrealBloomPass`). Never a CDN import: the repo-wide gotcha is that a CDN `three`
import hangs the whole game silently, and every 3D game in this repo but NEONHAUL still has it.

**D16** — The project stays at `gms/2d/skyhammer/` despite now using Three.js. The repo sorts by
tech, so `gms/3d/` would be more consistent, but four agents are mid-flight against absolute
paths and it plays as a 2D side-scroller. Not worth breaking them over.

**D17** — Boss `parts` schema ratified as authored. `boss.hp: 0` means no body HP; **the boss dies
when every `weak: true` part is dead.** Destroying a non-weak part permanently disables its
`shoots`. Blasts damage every part in radius, which is what makes a heavy bomb feel right against
a big target.

**D18** — Objective matching stated once, in CONTRACTS §15.2. `kill` is an **alias** of `destroy`,
not a second code path. A death counts however it happened — player weapon, blast, collision, or
an enemy flying into a hill. Requiring the player to have landed the blow makes a distinction the
player cannot see and produces objectives that read as broken. This was the DESIGN agent's
biggest flagged risk: had `mission.js` matched differently, all 100 levels needed re-checking.

**D19** — SIM implements all five of DESIGN's extra weapon fields (`moneyMult`, `fuseDelay`,
`returns`, `stunR`/`stunTime`); `flavor` is presentation only. Each is a few lines and each *is*
the weapon it appears on — a boomerang bomb that doesn't come back is just a bomb.

**D20** — Palettes are **composed from biome × time-of-day × weather**, not enumerated. 6×4×3 is
72 combinations; composition needs 13 authored entries and makes every future combination free.
Weather is a modifier (fog density, cloud cover, attenuation, desaturation), never its own palette.

**D21** — **Terrain framing is a hard constraint, not taste.** Measured: mean terrain y +65.6 and
peaks +190 against `CAM.baseY = -170` gave a 26%-average, 40%-peak earth band, against the
reference's ~10%. Ruling: `CAM.baseY = -100`, terrain mean ≈ 0, range [-90, +120], alpine peaks to
+200 rare and short, mountains move to a background parallax layer. Asserted in `tools/sim.mjs`.
This surfaced as "the art looks wrong" and was a number in the terrain generator — worth
remembering the next time a look problem is reported.

**D22** — The aeroplane stays ~120 world units, 6.2% of screen width. **Never scale it up.** The
frame reading as mostly sky and air *is* the look; a bigger plane reads instantly as a cheaper game.

**D23** — Every lab page and debug capture must burn its **resolved** configuration into the frame
— palette key actually used, seed, level, size, dpr. A word-splitting bug produced three
identically-wrong stills with correct-looking filenames. The requested value is what lies to you.

**D24** — Background plates must be **horizontally seamless**. Confirmed real, not theoretical: a
1600px mountain plate showed a hard-edged wedge once per screen width in every frame. Any
generated plate that cannot tile is not usable as a plate.

**D25** — Aaron: the earth band should be **10–30% on average depending on the layout**, and the
whole camera question gets revisited after playtesting, so the first version ships the initial
description rather than a refined one. Consequence for the D21 gate: a **flat threshold is the
wrong instrument**, because 26% is both inside Aaron's acceptable range and exactly what the D21
bug measured. Replaced with per-level intent — `level.terrainProfile` of `flat|rolling|hilly|
alpine`, each with an amplitude and an expected band range in `TERRAIN.profiles`, and the gate
fails when a level's measured band falls outside its own declared profile. Catches "the generator
did not do what the level asked for" while leaving the full 8–32% span open to design.

**D26** — **Altitude is an available answer to ground AA.** `plasma_nest` had range 2400 against
`PHYS.ceiling` 2400 — the sky had no sanctuary anywhere, and the engine agent's `--all` sweep
showed long-range ground AA dominating every act's damage table. Capped: `plasma_nest` 1800,
`laser_turret` 1700, `sam_site` 1600, against a 2400 ceiling. So ~600 units of high sky are safe,
and you still have to descend into the envelope to bomb anything. Climbing to escape and diving to
attack is now a real decision instead of a non-option.

**D27** — `landSpeed` added to every plane at **1.18 × stall**. CONTRACTS §9 required it and no
plane had it, which is why the engine agent found landing unreachable as written: level flight
eases to `cruise`, which is far above any sane landing speed. Its fix — a pad approach box that
drops the cruise target — is ratified; the data gap is now closed too.

**D28** — a1-03 eased from six fighter kills to four, and its second wave from 3 bf109 to 2. Six
bf109 (hp 130, turn 3.0, cruise 540) in a stock Kestrel (hp 100, turn 2.6, cruise 430, ~19 gun
hits per kill) was the sharpest spike in act 1, on the level that also teaches landing. Teaching
levels do not get to be the hardest thing in the act.

**D29 — the reference autopilot is a REACHABILITY oracle, not a balance oracle.** It wins 18 of
100 levels, but its failure rate is flat across all five acts (a1 14/20 … a5 18/20), which is the
signature of a weak pilot rather than act-specific content problems. So: trust it to answer "can
this objective be completed at all" (it already caught vehicles driving off the map, making an
objective permanently unreachable) and do **not** read its win rate as difficulty. Balance is
Aaron's playtest, and the numbers move after he flies it.

**D30 — `tools/cdp.mjs` was fabricating evidence and is no longer frozen.** It picked a devtools
port at random from 600 and hoped. Across dozens of launches by parallel agents a collision is
near-certain, and a collision is *silent*: the second Chrome fails to bind, `/json/list` answers
with the first one's targets, and you attach to another agent's page and screenshot it as your
own. That happened, and was reported. Fixed two ways — the port is now proved free by an actual
bind before use, and after attaching we assert the target list is a fresh Chrome (exactly one page
target, at `about:blank`) and throw loudly otherwise. **Falsified against a real decoy Chrome
serving a non-blank page: the guard fires and refuses the capture.**

**D31 — Upgrades are GLOBAL, not per-plane.** The UI stored them per-plane while `sim/plane.js`
reads a **flat** map — so per-plane storage silently fed the sim zeros and every upgrade the
player bought would have done nothing. That latent integration bug settles the design question on
its own. It is also the better design: per-plane upgrades punish buying a new aircraft, which
fights the whole evolution fantasy, and the economy was costed against a single sink.
`upgradeLevel()` migrates a legacy per-plane save by taking the best level seen.

**D32 — Upgrade price curve 1.34 → 1.13.** At 1.34 over 20 levels the compounding is **292×**: the
full upgrade track cost **£718,554 against a £80,000 top-tier aircraft**, and a single late step
cost more than two tiers of plane. At 1.13 the full track is £60.6k — **0.76× the top plane**, so
planes and upgrades are comparable sinks across a campaign, and a level-4 armour step is 21% of
the aircraft it sits on rather than 41%.

**D33** — Money and stars are banked by **`main.js`**, not the results screen. The results screen
displays an already-banked payload (`record: false`). One source of truth survives a player
closing the tab on the debrief, and the other modes need the same banking without the story
results screen.

**D34** — `UPGRADES[].step(v)` is the **cumulative** bonus at level `v`, not a per-step increment.
Both consumers already read it that way; documented rather than renamed.

**D35** — Story milestones land on the **debrief** and act intros on the **brief**, not the hangar.
The UI agent's call and it is right: there is no room for prose in a 390 px hangar.

**D36** — `mission.tag(world)` marks ents that count toward an unfinished objective, every 8th
frame. The HUD's minimap ticks and off-screen chevron read `ent.objective`. This keeps the §15.2
matching rule in one place instead of the UI reimplementing it against level data — which is
exactly how the 100 levels would have drifted out of sync with the sim.
