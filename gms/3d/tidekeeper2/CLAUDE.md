# Tidekeeper II — the fishroom

A second take on the aquarium game at `../tidekeeper/`. Same simulation lineage,
but split into modules, rebuilt visually, and — the real difference — it starts
with **one fish, one tank and one button**. Everything else is earned.

If you are only going to read one thing: **the balance numbers in
`js/sim/tank.js` and `js/sim/biology.js` were set against a Node harness
stepping weeks of chemistry, not against screenshots. Do not nudge them from a
render.** The v1 CLAUDE.md explains why in more detail.

## Layout

```
index.html          shell, boot gate, importmap
css/style.css       the whole interface
js/
  main.js           boot, render loop, ?shot / ?auto / ?lite / ?fresh
  config.js         every tunable a designer reaches for
  util.js           maths, rng, dom, formatting
  audio.js          synthesised, no files
  data/             species, flora, gear, relations, progress (the unlock tree)
  sim/              tank (chemistry), biology, behaviour (boids), scoring
  render/           fishgeo, fishbuild, fish, flora, tankview, world, camera, post, textures
  game/             game (state + loop), coach (onboarding), expedition, save
  ui/               ui (HUD), sheets (panels), modal, icons
assets/tex/         Flux-generated surface photographs
```

## The two rules that keep breaking

**One world unit is ten centimetres.** Tanks, fish (`len / 10` is the model
scale), plants, the cabinet. Mixing scales is what made v1 look like a
doll's house full of whale-sized tetras.

**The last composer pass writes sRGB itself.** `GradeShader` is a raw
`ShaderMaterial`, so three does not insert the linear→sRGB encode for it. The
transfer function at the end of that shader is load-bearing; remove it and the
whole game renders about two stops dark and you will be tempted to "fix" it by
turning every light up, which is wrong.

Two smaller ones, both of which cost an hour each:
- A **colour map multiplies the material colour**, so a dark fallback texture
  makes a black material however bright the colour is. Fallbacks in
  `textures.js` are deliberately light and neutral.
- Additive `ShaderMaterial`s must not premultiply: three's `AdditiveBlending`
  is `(SrcAlpha, One)`, so `vec4(rgb * a, a)` squares the contribution.

## Testing

`tools/` is empty on purpose — the tests live in the scratchpad. What matters:

- **Disable the HTTP cache when driving this with CDP.** `main.js?v=2` is a
  constant URL, so a cache-busting page query does *not* bust the modules.
  Several hours went into debugging a "bug" that was just Chrome serving the
  previous version of my own edits. `Network.setCacheDisabled` in the driver.
- `?fresh=1` wipes the save, `?shot=1` dresses a 75 gallon for screenshots,
  `?shot=fish&sp=a,b,c&d=5` lines species up at a fixed distance for judging
  the models, `?auto=1` plays badly on purpose, `?lite=1` drops bloom and DPR.
- `window.__TK2` is the Game; `__TK2.api` exposes the modules for tests.
- The render loop wraps each stage in `step()` so one throwing subsystem
  cannot silently stop the others — a dead loop with no error is the worst
  failure a no-build-step game can have.

## Progression

`js/data/progress.js` is the whole design. `GOALS` is the spine: each fires
automatically, hands out a capability, and gates the next. `SHELF` is the
meta-layer bought with renown. `CAPS` gates every control in the dock — the
first minute really does have one button, because `syncDock()` only builds
what has been earned.

Two deliberate kindnesses, both of which exist because the alternative teaches
the player to stop playing:
- The starter tank arrives with **seeded filter media** (`bactA` 0.30).
- The first animal that would ever die **doesn't**, once, ever
  (`Game.useMercy`). It drops to 10% condition and the coach explains.

## Aquascaping

`World.layout()` puts planting in two or three **masses** with gaps between
them rather than an even row, and `World.syncContents()` renders each plant you
bought as a **clump** (`CLUMP` — nine for carpet, six for stems, four for
ribbons). Both are there because a real planted tank is dense and grouped, and
an evenly spaced row of single stems reads as a diagram. The substrate is
deliberately dark for the same reason: a pale floor bounces light everywhere
and flattens the fish. `assets/tex/ref_*.jpg` are art-direction references,
gitignored, not shipped.

## The room

The tank is the only light source in a dark room, and that contrast is most of
why photographs of aquariums look the way they do. Two things to know:

- **The pools of light on the wall and floor are painted, not lit.** three has
  no per-object light masking — `light.layers` is tested against the *camera*,
  not per object — so any point light bright enough to wash the wall also
  washes out the inside of the tank. `glowBack` and `glowFloor` are additive
  quads instead; only one weak point light picks out the cabinet face.
- `Orbit.refit()` deliberately does **not** clamp a deliberate view any more.
  It only rescues a camera that has ended up too close to see anything, so the
  player can pull right back and look at the room.

Plant scale is clamped to `dims[1] * 0.86` so nothing grows out through the lid.

Balance facts worth re-proving after any change to the sim:
- A betta plus six neons in the 10 gallon starter is over capacity, and the
  warning fires before anything dies.
- Flake is the generic food; only the specialists need something specific.
  Feeding the wrong thing is how the first build starved its own tutorial fish.
- An empty tank earns almost nothing, however nicely it is planted.
