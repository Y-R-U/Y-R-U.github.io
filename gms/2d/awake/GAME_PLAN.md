# Awake

Version 0.1 is a production-ready vertical slice for testing the generated transition-video concept before scaling to a full procedural station.

## Core Loop

1. Cache the first room feed and transition videos while the intro slideshow warms up.
2. Start a randomized run:
   - Location type: Space Biome, Space Station, or Mars Habitat.
   - Facility name: generated from a short prefix list plus the location.
   - Player name: hidden until discovered.
   - Hunter: genetically created monster, alien infiltrator, or reanimated crew.
   - Turn limit: randomized inside the difficulty range.
3. Explore named room feeds connected through one shared hallway.
4. Spend turns searching, restoring the map, and escaping before the hunter reaches the hallway.
5. Save progress, inventory, goals, and story history locally.

## Version 0.1 Media Scope

- `images/cryo_room.jpg`
- `images/hallway.jpg`
- `images/med_bay.jpg`
- `images/hydroponic_biome.jpg`
- `images/reactor_gallery.jpg`
- `videos/cryo_room_to_hallway.mp4`
- `videos/hallway_to_cryo_room.mp4`
- `videos/med_bay_to_hallway.mp4`
- `videos/hallway_to_med_bay.mp4`
- `videos/hydroponic_biome_to_hallway.mp4`
- `videos/hallway_to_hydroponic_biome.mp4`
- `videos/reactor_gallery_to_hallway.mp4`
- `videos/hallway_to_reactor_gallery.mp4`
- `videos/cryo_room_event_collapse.mp4`
- `music/theme1.mp3`

The game treats each transition video as both motion and a still frame. A room view pauses on the first frame of the transition that starts from that room. The debug panel groups intended `room_transitions` separately from `possible_other_transition` clips so generated videos can be approved, replaced, deleted, or repurposed.

For local testing, run `python3 regen_helper.py` from this folder. The debug panel then enables `Redo`, lets the prompt text be edited, and queues replacement renders through the local LTX service. `Regen + Delete` replaces the current file after the new render succeeds. `Regen + Move` moves the old file to a `possible_*.mp4` candidate before writing the replacement.

## Future Room Packs

Every main room should connect through the hallway to control the video count:

- Room type to hallway.
- Hallway to room type.
- Optional room type to sub-room and sub-room back to room.
- Hallway to hunter ending.
- Hallway to escape ending.

Candidate wake rooms:

- Bedroom
- Infirmary
- Suspension Room
- Med Pod Bay
- Quarantine Cell
- Recovery Ward

Candidate functional rooms:

- Computer Core
- Hydroponic Biome
- Reactor Gallery
- Observation Dome
- Crew Quarters
- Shuttle Bay
- Teleport Room
- Transport Tube
- Armory
- Bio Lab

## Possible Game Names

- Wake Protocol
- The Last Corridor
- Echoes In The Biome
- Hallway Zero
- Nargpalm Wakes
- The Breathing Station
- Noon On Mars

## Planned Difficulty

- Easy: longer turn range and full visible goal list.
- Medium: normal turn range and partial goal list.
- Hard: shorter turn range, fewer visible goals, more hunter pressure events.

## Production Notes

- No `alert`, `prompt`, or `confirm`; all choices use in-game overlays.
- Mobile portrait is the primary layout.
- Desktop uses a side-by-side video and details panel layout.
- Settings panel includes music, sound, volume, help, and reset.
- Local storage keys are versioned for the v0.1 prototype.
