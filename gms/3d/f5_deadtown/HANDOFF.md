# HANDOFF — F5 Deadtown (read this first in a fresh session)

## What this is

`gms/3d/f5_deadtown/` in the Y-R-U repo (`~/cc/yru/site/`, GitHub Pages site) —
a **mobile-first 3D zombie survival game + full level editor**, built 2026-07-02
by Fable 5 as a data-driven rebuild of `gms/3d/deadtown`. Everything about the
world lives in **SQLite level documents**; the game and the editor are two
front-ends over the same DB, served by a **Go** server (Go chosen deliberately —
Aaron's production box br8t.com runs a Go backend; this may move there later).

**Status: working and shipped.** Game flow, editor round-trip, save/continue,
static fallback and the cinematic are all verified headless (see Testing).

## Run it

```sh
cd ~/cc/yru/site/gms/3d/f5_deadtown && ./run.sh     # go run (Go 1.26 via homebrew)
# game   → http://localhost:8901/        editor → http://localhost:8902/
# flags: -game-port -editor-port -db -root -reseed (re-import data/seed, keeps saves)
```
DB `data/deadtown.db` (gitignored) auto-seeds from `data/seed/*.level.json` +
`config.game.json` on first boot. **On GitHub Pages there is no server** — the
game auto-falls back to `data/snapshot/game.json` (committed; regenerate via the
editor's *publish* button = `POST /api/publish`) + localStorage saves.

## The game in one paragraph

Start menu → procedural TV-news cinematic (`js/cinematic.js`, canvas+WebAudio,
ends on "they're ZOMBIES—" → static → EBS card → title) → wake at **home**
unarmed (fists). Mission chain (config key `game`): check TV → **bat** in the
camping gear → outside to **Maple Street** → neighbour dialog → **axe** at
Hanson's Hardware → 10 kills → **pistol + 120×9mm** in the police cruiser →
**Old Highway** (night, brute, to-be-continued checkpoint). Weapon scarcity is
the design pillar: found weapons come with lots of ammo; zombies never drop
weapons, only ammo for guns you own / rare medkits.

## Architecture map

- `server/` Go: 2 ports, static files, REST (`/api/levels[/{id}[/versions|/restore]]`,
  `/api/versions/{vid}`, `/api/config/{key}`, `/api/saves/{slot}`, `/api/publish`, `/api/ping`).
- `js/` the game. Key modules: `data.js` (API↔snapshot fallback), `world.js`
  (`buildEnv` — per-level sky/fog/ground presets: dusk/overcast/night/interior),
  `level.js` (`buildLevel` — doc → objects/colliders/pickups/hotspot markers/
  spawn zones/**auto barrier ring** with gaps at exits; TVs get live static),
  `hotspots.js` (typed markers + dialog/note overlays), `missions.js`,
  `main.js` (boot/menu/cinematic/loop/level-swap/save). Reused from deadtown:
  rig (`hero.js`), arsenal (`weapons.js`, + `unarmed`), `zombies.js`, `aim.js`,
  `controls.js`, `fx.js`, `audio.js`, `ui.js`, `assets.js`.
- `editor/` SPA on :8902: `js/scene.js` (ortho top-down WYSIWYG w/ real models,
  P = 3D orbit), `js/main.js` (palette/inspector/level pane/undo-redo 100-deep/
  named versions/missions editor/validation/publish/save+play), `catalog.js`.
- Level doc schema + flag conventions (`hs_<lvl>_<uid>` fired, `pk_<lvl>_<uid>`
  taken): documented in `CLAUDE.md` here — the single reference for both apps.

## Hard-won gotchas (do not rediscover)

1. **PolyPerfect licence**: raw GLB/PNG never committed. `assets/pack.dat` is
   the obfuscated pack (XOR+gzip, key in `js/assets.js` = `tools/build_pack.py`).
   Add models by editing `MODELS` in build_pack.py (reads local gallery cache).
2. Interiors carry ALL their own light now (old deadtown's interiors were
   secretly lit by the town hemi light) — interior preset in `world.js` runs a
   hot hemi (1.35) + centre lamp (2.4); don't dim without checking screenshots.
3. `cam` presets are `outdoor`/`interior` (renamed from deadtown's `town`).
4. Hotspot `trigger` type is invisible in game, visible in the editor
   (`makeHotspotMarker(h, fired, editorMode)`).
5. Arriving through an exit spawns at the TARGET hotspot nudged 2 m toward
   level centre — exits must sit inside bounds.
6. Headless testing: `window.__game.doInteract()` returns a promise that only
   resolves when the dialog closes — fire-and-forget it in page.evaluate.
7. The Go server binds 0.0.0.0 → playable from a phone on LAN.

## Testing recipe

Headless Chrome + puppeteer-core (`--use-angle=swiftshader
--enable-unsafe-swiftshader`); poll `window.__state`
(level/weapons/flags/mission/api/errors), drive `window.__game`
(player, gotoLevel, doInteract); editor exposes `window.__ed`
(doc/dirty/sel/placeAt/saveLevel/api). URL modes: `?level=<id>` (skip
menu+cine), `?cine`, `?nosave`, `?shot`, `?lite`, `?auto`, `?wpose`.
Verified E2E: home→TV dialog→bat→street1 exit; editor place/undo/save/version;
save→DB→Continue; static fallback via `python3 -m http.server` from site root.

## Obvious next steps (none started)

Survivor NPCs as a placeable editor type (`js/survivors.js` already copied) ·
zombie pathing (A*) · map 3 behind the highway checkpoint · marquee
multi-select + road drag-handles in the editor · ACE-Step soundtrack ·
deploy server to br8t.com (single Go module, sqlite file — should just build).
