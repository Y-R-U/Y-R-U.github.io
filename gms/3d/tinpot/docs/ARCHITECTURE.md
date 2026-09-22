# TINPOT — code layout and conventions

Read `BRIEF.md` first for what the game is. This file is where things go and why.

## Hard rules

1. **Nothing is written outside `gms/3d/tinpot/`.** The only exception is one `projects.js`
   entry, added by hand at ship time by whoever ships it — never by an agent mid-build.
2. **No git operations at all.** Other sessions have uncommitted work in `games/`, `index.html`
   and `lib/auth/`. Never `git add -A`, never commit, never stash, never rebase.
3. **Three.js is vendored and shared, never a CDN.** A CDN `three` import hangs the whole game on
   its loading screen with no error at all — this has cost real days in this repo. The importmap
   is exactly:
   ```html
   <script type="importmap">
   { "imports": {
     "three": "../../lib/three/0.180.0/three.module.js",
     "three/addons/": "../../lib/three/0.180.0/addons/"
   } }
   </script>
   ```
   Available addons: `postprocessing/{EffectComposer,RenderPass,ShaderPass,UnrealBloomPass,Pass,MaskPass}.js`,
   `shaders/{CopyShader,LuminosityHighPassShader}.js`, `environments/RoomEnvironment.js`. That is
   the whole list. Anything else must be written by hand in this folder.
4. **No build step, no npm install, no dependencies.** Plain ES modules served as files.
5. **An inline boot watchdog runs before any module loads.** A `<script type="module">` that
   fails to resolve fires a non-`Error` event and then nothing happens forever. Copy the pattern
   from `gms/3d/neonhaul/index.html` (search `BOOT_MS`): it converts a silent permanent hang into
   a readable panel with a reload button, and it must live inline in `index.html` so it cannot be
   taken down by the thing it is watching.
6. **`js/core/*.mjs` imports nothing from `three` and nothing from the DOM.** That is what makes
   the Node harness able to run the real production simulation. If a core module needs a vector,
   it uses plain `{x, z}` objects or flat arrays.

## Layout

```
gms/3d/tinpot/
  index.html          entry; importmap, inline boot watchdog, HUD skeleton
  style.css           all CSS; portrait-first, safe-area aware

  js/
    main.mjs          boot, the frame loop, wiring between sim / render / ui
    version.mjs       THE build number. One string. Shown on the title screen and on
                      `window.tinpot.version`; bump it here and nowhere else.

    core/             PURE. No three, no DOM, no window. Node imports these directly.
      rng.mjs         seeded deterministic RNG (missions are reproducible)
      grid.mjs        walkability field + flow-field pathing; rebuilt when terrain changes
      forestSim.mjs   tree HP, felling, and fire spread (cell automaton, wind, burn-out)
      combat.mjs      ranges, cadence, accuracy, damage, armour, projectile flight
      units.mjs       one soldier's state machine: idle / walk / engage / dead
      ai.mjs          enemy behaviour: patrol, alert, advance, take cover, panic
      mission.mjs     objective state machine, win/lose, spawn waves, timers
      roster.mjs      persistent men: names, veterancy, promotion, permadeath
      economy.mjs     currency, upgrade catalogue, purchase/unlock rules
      world.mjs       the tick: owns everything above, advances one fixed step
      save.mjs        schema + migration for the save blob (pure; storage is platform/)

    data/             PLAIN DATA ONLY. No logic. Tunable without reading code.
      weapons.mjs     rifle, grenade, and the ones that come later
      soldiers.mjs    unit classes, base stats, armour tiers
      upgrades.mjs    the shop catalogue and its unlock gates
      missions.mjs    the campaign list: which map, which state, objective, reward
      maps/
        clearing.mjs  map 1 — forest clearing, the long grass corridor
        ravine.mjs    map 2

    render/           Everything that touches three.
      scene.mjs       renderer, camera rig, lights, shadows, bloom composer
      terrain.mjs     ground mesh, grass, scorch + blood decal atlas
      forest.mjs      InstancedMesh canopy; fells and burns in response to forestSim
      actors.mjs      procedural soldier meshes + procedural walk/aim/death animation
      vfx.mjs         muzzle flash, tracers, explosions, fire, smoke, claret
      cameraRig.mjs   framing, follow, shake, the title-screen fly-around

    ui/               DOM. Never reaches into render/ or core/ state directly.
      hud.mjs         unit cards, weapon rail, objective banner, pause
      screens.mjs     title, briefing, upgrade/barracks, debrief
      attract.mjs     the autoplaying demo behind the title screen

    platform/         The only place that touches browser APIs directly.
      input.mjs       pointer/touch → intents; no game logic
      audio.mjs       music bed + sfx; tracks listed in audio/music/tracks.json
      storage.mjs     localStorage wrapper (key prefix `tinpot.`)

  audio/music/        soundtrack (already present — see tracks.json)
  audio/sfx/          generated or procedural sfx

  tools/
    cdp.mjs           raw Chrome DevTools Protocol client (copy sunwake's)
    browser.mjs       headless screenshot + real-touch interaction suite. The suite name is a
                      POSITIONAL argument: shell m2..m8 art v1 v3 v4 v6 teach
    sim.mjs           headless balance harness — runs core/world.mjs with no browser
    campaign.mjs      plays the whole campaign headlessly; the two-second balance loop
    release.mjs       the ship gate: every mission by touch at 320/390/430, zero errors
    artgate.py        mechanical art gate, pure stdlib. Do not edit its thresholds.

  docs/
    BRIEF.md          what the game is
    ARCHITECTURE.md   this file
    PLAN.md           the checklist — THE source of truth for what is done
    STATE.md          living log: what just happened, what is next, what is broken
    VERIFY.md         evidence for each milestone
    evidence/         screenshots and harness JSON
```

## The one architectural rule that matters

`core/world.mjs` advances the entire game with a fixed timestep and **no renderer present**.
`tools/sim.mjs` imports it and plays whole missions in Node in milliseconds. Balance is tuned
there, not in the browser — this has been worth more than any other single decision on the last
six games in this repo. If a mechanic cannot be exercised headlessly, that is a design smell in
the mechanic.

The renderer *observes*: each frame it reads world state and reconciles its meshes to it. It
never owns a fact the sim needs.

## Camera

Perspective camera, narrow FOV (~26°), high up, pitched **~16° off straight down**. Near-ortho
parallax: you read the battlefield as a plan, but tree canopies and helmets have visible sides
and the shadows give everything a footprint. Portrait framing shows roughly 26 m across and 55 m
along the play corridor. Soldiers are ~1.8 m tall and therefore small — the helmet is the
readable part, so the helmet gets the rim light and the team colour.

## Testing

A static server already serves the repo root at `http://127.0.0.1:8888`. **Do not restart it and
do not serve this folder alone.** The game is at
`http://127.0.0.1:8888/gms/3d/tinpot/`.

```sh
node tools/sim.mjs                       # headless balance + determinism
node tools/campaign.mjs                  # plays all six missions with no browser at all
~/.claude/bin/cdp start --port 9223 -- --use-angle=metal
node tools/browser.mjs teach             # screenshots + real CDP touch; SUITE IS POSITIONAL
node tools/release.mjs                   # the whole campaign by touch at three phone widths
python3 tools/artgate.py docs/evidence/m1b-portrait.png
```

Two traps that have each cost a session:

* **`--use-angle=metal` is not optional.** The `cdp` launcher hardcodes swiftshader, which
  software-renders this game at ~9 fps and makes every timing-based gate flaky.
* **The suite is a positional argument.** `node tools/browser.mjs v1`. Passing `--suite v1`
  silently runs only the generic boot scenario and prints PASS.

Keep the cdp launcher and the browser run in **one shell execution** separated by a newline —
child-process cleanup otherwise kills Chrome between calls. Disable cache in the driver before
navigating: a page query string does **not** bust a stale ES module, and stale modules have
repeatedly hidden an agent's own edits in this repo.

Screenshots are not optional. On six occasions in this repo a green numeric suite sat happily
alongside an obvious visual bug filling every frame. **Look at the frame.**
