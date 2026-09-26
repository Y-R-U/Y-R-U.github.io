# art agent notes

Owns: `js/world/*`, `js/fx/*`, `js/actors/*`, `js/engine/{renderer,atmosphere,quality}.js`, `tools/robot_gallery.html`, `tools/artgate.py`, this file.
Integrator owns camera framing (`main.js` rig.keys) — art must look right at whatever zoom it picks.

## Gate tool
`python3 tools/artgate.py shot.png [--base old.png] [--crop x0,y0,x1,y1]` — luma mean/std/p5/p50/p95/range, dark% (<0.15), highlight% (>0.85),
saturation, detail (mean luma gradient), hue buckets, warm/cool %, % changed vs a base shot. `--refs` prints the ref crops the targets came from.
`--sbs a.png b.png out.png` builds a side-by-side for a blind critic (ffmpeg). PNG decode via macOS `sips` → BMP (stdlib only).

Ref floor crops (what the gameplay camera sees): plaza mean 0.38 range 0.71 dark 16% hi 2.5% sat 0.29 detail 0.064;
blue mean 0.24 range 0.51 dark 36% sat 0.32 detail 0.047.

## Baseline (shot=1, 915x412 MOBILE DPR2, high) — 1/8 gate
mean 0.64 std 0.078 p5 0.47 range 0.26 dark 0.1% hi 0% sat 0.20 detail 0.009. 228 calls / 558k tris.

## DONE
- artgate.py
- Env map (atmosphere.js `buildEnvironment`): procedural polished floor below the horizon (light/dark/black slabs, gold rings, dark
  building-base band) + a ring of 22 dark window-strip towers (sun azimuth left open) + blue holo cards. Chrome now reads chrome.
- Gold colours were orange (sRGB 0xf2b64c ≈ linear copper). Now physically-plausible yellow gold (0xffd27a family) in civ/PAINTS/
  frames GOLD_T/enforcer/security/world M.gold.
- Planar reflection (fx/reflection.js): mirror RT cleared to alpha 0; alpha marks reflected objects, which REPLACE the env specular
  there. New `sky` option scales env specular to the artistic fresnel elsewhere (desaturated 45%). `REFL_ZONE` define + `reflZone`
  float lets a material modulate per pixel. MSAA x4 on the mirror RT for high tier. Water uses sky=0 (unchanged look).
- Floor (ground.js): travertine (darker, 3 tones per 3 m cell) + nero black marble (sunburst segments 8.6–17 m, band at r 21.4, hub,
  0.5 m ribbons on a 6 m grid outside the ring) + steel slate (ring 25.8–28.6, boulevard). Anti-aliased zone weights; gold radial
  lines now sit on the segment boundaries; faint directional veins on nero; cyan guide-light rings (r 29.15, 8.25, boulevard edges).

## NEXT

## Screenshots
scratchpad `art/` (driver `art/shot.mjs`, PORT 9314, MOBILE=1 now also sets an Android UA so the tier/dpr match a phone).
