# G1 facade response and source-bound illumination

Status: active builder `/root/facade_upgrade`, 2026-10-01. No commits/pushes. Runtime files owned: js/materials.js, js/render_city.js, js/signage.js; optional narrow main.js hooks and tools/gates_graphics.mjs. Preserve city RNG/autopilot/save/controls and unrelated work.

Assignment: restore dark dielectric glass reflection, distinguish rough cladding, add restrained AA pane depth, and attach bounded analytic sign/strip spill to actual host faces. No new lights/draws/geometry or global ambient lift. Preserve P11/isolation semantics.

Checkpoint 1: read workspace/site instructions and project graphics review/original goals/state plus relevant P11/material/isolation background. Inspecting allocation and actual source descriptors before selecting data layout. Baseline belongs to manager under shots/graphics-upgrade/baseline. Manager currently owns browser for immutable baseline budget; do not launch Chrome until manager confirms closed.

Checks completed: none yet. Required: focused on/off/null/facing/locality validation; p1a, p11 HIGH/LOW, determinism; p3a if descriptor placement touched; p2 if instance/lifecycle touched; matched G1 HIGH/LOW/portrait captures. Actual costs and failures will be recorded here.

Next action: inspect Field lifecycle, choose bounded source layout without exceeding mobile vertex attribute slots; implement then ask manager browser lock status.

Checkpoint 2: initial implementation is written, all five changed runtime modules pass `node --check`. Added js/facade_sources.js: four bounded records per host (two sign, two strip), 16x2048 float nearest DataTexture (~512 KiB) plus one instance receiver handle. Total shell vertex attribute slots target 16, including matrix. Rows are independently stable, copied with all Field attrs, cleared on signage reroll and released on deferred LOD0 removal. All placement RNG calls preserved. Source descriptors register only after successful field allocation and include host box/facing/plane/bounds and same R0 ramp. Sign/strip isolation now removes corresponding supporting illumination; old P11 master remains authoritative. Animated posters/heroes and round-facet spill skipped because average live image colour/facet bounds cannot honestly be derived from static descriptors. No new geometry/lights/draws.

Material change: keep base0x0a0c11; glass metallic0.94 ->0.03 and cladding0.58 ->0.24 while glass stays glossy/cladding rough. Pane ceiling/recess/sill terms fade with derivatives. Local spill tint uses r160 setHex directly (no double decode), no global palette/ambient alteration. New __game.setFacade(material,spill) and facadeSources() hooks.

Manager baseline browsers closed; builder now owns serial Chrome/GPU. Next: real boot and matched captures, tune visibly, then mechanism controls/gates. No browser check has yet passed.

Checkpoint 3: first real Chrome boot caught duplicate iChunk from patch ordering. Fixed with a shared declaration guard on BOTH window and standalone fade patches; no gate bound relaxed. Retest canyon/day captures error-free at53draws. Opened actual before/after images: supporting sign glow is visible, daytime cornice shading improves; the material change itself remains restrained with today's low-detail environment (G2 will provide structured reflections).

Focused `node tools/gates_graphics.mjs`: **8/8 HIGH pass** on final RGB/time code. Actual cyan sign receiver max RGB delta0.28844; strip receiver0.41104; frozen null/restored deltas0. Source-off residual0.00016; reversed-source-normal0.00032; outside-range0.00016 (all below0.001 bound and far smaller than positive). After streaming to[1800,160,900],629LOD0instances/629source rows,0wrong host matrix handles,0nonzeroLOD1handles. Source payload524288bytes;16vertex slots;0overflow;0shader errors. Test screenshots/report: shots/graphics-upgrade/g1-controls/receiver.png and gates.json.

Review correction: spill now copies the actual emitted Field RGB (shipped signage conversion retained) rather than using a differently decoded palette. Strip oscillation and sign flicker/pulse match seed/time descriptors; source kind+seed are packed in the source record. No broad colour conversion fix. Animated hero/poster illumination and round facets remain deliberately absent. Maximum16nearest texture fetches per receiving fragment, usually fewer after plane/facing rejection; fill cost still needs frame-pacing evidence and is not established by CPUbudget.

Next: final HIGH/LOW/portrait captures, p1a/p2/p3a/p11both/determinism, and headed spill on/off frame pacing.

Regression checkpoint: p1a10/10HIGH and p2 8/8HIGH pass. p2 actual steady fly: worstgen1.1ms, worstCPUframe9.4ms, mean2.44ms, unit peaks[0.2,0.2,0.2,0.3,1.1]ms,0errors; dither residue7.2% of positivecontrol. No budget bound changed. Source payload512KiB confirmed. p3a currently running; p11both and final captures pending. Tiny final material correction preserves full glossy response of dark glazing bays (avoid roughening unlit glass); receiver varying explicitly highp for stable texture row addressing. This tuning requires final real Chrome checks/captures but does not alter instance/lifecycle mechanism.

Regression checkpoint 4: p3a **15/15HIGH** pass on actual current harness (historical guide says13); sign/strip golden placement hashes unchanged after3kmroundtrip and coldreload,3265placementsaudited0floating/setback/buried violations; R0ramp positive0.85077, smoothworst0.20300 vshard0.77145. p11 **8/8HIGH** pass: null0, P11on/off frame delta9.3766channel and restores0;53draws/167.1ktris,0errors. Determinism **9/9** pass: unchangedf29beaf9/25039buildings. LOWp11 currently running. No existing harness edited.

Regression checkpoint 5: p11 **8/8LOW** pass (39draws/45.6ktris,0errors). Focused controls **8/8LOW** pass: actual amber sign patch maxRGBdelta0.08292, strip0.29596; null/restored0, source-off0, reversed-facing0, beyond-range0. Large streaming move251LOD0/251rows,0wronghosthandles,LOD1zero,0overflow/shadererrors. Existing graph HIGH controls already passed8/8 with nonzero positives; LOW is final runtime code. Final HIGHsix-scene capture in progress; LOW/portrait and headedpacing next. All required regression checks now completed and green. Full headed budget is left to manager acceptance; no physical-phone/Safari or isolatedGPUtiming claim.

## Final G1 handoff — ready for manager acceptance

Status: implementation and assigned verification complete. All builder Chrome sessions CLOSED; browser/GPU lock returned to manager. Stop after G1. No commits/pushes, no unrelated edits, no sky/craft changes, no existing gate/harness changes.

Files changed: js/materials.js, js/render_city.js, js/signage.js; new js/facade_sources.js; narrow js/main.js hooks; new tools/gates_graphics.mjs; this notes file. Syntax and whitespace checks pass.

Hooks/API:
- `__game.setFacade(material, spill)` returns previous `{material,spill}`; null argument keeps that axis. Default(1,1); material0 restores previous bay roughness/metalness and disables pane depth; spill0 disables actual-source illumination. Both remain under P11 master.
- `__game.facadeSources()` returns copies of bounded selected emitted descriptors with row/index, actual emitted RGB, normal, box bounds, extents, seed, kind, range and host data.
- `Signage.setVisible`/existing `__game.setSignVisible` now also disable supporting spill for corresponding sign/strip family. Actual source shader R0 ramp and seed/time modulation are reproduced. Existing window halos/wash remain independent.
- `CityRenderer.facadeSources` owns the stable row allocator/texture. One additional `iReceiver` attr is copied by Field swap-removal; LOD1 is zero; row data clears on signage release/rebuild and is reclaimed on deferred LOD0 release. No city seed/RNG/placement change.

Final evidence: `shots/graphics-upgrade/g1/` contains all six scenes in HIGH, LOW (`-low`), and390x844HIGHportrait (`-portrait`) with adjacent stats and summaries. Opened actual hero/canyon/day, LOWcanyon, portraitcanyon/cockpit. Local board/sign support and cornice receiving-wall glow improve source/surface coherence; base remains dark. Glass reflection response is physically stronger but subtle with the existing vertical-only sky environment; G2's angular environment is the next useful step. Pane detail is derivative-faded and restrained.

Important comparison limitation: these initialG1shots froze after quiescing, so vehicle promotion/particle clock can differ slightly from the baseline warmup. No geometry was added; observed traffic triangle differences are not a geometry increase. Manager will regenerate immutablebaseline/G1 with its improved capture runner pinning vehicle time0.5. Keep initial images as auxiliary evidence, use regenerated images for strict comparisons.

Actual costs: **0newdraws/0newtriangles**, four capped source records per host, max16nearest texture reads per receiving fragment (fewer after early rejection),512KiBFloat32texture, onefloatper shellinstance, final vertex attributes16. HIGHsixshots53–58draws/152,190–167,204tris; LOW38–44draws/53,237–59,393tris. Cap2048rows; measured0overflow, typical531–629HIGH/180–251LOWlive rows.

Headed actual-display pacing: `node tools/gates_graphics.mjs --pacing`, report `shots/graphics-upgrade/g1-controls/pacing.json`. Frozen canyon, ABBAspillOFF/ON/ON/OFF,180frames per arm.390x844DPR2 and1920x1080DPR1, HIGH, ANGLEMetalMac. Measured maxAttributes16. Every arm median16.7ms, means16.658–16.677ms, p95 18.4–18.6ms; **0frames>20ms or>30ms** in all8arms. Same53draws/165,988tris per arm. This supports60Hzpacing on this Mac at those pixel counts; vsync hides sub-budget shader cost. It is not isolatedGPUtiming or physical-phone/Safari evidence.

Completed checks:
- p1a10/10HIGH (shader/fog/atlas/grade)
- p2 8/8HIGH (LOD/lifecycle/budget; worstgen1.1ms, worstCPUframe9.4ms, mean2.44ms;0errors; dither7.2%ofcontrol)
- p3a15/15HIGH (unchanged actual sign/strip placement hashes, geometry/normal/falsification/ramp)
- p11 8/8HIGH +8/8LOW (P11/null/off/restore/oldspillcontrols)
- determinism9/9 (goldenf29beaf9,25039buildings)
- newfocused8/8HIGH +8/8LOW (positive signs/strips, null/restore, sourceoff, reversednormal, beyondrange, swap-removalownership, storage/errors)
- all18captures error-free; headed pacing complete; JSsyntax and diffwhitespace checks pass.

Failure history: first capture failed shadercompile on duplicateiChunk caused by patch-order declaration. Corrected using shared guard while preserving standalonepatchFade declarations; all later captures/gates0shadererrors. No failed result treated as pass, no bounds relaxed.

Deliberate limitations/unrun: static analytic spill approximates local receiving-wall illumination only; no cast shadows/GI/neighbor-lighting, animatedhero/postercolours and roundfacetreceivers omitted, at most2signs+2strips selected per host. Existing sign segment failure is approximated at mean brightness while whole-sign flicker/pulse and strip oscillation synchronize. Full headedbudget and combined boot/craft/cockpit suites belong to manager/G2acceptance; physicalphone/Safari and isolatedGPUtiming unrun. No work remains assigned to this builder.
