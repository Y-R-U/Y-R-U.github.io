# UUID Worlds — Project Guide

Mobile-first three.js exploration sim. Every world is fully determined by a
32-char base-62 UUID; the loop is room → CONNECT → cinematic flythrough →
(interrupt / free-fly / drive) → descend into a building → the room again.
**Read GENOME.md first** — the char-position mapping is locked; never renumber.

## Architecture

```
js/prng.js      base62 + xmur3/sfc32 + labelled Rand streams + nextUuid chain   [three-free]
js/tables.js    all 62-entry content tables (people, quotes, facts, books…)     [three-free]
js/palettes.js  all 62-entry colour/param tables from authored archetypes       [three-free]
js/genome.js    decode(uuid) → spec, readout() for the connect overlay          [three-free]
js/canvastex.js seeded 2D canvas art: billboards, signs, posters, book, window
js/world.js     terrain/water/city/vehicles/landmarks/sky/precip + POIs + arrival
js/effects.js   hero (char 18) + ambient (char 19) effect implementations
js/flythrough.js seeded camera path; always ends at the arrival door
js/controls.js  FreeFly (1-finger look, 2-finger move; lookOnly mode for room)
                + DriveController (arcade car, chase cam)
js/room.js      the room + live terminal canvas (UV hit regions for taps)
js/ui.js        toasts/modals/overlay/joystick — styled popups, NEVER alert()
js/audio.js     seeded ambient pad + wind + procedural UI blips
js/main.js      state machine: room|entering|connecting|tour|free|drive|resuming|descend
```

The three-free core runs in node for determinism tests:
```bash
node --input-type=module -e "import('./js/genome.js').then(m => console.log(m.readout(m.decode('2J2k5wA46B008300024700020ER5uW9x'))))"
```
(tables assert length 62 at import — a miscounted table throws instantly.)

## Genesis

`2J2k5wA46B008300024700020ER5uW9x` — hand-picked traits (Ember Dusk, golden
hour, bay, Noir & Gold, aurora, lighthouse, Dario Amodei). Built as a
commented char array in main.js. Start uuid resolution: `?u=` param →
localStorage `uw-current` → genesis.

## Test hooks

- `?u=<uuid>` start at a specific world · `?fast=1` short fades/glides ·
  `?shot=1` skip room, frozen mid-tour frame (sets `window.__shotReady`)
- `window.__uw`: state, uuid, travel(u,mode), connect(), random(),
  interruptTour(), resumeTour(), driveNearest(), exitCar(), camera, free, G
- Headless: serve repo root (`python3 -m http.server 8765`), Chrome
  `--headless=new --remote-debugging-port=9222 --use-angle=swiftshader
  --enable-unsafe-swiftshader`, drive via raw CDP WebSocket from node
  (node ≥22 has global WebSocket; scratchpad cdp.mjs pattern). Screenshots
  alone miss interaction bugs — use Input.dispatchMouseEvent clicks.

## Gotchas learned building this

- `#fade` starts black in the HTML; every boot path must lift it.
- Palette hue-drift must be 0 for the first pass through an archetype table,
  or the curated names lie (bug found: room rendered pink).
- Flythrough control points get pushed above any building footprint they
  intersect (except the final door approach) — low styles otherwise fly
  *inside* towers (black screen + floating window quads).
- Sun elevation is capped (y ≤ 0.68) so noon still rakes the facades;
  a perfectly vertical sun leaves all walls unlit.
- Hemisphere light + fog colours are desaturated (lerp to white / s×0.65)
  or a saturated sky palette drenches the whole scene in one hue.
- Windows are ONE InstancedMesh of lit quads only (cap 2400); buildings are
  instanced buckets (box/cyl/cone) with vertex-colour vertical shading
  multiplied by per-instance colour. Cars: single merged geometry, one
  InstancedMesh, body tint via instanceColor over white vertex colours.
- Room screen taps: raycast → uv → canvas-pixel hit rects in
  `Room.screenAction`. Multi-tap counting (340 ms window) lives in main.js.
