# G2 — angular environment and dark craft reflections

Status: implementation and assigned validation complete 2026-10-01; ready for manager acceptance. Builder `/root/reflection_upgrade`; all builder Chrome sessions CLOSED. No commits/pushes or recursive delegation.

Scope: existing infrequent PMREM environment gains restrained angular city-light structure; tune hull/canopy response while retaining near-black craft, geometry/winding/S2-M rim and gameplay. Owned runtime files: sky.js, craft.js, narrow visual hooks in main.js only. G1 materials.js/render_city.js/signage.js/facade_sources.js are off limits.

Checkpoint: first runtime candidate implemented in sky.js/craft.js with narrow main hooks. Cached angular environment uses fixed separate hash, sparse uneven rows/sign columns with dark gaps, existing canvas size and PMREM target; collision-free glow tuple retains quant15. Procedural craft rows/sign bounds sharpen without increasing glow; canopy gain3.4->2.2 and dielectric response. No G1 file touched. Syntax/whitespace pass. First 3 frozen HIGH captures hero/canyon/day have exact G1 draw/tris and no errors but manager sees authoredhero improvement too subtle, so visual work remains open.

First focused HIGH attempt: 6/8 pass. PMREM contribution hero maxRGB0.0688/isolatedcraft0.0179; null unchanged-signature skip and stabletexture pass, hiddencraftnull0; context restore rebaked and recovered within0.0007. **Open failures:** restoredhero residual0.0063 and isolatedcraft0.0055. Found translucent lowercanvas gradient was blended over previousbake; clear before each repaint now applied and awaiting retest. Neither failure treated as pass. Browser from firstfocused attempt closed. Continuing visibly broken reflectedfeatures on authoredhero, then focused/regression suites.

Next: implement bounded environment structure without new draws/tris/world lights; assert enabled/off/null/restored pixels on frozen clock; run p5/s2c HIGH+LOW, p1a/p3b, then all 18 pinned captures. Preserve all bounds and distinguish CPU submission and Mac pacing from GPU/phone evidence.

Checkpoint2: focused HIGH8/8 after clear-beforepaint: heroenvdelta0.0913, isolatedcraft0.0268, null/restored/hidden/contextrestored all0. Targettexture stable; unchanged-signatureskip; contextrestore bakes11->12. Late final shader adds sparse unequal-height upwardtowerwindow response so canopy/crown above horizon can reflect structuredcity (no intensityincrease). Updated authoredhero/canyon at g2/; topcanopy now shows muted brokenangular highlights, enginewash/trim untouched. Existing HIGHp5 running serially; LOWfocused and regressions/final18captures remain.

Checkpoint3: final HIGHp5 **18/18**, HIGHs2c **17/17** pass; no bounds changed. p5 envdetach worstlum0.0055, winding0bad, rim1.9%flood; s2c proceduralcitydelta0.0105/hidden0,10of96cells change, canopyalpha0.0075, vehiclelayer5draws. Existing harness accumulated worstCPUframe114.6ms(p5)/112.3ms(s2c); these full-lifetime figures include setup/forcedbakes and are not steady-state timings or isolated attribution. Suites only bound vehiclewrite/mean and still pass. Manager will measure steady-state headed budget independently; do not report these as GPUtimings. Manager viewed latest authoredhero/isolatedcaptures and confirmed brokenmutedpatch direction. LOWs2c now running; no further style/geometry/fog work intended.

Checkpoint4: LOWp5 **18/18**, LOWs2c **17/17** pass. LOWcitydelta0.015/hidden0,10of96cells, canopyalpha0.0099; envdetach0.0056,0badwinding/rim1.9%flood. Finalcomment/API cleanup done; canopy enables derivative extension for WebGL1 fallback. HIGHp1a running. All craft gates remain unchanged. Contextrestore line explicitly passestrue because Game.sky is actual Sky instance (main339), distinct from window.__game.bakeEnv wrapper(main4109); cachedmethod otherwise returnsfalse. Manager clarification sent with exact source evidence.

Checkpoint5: HIGHp1a **10/10**, HIGHp3b **12/12** pass (sky/day/fog/ACES/weather/mirror/aerial); no gate edits/bounds changed. Manager confirmed actual Game.sky instance and accepted explicitforcedcontextrebake. FinalfocusedHIGH **8/8**: herodelta0.0910, isolatedcraft0.0265; null/restored/hidden/contextrestore0; same53draws/165146tris enabled/off; targettexturestable, unchangedkeyskips;0errors/logs. FinalLOWfocused running, followed by all18capturecollection using --phase=after. Durable assigned work remaining: LOWfocused then captures/syntax/countcomparison and CLOSEDbrowserhandback; manager owns budget/boot/quality/UI acceptance.

Checkpoint6: finalfocusedLOW **8/8**. Herodelta0.0720, isolatedcraft0.0316; null/restored/hidden/contextrestore0; unchangedsignature skips; texture reused;39draws/59389tris enabled/off;0errors/logs. Final HIGHsixcaptures complete in shots/graphics-upgrade/after/, metadata/quality/error checks pass. LOWsix running, then390x844HIGHportraits. FinalJSsyntax and diffwhitespace pass. No runtime changes since finalfocused validation.

## Final handoff

Changed: **js/sky.js, js/craft.js**; narrow **js/main.js** visual hooks and explicit force=true contextrestore; new **tools/gates_graphics_env.mjs** and this notes file. G1-owned runtime files and every existing gate/harness untouched. No craftgeometry/proportions/winding/rim/style, lights, fog/LOD, controls, gameplay, cityseed or palette changes.

- Environment: existing512x256HIGH/256x128LOW canvas and cachedPMREMtarget gain24asymmetricdarktowersectors, uneven warm/coolwindowrows and sparsesigncolumns. Fixed separatehash; no cityRNG. Signature is collision-freetuple retaining existing sky and glowquantization (15); existing0.25scheck remains. Uses existingtextures/targets/disposal.
- Craft: existing proceduralcityshader gains finite signbounds, uneven towerheights and derivative-softened brokenrows plus sparse upwardtowerreflections for crown/canopy. Bodymaterial/gain/tints unchanged. Canopy changes metalness1->0.12, roughness.05->.07, envintensity1.35->.85, proceduralgain3.4->2.2/headonfloor.30->.12; accepts real structured dielectricreflection with less neonfill. Enginewash/trim intact.
- Lifecycle defects corrected: clearcanvas before repaint (translucent lowergradient previously accumulated previousbakes); actualGame.sky.bakeEnv(true) aftercontextrestore (actual Skyinstance otherwise cached-keyskips). Finalexactpixels confirm recovery. No blanketlinear/sRGBpalette correction; newcanvaslights use r160Colorlinear->sRGBstyle once.
- Hooks: `setEnvStructure(amount)` bounded0..1, nullkeep, returnswas/now/bakes; `envBake(force=false)` exposescachetest; `envState()` returnsstructure/bakes/signature/textureuuid/canvassize. Existing `bakeEnv` remainsalwaysforced.

All assigned checks green, real headedChrome serially:

- p5 **18/18HIGH +18/18LOW**; s2c **17/17HIGH +17/17LOW**.
- p1a **10/10HIGH**; p3b **12/12HIGH**.
- focusedenvironment **8/8HIGH +8/8LOW**: heroRGBdelta.0910/.0720; isolatedcraft.0265/.0316; null/restored/hidden/contextrestore all0; samePMREMtextureuuid; unchangedsignatureskip; exactenabled/offdraws/tris;0errors/logs.
- determinism **9/9**, golden **f29beaf9**, **25,039buildings**.
- JSsyntax and diffwhitespace pass; resultfiles inspected with both `ok/fail` and `results` schemas.

Final **18** screenshots in **shots/graphics-upgrade/after/** (sixHIGH, sixLOW, six390x844HIGHportrait), adjacentstats and3summaryfiles. Allspec/quality/dimensions/seed/camera/clock assertions pass and trafficpinned0.5; everycapture0errors/logs. **ALL18draw/trianglecounts EXACTLYmatch both G1 and immutableoriginalbaseline**: no newdraws/tris. HIGH53–58draws/152190–167204tris; LOW38–44draws/53237–59393tris. Opened finalheroLOW, dayHIGH and portraitcockpit in addition to earlierhero/canyon/isolatedcontrols. Brokenmutedcrownpatch visible while blackbody remains.

Focused artifacts: **shots/graphics-upgrade/g2-controls/** (gates.json/gates-low.json, hero/craftON/OFF and contextrestoredPNGs). Existing reports: shots/p5/_gates{,_low}.json; shots/s2c/_gates{,_low}.json; shots/p1a/_gates.json; shots/p3b/_gates.json. Intermediateg2/ captures are auxiliary; use after/ for finalcomparison. Source/check evidence snapshot under shots/graphics-upgrade/checkpoints/g2/.

Failurehistory: firstfocusedrun6/8, restoredresidual.0063hero/.0055isolated; clear-beforepaintfixedboth exactly. Earlyhero improvementtoo subtle; upwardtowerwindowterm made mutedbrokenpatch visible, accepted as direction bymanager. No failures hidden, no gateboundsrelaxed.

Limits: reflectedcityfeatures are deterministic plausible angular cues, not locallyraytracedobjects; structure has no localocclusion/GI. No GPUtimer/phone/Safari evidence. Existing craftharness full-lifetime worstCPU112–115ms includes setupandforcedbakes; not steady-state attribution. Manager owns finalheadedbudget HIGH/LOW, boot/context/quality/UI smoke and image-onlyreview. No assignedbuilder work remains; browser slot returned after finalcapture close.
