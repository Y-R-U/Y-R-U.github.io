# Emberwake — Beyond the First Shore

A self-contained RPG chapter spanning a lab prologue, training island and mainland town, built with vanilla HTML/CSS/JS and the site's local Three.js 0.160 distribution. Original procedural scenery and characters; no external model packs or network services at runtime. Created by OpenAI Codex / GPT-6.

## Play

Serve the site root and open `/gms/3d/emberwake/`. The game uses ES modules, so use HTTP rather than opening the HTML as a file. WebGL is required.

- Click/tap ground to move; click/tap an object or enemy to approach and interact. Combat repeats until the target falls, you move, or you dodge.
- WASD/arrows: move relative to the camera. E: nearby interaction. 1/2/3: sword/dagger/magic. Space: dodge. R: eat cooked fish.
- Scroll or pinch with two fingers: zoom in/out. Right-drag: rotate camera. Pinching never issues a move or interaction.
- B: cycle belt through one row, two rows, and full equipment view. K: cycle skills. Click a skill to inspect total XP, its progress bar, and XP to the next level.
- Settings: audio, panel opacity, rendering quality, and confirmed new journey.
- After the opening speech, the title fades upward and the quest takes its top-left corner. Quest updates show their details for four seconds of active play, then collapse to a gold task/counter and `Show the way`. Tap the gold line to reopen or collapse details; gameplay continues.
- `Show the way` walks toward the current objective. It can be used throughout the introduction.

## Playable chapter

Create a named male or female lab assistant, meet Dr Vale, hide during the attack and enter the orange rift opened by the device. The training island retains its eight-step gathering/crafting/combat progression. Its beacon now teleports to **Lantern Reach**, where three missions restore the town wards, rescue archivist Neri and recover an impossible laboratory record from the observatory. See [STORY.md](STORY.md) for the story draft, rewards and unresolved mysteries.

J (or the journal button) opens discovered story notes and mission status. `Show the way` works throughout all three regions. The northern road marks the end of this chapter. Both shores remain explorable, with fishing, cooking, gathering and island training available after completion.

Cooked fish heal 45 vitality plus 5 per Fishing mastery rank and 3 per Cooking mastery rank (up to 100). Hearths and friendly wardkeepers restore health. Focus regenerates; the island well also restores it. Defeat returns the player to the current region's hearth without losing quest progress. Surviving enemies recover. Seven skills track XP: Melee, Magic, Woodcutting, Mining, Fishing, Smithing and Cooking. Mainland ward repairs provide further Smithing XP. Mara's reinforced weapon fittings add four damage.

Progress is saved locally under the existing `emberwake-v1` key using schema version 4. Older saves migrate in place without losing earned progress; versions 1/2 receive 20 starter coins, and version 3 keeps its coins and earned gathering mastery; completed beacons become mainland crossings. Saves include character identity, region, both regions' independent progress, equipment, inventory, XP, position, UI modes and the current dialogue. A new journey requires confirmation if a save exists. Enemies remain defeated. There is no multiplayer or cloud save.

## Skilling and trading

Fishing, Woodcutting, Mining, Cooking and Smithing begin **manual**: tap a resource, wait for the action to finish, then tap it or the activity panel’s **Cast/Cut/Mine again** button. At **level 5**, a glowing **Unlock auto skill** button appears at that resource. Win its mastery challenge to permanently unlock automatic work for that skill. Further challenges open at levels **10, 15, 20…100**; a missed challenge remains available and is easier when overlevelled (except the fixed mining game). Attempts cost no items or coins.

- **Fishing:** hold the reel button (or Space) to bring the fish closer; release to lower line tension. Land it before time runs out without snapping the line.
- **Woodcutting:** tap Cut (or Space) as the marker crosses the gold band. Six good cuts win; three misses end the attempt.
- **Cooking:** hold the stoke button (or Space) to increase heat; release to cool. Keep the heat in the gold band until the meal finishes, without burning it.
- **Smithing:** tap Hammer (or Space) inside alternating anvil zones. Six good strikes win; three misses end the attempt.
- **Mining:** tap glowing weak points (or use number keys 1–9). Six hits win; three misses end the attempt.
- Fishing mastery upgrades **all stored and future fish**: +2 sale coins and +5 meal healing per rank. Woodcutting/Mining add +2 sale coins per rank and one extra resource per cycle every two ranks.
- Automatic work continues while nearby. Ground movement, movement keys, dodge, damage, another interaction, travel or **Stop** cancel it. Menus and hidden tabs pause it. Reloads do not resume work, and there are no offline rewards.
- **Shore supplies** near the island hearth and **Lantern market** under the mainland market awning buy and sell wood, ore and fish. Each shop shows owned quantities and prices, with Sell 10 for surplus stacks. Coins appear on the belt. Quest items cannot be sold. Buy prices scale alongside sale prices to prevent profitable buy/sell loops.

Hearths restore health and open the **kitchen**. Choose a recipe and 1, 5 or all available items (up to 999). Before mastery, each batch item needs a tap on **Continue batch**; after mastery the selected batch runs automatically and stops at the selected quantity. Ingredients are spent only when an item completes, and shortages pause the batch without consuming partial ingredients.

After the original tutorial blades are forged, island and mainland **forges** offer repeatable copper ingots (2 ore + 1 wood) and **blade tempering**. Each of five temper tiers adds +2 sword/dagger damage; higher tiers need more ingots, wood and Smithing levels. Tempering makes one upgrade per order. Smithing mastery speeds production and improves ingot sale prices. Cooking mastery speeds cooking and improves all existing/future meals.

Both shops sell three tiers of gathering tools for 60, 180 and 540 coins. Each tier adds 20% to work speed and changes the tool's finish in the character's hand. Axes, pickaxes, rods, hammers and cooking spoons appear while working. Ingot sale prices stay below the cost of buying their ingredients. Combat still uses its existing repeated attacks.

See [ENHANCEMENTS.md](ENHANCEMENTS.md) for the full checklist, current verification and exact continuation instructions.

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
- `professions.mjs`: gathering, mastery challenges and atomic shop transactions.
- `professions-ui.js`: activity panel, mouse/touch/keyboard challenge controls and shop dialogs.
- `icons.js`: original inline SVG interface icons.
- Uses the adjacent Second Hand project's bundled Manrope font and its existing license.

Run state tests:

```sh
node --test tests/*.test.mjs
```

Run the real browser playthrough with Playwright installed and the site served on port 8891 (override `EMBERWAKE_URL` and `PLAYWRIGHT_MODULE` as needed):

```sh
node tests/browser.mjs
node tests/interactions.mjs
node tests/expansion.mjs
node tests/speech.mjs
node tests/professions.mjs
node tests/artisans.mjs
```

The browser test plays through character creation, the lab escape, gathering, crafting, all three weapon styles, shades, the Warden, three mainland missions and return travel; then checks panel states, skill XP, saved progress, and four viewport sizes. It fails on JavaScript, shader-console or HTTP errors. The interaction checks exercise touch input, dodge timing, defeat recovery, fishing, cooking and narrow-screen skill contents. `window.emberwake` exposes state, objects, movement and rendering metrics for inspection; the normal game flow does not require it.
