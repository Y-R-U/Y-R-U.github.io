# SYNTHWILD — Architecture & contracts (v0)

Three.js **0.180.0 vendored** (`../../lib/three/0.180.0/three.module.js`, addons under
`../../lib/three/0.180.0/addons/`). No CDN imports, and no build step: plain ES modules. Landscape, mobile-first.
Propose contract changes in your notes file. Don't silently diverge.

## Folder map and owners
```
gms/3d/synthwild/
  index.html            lane 2 (engine)  — canvas#game, #ui-root, importmap, classic inline boot watchdog
  css/                  lane 5 (ui)
  js/main.js            lane 2 — boot, ctx, frame loop, game.start/stop
  js/core/              lane 2 — bus.js (event emitter), rng.js (seeded), math helpers
  js/world/             lane 1 (world) — storage, terrain gen, light, edits, raycast, persistence, gen worker
  js/data/blocks.js     lane 1 — block registry
  js/render/            lane 2 — mesher worker, atlas, materials/shaders, chunk renderer, sky/day-night, water, fx
  js/player/            lane 3 (player) — input action map, touch/kb/gamepad, physics, camera, targeting, brush
  js/game/              lane 4 (gameplay) — mobs, mob models, AI, survival stats, inventory, drops, combat
  js/data/items.js      lane 4 — item registry (+ recipes.js later)
  js/ui/                lane 5 — shell (title/worlds/new world/settings/login), HUD, hotbar, inventory, wheel, intro
  js/audio/             lane 5 — audio manager, procedural SFX, music, VO
  audio/ assets/        lane 5 — music mp3s, VO, intro media
  js/net/api.js         lane 6 (server) — client API (works offline: local IndexedDB fallback)
  server/               lane 6 — Go + SQLite, deploy.sh, systemd unit, Caddy route
  tools/                anyone, prefixed by lane (e.g. tools/world_*.mjs)
  docs/notes/<lane>.md  each lane's running notes
```

## Units and grids
- 1 world unit = 1 metre = one standard "block". **Fine grid = 0.25** ("sub"). Sub coords are
  integers `s = Math.floor(u * 4)`.
- Chunk = 16×16 units horizontally. World height 0..128 units (512 subs). Sea level y = 32.
  Section = 16×16×16 units (cells). A chunk column = 8 sections. Key `"cx,cz"`/`"cx,sy,cz"`.
- **Cell storage** (`Uint16Array(4096)` per section, index `x + z*16 + y*256`):
  value `v < 0x8000` → uniform material id `v` (0 = air); `v & 0x8000` → refined: index `v & 0x7fff`
  into `section.subs[]`, each a `Uint8Array(64)` of material ids (index `sx + sz*4 + sy*16`).
  A refined cell that becomes uniform collapses back. Material ids are 0..255.
  All-air sections may be `null`. This is what "large stamps stay merged, split only at the cut" means.
- **Light**: `Uint8Array(4096)` per section at cell resolution, `(sky << 4) | block`, 0..15 each,
  using Minecraft-style flood fill. Refined cells count as transparent for light. Emissive blocks seed block light.

## World API (lane 1, `js/world/world.js`)
```js
const world = new World({ seed, mode })         // seed: string|number
world.update(px, pz, radius)                     // stream/generate chunks around (gen in worker); call each frame
world.isReady(px, pz)                            // chunk under player generated
world.getSub(sx, sy, sz) -> mat                  // fine grid read
world.getCell(x, y, z) -> mat | -1               // -1 = refined
world.isSolidSub(sx, sy, sz) -> bool             // physics (liquids/plants not solid)
world.blockAt(x, y, z) -> mat                    // float world pos convenience
world.raycast(origin:Vector3|[x,y,z], dir, maxDist) -> { sub:[sx,sy,sz], normal:[nx,ny,nz], mat, dist, point } | null
world.setBox(minSub:[x,y,z], maxSub:[x,y,z] /*exclusive*/, mat, mode='fill'|'hollow'|'shell'|'replace', opts)
      -> { changed: n, removed: [{mat,count}] }   // break = setBox(..., 0, 'fill'); removed feeds drops
world.surfaceY(x, z) -> y                        // highest solid unit, for spawning
world.biomeAt(x, z) -> 'forest'|'shore'|'ocean'
world.sections  // Map key -> { cells, subs, light, version, dirty }
world.onSectionDirty(cb(key))                     // the renderer remeshes the section and its neighbours on edits
world.serialize() -> { seed, mode, sections:{ key: base64(RLE) } }   // modified sections only
World.deserialize(obj) -> world
```
`hollow` = box filled with mat, interior carved to air. `shell` = only the walls written, interior untouched.
`replace` = only non-air cells in the box become mat.

## Block registry (lane 1, `js/data/blocks.js`)
`BLOCKS[id] = { id, key, name, tile:{top,side,bottom} /*atlas tile indices*/, color:[r,g,b], emissive:0..1,
light:0..15, solid, cutout /*alpha-tested e.g. leaves*/, transparent /*glass*/, liquid, plant /*no collision, X-mesh*/,
hardness, tool:'cutter'|'saw'|'scoop'|null, drops }` and `BLOCK.KEY → id`. Atlas tiles are drawn
procedurally at boot (`js/render/atlas.js`, lane 2) from the per-tile style hints in `blocks.js`.

## Renderer (lane 2)
- One opaque ShaderMaterial (atlas `DataArrayTexture` or a 2D atlas with padding, vertex AO, sky/block light,
  emissive mask, rim light, fog), one cutout and one water material. Meshing runs in a **Web Worker**:
  greedy merge at cell resolution for uniform cells, fine-resolution faces for refined cells, and faces
  against refined neighbours split per 0.25 sub-face.
- `ctx.render.update(camera)`, `ctx.sky` = `{ time01, isNight, sunDir, daylight01, setTime(t) }`. A full
  day is 20 min (5 min of night).
- `ctx.fx` = `{ spark(pos, color, n), hologram(minSub, maxSub, color), emp(pos, radius), puff(pos, color) }`. Particle cap 512.
- Third person needs the player model: lane 3 makes it (`js/player/avatar.js`).

## ctx (built in `js/main.js`, passed to every module's `init(ctx)`)
```js
ctx = { THREE, renderer, scene, camera, canvas, uiRoot,
  bus, rng, world, render, sky, fx,           // lanes 1-2
  input, player, brush,                       // lane 3
  game: { mobs, survival, inv, items },       // lane 4
  ui, audio, settings,                        // lane 5
  api,                                        // lane 6
  session: { meta /*world record*/, mode:'survival'|'build', paused } }
```
Frame order: `input.update → player.update → game.update → world.update → render.update → fx.update →
ui.update → renderer.render`. Modules expose `init(ctx)` and `update(dt)`.
`js/main.js` exports `game.start(meta, saveData)`, `game.stop() -> saveData`, `game.save() -> saveData`.
The shell (lane 5) owns the screen flow: title → (intro) → loading → playing ⇄ paused.
`window.__game` exposes ctx and test hooks (`?auto=1` walks and builds, `?shot=1`, `?lite=1`, `?seed=`, `?mode=`, `?t=` time of day).

## Bus events
`block:break {minSub,maxSub,removed,pos}` · `block:place {minSub,maxSub,mat}` · `player:damage {amount,src}` ·
`player:death` · `player:respawn` · `mob:hit` · `mob:death {kind,pos}` · `item:pickup {id,n}` ·
`time:night` · `time:day` · `world:dirty` · `settings:change {key,value}` · `ui:open {panel}`.

## Settings (lane 5, `ctx.settings`)
`get(key)`, `set(key,v)`, `on(key, fn)`, persisted in localStorage `synthwild.settings`. Keys:
`music, sfx, voice (0..1), muteAll, fullscreen, renderDistance (2..10), quality ('low'|'med'|'high'), fov,
sensitivity, invertY, view ('first'|'third'), uiScale, leftHanded, autoJump, aimAssist, highContrast,
noFallDamage, keepInventory, toolsNeverBreak, peaceful, alwaysDay, mobGrief, showFps, subtitles`.
Ease settings default ON for kids: autoJump, aimAssist (touch).

## Server (lane 6)
Go + SQLite (modernc.org/sqlite, CGO off), built on the box (amd64). The service is `synthwild` on
**127.0.0.1:8011**, with data in `/srv/data/synthwild/`. Public at **https://games.br8t.com/gms/3d/synthwild/**: the static
client goes to `/srv/apps/br8tgames/site/gms/3d/synthwild/`, and Caddy routes `/gms/3d/synthwild/api/*` → :8011.
The client calls the relative `api/…`. On GitHub Pages (no API) the game runs fully offline with local worlds.
- Admins: **aaron@br8t.com, dante@br8t.com, malaki@br8t.com** only. Admin sign-in = Google via the
  existing Firebase project `br8t-games` (`/lib/auth/config.js`; don't edit `/lib/auth/*`); the Go server verifies the
  Firebase ID token (RS256 against Google's securetoken certs, aud `br8t-games`, `email_verified`, email in the allowlist).
  Fallback: `synthwild admin-link <email>` CLI prints a one-time login URL.
- Admins can create/remove **usernames**. Anyone with a valid username logs in with just the username
  (no password) → session cookie. Admins also get a player username.
- Worlds: owner, name, seed, mode, public flag, blob (gzip of the world+player save), thumb, updated_at, version.
  Players see their own worlds and **all public worlds**. A non-owner opening a public world plays a copy
  ("Save a copy" to their own list).
