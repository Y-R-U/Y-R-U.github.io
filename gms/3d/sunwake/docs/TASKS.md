# SUNWAKE — reviewed task list

Reviewer: Claude. Source: `docs/PLAN.md` (codex gpt-6-astra, high).
Verdict: **plan approved** with the amendments in §A. Build in the milestone order below.

---

## A. Amendments to PLAN.md — these OVERRIDE the plan where they conflict

**A1. The sea is too flat. Raise the default sea state.**
PLAN's table maxes at ±0.74 m with a 36 m main swell. Against a 4.6 m launch that reads as a
calm lake, and the brief's first priority is *convincing* waves. New default table in
`config.mjs`, all of it behind a single `SEA_STATE` scalar so it stays tunable in one place:

| Octave | λ (m) | A (m) | θ | φ |
|---|---:|---:|---:|---:|
| 0 | 36 | 0.75 | 255° | 0.0 |
| 1 | 18 | 0.34 | 285° | 1.7 |
| 2 | 9 | 0.13 | 240° | 3.1 |
| 3 | 4.5 | 0.05 | 300° | 4.4 |

Max displacement ±1.27 m, Σ A·k ≈ 0.41. Every bound in `tools/sim.mjs` must be **derived from
the table at runtime** — no literal `0.740` anywhere. Re-check the shore wall top (PLAN §4 uses
+1.05 m because max crest was 0.74): raise it to **+1.60 m** so no crest can ever expose a gap,
and the decorative apron to below −1.45 m. Crest-foam threshold scales with the table too.

**A2. Gerstner escape hatch — do NOT build it up front.**
Pure sine will read as rolling hills. If the milestone-2 visual gate says the water is too soft,
add horizontal displacement in the *vertex shader only*, octaves 0 and 1, Q chosen so max
horizontal shift ≤ 0.35 m. Physics keeps sampling the undisplaced height field; the ≤0.35 m
mismatch is accepted and documented. This is a conditional polish step, not a rewrite.

**A3. Camera takes 12% of hull roll.** PLAN §5's fully-level horizon is the right comfort call
but makes the boat feel detached from the sea. Apply `cameraRoll = 0.12 * boatRoll` (damped,
τ=0.4 s), zeroed by the reduced-motion setting. Pitch stays fully level. Nothing else changes.

**A4. `docs/STATE.md` is mandatory and is updated at the end of EVERY milestone.**
This project is built across multiple agents and sessions; STATE.md is the handoff. It holds:
current milestone and its status, what is verified and by what command, the next concrete action,
files touched, and every gotcha discovered. An agent picking this up reads BRIEF → TASKS → STATE,
in that order, and nothing else is needed to continue.

**A5. Build the test harness in milestone 1, not later.**
`tools/cdp.mjs` and `tools/browser.mjs` are what prove every later milestone, so they exist
before the water does. Hard requirements, all from prior repo scar tissue:
- Launch Chrome **only** via `~/.claude/bin/cdp start --port 9223` (leaked headless Chrome has
  pegged this Mac at 500% CPU for days). Never spawn Chrome by hand.
- `Network.enable` then `Network.setCacheDisabled {cacheDisabled:true}` **before** `Page.navigate`.
  A `?v=` query on the page URL does NOT bust the ES modules it imports; skipping this makes your
  own edits invisible and you end up debugging the game instead of the harness.
- Assert `window.__SUNWAKE_BOOTED__` — a silent forever-loading screen is this repo's classic
  failure and a screenshot alone will not catch it.
- Collect console errors, runtime exceptions, failed requests and shader compile logs; a run with
  any of them fails, regardless of what the screenshot looks like.
- Static server: **already running on :8888 serving the repo root**. Verify with
  `curl -I http://127.0.0.1:8888/gms/3d/sunwake/`. Never serve the sunwake folder alone — the
  vendored three.js import is relative to the repo tree.

**A6. No physical phone is available to the agent.** PLAN §10 milestone 7 cannot be met as
written. Substitute CDP mobile emulation: `Emulation.setDeviceMetricsOverride` at 390×844 and
844×390 with `deviceScaleFactor:3`, `Emulation.setCPUThrottlingRate(4)`, real
`Input.dispatchTouchEvent`. Record the physical-device gate in `docs/VERIFY.md` as **NOT MET —
no hardware available**, with the emulated numbers next to it. Do not quietly claim it passed.

**A7. Every milestone ends bootable and playable.** If usage runs out mid-project, whatever
milestone last completed must still load and be worth sailing. Never leave the game broken
across a handoff. If a milestone must be abandoned part-way, revert to the last good state
and say so in STATE.md.

**A8. Deferral list, in this order, if time or usage gets short.** Cut from the bottom:
distant sail silhouettes → bird flock → ordinary-island names and visit records → audio →
settings panel. Never cut: the water, the handling, the shore collision, the camera, both
control schemes, the six landmarks.

**A9. Do not touch anything outside `gms/3d/sunwake/`.** The repo has uncommitted work from
other sessions in `games/`, `index.html` and `lib/auth/`. No `git add`, commit, push, rebase or
stash — not even of sunwake's own files. `/projects.js` registration and the screenshot happen
by hand at the end, after Aaron has seen it.

---

## B. Milestones

Each one ends with: Node suites green, a CDP run with zero console errors, a screenshot in
`docs/evidence/`, and `docs/STATE.md` updated.

- [ ] **M1 — Bootable sunset shell + test harness.**
      `index.html` with the exact vendored importmap and the inline boot/error gate,
      `style.css`, renderer + tone mapping, procedural sky, flat static water, a placeholder
      launch mesh, title/pause UI. `tools/cdp.mjs`, `tools/browser.mjs`, `tools/sim.mjs`
      skeleton. Gate: loads over :8888, `__SUNWAKE_BOOTED__` true, a deliberately broken module
      shows a readable error instead of hanging, WebGL2-missing shows a panel.

- [ ] **M2 — Water. The showpiece.** Four-octave `waves.mjs` (pure, A1 table), radial disc mesh
      at all three tiers, the full water shader, ripple normal layers, GGX sun road, horizon
      haze, render-origin rebasing. Gate: `--suite waves` (analytic vs central-difference
      derivatives, bounds, continuity across rebase), the §2.6 screenshot set at t=0/2/5/10
      facing west and east, and an honest look at whether it is beautiful. **Do not proceed
      while the water is unconvincing** — this is the one milestone worth over-spending on.

- [ ] **M3 — Playable launch.** Buoyancy from four hull points, hydrodynamics, input
      normalization (keyboard + split-helm touch), follow camera with A3's roll, wake ribbon,
      spray. Gate: `--suite handling` numbers in PLAN §10.3, identical trajectories at
      synthetic 30/60/120 Hz, real key and touch dispatch through CDP, portrait and landscape.

- [ ] **M4 — One unquestionably solid island.** Fixture island, shore wall, terrain, the swept
      circle solver, overlap recovery, camera obstruction, shore foam. Gate: head-on, tangent,
      oblique, reverse, at-rest-against-shore, coincident spawn, and single-call displacements
      from 0 to 10,000 m — the invariant `dist ≥ radius + 2.6` asserted after every one, on the
      rendered interpolated centre as well as the simulated one.

- [ ] **M5 — Endless archipelago.** Chunk hashing, descriptors, streaming, three island
      profiles, LOD, bounded caches. Gate: `--suite world` 10,000 chunks queried in different
      orders byte-identical, `--suite collision` 100,000 randomized cases, a 20 km sailed route
      with stable memory and no water seam at rebases.

- [ ] **M6 — Exploration loop.** Six landmarks with postcards, compass pin, chart, discovery
      dwell, save/load, atlas completion. Gate: each landmark discoverable from outside its
      collider, save survives reload, corrupted save recovers, and Lantern Key reachable from
      spawn by actually sailing there.

- [ ] **M7 — Mobile performance and final polish.** Adaptive quality, instance caps, pointer
      cancellation, reduced motion. Gate: A6's emulated mobile runs, the dense-scene fixture
      inside the draw-call and triangle budgets, `docs/VERIFY.md` written with the honest state
      of every gate including the ones that could not be met.

- [ ] **M8 — Hand-off to Aaron.** Screenshot for `/assets/screenshots/sunwake.jpg` and the
      `/projects.js` entry, prepared but **not applied**, in STATE.md. Aaron plays it first.

---

## C. Review of M1 + M2 (Claude, after inspecting the evidence screenshots)

**Accepted.** The near and mid water is genuinely beautiful — the sun road breaks over wave
faces the way it should, the teal-trough/apricot-crest palette holds together, and the boot gate,
harness and wave tests are thorough. The A2 Gerstner hatch was applied with judgement and the
baseline kept. Good work.

**C1 — DEFECT, must be fixed before M3 is called done: hard shelves on the far water.**
In `m2-standard-east-t5.png` and `m2-standard-west-t5.png` the band from roughly 250 m to the
horizon breaks into flat rectangular plateaus with straight edges, like drifting ice floes. It is
the single most damaging thing in the frame and it is visible in every heading. STATE.md calls
this "visibly coarser tessellation" — it is worse than that; it reads as a rendering bug.

Cause: the outer rings are far too coarse for the waves still being displaced across them. Ring
spacing reaches 8 m out to 400 m and then goes geometric to 1,536 m — hundreds of metres per
quad — while octave 0 (λ=36 m) is still geometrically displaced out to 512 m. Sampling a 36 m
wave at 100 m vertex spacing produces exactly these angular plateaus, and each flat facet then
catches the grazing sky reflection as a hard-edged pink shelf.

Fix, in this order:
- No octave may be geometrically displaced where ring spacing exceeds λ/6. With the A1 table that
  means octave 0 fades out by **300 m** (inside the 8 m band), octave 1 by 150 m, octave 2 by 70 m,
  octave 3 by 40 m. Beyond 300 m the mesh is geometrically flat and its normals are uniform, so
  there is nothing left to facet.
- Compensate by carrying the *shading* further out than the geometry: keep the ripple-normal and
  macro-gradient terms alive to ~450 m with increasing roughness, so the far sea still has texture
  rather than turning into a mirror.
- Bring full horizon haze in by **650 m** instead of 900 m, so the flat region is hidden rather
  than lit.
- Re-capture the east and west t=5 shots at standard and low and check the far band is a smooth
  graded field. This is the acceptance test — the numbers passing is not enough here.

**C2 — The boat is placeholder-grade and it shows.** From astern it reads as a brown rowing
dinghy with a black box stuck on the transom, and the bow shape does not come across. PLAN §1 and
the M3 contract item 8 already describe the real launch; build it properly in M3 and keep it
inside the 4,000-triangle / four-draw budget. The boat is the one object the player looks at for
the entire game.

**C3 — Keep everything else.** Do not revisit the wave table, the Gerstner shift, the rebasing,
or the boot gate. They are accepted.

---

## D. Review of M3 + M4 (Claude, after inspecting the evidence)

**Accepted, and the collision guarantee is genuinely proven.** Worst clearance +0.001 m (the
contact skin) across 36,000 held-against-the-wall steps, 432 single-call sweeps to 10,000 m with
zero penetration, and 20,000 random sweeps clear. The user's hard requirement — the boat must not
pass through an island — is met and demonstrated rather than asserted. The two rendering bugs
found by *looking* (inside-out island winding, foam filling the inside of every circle) are
exactly the class of defect the numeric suites cannot see; finding them is the job done right.
The boat now reads as a real launch. The wake dash-line fix was a good catch.

**D1 — DEFECT, the biggest thing left: islands are wedding cakes.**
See `m4-shore-contact.png`. The island is a stack of flat concentric discs with hard horizontal
rims — a topographic contour model, not limestone. Every terrace is a perfect circle sharing a
centre with the one below it, so the eye reads "lathe-turned" instantly. `m4-approach.png` has
the same problem at distance: a pale plate floating on the surface. The agent flagged
"terraces read as concentric rings" itself; it is worse than a nitpick, it is the one thing that
makes the world look untrue, and it is now the weakest part of an otherwise lovely frame.

Constraint that makes this awkward, and the way through it: no above-water rock may extend
outside the collision circle, and the shore wall must stay at exactly the collision radius so
contact looks honest. So do not inset the wall — vary everything else:
- **The wall stays a true cylinder at R**, but gets vertical fluting: per-angle radial relief cut
  *inward* by 0 to 0.6 m, at a few cycles around the circumference, plus an irregular top edge
  varying between +1.60 m (the hard floor, never lower) and +3.5 m. Break the silhouette where
  it meets the water.
- **Above the wall, nothing is concentric.** Drive each terrace edge with
  `r(θ) = base * (1 + 0.18*noise1(θ) + 0.09*noise2(2.7θ))` and give each its own angular phase
  offset, so no two rims share a centre. Tilt the terrace tops a few degrees in a seeded
  direction rather than leaving them dead level.
- **Cap the visible steps at three** and make them unequal in height; four even rings is what
  reads as a cake. Let one side of the island be a single tall face with no terrace at all.
- Keep the landmark silhouettes (spire, bells, split crown) readable — they are working.

**D2 — Match the two fogs.** Islands are crisp against the horizon between 240–760 m while the
water shader fades over 180–650 m, so there is a visible straight discontinuity to the right of
the island in `m4-approach.png`. Drive both from one shared constant.

**D3 — Accepted with no action:** wake slightly too geometric at the stern, spray quads a little
large. Note them and move on; they are not what is holding the frame back.

**D4 — Do not revisit:** the wave table, the Gerstner shift, rebasing, the boot gate, the
collision solver, the boat mesh. All accepted.
