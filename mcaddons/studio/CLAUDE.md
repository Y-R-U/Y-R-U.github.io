# Addon Studio — `/mcaddons/studio/`

**An all-in-one Minecraft Bedrock add-on editor.** Not a guide, not a tutorial site — a working
toolset that replaces every app the written guide sends you off to install: Blockbench,
VS Code, a JSON validator, Paint.NET, NanaZip, bridge., and a place to test what you made.

It *guides you as needed* — short skippable popups, optional hints, wizards — but the app is
tools first. Any teaching is one sentence, in context, next to the thing it's about.

Live: `https://yru.br8t.com/mcaddons/studio/`
Companion (separate, optional) reading: `/mcaddons/guide/`. The guide may not be 100% accurate
about external apps; the studio is the source of truth for how to actually do the work here.

---

## Non-negotiables

1. **No build step.** Vanilla ES modules, served straight off GitHub Pages (site convention).
2. **Three.js r160 from CDN via importmap** (same as `gms/3d/voidcast`).
3. **No other third-party libraries.** Zip, code editor, pixel art, JSON parsing are hand-rolled.
   (`CompressionStream`/`DecompressionStream` are native — that's how we do `.mcaddon`.)
4. **Everything a child touches must be explainable in one short sentence.**
5. **Every popup is skippable and switchable off in Settings** (popups / hints / sound are
   three separate switches).
6. **Real files, never fake ones.** Wizards write correct, current-format Bedrock JSON the child
   can then open and read. We simplify the *process*, never hide the *product*.
7. **Mobile works.** Big touch targets, bottom nav under 900px.

---

## Layout

```
mcaddons/studio/
  index.html            App shell, importmap, nav rail, tool panes
  css/studio.css        Design system (tokens, panels, buttons, forms, nav, modals)
  js/
    main.js             Boot, tool registry, routing (#tool), lazy tool import
    core/
      bus.js            Tiny event bus
      db.js             IndexedDB key/value
      store.js          Settings (localStorage) + onSettings()
      fs.js             Virtual project file system (text + binary)
      project.js        Project create/open/save/delete/import/export, templates
      pack.js           zip() / unzip() via native Compression streams
      ui.js             toast / modal / confirm / prompt / sheet / el()
      coach.js          Tours, hints, Blocky the mascot, badges, confetti
      sfx.js            WebAudio blips
      validate.js       Friendly JSON errors + Bedrock lint rules
    lib/
      geo.js            Bedrock geometry <-> Three.js (shared by model/anim/test)
      anim.js           Bedrock animation parse/sample/serialise
      molang.js         Mini Molang evaluator
      bedrock.js        Component catalog + file templates + UUIDs
    tools/
      home.js  files.js  paint.js  model.js  anim.js  test.js  packer.js  settings.js
```

### Project data model

A project is one IndexedDB record: `proj:<id>` = `{ meta, files }` where `files` is
`{ "<path>": { t: 'text'|'bin', d: string|number[] } }`. Paths are exactly the real add-on
paths, so export is a straight copy:

```
BP/manifest.json           BP/entities/x.json        BP/items/x.json    BP/blocks/x.json
BP/pack_icon.png           BP/loot_tables/…          BP/functions/…     BP/scripts/…
RP/manifest.json           RP/entity/x.entity.json   RP/models/entity/x.geo.json
RP/pack_icon.png           RP/animations/x.animation.json
RP/render_controllers/x.render_controllers.json      RP/textures/entity/x.png
RP/textures/item_texture.json   RP/textures/terrain_texture.json   RP/blocks.json
RP/texts/en_US.lang
```

`meta` = `{ id, name, namespace, author, created, modified, badges[], tours[] }`.

---

## Module contract (every tool)

```js
export default {
  id: 'paint', title: 'Paint', icon: '🎨',
  mount(root) {},        // once, build DOM inside root
  show(args) {},         // tab activated (args from hash or openTool call)
  hide() {},             // tab left — stop rAF loops here
  onFileChange(path) {}  // optional; fs write from another tool
}
```

Register in `js/main.js` `TOOLS[]`. Tools **only** own their own file under `js/tools/`.
Shared files are owned by the integrator.

---

## Build phases

- [x] **P0 Foundation** — shell, design system, settings, coach engine, virtual FS, project
      manager + starter templates, home dashboard.
- [x] **P1 Files + Code** — file tree, syntax-highlighted editor, friendly JSON validator,
      Problems panel, image preview.
- [x] **P2 Paint** — pixel texture editor (tools, palette, UV guides, mirror, undo).
- [x] **P3 Model** — Blockbench-lite: cubes, bones, box UV, live texture, geo.json in/out.
- [x] **P4 Animate** — bone timeline, keyframes, easing, Molang fields, live preview.
- [x] **P5 Test World** — Three.js world that loads the actual pack files: summon your mob,
      give your item, place your block, content log, real commands.
- [x] **P6 Pack** — `.mcaddon` export + import, validation gate, install instructions.
- [x] **P7 Wizards & polish** — mob/item/block/food wizards, tours, badges, sounds.

All eight tools open clean (no console errors), the checker reports zero problems on a generated
pack, and the exported `.mcaddon` passes `unzip -t` with every JSON parsing and all cross-file
references (geometry / texture / animation / render controller) resolving.

---

## Known limits — say these plainly, don't pretend otherwise

- **The Play world is an approximation, not Minecraft.** It simulates the components a beginner
  actually uses (health, movement, scale, collision_box, physics/float, attack, and the
  stroll / look_at_player / panic / melee_attack / nearest_attackable_target / random_fly
  behaviours) plus animation selection through `scripts.animate`. Everything else is listed in the
  Content Log as "ignored here" rather than silently skipped. Crafting, redstone, biomes,
  spawn-rule evaluation and the Script API are not simulated.
- Mobs steer in straight lines — they do not path around trees or rocks.
- Loot drops appear as a message, not a pickup entity.
- Repeated "Rebuild world" in one session does not dispose old GPU textures.
- The Animate tool animates the first geometry in a multi-geometry `.geo.json`.
- Real Minecraft is still the final word: the Export tab says so, and always should.

---

## Gotchas found while building

- **Bedrock ↔ Three axes:** Bedrock entity model space is *left-handed* — +X east, +Y up,
  **+Z north** — so model → scene negates **Z** (not X, which is what most web viewers do):
  `x_three = x, y_three = y, z_three = -z`. A bone's rotation `[rx,ry,rz]` (degrees, applied
  X then Y then Z) becomes `(-rx, -ry, +rz)` with Euler order `ZYX` — the familiar "Bedrock
  inverts rotation X and Y" rule, which falls straight out of that Z mirror.
  Animation space is model space turned 180° about Y, so an animated *position* also flips X;
  see `ANIM_AXIS` in `lib/anim.js` — it is one constant, flip it there if it ever looks wrong.
- **Box UV layout** lives in `lib/geo.js: faceRects()`. Up/down are rotated 180° relative to the
  side faces. Get this wrong and every hat is on backwards.
- **`_geotest.html` is the regression check for both of the above.** It renders one 16³ cube with a
  big blocky "F" in each of the six UV regions and photographs it from six sides. Every side view
  must show the right colour *and* an F that reads the right way round (not mirrored, not upside
  down). Run it after any change to `geo.js`:
  `python3 -m http.server 8899` in this folder, then open `/_geotest.html`. It was how the Z-mirror
  (rather than the X-mirror most web viewers use) was confirmed.
- **`DecompressionStream('deflate-raw')`** is required to read real `.mcaddon` files. Store-only
  fallback exists for writing if `CompressionStream` is missing.
- Textures are stored as PNG bytes; `fs.dataURL(path)` caches the base64 form — it is invalidated
  on write, so never cache it yourself in a tool.
- IndexedDB can't structured-clone a `Uint8Array` view reliably across browsers here — binary is
  persisted as a plain number array (`t:'bin'`) and rehydrated on load.
