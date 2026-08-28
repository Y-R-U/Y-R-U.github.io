# SILT — module contracts

Frozen interfaces. Agents build to these and **must not change them**; if a
contract is wrong, say so in HANDOFF.md and the manager changes it once, centrally.

## File ownership (do not edit outside your lane)

| Lane | Owns |
|---|---|
| manager | `js/main.js`, `js/core/**`, `js/sim/{grid,step,clears,pieces,world,materials}.js`, `tools/**`, `docs/**`, git |
| A renderer | `js/gfx/**` |
| B shell/ui | `index.html`, `css/**`, `js/ui/**` |
| C modes | `js/modes/**`, `js/data/**` |
| D jelly | `js/sim/blobs.js`, `js/sim/reactions.js` |
| E audio | `js/audio/**`, `assets/audio/**` |

## Sim (built, stable)

```js
import { World, SIM_HZ } from './sim/world.js';           // SIM_HZ = 60
const w = new World({ seed, cols, rows, tints, mat, tintMode, diagonal,
                      fallRate, fallAccel, fallMax, reactions, shapes });
w.tick();                    // advance exactly 1/60 s
w.moveBy(dxGrains);          // relative horizontal nudge
w.rotate();                  // returns false if no kick fits
w.hardDrop();                // returns grains fallen
w.softDrop = true|false;
w.snapshot();                // flat JSON, what __state exposes
w.over, w.score, w.chains, w.combo, w.piece, w.nextPiece
```

`w.g` is the Grid — struct-of-arrays, all `Uint8Array(cols*rows)` unless noted:

```
g.cols g.rows g.n          112 x 224 = 25088 by default
g.mat[i]                   material id (see materials.js)
g.tint[i]                  colour index; 0 = untinted, 1..tints
g.flags[i]                 F_CLEARING=1  F_BURNING=2  F_BLOB=4  F_DIR=8
g.clearT[i]                dissolve countdown, DISSOLVE_TICKS..1, only when F_CLEARING
g.heat[i] g.life[i] g.blob[i]
g.count                    live non-empty cells (the mass ledger)
g.idx(x,y) g.inb(x,y) g.set(i,mat,tint) g.swap(a,b) g.touch(x,y)
```

**Anything that mutates a cell must go through `set`/`swap`** or the dirty-chunk
scheduler will not wake it and the sand freezes in mid-air.

Materials: `EMPTY WALL SAND WATER JELLY OIL LAVA ICE ASH CRYSTAL FIRE STEAM`,
plus flat lookups `KIND DENSITY SPREAD SLIP TINTABLE FLAMMABLE LIFE`.

## A — Renderer

```js
import { createRenderer } from './gfx/renderer.js';
const R = await createRenderer(canvas, { preserveDrawingBuffer, quality });
R.resize(cssW, cssH, dpr);
R.draw(world, { view, t, biome, shake }, alpha);   // called once per rAF
R.setBiome(name);
R.stats();        // { fps, gpuMs, gpuSupported, passes, tier }
R.dispose();
```

- WebGL2 only. **No CDN, no importmap, no dependencies.**
- **`opts.view` is REQUIRED.** The board rect is an INPUT, not something the
  renderer derives: use `opts.view.board` ({x,y,w,h} in css px) verbatim. It was
  computed twice once — here and in `js/core/viewport.js` — and the two disagreed
  by ~16px vertically, so touches landed off from what was drawn.
- Honour `?preserve=1` (needed for headless capture) and `?dpr=1`.
- Must render `world.piece` as an overlay — the falling piece is NOT in the grid.
  Enumerate it with `forEachCell(piece, (x,y,tint) => …)` from `sim/pieces.js`.
- Quality tiers `high` / `low`, auto-selected by an fps probe, overridable with `?q=`.

## B — Shell / UI

```js
import { createUI } from './ui/index.js';
const UI = createUI({ onStart(modeId, opts), onPause(), onResume(), onQuit() });
UI.show('attract'|'menu'|'hud'|'pause'|'results');
UI.setHud({ score, chains, combo, next, mode });
UI.results({ score, chains, best, mode });
```

DOM overlay only — the canvas is owned by the renderer. `#ui` is
`pointer-events:none`; individual controls opt back in.

## C — Modes

```js
export default {
  id: 'tide', name: 'TIDE', blurb: '…',
  worldCfg: { … },                 // merged over DEFAULT_CFG
  onStart(world, api) {},
  onTick(world, api) {},           // every sim tick
  onChain(world, api, cells) {},
  hud: ['score','chains','tide'],
};
```

`api` = `{ rng, biome(name), shake(amount), banner(text), setGravity(dx,dy) }`.
Modes must not reach into the renderer or the DOM.

## D — Jelly

```js
import { Blobs } from './sim/blobs.js';
const blobs = new Blobs(grid);
blobs.spawn(cells, tint);        // cells = [{x,y}], returns blobId
blobs.step(rng);                 // called from World.tick before step()
blobs.clearAll();
```

Jelly cells carry `F_BLOB` and `g.blob[i] = blobId`; the CA step already skips
them. Rasterise each blob back into the grid every tick so clear detection —
which runs on the plain grid — keeps working unchanged.

## E — Audio

```js
import { createAudio } from './audio/index.js';
const A = createAudio();
await A.unlock();                 // first gesture
A.music(trackId, { fade });       // loops
A.sfx('land'|'chain'|'dissolve'|'rotate'|'drop'|'fail');
A.duck(amount, ms);
A.setVolume(music, sfx);
```

Silent no-op until `unlock()`. Never throws — a missing file degrades to silence.

## Test hooks (manager owns, everyone relies on)

`?auto` bot plays · `?mode=` · `?seed=` · `?q=high|low` · `?preserve=1` · `?dpr=1`
`window.__state` (lazy getter, always fresh) · `window.__game`
Under `?auto` the account layer is never imported, so soak runs stay hermetic.
