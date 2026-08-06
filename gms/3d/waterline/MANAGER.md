# WATERLINE — manager state

What the managing session needs that is not already in `DECISIONS.md` or `SCORES.md`.
Update this when the queue moves. Everything else lives in the files listed under "reading order".

## Reading order for a fresh manager
`MANAGER.md` (this) → `DECISIONS.md` (29 rulings, D1–D29) → `SCORES.md` (every round, every
revisit list) → the component's own `HANDOFF_*.md` → `GAME_BRIEF.md` for what Aaron actually asked
for.

## The process, as Aaron set it
- One coder agent at a time, **plus** critics (critics do not count against that — they are quick).
  Aaron granted one extra concurrent coder as a one-off, which is why C6 and C7 are both live.
- **Two coder passes per component** (D18, cut from three). Blind critic after each.
- A crashed or failed agent **does not consume a pass** — work is charged, infrastructure failures
  are not.
- Agents are **not recoverable** once stopped. Never try to resume; spawn a fresh one with a
  self-contained brief.
- Phase 1 visual work is **accepted as it stands**. Phase 2 revisits the lowest scores once the
  full game is testable — the ranked lists are already in `SCORES.md` per component.

## Progress board
**https://claude.ai/code/artifact/c55cb5ea-88e5-48f2-b4a9-08c2ae76276e**

Every scored shot, its plate, and each attempt with the gap trajectory. Rebuild and republish after
each review:
1. add the round to `tools/progress.json`
2. `node tools/progress.mjs`
3. republish `tools/progress.html` to **the same URL** (pass it as `url` if the session did not
   publish it itself, otherwise the same file path keeps the URL)

Renders are recovered from `critique/<shot>_r<n>.png` using `.keys/` to pick our side, so history
survives even though `shots/` only ever holds the latest render.

## Where the queue stands

| Component | Passes | Status |
|---|---|---|
| C5 sim, AI, ladder | 3 | closed — gated on harness, not blind-scored |
| C1 ocean, sky, light | 3 | closed — 1 of 3 shots passed |
| C2 bridge + table | 3 | closed — 1 of 3 |
| C3 ship + gunfire | 3 | closed — 0 of 3 |
| C4 impact VFX | 3 | closed — 0 of 3 |
| C6 director, sequences, shell | 2 of 2 | closed — 0 of 3 (best pass on the project, still short) |
| C7 UI, flow, dormant multiplayer | 2 of 2 | closed — game playable, saves and resumes |
| Wave C | agents 1–2 done | calls under 120 except one salvo transient; **ship prep next** |

### Immediately pending

**Wave C agents 1 and 2 are done. Draw calls are essentially solved.** Agent 2's find was a
Three.js quirk, not the fleet: r160 renders any `transparent` + `DoubleSide` material **twice**
(BackSide then FrontSide) unless `forceSinglePass` is set, and it defaults false. The fleet's
wake + collar + skirt were **54 of 120 main calls**, half of them drawing nothing. Set on all
fifteen such materials.

Measured live, cache disabled, fresh profile, four pinned seeds:

| | before | after |
|---|---|---|
| landscape settled | 118–151 | **75–103** |
| flyover peak | 157–166 | **95–117** |
| portrait settled | 97–119 | **89–107** |
| `window_out@0.0` | 76 | **54** |

**One overage left:** the salvo transient still touches **125** at the worst seed. Next lever is
named — fleet-wide foam buffers, ~27 calls → 3.

**E4(a) closed, and the root cause was the ocean, not the hull.** `radialGrid()` gives 33 m radial
× 30 m angular triangles at 450 m against a wave field of 74/41/23/13/7 m — three of five components
are shorter than one triangle, so the rendered sheet chords metres below the CPU `heightAt()` field
and the hull stands proud of it. Proven by placing 21 magenta spheres at exactly `heightAt`: several
floated clear of the water, several were hidden by it.

**That disagreement is the top outstanding item** and it moves every sea shot, so it needs a critic
before anyone tunes it.

### Remaining before this ships
1. Ocean tessellation vs `heightAt` (above) — needs a blind critic, not a tuning pass.
2. The salvo transient, 125 against 120.
3. Phone perf gate — **Aaron's device, D4. Only he can run it, and the game is ready for it.**
4. BUILD_PLAN v2 (D5), `projects.js` entry.
5. Phase 2 visual revisits — every component's ranked list is already in `SCORES.md`.

### The decision Aaron may want to make: portrait
C7 measured the board at **13.7% of frame height** in portrait, with the deckhead capping the camera
at 1.73 m above the chart, and draw calls rising to **177–199** there against 170/139 landscape. Its
judgement — which I agree with — is that this is geometry, not tuning, and the only real fix is
viewing the board along its **short** axis in portrait. That is a different composition, and on a
mobile-first game portrait is the orientation most people will hold. It is the one open item that is
a product call rather than an engineering one.

### Wave C — the standing list, now with numbers behind each item
1. **Draw calls.** Integrated game **196 against a 120 ceiling** (167 main + 29 shadow); triangles
   132.2k against 260k, so there is huge headroom on the metric BUILD_PLAN tells you to cut first
   and none on the one that is actually blown. `window_out@0.0` alone sits at 89 of 90 and touches
   90 mid-move (E7).
2. **The shadow box is centred on the world origin** (D20) — must land before anything re-renders.
3. **Texture union**: 39 of 45 MB in the real game.
4. **Two defects that now appear in every component's shots**: ships brighter than their own sky
   (max 254.9 against a sky maxing 174.3), and a hard highlight ceiling on the sea (zero pixels
   above luma 200 across 176,400 px where the plate has 5.26%). Both look like one tone-mapping
   problem at the top end, and fixing it may move several closed components at once.
5. **C6's escalations E3–E7**, listed below.
6. Phone perf gate (D4), C1 sea shots re-run now that real ships exist (D10), BUILD_PLAN v2 (D5),
   `projects.js` entry.
7. **Fix `oursSide` randomisation** before any phase-2 scoring (D26 ruling 4).

### C6 escalations awaiting Wave C — all in files it correctly refused to edit
- **E3** `fire.js` `rain()` — `softAdd`'s `src·(1−dst)` gives a 145-luma sky 1.75× less increment
  than a 65-luma sea, so rain cannot be made visible against sky by tuning `tone`. 3-line `skyTone`
  fix proposed.
- **E4** C3's hull — below-waterline slab drawn above water; open transom visible in `window_out@1.0`.
- **E5** `ocean.js` wants `setFlatten(a, b)` — `log2(dist / -V.y)` is why a level camera gets its
  *smoothest* water nearest the lens.
- **E6** C2 should own `table.setEnv()`; C6 worked around it by traversing table materials.
- **E7** `window_out@0.0` sits at **89 of 90 draw calls** and touches 90 mid-move. No headroom.

### Open items I have already handled
- `memoryProblem` is now exported from `js/sim/index.js` (C7 had shipped a drop-and-retry around a
  function `HANDOFF_SIM` §3 promised was public). Purity check still passes: 12 files pure.
- `shots/bridge_table.png` and `shots/boot.png` were overwritten with broken captures during the
  camera bug and need re-rendering. Nothing historical was lost — `critique/` is untouched.
- `config.js`'s `UI` export is still `{}`; C7's tunables live in `flow.js`. Same shape as D23 and it
  can be settled the same way when C7 pass 2 runs.

### Harness flake worth knowing
`--dpr=2 --w=1280 --h=720` has now hung for three independent parties (C4 on `fleet_wide`, C6, and
me on a control pair — 4–7 minutes, no output). `--dpr=1 --w=1600 --h=900` completes in 20–30 s and
is the standard for scored renders. Not yet diagnosed; do not burn a component's pass on it.

### Wave C, when C6 and C7 close
Full integration, the phone perf gate (Aaron's actual device — that is a ship gate, never a
per-component one, per D4), re-running C1's sea shots now that real ships exist (D10), the
consolidated BUILD_PLAN v2 promised in D5, and the `projects.js` entry.

**First real integration measurement — taken from a live match, not a scenario.** I booted
`index.html` headless with no `?shot=`, clicked Battle, and read the perf overlay in an actual game:

| Metric | Integrated game | Budget (BUILD_PLAN §516) | |
|---|---|---|---|
| Draw calls | **196** (167 main + 29 shadow) | < 120 bridge / < 90 sea | **over** |
| Triangles | 132.2k (112.9k main) | < 260k / < 300k | fine |
| Texture MB | **39** | < 45 | 6 MB headroom |

**Draw calls are the blown budget, not triangles and not textures.** 167 main calls against a 120
ceiling, in a scene no single component ever exceeded 99 in. Triangles have enormous headroom, so
the BUILD_PLAN advice to "drop `oceanSegs` first if it blows" is aimed at the wrong metric for this
failure — batching and instancing is where the work is. Ignore the fps figure from that run:
headless software rendering, and D4 says counts are the only attributable numbers.

**Texture budget is also tight.** Per-scenario `texMB` from the
round-3 keys: sea shots 4.5, bridge shots 24.2, gunfire 36.5, `hit_explode`/`night_burn` 36.7,
`fleet_wide` 39.2, `splash_miss` **39.3** of 45. No scenario yet loads the bridge *and* the fleet
*and* the VFX atlases at once — integration is the first time that union is paid. Measure it before
anyone tunes anything, because the fix (which atlas loses resolution) is a design call, not a
component one.

## Standing traps worth not rediscovering
- **Texture MB is a project total**, not per component (D16). Currently ~39 of 45.
- **A value that looks configured but is defeated downstream** (D12 `texCap`, D15 `fog`, D17
  `seaState`, D20 the shadow box — four bugs of this exact shape). Probe the *effect* at capture
  time from inside `--eval`; never trust the call site.
- **The shadow box is centred on the world origin** (D20), so a subject staged further out than the
  extent gets no shadows and no warning. `renderer.info.render` splits shadow calls from main calls
  and the `.keys/` files already record both — read them before theorising.
- **Measure the panel the critic scores, never the source plate** (D19).
- **Score gaps, never absolutes** (D11). Second critic only when a gap lands within 1.0 of −2.0.
- **Per-scenario noise floors** (D13). `sea_dusk` 4.5% at mean 0.086; `night_burn` 33% at 1.218.
  Always render a same-code control for *that* scenario before believing a diff.
- **No bloom pass.** C4 filed that as an escalation; `softAdd()` at `js/world/vfx/gun.js:42` is what
  it would have bought.
