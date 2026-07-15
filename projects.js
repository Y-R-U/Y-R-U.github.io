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
    desc: "Full-featured Sudoku PWA with three difficulties, note-taking, undo, and offline play.",
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

  { name: "Grudge Bugs",        path: "/gms/3d/grudgebugs/", screenshot: "grudgebugs", type: "game",
    desc: "Worms in 3D, fought by feuding insect mobs on narrow cliff-edge ridges of dirt and grass. Four factions with one procedural googly-eyed model each — The Picnic Mob (mobster ants in fedoras), Dung & Sons Ltd. (builder dung beetles in hard hats), House Silk (gothic spiders in top hats) and Sting Corp. (middle-management wasps in ties) — take turns pacing the crumbling ridge, judging the wind and lobbing acorn RPGs, bouncing berry bombs, rolling dung balls and spit, slapping each other into the void, or calling down THE SHOE (the Human's flip-flop) and a Bee-52 carpet-bombing run. Every explosion blows a crater out of the ground, and knockback is lethal — the pond, sink, jam or BBQ coals below are always waiting. The camera is the star: it swoops to each bug at turn start, rides every projectile in slow motion with an orbital drift, pulls out for the impact beat, chases screaming bugs all the way down to the splash, and epic moments earn an instant replay from a random angle — worm's eye, drone cam, victim cam, side dolly or ledge security cam. Every turn opens facing your nearest enemy, and a target button hops the camera between foes so nobody hides. The bugs never stop talking (speech bubbles + squeaky procedural gibberish voices): ants make you offers you can't refuse, beetles cite health and safety violations, spiders recite doom poetry, wasps schedule your destruction ('per my last sting—'), and everyone screams something memorable on the way down. A 10-chapter story — THE LAST SANDWICH — opens with an in-engine cutscene of the picnic fumble that started the war and ends against a giant zen mantis on the sandwich itself; plus quick grudges vs 1-3 AI factions on four arenas (garden fence, midnight kitchen, picnic blanket, BBQ at dusk), sudden-death rising jam, a cosmetic hat shop, daily streak chests, and three AI heat levels from Mild Salsa to Nuclear. Three.js, no build step, fully procedural art and audio, mobile-first.",
    date: "2026-07-15", creator: "Fable 5" },

  { name: "Deadtown",           path: "/gms/3d/deadtown/", screenshot: "deadtown", type: "game",
    desc: "A mobile-first 3D zombie shooter with a Diablo/RuneScape camera. Wake in your bedroom to a TV hissing a broken emergency broadcast, then take to the streets of an apocalyptic town. Hold and drag anywhere to move; a laser sights straight out of your weapon and auto-locks the nearest zombie, then auto-fires — scavenge a fire axe, pistols, shotgun, SMG, rifle and machine gun plus ammo and medkits dropped by the horde. Duck into buildings (the camera pulls in close, roofless, so nothing blocks your view), watch the minimap, and survive the endless spawn. Three.js, no build step, PolyPerfect art.",
    date: "2026-06-27", creator: "Opus 4.8" },

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
