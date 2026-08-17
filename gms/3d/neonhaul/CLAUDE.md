# NEONHAUL — project guide

A mobile-first cyberpunk courier game. Three.js from a CDN importmap, ES modules, **no build step**.
Open `index.html` over a static server and it runs.

**Live at https://yru.br8t.com/gms/3d/neonhaul/** — the repo has a `CNAME`, so the `y-r-u.github.io`
host answers **301** and redirects. Curl it without `-L` and you will poll `301` forever and
conclude the deploy never happened. A status code from a URL you did not follow is not a
measurement of the resource.

**Read `docs/MANAGER_STATE.md` first.** It is the running record of what was built, what was
measured, what was deliberately not done, and every trap this project has already paid for.
`docs/DECISIONS.md` holds the settled calls and the tracked obligations. `docs/BUILD_PLAN.md` is
**218 KB — never read it whole**; each section is self-contained and the phase table in §13 names
which sections a piece of work needs.

## The one lesson this project is built around

**Measurements that silently measure nothing.** Seventeen instances so far: silent audio clips
reported OK; a layer compared against itself returning exactly 0.0; `&&`-guarded isolation that
no-ops; a gate parser reading a key that did not exist; `solidAt()` returning `null` for an
ungenerated chunk and being banked as "clear"; an occlusion gate that sampled a region the tower
did not occupy and had passed for two phases.

So: **when you assert a gate works, prove it can fail.** Break what it guards and confirm it
catches it. A difference of exactly zero is a broken experiment far more often than a real result.
A test may never use `&&` to make its own setup optional.

## Layout

```
index.html          every screen as static markup, hidden by class
style.css           one file, mobile-first, safe-area aware
js/                 34 ES modules, no bundler — main.js wires everything
data/               districts, landmarks, names, clients, the baked sign atlas region table
assets/signs.png    baked greyscale signage atlas, 2048², ≤ 400 KB
assets/clients/     16 client portraits: jpg + 96px thumb + looping mp4
assets/audio/       manifest.json + chatter/ + music/ (SUNO takes)
shots/*.json        COMMITTED shot scenario definitions; renders alongside them are gitignored
tools/              headless-CDP renderer, gate suites, sims, the sign baker
docs/               the plan, the decisions, the manager state, the phase notes
```

The one thing to know about `js/`: **`main.js` is the only wiring point**, and it exposes
`window.__game` (live handles + isolation hooks) and `window.__state` (a read-only snapshot) for
every tool in `tools/`. `window.__ready` goes true when the game is playable.

## URL flags

| flag | what |
|---|---|
| `?lite=1` | the LOW quality preset — the weak-phone path |
| `?perf` | the perf overlay |
| `?nohud` | hide the DOM HUD layer (shots and gates) |
| `?shot=<id>` | render a `shots/<id>.json` scenario at its frozen camera |
| `?auto=1` | the **fixed 120 s** autopilot route. Four gate suites measure against it — do not change it |
| `?courier=1` | the **navigating** soak pilot: takes jobs off real boards and flies them. Implies `auto` |
| `?noaudio=1` | build no audio layer at all (the control arm for "what does audio cost") |
| `?nosave=1` `?seed=` `?time=` `?var=` `?tier=` `?crd=` `?dock=` `?dpr=` `?probes=1` `?debug` | test hooks |

`?auto=1` and `?courier=1` are **not** the same flag and never should be. See `js/autopilot.js`.

## Running it

```bash
cd ~/cc/yru/site && python3 -m http.server 8232 --bind 127.0.0.1 &
open http://127.0.0.1:8232/gms/3d/neonhaul/
```

## Gates

Every suite is a node script driving real Chrome over raw CDP — no puppeteer.

```bash
node tools/gates_p4.mjs              # one suite
node tools/gates_p4.mjs --lite       # the LOW preset
node tools/determinism.mjs           # the golden city hash
node tools/budget.mjs --headed       # the frame budget, on a real GPU
node tools/shot.mjs --shot=fog_city  # a render + its perf snapshot
```

Suites: `p1a p2 p3a p3b p4 p5 p6 p7a p7b p8 p11 wire`, plus `determinism`, `t10_falsify`,
`budget`, `soak`. **`gates_p5` and `gates_p7a`/`p8` write a different JSON schema from `p1a`–`p4`
(`ok`/`fail` rather than `results`)** — a parser that reads only `results` reports 0/0 on a suite
that fully passed. That mistake has been made three times here.

Green at ship: `p1a` 10/10 · `p2` 8/8 · `p3a` 13/13 · `p3b` 12/12 · `p4` 19/19×2 · `p5` 16/16×2 ·
`p6` 19/19×4 · `p7a` 30/30 · `p7b` 20/20 · `p8` 30/30 · `p11` 8/8×2 · `wire` 11/11 ·
`determinism` 9/9 (**golden hash `f29beaf9`, 25,039 buildings**) · `t10` 4/4.

## Gotchas that have cost real time

- **Headless ANGLE stalls above ~5 Mpx on this machine.** `1600×900 @ dpr 2` never returns a
  screenshot; `--headed` does. `shot.mjs` defaults to `--dpr=1` and warns. Do not debug a "hang"
  that is this — and note the threshold is soft: `1280×800 @ dpr 2` (4.1 Mpx) stalled too, at P10.
- **`solidAt()` returns `null` for an ungenerated chunk**, which is indistinguishable from open air.
  Any remote probe must assert `__game.cityChunkLive(x, z)` first, or it will conclude a defect does
  not exist. It once did exactly that across 242 pads.
- **The game loop overwrites test fixtures.** `setZones`, `setSignVisible` and the cabin visibility
  all had isolation that the next frame silently undid — the gate reported success and measured the
  unchanged scene. Every isolation hook is now an override that outranks game logic.
- **Chrome's memory cache makes a "0 requests" gate vacuous.** A board that re-renders from cache
  makes no requests at all, which reads exactly like the zero a "no `.mp4` on the board" gate wants.
  Prove the counter can see the thing before its zero is allowed to mean anything.
- **The signage atlas is frozen.** `data/signwords.json` is the bake input, but `tools/signbake.html`
  takes only the **first n** entries of each list and `board_en` is already exactly n=40. Adding
  words is therefore a code change that repacks all 250 regions and moves every UV — not the
  data-only edit `DECISIONS.md` T6.2 describes. Six landmark words are aliased in `js/signage.js`
  instead.
- **No `alert()` / `confirm()` / `prompt()`, ever.** Styled in-game panels only.

## Where the art stands

Round 7's blind critics (`SCORES.md`) still say *"every light source is a sticker"* six of six.
P11 landed the colour half of that diagnosis — per-building and intra-building colour, a window
spill model, close-up material variety, a real road surface — and the differences lists moved, but
the score did not. **The remaining gap is lighting**, and `SCORES.md` round 7 lists what six
critics say would close it: roof furniture at LOD1, a sky lighter than the towers in front of it,
rain that picks up colour with depth, wet specular on facades, AA on the tower/sky boundary.

Read `docs/DECISIONS.md` §12 before treating any critic **number** as evidence: the same unchanging
reference plate scored 6.0–7.5 across six rounds. **The differences list is the signal; the number
is noise.**
