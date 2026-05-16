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
- Playable room feeds: `cryo_room`, `med_bay`, `hydroponic_biome`, `reactor_gallery`, `security_hub`, `observation_deck`, and `engineering_bay`.
- One shared `Central Hallway`.
- Transition debug panel for previewing generated videos, filtering ROOM/POSSIBLE/OTHER/ALL, editing local review messages, viewing prompts, and copying short file names.
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
- `images/security_hub.jpg`
- `images/observation_deck.jpg`
- `images/engineering_bay.jpg`
- `videos/*_to_hallway.mp4`
- `videos/hallway_to_*.mp4`
- `videos/cryo_room_event_collapse.mp4`
- `videos/monster_release_*.mp4`
- `videos/monster_attack_*.mp4`
- `music/theme1.mp3`

Ignored source assets:

- `original_files/suspension_room.png`
- `original_files/cryo_room.png`
- `original_files/med_bay.png`
- `original_files/hydroponic_biome.png`
- `original_files/reactor_gallery.png`
- `original_files/security_hub.png`
- `original_files/observation_deck.png`
- `original_files/engineering_bay.png`
- `original_files/hallway.png`

The PNGs are Flux source outputs and should stay ignored. The JPGs are browser runtime assets.

## Generation Notes

Flux stills were generated locally through MFLUX using `gen_images.py`.

LTX transition videos were generated locally through `http://localhost:7866/api/generate`:

- Existing review transitions are 384x640, 73 frames, 24 FPS, about 3.04 s, video-only.
- Future game transition generation defaults to the proven 384x640 portrait size. The requested 360x640 9:16 shape is not valid in the current LTX AV path because it asserts 64-pixel-aligned dimensions; use 640x384 for landscape game clips.
- `cryo_room_event_collapse.mp4`: former `room_to_hallway.mp4`; 384x640, 121 frames, 24 FPS, 5.04 s, video-only, peak 15.77 GB, generation time 215.5 s.
- `hallway_to_cryo_room.mp4`: former `hallway_to_room.mp4`; 384x640, 121 frames, 24 FPS, 5.04 s, video-only, peak 15.77 GB, generation time 229.7 s.
- `gen_transitions.py` queues batch transition generation.
- Latest generated room batch added `security_hub`, `observation_deck`, and `engineering_bay` in both directions at 384x640, 73 frames, 24 FPS. Sampled frames were coherent and sub-1 MB.
- Latest generated monster batch added `machine`, `parasite`, and `shadow` release/attack clips. `monster_release_machine.mp4` sampled clearly; parasite and shadow samples were subtle and should be reviewed in the debug panel before treating them as approved.
- `regen_helper.py` starts a local-only helper on `http://127.0.0.1:8788` so the debug panel can edit prompt text, queue one-at-a-time regenerations, and either delete the old clip or move it into Possible or Other review buckets. The script itself is project-agnostic (byte-identical to `the_horrors/regen_helper.py`) — it reads `regen_config.json` from the same dir for the per-project transitions, COMMON/NEGATIVE boilerplate, and extra-video prefix routing. Each row in the panel shows file size + mtime (e.g. `869 KB | 2026-05-15 01:00:49`).
- **To use the debug panel, open `http://127.0.0.1:8788/?debug` in the browser** (NOT the GitHub Pages URL). The helper now serves the static game from the same origin — this sidesteps the mixed-content block that stops the deployed HTTPS site from reaching the local HTTP helper.

`cryo_room_event_collapse.mp4` is visually strong but not accurate as a hallway transition. Treat it as a candidate ending or room-event clip.

ACE-Step generated `music/theme1.mp3` as a 120 s instrumental sci-fi elevator background track with acoustic guitar, soft keys, sparse drums, and no vocals.

## Important Rules

- Do not use `alert`, `prompt`, or native `confirm`; use the overlay modal helpers.
- Keep the game mobile-first portrait, with desktop as a side-by-side adaptation.
- Keep `original_files/` untracked unless the user explicitly wants source assets committed.
- Project registry entry is in `/Users/aaronair/cc/yru/site/projects.js` with screenshot `assets/screenshots/awake.jpg`.
