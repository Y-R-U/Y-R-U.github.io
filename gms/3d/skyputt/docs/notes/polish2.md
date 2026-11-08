# polish2 agent (2026-11-08)

Tasks: Sunken Reef performance + landscape outcrops, Volcano crystals + plume, ledge drops, aim guide vs
other balls; extra: ladder tier cards on narrow phones. Shots in `docs/notes/polish2_shots/` (gitignored).
Nothing committed.

## 1. Sunken Reef performance (`js/themes/reef/`)
Measured with `tools/reef_shots.mjs` (renderer.info, headless, tee view). **Note:** `renderer.info` counts the
main pass only — shadow-map draws are reset away before it is read. Recorded with a `renderBufferDirect`
hook, reef9 was 130 draws per frame (88 main + 42 shadow) before, 113 (77 + 36) after.

| reef, high | draw calls | triangles |
|---|---|---|
| before, holes 1-9 portrait | 60–86 | 47.1k–58.4k |
| after, holes 1-9 portrait | 55–77 | 32.8k–40.0k |
| reef9 before / after (412x915) | 86 → 77 | 58.4k → 40.0k |
| reef9 desktop 1440x900 | 88 → 78 | 58.7k → 40.2k |
| volcano on reef9 (reference) | 82 | 38.7k |

| reef, low (`q=low`) | draw calls | triangles |
|---|---|---|
| before, holes 1-9 portrait | 47–86 | 23k–31k |
| after | 37–65 | 21.2k–28.5k |

What changed (look kept — before/after `before-reef-*` vs `after-reef-*`):
- **Bucket aliases** (`util.js` `ALIAS_HI` / `ALIAS_LO`, `new Buckets(alias)`): `vcWood` and `vc` are the same
  shader, so wood always joins vc (near props, backdrop, windmill rotor). Backdrop gloss → vc (30-60 m away).
  Bumpers put their knobs + moss in the drum's stone bucket (3 draws → 2 each). Low quality also folds
  metal / gloss / stone into vc. `merge()` drops attributes not every part has (aliased buckets mix uv / no-uv).
- **Glow / window buckets never cast shadows** (`Buckets.build`): one shadow draw less per skin.
- Ship / lantern windows go in the glow bucket (one material less; they pulse faintly with the other glows).
- **LOD**: backdrop props always use their low variant (anemones, clams, amphorae, barrels, columns…); outcrop
  rock rings 22 → 12 (`roundIsland(…, n)`); ship hull 28x12 → 20x10, rail posts 13 → 9; temple columns 12 → 10
  sides, step anemones 6 → 3; sea-lamp spheres 10x6 → 8x5; outcrops lost their tube sponges / starfish (a few
  pixels at 20-70 m); the 9th outcrop (behind the camera, only the fly-over saw it) is not built.
- Foliage: branch coral cylinders open-ended (caps never seen), sea fans 7 ribs / 2 rings, sponges icosahedron
  detail 0 (5-13 cm lumps); kelp 5 segments (was 8), backdrop kelp forest 40 → 20 strands, 3 per outcrop.
- Fish: body 5x3 (24 tris with fins), near schools 14 → 10, far 14 → 7.
- Skins: knob hemispheres 5x2, loop rails 48x4 (was 56x5), piping 40, coral knobs on the loop 6x2.
- Low: no camera bubbles (plankton only; the bubble streams still rise).

**Landscape outcrops**: the near outcrops moved out and down, and the two big side ones shrank:
anemones `wmin-22, -6, R 2.6`, kelp `wmax+28, -6, R 2.6`, clams/corals `±24, -11/-12, R 2.0`, columns
`wmin-36, 0, R 3.4`, amphorae `wmax+40, 1, R 3.8`. Shots `after2-reef-{lp,p,l}-hole1.png` vs `before-reef-lp-hole1.png`.

## 2. Volcano leftovers (`js/themes/volcano/`)
- **Crystals**: `CRYSTAL_COLS` / the instanced crystal colours are black / smoky grey (0x1c1c20…0x3a3a40);
  `vcGloss` and `crystalInst` now match the obsidian ice (roughness 0.08, metalness 0.3, emissive 0x16181c)
  plus an **ember rim** (`emberRim()` in materials.js: fresnel `pow(clamp(1-|n·v|,0,1),3)` adds orange
  emission; the view vector is length-guarded — Adreno rule). Shots `crystal-after-sky-p-hole3.png` vs
  `volcano_shots/v3-p-hole3.png`.
- **Plume**: the eruption plume is now wind-bent instead of a tall column: it rises ~6-8 m (easing out) and is
  carried sideways toward the middle of the view (lateral ∝ m², so it leaves the crater first, then bends),
  flatter puffs (h = 0.55 w). It fits in portrait above the unchanged volcano. Mechanism: billboards `smoke`
  mode reads a per-item `lean` (integer part of the phase attribute) and an `opts.wind` direction; items
  without `lean` (chimneys, vents) behave exactly as before. Shots `plume-before-sky-p-hole1.png` /
  `plume-after-sky-{p,lp}-hole1.png`.

## 3. Ledge drops (theme-independent: `js/course/builder.js` `ledgeDress`, `js/game/holeview.js`)
Cause: where the main floor stops (`gap: true`), only a 4 cm slab face facing downhill was drawn, so from
a high camera the lower floor ran right up to the lip and read as a painted step. Now every lip gets
(visual only — no colliders, excluded from `bounds`/`killY`):
- a 5 cm trim strip on top of the lip edge (the edge line you see from behind / above),
- a cliff face (`ledge` group → the theme's wall material) from the lip down to the floor found under it,
- a soft shadow band (`shade` group: holeview's own black MeshBasic with a gradient alphaMap, no shader)
  0.55 m along the lower floor past the lip.
Floors are found by probing the floor colliders straight down, so catch pads / branches / slopes work; a lip
over a void (sky3/6/14, fest4/9 jumps) gets only the edge strip. Dressed: wood4 (2 ledges), wood8, wood9.
Shots `drop-before-hi-woods-p-hole4.png`, `drop-after-hi-{spooky,sky}-woods-p-hole4.png` (camera pitched up
with `--eval`). Honest note: from the steepest views the band is a modest cue; the shadow is what reads.

## 4. Aim guide vs other balls (ball hits on)
- `traceGuide(…, { targets })` (js/engine/sim.js): resting balls `[[x,y,z]]`; the trace stops on the first step
  where the ball would touch one (same `< 2R` test as `collideBalls`) and returns `contact = { at, ball, point }`.
  Read-only: targets never move, the real ball is cloned as before; without targets the result is identical.
- `Round.guideTargets()` (play.js): `null` unless `this.collide`; online (`OnlineRound`, duck-typed on
  `targetsFor`) it is exactly the list the shot will be relayed with; offline the resting `others` and the
  rival ghost's ball when it rests (not while my ball is on the tee — a teed-up ball never collides with it).
- `AimInput` `getTargets` option → `GuideLine.show(…, contact)`: an orange "ghost ball" ring where my ball would
  touch, plus a dot at the touching point, gently pulsing. Line stops there. Physics untouched.
- Shots `aim-contact-sky-{p,l}-hole1.png` (a resting ball injected in front of the tee).
- `tools/ballhit_test.mjs` +5 checks (contact flagged at touching distance, the real shot knocks that ball,
  a ball off the line changes nothing, the guide never moves the real ball).

## 5. Ladder tier cards on narrow phones (css/app.css)
`.lad-tiers` overflowed sideways at 412 px (cards ~480 px wide): grid `1fr 1fr` + nowrap reward lines, and
the `.lad-tiers div span` rule also hit the coin spans inside, stacking coin over number. Now:
`repeat(2, minmax(0, 1fr))`, the span rules are direct-child only, and ≤ 480 px the card is a small grid
(badge left spanning two rows, name above the rewards, 11 px reward lines that may wrap between label and
value). Checked 412x915, 390x844, 360x780: no element past the viewport, document width = viewport, Online
rounds tab unchanged (`after--ladder-*.png`, `after--ladder-online-*.png`).

## Tests (2026-11-08)
- physics 25/25, store, story, events, meta: all passed; ballhit 46/46 (incl. 5 new guide checks);
  online 31/31; boards ALL PASS (26).
- daily: 79/79 on `git archive HEAD` + my files; 78/79 in the working tree ("all courses open → same hole as
  the global pick") — caused by the `star` agent's uncommitted course lines in holes/index.js (same pattern
  ballhit saw with reef), not by this work.
- holes_test: 54/54 ok, exit 0 (HEAD + my files; colliders unchanged — ledge dressing is visual only).
- Browser (CDP, `reef_shots.mjs`): reef 1-9 at 412x915 / 844x390 / 1440x900 / low, volcano p/lp/l, woods4 in
  spooky/sky/candy/frost (low), title theme swap through all themes, ladder at 360/390/412: no console errors.

## Leftovers
- reef9 sits right at the budget (77 calls / 40.0k); the other reef holes are 30-37k.
- Ledge shade is a fixed-strength cue; from very steep views the lower floor is foreshortened to a sliver.
- The aim contact ring flags only balls at rest now (a ghost mid-recorded-shot or a peer still rolling isn't
  shown — same rule as the online shot simulation).
