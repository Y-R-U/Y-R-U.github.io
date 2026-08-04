# MONOPOLE — space company game

Three.js, mobile first, **no build step**. Version 0.1.

You start a small trading/mining company and try to become a duopoly or a monopoly using the
tactics real companies actually use — the legal playbook, the grey one, and the illegal one —
or you go out of business trying. Every tactic you unlock shows the real story behind it.

Full brief: `~/cc/yru/gms/3d/aaa_refs/space/GAME_BRIEF.md`. Read it once.

## Shape of the thing (decided, not up for renegotiation)

- **Live 3D star system, 2D company UI over it.** You orbit and pinch a beautiful system —
  station, belt, planet, your ships moving between them. Every decision happens in 2D panels
  layered on the live scene. The 3D is never a control surface for the sim.
- **Ticks with pause. One tick = one week.** Ships animate between ticks so the scene stays
  alive. Quarterly results give the monopoly story its rhythm.
- **Mobile first.** One thumb. Desktop gets tuned later.
- **Showroom mode is a first-class feature, not a dev leftover.** Every 3D scene, camera move,
  fly-by, UI panel and story panel must be triggerable from it. Phase 1 exists to see the whole
  basic set at once and find out what worked and what needs more time.

## Non-negotiables

- **No build step.** ES modules, `three` via the importmap in `index.html` (r0.160.0, jsDelivr —
  copy FORGE's exactly). Matches the rest of the repo.
- **Everything tunable is a knob.** `quality.register(schema, apply)` gives it panel UI for free.
  No magic numbers buried in a module.
- **Track every texture** through `engine/budget.js` `track()`, or the memory readout lies.
- **The perf gate is real** (below). Beauty we can't draw isn't a result.
- **Content is data.** Story panels, tactics, ships, stations — JSON/JS data files under
  `content/`, never hard-coded into a component.
- **Local image generation goes through the mflux-queue server** on `:7867` — submit a job, poll
  it, download it. It serialises across sessions for you. Check LTX (`:7866`) is not warm first;
  the two cannot co-reside in 24 GB. Protocol in `~/cc/yru/CLAUDE.md`, working implementation in
  `site/gms/2d/awake/regen_helper.py`. Do not invent a lock.

## Comments — read this twice

Aaron has ADHD and finds comment noise genuinely hard to read. The code is self-documenting.

- **Only comment to clear up something genuinely confusing.** A non-obvious formula, a workaround
  for a Three.js quirk, a unit that isn't guessable.
- Never restate what the line does. Never write section-banner comments. Never write JSDoc blocks.
- A short file-top line saying what the file owns is fine. That's usually the only comment a file
  needs. If in doubt, delete the comment.

## The art bar

**EVE Online and Homeworld.** Nineteen reference plates live in
`~/cc/yru/gms/3d/aaa_refs/space/refs/clean/` — **outside this repo, and they stay there.** They
are copyrighted press screenshots and must never be committed or copied into `site/`.

Read `~/cc/yru/gms/3d/aaa_refs/space/README.md` and open
`space_reference_board.html` before doing any visual work. The board names the specific trick
behind every plate and splits them into cheap-to-steal and expensive-to-steal.

The five things that earn the score, in order of value per triangle:

1. **A backdrop that is not black.** Per-system nebula on a two-hue palette, with the local star
   placed to backlight whatever the camera is on. Cheapest two points available.
2. **One dominant key light** plus a coloured fill or emissive bounce. No meaningful ambient.
   Hulls read as dark shapes with lit edges.
3. **Emissive window and dock lights** — thousands of warm texels against cool metal. They must not
   actually illuminate anything.
4. **Scale cues** — something known-small against something known-huge, and haze between layers.
5. **Two or three hues per scene**, deep blacks, controlled bloom.

## How your work gets judged

Renders go into a **blind** side-by-side against a reference plate. An adversarial critic scores
both images out of ten without being told which is ours.

| Weight | Criterion |
|---|---|
| 2.0 | Lighting — one dominant key, coloured fill, direction obvious in a second |
| 1.5 | Silhouette & value — subject separates on value alone |
| 1.5 | Surface — panel breaks, wear, decals, varying greeble density |
| 1.5 | Scale — known-small against known-huge |
| 1.5 | Atmosphere — dust, haze, nebula, aerial perspective |
| 1.0 | Colour grade — 2–3 hues, deep blacks, controlled bloom |
| 1.0 | Composition — off-centre, something running off frame |
| 1.0 | Energy — engines, beams, debris with real falloff |

**Gate: within 1.0 of the plate on the criterion under test, and no single criterion under 5.**

**Calibration comes first: if the critic scores the reference plate below 8, the round is void —
rerun it.** A lenient critic compresses the whole range and makes the gap look smaller than it is.
This happened for real on backdrop round 2: that critic scored the Homeworld plate 7.0 and ours
6.5, reporting a 0.5 gap. Round 3's critic scored the same plate 8.5 and ours 4.5. The second
critic was right — put the two renders side by side at sheet size and the gap is obvious. Round 2's
result was noise and should have been thrown out.

Also void if the critic cannot pick the shipped game out of the pair, or if its reasoning cites UI
text, a watermark or a crop edge.

**Judge at sheet scale, not at full render size.** Detail that only survives at 1280×720 is not
detail. Ours looked structured at full size and smooth as a gradient on the comparison sheet; the
plate holds structure at every scale. That difference is most of the score.

Up to three rounds per component. If round 3 still misses, record the scores, flag the component
as *needs more work in the next version*, and move on. Do not keep sanding.

## The perf gate

Measured at `--preset=medium --dpr=1 --w=844 --h=390` (mid-phone profile), headed:

| Metric | Budget |
|---|---|
| GPU p95 | < 11 ms |
| CPU p95 | < 6 ms |
| Draw calls | < 150 |
| Triangles | < 350k |
| Texture memory | < 60 MB |

Counts are the total drawn that frame, all passes. **Trust fps and the counts; do not trust the
GPU ms readout across runs** — see FORGE's CLAUDE.md for why. Attribute cost with counts.

## Rendering and checking your work

```bash
node tools/shot.mjs --shot=belt_work --w=1280 --h=720 --dpr=1   # one scenario
node tools/shot.mjs --all                                        # every scenario
node tools/compare.mjs --shot=belt_work --round=1 --ref=8500_01  # blind sheet vs plate
```

`shots/<id>.png` + `shots/<id>.json`. **Always actually look at the PNG with the Read tool.**
Numbers in a JSON file will not tell you it looks wrong.

## Prior art to lift from

`../forge/` is the graphics test bed this engine comes from. Lift and adapt:

- `js/engine/app.js` `quality.js` `budget.js` `stats.js` `aa.js` — port nearly as-is
- `js/scenarios.js` — the critic's contract, same pattern
- `tools/shot.mjs` `tools/compare.mjs` `tools/ratio.mjs` — port; point `compare.mjs`'s `REFS` at
  `aaa_refs/space/refs/clean`
- `NOTES_LIGHTING.md` `NOTES_MATERIALS.md` — read before writing a shader or a light rig

What does **not** carry over: terrain, foliage, buildings, people, water, the editor.

## Agent protocol

Work happens one component at a time, one agent at a time.

1. Read this file, then `HANDOFF.md`, then `BUILD_PLAN.md`.
2. Do **only** the component you were briefed on. Do not start the next one.
3. Finish by updating `HANDOFF.md`: what you built, what the next agent needs to know, what you
   deliberately left undone, and any gotcha that cost you time.
4. Then wait — do not exit. A stopped agent cannot be resumed, and its context is worth keeping.
