# Graphics final visual review — 2026-10-01

Decision: **ACCEPT for local visual acceptance of the selected G1/G2 scope.** The clearest gain is neon sources affecting nearby host surfaces; craft reflection structure improves more modestly. This is a useful material/lighting pass, not a wholesale visual transformation. No concrete new artifact warrants reopening implementation. Manager retains final integrated runtime/performance acceptance. Reviewer owns this document only; no browser/test runs, runtime edits, commits or pushes.

Read workspace/site AGENTS.md, Neonhaul CLAUDE.md, original prompt, initial graphics review, G1/G2 notes and manager-state guidance. Selected scope is source-bound facade spill/material response and structured dark craft reflections. Full ground-object reflections and haze tuning remain deferred.

## Images independently inspected

Opened actual PNGs individually with `view_image`, not just reports or thumbnails:

- `shots/graphics-upgrade/{baseline,after}/`: all six HIGH pairs (`fog_city`, `canyon_dive`, `hero_craft`, `wet_street`, `day_smog`, `cockpit`); LOW canyon/hero pairs; 390×844 HIGH portrait canyon/cockpit/hero/day pairs. Remaining LOW/portrait pairs were not visually inspected.
- Current Aurum references: `shots/graphics-upgrade/before/heirframe-shot2.png` and `heirframe-shot3.png` (1280×720).
- Auxiliary mechanism views: `g1-controls/receiver.png` and G2 `craft-off`, `craft-on`, `hero-off`, `hero-on` under `g2-controls/`.

The primary comparisons use the pinned original `baseline/`, never the earlier auxiliary `before/` Neonhaul captures. Read `capture-acceptance.json`: 18 pairs match fixture/spec, dimensions, DPR, vehicle clock, preset, draws and triangles; zero errors. Existing controls/regressions below are builder evidence, not tests rerun by this reviewer.

## Visible findings

| Area | Actual before/after finding | Judgment |
|---|---|---|
| Source-to-surface coherence | HIGH canyon now has localized amber support around the left sign, green at the right strip and pink around the right sign/ARCADE. Day cornice and zigzag trims gain adjacent pink wall falloff. Cockpit NO ENTRY and nearby roof strips visibly affect their supporting facade. | Clearest improvement; dark gaps/roofs survive. |
| Glazing/cladding and pane depth | Dark panels remain opaque and panes luminous. Near cornices/panes have restrained value shaping, but the six plates still mostly read as rows of filled windows on simple slabs. A strong new glass-versus-cladding distinction is not obvious at normal framing. | Accept the modest improvement; reject a claim that this now matches Heirframe's interior/mullion depth. |
| Dark craft | Fog craft canopy changes from broad smooth cyan fill to distinct angular pale/cool patches. Hero crown gains muted broken highlights; hull shade, trim and engine wash stay recognizable. Canyon body gains little at this view. LOW hero retains the same useful crown change. G2 environment ON/OFF controls are visibly subtle. | Useful close-craft polish, smaller than facade gain; no pale-chrome flood. Still plausible reflected cues rather than recognizable local signs/buildings. |
| Wet deck | Broader broken blue/cool and faint warm environment bands now cross the previously sparse deck. Sign glyph reflections persist. The new bands look procedural/wavy and do not supply matched reflected building masses. | Accept as restrained environment response. Full ground-object reflection goal remains deferred. |
| Day/night restraint | Day stays brown-grey and dim; stormnight and dusk retain dark masses, varied neon and silhouettes. Fog-city global depth/haze is essentially unchanged. | Preserves the original setting; no broad ambient lift. |
| Portrait readability | Job/pad HUDs and dashboard remain readable at 390×844; new roof spill does not wash over text. Canyon craft is partly cropped and hero craft almost absent in both portrait fixtures, limiting craft assessment there. | No new readability regression. These fixed-camera crops are not phone interaction evidence. |

Heirframe's useful advantage is surface relationship: shot2 has distinct matte/gloss/chrome responses and legible lit interiors; shots2/3 reflect nearby objects in spatially connected floors/water. Neonhaul closes part of the source/wall disconnect while retaining its darker, simpler city. Heirframe's local reflection correspondence and interior structure remain stronger; its bright palette, crowds and geometry are not acceptance targets.

## Limits and handoff

No new visual blocker seen. Existing facade stipple/dither, broad repeated window halos, simple slab geometry and some strong source bloom remain; stills cannot establish temporal shimmer, popping or view-dependent highlight motion. No blind AAA score assigned.

G1 is capped analytic host-wall illumination (up to two signs/two strips; 512 KiB source texture; 16 vertex attributes), skips round facets and animated hero/poster sources, and adds no general GI/cast shadows. G2 uses cached procedural environment plus analytic angular craft features, without local ray capture/occlusion. This review does not reinterpret their green off/null/restore checks as a large visual gain. G1/G2 each report focused 8/8 on both presets; unchanged p5/s2c dark-hull/reflection/canopy checks pass HIGH/LOW. All18 matched draws/triangles demonstrate unchanged geometry submission, not unchanged fragment cost.

Mac frame-pacing/CPU checks do not prove physical-phone/Safari performance or isolated GPU cost. Manager reports final headed HIGH/LOW six-shot and flight budgets pass unchanged bounds (flight worst CPU 7.2/9.5 ms), 36 comparison pairs and 320/390/844 layouts pass, DPR2 HIGH/LOW portrait/landscape rebuilds clean, and existing boot 12/12 includes touch/save/context recovery. These manager checks were not rerun by the reviewer. Keep ground-object reflections, haze/LOD changes, new geometry and gameplay outside this pass. No further reviewer work remains; images/report are durable for a usage-limit resume.
