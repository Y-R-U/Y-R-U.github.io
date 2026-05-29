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
    desc: "Puzzle game with a hand-drawn paper theme. Draw pencil lines to guide ants to goals with reflection physics and ink management.",
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
