# VOIDCAST — mobile-first 3D hole game with a viewership economy

`/gms/3d/voidcast/` · Three.js 0.160 via importmap · no build step · vanilla ES modules.

You are Unit 7, a clearance worker for the Vorr Guild. Your rig projects a
micro-black-hole onto a planet's surface and you eat the planet. The twist: the
aperture is master-controlled and its power is allocated by **audience**, so how
big you are allowed to get depends on how entertaining you are being.

---

## Run it / test it

```bash
cd ~/cc/yru/site && python3 -m http.server 8899
# then http://127.0.0.1:8899/gms/3d/voidcast/
```

URL flags (all combinable):

| flag | effect |
|------|--------|
| `?nosave` | never touch localStorage |
| `?auto` | autopilot drives the player rig |
| `?lite` | force the low quality preset |
| `?nocs` | skip cutscenes |
| `?level=N` | jump straight into story contract N (1–50) |
| `?mode=oneoff` / `?mode=event` | jump into that mode |
| `?shot` | disable the auto quality downgrade (for thumbnails) |

`window.__state` is a full read-only snapshot (mode, fps, run stats, rivals,
cutscene). `window.__game` exposes `startStory/startOneOff/startEvent/goHome/
playCutscene`, plus `grow(mass)`, `hype(h)`, `win()`, `lose()`.

**Headless testing:** `~/.claude/bin/cdp start --port 9223`, then drive it over a
raw CDP WebSocket from node (see `[[headless-chrome-cdp-testing]]`). Two caveats
learned the hard way:

- The software renderer runs at 8–25fps and `Run.update` clamps `dt` to 0.05, so
  **below 20fps the sim runs slower than wall-clock**. Always soak with `?lite`
  and read the `time` field from `__state`, never wall-clock elapsed.
- Screenshot-only checks miss the balance problems entirely. Sample `__state`
  on a timer instead.

---

## Architecture

```
index.html      all screens as static markup, hidden by class
style.css       one file, mobile-first, safe-area aware
js/
  config.js     EVERY tuning number. Read the comments before changing them.
  utils.js      rng, formatting, Grid (2D spatial hash), Pool
  palettes.js   5 act themes + 3 event-only skins + hole skins
  props.js      procedural model factory → merged vertex-coloured geometry
  world.js      Sector: ground, sky, roads, prop placement, InstancedMesh field
  hole.js       Hole entity + runCapture/updateSinking (shared by player+rivals)
  rivals.js     AI clearance workers with personalities
  hazards.js    turrets, shield pylons, purge drones
  game.js       Run — one broadcast. Economy, objectives, boons, camera.
  fx.js         particles, shockwaves, floating text, screen shake
  hud.js        in-run overlay, minimap, rival board, alien chat
  ui.js         all menus/modals. No three.js in here.
  cutscene.js   3D story director + the six scene scripts
  story.js      the 50-contract table
  upgrades.js   permanent tree (SUBS) + in-run boon pool
  events.js     date-derived limited-time contract rotation
  ranking.js    the fake-but-honest global ladder
  save.js       localStorage
  main.js       boot, renderer, screen flow, master loop, test hooks
```

### There is no art pipeline

Every object is built from primitives in `props.js` at level load: a builder
draws boxes/cylinders/spheres into two buckets (`solid` lit, `glow` unlit), they
are merged into two vertex-coloured `BufferGeometry`s, then normalised so the
footprint radius is exactly what the tier demands and the base sits on y=0.
Each (kind, variant) becomes an `InstancedMesh`, so a 1300-object sector is
~200 draw calls. Nothing is fetched; the repo ships no models or textures.

Adding a prop = write a builder in `BUILD`, add one row to `PROP_DEFS` with its
tier/weight/acts. Nothing else needs touching.

---

## The three curves that make the game work

These interlock. Changing one in isolation will break the run.

**1. Growth.** `r = R0 · (1 + mass/M0)^P` with `P = 0.26`. Each tier needs ~5.4×
the mass of the last while objects are only worth ~3.7× more, so objects-per-
tier-up climbs (10 → 15 → 25 → 36 → 53 → 75). That deliberately offsets how much
faster a big aperture hoovers. A higher `P` makes the mid-game explode; the
first build went tier 1 → tier 7 in 30 seconds.

**2. `TIER_VALUE` is not volume.** Higher tiers are rarer, so a purely
volumetric curve leaves too little total mass in the big objects and the run
dead-ends around tier 6 with nothing left it can eat. Each value is derived from
the mass gap it has to help close.

**3. Sector fill is budgeted by footprint AREA, not object count**
(`WORLD.COVERAGE`). A tier-7 tower covers ~130× the ground a pebble does. The
original count-based density asked for more towers than physically fit; they
failed placement and silently vanished, leaving late levels with *zero* tier-5/6/7
objects. Props are also placed biggest-first, and the radial "big things
downtown" bias is a gentle skew — confining towers to a small central disc was
what made them unplaceable in the first place.

`Sector` also clamps the play radius so `MAX_PROPS` can cover it at target
density. A sparse sector starves the hole and the audience walks out.

---

## The viewership economy

```
effMass = mass · (1 + hype · HYPE_MASS)      hype ∈ [0, 2.5]
viewers = effMass · PER_MASS
radius  = f(effMass)
```

Hype is pure upside — the radius floor is always your mass-only radius, so you
never shrink below what you have actually eaten. Hype decay is **proportional**
(`HYPE_DECAY + HYPE_DECAY_PROP · hype`): a small audience barely leaks, a huge
one haemorrhages the moment you slow down. A flat decay made early runs
unwinnable and late runs trivial.

Hype comes from swallowing (scaled by tier), chains, tier-ups, near misses, and
catching things that were running away. Go quiet past `IDLE_AFTER` and extra
drain kicks in — and chat starts telling you it is bored.

**Clearance % is footprint area, not mass**, and counts only what *you* ate —
anything a rival takes is subtracted. Story quotas are the authored figure ×0.82
to allow for the 15–25% rivals typically strip out from under you.

---

## Modes

- **Story** — 50 contracts, 5 acts of 10, table in `story.js`. Types:
  `clear` (untimed quota), `rush`, `rival` (out-clear every rival),
  `siege` (defence grid live), `boss` (swallow the act's landmark).
  Boss levels get a megastructure-heavy `mix` and only one rival — with the
  default mix and three rivals there is not enough left standing to reach tier 8.
- **Open Contract** — one 150s run, scored, feeds the ladder.
- **Events** — `events.js` rotates six contracts on a 3-day slot derived from a
  fixed epoch, so every device sees the same event with no server.

## The ladder

No backend. `rankForScore` is a fixed curve from 10,000,000,000 down, and the
neighbours either side are generated deterministically from your rank. The
position is honest (same score → same rank); the competitors are fiction.

## Roguelite layers

- **SUBS** buy the permanent tree in `upgrades.js` (`PERM`), kept forever.
- **Boons** are drafted mid-run when viewers cross a `BOON_STEPS` milestone and
  die with the broadcast. Some are pure `mods` multipliers; some set a `hook`
  flag that `Run.update` reads (`chain`, `adbreak`, `nova`, `frenzy`).

---

## Gotchas

- **The hole disc is bent to the dome every frame.** The ground is a curved
  disc (`domeY`), so a flat circle would sink into it at large radii. `curveTo`
  rewrites the disc/ring vertices in local space each frame. Never rotate those
  rings around Y — they are radially symmetric anyway, and spinning them would
  spin the baked curvature with them.
- Objects being swallowed sink *below* y=0 and are hidden by the ground's own
  depth, which is why the pit reads as a pit with no stencil work.
- `hazards` are **not** in `sector.props`, so the autopilot ignores them and
  they do not count toward clearance. They are destroyed by contact, not sunk.
- `PropField.hide` parks a dead instance at y=-9999 with zero scale; instance
  slots are never recycled.
- Low quality (`lowTex`) also halves building window rows — windows are the
  single biggest source of vertices in a sector.
