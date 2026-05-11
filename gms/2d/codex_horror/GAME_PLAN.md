# Black Glass House - Game Plan

## Core Shape

Black Glass House is a mobile-first branching horror story. The run starts with a wake sequence: the player must tap through heavy sleep until the screen opens into a cot room inside a place they do not remember.

The game loop is simple:

- Read the current room.
- Choose a direction or interaction.
- Collect clues, raise or lower dread, and unlock routes.
- Use the journal, evidence drawer, and map to understand what happened.
- Reach the black glass door with enough truth to choose an ending.

## Mystery

The house is not a house. It is a memory ward built from the player's last moments after an accident at Black Glass Sanitarium. Rooms are emotional fragments. Helpful choices gather evidence and keep dread low. Reckless choices let the ward turn predatory.

## Rooms And Art

Every major room has a generated Flux image in `images/`:

- `title.png` - exterior cover image.
- `cot_room.png` - the wake room.
- `artery_hall.png` - main upper hallway.
- `washroom.png` - mirror and water memory.
- `nursery.png` - childhood ward.
- `stairwell.png` - vertical route between floors.
- `kitchen.png` - staff kitchen and sanitarium matches.
- `archive.png` - records room.
- `chapel.png` - little hospital chapel.
- `conservatory.png` - glass garden room.
- `engine_room.png` - generator room.
- `cellar.png` - locked lower ward.
- `observatory.png` - roof lens room.
- `black_door.png` - finale threshold.
- `horror.png` - bad-ending presence.

## Systems

- Local save: current room, inventory, flags, visited rooms, dread, and history.
- Persistent endings: collected ending names survive reset.
- Story history: records rooms visited, choices made, clues found, and endings.
- Evidence drawer: clue list plus locked clues.
- Map panel: visited rooms and current location.
- Settings panel: music on/off, volume, text reveal speed, reset progress.
- Audio: randomly tries `music/theme1.mp3` through `music/theme9.mp3`; missing files are skipped.
- No native alerts: all confirmations use the in-game modal system.

## Endings

- `Clear Morning` - good ending. Requires enough evidence and low dread.
- `The Witness` - bittersweet ending. Stay behind to guide the next sleeper.
- `Black Glass` - bad ending. Enter the door before understanding enough.
- `Under The Cot` - bad ending. Refuse to wake.
- `The Choir Below` - bad ending. Pray in the wrong chapel.
- `Kept For Observation` - bad ending. Let dread overtake the run.
