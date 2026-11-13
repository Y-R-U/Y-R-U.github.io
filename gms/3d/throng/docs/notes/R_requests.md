# Lane R → lane G / manager requests

None of these block M1.

1. **Menu camera.** Call `renderer.setCameraMode('showcase')` in `showMenu()` and `setCameraMode('follow')`
   in `startMatch()`. Showcase follows `state.leader`, frames wider and drifts the yaw slowly. (Answers G #6.)
2. **Crown clearance.** Use `renderer.crownTop()` (world y of the crown's top, changes with zoom) in place of
   `CONFIG.UI.crownClear`. (Answers G #4.)
3. **`project().behind`** is now set. (G #5.)
4. **Punch.** Keep it as it is now: the renderer self-triggers on elim/lead/steal streaks/recruit streaks/pickup/
   respawn and on phase `over` (slow push-in). Call `punch()` only for something the renderer can't see.
5. **Quality.** `pickQuality()` gives touch devices `medium`, which is right. Desktop `high` turns on bloom and
   people reflections. A settings toggle (M2) can call `setQuality('lite'|'medium'|'high')` at runtime; the lite
   person LOD is only chosen at creation, so a lite device should be created as lite.
6. **Sim fields used if present:** `px/pz` (crowds + neutrals, for interpolation), `protect`, `panic`, `eating`,
   `leader`, `rank`, `neutrals.look/heading/state/target`. If `px/pz` disappear, the renderer falls back to
   tick-based snapshots.
7. **Manager:** Pages builds from the repo root, and `tools/render_harness.html` imports three from
   `../../../lib/three/0.180.0/`, so the harness works when deployed too. It's a dev tool; leave it out of
   `projects.js`.
8. **Shared Chrome:** I used port 9231 early on before G's note; I now use 9247. Sorry for driving your tab.

## Wave 2 (R2) asks for lane G

9. **Camera is much wider now** (ring ≈ 27 % of portrait width at 350, was 47 %). Count pills and "+N"
   floaters are now over smaller crowds. Consider slightly smaller pills when `r.three.camera` distance is
   large, and keep the off-screen leader arrow (the rank-1 crowd still sits just off-screen sometimes).
10. **Pickups now have a 3D floating badge** (icon in a coloured disc above each pad, scaled with zoom).
    If the HUD draws its own pickup markers in world space, drop them to avoid doubling.
11. **Showcase** (`setCameraMode('showcase')`) now frames the central plaza at a lower pitch. Keep calling
    `setCameraMode('follow')` before/at match start; `setCrowds()` snaps the rig so there's no visible jump.
12. In landscape the minimap (bottom-left) sits over crowds more often now that more of the map is visible;
    worth a smaller minimap or more transparency in landscape.
13. Seen in t=8 portrait shots: the leaderboard panel showed empty space below the "You" row (panel height
    not shrinking to its rows). Yours to check.

## Wave 3 (R3) asks for lane G / O

14. **Cosmetics are live in the renderer.** The full `setCrowds` schema is in CONTRACT.md → "Crowd cosmetics (R3)".
    `js/meta/shop.js` can list these ids:
    - hats: `cap tophat beanie crown party cowboy hardhat headband chef wizard halo`
    - leaders: `caped king robot mascot`
    - flags: emblem ids `star heart bolt crown moon diamond skull paw flame sun`, or 1–3 characters / an emoji
    - trails: `sparkle petals dust lightning confetti hearts smoke`
    - rings: `dashed double flame pulse`
    - `palette`

    `viking` (G2's proposal) is not built; it falls back to no hat. Pass them through at both `setCrowds` call sites in `main.js`
    (lines ~169 and ~284). Bots can get random ones for variety, and online peers should send theirs in the lobby payload.

    To preview: `tools/render_harness.html?scene=early&player=80&hat=cowboy&hatShare=1&leader=mascot&flag=star&trail=confetti&ring=flame&close=16&pitch=50&drive=1`.
    For every set side by side, use `?cos=all`.
15. **Crown on the flag pole.** When the rank-1 crowd carries a flag, the crown rides on top of the pole, about 1–3 m higher than before.
    `crownTop()` already includes this, so keep using it for the count pill clearance.
16. **Camera is closer again.** The portrait ring is now about 33–36 % of the width at 350–1,000 (wave 2 had it at 27 %).
    Near the map edge, the look target slides up to half a view radius inward, so the player's crowd can sit off-centre there.
    The off-screen arrow and the pills need no change.
17. **Buildings in front of the player's crowd now sink to their ground floor** in about 0.3 s, instead of fading.
    This is a renderer-only effect: there are no gameplay changes and the obstacles are the same.
18. **Adaptive quality** now steps down after 1.5 s under 45 fps, following a 2 s warm-up (wave 2 waited 4 s under 40 fps). It never steps back up.
    If the settings screen offers "Auto", call `setAdaptive(true)`. A manual pick should call `setAdaptive(false)` and then `setQuality(q)`.
    On a device that starts slow, create the renderer as `'lite'`, because the lite person LOD is only chosen at creation.
19. **3D emote bubble** (G2 ask 2) is not done this wave.
