# Neonhaul graphics upgrade — manager checkpoint

Started 2026-10-01 (Australia/Brisbane). User asked the manager to commission reviews against the original Neonhaul goals and current Heirframe visuals, select the useful upgrades, delegate implementation, and preserve progress across possible five-hour usage limits.

## Current checkpoint

- Stage: COMPLETE — manager accepted both selected upgrades after independent final review and checks.
- Active agent: none. Both builders and the final reviewer complete; all managed Chrome sessions closed.
- Completed builders: `/root/facade_upgrade` and `/root/reflection_upgrade`; handoffs in GRAPHICS_G1_NOTES.md and GRAPHICS_G2_NOTES.md.
- Completed agent: `/root/visual_review`; report in GRAPHICS_REVIEW.md, all browsers closed.
- Runtime edits: G1 + G2 accepted locally. Read GRAPHICS_G1_NOTES.md, GRAPHICS_G2_NOTES.md and GRAPHICS_FINAL_REVIEW.md; checkpoints/g1, checkpoints/g2 and checkpoints/final preserve source/evidence snapshots.
- Validation: all targeted builder and independent manager checks green. All18 original/final frozen pairs match metadata, draws/tris and quality exactly,0errors. HIGH/LOW headed budgets, DPR2 quality rebuilds, comparisonUI36pairs, boot12/12 and unchanged determinism pass. Final image reviewer ACCEPT; see latest log for evidence and practical limits.
- Release: user explicitly authorized commit and push on 2026-10-01. Stage only this Neonhaul upgrade. Publication and public-browser evidence are recorded in local `shots/graphics-upgrade/release.json`.

## Working rules

- Run one sub-agent at a time to conserve usage; no recursive delegation. Manager owns integration and acceptance.
- Preserve all unrelated changes, including active Heirframe gameplay work, Tinpot, games/, and lib/auth. Neonhaul was clean at the start.
- Read CLAUDE.md, MANAGER_STATE.md, DECISIONS.md, MANAGER_BRIEF.md and ART_PASS.md; read BUILD_PLAN by relevant sections only.
- Use existing deterministic shots and real Chrome/CDP. Keep before/after image evidence, quality settings and draw/triangle counts. CPU submission timing is not GPU timing or physical-phone evidence.
- Preserve the relaxed courier game, no world characters, mostly dark neon city, daytime smog, high-altitude vista, mobile controls, save compatibility, city seed stream, and immutable 120-second test autopilot.
- Do not restore the removed painted road grid; obsidian ground and intelligent traffic are settled decisions.
- Agents own assigned files only and maintain a notes file before editing and after each meaningful step. They do not commit, push, touch unrelated work, or spawn agents.

## Resume checklist

1. Read this file, then the referenced review/agent notes and the newest graphics-upgrade entry in MANAGER_STATE.md.
2. Check `git status --short` and agent liveness. An agent report is not proof of completion.
3. Audit partial edits for syntax/import errors and boot before resuming work. Reuse the living agent or relaunch with the precise unfinished scope.
4. Continue the current phase, validate it, record outcome here, then launch the next single agent.
5. If usage interrupts, leave the current assignment, owned files, actual checks completed, open failures, and exact next action here. Do not mark unfinished tasks complete.

## Decisions and phase queue

1. Review original goals, existing criticisms, baseline Neonhaul renders and current Heirframe techniques.
2. Manager chooses limited, high-value implementation phases with separate file ownership.
3. Delegate phases serially; independently review and validate each.
4. Final browser/performance/regression verification and concise handoff with local preview and artifacts.

### Selected scope (manager, after preliminary review and direct image inspection)

**G1 — facade response and source-bound illumination.** Preserve building shapes/seed, improve dielectric glazing reflectance, pane recess/ceiling/sill shading, and localized illumination on the wall a sign/strip belongs to. Reject raising global ambient or adding a light per sign. Agent owns materials.js, render_city.js, signage.js and a small optional new helper; main.js changes only a narrow visual control/wiring if necessary. All additional instance payload must survive Field swap-removal and streaming. Capture isolated disabled/enabled controls.

**G2 — angular city environment and dark craft reflections.** Enrich the existing infrequent sky PMREM bake with restrained angular city-light structure, then tune hull/canopy reflection response without repainting vehicles cyan/red. No real-time CubeCamera, SSR, new world lights, or geometry/craft proportions. Agent owns sky.js and craft.js, and narrow main.js visual hooks if necessary. Read G1 notes; preserve environment invalidation/restoration and update cadence.

**Deferred:** structural planar ground reflections, skyline geometry/roof clutter, fog/LOD distance changes, new characters, and gameplay additions. Heirframe's large actual-object reflection pass is substantially more expensive; copying it is not justified by current evidence. No scored AAA round planned; qualitative comparisons avoid claiming movement in historically noisy numeric critic scores.

### Acceptance

- Visible improvement in matched night/canyon/craft/day-smog shots; dark setting remains, no diffuse neon paint, no moire or seams in motion.
- Real Chrome high and low boot without warnings, errors or failed assets; portrait and landscape controls stay usable.
- Existing relevant shader/fog/city/traffic/craft/cockpit/boot suites, determinism, and headed steady-state budget must pass. Preserve all bounds and report any existing baseline failure separately.
- New mechanism needs an asserted on/off control that changes pixels and a restored/null control, on a frozen clock. Do not accept zero-effect claims.
- Match scene, dimensions, quality, DPR and clock in before/after evidence; new tools/graphics_capture.mjs enforces shot metadata and resets each viewport.
- Report draw/triangle changes and CPU/GPU measurement limits honestly; real-phone/Safari performance remains unverified locally.

## Evidence / log

- 2026-10-01: inspected workspace guides and working tree. Existing visual reviews consistently flag insufficient light spill and material grounding; fresh comparison still required before choosing upgrades. No relevant Neonhaul/Heirframe entries in Codex MEMORY.md; project docs are the primary record.
- Recovered exact original prompt from local user history, saved in GRAPHICS_ORIGINAL_GOALS.md. The prompt confirms single-agent management for usage conservation and gives visual priority to reflections, dark glass/metal, very tall city, inexpensive tricks, sleek craft, cockpit, and docking presentation.
- Reviewer preliminary findings (not yet final selection): window halos already exist; strips/signs lack supporting light on nearby walls, broad facade panels look flat, craft reflections mostly uniform cyan/red fill, wet-street inverted glyphs have too little reflection support. Current Heirframe captures still being obtained. Manager independently inspected baseline fog/craft/wet-street and found the same broad deficiencies.
- Reviewer obtained Heirframe Aurum Plaza/lake views; manager independently viewed both. Transferable strengths are material contrast, recessed warm glazing, source/surface coherence and structured reflections, rather than its bright palette or crowds.
- Manager verified vendored Three r160 automatically decodes Color(hex)/setHex to linear: subsequent convertSRGBToLinear double-decodes several lighting colours. Do not blanket-fix palettes; any correction must be bounded and retuned locally. Shell glazing at metalness 0.94 on near-black albedo has normal-incidence reflectance only 0.0053–0.0077; a dielectric coating can restore reflection without brightening the base.
- Manager captured all six definitive matched HIGH baselines with graphics_capture.mjs into shots/graphics-upgrade/baseline/; metadata/errors/frozen scenario assertions passed. Added tools/graphics_compare.html for a touch-friendly slider comparison once after captures exist.
- Immutable original HEAD baseline extracted to `/private/tmp/neonhaul-graphics-baseline-20261001/gms/3d/neonhaul`. Headed HIGH budget: six shots pass (53–58 draws, 152–167k tris, CPU mean1.78–2.63ms), autopilot had one original-code 12.3ms worst spike vs12ms gate. This is a baseline failure, not yet attributed to new graphics; targeted recheck pending. LOW budget running. Builder was asked to avoid GPU tests until manager's baseline browser checks close.
- Baseline update: LOW six shots + flight passed; targeted original HIGH flight recheck passed (worst8.1ms). Kept the initial12.3ms failure in the record rather than discarding it. Baseline LOW and390×844 portrait captures now alongside definitive HIGH captures; budgets saved under shots/graphics-upgrade/baseline-budget/. Manager released browser slot to G1 builder.
- G1 initial implementation: dielectric/pane shading and new facade_sources.js (four actual-source records per building: two signs/two strips;512KiB float texture; one receiver attribute,16 guaranteed vertex slots). No new geometry/draws/lights. First shader experiment failed due iChunk duplicate declaration; builder added shared declaration guards and captured canyon/day without errors. Static manager review flagged matching actual emitted colour/strip flicker, standalone patchFade declarations, and instance comments. Focused controls and regression validation are in progress; not accepted yet.
- Live config draw gate is90 (historical plans say65); preserve existing live90 bound. This upgrade still targets staying below65 by adding zero draw calls.
- G1 focused actual-source controls: builder reports8/8HIGH, sign patch maxRGB delta0.28844, strip0.41104; null/restored0, source-off0.00016, reversednormal0.00032, beyondrange0.00016. Streaming moved629LOD0instances with629rows and0wrong handles;LOD1receiver handles allzero;16attributes,512KiBtexture,0overflow/errors. Manager read gate implementation and independently viewed canyon before/after; local support is visibly improved and dark setting remains. Required regressions, LOW controls, final captures and headed frame pacing pending.
- G1 regression checkpoint: p1a10/10, p2 8/8, p3a15/15, p11 8/8 HIGH and determinism9/9 reported green. Existing sign/strip placement hashes held across a3km roundtrip/cold reload;3,265placements checked with0placement violations; P11 on/off frame difference9.3766channel/restored0. No gate thresholds or existing harness changed. LOW, final captures and frame pacing still pending. Future G2 builder should use a fresh minimal context with explicit file ownership and these checkpoint paths to conserve usage.
- G1 builder complete: LOW focused8/8 and p11 8/8, all18HIGH/LOW/portrait captures done. Headed on/off ABBA pacing:390×844DPR2 and1920×1080DPR1,180frames per arm,8arms; median16.7ms, mean16.658–16.677ms,0frames>20ms. Real renderer reports MAX_VERTEX_ATTRIBS16; same53draws/165,988tris across arms. This is Mac pacing, not GPUtimer or phone evidence.
- Manager found screenshot traffic clock varied with boot duration; graphics_capture.mjs now pins stepVehicles(0.5) and asserts it. Original captures preserved at shots/graphics-upgrade/auxiliary/pre-vehicle-pin/. G1 source snapshot and tracked patch saved under shots/graphics-upgrade/checkpoints/g1/. Manager independently running HIGHfocused controls and regenerating all18G1captures before G2 can edit runtime. Original baseline will be recaptured with same pinned tool from immutable HEAD archive.

- Manager acceptance: independent HIGHfocused8/8 (actual sign delta0.28612, strip0.40256; null/restore0, source-off/facing/locality residuals<0.001;629instances/rows,0badhandles,16attributes). All18 G1 and immutable original HEAD baseline captures regenerated with pinned traffic0.5; all scenario/quality/error assertions passed and draw/tri counts match exactly. Old unpinned evidence preserved. G2 assigned fresh-context sole reflection_upgrade agent; first two capacity errors caused no edits, third retry running. Browser released.

- G2 in implementation: sparse baked angular structures plus restrained canopy response drafted. Manager early hero inspection found insufficient visible structure, returned feedback before acceptance. First focused controls preserve PMREM reuse/signature skips and context-restored reflection pixels, but restored/null fixture and isolated craft control currently fail; these are unfinished checks, not accepted evidence. Builder owns correction and validation. Manager prepared ignored compare-smoke.mjs for all36 before/after image pairs and mobile slider/layout smoke after final captures exist.

- G2 focused HIGH retest reports8/8 after fixing translucent canvas colour accumulation with clear-before-repaint. Frozen null/restored and context-restored pixel deltas now0; actual hero env contribution0.0913, isolatedcraft0.0268, hidden-subject0. Existing PMREM target reused, quant15 glow tuple, no draw/tri increase/errors. Authoring sparse upward-reflected tower windows to address manager's subtlehero feedback; visual/regression acceptance still pending.

- G2 complete: p5HIGH/LOW18/18each, s2cHIGH/LOW17/17each, p1a10/10, p3b12/12, focusedHIGH/LOW8/8each and determinism9/9 (117checks). Focused null/restored/hidden/contextrestore all0. Fixed translucentcanvas accumulation and actual Game.sky instance's contextrestore force flag; manager corrected an initial wrapper assumption after direct339source read. All18final images independently matched original metadata, quality, draws/tris,0errors. Builders closed Chrome and saved G2 source/report snapshot. Final image-only reviewer launched fresh context; manager comparisonUI36pairs +320/390/844px layouts/slider/console pass. Headed HIGH/LOWbudgets currently running (session1259); boot and quality/recovery acceptance remain.

- Final independent manager checks complete: headed HIGH and LOW budgets each all6shots +30s of fixed120s autopilot pass all unchangedbounds. HIGHsceneCPUmean1.92–2.78ms, flight2.87mean/7.2worst; LOWscene1.44–2.27ms, flight2.42mean/9.5worst. These are CPUsubmission on Mac, not GPU/phoneproof. Actualflight maxdraws59HIGH/45LOW, underlive90 andtarget65. All18frozen original/finalpairs independentlymetadata/count/errorverified. ComparisonUI36pairs, 320/390/844px layouts/slider/console pass. DPR2portrait390x844 andlandscape844x390 LOW/HIGH rebuilds pass realframes/sourcepopulation/nooverflow/noerrors; manager inspected bothcockpitscreens. Existingboot12/12green: coldlocal-only/CDNblocked boot, watchdognegativecontrols, unassistedcontextrestore/hiddennegativecontrol, realtouchsettings, savedprofileload/negativecontrol. AllmanagerChrome sessions CLOSED(session4116exit0). No further browsercheck required unless finalreview identifies a concreteissue. Pendingonly image-reviewhandback, finalsource/evidencecheckpoint andcompletionhandoff.

- COMPLETE manager acceptance: final independent reviewer opened all6HIGH pairs, LOW canyon/hero,4portraitpairs,Heirframe2/3 and controls; accepts useful host-wall illumination and modest broken craft highlights, no new visual blocker. Glazing/window depth remains subtle; wet deck gains procedural environment bands, not matching local object masses. Manager concurs; no extra ground/haze/geometry phase justified in this pass. Preserve original darkcity, mobile budgets and gameplay. No outstanding authorized local work. Physicalphone/Safari and isolatedGPUtiming remain unverified; snapshots do not prove absence of all temporal artifacts. No commit/push/deploy performed.

## Final handoff

- Game: http://localhost:8888/gms/3d/neonhaul/
- Before/after slider: http://localhost:8888/gms/3d/neonhaul/tools/graphics_compare.html (all36 imagepairs checked).
- Review: GRAPHICS_FINAL_REVIEW.md; implementation: GRAPHICS_G1_NOTES.md and GRAPHICS_G2_NOTES.md.
- Evidence: shots/graphics-upgrade/{baseline,g1,after,g1-controls,g2-controls}, final-budget-high.json/final-budget-low.json, capture-acceptance.json, compare-smoke.json, quality-smoke.json, manager-acceptance.json.
- Final source/docs/tools and selected report snapshots: shots/graphics-upgrade/checkpoints/final/. Sources also remain ordinary working-tree changes. Screenshots/reports are ignored local artifacts; keep them for comparison/resume.
- If resumed after a limit: this selected pass is complete; do not restart builders or rerun every green suite. Read review/notes and inspect actual working tree before any newly requested scope. The later user instruction authorized commit and push; consult release.json for publication status.

- Release requested 2026-10-01: accepted runtime/tools match final checkpoint SHA256 hashes; fetched origin and confirmed main equals origin/main. Only Neonhaul runtime/docs/tools will be committed; unrelated Heirframe/Tinpot/games/auth changes remain unstaged. Screenshots/comparison evidence remain local ignored artifacts. Public game target: https://yru.br8t.com/gms/3d/neonhaul/. Deployment progress and actual public verification are recorded in shots/graphics-upgrade/release.json.
