# SUNDERFALL — 2D scrolling roguelite platformer

Independent build. **Do not copy code from other games in this repo** — nothing here is shared with
paperant / cryodrift / crazyspace / racketeer or anything else. Vanilla JS, no build step.

## Read these first, in this order

0. **`NEXT-SESSION.md`** — if you are resuming, start here. Resume brief, agent status, priority
   queue, and the traps that will otherwise cost you an hour each.
1. **`ARCHITECTURE.md`** — the frozen technical contract. Engine API, layers, materials, spell
   interface, scene machine, performance budget. Agents build to it and must not change it.
2. **`DESIGN.md`** — the content spec. 18 spells, progression, 9 enemies, the four-movement level,
   controls for both orientations.
3. **`HANDOFF.md`** — append-only log. Every agent writes a section before it stops; agents are not
   resumable, so this is the only thing that survives them. **The most current truth is here**, not
   in the two docs above.

Art direction is **painterly, not pixel art** — Flux-generated painted parallax, with characters and
FX drawn procedurally in code so they can be lit dynamically. Reasoning is in `HANDOFF.md`.

## Tools

- `art/tools/flux.py` — local Flux image generation (mflux-queue on `127.0.0.1:7867`, ~36s at
  1024×576). The queue serialises jobs itself; never invent a lock.
- `tools/shot.mjs` — headless-Chrome screenshots over raw CDP. Handles true narrow viewports via
  `Emulation.setDeviceMetricsOverride`, which the Chrome CLI cannot (it clamps to 500px min width).
  `node tools/shot.mjs --url … --out dir --size 390x844 --size 1440x900 --at 0,4,9 --console`
- `tools/blind.mjs` — stages a blind A/B pair for a critic agent, side randomised, key withheld.
- `tools/critic-brief.md` — the standing hostile-art-director brief for critic agents.

## Layout

```
gms/2d/sunderfall/
  index.html        art reference lab (the page you open while working)
  lab.css lab.js    the lab
  game/index.html   the game — placeholder for now
  refs/
    manifest.json   the curated reference list the lab renders
    levels/         AAA scene references (Steam press screenshots)  [gitignored]
    sprites/        real spritesheets (CC0/CC-BY) + animation previews
    ours/           OUR versions go here — see below
    fetch_steam.py  re-pull Steam screenshots
    fetch_itch.py   re-pull itch.io CDN preview images
    assemble.py     curate _cand/_oga into refs/ + write manifest.json
    make_contact.py contact sheets for eyeballing raw candidates
    _cand/ _oga/ _sheets/   raw downloads + working files  [gitignored]
```

Served locally at **http://localhost:8888/gms/2d/sunderfall/**
(`python3 -m http.server 8888 --directory ~/cc/yru/site`, already running).

## The comparison loop

Every reference in `refs/manifest.json` renders as a pair: reference on the left, an empty slot on
the right. To fill a slot, save our version as `refs/ours/<same filename as the reference>` — the lab
probes for it on load and swaps the placeholder out automatically. No manifest edit needed.

- **Blind test** button strips every label and randomises which side of each pair the reference is
  on, so a verdict can't be biased by knowing which is which. Use it before declaring anything good.
- **Pixel view** toggles nearest-neighbour scaling.
- Clicking any image opens a lightbox with 1× / 2× / 4× zoom — that's how you read a spritesheet's
  cell grid.

## Licensing / what ships

`refs/levels/` is third-party press screenshots — local style study only, never committed, never
shipped. `refs/sprites/` holds CC0 and CC-BY sheets (credited per card) plus itch.io preview GIFs;
these are reference too. **No third-party art goes into the game.** `.gitignore` already excludes
the heavy and non-redistributable folders.

## Art direction targets (from the reference set)

- Three clear depth bands minimum; foreground occluders near-black.
- One warm light source per scene, everything else cool — Dead Cells / Blasphemous II discipline.
- Silhouette-first characters: an action must read at 25% size with no colour.
- Low frame counts per action (6–10), with a held impact frame. Readability over smoothness.
- Destruction is the signature mechanic — see the Destructibles section of the lab for the
  intact → cracked → shattering → debris → settled chain every breakable needs.

## Status

- 2026-08-08 — reference lab built, 41 scene refs + 29 sheet/animation refs curated. Game not started.
