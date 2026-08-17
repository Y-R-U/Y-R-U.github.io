# NEONHAUL — manager brief

Every agent on this project reads this file first. It is the source of the requirements.
It is **not** the plan — the plan is `docs/BUILD_PLAN.md`.

## What we are building

A mobile-first Three.js flying-delivery game set in a very large, very tall cyberpunk
megacity, shipped into the Y-R-U GitHub Pages site at `/gms/3d/neonhaul/`.

Aaron's brief, verbatim in substance:

> A cyberpunk city, mobile first. threejs web game. The city is very large and tall. But is in
> different variants of darkness — daytime should look interesting but still fairly dark, a tiny
> bit of daylight might sometimes get through some of the cloud/smog/between the buildings.
> Mostly dark atmosphere. This will make the neon lighting look great. So it isn't a dark *game*,
> but a dark *setting*, which also lets us improve performance. Buildings should be simple
> structures, glass/metallic. High contrast with neon means buildings can have less detail — but
> reflections will be good and important.
>
> Find tricks that make things look amazing for cheap. We don't need to render anything inside
> buildings; if warranted, use a texture or image for an interior. Most windows are non-see-through.

## Non-negotiables

**Look**
- Mostly-black frame. Every saturated colour in frame is a light source.
- Buildings are simple extruded/boxy masses in dark glass and dark metal. Detail comes from
  emissive window grids, signage, edge strips and reflections — never from polygon count.
- Reflections matter more than geometry. Wet ground, glass facades, vehicle bodywork.
- Daytime is a *variant of dark*: flat smog haze, drained sky, low contrast, an occasional
  light shaft between towers. Never a blue sky.
- Interiors are never modelled. Windows are opaque emissive or a cheap interior impostor.

**Signage — mostly English, a little real Japanese, plenty of abstract**

Aaron softened this after the first pass — do not overspend on it.

- The **majority of signage is English plus abstract glyph shapes / squiggles**. Abstract signage
  is the default and is perfectly acceptable; at distance and through fog it reads exactly as well
  as real text, which is where most signage lives anyway.
- **A modest set of real Japanese words** (kana/kanji) on top of that, *only because it is cheap*.
  Target roughly **8–15 tiles**, no more. Korean/Chinese optional in the same spirit.
- Keep any real foreign text **short and plain** — shop/brand words, floor numbers, "open",
  "noodles", "hotel", district names. No sentences. If a string's correctness is uncertain, use a
  simpler safer word or fall back to abstract.
- **Why this is cheap, and the rule that keeps it cheap:** signage is baked offline into a
  **texture atlas** by a script under `tools/`. Once that atlas exists, a tile costs the same
  whether it reads "NOODLES" or "ラーメン" — it is a few more tiles in a texture we are building
  regardless. What is *not* allowed is a **runtime CJK webfont**; those are megabytes and we are
  on GitHub Pages with a mobile budget. Generate glyphs at bake time using a system font.
- If real-script tiles turn out to cost meaningfully more than this, **cut them and ship all
  English plus abstract**. This is a nice-to-have, not a requirement.

**Performance — this is a mobile game first**
- Target 60 fps on a recent iPhone, 30 fps floor on a mid Android. Portrait AND landscape.
- Everything must survive a `?lite=1` quality tier (no bloom, no shadows, reduced draw distance).
- Instancing, atlasing and fog culling are the tools. Draw calls are the budget that matters.

**Controls — "flying should feel extremely easy"**
- Left half of screen: finger down = fly/move. Right half: finger down = look around.
- A settings option flips left/right.
- Finger off = auto-stop, quickly. No fighting inertia, no crashing into things as a fail state.
- Desktop keyboard/mouse fallback so it can be tested and played on a laptop.

**Gameplay**
- Neon transparent landing/pickup zones, colour-coded (blue/green/yellow/etc).
- Stop inside a zone → a sleek docking panel opens. This is the main UI of the game and it must
  look outstanding.
- The docking panel shows the client: a generated portrait still (local Flux) and a short
  low-res looping video (local LTX) — roughly 2 s of talking, then reverse-played, then looped.
- Accept deliveries / make deliveries. Payments and events surface as an overhead HUD toast
  system.
- Cockpit/vehicle interior looks great: simple window frame plus floating holographic HUD panels.
- A dashboard screen showing speed, current task, etc.
- An excellent minimap. Rear-view integration only if the rear view genuinely works and looks
  good — otherwise a standalone minimap.

**People — deliberately almost absent**

This is a beautiful transport game, not a character game. Aaron's call, and it is firm:

- **No character models anywhere in the 3D world.** No crowds, no pedestrians on walkways, no
  driver or passenger in the cabin, no figures on landing pads. Do not build a humanoid rig, do
  not import the PolyPerfect cast, do not plan around either.
- The **only** depiction of a person in the game is the client on the docking panel — a generated
  still portrait plus a short looping talking video. That is 2D media on a UI surface, never
  geometry in the scene.
- The one permitted exception in-world: **distant suggestions of figures only** — dark
  fabric/cloth silhouettes at long range, read as shapes in the fog, never approached, never
  detailed, never animated beyond a drift. Treat this as optional set dressing that must earn its
  place; if it does not read well at distance, cut it. Nothing up close, ever.
- People are present through **audio and the docking HUD** — radio chatter, dispatch voices,
  client dialogue on the panel. That is how the city feels inhabited. Spend the budget on light,
  reflection and atmosphere instead.

**Vehicles**
- All futuristic and sleek. Mostly black, metal and glass, some reflective surfaces.
- Variation between types is length / height / width only — the curve language is shared.
- Lights are shared across civilian types. Special vehicles (police etc.) are the exception.

**Audio**
- Vehicle sounds and effects: generated/synthesised by agents (Web Audio, or generated files).
- Music and radio chatter: Aaron generates these in SUNO AI later. **Everything must be built so
  those files can be dropped in at any time** — a manifest with named slots, graceful absence.
- Foreground radio chatter also appears as a popup HUD line, held on screen long enough for a
  slow reader.

## Repo conventions (hard rules)

- Repo: `~/cc/yru/site` → `git@github.com:Y-R-U/Y-R-U.github.io.git`, branch `main`, auto-deploys
  to GitHub Pages. Game lives at `site/gms/3d/neonhaul/`.
- No build step. Vanilla JS ES modules + a Three.js importmap from CDN, like the sibling games.
- **Never** `alert()` / `confirm()` / `prompt()`. All dialogs are styled in-game popups.
- Small, sensible JS files under `js/`. Not one giant file.
- **Other Claude sessions have uncommitted work in this repo.** Never `git add -A` and never
  `git commit -a`. Stage only paths under `gms/3d/neonhaul/` plus, at ship time, your own hunk of
  `projects.js` and your own `assets/screenshots/neonhaul.jpg`.
- Test with headless Chrome + CDP (see `~/.claude` memory `headless-chrome-cdp-testing`), not by
  eyeballing screenshots alone. Build `?shot=1`, `?lite=1`, `?auto=1` URL params in early.
- `--virtual-time-budget` does NOT advance a WebGL sim. Use real time.

## Reference art — the bar

`~/cc/yru/gms/3d/aaa_refs/cyber/` (outside `site/`, never committed, never shipped).

- `refs/raw/` — 153 official press plates
- `refs/board/` — the 16 curated, cropped scoring plates
- `plates.json` — crop rects and captions
- `cyber_reference_board.html` — the built board

The bar, in order of authority:

| Plate | Source | What it is for |
|---|---|---|
| `1939970_00` | Nobody Wants to Die | **The hero plate.** Sleek black flying car over a black city lit only by neon |
| `1939970_10` `_03` | Nobody Wants to Die | Canyon-down framing, traffic light streaks, wet night reflections |
| `1939970_04` | Nobody Wants to Die | Cockpit dash — warm instruments, dark cabin, city beyond glass |
| `746850_01` | Cloudpunk | **The performance proof.** Voxel geometry that reads as a megacity through fog + emissive windows + rain alone |
| `746850_00` `_03` `_08` | Cloudpunk | Aerial density, fog-layer depth |
| `746850_02` `_09` | Cloudpunk | Diegetic cockpit HUD and circular minimap |
| `1488490_00` `_08` `_10` | Nivalis Nights | Signage density, wet-street doubling |
| `1475810_04` | Ghostwire: Tokyo | Wet asphalt as a mirror |
| `979690_01` | The Ascent | Magenta/cyan grade at extreme density |
| `1091500_08` | Cyberpunk 2077 | **Daytime, still dark** — the day variant target |

## Blind critic protocol

Adapted from `~/cc/yru/gms/3d/aaa_refs/naval/CRITIC_PROTOCOL.md`. Read that file.

- A critic agent is handed a side-by-side sheet, sides randomised, and is **never** told which
  image is ours, which plate it is, or the repo path.
- Scored 0–10 per image on: Lighting, Materials, Composition, Atmosphere, VFX, Finish, plus an
  overall. Then a concrete differences list, each written as *what is wrong and what would fix it*.
- Gate: `ours_overall >= ref_overall - 2.0`.
- Grade per shot against one fixed plate. Never swap the plate between rounds.
- Calibration: every fourth round, put the same reference plate on both sides. If the two
  overalls differ by more than 1.0, or either scores below 8, void the round.
- Never tell a builder its own score before it has finished a pass.
- Log every round in `SCORES.md`.

## Local generation servers

Both are warm job queues that serialise themselves across sessions. Do not add a lock.

| | | |
|---|---|---|
| `http://localhost:7867` | mflux-queue | stills (txt2img and multi-ref edit) |
| `http://localhost:7866` | LTX | video |

`GET /api/status` · `POST /api/generate` → `{job_id}` · `GET /api/jobs/<id>` · `POST /admin/unload`.

**The download path differs between the two servers — this was wrong here and in `BUILD_PLAN` §9,
and it cost P9 a failed collect after all 16 clips had already rendered:**

| server | fetch the result from |
|---|---|
| mflux `:7867` | `GET /api/jobs/<id>/file/0` |
| **LTX `:7866`** | **`GET /api/jobs/<id>/file`** — 404s on `/file/0` |

Confirmed at `regen_helper.py:852`. **Standing pattern for any long batch: persist the job ids to
disk as soon as they are submitted, and resume from that file.** P9 did, so ~50 minutes of GPU was
not paid twice when the collect failed. Do this on every batch that takes longer than a few minutes.

**Flux and LTX cannot both hold a worker in 24 GB.** Before submitting stills, wait for LTX's
worker to drop (~120 s of queue idle). Reuse `wait_for_ltx_idle()` / `best_effort_unload()` from
`site/gms/2d/awake/regen_helper.py` rather than rewriting them.

## How this project is run

One agent at a time. The manager (main session) spawns a single agent, waits for it, reviews,
then spawns the next. The **only** time two agents run concurrently is when a blind critic runs
alongside a builder — the critic is cheap and read-only.

Aaron makes no gameplay calls until the game is playable and pushed. Until then the manager
decides. After it ships to Pages, everything is open to discussion.
