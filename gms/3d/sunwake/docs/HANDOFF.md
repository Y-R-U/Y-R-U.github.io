# SUNWAKE — start here

**This is the entry point. Read this file first; it tells you which of the others you need.**

Last session: 2026-09-22. Written for Aaron returning after a break, or for an agent picking the
project up cold.

---

## What it is

A Three.js boat-exploration game on an endless sunset ocean, at `gms/3d/sunwake/`, live on the
Projects page. Sail a wooden launch across a deterministic archipelago, discover six authored
landmarks, fish, and run jobs between islands. Vanilla ES modules, locally vendored Three.js
0.180.0, **no build step and no dependencies**.

## Run it

```sh
# a static server on :8888 serving the REPO ROOT (never the sunwake folder alone —
# the vendored three.js import is relative to the repo tree)
python3 -m http.server 8888            # from /Users/aaronair/cc/yru/site
open http://127.0.0.1:8888/gms/3d/sunwake/
```

## Test it

```sh
cd gms/3d/sunwake
node tools/sim.mjs                     # 10 pure suites, no browser needed
node js/render/tests/hull.test.mjs      # 151,200-step buoyancy regression
~/.claude/bin/cdp start --port 9223 && node tools/browser.mjs     # real Chrome, 10 scenarios
```

Chrome **only** via `~/.claude/bin/cdp start --port 9223`, in the *same shell invocation* as the
node command (it idle-kills after 300 s). Never spawn Chrome by hand — leaked headless instances
have pegged this Mac at 500% CPU for days.

---

## State at this handoff

Green: 10 Node suites, the hull regression, the browser shell suite. The game boots and sails.
HEAD is `b937dee6`, everything committed and pushed.

**Two render-side tests are RED and were left that way deliberately, labelled rather than hidden:**

1. `js/render/tests/landmarks-browser.mjs` — fails *"A landmark is only marginally itself:
   1.426"*. The agent reported the landmark work green, then began the mid-distance water change
   and was killed by a usage limit. Most likely the water change altered the backdrop the
   landmark test measures silhouettes against. **Diagnose before building on either.**
2. `js/render/tests/water-detail-browser.mjs` — times out rather than failing an assertion;
   probably just needs the longer CDP timeout the gameplay lane added to `tools/cdp.mjs`.

Neither is a gameplay regression.

## What works

Four-octave wave field with a bounded Gerstner shift · four-point buoyancy (heave, pitch and roll
fall out of the physics) · **provably solid shores** — swept-circle collision, worst clearance
+0.001 m over a 20 km route and 100,000 random sweeps · six authored landmarks with postcards ·
fishing with six skill-gated species and 20 levels · jobs, coins and a chandlery · invisible
touch helm plus WASD · settlements, jetties, buoys, beacons, horizon weather · save/load.

## What is left

1. **Fix the two red tests** above and sign off the graphics lane.
2. **M7 adaptive quality** — four tiers exist and pass a suite, never finished or verified.
3. Polish: the boat at close range (it is on screen the whole game), distant sails, birds.
4. **Physical-device performance — NOT MET.** No agent has hardware; Chrome here is SwiftShader,
   so every performance number in `docs/VERIFY.md` is emulated. **Only Aaron can close this.**

## The most valuable thing to do next

**Play it.** Aaron has played this once, and the game has roughly doubled since — jobs, coins,
the chandlery, fishing, the invisible helm, beacons, settlements and the 900 m island read have
never been touched by a human. That single play session found a waypoint bug, a submerging boat
and unsightly controls that six green suites had sailed straight past.

Worth checking specifically: take a cargo job and sail it, and try the invisible helm on a phone.

---

## If you resume with agents

Two lanes in parallel, with a **file-ownership split** that has kept them from colliding:

| Lane | Owns |
| --- | --- |
| **Graphics** | `js/render/*`, `js/core/boat.mjs`, `island-shape.mjs`, `visual-config.mjs` |
| **Gameplay** | `js/core/*` (others), `js/platform/*`, `style.css`, `index.html`, `tools/*` |

`js/main.mjs` is not in the table; the gameplay lane has been editing it, because it is the only
place features get wired in.

Standing rules for every builder: nothing outside `gms/3d/sunwake/`; **no git operations** (other
sessions have uncommitted work in `games/`, `index.html` and `lib/auth/`, so staging is done by
hand with `git add gms/3d/sunwake`, never `-A`); Three.js is vendored, **never** a CDN import;
`js/core/*.mjs` stays pure so the Node harness imports real production code; update
`docs/ROADMAP.md` honestly.

`codex exec -m gpt-6-astra -c model_reasoning_effort="high" -s workspace-write -C <sunwake dir>
--add-dir <repo>/gms/lib` scopes codex to the game folder, so "don't touch anything else" is
enforced by the sandbox rather than by instruction.

## The lesson this project keeps teaching

**Six separate times a numeric suite passed green while an obvious visual bug filled every
frame** — far-water shelves, islands rendered inside-out, foam inside every island, a submerging
boat, a waypoint whose bearing pointed through solid rock, a settlement whose evidence file was
an empty crash dump. What has actually caught things here:

- **Reproduce before diagnosing.** Sail the route; do not reason about it from the source.
- **Falsify your own test** — run it against a build where the bug still exists and watch it fail.
- **Build a negative control in** — render the frame with the feature hidden and confirm the
  measurement collapses.
- **Look at the screenshots.** Tests passing is not evidence that it looks right.

## Document map

| File | What it is |
| --- | --- |
| `docs/HANDOFF.md` | **this file** — the entry point |
| `docs/ROADMAP.md` | the living todo list, from Aaron's play feedback; per-lane status and evidence |
| `docs/STATE.md` | architecture as built, verification commands, and a **gotchas section worth every line** |
| `docs/TASKS.md` | the review log. §A overrides PLAN; **§C1 is required reading before touching any distance fade** |
| `docs/VERIFY.md` | measured numbers and the honest limits, including what was never verified |
| `docs/BRIEF.md` | Aaron's original spec |
| `docs/PLAN.md` | the full implementation contract (long; consult sections as needed) |

`docs/evidence/` holds screenshots and JSON reports and is **gitignored** — it is 68 MB and would
bloat a Pages repo forever. It is the local review record; regenerate it by running the suites.
