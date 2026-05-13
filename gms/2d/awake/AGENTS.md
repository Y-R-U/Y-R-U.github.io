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
- Playable room feeds: `cryo_room`, `med_bay`, `hydroponic_biome`, and `reactor_gallery`.
- One shared `Central Hallway`.
- Transition debug panel for previewing generated videos and copying short file names.
- Optional localhost-only regen helper: run `python3 regen_helper.py` from the Awake folder, then the debug panel can queue replacement transition renders.
- Goal list, inventory, story history, local save, settings panel, help panel, and minimap behavior.
- Desktop layout uses video left and details panel right; mobile layout overlays glass tags over the video.

## Media

Runtime assets:

- `images/hallway.jpg`
- `images/cryo_room.jpg`
- `images/med_bay.jpg`
- `images/hydroponic_biome.jpg`
- `images/reactor_gallery.jpg`
- `videos/*_to_hallway.mp4`
- `videos/hallway_to_*.mp4`
- `videos/cryo_room_event_collapse.mp4`
- `music/theme1.mp3`

Ignored source assets:

- `original_files/suspension_room.png`
- `original_files/cryo_room.png`
- `original_files/med_bay.png`
- `original_files/hydroponic_biome.png`
- `original_files/reactor_gallery.png`
- `original_files/hallway.png`

The PNGs are Flux source outputs and should stay ignored. The JPGs are browser runtime assets.

## Generation Notes

Flux stills were generated locally through MFLUX using `gen_images.py`.

LTX transition videos were generated locally through `http://localhost:7866/api/generate`:

- New review transitions are 384x640, 73 frames, 24 FPS, about 3.04 s, video-only.
- `cryo_room_event_collapse.mp4`: former `room_to_hallway.mp4`; 384x640, 121 frames, 24 FPS, 5.04 s, video-only, peak 15.77 GB, generation time 215.5 s.
- `hallway_to_cryo_room.mp4`: former `hallway_to_room.mp4`; 384x640, 121 frames, 24 FPS, 5.04 s, video-only, peak 15.77 GB, generation time 229.7 s.
- `gen_transitions.py` queues batch transition generation.
- `regen_helper.py` starts a local-only helper on `http://127.0.0.1:8788` so the debug panel can edit prompt text, queue one-at-a-time regenerations, and either delete or move the old clip into possible transition candidates.

`cryo_room_event_collapse.mp4` is visually strong but not accurate as a hallway transition. Treat it as a candidate ending or room-event clip.

ACE-Step generated `music/theme1.mp3` as a 120 s instrumental sci-fi elevator background track with acoustic guitar, soft keys, sparse drums, and no vocals.

## Important Rules

- Do not use `alert`, `prompt`, or native `confirm`; use the overlay modal helpers.
- Keep the game mobile-first portrait, with desktop as a side-by-side adaptation.
- Keep `original_files/` untracked unless the user explicitly wants source assets committed.
- Project registry entry is in `/Users/aaronair/cc/yru/site/projects.js` with screenshot `assets/screenshots/awake.jpg`.
