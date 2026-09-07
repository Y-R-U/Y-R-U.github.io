# Emberwake — Beyond the First Shore

A self-contained RPG chapter spanning a lab prologue, training island and mainland town, built with vanilla HTML/CSS/JS and the site's local Three.js 0.160 distribution. Original procedural scenery and characters; no external model packs or network services at runtime. Created by OpenAI Codex / GPT-6.

## Play

Serve the site root and open `/gms/3d/emberwake/`. The game uses ES modules, so use HTTP rather than opening the HTML as a file. WebGL is required.

- Click/tap ground to move; click/tap an object or enemy to approach and interact. Combat repeats until the target falls, you move, or you dodge.
- WASD/arrows: move relative to the camera. E: nearby interaction. 1/2/3: sword/dagger/magic. Space: dodge. R: eat cooked fish.
- Scroll: zoom. Right-drag: rotate camera.
- B: cycle belt through one row, two rows, and full equipment view. K: cycle skills. Click a skill to inspect total XP, its progress bar, and XP to the next level.
- Settings: audio, panel opacity, rendering quality, and confirmed new journey.
- `Show the way` walks toward the current objective. It can be used throughout the introduction.

## Playable chapter

Create a named male or female lab assistant, meet Dr Vale, hide during the attack and enter the orange rift opened by the device. The training island retains its eight-step gathering/crafting/combat progression. Its beacon now teleports to **Lantern Reach**, where three missions restore the town wards, rescue archivist Neri and recover an impossible laboratory record from the observatory. See [STORY.md](STORY.md) for the story draft, rewards and unresolved mysteries.

J (or the journal button) opens discovered story notes and mission status. `Show the way` works throughout all three regions. The northern road marks the end of this chapter. Both shores remain explorable, with fishing, cooking, gathering and island training available after completion.

Cooked fish heal 45 vitality. Hearths and friendly wardkeepers restore health. Focus regenerates; the island well also restores it. Defeat returns the player to the current region's hearth without losing quest progress. Surviving enemies recover. Six skills track XP: Melee, Magic, Woodcutting, Mining, Fishing and Smithing. Mainland ward repairs provide further Smithing XP. Mara's reinforced weapon fittings add four damage.

Progress is saved locally under the existing `emberwake-v1` key using schema version 2. Version 1 island saves migrate in place; completed beacons become mainland crossings. Saves include character identity, region, both regions' independent progress, equipment, inventory, XP, position, UI modes and the current dialogue. A new journey requires confirmation if a save exists. Enemies remain defeated. There is no multiplayer or cloud save.

## Narration

Bundled MP3 narration uses Reader's local Kokoro engine: **Lewis (`bm_lewis`)** for narration/NPCs, **Bella (`af_bella`)** for female player thoughts, and **Echo (`am_echo`)** for male player thoughts, at 0.98 speed. Most passages last 6–11 seconds. No Reader server is needed to play. Character creation includes voice preview. Speech appears as short orange subtitles while gameplay continues. Lines advance automatically, including with sound muted; the small arrow skips a line. Tap the message icon to pause and read the full transcript, then return to the same speech. The most recent transcript stays available after its subtitles end. New quest speech queues behind the current line and survives reloads. Replay and mute remain available. Portal travel shows the departure and arrival before displaying new speech.

Regenerate with the local environment containing cached Kokoro weights and ffmpeg:

```sh
/Users/aaronair/cc/airon/tts-server/.venv/bin/python tools/narrate.py
```

`audio/manifest.json` records each clip's voice, speed and duration. The generator checks for empty/silent output and writes no audiobook library data.

## Implementation and checks

- `world.js`: deterministic sculpted island, original meshes, merged static geometry, ground/ocean shaders, lighting, procedural scenery and animated elements.
- `regions.js`: original lab and mainland scenes, scenery, NPCs and ward visuals.
- `main.js`: region transitions, story journal, character creation, controls, A* routing, tutorial, combat, UI, particles, sound, narration and saves.
- `state.mjs`: XP thresholds, crafting, healing, progression gates and save validation.
- `icons.js`: original inline SVG interface icons.
- Uses the adjacent Second Hand project's bundled Manrope font and its existing license.

Run state tests:

```sh
node --test tests/state.test.mjs
```

Run the real browser playthrough with Playwright installed and the site served on port 8891 (override `EMBERWAKE_URL` and `PLAYWRIGHT_MODULE` as needed):

```sh
node tests/browser.mjs
node tests/interactions.mjs
node tests/expansion.mjs
node tests/speech.mjs
```

The browser test plays through character creation, the lab escape, gathering, crafting, all three weapon styles, shades, the Warden, three mainland missions and return travel; then checks panel states, skill XP, saved progress, and four viewport sizes. It fails on JavaScript, shader-console or HTTP errors. The interaction checks exercise touch input, dodge timing, defeat recovery, fishing, cooking and narrow-screen skill contents. `window.emberwake` exposes state, objects, movement and rendering metrics for inspection; the normal game flow does not require it.
