# Using The Glade as a game template

The Glade is a demo/testing ground, but it's structured to be copied as the
starting point for a real game. Here's how.

## 1. Copy it

```bash
cp -r gms/3d/fable5_glade gms/3d/<your-game>
cd gms/3d/<your-game>
```

Then:
- Edit the `<title>` in `index.html`.
- Add an entry to `/projects.js` (`type: "game"`, `path: "/gms/3d/<your-game>/"`,
  `screenshot: "<your-game>"`) and drop a 1280×800 jpg in `/assets/screenshots/`
  (load the game with `?shot=1` and screenshot it).
- Rewrite `CLAUDE.md` as you go — it's the working doc future sessions read.

No build step, no dependencies to install: three.js comes from the CDN
importmap in `index.html`. It runs from any static file server
(`python3 -m http.server` locally, GitHub Pages in production).

## 2. Know the four contracts

Everything in the demo hangs off four small conventions. Keep these and you
can swap out everything else freely.

**Object builders** (`props.js`, `combat.js`): every visible thing is a
`makeX()` function that takes no scene references and returns a `THREE.Group`
with its origin at ground level, +z facing forward. Built from primitives +
`<canvas>` textures. Budget guide: hero ~2k tris, props ≤1.5k.

**The registry** (`registry.js`): everything visible calls `register({ name,
category, icon, object, collider, pickup, note })`. This one call gives you
the debug panel row, collision (`collider: {r}` dynamic / `{points:[...]}`
static / `null`), and pickup collection (`pickup: {kind}`). If you add a
thing and it doesn't collide or show in 🐞, you forgot to register it.

**The rig contract** (`entities.js`, `heroine.js`, `heroes.js`): a character
is `{ group, parts: {lLeg, rLeg, lArm, rArm, head, torso, elbowL?, elbowR?},
animate(t, walk) → bob }`. Any model that returns this shape can be a hero —
`attachCombat(rig, opts)` bolts the full weapon/animation system onto it
unchanged. `opts` is just where the hand and back attachment points are.

**The terrain function** (`world.js`): `groundHeight(x, z)` is the single
source of truth for height. Every character and prop sits on it; flat spots
for buildings are declared in `SITES` (`config.js`). Change the meadow by
changing this one function.

## 3. Replace the demo content

| Demo thing | Where | What to do for a real game |
|---|---|---|
| Circular meadow | `world.js` | Replace `groundHeight` + the disc mesh with your terrain; keep the function signature |
| Chickens | `entities.js` | The chicken object is a complete enemy: HP, states (wander/flee/dying/dead/respawn), health bar, hit reactions, tap-target proxy. Copy it as `createEnemy()` and reskin the mesh |
| Heroes 1–4 | `heroes.js` etc. | Keep your favourite rig, delete the rest, or move to one rig with outfit/material swaps |
| Pickups | `props.js` + `ui.js` `KINDS` | Add a kind in both places; place with `placePickup()` |
| Attack styles | `combat.js` + `ui.js` `STYLES` | Each style is: a weapon builder, a back/hand visibility rule, an attack-curve branch in `tickCombat`, a range in `config.js`, and (if ranged) a projectile in `fx.js` |
| Debug panel | `debug.js` | Keep it — it's free QA. Ship with the 🐞 button hidden if you like |

What's already game-ready and worth keeping as-is: tap/drag/pinch controls
with the fat-finger raycast (`controls.js`), camera follow, circle collision,
hit splats/health bars/projectiles (`fx.js`), toasts + inventory popup
(`ui.js`, popups never `alert()`), the `?shot`/`?lite`/`?auto` URL modes, and
the `window.__state`/`window.__game` test hooks.

## 4. What the demo deliberately doesn't solve

Budget for these when going real:
- **Pathfinding** — there is none; the pen-gate waypoint is a hack. A real
  map needs navmesh or grid A*.
- **Save/load** — no persistence; yru convention is `localStorage`.
- **Player damage** — enemies never fight back; potions/mana are counters
  only, there's no player HP/MP pool to spend them on.
- **Audio** — only procedural chimes (`utils.js`).
- **Proper attack-style icons** — the demo uses one attack per style;
  a real game wants ability slots (quick spells etc.) per style.
- **Line of sight** — ranged attacks shoot through obstacles.

## 5. Test loop

Headless Chrome + puppeteer-core (scripts in `/tmp/pup/` during sessions):

```bash
python3 -m http.server 8765   # from the site root
```

- visual: load page, position `__game.controls.state` (yaw/pitch/dist),
  screenshot, look at it, fix, repeat — this catches what code review can't
- functional: drive `window.__game` (player, chickens, setHero, setStyle,
  `controls._raycastTap`), assert on `window.__state`, `window.__errors`
- soak: `?auto=1` self-plays (move/collect/attack with random styles);
  run 30s+, require `__errors` empty
- flags: `--use-angle=swiftshader --enable-unsafe-swiftshader`; note headless
  low fps + the 0.05s dt clamp dilate sim time vs wall time
