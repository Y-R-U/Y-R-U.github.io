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

**Measurements that silently measure nothing.** Eighteen instances so far: silent audio clips
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
assets/audio/       manifest.json + chatter/ (207 Kokoro clips) + story/ (19) + music/ (SUNO)
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
| `?fleet=n` | §S2-I — open the company layer and put **n hired drivers** on the books. It winds `company.gross` on far enough to allow the cap (the cap is a company tier) and hires through the **shipped** transaction, signing fees and all. A measurement that reads absolute `gross` rather than a delta is reading the fixture |
| `?story=` | §S2-Q — a position on the one storyline: `taken` (the crew are at the next dock), `summons` (act two, the Boss unpaid), `act2` (after the meeting). `due`/`paid`/`seized` alias `taken` |
| `?nosave=1` `?seed=` `?time=` `?var=` `?tier=` `?crd=` `?cogross=` `?dock=` `?dpr=` `?probes=1` `?debug` | test hooks |

`?auto=1` and `?courier=1` are **not** the same flag and never should be. See `js/autopilot.js`.
Neither of those is the **player's** autopilot. That is `js/autopilot.js`'s `LanePilot`, on the AUTO
and HOME keys of the left console — it follows the traffic lanes (`js/lanes.js`), it is always
slower than hand-flying, and touching the stick takes the craft back on that frame with no mode to
cancel.

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

Suites: `p1a p2 p3a p3b p4 p5 p6 p7a p7b p8 p11 wire`, plus the season-2 suites
`s2a s2c s2d s2e s2f s2g s2h s2i s2j s2k`, `end`, `boot`, `tunnel`, `road`, `vo`, and `determinism`, `t10_falsify`,
`budget`, `soak`, `sim_s2f`, `sim_s2i`, `fleet_rate`.

**`gates_end`** (2026-08-23) is the ARC's curtain — the beat that fires when the player owns a hull
outright, debt-free, in act two. 19/19 portrait and landscape. It also carries the two controls for
the defects that phase found: a player who owns a hull must not read as GROUNDED, and the free
`wisp` must not close the arc.

**§S2-Q rewrote act one and there is now ONE storyline.** The 84-minute window (`WINDOW_S`) and the
saturating pace gauge are DELETED. The crew take the craft — and not the money — at the **first dock
at or above 2 500 CRD**; act two's objective is to earn **10 000** and hand it to the Boss in person,
and that meeting (`Story.meetBoss`, `#boss`) opens the company layer and the Dad thread. The 50 000
survives as the shadow. `?story=taken | summons | act2` name positions on that road (`due`, `paid`
and `seized` are aliases of `taken`). The dash's `warmth` bay is now `credits / target` — it cannot
saturate, and it is the same comparison that fires the event. **Read `docs/MANAGER_STATE.md`'s S2-Q
section before touching `js/story.js`.** `gates_s2e` is 33/33, `gates_end` 19/19, both orientations.
**`gates_p5` and `gates_p7a`/`p8` write a different JSON schema from `p1a`–`p4`
(`ok`/`fail` rather than `results`)** — a parser that reads only `results` reports 0/0 on a suite
that fully passed. That mistake has been made three times here.

Green at end of **pass 2-A** (2026-08-20): `p1a` 10/10 · `p2` 8/8 · `p3a` 13/13×2 · `p3b` 12/12 ·
`p4` 19/19×2 · `p5` 16/16×2 · `p6` 19/19×5 · `p7a` 30/30 · `p7b` 20/20 · `p8` **32/32** ·
`p11` 8/8×2 · `wire` 11/11 · `s2a` 13/13×2 · `s2c` 17/17×2 · `s2d` 14/14×2 · `s2e` 30/30×2 ·
`s2f` 11/11×2 · `s2g` 9/9×2 · `determinism` 9/9 (**golden hash `f29beaf9`, 25,039 buildings**) ·
`t10` 4/4 · `budget --headed` green on both presets.

**`gates_s2k`** (2026-08-20) covers the four play-test defects: the Kokoro voice pool, the console
that has to stay out of the flying thumb's half in BOTH `flipSides` states, the chatter suppression
over a story beat, and §3.2.3's per-work-unit cost cap.

**`p7a` and `p7b`'s numbers are the `--falsify` totals** — that flag ADDS six checks to each suite
(24+6=30, 14+6=20). Running them without it and "correcting" these figures downward would quietly
retire twelve falsification controls. One agent proposed exactly that.

## `budget.mjs`'s millisecond gate is a CPU gate

**`__state.ms.frame` is CPU wall time around the loop body — it measures draw-call submission, not
GPU execution.** While the GPU finishes inside vsync it cannot see fragment cost at all. S2-H proved
this: forcing every shopfront blind OPEN vs SHUT moved the mean by −0.003 ms at 1.3 Mpx and −0.14 ms
at 5.8 Mpx, both inside a 0.4–0.8 ms within-arm spread, and at **13 Mpx all three arms sat on 60.0
fps with a spread of 0.01**.

So **a fill-rate-heavy feature can pass `budget.mjs` cleanly and still stutter on a phone.** Draw
calls and triangle counts from that tool are real; its millisecond figures are evidence about the
CPU and nothing else. Several phases have reported "the cost is inside the noise" — every one of
those is a CPU statement. Do not repeat them as if they were GPU measurements.

## Two Chrome sessions in one node script kill each other

`shot.mjs`'s `cleanup()` pkills on `/tmp/neonhaul-cdp-<NODE PID>` — the profile dir is keyed on the
**node** process, not on the Chrome instance, and **every session a script opens shares it**. So
closing a second browser kills the first one's Chrome too, and the next `evalJSON` on the first
session **hangs forever**: there is no timeout on a CDP send. S2-I lost 25 minutes to this and it
reads exactly like a slow gate, not like a crash. If a suite needs a second page (a control arm on a
different URL), open it **after** the main session's `close()`.

Related: **`settle()` counts FRAMES and gives up after 25 s of wall time.** `settle(S, 3600)` returns
`-1` having advanced whatever it managed — 26 sim seconds against the 60 that were asked for, on
S2-I's first run. Anything that needs minutes of sim must wait on `__state.t` and say so if it comes
back short (`gates_s2i.mjs`'s `advance()`).

## Gotchas that have cost real time

- **Headless ANGLE stalls above ~5 Mpx on this machine.** `1600×900 @ dpr 2` never returns a
  screenshot; `--headed` does. `shot.mjs` defaults to `--dpr=1` and warns. Do not debug a "hang"
  that is this — and note the threshold is soft: `1280×800 @ dpr 2` (4.1 Mpx) stalled too, at P10.
- **A differencing gate must FREEZE THE CLOCK, and `gates_p6` did not for eleven phases.** Its
  cabin cost check took two `__state` samples 12 frames apart with 892 craft moving through them,
  so every craft that crossed §5.5's 220 m line between the samples added its whole 868-triangle
  body to the "cabin". The cabin is 5 draws and **196** triangles; the gate read 196 + traffic and
  passed only because the contamination usually landed under its 1000-triangle bound. S2-N's
  per-frame door update shifted the frame phase, one more craft promoted, and the same gate read
  **1088** — an 82 % "regression" in a number with nothing to do with the cabin. It now freezes,
  and asserts `craft.tris` did not move across the two samples. The bound was NOT touched.
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
- **`X && X.method()` is how a fix ships broken.** §S2-K's chatter suppression called
  `this.dir && this.dir.setScene(v)` from `startIntro()` — and the director does not exist until
  the 22 KB manifest lands, which is after the cutscene starts. The call did nothing, the manifest
  arrived mid-scene, and the defect was still there. Its own gate passed, because the gate drove
  the method on a page where the director already existed. **A latch set before its object exists
  has to be re-applied when the object is built**, and the gate for it has to play the real scene.
- **The voice pool is Kokoro-82M**, driven from Abogen's uv-tool interpreter
  (`/Users/aaronair/.local/share/uv/tools/abogen/bin/python`) by `tools/vo/kokoro_say.py`, batched
  once per run. There is no HTTP TTS endpoint on `:8808` — it is htmx against `/wizard/upload`.
  **Whisper intelligibility is not an acceptance test for a voice**: it scored the macOS `say` pool
  at 90.7 % and that pool is what Aaron called *"a computer voice from the 90s"*. Build
  `tools/vo/gen_chatter.py --demo` and listen to it.

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
