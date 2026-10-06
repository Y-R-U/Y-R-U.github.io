# art — notes (wave 2)
Owns js/world/*, js/world/props/*, js/world/food.js, tools/house.html, tools/props.html, js/core/post.js. CDP port 9411.
Test harness (scratchpad art/): run.sh <outdir> <q> <WxH> <level> <views> — views = gameplay names, cam_* anchors, or
c_x_y_z_lx_ly_lz_fov; perf.mjs <q> <level> prints calls/tris incl. a shadow-pass split.
Gotcha: downscaled contact sheets fooled me into seeing "flat lighting" after hiding the UI; a pixel diff showed identical frames.

## DONE
- post.js: warm evening grade folded into tone mapping (CustomToneMapping = ACES + warm split-tone + soft S-curve; zero
  extra passes on any tier, OutputPass on high uses it too) + static CSS vignette div (#vignette) inserted after the
  canvas, below #ui-root (z 10). `?grade=0` disables both for A/B.
- lighting.js interior: hemi 0.48→0.32, key 1.5→1.05, env 0.22→0.13, lamps ×1.55, colour 35% toward 0xffdcb0, range ×1.15
  → warm lamp pools, corners fall off. Exterior: hemi 0.8→0.7, key 2.1→1.75.
- Dusk window glass ('windowGlass' material, blue-violet, 0.4 opacity) on house windows, back door and the living sash
  prop; jars keep plain 'glass'.
- Floors: plank tones browner, kitchen checker brown/cream, bedroom floor tint less pink; lawn dimmer (0x908c84); sky
  horizon dusky rose except right round the sun.
- Mash: broad fluffy scoop (forked peaks, gravy well + lobes, butter), 0.88 scale; gravy brown (was reading red-orange).
  Parsley flecks high-only (−1 call).
- Vine: heart-shaped variegated pothos leaves (instanced, 34/56/72 by quality, spiral round stem, droop) + crown + tendrils.
- TV: beige plastic case, dark bezel, brown knobs, speaker slots; flat bulged screen (the old sphere cap read as a porthole).
- Stairwell wall: GF crown skipped over the stairwell span; upper wall there uses the living wallpaper with no skirting/rail.
- Bedroom: patchwork quilt texture (refs/bedroom), honey-wood bed, bedside lamp 7→5 (headboard was blowing out).
- Perf: medium/low trim small prop shadow casters (<0.22 m radius + flush/small props), vine strand casts on high only;
  upper-storey shell hidden while the camera is in the kitchen. Kitchen medium 156–177 calls / 223–247k tris →
  132–149 / 205–222k. selfTest 11/11, play.mjs 1-10 all PASS.

- Follow-ups for polish: vine leaves hide when the camera is within 0.45 m of the strand (vine.cull from world.update); kitchen pendant point light moved up inside the shade (y 2.37, intensity 12) so it no longer blows out Jon's head.
- Autoplayer after those: L1-8 and L10 PASS; L9 '3 table bumps' failures were polish's mid-edit states; polish re-ran L9 twice, PASS. Runs are flaky because something kills Chrome 9411 mid-run.

## IN PROGRESS
- none (lane at a clean stopping point)

## NEXT (honest remaining gaps vs refs)
- Kitchen still brighter/more open than the ref; ref's hero is the glowing pendant shades, ours sits mostly above frame.
- Cul-de-sac intro: lawns big and flat, few bushes/fences; ref is dense, house centred and close. Content work.
- Lasagna: fine; could use more golden melted-cheese ooze over the top (ref).
- Kitchen medium still 146–149 calls when the camera is in the living room/at spawn: house = 38 calls, Garfield 19 (polish),
  plate 10. House material consolidation would be next.

## REQUESTS
- polish: Garfield is 19 draw calls (+shadow pass) — the biggest single item left in the kitchen budget.
