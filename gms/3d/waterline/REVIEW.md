# BUILD_PLAN.md — adversarial review

Reviewed against `GAME_BRIEF.md`, `~/cc/yru/gms/3d/aaa_refs/naval/{README.md,CRITIC_PROTOCOL.md,_body.part}`,
`../forge/{CLAUDE.md,NOTES_*.md}` and the FORGE source, and against the code already landed in this
folder (`js/engine/*`, `js/main.js`, `tools/*`, `HANDOFF_ENGINE.md`).

---

# BLOCKING — fix before a coder opens an editor

## B1. Nothing owns the enemy fleet's position in the world. C6 cannot be built.

The sim speaks in `{r,c}` on an abstract grid. Every cinematic beat in the brief needs a **world**
position: where the shell flies to, where the splash lands, which ship model is at that cell, where
the camera sits to watch it. §2.2 gives `buildTable().cellToLocal(r,c)` — that is the *table*, a
prop in the bridge. There is no `seaCellToWorld(r,c)`, no fleet-layout module, no owner for
"the enemy has 4 ships arranged *here*, at *this* scale, on *this* bearing".

C1 owns water. C3 owns three hull kits. C6 owns the camera. **The thing that places ships on water
and maps the grid onto metres of ocean is in nobody's column and in no file in §1.** It is also the
component the disclaimer caption in the brief exists *for* — someone has to author the dramatised
arrangement, and that authoring is a design job, not a camera job.

Downstream: C6 opens Wave B, finds it has to invent the entire spatial model, and either invents it
inside `js/cine/` (where C7's HUD and C2's table both then need to read it and can't) or blocks.

**Fix:** add `js/world/fleet.js` to §1 and §2.2 with a frozen contract, and give it to C3 in Wave A:
```js
buildFleet(quality)  → { object3D,
                         layout(side, view)          // (re)places ship models from a View
                         cellToWorld(side, r, c)     → Vector3   // sea surface point for a cell
                         shipAt(side, r, c)          → { ship /*buildShip handle*/, t /*0..1 along hull*/ } | null
                         gunFor(side, shipId)        → Object3D  // muzzle anchor that fires this turn
                         mark(side, r, c, kind)      → handle }  // the red hit indicator, see B2
```
`shipAt(...).t` feeding `buildShip().hullPoint(t)` is what makes brief step 6 possible at all.

## B2. Brief step 6 — the red indicator on your own struck ship — has no owner and no API.

> "you see exactly which one is struck and where — with a red indicator marking the spot."

`buildShip` exposes `setDamage(0..1)`, `hullPoint(t)`, `listAngle(rad)`. `vfx` exposes muzzle,
tracer, splash, hit, fire, smoke. Nothing marks a point on a hull. No component's "Owns" column
mentions it. It is one of the two sentences in the brief that describe a mechanic the player reads
the board from, and it is absent from the plan.

**Fix:** `fleet.mark(side, r, c, kind)` per B1, owned by C3; add `'marker'` to the `hull` surface
list in §2.2 and a `markerScale`/`markerFade` entry to `config.js`.

## B3. The brief's look-around beat, and its scored shot, are gone.

Brief step 2: *"**You can look around** — drag to pan the view. After a few seconds of no input the
camera eases back to the board. (Ease, don't snap — a hard snap on a phone reads as a bug.)"*

The reference board's §02 — which the brief explicitly defers to ("The named shots to be built and
scored are listed in section 02") — lists this as **Shot 2 · `bridge_look`**, plate `1272010_02`.

BUILD_PLAN has no `bridge_look` shot, no free-look verb in `rig` (§2.3 is all authored moves), and
no component owning idle-timeout/ease-back. `tools/plates.json` has an orphan `bridge_red →
1272010_02` mapping that no component in §4 claims. The plan's eight frozen sequence ids contain
`bridge_settle` and `bridge_return`, neither of which is player-driven look.

Worse, there is no arbitration contract: the director owns the camera (§2.3), the drag is input.
Who wins when the player is mid-drag and the enemy turn starts? Unspecified, and it lands in Wave C.

**Fix:** add `rig.free(enable)` + `rig.idleReturn(ms, ease)` to §2.3, give C6 the `bridge_look` shot
against `1272010_02`, and state the rule: a `play()` cancels free-look immediately; free-look is only
enabled in `AIM(0)`.

## B4. Five of the six `both:false` crop rects are not 16:9, and `compare.mjs` silently centre-crops them.

`tools/compare.mjs:120` — `fit()` is `scale=900:506:force_original_aspect_ratio=increase,crop=900:506`.
A crop rect that isn't 16:9 gets a second, undeclared centre-crop. Measured against the real
1920×1080 plates:

| plate | rect ar | discarded by `fit()` |
|---|---|---|
| `1272010_06` (hit_explode) | 1.136 | **36% of height** |
| `1272010_01` (sea_night / night_burn) | 1.153 | **35% of height** |
| `552990_05` (splash_miss) | 2.667 | **33% of width** |
| `1272010_04` | 1.278 | 28% of height |
| `1272010_02` | 1.359 | 24% of height |

Our render at 1280×720 loses nothing. So the plate is reframed twice and our render once — the exact
failure mode §5's own crop-semantics table warns about ("Get this wrong and the crop becomes the
next tell"). Concretely: `1272010_01`'s effective rect cuts off the rain at the top and the
orange-lit water at the bottom — the two things `plates.json` says the plate is *for*.
`552990_05` loses its right-hand splash column, keeps both World-of-Warships capture buoys (I
cropped and looked: two red/white in-world markers survive, which is a game-UI tell the entry claims
the crop "dodges").

**Fix:** every crop rect must be 16:9, and `fit()` should hard-error if `crop` yields a ratio outside
16:9 ± 1%. Corrected rects, computed:
```
1272010_01  [0.20, 0.250, 0.48, 0.481]
1272010_02  [0.18, 0.280, 0.52, 0.520]
1272010_04  [0.22, 0.310, 0.46, 0.460]
1272010_06  [0.16, 0.250, 0.46, 0.460]
552990_05   [0.110, 0.46, 0.280, 0.28]     ← still keeps the buoys; re-triage or accept them
```

## B5. `director.seek(id, t)` is incompatible with the rig as specified. This breaks both of C6's scored shots.

§2.3 gives an imperative rig (`dolly(from, to, ms, ease)`, `hold(ms)`, `shake(amp, ms)`) driven by a
generator that yields `{until: ms}`. It then also gives `seek(id, t)` — *"deterministic pose, nothing
animating. Harness uses this."*

You cannot seek a generator. To land a pose at t=0.6 you must either run the generator forward with a
virtual clock (in which case "nothing animating" is a lie about vfx and physics, which will have
ticked or not depending on how you fake dt) or compile the sequence into an absolute-time keyframe
track first. These are different architectures and the plan does not choose one.

Downstream: `--at=` is the **only** capture path for `window_out` and `match_cut` (§4.3), both C6's,
both scored. `tools/shot.mjs:173` throws hard if `seek` is missing. C6 implements the obvious reading
(imperative tweens), discovers in round 1 that it cannot be posed, and rewrites the rig.

Second hole: `play(id, ctx)` takes a context; `seek(id, t)` takes none. §5 says `sim.setBoard` +
`autoplay` are how you frame `hit_explode` on the same cell every round — but there is no way to
hand `seek` the cell.

**Fix:** state in §2.3 that a sequence generator runs **once, at registration or at `play`, to build a
timeline** of `{t0, t1, apply(u)}` beats, and that `play` and `seek` both evaluate that timeline —
`play` from a clock, `seek` from an argument. Change the signature to `seek(id, t, ctx)`. Add the rule
that `apply(u)` must be idempotent and side-effect-free (vfx spawns are edge-triggered and suppressed
under `seek`).

## B6. Fog of war leaks through the event stream. §4.4's invariant only guards `view()`.

§2.1: *"**Events** — the only thing the renderer is allowed to consume."* and
`{ t:'place', side, ships:[{id,len,r,c,dir}] }` — full positions, for **both** sides.
§4.4's leak invariant is only `view(game, side) never leaks an unhit enemy ship cell`.

So the renderer is handed the enemy's complete layout on turn 0 through the sanctioned channel, and
the only test that would catch it is pointed at a different function. A C6 that reasonably places
enemy models "where the sim says they are" makes the whole board readable off the screen, and no
gate fires.

**Fix:** either (a) `placeFleet` emits `place` only for the side it is told to reveal and the sim
exposes `eventsFor(side)` which redacts `shipId` on enemy misses and `cells` on enemy `sunk` until
they are known; or (b) events carry `vis: 'both'|'own'` and the presenter is contractually bound to
filter. Add the invariant: *replaying `eventsFor(side)` from `newGame` must reconstruct exactly
`view(game, side)`* — see B10.

## B7. `legal()` returns `true | 'reason string'`. Every failure is truthy.

```js
legal(game, side, shot) → true | 'reason string'
```
`if (legal(g, s, shot)) fire(...)` — the natural call, which C6 and C7 will both write — fires on
every illegal shot. This is a coin-flip bug that will survive review because the code reads correctly.

**Fix:** `legal(...) → null | 'reason'`, or `{ ok: boolean, reason: string|null }`. One-line change,
must happen before the contract is frozen.

## B8. The table has no lattice or sub-cell API, so §3.2's whole targeting affordance is unbuildable.

§3.2 requires: with `heavy` armed the table draws dots at **cell corners** and the tap snaps to the
nearest dot; with `salvo` armed it draws a 3×3 reticle. §2.2 gives:
```js
cellToLocal(r, c) → Vector3      // cell centre
localToCell(v3)   → {r,c}|null   // cell, quantised
pegWorld(r, c)    → Vector3      // cell centre
showGhost(cells|null)            // takes resolved cells only
```
`localToCell` throws away exactly the sub-cell precision needed to pick between the four corners of
one cell. There is no `latticeToLocal(r,c)`, no `localToLattice(v3)`, no way to ask the table for the
dot overlay or the reticle. C2 lands in Wave A and is frozen; C6/C7 discover this in Wave B.

Also: `snapTarget(game, shot) → Cell` type-puns a lattice point as a `Cell` with a *different domain*
(`r ∈ [0,h-2]`). Two coders will read `Cell` and assume `[0,h)`.

**Fix:** add to `buildTable`:
```js
latticeToLocal(r, c) → Vector3         // corner point, r∈[0,h-2] c∈[0,w-2]
localToAnchor(v3, kind) → {r,c}|null   // the ONE tap-resolution entry point, kind-aware
setAimMode(kind|null)                  // draws corner dots / 3×3 reticle / nothing
```
and rename the sim's return type to `Anchor` with its domain written next to it.

## B9. `config.js` and `js/world/textures/*` have no owner. Guaranteed merge conflicts in Wave A.

§4.1 is the whole anti-conflict strategy and it lists seven serialised files. It does not list
`js/config.js` — which §1 says holds *"every tunable constant: fleet tables, ordnance sizes, cine
timings, vfx scale"* and §2.4 says is mandatory for vfx (*"never a literal in a vfx module"*). C3,
C4, C6 and C7 all must add to it, in parallel, in Wave A and B.

Likewise `js/world/textures/{noise,bake,surfaces}.js` — "ports of FORGE's procedural texture kit" —
appear in §1 and in nobody's Owns column. C2 (`materials/table.js`) and C3 (`materials/hull.js`)
both need them and will both port them.

**Fix:** W0 ports the texture kit and creates `config.js` with a **namespaced section per component**
(`config.vfx`, `config.cine`, `config.fleet`, `config.ui`), each declared in W0 as an empty object,
and add a §4.1 row: *"`js/config.js` — namespaced. A component writes only inside its own key."*

## B10. §4.4's invariant list has holes that let a broken rules engine pass.

Present: no cell resolves twice differently · `sunk` once per ship · cell count conserved · `over`
once, winner has ≥1 unsunk · `view()` no leak · every `fire()` returns ≥1 `result` · serialize
round-trip · seed replay. Missing, in order of how much damage each omission does:

1. **Events ⇄ view agreement.** Nothing asserts that replaying the event log reconstructs `view()`.
   C2's table renders from `view`; C6 renders from events. If they ever disagree the table and the
   sea show different boards, and no test fires.
2. **Termination.** Nothing bounds game length. A tier-2 bug that re-targets a resolved cell makes
   `sim.mjs 5000` hang rather than fail. Assert `turns ≤ 4·w·h`.
3. **The AI does not cheat.** §3.4 says *"No tier ever sees the opponent's board"* — that is a
   sentence, not a test. Assert: permute the defender's *unhit* ship placement to any other legal
   layout consistent with the resolved cells, and `aiMove` must return the identical shot.
4. **`legal` agrees with `fire`.** `fire()` on an illegal shot must throw or no-op; every shot
   `legal()` accepts must be fireable.
5. **`snapTarget` is total and idempotent.** For any `{kind, r, c}` including off-board,
   `legal(g, s, snapTarget(...))` is ok, and `snapTarget(snapTarget(x)) === snapTarget(x)`.
6. **`footprint().length` ∈ {1,4,9} always** — the "never clipped" rule, asserted rather than trusted.
7. **Ordnance ledger** — charges never negative, never above the start value, recharge cap honoured.
8. **`over` implies the loser has zero unhit ship cells.**
9. **Degenerate `newGame`** — empty fleet, unplaceable fleet, `w≠h`, length == `min(w,h)`,
   count == 12 on 6×6. §2.1 declares no failure mode for `newGame`; the soak must fuzz it.

Also: `deserialize(serialize(g))` deep-equal requires the PRNG to serialize. §2.1 says only
"a seeded generator held on the game object" — a closure-based PRNG will not round-trip. State that
the RNG is an integer state field.

## B11. C4 and C6 are circularly dependent and scheduled in the same wave.

§4.1: *"C6 reads from C1/C2/C3 and must not land before all three have passed at least round 1."*
C4 is not in that list. But C6's `shell_flight` and the whole `impact_hit` / `impact_miss` /
`enemy_volley` half of its sequence set are framed *through* C4's splash and fire; and C4's own
`splash_miss` / `hit_explode` / `night_burn` shots need a camera to frame them, which is C6's rig.
Wave B runs C4, C6 and C7 in parallel.

**Fix:** either split C6 into C6a (rig + director + `seek` timeline + `bridge_*`/`window_out`
sequences, Wave A alongside C1/C2/C3, so C4 has a camera) and C6b (`shell_chase` / `impact_*` /
`enemy_volley` / `match_cut`, Wave C after C4), or serialise C4 → C6 and drop the parallelism claim.

## B12. `vfx.tracer` and `vfx.smoke` have no owning file.

§2.4 declares both. §4.1: *"`vfx/{index,pool}.js` frozen after W0. C3 owns `gun.js`, C4 owns
`impact.js` + `fire.js`. They never meet."* §4 gives C3 "`vfx.muzzle/smoke`", C4 "`vfx.splash/hit/
fire`", C6 "`vfx.tracer`" — but C6 owns only `js/cine/*` and `world/shell.js`, and `vfx/index.js` is
frozen. So `tracer` has to be implemented in a file that does not exist and that C6 is not allowed
to create under `vfx/`.

**Fix:** add `js/world/vfx/round.js` (tracer + trail + drifting smoke) to §1, owned by C6, registering
into the pool like `gun.js` does. Move `smoke` out of C3's line into it — muzzle smoke and shell-trail
smoke are the same card system and two owners will build it twice.

## B13. `?seed=` and `?turn=` are passed by the harness, consumed by nothing, and `main.js` is frozen.

`tools/shot.mjs:152-154` appends `&seed=` and `&turn=`. §5 says `--turn=` *"drives
`__waterline.sim.autoplay(n)` before capture"*. `js/main.js` (already written, already declared
frozen) reads `?preset`, `?dpr`, knob keys and `?shot` — and nothing else. §4.1: *"`js/main.js` —
written once in W0, **frozen**. A component needing new wiring asks; it does not edit."*

So the deterministic-board capture path — the thing §5 says is what makes "same camera, same board
every round" possible — has no implementer and its only possible home is a frozen file.

Same class of problem: `hit_explode` needs the board set up *before* `shot.setup(app)` runs, and
`main.js` calls `setup` synchronously at module scope before `app.start()`.

**Fix:** W0 wires `?seed`/`?turn` in `main.js` against the `js/sim/index.js` stub, and §2.1 gains
`autoplay(game, turns) → Event[]` as a real sim export rather than a browser-only hook. State that a
scenario's `setup(app)` may return a promise and that `main.js` passes it through `app.loading()`.

## B14. Two of C1's three scored shots are pointed at plates it structurally cannot match.

- `sea_night → 1272010_01`. I opened the plate: it is a **burning freighter in rain**, filling the
  frame, with orange firelight on the water. C1 delivers ocean + sky + exterior light and no ships,
  no fire, no rain. The critic scores six criteria including **VFX** and **Composition**. An empty
  night sea against that plate cannot clear a 2.0 gate no matter how good the water is, and three
  failed rounds burn C1's entire allowance on a plate mismatch.
- `sea_noon → 2853730_01` and C3's `fleet_wide → 2853730_01` are the same plate. C1's version has no
  ships in it. Same problem, milder.
- `1272010_01` is *also* C4's `night_burn`, which is what the plate is actually for.

This is the naval README's own rule being broken: *"Grade per shot, never overall. A bridge render
scored against an ocean plate tells us nothing."* An ocean render scored against a burning-ship plate
tells us nothing either.

**Fix:** C1's shots must be plates whose subject is sky and water. `1172620_05` (SoT open sea) and
`2853730_01` are the only two clean ones on the board; for night, either drop `sea_night` from C1's
gate and fold night grading into C4's `night_burn`, or re-fetch (see the plan's own "Needs Aaron" §1).
Also record explicitly that the plan supersedes the board's §02 shot map — it changes 5 of its 8
entries (`bridge_look` dropped, `window_out` 1172620_08→_05, `guns_fire` _07→_12, `shell_flight`
2853730_01→1172620_05, `night_sea` split into two shots) and says so nowhere.

## B15. §4.3's two "measured, not critiqued" assertions have no implementation and no owner.

- *"mean frame luma across t = 0…1 must be monotone and the 0→1 ratio must land in [3.0, 6.0]"* —
  no tool computes frame luma. `compare.mjs --sheet=motion` only tiles PNGs.
- *"the peg's projected screen position on the last interior frame and the shell's on the first
  exterior frame must be within 4% of frame width... checked by the harness, not by a critic"* — the
  harness has no way to know where the peg is. `__waterline` (§5) exposes no projection probe.

Both are cited as the things that make the two ungated shots honest. Neither exists.

Second problem: **the luma gate as written fails a correct implementation.** §7.1 lags the exposure
curve 120 ms behind a 600 ms camera move; sampling at t = 0, 0.25, 0.5, 0.75, 1.0 puts samples 0 and
1 inside the lag, where luma is flat. Strict monotonicity fails on equal values.

**Fix:** W0 adds `tools/measure.mjs` (mean luma of a PNG via ffmpeg `signalstats`, and a generic
assert-over-`@t`-frames), spec `non-decreasing` not `monotone`, and add to §5:
`__waterline.probe(name) → {x, y}` in NDC, with C6 registering `'peg'` and `'shell'`.

---

# SHOULD FIX

## S1. The FORGE water reuse claim is false, and C1's estimate and the 3 ms ocean sub-budget rest on it.

§7.2: *"Sky env map plus one directional glint — exactly FORGE's `water.js` model, which already
survives the mobile gate."*

`forge/js/world/water.js` is a **creek** shader. It requires four per-vertex attributes that
`terrain.js:471-474` generates and that an open ocean has no source for: `aChan` (metres along/across
the channel), `aFlow` (flow direction), `aDepth` (0..1 shore depth), `aTint`. Every visual feature is
keyed off `aDepth`:

- foam: `wEdge = 1.0 - smoothstep(0.0, uFoamW, vDepth)` — a **shoreline** term. In open water
  `vDepth` is 1 and there is **no foam at all**. The brief wants "a spreading foam ring".
- colour: `mix(uShallow, uDeep, smoothstep(0.0, 0.30, wDep))` — constant in open water. A flat plane.
- displacement: `transformed.y += uSwell * aDepth * sin(aChan.x*0.5 - uTime*uSpeed*1.2 + aChan.y*0.4)`,
  `uSwell` default **0.05 m**, one sine, in phase across the whole surface. No wave field, no
  Gerstner, no whitecaps, and nothing `heightAt(x,z)` could usefully mirror.
- `transparent: true, depthWrite: false` — an open sea that does not occlude. Hulls below the
  waterline draw through it.
- a 6-iteration `uObst` wake loop that costs fill and does nothing here.

C1 is writing a new ocean shader from scratch, plus radial LOD rings, plus a CPU `heightAt` that has
to match its GPU displacement, plus sky, plus PMREM env, plus exterior lighting, plus sea states 0–3,
plus three scored shots. That is not 2–4 hours and it is not a port.

Also: the "already survives the mobile gate" claim has no measurement behind it in either direction.
FORGE's creek covers maybe 10–15% of `creek_day`; this shader at 100% of frame is 7–10× the fill.
And FORGE's own gate numbers (`NOTES_LIGHTING.md` §5: 5.1–9.0 ms, 54–87 calls, 312–496k tris, 52.6 MB
at `--preset=medium --dpr=1 --w=844 --h=390`) were measured **headed on this Mac**, not on a phone —
FORGE's `CLAUDE.md` says so outright: *"The real gate is Aaron's phone, which is the only number that
has ever been stable."* §6 inherits a desktop-measured gate and calls it a mobile budget.

**Fix:** say in §7.2 that the ocean is new code taking only the *technique* from FORGE (tiling ripple
normal, decorrelated transposed second sample, distance-flattened normal + rising roughness, glint
with shadow lookup) — those are the parts worth stealing and they are ~40 lines. Split C1 into
C1-ocean and C1-sky/light. Add a dpr-2 sanity figure for the ocean sub-budget, since fill is its
entire cost and the gate is measured at dpr 1.

## S2. The bridge budget is tighter than the sea budget, and the bridge shot is a superset of it.

§6 gives bridge shots **< 120 calls / < 260k tris / < 6 ms CPU** and sea shots **< 90 / < 300k / < 5 ms**.
But the bridge has a **window onto the sea** — the brief's whole premise. `bridge_table` draws the
interior *and* the ocean *and* the sky *and* whatever ships are visible through the glass. It can
never be cheaper than `sea_*`.

The FORGE precedent that makes the interior look cheap does not transfer: `NOTES_INTERIORS.md` §4
measures 13 draw calls / 2–3k triangles indoors, but explicitly *"because the room is sealed... once
you are fully inside the outdoor world stops being drawn. Any gap round the door would be a hole
straight to the sky."* This bridge is one large deliberate hole to the sky.

Related, unmeasured: `bridgeLights: 5` point lights at medium. FORGE's interiors used **2**.
`NUM_POINT_LIGHTS` is a `#define` — changing the count rebuilds every program, which is a
50–200 ms hitch against a 50 ms worst-frame gate, and `app.js:65-78` already does a full
`needsUpdate` traverse on a shadow change for the same reason.

**Fix:** bridge column ≥ sea column on every metric. Add a shader **pre-warm** deliverable to W0:
`renderer.compile(scene, camera)` over every material variant (including vfx and both time-of-day
lighting states) behind `app.loading()`, or the first splash of every match compiles mid-cinematic.
Cap the live point-light count and never vary it after boot.

## S3. Pacing keys off a counter that double-counts, so the showpiece is gone by the player's 7th shot.

§3.3: *"Turn counter increments on every `RESOLVE`, **both sides**."* §7.4 keys pacing off it:
full 1–3, short 4–12, instant 13+. That is **1.5 of the player's own turns** at full pacing and the
camera stops leaving the table on the player's **7th** move. The brief calls the fly-out-and-chase
"the game's whole first impression".

Second problem in the same section: pace changes *which beats exist* ("Beats kept: impact only"),
which forces `if (pace === 'instant')` branching inside `js/cine/sequences.js` — precisely what §1's
directory rule forbids everywhere else.

Third: "hold anywhere = 4× fast-forward" — 4× of what? If it scales `app` dt, the ocean and the
smoke run at 4×. If it scales only the rig clock, the shell outruns a normal-speed sea. Unowned.

**Fix:** pace off `game.turns[side]` (the firing player's own count) and widen to full 1–4 / short
5–20 / instant 21+. Put the beat sets in `config.cine.paces` as data and have each sequence iterate
its pace's beat list. State that fast-forward scales the **director clock and `vfx.update(dt)` only**,
and that `ocean.update` takes wall dt.

## S4. §3.3 and §3.4 contradict each other once ordnance exists.

§3.3: *"Firing at an already-resolved cell is legal and wasted. **The AI never does it.**"*
§3.4 tier 3: fires `salvo` at the highest summed-density 3×3 block.

After turn ~10 on a 10×10, essentially every 3×3 block contains at least one resolved cell. The rule
is unimplementable as stated for 4- and 9-cell ordnance.

Two more consequences nobody has decided:

- **Does a shot at an already-resolved cell emit a `result`?** If not, a `salvo` whose nine cells are
  all resolved returns zero `result`s and **violates §4.4's "every `fire()` returns ≥ 1 `result`"**.
  If yes, "no cell resolves twice to a different value" holds but the table re-pulses cells it has
  already painted.
- **Event order within one multi-cell shot is undefined.** §2.1 says "ordered" and never says in what
  order the nine cells resolve, nor whether all `result`s precede all `sunk`s or they interleave. One
  `fire()` can sink two ships and hit a third; C6 animates them in whatever order it gets.

**Fix:** define it. Cells resolve in row-major order within the footprint; all `result`s, then all
`sunk`s, then `turn`/`over`. A resolved cell always emits a `result` with a `repeat: true` flag.
Reword §3.4 to "the AI never fires a `shell` at a resolved cell, and never fires ordnance whose
footprint is majority-resolved".

## S5. The anchor-domain restriction does not remove the edge asymmetry — it relocates it, into the AI.

§3.2 justifies never clipping footprints with: *"it makes the AI's density model asymmetric at the
edges for nothing in return."* Check the coverage: `heavy` anchors `[0,h-2]×[0,w-2]` and `salvo`
centres `[1,h-2]×[1,w-2]` do cover every cell, so nothing is unreachable — that part is sound.

But **anchor multiplicity is not uniform**: a corner cell is reachable by exactly 1 heavy anchor and
1 salvo anchor; an interior cell by 4 and 9. Summed density over a footprint is therefore
structurally maximised near the board centre — a 3×3 block at the edge simply has fewer
high-density cells feeding it. Tier 3's rule ("fires at the highest summed-density block") will open
by salvoing the middle in **every single game**, deterministically, and then §3.4 adds *"avoids the
outer ring on turns 1–3"* on top of it. Ships parked in a corner are systematically found last, and
tier 3's opening is fully predictable.

Compounding: summed density is the wrong objective for area ordnance anyway. A 3×3 that covers one
5-ship three times scores 3× but yields the same information as one hit. And ordnance is most
valuable in *hunt* mode and worthless when a hit run is open — tier 3 has no such rule, so it burns
all 5 classic charges in its first 5 turns, which is close to the worst possible schedule.

**Fix:** normalise density by anchor multiplicity, or score a footprint by *expected distinct ships
touched* rather than summed cell density; hold ordnance while a hit run is open; add a cheap
per-game random tiebreak so the opening is not identical every game.

## S6. Tier 4 is tier 3 with more ammo, so the monotonicity gate is not passable as designed.

§3.4: tier 4 = *"tier 3 with 1.5× ordnance charges and density recomputed against the exact
surviving fleet each turn"*. But tier 2 **already** computes density *"for every surviving ship
length"* — that is the same thing. So tier 4's only real difference is 50% more charges, in a
ruleset where §3.2 already gives 3 heavy + 2 salvo on classic.

§3.4 then gates C5 on *"win rate must be monotone up the ladder"* over 2,000 games per pairing
(±1.1% at 95%) and pre-commits *"If it isn't monotone the tiers are wrong, not the test."* C5 is
gated on a test its own tier definitions cannot reliably pass, and per S5 the extra charges may make
tier 4 *worse* than tier 3.

**Fix:** give tier 4 a real edge — e.g. it tracks the opponent's shot parity and biases its own
placement away from it, or it uses the ordnance policy from S5 while tier 3 uses the naive one. And
require monotone-**with-separation** (each step ≥ 3 points and non-overlapping CIs) rather than bare
monotonicity, or the gate is noise.

## S7. The `match_cut` gate contradicts CRITIC_PROTOCOL's own argument.

§4.3 scores `match_cut` *"on the rubric alone with the gate median ≥ 7.0, no criterion under 5"*.
CRITIC_PROTOCOL says the absolute number is unreliable and *"the gap is the signal, not the absolute
number"* — the 2.0 gate exists precisely because a critic's absolute scale drifts day to day. §4.3
then keys pass/fail on an uncalibrated absolute number, for the single most subjective shot on the
board, with no reference on the other side.

That is a component grading its own homework, even if unintentionally.

**Fix:** run the calibration sheet (same plate both sides, per CRITIC_PROTOCOL) **in the same round**
and normalise `match_cut`'s absolute against it; or score the cut's two halves against real plates
(`match_cut@0.0` vs `1489630_00`, `match_cut@1.0` vs `1172620_05`) on the standard 2.0 gate and keep
the rubric read as advisory. The 4% screen-position assertion (B15) stays either way — it is the only
honest gate in that section.

## S8. `rig.exposure()` and the `exposure` quality knob fight over `renderer.toneMappingExposure`.

`js/engine/app.js:80-81` already registers an `exposure` knob writing
`renderer.toneMappingExposure`. §2.3 gives `rig.exposure(from, to, ms)` writing the same value.
`Quality.usePreset()` re-applies **every** knob (`quality.js:65-68`), so any preset change — including
the one the settings screen exposes — snaps exposure back to 1.0 mid-cinematic. `?exposure=` does the
same at boot, silently defeating `window_out`'s luma gate.

**Fix:** the knob becomes `exposureBase`; `app` composes `toneMappingExposure = exposureBase *
rig.exposureMul`. One owner for the product, two for the factors.

## S9. `ShipView` is undefined, and it is consumed by three components C5 does not talk to.

`View = { w, h, grid, fleet: ShipView[], ordnance, turn, phase }`. `ShipView` has no shape.
`phase` and `turn` have no value domain (are phases the §3.3 uppercase strings?). C2 (`setState(view)`),
C7 (HUD, fleet status), and per B1 the fleet layout all consume it. C5 defines it in Wave A with no
one to ask.

**Fix:** write it into §2.1: `ShipView = { id, len, hits, sunk, cells: Cell[]|null }` — `cells` null
for an enemy ship until sunk, which is also the fog-of-war rule in one line.

## S10. `PLACING` exists in the state machine with no UI owner.

§3.3's phases include `PLACING`; §2.1 has `placeFleet(game, side, placements)` with a manual path.
No component owns a placement screen: C7's line is "mode / grid / fleet builder screens" (choosing
*lengths*), and no shot covers it. Either the player never places their own ships — a notable
departure from Battleship that should be written down as a decision — or C7 is carrying an unnamed
screen.

Related: C7 cannot validate a custom fleet at all. §2.1 exports no `packRows` / `fleetLegal(w, h,
lengths) → true|reason`, so the "fleet builder" has no way to tell the player their fleet won't fit.

**Fix:** decide, and export `fleetLegal(w, h, lengths)` from `js/sim/index.js`.

## S11. Schedule. "Eight components at 2–4 hours" is not defensible for at least four of them.

- **C1** is three components (see S1): ocean shader + LOD, sky + PMREM, exterior lighting + 3 shots.
- **C2** is three: the bridge room (consoles, glass, crew silhouettes, window frame), the planning
  table (grid, pegs, ghost, lattice affordance, reticle, cell⇄world, `setState`, `pulse`), and two
  material kits. The table is the game's primary interaction surface and gets half a bullet.
- **C6** is four: a seekable timeline rig (B5), eight sequences, `shell.js` + arc solver, the match
  cut, pacing tiers, the exposure curve — and, as written, the entire world fleet layout (B1).
- **C7** is a week, not 4 hours: HUD, setup, custom grid/fleet builder, ladder screen, pause/settings/
  result, save, dormant multiplayer. It is also the **only** component with no visual gate of any kind
  (*"none — legibility checklist, and must be absent from every scored shot"*), so it is the one that
  will silently ship worst.
- **W0** at "~1.5 h" is already contradicted by the folder: `HANDOFF_ENGINE.md` documents the engine
  half alone as a full session, and W0 still owes `config.js`, materials/index, vfx index+pool, sim
  stubs, `purity.mjs`, `sim.mjs`, and the texture-kit port from B9.
- **Over-specified busywork:** W0's "grey PBR for every `(kit, surface)` pair" is 19 identical
  materials; the plates.json re-verification is already done (`tools/plates.json` exists and is
  reconciled); and the `--seed`/`--turn` passthrough is wired at both ends with nothing in the middle
  (B13).

**Fix:** re-cut as ~12 components, or accept that "2–4 hours" means "2–4 hours *per round*, three
rounds each", and say which.

---

# NOTED

- **N1.** `1172620_08` is used by the reference board as `window_out`'s plate ("Deck to horizon");
  the plan correctly relabels it as a green-lit night structure but then silently reassigns
  `window_out@1.0` to `1172620_05` without recording that the board's §02 entry is superseded. Same
  for `guns_fire` and `shell_flight`. Write the supersession down or a later round will "fix" it back.
- **N2.** `sea_dusk` (C1), `shell_flight` (C6) and `window_out@1.0` (C6) all score against
  `1172620_05`. If C1 exhausts three rounds and fails on that plate, C6 fails two shots for reasons
  that are not C6's. §4.1's "must not land before all three have passed at least round 1" is not
  guaranteed by the protocol — three fails and you move on anyway.
- **N3.** §7.5 says *"Eight of twenty 'clean' plates carry a HUD or a version string"*; §0's table
  lists six (`1272010_01/_02/_04/_06`, `2853730_00`, `1286220_00`). The other two in the count are
  the mislabelled/fantasy drops, which is a different category. Cosmetic, but it is the number
  everything downstream is justified by.
- **N4.** `HANDOFF_ENGINE.md`'s worked example is `--at=0,0.25,0.5,0.75,1`, which writes
  `window_out@0.png` and `window_out@1.png`. `plates.json` keys them `window_out@0.0` /
  `window_out@1.0`, and §4.3 uses the same. `compare.mjs` will report "missing render". Pick one
  spelling and put it in both files.
- **N5.** §3.1's *"A fleet is legal for a grid **iff** `packRows` succeeds"* — first-fit-decreasing is
  not optimal, so this rejects some obviously placeable fleets. Fine as a *definition*, but the custom
  fleet builder's error message will occasionally be wrong-looking to a player who can see the
  placement. Word it as a definition, not a proof of impossibility.
- **N6.** §3.1's randomisation of the `packRows` fallback: *"shuffle row assignment"* is ambiguous.
  Permuting the *bins* is safe; reassigning each *ship* to a random row is not (a row can exceed `w`).
  This will be got wrong.
- **N7.** §3.2's recharge is *"+1 every 8 of your turns"* while §3.3's turn counter counts both sides.
  Two counters, one name. Same root cause as S3.
- **N8.** `vfx.tracer(...)` returns `{object3D, at(t)}` — a fresh object per call, in a module whose
  contract is *"Everything is pooled. A beat must not allocate."*
- **N9.** `vfx.alive()` peak is *"asserted, not eyeballed"* in §6, but `stats()` does not include it
  and `shot.mjs` never reads it. It would need `--eval`. Nobody is told to.
- **N10.** `--shot=sea_only` is named in §6's ocean sub-budget and appears in no component's shot list.
  Add it to C1's deliverables or the sub-budget is never measured.
- **N11.** `director.skip()` *"drains the generator synchronously"*. If beats spawn vfx, a skip spawns
  a whole sequence's worth of muzzle/splash/smoke in one frame and blows the `vfxCap` assertion in the
  same §6 that asserts it. Nothing says skip suppresses spawns.
- **N12.** `buildOcean().heightAt(x, z)` must agree with whatever the vertex shader displaces, or every
  splash and every ship floats. Nothing in §2.2 says so.
- **N13.** §2.2 maps ship length 5+ → battleship *"scaled along X"*, while §3.1 permits length up to 16.
  A battleship kit stretched 3× along its length will read as broken at the top of the allowed range.
- **N14.** The brief asks multiplayer to be *"built but dormant"*. The plan delivers a file exporting
  `isAvailable() → false`. That is dormant but not built, and since waterline ships to
  y-r-u.github.io it will never once be exercised. Reasonable for phase 1 — say so explicitly rather
  than letting the §1 line imply more.
- **N15.** No `projects.js` entry is mentioned anywhere in the plan. The brief says at ship time; put
  it in the Wave C checklist so it isn't forgotten.
- **N16.** `js/cine/caption.js` (C6) draws the disclaimer over the shell, while C7 owns all UI and
  `index.html`'s containers. DOM overlay or in-world sprite is undecided, and it determines whether the
  caption appears in a scored shot.
- **N17.** `tools/purity.mjs` bans `Date.now` under `js/sim/`, and `ladder.js` lives there and owns
  "persistence shape". Ladder records usually want a timestamp; make sure it takes one as an argument.
- **N18.** Live observation, not a plan defect: `js/engine/{aa,post}.js` appeared at 22:41 while this
  review was running, and `js/engine/app.js` imports them. Between 22:25 and 22:41 the app had a
  dangling import and could not boot. Someone is executing W0 concurrently with this review — worth
  knowing before the plan is edited.

---

# Verdict

**No. Not safe to execute in parallel as written.**

Two of the four Wave-A coders (C1, C2) would build against contracts that cannot express what Wave B
needs from them, and Wave B's own two coders are circularly dependent on each other. The single
biggest problem is not a contract detail: **the plan has no owner for the enemy fleet's position in
the world**, which is the object every cinematic beat, the table's targeting, and the brief's "which
of your ships is hit and where" all resolve against.

Minimum set of changes that makes it safe to start:

1. **B1 + B2** — add `js/world/fleet.js` with the contract above, owned by C3, in Wave A. This is the
   one change without which nothing else matters.
2. **B3** — put `bridge_look` and the free-look/ease-back verbs back in, owned by C6, with the
   arbitration rule written down.
3. **B5** — decide the rig architecture: sequences compile to a seekable timeline. One paragraph in
   §2.3, but C6 cannot start without it.
4. **B6 + B10** — side-filter the event stream and add the missing invariants, above all
   *events-replay ⇄ view agreement* and *termination*.
5. **B7 + B8 + S9** — `legal()` returns `null | reason`; `buildTable` gains
   `latticeToLocal` / `localToAnchor` / `setAimMode`; `ShipView` gets a shape. All three are frozen
   contracts and all three are wrong or missing now.
6. **B9** — give `config.js` and `js/world/textures/*` owners and a namespacing rule in §4.1, or Wave A
   ends in merge conflicts in exactly the files W0 existed to prevent conflicts in.
7. **B11** — split C6 into C6a (Wave A) and C6b (Wave C), or serialise C4 → C6.
8. **B12 + B13** — give `tracer`/`smoke` a file, and wire `?seed`/`?turn` in W0 before `main.js` freezes.
9. **B4 + B14** — fix the crop rects to 16:9 and repoint C1's shots at sky-and-water plates. These are
   cheap and they decide whether round 1 means anything at all.

**B15, S1, S2 and S11** should be settled before anyone commits to the schedule, but they do not block
the first coder starting — they block believing the estimate.
