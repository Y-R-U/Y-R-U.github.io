# Codex Guide: Awake

Awake is a separate game from `gms/2d/codex_horror/`. Do not modify `codex_horror` when working on Awake unless the user explicitly asks for that project too.

## Current Scope

- Path: `/Users/aaronair/cc/yru/site/gms/2d/awake/`
- Placeholder title: `Awake`
- Version: `0.1`
- Goal: mobile-first sci-fi horror escape prototype testing room-to-hallway transition videos.
- Runtime style: vanilla HTML, CSS, and JS with no build step.

## Implemented Vertical Slice

- Intro screen with `caching_data` progress, background video preloading, and a slow transition slideshow.
- Randomized run shell:
  - location type: Space Biome, Space Station, or Mars Habitat
  - generated facility name like `Nargpalm Space Biome`
  - hidden player name revealed by scanning wrist band
  - hunter type: genetically created monster, alien infiltrator, or reanimated crew
  - difficulty-driven random turn limit
- One playable room type: `Suspension Room`.
- One shared `Central Hallway`.
- Transition debug panel for previewing generated videos and copying short file names.
- Goal list, inventory, story history, local save, settings panel, help panel, and minimap behavior.
- Desktop layout uses video left and details panel right; mobile layout overlays glass tags over the video.

## Media

Runtime assets:

- `images/suspension_room.jpg`
- `images/hallway.jpg`
- `videos/room_to_hallway.mp4`
- `videos/hallway_to_room.mp4`
- `music/theme1.mp3`

Ignored source assets:

- `original_files/suspension_room.png`
- `original_files/hallway.png`

The PNGs are Flux source outputs and should stay ignored. The JPGs are browser runtime assets.

## Generation Notes

Flux stills were generated locally through MFLUX using `gen_images.py`.

LTX transition videos were generated locally through `http://localhost:7866/api/generate`:

- `room_to_hallway.mp4`: 384x640, 121 frames, 24 FPS, 5.04 s, video-only, peak 15.77 GB, generation time 215.5 s.
- `hallway_to_room.mp4`: 384x640, 121 frames, 24 FPS, 5.04 s, video-only, peak 15.77 GB, generation time 229.7 s.

`room_to_hallway.mp4` is visually strong but not accurate as a hallway transition. Treat it as a candidate ending or room-event clip until replaced.

ACE-Step generated `music/theme1.mp3` as a 120 s instrumental sci-fi elevator background track with acoustic guitar, soft keys, sparse drums, and no vocals.

## Important Rules

- Do not use `alert`, `prompt`, or native `confirm`; use the overlay modal helpers.
- Keep the game mobile-first portrait, with desktop as a side-by-side adaptation.
- Keep `original_files/` untracked unless the user explicitly wants source assets committed.
- Project registry entry is in `/Users/aaronair/cc/yru/site/projects.js` with screenshot `assets/screenshots/awake.jpg`.
