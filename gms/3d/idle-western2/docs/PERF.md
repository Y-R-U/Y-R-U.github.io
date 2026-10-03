# Idle Western 2 — performance audit (2026-10-04)

The target is Aaron's Galaxy S22 Ultra in portrait: 412×915 CSS at DSF 2.625, Android UA, on the `high` tier. To reproduce:

```
CDP_PORT=9381 node tools/perf-audit.mjs [--reps=3] [--win=6] [--only=frame,profile,static] [--json=out.json]
```

Run it as the only heavy GPU job. The tool waits for Flux, LTX, TTS and ACE-Step to be idle, and logs the load average and GPU status for each phase. The audit is read-only: it monkeypatches the page from the test and makes no game-code changes.

## How it measures
- **Phase `frame`** runs at CPU 4× on the BUILD 20261004a demo save (all 9 businesses at Lv 60, `tod=17`).
  - **Scenarios:**
    - `top`: hero plus the first card, idle.
    - `storm`: the W10 gate storm, where brawl, Garter build, fling every 1.5 s, all gags and an ambient duel all fire in the hero.
    - `scroll`: 6 s down and back up.
  - **Windows:** each scenario gets 1 uninstrumented window, then 3 instrumented windows; the medians are reported.
  - **Buckets:** per-frame timings come from wrapping `game.tick`, `shipments.update`, `host.render`, `world.update`, each `plot.update`, `ambient.update`, `spectacle.update`, `world.prepare`, `renderer.render` (split into scene and post passes for hero and cards) and `shadowMap.render`, plus the host's `presentSum` and `ui.update`.
  - **Draws:** draws and vertex invocations come from a WebGL2 prototype wrap (`count × instances`). Shader links and JS heap growth are also tracked.
- **Phase `profile`** takes a V8 CPU profile and an allocation sample of `storm` and `scroll`.
- **Phase `static`** runs at CPU 1×, with the game loop paused and the tier forced to level 0.
  - Each view is rendered alone into its real-size render target. Timing uses `EXT_disjoint_timer_query`.
  - It measures MSAA, post, shadow and resolution deltas, then hides each hero scene child and each plot piece in turn. Off and on states are alternated over 3 rounds, and the median Δ is taken.
- **About the GPU numbers:** they are Apple M5 (Metal) times, so read them as **ratios**. As a rule of thumb, the S22's GPU (Adreno 730 or Xclipse 920) is about **4–5× slower** than the M5. Fill and vertex counts are exact.

## Headline
| scenario | rAF work p95 (instrumented, median of 3 windows): run 1 / 2 / 3 | uninstrumented | dt p95 |
|---|---|---|---|
| top | 3.6 / 4.0 / 8.6\* | 3.9 / 3.9 / 9.0\* | 16.7–16.8 |
| storm (W10) | 5.6 / 4.5 / 5.6 | 5.5 / 3.9 / 5.2 | 16.7–16.8 |
| scroll | 10.0† / 5.1 / 5.0 | 8.1 / 4.9 / 4.5 | 16.7–16.8 |

The load average was 3.2–4.4 throughout, with TTS jobs running between phases.

\* In run 3 the TTS agent was busy just before `top`. The governor stepped down to level 1 (DPR 1.2), and the hero's CPU submit doubled, from 1.5 to 3.4 ms, with the same draws.

† The first scroll window is cold: card shadow maps get created (textures 23→29) and card rigs are built lazily.

**Verdict:** on a quiet machine the 8 ms CPU gate passes, with 3.5–5.5 ms p95. The lanes' 9–11 ms readings are contention on a shared machine and are not reproducible. The real S22 risk is the **GPU**, and it is **vertex-bound**: the hero pushes **2.0–2.8 M vertices per frame** at 60 fps, and each card pushes **0.76–1.09 M**. On the M5, hero GPU time barely moves with resolution (below), and **62% of hero vertices are townsfolk**. Estimated on the S22, the hero takes about 10–13 ms of GPU per frame, and a card about 4–6 ms per render. That is enough to miss 16.7 ms whenever a card shares a frame with the hero, which is exactly IL2's "slow/jerky with many businesses".

## Per-frame CPU breakdown (CPU 4×, ms; mean / slowest-10% frames)
| bucket | top (run 2) | storm (run 3) | scroll (run 3) |
|---|---|---|---|
| loop body (tick+ship+host+ui) | ~2.7 / ~4.0 | 3.69 / 5.48 | 2.04 / 4.51 |
| host.render | 2.60 / 3.66 | 3.55 / 5.10 | 1.90 / 4.15 |
| → **hero scene pass** (three CPU submit) | **1.64 / 2.01** | **2.08 / 2.80** | 0.44 / 1.40 |
| → hero post (bloom + tilt + sharpen, 7 passes) | 0.09 / 0.11 | 0.12 / 0.19 | 0.03 / 0.07 |
| → card scene pass | 0.11 / 0.29 | 0.15 / 0.31 | **0.64 / 0.89** |
| → card resolve | 0.01 | 0.01 | 0.03 / 0.06 |
| → shadow-map renders | 0.05 / 0.08 | 0.11 / 0.21 | 0.02 / 0.07 |
| → present (2D blit) | 0.09 / 0.16 | 0.13 / 0.20 | 0.09 / 0.24 |
| → world.update (hook) | 0.36 / 0.49 | 0.55 / 0.89 | 0.34 / 0.51 |
| ‣ plots.update | 0.21 / 0.30 | 0.34 / 0.51 | 0.19 / 0.29 |
| ‣ ambient / town.tick | 0.03 / 0.00 | 0.03 / 0.00 | 0.02 / 0.00 |
| → spectacle.update | 0.06 / 0.10 | 0.16 / 0.28 | 0.13 / 0.20 |
| → prepare | 0.02 | 0.03 | 0.03 |
| ui.update | 0.11 / 0.17 | 0.13 / 0.27 | 0.14 / 0.27 |
| game.tick + shipments | 0.03 | 0.04 | 0.04 |
| scroll driver: forced layout from `scrollTop =` | — | — | 0.26 |

Renders per frame:
- **top:** 1 hero and 0.25 cards per frame.
- **storm:** 1 hero and 0.24 cards.
- **scroll:** 0.23 hero and 0.68 cards. In the slow frames this rises to 0.69 hero and 0.89 cards, so a slow frame is a frame that renders both the hero and a card.

Other CPU findings:
- **GC:** 1.9 ms over 6 s of storm, and 2.9 ms over 6 s of scroll, which is 0.1% of busy time. Allocation is 2.2–4.0 MB/s and the heap churn probe reads 2.3–3.9 MB/s. **GC is not a problem.**
- **Audio:** `ui/audio.js` does not appear in either profile's top 22 files, so it is about 0.
- **Shader programs:** 23 after warm-up, and **0 links during play**, except that the **first construction adds one depth program** (23→24; see fix 7).
- **Hottest profile frames:**
  - three.js accounts for 9–10% of samples: `updateMatrixWorld` (307 objects), `projectObject`, `renderBufferDirect` and uniform uploads.
  - `(program)` accounts for 7–11%. This is native time: GL command submission, layout and `drawImage`.
  - **`syncJump` (ui/app.js:536) has 88 ms self time per 6 s of scroll.**

## Per view (S22 high, level 0: hero DPR 1.5, cards DPR 1.55 under the 0.5 Mpx cap, 4× MSAA HalfFloat RTs)
| view | px | Mpx | draws (scene only) | tris | vertex invocations | M5 GPU scene | no MSAA | + post/resolve |
|---|---|---|---|---|---|---|---|---|
| hero (focus saloon) | 618×783 | 0.48 | 68 (frame: 69 idle, 93–94 storm, ≤133 on shadow frames) | 755k | **2,264k** (storm 2.61 M) | 2.34 | 2.40 | 2.67 |
| saloon card | 601×809 | 0.49 | 26 | 363k | 1,088k | 1.40 | 1.71 | 1.56 |
| garter / undertaker / dentist / jail / shine | 601×809 | 0.49 | 25–28 | 304–317k | 912–951k | 1.07–1.30 | — | — |
| tubs / bank / livery | 601×809 | 0.49 | 24–26 | 252–285k | 757–856k | 0.98–1.10 | — | — |

Other per-view numbers:
- **Hero GPU vs resolution** (4× MSAA / 1×):

  | DPR | Mpx | 4× MSAA | 1× |
  |---|---|---|---|
  | 1 | 0.22 | 2.64 ms | 2.66 ms |
  | 1.25 | 0.34 | 2.70 ms | 2.96 ms |
  | 1.5 | 0.48 | 3.05 ms | 3.36 ms |
  | 2 | 0.86 | 3.51 ms | 3.97 ms |

  Fill is about 15% of the hero's cost, and MSAA is free on a tiler, so **the hero is vertex-bound**.
- **Hero shadow-map pass** (runs at 12 Hz on high): +26 draws, +700k vertices, +0.34 ms M5 GPU. It lands on 1 hero frame in 5, and those frames are the p95 ones (callsMax 133–160).
- **Materials:** 18 (6 uber flavours). **Programs:** 23. **Scene graph:** 307 objects, 271 meshes. **Textures:** 23 (29 once every card's 512 shadow map exists).

### Where the hero's vertices go (Δ when hidden; hero pinned on the saloon)
| group | draws | vertices | M5 GPU Δ |
|---|---|---|---|
| **all townsfolk rigs (25 InstancedMeshes, 89 people visible)** | 18 | **1,395k (62%)** | **1.50 ms of 2.6** |
| actors:walker (21 walking rigs) | 1 | 385k | 0.39 |
| plot:saloon (9-person crowd = 165k) | 8 | 241k | 0.21 |
| ambient (8 people = 147k) | 4 | 172k | 0.26 |
| plots shine / tubs / dentist / livery / garter (each crowd 92–147k) | 5–11 each | 117–157k each | 0.10–0.19 each |
| town:far | 1 | 130k | 0.12 |
| ground:0 / town:4:s / town:3:s | 1 each | 112k / 109k / 79k | ≤0.13 |
| spectacle:props | 1 | 55k | ~0 |

### The townsfolk rig: 18,354 non-indexed vertices per person (`kit/crowd.js`)
Every instance runs the vertex shader over every style variant, and the unused variants are collapsed in the shader:

| part | vertices |
|---|---|
| always on (body, limbs, head, carried item) | 4,218 |
| 7 hair styles | 4,320 (~620 used) |
| 5 moustaches | 1,800 (≤360 used) |
| 21 accessories | 6,690 (typically 1–3 used, ~600) |
| parametric hat lathe | 2,748 |

A typical person shows about 8.5k vertices but pays for 18.4k, so **about 55% of crowd vertex work is invisible**.

### Where a card's vertices go (undertaker, 948k; Δ when hidden)
| piece | vertices |
|---|---|
| ambient (172k, of which 147k are 8 townsfolk) | 172k |
| town:far | 130k |
| ground:0 | 112k |
| town:4:s / 3:s / 5:s | 109k / 79k / 73k |
| terrain | 49k |
| town:4:n / 5:n / 6:n | 32k / 28k / 28k |
| **the card's own plot** (crowd 92k + statics 28k + small) | **~127k** |

Only about 13–18% of each card's vertex work is the business the card is about.

## GPU fill (S22 high)
| view | scene RT | samples | post chain | blit |
|---|---|---|---|---|
| hero | 618×783 = 0.48 Mpx, 4× MSAA, HalfFloat | 1.94 M | half-res 309×392 chain (down + 4 blur) + quarter 77×98 + full-res composite | 0.48 Mpx `drawImage` |
| card | 601×809 = 0.49 Mpx, 4× | 1.94 M | full-res resolve + sharpen | 0.49 Mpx |

At steady state the shaded pixels are about 90 Mpx/s for the hero at 60 Hz plus about 45 Mpx/s for the focused card at 30 Hz, around 135 Mpx/s in total. That is a small fraction of what an Adreno 730 can fill. The IL2 pixel budget (0.5 Mpx cards) is holding; **fill is not the problem, vertices are.**

## Ranked fixes
| # | fix | evidence | expected saving | lane |
|---|---|---|---|---|
| 1 | **Townsfolk rig diet / LOD.** Build a "crowd-lite" rig for the ambient, plot and walker crowds: hair styles 7→2, moustaches 5→2, only the ~6 accessories crowds use, hat lathe 16→10 segments. That is about 6–7k vertices. Keep the full 18.4k rig for the ≤6 spectacle cast. An alternative is to build each plot's crowd from the union of its instances' looks. | 89 people × 18,354 v = 1.40 M of 2.26 M hero vertices; 1.5 of 2.6 ms M5 GPU | Hero about −1.0 M v/frame (−45%), about −0.9 ms M5, **≈ −4 ms per hero frame on the S22**; each card −100–150k v | **A** |
| 2 | **Cards stop drawing the whole town.** In `prepare(line)`, also hide `town:far`, the ambient crowd and the `town:N:s/n` chunks outside the card's x-range (or cut with a camera far plane), and split the giant chunks so frustum culling works. | card ≈ 0.93 M v, of which the own plot is ~0.13 M | Cards −0.5 to −0.6 M v (−55%), **≈ −2–3 ms S22 GPU per card render**, −5–8 draws per card | **A** (chunk split, layers) + **manager** (`world.prepare`) |
| 3 | **Never render hero and a card in the same phone frame, and drop the idle hero to 30 fps.** Hero at 60 fps only while look, fling or the spectacle slot is active; otherwise 30. On phones, cards go only on non-hero frames. | Slowest 10% of scroll frames = 0.69 hero + 0.89 card; the hero scene pass is 57% of loop CPU (2.1 mean / 2.8 slow ms, storm) | p95 about −0.9 ms CPU at 4×; idle hero CPU and GPU halved (−1 ms mean CPU, about −5 ms per 2 frames S22 GPU) | **manager** (host.js / quality.js) + **S** (director "hot" flag) |
| 4 | **Collapse draw calls in the hero:** one town-wide crowd InstancedMesh (+1 blob) instead of 9 plot crowds plus ambient (18 draws → 2), and merge each plot's static tier meshes (livery 11 draws, tubs and saloon 8). | three CPU ≈ 22–30 µs per draw at 4× (hero 93 draws = 2.1 ms) | −30 to −35 hero draws, **≈ −0.8 ms CPU per hero frame** | **A** (crowd), **P** (plot statics) |
| 5 | **Shadow map on phones:** `shadowHz` 12→4, and `castShadow=false` on `town:far` and chunks more than ~60 m from the look point. | +26 draws, +700k v, +0.34 ms M5 on 1 in 5 hero frames, and these are the p95/callsMax frames | 3× fewer shadow spikes, each about −1.5 ms S22 GPU and −0.2 ms CPU | **manager** (quality) + **A** (caster flags) |
| 6 | **Throttle off-camera plot updates.** `world.update` ticks every plot within ±45 m of the hero look plus the visible cards, every frame. Instead, stagger non-focus plots at 15–20 Hz and skip plots no rendered view will draw this frame. Optional: de-allocate `plotbase.js:131`, `construction.js:241`, `actors.js:249/292/353` (polyline / roadPath / update), `ambient.js:139` and `world.js:134` (GC is only 0.1%, so this is hygiene). | world.update 0.34–0.71 mean, 0.5–1.0 slow; plots.update 0.2–0.4 | About −0.3 ms mean and −0.4 ms slow, CPU 4× | **P** (plots), **manager** (world.update) |
| 7 | **Pre-warm the construction depth program.** The first `buy` of an unbuilt lot links a new `depth` shadow program (programs 23→24) mid-play. Build the stage kit hidden at boot so `warm()` covers it, or make the stage pieces `castShadow=false`. | Link observed during the storm build; 0 links otherwise | Removes a one-off hitch of about 20–100 ms (Adreno link) at the moment of purchase | **P** (construction) / **manager** (warm) |
| 8 | **Stop forced layout in `syncJump`.** It reads `scrollY`/`innerHeight` on every scroll event and every chrome update after DOM writes. Instead, read once in the scroll handler (rAF-coalesced) and cache `innerHeight` from the ResizeObserver geo. | 88 ms self per 6 s of scroll (~0.25 ms per scroll frame at 4×); the driver's forced layout is 0.26 ms per frame | About −0.25 ms per scroll frame | **U** |
| 9 | **Spectacle draws:** fold the 12 `spectacle:hat0..11` meshes into one parametric hat InstancedMesh (the crowd shader already evaluates the lathe per type), and use the crowd-lite rig for extras. | The storm adds about +25 hero draws and +0.35–0.6 M v (69→94 draws, 2.26→2.61 M v); spectacle.update is 0.16–0.22 ms | About −10 draws and −0.2 M v during scenes, about −0.3 ms CPU per storm frame | **S** |
| 10 | **Hero presenter on phones:** the hero is redrawn into its 2D canvas by `drawImage` at 60 Hz (0.48 Mpx copy plus a sync). Try the overlay/direct presenter for the hero only (cards keep blit), behind `?presenter=`, and verify on the S22. | present 0.09–0.15 mean / 0.2–0.24 slow ms CPU; the GPU copy cost is unmeasurable here | About −0.1–0.2 ms CPU per frame, plus one fewer full-screen copy on the S22 | **manager** (host / presenters) |

Not worth doing now:
- **Post.** It costs 0.12–0.25 ms CPU and about 0.3 ms M5 GPU.
- **MSAA.** It is free on tilers.
- **The 0.5 Mpx card budget.** It is already right.
- **GC and audio.** Both are negligible.
- **UI jobs.** `ui.update` is 0.11–0.26 ms, already sliced.

Fixes 1, 2 and 5 together cut hero vertices by about 50% and card vertices by about 60%. That is the S22 GPU headroom. Fixes 3, 4 and 6 are the CPU-gate headroom, worth about 2 ms of p95 at 4×.

## Caveats
- The GPU numbers are from an M5 under Metal. The S22 figures apply the stated 4–5× factor and are estimates. Vertex and pixel counts are exact. A real-device check is still needed: chrome://inspect with a Perfetto GPU trace on the S22.
- Instrumentation overhead is 0–0.4 ms p95 (instrumented and uninstrumented windows agree within noise).
- Hero vertex counts depend on where the director is pointing. The static run is pinned on the saloon; the hero averages 1.95–2.10 M v idle and 2.6 M in the storm.
