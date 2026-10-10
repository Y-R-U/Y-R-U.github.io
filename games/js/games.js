// The games.br8t.com line-up. Curated — this is deliberately NOT /projects.js,
// which lists everything ever built. Only the ones good enough to headline.
//
// To bring a game across:
//   1. flip `soon` to false (or drop the field)
//   2. add its path to GAMES in ../deploy.sh so the files actually ship
//   3. wire its save to /lib/auth/ — see lib/auth/localsync.js
//
// `path` is absolute and identical on GitHub Pages and games.br8t.com, so the
// same markup works on both origins.
//
// Deliberately NOT here yet: Prism Break, Towered and Hotwire want more play
// testing and tweaking before they headline the hub. Voidcast is untested.
// SYNTHWILD is a family project for one of Aaron's sons (like the Garfield
// game) and too close to Minecraft to headline; it stays reachable by URL only.

export const GAMES = [
  {
    id: "clued", name: "Clued", tag: "Trivia for curious minds",
    path: "/gms/2d/clued/", shot: "clued", accent: "#7b61ff",
    short: "Picture, map and music quizzes, solo or with friends.",
    blurb: "26 quiz games across 70 topics: picture reveals, maps, music clips, Movie Moments and more. Pub quiz, daily challenge, kids mode, a Learn tab, and online rooms friends join by link.",
  },
  {
    id: "silt", name: "SILT", tag: "Sand, lit not drawn",
    path: "/gms/2d/silt/", shot: "silt", accent: "#e0a24a",
    short: "Pour sand, span the board, watch it turn to light.",
    blurb: "Drop sand, watch it flow, span the board with one colour and it dissolves into drifting light. Six modes, five biomes, ninety-six chemistry puzzles.",
  },
  {
    id: "racketeer", name: "Racketeer", tag: "Tennis, but dirty",
    path: "/gms/2d/racketeer/", shot: "racketeer", accent: "#3ecf6d",
    short: "Swipe-to-play tennis with curve, heckles and a pigeon.",
    blurb: "You run automatically — just swipe. Curve the ball, heckle the umpire, and unleash Clive the attack pigeon across a 100-level story.",
  },
  {
    id: "ironhail", name: "Ironhail", tag: "Drone-spotted tank warfare",
    path: "/gms/3d/opus5_ironhail/", shot: "opus5-ironhail", accent: "#d8823c",
    short: "Spot with a drone, range it, drop the shell.",
    blurb: "Real firing solutions over a diggable battlefield: spot with the drone, range the target, drop a shell on it. Thirty missions across five acts.",
  },
  {
    id: "hexpire", name: "Hexpire", tag: "Turn-based empire",
    path: "/gms/3d/hexpire/", shot: "hexpire", accent: "#f0a52c",
    short: "Grow a hex empire and starve out three rivals.",
    blurb: "Grow a kingdom one hex at a time. Muster armies, hold the chokepoints, and starve the other three out.",
  },
  {
    id: "grudgebugs", name: "Grudge Bugs", tag: "Artillery with antennae",
    path: "/gms/3d/grudgebugs/", shot: "grudgebugs", accent: "#8fd14f",
    short: "Worms-style artillery with insect armies.",
    blurb: "Worms with insect factions, fought along narrow crumbling ledges. Every shot is replayed from the shell's point of view.",
  },
  {
    id: "sundayleague", name: "Sunday League", tag: "Pub football",
    path: "/gms/2d/sundayleague/", shot: "sundayleague", accent: "#7ee081",
    short: "Muddy retro football with proper curve.",
    blurb: "Sensible Soccer with mud on its boots. One-touch shooting, proper curve, and offside off by default.",
  },
  {
    id: "paperant", name: "Paper Ant", tag: "Pencil-line puzzler",
    path: "/gms/2d/paperant/", shot: "paperant", accent: "#e8d36a",
    short: "Draw the ant's path through 100 pencil puzzles.",
    blurb: "Draw the ant's path in pencil across a hundred levels of magnets, freezes and ink.",
  },
  {
    id: "sudoku", name: "Sudoku", tag: "Graded, not guessed",
    path: "/gms/pwa/sudoku/", shot: "sudoku", accent: "#4a90e2",
    short: "Six levels, graded by the logic each one needs.",
    blurb: "Six difficulties set by what solving actually demands, not by how many cells are blank. Pencil marks, hints and a board that waits for you.",
  },
  {
    id: "snakeeee", name: "Snake-eee", tag: "Grow, hunt, dominate",
    path: "/gms/pwa/snake/", shot: "snake-io", accent: "#4CAF50",
    short: "Arena snake: grow to 10,000 and outwit the bots.",
    blurb: "An arena of snakes with a 10,000 finish line. Steer with a thumb or the arrow keys, spend your winnings on a very long upgrade ladder, and watch the bots get cleverer as you do.",
  },
  {
    id: "crazyspace", name: "Crazy Space", tag: "Neon dogfights",
    path: "/gms/2d/crazyspace/", shot: "crazyspace", accent: "#39c0ed",
    short: "Subspace-style neon dogfights against smart bots.",
    blurb: "Subspace in your browser. Five ships, four modes, energy that is both your health and your ammo, and bots that play the objective.",
  },
  {
    id: "murderroyale", name: "Murder Royale", tag: "Last tank standing",
    path: "/gms/3d/fable5_crow_tank_battle/", shot: "fable5-crow-tank-battle", accent: "#c2603a",
    short: "Tank battle royale on a farm at dusk.",
    blurb: "A dusk farm, six AI personalities and a circling murder of crows closing the field. Duel, skirmish, royale or frenzy.",
  },
  {
    id: "outpace", name: "Outpace", tag: "Run the gauntlet",
    path: "/gms/3d/outpace/", shot: "outpace", accent: "#6ea8ff",
    short: "Haul cargo through asteroids to pay off your ship.",
    blurb: "Haul cargo through asteroid fields to pay off a ship you cannot afford. Dock, bank the credits, and take the next route out.",
  },
  {
    id: "heirframe", name: "HEIRFRAME", tag: "A robot family saga",
    path: "/gms/3d/heirframe/", shot: "heirframe", accent: "#e8c45a",
    short: "Robot-frame RPG in a sunlit chrome megacity.",
    blurb: "Start on a rented robot frame in a sunlit chrome megacity, take shady contracts for loot, own three frames that fight differently, and uncover what your family really built.",
  },
];
