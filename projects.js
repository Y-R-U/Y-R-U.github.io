/**
 * Project registry - all directories in the repo are tracked here.
 *
 * Types:
 *   "app"   - Application (shown on Projects page)
 *   "game"  - Game (shown on Projects page)
 *   "other" - Non-project directory (tracked but not displayed)
 *
 * To add a new project:
 *   1. Add an entry below with type "app" or "game"
 *   2. Add a screenshot to /assets/screenshots/<screenshot>.jpg
 *   3. The Projects page will pick it up automatically
 *
 * To mark a directory as reviewed (not a project):
 *   Add an entry with type "other" and a note explaining what it is.
 *
 * Creator field (added 2026-05-15):
 *   `creator` records who built the project. Examples:
 *     "Opus 4.7"                  - Claude Opus 4.7 (the current Claude model)
 *     "OpenAI 5.5"                - OpenAI Codex / GPT-5.5
 *     "Opus 4.7 + OpenAI 5.5"     - Combination project, both contributed
 *     "Claude"                    - Older Claude/Sonnet model, exact version unknown
 *     "Hand"                      - Hand-coded by Aaron
 *   New projects MUST set `creator` to whichever model(s) actually built it.
 *   Update if a different model later contributes substantially.
 *   Projects with codex_* paths/names are OpenAI 5.5 unless explicitly mixed.
 *   Claude-built projects from The Hollow era onward should use "Opus 4.7".
 */
const PROJECTS = [

  // ══════════════════════════════════════════
  //  APPS (sorted by date, oldest first)
  // ══════════════════════════════════════════

  { name: "Code Editor",    path: "/e/",                screenshot: "code-editor",    type: "app",
    desc: "Monaco-based live HTML/JS/CSS code editor with project save/load and instant preview.",
    date: "2024-06-20", creator: "Claude" },

  { name: "Mobile Editor",  path: "/m/",                screenshot: "mobile-editor",  type: "app",
    desc: "Minimal textarea-based live HTML/JS/CSS code editor optimized for mobile devices.",
    date: "2024-06-24", creator: "Claude" },

  { name: "Goal Tracker",   path: "/q/",                screenshot: "goal-tracker",   type: "app",
    desc: "Goal-setting and progress tracking app. Set targets, log progress, and visualize achievements.",
    date: "2024-07-10", creator: "Claude" },

  { name: "Top 5 Review",   path: "/t5/",               screenshot: "top5-review",    type: "app",
    desc: "Dante's Top 5 Review: create ranked lists and reviews for movies, music, games, and more.",
    date: "2024-07-16", creator: "Claude" },

  { name: "Image Editor",   path: "/d/",                screenshot: "image-editor",   type: "app",
    desc: "Edit images in-browser with layers, drawing tools, selection, and shape primitives.",
    date: "2024-09-11", creator: "Claude" },

  { name: "Code Editor V2", path: "/e2/",               screenshot: "code-editor-v2", type: "app",
    desc: "Enhanced Monaco Editor with project loading via projectData.js and compressed storage.",
    date: "2025-02-02", creator: "Claude" },

  { name: "AB Edit",        path: "/m2/",               screenshot: "ab-edit",        type: "app",
    desc: "Code editor with separate HTML/JS/CSS tabs and a companion preview view.",
    date: "2025-02-15", creator: "Claude" },

  { name: "K-Hydro Track",  path: "/k/",                screenshot: "k-hydro",        type: "app",
    desc: "Hydroponic plant management app with growth tracking, nutrient logs, harvest data, and photo journals.",
    date: "2025-05-08", creator: "Claude" },

  { name: "WebRTC Test",    path: "/n/",                screenshot: "webrtc-test",    type: "app",
    desc: "WebRTC STUN peer connection test tool using manual copy/paste signaling for P2P data channels.",
    date: "2025-09-02", creator: "Claude" },

  { name: "Draw & Paint",   path: "/d2/",               screenshot: "draw-editor",    type: "app",
    desc: "Drawing & image editor with layers, pen, shapes, text, arrows, stroke/fill controls, and PNG export.",
    date: "2026-03-04", creator: "Claude" },

  { name: "Fast Notes",     path: "/app/pwa/fnote/",    screenshot: "fnote",          type: "app",
    desc: "Fast notes PWA that syncs across devices. Organize with folders, drag-and-drop, dark/light themes.",
    date: "2026-03-05", creator: "Claude" },

  { name: "World Clock",    path: "/app/pwa/timezones/", screenshot: "timezones",     type: "app",
    desc: "World clock PWA tracking times across cities with day/night indicators and a meeting planner.",
    date: "2026-03-05", creator: "Claude" },

  { name: "Edit2D",         path: "/app/pwa/edit2d/",   screenshot: "edit2d",         type: "app",
    desc: "2D tile-based level and object editor with Kenney assets. Layers, undo/redo, collision editing, and JSON export.",
    date: "2026-03-17", creator: "Claude" },

  { name: "Space Habitat",  path: "/app/3d/spacehabitat/", screenshot: "spacehabitat",  type: "app",
    desc: "Toroidal space habitat configurator with 3D viewer. Design rotating torus habitats with artificial gravity simulation.",
    date: "2026-04-09", creator: "Claude" },

  { name: "Reader",         path: "/app/reader/",       screenshot: "reader",         type: "app",
    desc: "Local server-backed audiobook reader. The laptop runs the Kokoro TTS backend while the Android APK caches books for offline playback.",
    date: "2026-04-21", creator: "Opus 4.7 + OpenAI 5.5" },

  { name: "CalTrack",       path: "/app/caltrack/",     screenshot: "caltrack",       type: "app",
    desc: "Super-simple mobile-first calorie & exercise tracker. Time-of-day smart suggestions, deficit projections, and live progress charts. Full accounts + SQLite sync at caltrack.br8t.com; browser-only backup here.",
    date: "2026-06-04", creator: "Opus 4.8" },

  { name: "FORGE",          path: "/gms/3d/forge/",     screenshot: "forge",          type: "app",
    desc: "Three.js graphics test bed and level editor chasing Tiny Glade-grade visuals at 60fps on a phone. Walk the town, open the settings cog, change the time of day. Soft shadows, procedural sky and materials, a flowing creek, enterable houses, plus a built-in perf HUD, scene editor and a procedural audio lab. Nothing to win — it is for exploring and testing.",
    date: "2026-08-03", creator: "Opus 5" },

  { name: "FACET",          path: "/gms/3d/facet/",     screenshot: "facet",          type: "app",
    desc: "A low-poly isometric diorama that runs on a phone — a whole island on a cut slab, with a village, a windmill, a river and a sea, all built from flat-shaded triangles. Drag to orbit, pinch to zoom, and open the settings cog to swap between four palettes: meadow, autumn, dusk and frost. At dusk the windows light up and the chimneys smoke. Sibling to FORGE, chasing the opposite look: there are no textures at all, every colour lives in the geometry itself, and the entire world draws in sixteen calls.",
    date: "2026-08-07", creator: "Opus 5" },

  // ══════════════════════════════════════════
  //  GAMES (sorted by date, oldest first)
  // ══════════════════════════════════════════

  { name: "Snake Battle",       path: "/gms/s/",                screenshot: "snake",           type: "game",
    desc: "Snake game with battle mechanics. Grow your snake, outmaneuver opponents, dominate the arena.",
    date: "2024-12-20", creator: "Claude" },

  { name: "Asteroids",          path: "/gms/a/",                screenshot: "asteroids",       type: "game",
    desc: "Classic Asteroids reimagined for mobile. Pilot your ship, blast asteroids, survive the void.",
    date: "2025-03-02", creator: "Claude" },

  { name: "Pocket Legends CCG", path: "/gms/c/",                screenshot: "ccg",             type: "game",
    desc: "Collectible card game with deck building, card abilities, and strategic turn-based battles.",
    date: "2025-03-02", creator: "Claude" },

  { name: "Desert Throw",       path: "/gms/t/",                screenshot: "desert-throw",    type: "game",
    desc: "Physics-based throwing game set in the desert. Aim, throw, and see how far you can launch.",
    date: "2025-03-02", creator: "Claude" },

  { name: "Storybook Adventure", path: "/gms/o/",               screenshot: "storybook",       type: "game",
    desc: "Interactive storybook adventure with branching narratives, expandable panels, and dynamic storytelling.",
    date: "2025-03-03", creator: "Claude" },

  { name: "Kingdom City",       path: "/gms/k/kc/",             screenshot: "kingdom-city",    type: "game",
    desc: "Rule a kingdom: manage zones, trade with neighbors, engage in diplomacy and warfare.",
    date: "2025-05-11", creator: "Claude" },

  { name: "Kingdom Manager",    path: "/gms/k/kg/",             screenshot: "kingdom-manager", type: "game",
    desc: "Advanced kingdom simulation with territory expansion, espionage, trading, and random events.",
    date: "2025-05-11", creator: "Claude" },

  { name: "DriverC",            path: "/gms/driverc/",           screenshot: "driverc",         type: "game",
    desc: "Isometric racing game with 3-lap races, speed HUD, and mobile joystick controls.",
    date: "2025-07-23", creator: "Claude" },

  { name: "Simple Shooter",     path: "/gms/simple-shooter/",    screenshot: "simple-shooter",  type: "game",
    desc: "Browser-based shooter with an SVG turret. Aim at incoming enemies with mouse or touch controls.",
    date: "2025-07-23", creator: "Claude" },

  { name: "Sudoku",             path: "/gms/pwa/sudoku/",        screenshot: "sudoku",          type: "game",
    desc: "Sudoku PWA with six difficulties graded by the solving technique they demand, pencil marks, hints and offline play.",
    date: "2025-12-04", creator: "Claude" },

  { name: "Zombie Horde",       path: "/gms/z/",                screenshot: "tululoo",         type: "game",
    desc: "Top-down zombie action game built with the Tululoo engine. Clear each level and rack up your highest score.",
    date: "2026-02-05", creator: "Hand" },

  { name: "Life Idle",          path: "/gms/pwa/idleLife/",      screenshot: "idle-life",       type: "game",
    desc: "Idle clicker simulating career progression. Earn money, unlock jobs and businesses, prestige for multipliers.",
    date: "2026-02-19", creator: "Claude" },

  { name: "RCELL",              path: "/gms/pwa/rcell/",         screenshot: "rcell",           type: "game",
    desc: "Roguelite bullet-hell as a white blood cell. Survive waves of pathogens with power-ups and meta-upgrades.",
    date: "2026-02-20", creator: "Claude" },

  { name: "Lands of Ascii",     path: "/gms/pwa/crpg/",          screenshot: "crpg",            type: "game",
    desc: "Retro console RPG with dungeon exploration, turn-based combat, skills, inventory, and ASCII aesthetic.",
    date: "2026-02-23", creator: "Claude" },

  { name: "Idle Western",       path: "/gms/pwa/idleWestern/",   screenshot: "idle-western",    type: "game",
    desc: "Western-themed idle game. Build a frontier empire, hire workers, upgrade operations, and move west.",
    date: "2026-02-25", creator: "Claude" },

  { name: "Dungeon ORPG",       path: "/gms/pwa/orpg/",          screenshot: "orpg",            type: "game",
    desc: "Multiplayer online dungeon crawler with canvas-based exploration, combat, and dungeon mechanics.",
    date: "2026-03-02", creator: "Claude" },

  { name: "Mini War",           path: "/gms/pwa/miniwar/",       screenshot: "miniwar",         type: "game",
    desc: "Real-time strategy battle game. Command a micro nation, evolve units, progress through ages and waves.",
    date: "2026-03-04", creator: "Claude" },

  { name: "Dicey",              path: "/gms/pwa/dicey/",         screenshot: "dicey",           type: "game",
    desc: "Monopoly-inspired board game with 2-4 players, property trading, house building, and AI opponents.",
    date: "2026-03-05", creator: "Claude" },

  { name: "Dicey-vid",          path: "/gms/pwa/Dicey-vid/",     screenshot: "dicey-vid",       type: "game",
    desc: "Dicey experiment with image-backed board spaces, active tiny looping videos, and a debug media editor for Flux/LTX re-rolls.",
    date: "2026-05-31", creator: "OpenAI Codex / GPT-5.5" },

  { name: "DRace",              path: "/gms/pwa/drace/",         screenshot: "drace",           type: "game",
    desc: "Strategic dice-race battle game. Compete to reach the finish using dice rolls and movement choices.",
    date: "2026-03-08", creator: "Claude" },

  { name: "Pirates",            path: "/gms/pirates/",           screenshot: "pirates",         type: "game",
    desc: "3D isometric pirate game with Babylon.js. Navigate your ship through islands and battle enemy vessels.",
    date: "2026-03-09", creator: "Claude" },

  { name: "Transport Empire",   path: "/gms/pwa/transport/",     screenshot: "transport",       type: "game",
    desc: "3D idle transport tycoon with Babylon.js graphics. Build routes, upgrade vehicles, and grow your business empire.",
    date: "2026-03-11", creator: "Claude" },

  { name: "Idle Transport",     path: "/gms/pwa/idleTransport/", screenshot: "idle-transport",  type: "game",
    desc: "Idle management game where you build a transport empire. Purchase routes, hire managers, and prestige for multipliers.",
    date: "2026-03-12", creator: "Claude" },

  { name: "Corsair's Fate",     path: "/gms/pwa/pirate2d/",      screenshot: "pirate2d",        type: "game",
    desc: "Pirate roguelite adventure on the high seas with combat, exploration, and procedural encounters.",
    date: "2026-03-18", creator: "Claude" },

  { name: "Flappy Strike",      path: "/gms/pwa/dodgybird/",     screenshot: "dodgybird",       type: "game",
    desc: "Fast-paced side-scrolling run & gun action game. Dodge obstacles and shoot enemies in arcade-style levels.",
    date: "2026-03-19", creator: "Claude" },

  { name: "Snake-eee",          path: "/gms/pwa/snake/",         screenshot: "snake-io",        type: "game",
    desc: "Competitive arena snake game with AI opponents, food and power-ups, meta-upgrades, and unlockable skins.",
    date: "2026-03-20", creator: "Claude" },

  { name: "Triad Clash",        path: "/gms/pwa/cc1/",           screenshot: "cc1",             type: "game",
    desc: "Strategy card battle game with three classes (Warrior, Archer, Mage) in 12-round AI battles.",
    date: "2026-03-25", creator: "Claude" },

  { name: "Warlords",           path: "/gms/pwa/wl/",            screenshot: "warlords",        type: "game",
    desc: "Fantasy strategy game with map conquest, hero units, city production, and turn-based combat for 2-8 players.",
    date: "2026-03-25", creator: "Claude" },

  { name: "Bounce Merge 3D",    path: "/gms/3d/bouncem/",        screenshot: "bouncem",         type: "game",
    desc: "3D ball-merging roguelite with physics-based gameplay, wave progression, and upgrades using Three.js.",
    date: "2026-03-27", creator: "Claude" },

  { name: "Emerald Place",      path: "/gms/2d/emeraldplace/",   screenshot: "emeraldplace",    type: "game",
    desc: "Narrative apartment life simulation. Manage mood, energy, and cash while exploring Emerald Place and interacting with residents.",
    date: "2026-04-02", creator: "Claude" },

  { name: "Tower D1",           path: "/gms/2d/towerd1/",        screenshot: "towerd1",         type: "game",
    desc: "Classic tower defense game. Build and upgrade towers, manage gold and lives across waves of enemies.",
    date: "2026-04-02", creator: "Claude" },

  { name: "Crowd Rush 3D",      path: "/gms/3d/crowd/",          screenshot: "crowd",           type: "game",
    desc: "3D party game where your crowd grows by collecting coins and absorbing smaller crowds. Story mode and Last Man Standing.",
    date: "2026-04-07", creator: "Claude" },

  { name: "Paper Ant",          path: "/gms/2d/paperant/",       screenshot: "paperant",        type: "game",
    desc: "Puzzle game with a hand-drawn paper theme. Draw pencil lines to guide ants through 100 levels — moving obstacles, power-ups (magnet, freeze, thick pencil), daily rewards, events and a daily challenge.",
    date: "2026-04-10", creator: "Claude" },

  { name: "Crow Tank 3D",       path: "/gms/3d/codex_3d_tank/",   screenshot: "codex-3d-tank",  type: "game",
    desc: "Low-poly Three.js tank shooter. Drive across a ridge and shoot down red-eyed black crows before they dive.",
    date: "2026-04-24", creator: "OpenAI 5.5" },

  { name: "Claude 3D Tank",     path: "/gms/3d/claude_3d_tank/",  screenshot: "claude-3d-tank",  type: "game",
    desc: "Low-poly 3D tank shooter at dusk. Hold off waves of diving black crows with glowing red eyes. WASD + mouse aim, barrel pitches up to track crows overhead.",
    date: "2026-04-24", creator: "Opus 4.7" },

  { name: "Swingin'",           path: "/gms/2d/swingin/",          screenshot: "swingin",         type: "game",
    desc: "Frog tongue swinging platformer. Swing from anchors, collect bugs, buy upgrades, and reach the fly at the end of each level.",
    date: "2026-05-08", creator: "Opus 4.7" },

  { name: "Codex Tank Battle",  path: "/gms/3d/codex_3d_tank_battle/", screenshot: "codex-tank-battle", type: "game",
    desc: "Last-tank-standing 3D battle royale with ten named tanks, AI commanders, a live leaderboard, mobile controls, and cannon combat.",
    date: "2026-05-08", creator: "OpenAI 5.5" },

  { name: "Tank Battle Royale", path: "/gms/3d/claude_3d_tank_battle/", screenshot: "claude-tank-battle", type: "game",
    desc: "3D tank battle royale where ten tanks enter an arena and fight until one survivor remains. Includes leaderboard, name tags, and touch controls.",
    date: "2026-05-08", creator: "Opus 4.7" },

  { name: "Black Glass House",  path: "/gms/2d/codex_horror/", screenshot: "codex-horror", type: "game",
    desc: "Mobile-first branching horror story. Wake yourself, explore haunted rooms, gather clues, and choose what waits beyond the black glass door.",
    date: "2026-05-12", creator: "OpenAI 5.5" },

  { name: "The Hollow",         path: "/gms/2d/claude_horror/", screenshot: "claude-horror", type: "game",
    desc: "Mobile-first text horror. Click yourself awake, wander a Victorian house between life and death, collect memories and items, and reach one of seven endings. Rooms generated locally with MFLUX.",
    date: "2026-05-12", creator: "Opus 4.7" },

  { name: "Awake",              path: "/gms/2d/awake/", screenshot: "awake", type: "game",
    desc: "Mobile-first sci-fi horror escape prototype. Wake with no memory, search a generated facility, and outrun what is hunting the hallway.",
    date: "2026-05-13", creator: "Opus 4.7 + OpenAI 5.5" },

  { name: "The Horrors",        path: "/gms/2d/the_horrors/", screenshot: "the-horrors", type: "game",
    desc: "Mobile-first hub-and-spoke video horror. Every room connects through a central hallway via short generated transition videos; monster reveals, attacks, and most endings play in the hallway.",
    date: "2026-05-15", creator: "Opus 4.7 + OpenAI 5.5" },

  { name: "Gate Tank Runner",   path: "/gms/3d/codex_gate_tank_runner/", screenshot: "codex-gate-tank-runner", type: "game",
    desc: "Low-poly Three.js tank runner. Smash glass gates for strength, armor, and tiny escort tanks, then spend salvaged coins on permanent garage upgrades.",
    date: "2026-05-27", creator: "OpenAI 5.5" },

  { name: "Outpace",            path: "/gms/3d/outpace/", screenshot: "outpace", type: "game",
    desc: "Mobile-first cockpit space shooter with a generated alpha-key cockpit plate, live Three.js asteroid fields, drones, station flybys, and touch firing.",
    date: "2026-06-09", creator: "OpenAI 5.5" },

  { name: "DRK",                path: "/gms/2d/drk/", screenshot: "drk", type: "game",
    desc: "Mobile-first wealth and dating life sim with jobs, trading, gambling, romance routes, generated character cards, and local Flux/LTX debug media tools.",
    date: "2026-06-02", creator: "OpenAI 5.5" },

  { name: "Drone Storm",        path: "/gms/3d/fable5_3d_tank/", screenshot: "fable5-3d-tank", type: "game",
    desc: "Neon synthwave hover-tank shooter. Blast waves of evil drones with glowing laser eyes out of the night sky. Three.js with bloom, WASD + mouse aim, full touch controls.",
    date: "2026-06-10", creator: "Fable 5" },

  { name: "Storm Royale",       path: "/gms/3d/fable5_3d_tank_battle/", screenshot: "fable5-3d-tank-battle", type: "game",
    desc: "Last-tank-standing battle royale against 9 AI tanks with distinct personalities, a shrinking storm wall, live leaderboard, neon name tags, kill feed, and duel/squad/royale/chaos modes.",
    date: "2026-06-10", creator: "Fable 5" },

  { name: "Murder at Dusk",     path: "/gms/3d/fable5_crow_tank/", screenshot: "fable5-crow-tank", type: "game",
    desc: "Low-poly evil crow shooter on a harvest-dusk farm. Drive a flak tank and blast red-eyed crows out of the sunset as they wheel, flare, and dive. Three.js with bloom, wave bosses, full touch controls.",
    date: "2026-06-10", creator: "Fable 5" },

  { name: "Murder Royale",      path: "/gms/3d/fable5_crow_tank_battle/", screenshot: "fable5-crow-tank-battle", type: "game",
    desc: "Last-tank-standing battle royale on the dusk farm against 9 AI personalities. A circling murder of crows closes the field, with live standings, neon name tags, callsign popups, and duel/skirmish/royale/frenzy modes.",
    date: "2026-06-11", creator: "Fable 5" },

  { name: "The Glade",          path: "/gms/3d/fable5_glade/", screenshot: "fable5-glade", type: "game",
    desc: "ARPG graphics test glade - a Diablo/RuneScape-style circular meadow with tap-to-move hero, villager NPC, chickens, thatched cottage, campfire, and floating pickups. Debug inspector lists every object with tri counts, colliders, and camera focus. Three.js, mobile-first.",
    date: "2026-06-12", creator: "Fable 5" },

  { name: "Glade Bros",         path: "/gms/2d/glade_bros/", screenshot: "glade-bros", type: "game",
    desc: "Two brothers, one prank: fart in the same room and bolt, then it is hide-and-seek for revenge. Pick the older or younger brother and your part - the computer plays the other. Top-down house with bubble-box taunts, a coughing head-start, and a seek-timer showdown.",
    date: "2026-06-15", creator: "Opus 4.8" },

  { name: "Glade Bros 3D",      path: "/gms/3d/glade_bros/", screenshot: "glade-bros-3d", type: "game",
    desc: "The 3D dollhouse cut of Glade Bros: one brother farts in the same room and bolts, the other coughs then hunts for revenge. Pick the older or younger brother and your part; the computer plays the other. Three.js diorama of low-poly kids, an orbit camera, tap-to-move, and bubble-box taunts. Mobile-first.",
    date: "2026-06-15", creator: "Opus 4.8" },

  { name: "Who Am I",           path: "/gms/3d/whoami/", screenshot: "whoami", type: "game",
    desc: "A tiny open-world Diablo/RuneScape-style RPG. Wake with no memory, then level Attack, Strength, Defence, Archery, Magic, Health and Fishing through XP. Survive with slow-draining food and water (auto-refill at any river or well), pick fruit, fish, chop wood with an axe, light fires with a tinderbox and cook your catch. Trade at the general store, follow a guide through intro quests, and delve a torch-lit dungeon of skeletons, spiders and zombies with randomized loot. Three.js, tap-to-move + WASD, mobile-first.",
    date: "2026-06-16", creator: "Opus 4.8" },

  { name: "Crazy Space",        path: "/gms/2d/crazyspace/", screenshot: "crazyspace", type: "game",
    desc: "Single-player Subspace-style space arena shooter. Pilot one of five inertial ships through Deathmatch, Team Battle, Capture the Flag and King of the Hill against AI opponents — energy doubles as health and ammo, grab green power-ups, and dodge bouncing bullets and bombs. Vanilla Canvas, no build step, touch joystick + keyboard, mobile-first portrait.",
    date: "2026-06-23", creator: "Opus 4.8" },

  { name: "Deadtown: Day One",  path: "/gms/3d/f5_deadtown/", screenshot: "f5_deadtown", type: "game",
    desc: "A story-driven rebuild of Deadtown around a database-backed level system. A procedural TV-news cinematic opens the outbreak (\"they're ZOMBIES—\" …static), then you wake at home with nothing: find the baseball bat in your camping gear, the fire axe at Hanson's Hardware, and the pistol — with a bag of ammo — in a wrecked police cruiser. Travel between sealed levels only through glowing exit hotspots; dialogs, searches, ambush triggers and a mission chain are all authored data. Ships with a full level editor (second port, undo/redo, named versions) and a Go+SQLite backend both apps share; plays static from a published snapshot too. Three.js, PolyPerfect art.",
    date: "2026-07-02", creator: "Fable 5" },

  { name: "Towered",            path: "/gms/3d/towered/", screenshot: "towered", type: "game",
    desc: "A medieval-fantasy 3D tower defence with 20 handcrafted levels across four realms — Meadow, Autumn, Winter and the Ashlands. The Hollow King's horde (rigged, animated zombies, skeletons, vikings, knights, ninjas and warlocks) marches winding roads toward your castle; raise and upgrade ballistas, cannons, catapults, frost spires and arcane obelisks to stop them. Cinematic story intro, boss fights every fifth level, 1–3 star ratings, early-wave gold bonuses, generative per-realm music — and a full level editor: draw roads, dress the battlefield, script waves, then test-play instantly. Custom levels appear in-game under a Custom tab, or export JSON to promote them to built-ins. Three.js, no build step, PolyPerfect art, mobile-first.",
    date: "2026-07-03", creator: "Fable 5" },

  { name: "Firstfolk",          path: "/gms/3d/firstfolk/", screenshot: "firstfolk", type: "game",
    desc: "A god-game village sim in the spirit of Populous and The Settlers. You are the unseen hand of a young island god: sculpt the land itself — raise hills, carve cliffs, flatten homesteads — while your little folk live autonomous lives, foraging, chopping, hauling real goods along real paths and building stick by stick. They work by day and pray at the campfire at dusk; their faith is your mana. Paint glowing leylines to speed their steps, rain on the corn, sprout forests, and smite the wolves and viking raiders who beach their longship at dawn. Grow through five Ages — Hearth, Field, Stone, Faith, Wonder — each unlocking new buildings, miracles and threats, then raise and consecrate the three-stage Monument to ascend. Full day/night cycle, rigged PolyPerfect villagers with real jobs, autosave, generative music. Three.js, no build step, mobile-first.",
    date: "2026-07-06", creator: "Fable 5" },

  { name: "Sunday League",      path: "/gms/2d/sundayleague/", screenshot: "sundayleague", type: "game",
    desc: "A Sensible Soccer–style arcade footy game. One thumb is a floating joystick, the other a context-sensitive KICK button — tap to pass (auto-targeting a teammate in your aim cone), hold for a charged shot, slide-tackle when defending, head airborne balls, and bend kicks with aftertouch. Your whole team autoplays until you touch the screen, then control slides seamlessly into the nearest player. Career mode: found a club, pick kit and badge, and climb four divisions from the Sunday Park League to the Crown League, then win the World Champions Cup; plus World Cup knockouts, quick matches, penalty shootouts and practice. Pitch conditions (mud, rain, ice) change the physics, with goal replays, radar, procedural crowd audio and an optional offside rule. Vanilla Canvas, no build step, mobile-first portrait.",
    date: "2026-07-08", creator: "Fable 5" },

  { name: "Hotwire",            path: "/gms/3d/hotwire/", screenshot: "hotwire", type: "game",
    desc: "A Smashy-Road-style open-town driving sandbox with a fixed isometric camera. You're Ash Vega, an ex-getaway driver back in Palm Bay to clear your cousin's debt — caught between a police detective and the Chrome Serpents gang, free to work both sides if you're smart enough not to get burned. Hop in and out of 14 chunky vehicles (jack any car, an indicator flags the nearest); most land is drivable, kicking up dust on grass and sand, buildings block but never hurt you and props smash for cash, while damaged cars smoke, then burn. Both the little on-foot character and the cars pick up unlimited-ammo weapons — no gun models, just arms-out aiming and muzzle-flash projectiles. Three modes: a complete 14-mission STORY with a dual trust/exposure system and three endings (side with the law, rule the Serpents, or play both and vanish), replayable MISSIONS for medals, and endless MOST WANTED where a 0–5★ wanted level escalates from cruisers to roadblocks, SWAT and a searchlight helicopter. Buy and upgrade cars at signposted lots, follow a live minimap to accepted jobs, and a settings cog swaps joystick/button sides, fire-button position and more. Ships with a full level editor: paint terrain, place every object, car and weapon, and drop hotspots that give missions, open shops, or portal to other maps — author whole new chapters and test-play instantly. Three.js, no build step, PolyPerfect art, mobile-first.",
    date: "2026-07-09", creator: "Fable 5" },

  { name: "Hexpire",            path: "/gms/3d/hexpire/", screenshot: "hexpire", type: "game",
    desc: "A turn-based hex-empire strategy game on a 3D isometric board. Name your empire, then claim land the medieval way: your castle and towers project territory, shared claims turn grey and contested with each rival's colour marking the border, villages pay coin to whoever holds their hex, and every four hexes you fully control mint another coin. Upgrade the home base through five levels, raise wood, stone and mortar towers that auto-fire arrows every turn, and muster armies level 1–10 that march, merge into bigger hosts and lay siege — damage is attack minus defence, with tower auras shielding everything near them. Lose your last base and the empire falls; land that gets split off raises a free level-1 base to govern the colony. An 8-chapter story (guided tutorial through a four-warband finale) faces AI personalities — expansionist, warlord, economist, turtle, balanced — plus random-map skirmish (classic shapes, jagged coasts, connected islands, drowned mazes) and a full level editor that paints land and places bases, towers, villages and starting armies, with JSON export/import and instant test-play. Autosaves every turn. Three.js, no build step, procedural low-poly art, mobile-first portrait.",
    date: "2026-07-09", creator: "Fable 5" },

  { name: "Prism Break",        path: "/gms/3d/prismbreak/", screenshot: "prismbreak", type: "game",
    desc: "A flashy Bejeweled-style match-3 where every jewel is real 3D — see-through faceted glass or heavy banded metal, both matching by colour on a bloom-lit board. The signature move is the CRUSH: drop a metal gem onto a glass one sitting on another metal and the glass shatters flat for huge bonus points, charging the FORGE meter for a free 3×3 hammer smash. Four in a row makes a line blaster, an L or T a starburst, six a supernova, five a rainbow Prism Orb — and swapping specials together fires massive combos, up to two orbs wiping the whole board under a shower of debris, shockwaves and screen-filling PRISMATIC! text. Modes: a 60-level Journey with move limits, star ratings and boss vaults; 90-second Blitz with cascade time bonuses; endless Zen with shard milestones; a seeded Weekly Challenge (same board for everyone all week) with claimable reward tiers; and calendar-driven events — Gold Rush, Shatterstorm and Prism Frenzy rotate every weekend, Twilight Zen each Wednesday. Daily login streaks feed a monthly chest (20 claims = the exclusive Royal Gold theme), shards buy boosters and four other board themes, and every reward can be doubled by 'watching' a gleefully fake 5-second ad for products like Molten Cola and gem-fed salmon. Procedural Web Audio with the classic rising cascade arpeggio. Three.js, no build step, mobile-first.",
    date: "2026-07-11", creator: "Fable 5" },

  { name: "Runedale",           path: "/gms/3d/runedale/", screenshot: "runedale", type: "game",
    desc: "A mobile-first pocket RuneScape \u2014 the classic skilling loop across three small towns. Ten skills on the REAL RuneScape XP table (level 99 = 13,034,431 xp): chop trees and burn the logs, mine copper, tin and iron, smelt bronze at the furnace (iron bars crumble, of course), hammer out swords, axes and pickaxes at the anvil, net shrimp and rod trout from the river, and cook the catch \u2014 burning less as you level. A Tutorial-Island-style guided intro in the hamlet of Bramblewick: Elder Wick walks you through every craft step by step under a glowing beacon, hands you each tool as you need it, then sends you north across the shallow ford \u2014 the river's only crossing \u2014 to Ashford, the main town with its pillared bank, general store, smithy, cow pasture and windmill, and on to the fishing village of Milbrook, Stonefell Mine, and a goblin camp that fights back. 28-slot pack, one shared bank vault with \u00d71/\u00d75/All quantities, a run-energy orb, tap-to-move with walk-then-act on anything you tap, melee combat using RS-shaped accuracy and max-hit maths plus the authentic combat-level formula, bones from every beast, floating XP drops and level-up fanfares, and post-tutorial achievements. Three.js, no build step, PolyPerfect art shipped as one obfuscated pack, autosave.",
    date: "2026-07-12", creator: "Fable 5" },


  { name: "Longshot",           path: "/gms/3d/longshot/", screenshot: "longshot", type: "game",
    desc: "A 3D city sniper game with real external ballistics. You're Wren, a contract marksman working off a debt to a fixer called Halcyon, one Meridian City rooftop at a time — until the names on the contracts start pointing back at the people handing them out. Two views: look around wide with the rifle in frame, or scope in through a mil-dot reticle at 4×–28× on a live zoom slider. The round genuinely drops and the crosswind genuinely bends it, so you read the range, hold over, hold into the wind, hold your breath to still the sway — then breathe out and squeeze. Kills and long headshots trigger a follow-bullet camera that rides the round through the city in slow motion. The world MOVES while the bullet is in the air, so walkers, runners and a speeding sedan's front tyre all have to be led. Targets are somewhere out there in the city — on a plaza, strolling a street, on a park bench, on a rooftop, or lit up in a corner office behind glass that shatters and deflects your round (unless you bring armour-piercing). One loud shot panics the crowd and your mark bolts for the city limits; guarded contracts fill an EXPOSURE bar with every unsuppressed shot until they find you. A 21-mission story across four acts: range day, first blood, two brothers on a 25-second window, identify the right suit among decoys from the intel, stop a convoy and drop the courier who bails, protect an informant crossing a plaza from four killers, an eight-second window man, an armoured director, a gusting rainstorm, a counter-sniper duel where you hunt his lens glint before his third shot lands — and finally Aurelius Vane at 650 metres. Plus seeded daily marks with streaks, a weekly five-target gauntlet, and THE NEST: endless escalating contracts until three marks slip away. Spend the money on seven rifles (from an honest bolt gun to an integrally suppressed ghost and a rail prototype), four scopes (rangefinder, wind meter, predicted-impact smart dot, night vision), armour-piercing and subsonic ammo, and gear — a steady sling, apnea training, a ghillie wrap, a spotter drone. Three.js, no build step, procedural city and audio, PolyPerfect art, mobile-first.",
    date: "2026-07-12", creator: "Fable 5" },

  { name: "Grumpy Bugs",        path: "/gms/3d/grumpybugs/", screenshot: "grumpybugs", type: "game",
    desc: "Grudge Bugs with the graphics torn out and rebuilt — same feuding insect mobs, same crumbling ridges, same lethal drop, but every prop redrawn. The Acorn RPG is now a nut with a scaly cupule cap, a riveted steel collar, three swept fins and a lit motor; the Berry Bomb is a wet glossy berry wearing a taped-on detonator with a burning fuse and the pin still in it; the Rotten Berry is furred with mould over four bulges straining to become four separate problems; the Dung Ball trails straw and two extremely committed flies; and THE SHOE is a real extruded footprint with a tread, a worn heel patch, a Y-strap and one deeply unlucky stone. The bugs got chitin — a semi-metal finish that catches the light along every curve — segmented gasters, wasp waists, split beetle elytra, hairy spider abdomens, serrated mantis forearms, and eyes with actual highlights. Underneath it all sits a single light rig: ACES tone mapping, a warm key, a cool sky bounce and a hard back rim that separates a bug from the dirt it's standing on. Three.js, no build step, everything still procedural.",
    date: "2026-07-28", creator: "Opus 5" },

  { name: "Grudge Bugs",        path: "/gms/3d/grudgebugs/", screenshot: "grudgebugs", type: "game",
    desc: "Worms in 3D, fought by feuding insect mobs on narrow cliff-edge ridges of dirt and grass. Four factions with one procedural googly-eyed model each — The Picnic Mob (mobster ants in fedoras), Dung & Sons Ltd. (builder dung beetles in hard hats), House Silk (gothic spiders in top hats) and Sting Corp. (middle-management wasps in ties) — take turns pacing the crumbling ridge, judging the wind and lobbing acorn RPGs, bouncing berry bombs, rolling dung balls and spit, slapping each other into the void, or calling down THE SHOE (the Human's flip-flop) and a Bee-52 carpet-bombing run. Every explosion blows a crater out of the ground, and knockback is lethal — the pond, sink, jam or BBQ coals below are always waiting. The camera is the star: it swoops to each bug at turn start, rides every projectile in slow motion with an orbital drift, pulls out for the impact beat, chases screaming bugs all the way down to the splash, and epic moments earn an instant replay from a random angle — worm's eye, drone cam, victim cam, side dolly or ledge security cam. Every turn opens facing your nearest enemy, and a target button hops the camera between foes so nobody hides. The bugs never stop talking (speech bubbles + squeaky procedural gibberish voices): ants make you offers you can't refuse, beetles cite health and safety violations, spiders recite doom poetry, wasps schedule your destruction ('per my last sting—'), and everyone screams something memorable on the way down. A 10-chapter story — THE LAST SANDWICH — opens with an in-engine cutscene of the picnic fumble that started the war and ends against a giant zen mantis on the sandwich itself; plus quick grudges vs 1-3 AI factions on four arenas (garden fence, midnight kitchen, picnic blanket, BBQ at dusk), sudden-death rising jam, a cosmetic hat shop, daily streak chests, and three AI heat levels from Mild Salsa to Nuclear. Three.js, no build step, fully procedural art and audio, mobile-first.",
    date: "2026-07-15", creator: "Fable 5" },

  { name: "MC Addons",          path: "/mcaddons/", screenshot: "mcaddons", type: "app",
    desc: "Minecraft Bedrock addon downloads. A dark, pixel-styled page serving .mcaddon files straight into Minecraft — starting with the Trolling Addon: Speed Minecarts that stack more speed on every powered rail, Skin Mocker statues that copy whoever places them, Stalkers that shadow the nearest other player from exactly 30 blocks and teleport only when no one's watching, Hunters that lurk on a random fuse then snap and chase, Pure Sky camo blocks that vanish into the ceiling, an unbreakable God Pickaxe and a Chunk Miner that pours a whole chunk away like falling sand. Every item shown with its crafting recipe in an interactive crafting grid; file list pulls live from the repo. Full pack source + pixel-art generator included.",
    date: "2026-07-15", creator: "Fable 5" },

  { name: "Addon Studio",       path: "/mcaddons/studio/", screenshot: "mcstudio", type: "app",
    desc: "An all-in-one Minecraft Bedrock add-on editor that replaces every app the usual guides tell you to install — Blockbench, VS Code, Paint.NET, a JSON validator, a zip tool and the game itself. Answer a few plain questions to make a mob, item, food, weapon or block and it writes the real, current-format JSON; paint the textures with UV guides that show exactly which square is the front of the head; build the 3D shape out of boxes with auto-UV packing; animate it with a keyframe timeline or one-tap Walk/Attack/Dance presets; then play with it in a first-person voxel world that loads your actual pack files, simulates the real behaviour components and shows Minecraft-style content-log errors. Every mistake is explained in words a child can act on. Exports a genuine .mcaddon. Built for a kid to use alone — every popup, hint and sound has its own off switch.",
    date: "2026-07-28", creator: "Opus 5" },

  { name: "Deadtown",           path: "/gms/3d/deadtown/", screenshot: "deadtown", type: "game",
    desc: "A mobile-first 3D zombie shooter with a Diablo/RuneScape camera. Wake in your bedroom to a TV hissing a broken emergency broadcast, then take to the streets of an apocalyptic town. Hold and drag anywhere to move; a laser sights straight out of your weapon and auto-locks the nearest zombie, then auto-fires — scavenge a fire axe, pistols, shotgun, SMG, rifle and machine gun plus ammo and medkits dropped by the horde. Duck into buildings (the camera pulls in close, roofless, so nothing blocks your view), watch the minimap, and survive the endless spawn. Three.js, no build step, PolyPerfect art.",
    date: "2026-06-27", creator: "Opus 4.8" },

  { name: "UUID Worlds",        path: "/gms/3d/uuidworlds/", screenshot: "uuidworlds", type: "game",
    desc: "An infinite deterministic travel sim where every world is fully described by a 32-character base-62 UUID — the code IS the world, and 62^32 ≈ 2.27×10⁵⁷ of them exist. You wake at a PC in a small room; the terminal shows the next world's UUID and a famous AI figure as the logged-in user. Tap CONNECT and the code decompiles before your eyes — sky, weather, terrain, architecture — then a seeded cinematic flythrough sweeps you over the city it describes: drone sweeps, low chases, spiral descents past the tallest tower, lakes, billboards and landmarks (rotating ferris wheels, lighthouses, wind farms, a colossus holding a glowing orb). Tap anywhere to break free — one finger looks, two fingers fly — tap a car to just drive it, then hit the glowing Resume to rejoin the tour at 1/2/3× speed. Every tour ends by descending to a glowing doorway into the same room, reseeded: new posters of moiré and phyllotaxis math-art, a new book on the desk, a framed quote that also hangs on exactly one billboard out in the world, a window painting the sky you just flew. Hero effects are genome traits — auroras, glyph rain, orbital rings, eclipses, meteor storms — and secrets hide in plain sight: tap the code once to copy it, twice for a 'how big is 62³²?' fact, three times for the world you're standing in. Same UUID = same world, forever, on any device. Vanilla JS + Three.js, no build step, seeded Web Audio ambience.",
    date: "2026-07-18", creator: "Fable 5" },

  { name: "Racketeer",          path: "/gms/2d/racketeer/", screenshot: "racketeer", type: "game",
    desc: "A silly tennis game built for thumbs: you run automatically — just SWIPE. Swipe direction aims, swipe length goes deep or drops short, bend your swipe to banana-curve the ball, and the shrinking ring is your timing (heckled players find the ring starts lying to them). Fight dirty with a 13-skill deck of one-tap upgradeable tricks: competition-grade Grunts, Heckling, Umpire Arguments, backflip Outrageous Shots, Underarm Serves, Fake Injuries, Racket Smashing, bullet-time Zone, and Clive the attack pigeon — and opponents play every trick back at you. A 100-level wacky STORY mode (car park → cursed racket → tennis cruise → underground fight club → Antarctic Open → the Moon, one silly sentence per level, chapter bosses, sentient ball machine finale) sits alongside a ranked ladder from #1,000,000, three knockout cups, quick matches, and a date-seeded Daily Challenge with match-long modifiers. Random events invade matches: dog on court, bee swarms, power cuts, slightly square balls. Crowd hype multiplies your money. Pseudo-3D canvas, procedural characters and synth audio, no build step.",
    date: "2026-07-19", creator: "Fable 5" },

  { name: "Ironhail",           path: "/gms/3d/opus5_ironhail/", screenshot: "opus5-ironhail", type: "game",
    desc: "Drone-spotted 3D tank warfare with real ballistics and ground you can dig apart. Every shell is a body under gravity and crosswind: the gun solves the elevation for wherever you put the reticle, so a flat AP round snaps out at 132 m/s while a siege mortar climbs to eighty degrees and drops straight down behind a wall — and the ground it lands on is genuinely excavated, a heightfield that craters, scorches and reshapes what you can drive over and see across. Your drone is why you usually see them first: it orbits your hull painting contacts, or you fly it forward yourself as a scouting camera while your tank sits still and exposed, and enemy crews shoot it out of the sky. Weapons never take turns, they reload on a timer — the whole fight is the dance between a 2.25-second breech and a turret that traverses at a real rate, so firing mid-swing is a miss, not a blocked trigger. Rear armour takes half again as much damage, oblique AP hits ricochet off, and hits can strip your tracks or seize your turret ring. Nearly everything on the field is destructible: trees topple or get thrown across the map, fuel drums cook off and chain, silos collapse, concrete walls come down and take the cover with them. A 20-mission story across four acts — desert dust line, harvest country, the frozen north, the foundry that builds the enemy's armour — with elimination, demolition, zone holds, escorts, drone recon and three boss hulls, plus procedural Tank Attack contracts and a daily. RPG garage: four chassis, seven guns (AP, autocannon, howitzer, mortar, rocket pod, railgun, cluster), six utilities (smoke, repair, nitro ram, EMP, mines, called-in drone strike), eight upgrade tracks and camo, all shown on a live turntable. Six biomes × seven times of day × weather — dawn mist, high noon, golden hour, moonlit snow, ash-fall, thunderstorms with real lightning. World ladder starts you at #150,000 out of 2.8 million and battle points move you up or down every fight. Three.js, no build step, procedural everything, mobile-first.",
    date: "2026-07-26", creator: "Opus 5" },

  { name: "Foul Play",          path: "/gms/3d/foulplay/", screenshot: "foulplay", type: "game",
    desc: "A televised racing series where hitting people is legal and getting caught is not. Contact is racing — you can lean on anyone, anywhere, all day, and nobody will say a word. What the rulebook does not cover is the equipment in your boot, and the entire game is the distance you use it from: a side slam thrown while you are touching paint reads as a racing incident and costs you almost nothing, while the same move from across the circuit reads as exactly what it is. The attack button tells you which one it will be before you press it, and it changes colour as the gap opens. Broadcast cameras sweep — each one covers its corner only part of the time, a red ON AIR light warns you when a lens is live, and learning a circuit's camera rhythm is the real skill. Fill the stewards' meter and they open an investigation; fill the crowd's meter instead and ninety thousand people talk them out of the fine, because spectacular driving is not a score bonus here, it is legal defence. Fifteen circuits from a hometown oval to a floodlit scrapyard with a forty-foot vertical loop welded across the middle, plus banked speedbowls, a corkscrew, mountain roads with the barriers removed from one side, and jumps that put you twenty metres in the air. Cars are built from separable panels and come apart the whole way round: bonnets, roofs, doors, spoilers and whole wheels tear off and tumble down the road while the car keeps going, drivers pop up in speech bubbles to complain about it, and a car that actually leaves the circuit rolls and rips itself to pieces before the recovery truck rejoins it. Hit the guardrail square and you bounce back in; hit it sideways, or a moment after somebody has shunted you, and you go over the top. A panel that runs out of hit points does not leave cleanly — it tears loose at one corner and hangs there for a few seconds, banging on the bodywork, dragging on the tarmac and occasionally clouting whoever is alongside, before it finally goes. Nitro is cut off for whoever is leading, so building a gap costs you the tool that would keep it and the reliable way to win is to stay in the pack and take people apart. Fifteen dirty tricks from a bull bar to a pit hook, oil slicks, caltrops, an EMP, a mag hook and a chained wrecking ball, plus six upgrade slots and eight chassis from a plain white saloon to a two-tonne panel van built for ramming. Almost everything is buyable and almost everything is expensive; two parts in every slot are not for sale at any price, one only falling out of a crate and the best having to be won outright. Everything you own takes four marks that start cheap and get ruinous. You start with one circuit and open the rest through the season, through the workshop you build, or by buying the licence. Wreck somebody and they remember it: a driver you have put out turns up on later grids, angrier, with better equipment, already looking for you. A hundred-level season across ten chapters with in-engine cutscenes, a producer who wants ratings, a chief adjudicator who cannot prove a thing, and a four-time champion who has never once been fined. Ranked quick races that start you at #250,000 of 3.1 million, three single-elimination title brackets, thirteen commissions including a knockout, a blackout run with every camera off air and a baron who only holds his derby on Saturdays, a daily, a bookmaker who will take a stake on your own result, and a highlights reel that drops into slow motion and orbits a car while it comes apart — with a KEEP button, because some of them you want again. Three.js, no build step, procedural everything, mobile-first: one thumb steers, and of the three tricks in your boot only the first waits for your thumb — the other two pick their own moment, whether or not a camera is live.",
    date: "2026-07-26", creator: "Opus 5" },

  { name: "Breachpoint",        path: "/gms/3d/breachpoint/", screenshot: "breachpoint", type: "game",
    desc: "A three-minute breach of an abandoned warehouse district, with ten hostiles holding the yard and four weapons to take it back with. Four guns built entirely out of boxes and cylinders and modelled at real scale — a carbine with a red dot you genuinely see through, a pump shotgun that racks between shells, a sidearm whose slide cycles on every round, and a bolt-action with a 15° scope, mil-dot ladder and a bolt throw you have to sit through. Every one of them aims down its own sights: the ADS pose is derived from where that weapon's sight line actually sits, so the dot, the bead, the iron notch and the crosshair all land exactly where the bullet goes. Hold shift while scoped to hold your breath and the sway settles to almost nothing for three seconds. Shots are hitscan against real head, torso and leg boxes with a 2× headshot multiplier and damage that falls off with range, brass ejects from the right port and bounces where it lands, and the muzzle flash throws a light onto whatever you are standing next to. The ten of them patrol the yard on a real navigation grid, spot you on line of sight with a human reaction delay, call it in to whoever is nearby, then break for cover behind the containers and peek out of it — and only the closest few ever shoot at once, so a ten-man yard reads instead of shredding you. Kill one and they fold at the hips and drop the rifle, which falls and settles on its own. The district is a shipping yard: a long container corridor for close work, a two-storey building with a ramp to a parapet that overlooks the whole map, a burnt-out vehicle in the open middle, barrel stacks and crate clusters cutting the sightlines, chain-link and fog on the horizon. You can get on top of almost all of it — jump, double jump, and mantle over any lip you can reach. Mobile-first with three fingers: one thumb moves and pushes further to sprint, the other holds off-centre and keeps turning for as long as you hold it, and a third finger anywhere fires — held down, even on the bolt gun. Optional auto-look eases your aim onto whoever you are closest to facing and scopes in for you, unless you are sprinting, in which case running wins. Procedural everything — textures, gunshots, footsteps, the industrial hum, the heartbeat under twenty health — with bloom, vignette and colour grading done by hand because there are no post-processing add-ons on the page. One HTML file, three.js from a CDN, no build step.",
    date: "2026-07-28", creator: "Opus 5" },

  { name: "Voidcast",           path: "/gms/3d/voidcast/",   screenshot: "voidcast",     type: "game",
    desc: "You are Unit 7, a clearance worker for an alien guild that strip-mines whole planets, and your rig projects a micro-black-hole onto the surface. It starts the size of a bin lid and can only take litter; eat enough litter and it widens until it can take crates, then cars, then houses, then towers, then the landmark the world is named after. The twist is that the aperture is master-controlled and its power is allocated by audience, so how big you are allowed to get depends on how entertaining you are being. Mass is only half of it — hype multiplies your effective size, and hype comes from chaining swallows, taking something enormous in one bite, brushing past a tower you cannot quite fit yet, and running down the traffic that is trying to get away from you. Go quiet for four seconds and the crowd drains and the hole narrows with it, while the chat tells you, by name, that it is bored. A 50-contract story across five acts takes you from a training moon of scrap to the Guild's own core, told in six 3D cutscenes, and it slowly stops being a game about eating rubbish. There is a one-off Open Contract that starts you at rank 10,000,000,000 on the galactic ladder and lets you climb it, a limited-time contract that rotates every three days on a schedule every device shares, permanent SUBS upgrades on the home screen, and a roguelite draft of sponsor perks mid-run that die when the broadcast ends. Rival streamers clear the same planet against you and will take a bite out of you if they get 20% bigger; planetary turrets shoot your audience loose until you are big enough to swallow the turrets. Every object, texture and sound is generated in code — around 50 kinds of procedural low-poly prop merged into vertex-coloured instanced geometry, so a sector holding 1,300 objects still draws in about 200 calls on a phone. Drag anywhere to steer. Mobile-first, three.js, no build step, nothing fetched.",
    date: "2026-07-28", creator: "Opus 5" },

  { name: "Monopole",           path: "/gms/3d/monopole/",  screenshot: "monopole",     type: "game", wip: true,
    desc: "You run Ferrous Line: two haulers, a mining rig, forty thousand credits and sixty thousand of debt, in a system where Corvain Drayage already moves 71% of the freight. Mine ore off Kestrel Belt, refine it to halide at Ledger Station, then gamble your last cash on a coil line so you can sell it on as filament — the consumable every drive coil in the Reach burns through. Time runs in weeks you can pause and fast-forward, ships fly the routes you assign between ticks, and every quarter tells you how much of the Reach you actually hold. The point is what you do once you have leverage. A tactic tree runs from the plainly legal through the grey and into the outright illegal — exclusive supply deals that leave your rival selling the off-brand, vertical integration, price guarantees that cost nothing once you own the category, buying a competitor's brand outright, pricing below cost to starve them, and secretly agreeing on a specification so a product fails when you decide it should. Each one unlocks the real case behind it — Bunnings and Ryobi, Ford's River Rouge, the FTC's case against Meta, Boral in the High Court, and the Phoebus Cartel, who met in Geneva in 1924 and agreed to cap the life of a light bulb at a thousand hours. Every story is sourced, says plainly where the law actually landed, and refuses to flatten a contested case into a tick or a cross. Live 3D you orbit and pinch with every decision on 2D bottom sheets over it — never a blocking modal. Three.js, no build step, mobile-first. Version 0.1: playable end to end, art still being pushed toward the EVE and Homeworld bar.",
    date: "2026-08-04", creator: "Opus 5" },

  { name: "Waterline",          path: "/gms/3d/waterline/", screenshot: "waterline",   type: "game", wip: true,
    desc: "Battleship played from the bridge of your own ship. The board is a lit plotting table in a red-lit wheelhouse with the sea running past the windows — you tap the chart to lay a firing solution, and the camera flies out through the glass to follow the shell down, with a caption admitting up front that the positions you're watching are dramatised. A miss throws a splash column; a hit burns. When the enemy fires back you see it from your own deck, the impact landing exactly where they called it. Three ordnance types — a single shell, a 2×2 heavy that straddles an intersection, and a nine-cell salvo — so the interesting decision is when to spend the wide shots rather than where to poke next. Classic 10×10 with the standard five-ship fleet, or a custom game where you set the grid and the fleet within what actually fits, plus a tournament ladder with named opponents whose AI genuinely improves as you climb: the top tier normalises hit density by anchor multiplicity, scores footprints by expected distinct ships touched, holds ordnance while a hit run is open, and remembers how you place your fleet between games. Auto-place with one tap or lay the ships out yourself. Matches survive a reload — back out mid-battle and the title offers to carry on. The sim is pure and event-sourced with fog of war enforced in the rules rather than promised by the renderer, so what you cannot see was never sent to your screen. Three.js, no build step, mobile-first, offline. Phase 1: playable end to end, visuals still being pushed toward the naval-sim bar.",
    date: "2026-08-07", creator: "Opus 5" },

  { name: "Sunderfall",         path: "/gms/2d/sunderfall/game/", screenshot: "sunderfall", type: "game", wip: true,
    desc: "A painterly 2D roguelite platformer where destruction is the mechanic, not the decoration. You are Rook, the spare son of a village blacksmith, handed a dying elder's magic because there was nobody else in the room — and the wood you have to walk into remembers everything you do to it. Fire needs fuel and spreads through it, so a bolt into a timber fence runs the length of the fence and then goes out where the wood ran out; acid flows downhill and eats what it is sitting on; every structure is solved for real support, so knocking a buttress out from under an arch brings the arch, the wall course above it and the second arch down in a cascade rather than a single frame. Ground is a destructible heightfield that craters and chars. It opens on a 76-second hand-animated cinematic — the elder losing a fight you arrive too late for, the seal that costs him everything, and the walk out to find what is left. Eighteen spells across six schools sit on cast circles that unlock as you level: circle one is yours to aim, the rest fire themselves off a focus pool, so the build decides what happens around you while you decide where to stand. Nine enemy types and a boss. Mobile-first: hold anywhere on the left to move, tap the right to jump, and the spells aim themselves at whatever is nearest unless you drag to override. Vanilla JS on a custom WebGL2 renderer — 11,000 sprites, 10,000 particles and 49 lights in 15 draw calls — with painted Flux-generated parallax and every character and effect drawn procedurally in code so a spell going off next to Rook actually lights him. No build step. In active playtesting: the world, the sim and the intro are in, the run structure is still being tuned.",
    date: "2026-08-09", creator: "Opus 5" },

  { name: "NEONHAUL",           path: "/gms/3d/neonhaul/",  screenshot: "neonhaul",    type: "game",
    desc: "A relaxed cyberpunk courier game: fly a hover-craft through an endless rain-lit city, take parcel jobs off the board, and land on rooftop and cantilevered pads to get paid. No combat, no police chases, no fail state — the only pressure is the delivery clock and the charge left in your cell. Two-thumb touch controls with a real cockpit: a lit instrument panel, a holographic minimap and a docking terminal where the client talks to you on a looping portrait. The city is seeded and infinite around a hand-authored core of landmark towers, streaming in as you fly, with per-building neon colour, baked signage from 3.2 m blades to 150 m billboards, wet roads, traffic lanes and weather. Money buys upgrades — a bigger hold, a bigger cell, more thrust, better efficiency — or a whole new hull. Three.js, no build step, mobile-first portrait or landscape, with a low-detail preset for weaker phones.",
    date: "2026-08-18", creator: "Opus 5" },

  // ── HIDDEN: PolyPerfect asset tools (commercial pack — art ships obfuscated;
  //    shown only via the secret reveal on the Projects page) ──
  { name: "Asset Gallery",      path: "/app/3d/gallery/", screenshot: "gallery", type: "app", hidden: true,
    desc: "Browsable, searchable, taggable index of all 3,156 PolyPerfect Low Poly Ultimate Pack models, rendered live in Three.js with a shared palette atlas. Filter by category/world/tag and orbit any model. The art ships as one obfuscated pack, never as raw files.",
    date: "2026-06-17", creator: "Opus 4.8" },

  { name: "Asset Fly-through",  path: "/app/3d/gallery/scene.html", screenshot: "flythrough", type: "app", hidden: true,
    desc: "Free-fly through the PolyPerfect demo worlds — City, Wild West, Castle, Japan, Sci-Fi and more — rebuilt from the Unity demo scenes in Three.js. WASD + mouse over thousands of placed low-poly models sharing one atlas material.",
    date: "2026-06-17", creator: "Opus 4.8" },

  // ══════════════════════════════════════════
  //  NON-PROJECT DIRECTORIES (tracked, not displayed)
  // ══════════════════════════════════════════

  { name: "AI Resources",       path: "/ai/",                type: "other",  note: "AI knowledge base and asset zips" },
  { name: "Shared Assets",      path: "/assets/",            type: "other",  note: "Shared assets including screenshots and home video" },
  { name: "Game Assets",        path: "/gms/assets/",        type: "other",  note: "Game-specific shared assets" },
  { name: "Y-R-U Mirror",       path: "/Y-R-U/",            type: "other",  note: "Repository mirror / branch checkout" },
  { name: "K-Hydro PWA",        path: "/app/pwa/khydro/",   type: "other",  note: "PWA version of K-Hydro Track (main entry at /k/)" },
  { name: "Bounce Merge 2D",    path: "/gms/failed/merge1/", type: "other",  note: "Earlier 2D version of Bounce Merge (superseded by 3D version)" },
  { name: "i2 backup",          path: "/i2.html",           type: "other",  note: "Older version of the main index.html" },
  { name: ".github",            path: "/.github/",          type: "other",  note: "GitHub workflows and CI configuration" },
  { name: ".claude",            path: "/.claude/",          type: "other",  note: "Claude Code configuration" },
];
