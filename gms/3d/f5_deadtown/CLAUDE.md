# F5 Deadtown — data-driven zombie survival + full level editor

A rebuild of `gms/3d/deadtown` (Fable 5, 2026-07-02) around a **database-driven
level system**: the game and a **full level editor** share one SQLite DB through
a small **Go** server (the target production stack — br8t.com — runs Go). The
game itself keeps deadtown's proven mobile-first bones: Diablo/RuneScape camera,
floating joystick, auto-aim laser, rigged PolyPerfect zombies. No build step for
the front-ends; Three.js 0.160 via CDN importmap.

## Design pillars

1. **Scarcity, not arsenal.** You wake up with NOTHING (bare fists, dmg 3–6).
   Map 1 contains exactly three weapons — the **baseball bat** in your camping
   gear at home, the **fire axe** behind the register at Hanson's Hardware, and
   the **pistol** in the wrecked police cruiser. When you DO find a weapon it
   comes with plenty of ammo (the pistol grants 120×9mm). Zombies never drop
   weapons; they rarely drop ammo (only kinds you own a gun for) or a medkit.
2. **Everything is a level.** Interiors and streets are the same thing: a level
   document with bounds, objects, hotspots, spawns. Level ⇄ level travel is only
   possible through **exit hotspots**; the bounds are sealed by an auto-built
   barrier ring (visible barricades outdoors, low walls indoors) + hard clamp.
3. **The editor is a first-class product.** Anything the game reads, the editor
   can author — objects, pickups, typed hotspots (with dialog), spawn zones,
   bounds, roads, env, missions — with undo/redo and named level versions.

## Run it

```sh
cd gms/3d/f5_deadtown && ./run.sh     # or: cd server && go run .
# game    → http://localhost:8901/
# editor  → http://localhost:8902/  (redirects to /editor/)
```
The Go server serves this folder on both ports and exposes `/api/*` (same API
on both). DB at `data/deadtown.db` (gitignored), seeded on first run from
`data/seed/*.level.json` + `data/seed/config.game.json`. `-reseed` re-imports
seeds (keeps player saves). **Static fallback:** on GitHub Pages there is no
API — the game then loads `data/snapshot/game.json` (written by the editor's
Publish button → `POST /api/publish`) and saves to localStorage.

## The story open (cinematic.js)

Boot → start menu → **New Game** plays a fully procedural TV news cinematic
(canvas-drawn, WebAudio-synth voices/sirens/EBS tones, tap-to-skip): GNN studio
→ "Grey Flu" breaking news → field report outside St. Mary's, sirens, runners →
rattled anchor: officials refuse to say the word → feed glitches — "they're
DEAD, Tom, they're zom—" → hard cut to static → black → Emergency Broadcast
card → **DEADTOWN** title → you wake at home. The home TV then loops static
(in-world canvas texture, same trick as deadtown's intro).

## Level document (the one schema both apps speak)

```jsonc
{
  "id": "street1", "name": "Maple Street", "kind": "outdoor",   // or "interior"
  "bounds": { "hx": 52, "hz": 52 },
  "env": { "preset": "dusk",          // dusk | overcast | night | interior
           "floor": "street",         // street | grass | dirt | wood | tile | concrete
           "floorColor": null, "dayCycle": true, "wallH": 0.55 },
  "roads": { "vert": [0], "horiz": [-20, 20], "half": 4.6, "sidewalk": 1.8 },
  "playerStart": { "x": 0, "z": 30, "yaw": 3.14 },
  "objects":  [{ "uid":"o1", "model":"bld_family_a", "x":0,"z":40,"y":0,"rot":3.14,"scale":1,
                 "collide": {"type":"box","hx":6,"hz":5},        // box|circle{r}|none
                 "label":"Home" }],                              // labelled boxes → minimap
  "pickups":  [{ "uid":"p1", "kind":"weapon|ammo|medkit", "item":"pistol",
                 "ammo":"9mm", "n":30, "x":3, "z":5 }],
  "spawns":   [{ "uid":"s1", "x":20,"z":-10,"r":14, "types":["walker","woman"],
                 "count":6, "maxAlive":10, "respawn":true, "rate":4 }],
  "hotspots": [ /* uid, type, x, z, r, label + per-type fields, all optional:
       once:bool  requires:"flag"  sets:"flag"
       exit:    target:{level,hotspot}, lockedMsg (shown when `requires` unmet)
       dialog:  lines:[{speaker,text}]
       item:    text, gives:[{kind:"weapon|ammo|medkit", item, ammo, n}]
       note:    text
       trigger: event:"wave", params:{count,types,r}   (fires on ENTER, no Use) */ ],
  "ambient": { "maxAlive": 12, "types": ["walker","woman"], "rate": 5, "growth": true } // or null
}
```

Mission chain lives in config key `game`
(`{ startLevel, title, missions: [{id,title,hint,type,...,reward}] }`);
mission types: `flag` (set by hotspots' `sets`), `weapon` (own weapon id),
`kills` (total ≥ n), `level` (visited level id). Rewards: `{medkit,n}` /
`{ammo,kind,n}`. Progress/flags/fired-hotspots/taken-pickups persist in the
save (API slot `main`, localStorage fallback).

## Map 1 flow (seed content)

home (interior; TV dialog `saw_tv` → camping gear **bat** `got_bat` → front
door *requires* `got_bat`) → **Maple Street** (boarded-window neighbour points
at the hardware store; wrecked **police cruiser** hotspot → pistol + 120×9mm
`got_pistol`) → **Hanson's Hardware** (interior; register hotspot → **axe**) →
highway on-ramp exit (*requires* `got_pistol`) → **Old Highway** (denser horde,
runners/brute; chained checkpoint gate = to-be-continued stub).

## Architecture

```
server/            Go 1.26 (modernc.org/sqlite): 2 ports, static + REST, seeding, publish
data/seed/         committed level/config seeds  data/snapshot/game.json  published static copy
index.html js/     the game                      editor/                  the editor SPA
assets/pack.dat    obfuscated PolyPerfect pack (NEVER commit raw GLB/PNG — see below)
```

REST: `GET/POST /api/levels`, `GET/PUT/DELETE /api/levels/{id}`,
`GET/POST /api/levels/{id}/versions`, `POST /api/levels/{id}/restore`,
`GET/DELETE /api/versions/{vid}`, `GET/PUT /api/config/{key}`,
`GET/PUT/DELETE /api/saves/{slot}`, `POST /api/publish`, `GET /api/ping`.

### Game modules (js/)

Kept from deadtown nearly verbatim: `assets.js` (pack decode; paths now via
`import.meta.url` so the editor can share it), `hero.js` (buildRig — bones in
body space), `weapons.js` (+ `unarmed` fists entry; `startWeapon='unarmed'`),
`aim.js`, `controls.js`, `zombies.js`, `fx.js`, `audio.js`, `utils.js`,
`ui.js`, `player.js` (starts unarmed, 0 ammo; spawn from level doc).
New/rewritten: `data.js` (API client + snapshot/localStorage fallback),
`world.js` (per-level env/ground from `env`+`roads`), `level.js` (build a level
doc → scene: objects/colliders/pickups/hotspot markers/barrier ring/minimap
data; full dispose for swaps), `hotspots.js` (typed marker visuals + interact/
enter logic + dialog overlay), `missions.js` (data-driven chain), `cinematic.js`
(the TV open), `menu.js` (start menu), `main.js` (boot/loop/level swap/save).

### Editor (editor/, served on :8902)

Three.js **orthographic top-down** WYSIWYG view using the real asset pack.
`catalog.js` = curated palette (category, model, default collider/scale).
Tools: select/move (drag), place, duplicate (⌘D), delete, R/⇧R rotate ±15°,
`[`/`]` scale, arrows nudge, G snap toggle (0.5 m), wheel zoom-to-cursor,
space/MMB pan, P perspective preview orbit. Panels: palette · inspector
(per-type fields incl. dialog line list + exit target pickers populated from
the API) · level list · level settings (bounds/env/roads/ambient) · missions
editor · versions (save named version / restore / delete) · validation.
Undo/redo = full-doc snapshot stack (⌘Z/⇧⌘Z, 100 deep). Save = PUT (⌘S,
dirty-dot, beforeunload guard). Test-play button = save + open
`:8901/?level=<id>&nosave`. **Popups are custom modals — never alert().**

## Asset protection (unchanged contract from deadtown)

PolyPerfect "Low Poly Ultimate Pack" is commercial: **no raw GLB/PNG in the
repo, ever**. `assets/pack.dat` + `pack.index.json` copied from deadtown
(same XOR(gzip)/fnv1a scheme, KEY `deadtown-lpup-9Xv!aron-2026` in
`js/assets.js` = `tools/build_pack.py`). To add models: edit `MODELS` in
`tools/build_pack.py`, run it (reads the local-only gallery cache), commit only
the regenerated pack. Rigged zombies/hero load raw from the pack (`RIGS`);
statics re-skin onto the shared gradient/specular atlas material.

## Testing

Headless Chrome + puppeteer-core (`--use-angle=swiftshader
--enable-unsafe-swiftshader`). Start the Go server, load
`:8901/?level=street1&nosave`. Poll `window.__state` (fps/pos/hp/weapon/level/
zombies/kills/errors), drive `window.__game` (player, zombies, gotoLevel,
doInteract…). Headless rAF ≈20 fps + the 0.05 s dt clamp dilates sim time —
use real waits. Editor smoke-test: load `:8902/editor/`, poll `window.__ed`.
URL modes: `?level=<id>` skip menu+cinematic · `?cine` straight to cinematic ·
`?nosave` · `?shot` · `?lite` · `?auto` soak.

## ROADMAP

- Survivors/NPCs as a placeable editor object type (module already copied).
- Editor: marquee multi-select, road drag-handles, two-way exit auto-pairing,
  model thumbnails in the palette.
- Zombie pathing (grid A*), crawler/screamer types, bosses.
- Map 3 behind the highway checkpoint; safehouse + stash between runs.
- ACE-Step soundtrack; more cinematics between maps.
