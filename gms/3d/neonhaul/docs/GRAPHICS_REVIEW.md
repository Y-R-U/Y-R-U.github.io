# Neonhaul graphics review — 2026-10-01

Status: **complete; ready for manager-selected implementation**. Read-only runtime review. No commits/pushes. All review Chrome sessions closed. Reviewer owns this document and ignored `shots/graphics-upgrade/before/` artifacts only.

## Original goals and decision precedence

Exact original prompt is recovered in `docs/GRAPHICS_ORIGINAL_GOALS.md` from Claude history session `2bb474f2-e878-4838-a8cf-9dba6102b096`, timestamp `1786924275248`. Relevant requirements: very large/tall mobile-first Three.js cybercity; mostly dark *setting* with interesting dark daytime/smog; simple glass/metal buildings; reflections important; cheap visual tricks; opaque windows or texture interiors; sleek mostly-black metal/glass craft; excellent cockpit/docking surfaces. Single builder at a time conserves the five-hour usage block.

Read site AGENTS.md, Neonhaul CLAUDE.md, MANAGER_BRIEF.md, ART_PASS.md, MANAGER_STATE.md current/opening/P11/preferences sections, relevant DECISIONS.md (including 10, 12–14), SCORES.md lighting findings, and BUILD_PLAN selected reflection/fog/bloom/six-shot sections. Current frozen JSON cameras outrank historical prose. Decisions and later user steer outrank old plan recipes: S2-R removed road paint for black obsidian; existing shop cloak figures remain, this pass adds no characters or gameplay. Original aesthetic does not justify copying Heirframe's daylight palette.

P11 improved colour variety and window distribution but six of six round-7 critics still named sources as stickers. Current images corroborate a narrower version: **pane halos already exist and visibly brighten immediate sill areas, but corner strips/signs lack convincing receiving surfaces; glass and opaque cladding remain too similar.** Another blanket colour pass or raising ambient spill is unlikely to solve that.

## Actual capture evidence

All paths below are relative to `gms/3d/neonhaul/`; images were opened individually with view_image. Captures use headless Chrome ANGLE Metal, DPR1, HIGH, saved/seed fixture state frozen, no errors. These desktop snapshots do not establish physical-phone performance.

| Image under `shots/graphics-upgrade/before/` | Settings | Observed stats |
|---|---|---|
| `fog_city-landscape.png` | 1280×720, stormnight 23.2, frozen scenario | 59.5 fps; 58 draws; 150,624 tris; CPU frame 9.144 ms |
| `canyon_dive-landscape.png` | 1280×720, stormnight 1.4, frozen scenario | 59.5 fps; 53 draws; 163,936 tris; CPU frame 7.287 ms |
| `hero_craft-landscape.png` | 1280×720, duskburn 19.6, frozen scenario | 59.5 fps; 53 draws; 165,174 tris; CPU frame 6.899 ms |
| `wet_street.png` | 900×805, stormnight 0.8, frozen crop aspect | 59.5 fps; 53 draws; 162,906 tris |
| `day_smog.png` | 900×1066, daysmog 12.4, frozen crop aspect | 59.5 fps; 53 draws; 151,178 tris |
| `cockpit.png` | 900×900, stormnight 22, HUD enabled by scenario | 60 fps; 58 draws; 165,134 tris; portrait-like auxiliary framing |
| `heirframe-shot2.png` | 1280×720, `?shot=2&q=high&fresh&noui`, current Aurum | 60 fps; 261 draws; 668,412 tris; zero errors |
| `heirframe-shot3.png` | 1280×720, `?shot=3&q=high&fresh&noui`, current Aurum | 60 fps; 216 draws; 599,930 tris; zero errors |

Each has adjacent `.stats.json`, initial six-shot set has `_summary.json`; landscapes and Heirframe have richer runtime snapshots. Initial `--all --w=900` produced square null-aspect fog/canyon/hero frames; retained only as auxiliary evidence. Their landscape replacements above are the upgrade baseline and prevent subject clipping. Original `shots/*.json` unchanged. Largest capture is 0.959 Mpx, below requested 1.5 Mpx. Landscape custom script quiesced streaming before capture. Initial harness sampled after 45 frames, so its peak boot CPU values are not sustained-performance claims.

Replay initial set: `node tools/shot.mjs --all --w=900 --dpr=1 --outdir=shots/graphics-upgrade/before`. Replay landscapes + Heirframe: `node shots/graphics-upgrade/before/capture-review.mjs`; this private script imports the unchanged shared harness and requires the existing site server on port 8888 for Heirframe. It checks scenario existence/position, while initial harness checks the entire frozen definition. It navigates one Chrome serially, never opens two simultaneous harness sessions.

Recorded failures: first sandbox run could not bind localhost (`listen EPERM`), retry with authorized escalation succeeded. Private capture script first imported non-exported `checkFrozen`, failed before Chrome opened; corrected to local existence/position check, retry succeeded. No failed captures silently accepted. No active review browsers or servers remain (the pre-existing site8888 server is untouched).

## What Heirframe actually does well

In current plaza shot2, lit shop glazing shows ceiling/floor divisions and darker mullions; chrome lamp posts, gold rings, matte masonry and glossy floors have distinct responses. Ground reflections include recognizable *masses* and their positions, which anchor the fountain, stalls and rails. In shot3, foreground walkway/water preserve crisp material response while middle towers are cooler/lower contrast and far towers keep recognizable silhouettes. The scene reads as connected surfaces rather than emissive marks on isolated boxes.

Transfer the **relationships**: light changes a nearby receiving surface; glass differs from opaque cladding; highlights follow surface/view angle; dim windows have internal value structure; atmospheric contrast has distance hierarchy. Heirframe is much more expensive (roughly 4–5× Neonhaul draws and 4× triangles in these frames); copying its scene/planar render/shadows wholesale would disregard the original mobile constraints.

Inspected Heirframe technique evidence: `js/world/materials.js` contactAO, facadeGlass ceiling/floor/pane divisions and room metalness; `js/engine/atmosphere.js` per-channel extinction + directional in-scattering; `js/fx/reflection.js` reduced-resolution selected-layer planar reflection with roughness/Fresnel; `js/world/world.js` district lights, ground AO bake and environment; `js/engine/renderer.js` restrained grade, optimized bloom composition and highlight clamp. These inform recommendations, not implementation copy instructions.

## Ranked upgrade decisions

### 1. Restore facade material response and attach source spill to real host surfaces — first phase

**Observed:** foreground canyon and day-smog facades have bright rectangular panes and long pink strips but broad wall faces read as flat coloured slabs. Corner trims do not visibly affect their adjacent panels. Near windows have little directional recess/ceiling/sill hierarchy. Pane atlas halos are visible already; simply enlarging those halos would preserve the central problem.

**Concrete approach:** correct shell glazing/cladding dielectric-versus-metal response first. `shellMaterial` starts near-black `0x0a0c11` at metalness 0.88; `WINDOW_FRAG_BODY` raises glass bays to 0.94. For that dark albedo, metallic F0 is very low; use restrained dielectric/glass specular and rougher opaque cladding, retaining a dark base. Add inexpensive pane ceiling/floor split, directional recess/sill normal/light response and mullion occlusion tied to the existing 3.2×3.6 m grid. Fade detail with derivatives/distance so skyline does not shimmer.

For **signs and strips**, derive a bounded local receiving-wall field from their actual placement/host metadata (`signage.js` already carries `q.b`, face, normal, world position, extents/intensity). Use a small fixed number of host-local rectangles/strip bands per receiving face with distance falloff, normal-facing and plane bounds, selected deterministically from the existing placed sources. If direct instance attributes are awkward, a compact nearest-source list is acceptable only with tight range/face rejection. No unbounded source loop per fragment. Avoid whole-tower tints and unrelated random coloured washes. Never call this dynamic lighting: it is an analytic/source-bound light-spill approximation without cast shadows or general GI.

**Exact scope:** `js/materials.js` first; `js/signage.js` for actual source descriptor supply; `js/render_city.js` for host instance/face receiver attributes if required; manager-only wiring/debug hooks in `js/main.js`. `js/atlas.js` only if a texture channel genuinely improves pane response, not a rebake by default. Do not change `js/city.js` generator, RNG calls, chunks or collision.

**Risk:** shader ordering (normal must change before lighting), GLSL program cache keys, attribute slots/memory, metadata lifecycle during streaming/swap-removal and falsely lighting a back face/opposite building. Renderer/source metadata collection order must be stable without consuming seeded generation RNG. All new spill must disable with its source/isolation state and disappear when a chunk unloads. Manager verified r160 `Color(hex)`/`setHex` already convert to working-linear; extra `convertSRGBToLinear()` double-decodes some local uniforms. Correct touched uniforms with visual retuning, not a blanket palette sweep; existing gains partly compensate the mistake.

**Visual acceptance:** same frozen canyon/day frames show recognizable glossy glass vs rough dark panels; near lit panes read as openings with a ceiling/sill rather than identical filled squares; pink strip and a selected sign leave a local coloured falloff on their real host wall. Their source-off control removes that falloff, while distant/unrelated walls and unlit roofs remain dark. Distinct broad highlights should follow camera angle and flatten/disappear when environment/specular is disabled. No overall ambient lift, no source colour leakage through other masses, no renewed window/edge sparkle.

### 2. Put structured city features in craft/glass reflections — second phase

**Observed:** hero craft is visible and recognizably shaped but primarily broad cyan/red fill plus bright thin rim; no convincing distinct sign/window reflections describe its flank or canopy. Far environment is generic blocks. Current `sky.js` PMREM city-glow bake varies vertically only; every azimuth receives the same hue band. Existing `craft.js` city reflection exists and must be preserved/tested, not rediscovered or replaced by paint.

**Concrete approach:** add dark angular silhouette, narrow neon sign columns/window patches and asymmetric warm/cool clusters to the existing low-resolution procedural equirect bake. Use a separate deterministic hash or authored pattern keyed to district/variant; never consume city RNG. Keep black between sources. Reuse bake cache and disposal; do not PMREM per frame. Adjust existing `craft.js` clearcoat/procedural-city response only enough for broken highlights to describe bodywork and canopy, preserving very dark hull colours and the existing engine wash. The same environment can improve facade glazing in phase1.

**Exact scope:** `js/sky.js` `bakeEnv`/environment signature; `js/craft.js` existing BODY/GLASS city-reflection shader/uniforms if needed; manager-only `js/main.js` validation hooks. No geometry, CubeCamera, SSR, transmission or gameplay.

**Risk:** source pattern aliases at 64/128px LOW/HIGH; bake signature collisions/stale textures; changing PMREM changes all materials including cockpit/deck; stronger city gain can turn hulls into pale chrome/paint. Procedural environment features are plausible reflected city cues, not actual locally ray-traced objects. State that limitation honestly.

**Visual acceptance:** unchanged hero/canyon craft shows at least two broken reflected features of different width/hue on canopy/flank; highlights move/change with view orientation and environment control, while interior shadow stays near-black. Keep saturated colour attributable to neon/reflection and no bright body paint. Dusk/day remain restrained; all craft trims still vary independently. Null/off control must prove reflection contributes without merely removing emissive trim.

### 3. Establish dark-city haze temperature hierarchy — subsequent tuning only

**Observed:** fog_city lower half is broad blue-grey fill with weakly separated roofs, and canyon void is an almost uniform blue-grey well; day_smogginess is intentionally drained and should remain dark. Heirframe separates near/mid/far using extinction and temperature, not just global exposure.

**Scope if needed after phases1–2:** `js/materials.js` fog shader, `js/sky.js`/`js/config.js` shared tunables. Keep existing fog visibility/LOD gates, additive fog terminations and altitude gate; near source colour retained, middle cooled/desaturated selectively, distant smog modestly warmed by ambient district/sodium context. Do not repeat the historical global `HAZE.gamma` sweep: DECISIONS13 demonstrated it brightens the frame without curing depth.

**Acceptance:** in frozen fog/canyon, near roofs, middle lit towers and far silhouettes separate by both contrast and hue while night remains mostly black and far layer remains legible. Validate aerial view and LOW where shortened distances change the layer mix. Risk: fog changes can expose streaming/LOD seams and break photometric gates; therefore optional after seeing improved material response.

### 4. Give wet ground reflections structural context — defer bounded experiment

**Observed:** wet_street lower half contains isolated inverted sign glyphs/strips over near-black floor; it does not connect those reflections to the building/window masses above. Heirframe's full selected-layer planar result is convincingly connected, but costly.

**Future scope:** `js/reflect.js` and `js/materials.js`; perhaps `js/render_city.js` for capped nearby shared-shell reflection buffers. First prove a very small near-only emissive-window/structural bucket has useful visible coverage in wet_street with valid occlusion. Avoid full-scene planar rendering initially. Existing emit-only mirror may remain preferred if bounded experiment exceeds budget. Do not restore road paint or add unrelated street props.

**Acceptance:** recognizable reflected window/building patterns correspond spatially to their visible sources, roughness/water break them up and towers still occlude mirror correctly; dry/day and LOW remain cheap. Risk: mirrored shells multiply triangles and fill; current non-depth-writing deck and draw order are delicate. This is deliberately outside the first two phases.

## Verification required for selected phases

1. Re-capture the same frozen landscapes plus wet/day/cockpit at their recorded viewports; preserve scenario JSON/clock/seed and compare actual images. Manager added `tools/graphics_capture.mjs --phase=after [--lite/--portrait/--headed]` for repeatable captures with frozen metadata/quality/error validation and per-shot dimension reset; prefer it for implementation comparisons. Add 390px portrait and 844×390 landscape HIGH/LOW smoke for cockpit readability and shader correctness. The square cockpit baseline is auxiliary, so add a true landscape cockpit capture before its comparisons if cockpit changes become visible.
2. `node tools/determinism.mjs`: unchanged golden `f29beaf9`, 25,039 buildings. Fixed test autopilot remains 120 seconds; no changes to navigation/gameplay fixtures.
3. Phase1: `gates_p1a` (shader/fog/day guards), `gates_p3a` (if source descriptor placement touched), `gates_p11` HIGH and LOW (P4 reversibility, P5 contribution, variety/count/console budgets), `gates_p2` if host render attributes/LOD plumbing changed. Existing P11 P5 measures frame contribution, **not actual source-to-host correctness**; add one focused positive/off/null/facing locality probe for the new spill. Manager owns shared harness/gates and verifies source-off setup really applied.
4. Phase2: `gates_p5` HIGH/LOW (environment detach controls), `gates_s2c` HIGH/LOW (dark-hull C2, city reflection C1, canopy C3, five vehicle draws), plus `gates_p1a` and `gates_p3b` if sky/fog/reflection output changes. Both suites must still assert the same signal rather than relaxing thresholds to accept bright hulls.
5. Integrated: `budget.mjs --headed` HIGH/LOW and short fixed-autopilot console/asset smoke; sequential Chrome sessions. Current snapshots leave little draw headroom under 65 HIGH, so prefer zero additional per-object draws. CPU frame timing is submission time; it does not prove GPU fill cost. Use real headed frame pacing for changed per-pixel work and acknowledge physical iPhone/Android remains untested.
6. Each visual mechanism requires a positive effect, an off control, and a null repeat at a frozen/quiesced state. A source-off arm must operate on the actual selected visible source/receiver region, not an empty average. Preserve source animation/flicker state when doing differences. Any exactly-zero differences need fixture inspection. Read both existing result schemas (`results` and `ok`/`fail`).

Do not open a new expensive blind scoring loop during implementation. This review is an informed visual assessment, not a blind score; historical ±1.5 scoring noise is why concrete before/after difference lists and falsifiable mechanism checks lead the acceptance. If manager later elects AAA scoring, follow DECISIONS12 separate fresh critics and fixed plates without model overrides.

## Resume record

Review complete. Evidence and replay script are durable in ignored before/. No runtime edits made. All capture sessions closed. Manager selected recommendations1 and2 for sequential fresh builders; recommendation4 deferred. No blocking failure remains. Memory registry lookup found no Neonhaul/Heirframe entries and contributed no memory facts.
